import { bearerFromHeader, chat, config as aiConfig, logGeneration } from "../_lib/generate.mjs";
import {
  allowCors,
  enforceRateLimit,
  validMessages,
  validateJsonRequest,
  type ApiRequest as Req,
  type ApiResponse as Res,
} from "../_lib/http.js";

export const config = { maxDuration: 30 };

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function readBody(req: Req): Record<string, unknown> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (!allowCors(req, res)) return;

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!validateJsonRequest(req, res)) return;
  if (!(await enforceRateLimit(req, res, "chat", 30))) return;
  if (!aiConfig().apiKey) {
    res.status(503).json({ error: "AI provider is not configured." });
    return;
  }

  const body = readBody(req);
  const messages = body.messages;
  if (!validMessages(messages)) {
    res.status(400).json({ error: "messages must contain 1 to 12 valid text messages." });
    return;
  }

  const headerAuth = req.headers.authorization;
  const token = bearerFromHeader(Array.isArray(headerAuth) ? headerAuth[0] : headerAuth);
  const startedAt = Date.now();
  try {
    const text = await chat(messages as ChatMessage[], { webSearch: body.webSearch === true });
    void logGeneration({
      token,
      requestType: "chat",
      input: { messages },
      output: { text },
      status: "completed",
      latencyMs: Date.now() - startedAt,
    });
    res.status(200).json({ content: text });
  } catch {
    void logGeneration({
      token,
      requestType: "chat",
      input: { messages },
      status: "error",
      errorMessage: "upstream_failure",
      latencyMs: Date.now() - startedAt,
    });
    res.status(502).json({ error: "AI request failed. Please try again." });
  }
}
