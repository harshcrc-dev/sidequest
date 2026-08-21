// ---------------------------------------------------------------------------
// Backwards-compatible re-export. All AI logic now lives in services/ai.ts,
// which talks only to the Sidequest API (never to OpenAI directly from the
// browser). This shim keeps existing imports (`../lib/ai`) working.
// ---------------------------------------------------------------------------

export {
  aiLabel,
  isAIAvailable,
  parseIntentAI,
  generatePlanAI,
  generateSidequest,
  classifyRefineAI,
} from "../services/ai";

export type {
  GeneratedPlan,
  GenerateRequest,
  SidequestPlan,
  PlanDay,
  PlanActivity,
  RefineIntent,
} from "../services/ai";
