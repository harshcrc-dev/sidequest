import { createHash } from "node:crypto";

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  setHeader(key: string, value: string): void;
  status(code: number): ApiResponse;
  json(data: unknown): void;
  end(): void;
}

const MAX_BODY_BYTES = 64_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const rateBuckets = new Map<string, { count: number; resetsAt: number }>();

function configuredOrigins(): Set<string> {
  const configured = (process.env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const deployment = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (deployment) configured.push(`https://${deployment}`);
  if (process.env.NODE_ENV !== "production") {
    configured.push("http://localhost:5173", "http://localhost:4173");
  }
  return new Set(configured);
}

export function secureHeaders(res: ApiResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function allowCors(req: ApiRequest, res: ApiResponse): boolean {
  secureHeaders(res);
  const rawOrigin = req.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (origin && !configuredOrigins().has(origin)) {
    res.status(403).json({ error: "Origin is not allowed." });
    return false;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}

export function validateJsonRequest(req: ApiRequest, res: ApiResponse): boolean {
  const rawType = req.headers["content-type"];
  const contentType = Array.isArray(rawType) ? rawType[0] : rawType;
  if (!contentType?.toLowerCase().includes("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json." });
    return false;
  }
  const size = Buffer.byteLength(
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
    "utf8",
  );
  if (size > MAX_BODY_BYTES) {
    res.status(413).json({ error: "Request is too large." });
    return false;
  }
  return true;
}

async function distributedRateLimit(key: string, limit: number): Promise<boolean | null> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/consume_api_quota`, {
      method: "POST",
      signal: AbortSignal.timeout(3_000),
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_key_hash: createHash("sha256").update(key).digest("hex"),
        p_limit: limit,
        p_window_seconds: RATE_WINDOW_MS / 1_000,
      }),
    });
    if (!response.ok) return null;
    return (await response.json()) === true;
  } catch {
    return null;
  }
}

export async function enforceRateLimit(
  req: ApiRequest,
  res: ApiResponse,
  bucket: string,
  limit: number,
): Promise<boolean> {
  const forwarded = req.headers["x-forwarded-for"];
  const source = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  const key = `${bucket}:${source || "unknown"}`;
  const distributed = await distributedRateLimit(key, limit);
  if (distributed === false) {
    res.setHeader("Retry-After", String(RATE_WINDOW_MS / 1_000));
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return false;
  }
  if (distributed === true) return true;

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
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return false;
  }
  if (rateBuckets.size > 5_000) {
    for (const [storedKey, stored] of rateBuckets) {
      if (stored.resetsAt <= now) rateBuckets.delete(storedKey);
    }
  }
  return true;
}

export function validMessages(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return false;
  return value.every(
    (message) =>
      message &&
      typeof message === "object" &&
      "role" in message &&
      ["system", "user", "assistant"].includes(String(message.role)) &&
      "content" in message &&
      typeof message.content === "string" &&
      message.content.length > 0 &&
      message.content.length <= 12_000,
  );
}