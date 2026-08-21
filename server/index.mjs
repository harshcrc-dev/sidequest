// ---------------------------------------------------------------------------
// Sidequest local dev API.
//
// A tiny, zero-dependency Node server that keeps the AI key OFF the browser.
// The React app posts here; this server adds the secret key and forwards to
// the AI provider, then returns only the model's result. The SAME AI logic
// (api/_lib/generate.mjs) powers the Vercel serverless functions in production,
// so there is a single implementation.
//
//   1. Copy server/.env.example to server/.env
//   2. Put ONE free key in it: GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY
//   3. Run:  npm run server      (starts on http://localhost:8787)
//   4. In the app's root .env set: VITE_AI_BACKEND_URL=http://localhost:8787
//
// Requires Node 18+ (built-in fetch). No npm install needed.
// ---------------------------------------------------------------------------

import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  bearerFromHeader,
  chat,
  config,
  generateSidequestPlan,
  health,
  logGeneration,
  validateGenerateInput,
  searchEvents,
} from "../api/_lib/generate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (so no dotenv dependency is needed).
function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No server/.env yet; rely on real environment variables.
  }
}
loadEnv();

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 64_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const rateBuckets = new Map();
// Comma-separated list of allowed browser origins.
const ALLOWED = (process.env.ALLOWED_ORIGIN ?? "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((s) => s.trim());

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
}

function validJsonContent(req, res) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    json(res, 415, { error: "Content-Type must be application/json." });
    return false;
  }
  return true;
}

function withinRateLimit(req, res, bucket, limit) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const source = forwarded || req.socket.remoteAddress || "unknown";
  const key = `${bucket}:${source}`;
  const now = Date.now();
  const current = rateBuckets.get(key);
  const entry = !current || current.resetsAt <= now
    ? { count: 0, resetsAt: now + RATE_WINDOW_MS }
    : current;
  entry.count += 1;
  rateBuckets.set(key, entry);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
  if (entry.count > limit) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetsAt - now) / 1_000)));
    json(res, 429, { error: "Too many requests. Please try again shortly." });
    return false;
  }
  return true;
}

function validMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return false;
  return value.every(
    (message) =>
      message &&
      ["system", "user", "assistant"].includes(message.role) &&
      typeof message.content === "string" &&
      message.content.length > 0 &&
      message.content.length <= 12_000,
  );
}

function readJsonBody(req, res) {
  return new Promise((resolve) => {
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
      json(res, 413, { error: "Request is too large." });
      resolve(null);
      return;
    }
    let raw = "";
    let tooLarge = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY_BYTES) {
        tooLarge = true;
        if (!res.writableEnded) json(res, 413, { error: "Request is too large." });
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        json(res, 400, { error: "Invalid JSON body." });
        resolve(null);
      }
    });
    req.on("error", () => {
      if (!res.writableEnded) json(res, 400, { error: "Request could not be read." });
      resolve(null);
    });
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  const origin = req.headers.origin;
  if (origin && !ALLOWED.includes(origin)) {
    return json(res, 403, { error: "Origin is not allowed." });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return json(res, 200, health());
  }

  if (req.method === "GET" && req.url?.startsWith("/api/events")) {
    if (!withinRateLimit(req, res, "events", 30)) return undefined;
    const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const latitude = Number(params.get("lat"));
    const longitude = Number(params.get("lng"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json(res, 400, { error: "lat and lng are required" });
    }
    return json(res, 200, { events: await searchEvents({ latitude, longitude }) });
  }

  const token = bearerFromHeader(req.headers.authorization);

  // Free-form chat proxy (intent parsing, refinement).
  if (req.method === "POST" && req.url === "/api/ai") {
    if (!validJsonContent(req, res) || !withinRateLimit(req, res, "chat", 30)) return undefined;
    if (!config().apiKey) return json(res, 503, { error: "AI provider is not configured." });
    const body = await readJsonBody(req, res);
    if (body === null) return undefined;
    const { messages, webSearch, format } = body;
    if (!validMessages(messages)) {
      return json(res, 400, { error: "messages must contain 1 to 12 valid text messages." });
    }
    if (webSearch !== undefined && typeof webSearch !== "boolean") {
      return json(res, 400, { error: "webSearch must be a boolean." });
    }
    if (format !== undefined && format !== "json" && format !== "plan") {
      return json(res, 400, { error: "format must be json or plan." });
    }
    const startedAt = Date.now();
    try {
      const content = await chat(messages, { webSearch, format });
      if (!content) return json(res, 502, { error: "AI provider returned no text." });
      void logGeneration({
        token,
        requestType: "chat",
        input: { messages },
        output: { content },
        status: "completed",
        latencyMs: Date.now() - startedAt,
      });
      return json(res, 200, { content });
    } catch (err) {
      console.error("[sidequest-api]", err instanceof Error ? err.message : "Unknown error");
      return json(res, 502, { error: "Upstream AI request failed. Check server logs and credentials." });
    }
  }

  // Structured Sidequest plan generation.
  if (req.method === "POST" && req.url === "/api/ai/generate") {
    if (!validJsonContent(req, res) || !withinRateLimit(req, res, "generate", 12)) return undefined;
    if (!config().apiKey) return json(res, 503, { error: "AI provider is not configured." });
    const body = await readJsonBody(req, res);
    if (body === null) return undefined;
    const invalid = validateGenerateInput(body);
    if (invalid) return json(res, 400, { error: invalid });
    const startedAt = Date.now();
    try {
      const plan = await generateSidequestPlan(body);
      if (!plan) {
        return json(res, 502, { error: "The planner returned an invalid response. Please try again." });
      }
      void logGeneration({
        token,
        requestType: "generate",
        input: body,
        output: plan,
        status: "completed",
        latencyMs: Date.now() - startedAt,
      });
      return json(res, 200, { plan });
    } catch (err) {
      console.error("[sidequest-api]", err instanceof Error ? err.message : "Unknown error");
      void logGeneration({
        token,
        requestType: "generate",
        input: body,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "unknown",
        latencyMs: Date.now() - startedAt,
      });
      return json(res, 502, { error: "Failed to generate a plan. Please try again." });
    }
  }

  json(res, 404, { error: "Not found" });
});

// Warn (do not crash) when no AI provider key is present, naming the accepted
// variables explicitly without ever printing their values.
const cfg = config();
if (!cfg.apiKey) {
  console.warn(
    "Warning: no AI provider key found. Set ONE of GEMINI_API_KEY (free), " +
      "GROQ_API_KEY (free) or OPENAI_API_KEY in server/.env. " +
      "Until then the app falls back to offline sample plans.",
  );
}

server.listen(PORT, () => {
  console.log(`Sidequest API running on http://localhost:${PORT}`);
  console.log(`AI provider: ${cfg.provider === "none" ? "none (offline fallback)" : cfg.provider}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
});
