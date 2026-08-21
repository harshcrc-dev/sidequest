import {
  bearerFromHeader,
  config as aiConfig,
  generateSidequestPlan,
  logGeneration,
  validateGenerateInput,
} from "../_lib/generate.mjs";
import {
  allowCors,
  enforceRateLimit,
  validateJsonRequest,
  type ApiRequest as Req,
  type ApiResponse as Res,
} from "../_lib/http";

export const config = { maxDuration: 60 };

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
  if (!(await enforceRateLimit(req, res, "generate", 12))) return;
  if (!aiConfig().apiKey) {
    res.status(503).json({ error: "AI provider is not configured." });
    return;
  }

  const body = readBody(req);
  const invalid = validateGenerateInput(body);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  const headerAuth = req.headers.authorization;
  const token = bearerFromHeader(Array.isArray(headerAuth) ? headerAuth[0] : headerAuth);
  const startedAt = Date.now();
  try {
    const plan = await generateSidequestPlan(body);
    if (!plan) {
      res.status(502).json({ error: "The planner returned an invalid response. Please try again." });
      return;
    }
    void logGeneration({
      token,
      requestType: "generate",
      input: body,
      output: plan,
      status: "completed",
      latencyMs: Date.now() - startedAt,
    });
    res.status(200).json({ plan });
  } catch {
    void logGeneration({
      token,
      requestType: "generate",
      input: body,
      status: "error",
      errorMessage: "upstream_failure",
      latencyMs: Date.now() - startedAt,
    });
    res.status(502).json({ error: "Failed to generate a plan. Please try again." });
  }
}
