import { supabase } from "../lib/supabase";
import type { Location } from "../types/location";
import type { PlannerMode, TripIntent } from "../types";
import type { AIStop } from "../lib/planner";
import { currencyForCountryCode } from "../lib/format";

// ---------------------------------------------------------------------------
// AI client. The browser NEVER talks to OpenAI directly. Every request goes to
// the Sidequest API (local Express server in dev, Vercel serverless in prod),
// which holds the secret key. The base URL is resolved so that:
//   - empty / same-origin  -> "/api/..."            (Vercel production)
//   - http://localhost:8787 -> that host + "/api/..." (local dev server)
//   - "/api"                -> normalised to same-origin
// ---------------------------------------------------------------------------

function resolveBase(): string {
  let base = ((import.meta.env.VITE_AI_BACKEND_URL as string | undefined) ?? "").trim();
  base = base.replace(/\/+$/, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

const BASE = resolveBase();
const HEALTH_URL = `${BASE}/api/health`;
const CHAT_URL = `${BASE}/api/ai`;
const GENERATE_URL = `${BASE}/api/ai/generate`;

export const aiLabel = "ChatGPT";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestOptions {
  webSearch?: boolean;
  format?: "json" | "plan";
}

// Models sometimes wrap JSON in prose or code fences; pull out the object.
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function isAIAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const timeout = AbortSignal.timeout(4_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await fetch(HEALTH_URL, { signal: combined });
    if (!res.ok) return false;
    const status = await res.json();
    return status?.ok === true && status?.aiReady === true;
  } catch {
    return false;
  }
}

async function chat(
  messages: ChatMessage[],
  options: RequestOptions = {},
  signal?: AbortSignal,
): Promise<string | null> {
  const timeout = AbortSignal.timeout(25_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(CHAT_URL, {
    method: "POST",
    signal: combined,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ messages, ...options }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data?.content === "string" ? data.content : null;
}

async function chatJSON<T>(
  messages: ChatMessage[],
  options: RequestOptions = {},
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const content = await chat(messages, options, signal);
    if (!content) return null;
    return JSON.parse(extractJSON(content)) as T;
  } catch {
    return null;
  }
}

// --- Structured Sidequest generation (POST /api/ai/generate) ---------------

export interface GenerateRequest {
  location: Pick<Location, "city" | "country" | "latitude" | "longitude">;
  userRequest?: string;
  mode: PlannerMode;
  currency: string;
  duration: number;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  budget: string;
  travelStyle: string;
  transport: string;
  interests: string[];
  events?: LiveEvent[];
  constraints?: string[];
}

export interface LiveEvent {
  name: string;
  start: string;
  time: string;
  venue: string;
  url: string;
  image: string;
}

async function discoverEvents(location: Location, signal?: AbortSignal): Promise<LiveEvent[]> {
  try {
    const params = new URLSearchParams({ lat: String(location.latitude), lng: String(location.longitude) });
    const response = await fetch(`${BASE}/api/events?${params}`, { signal });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

export interface PlanActivity {
  time: string;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  estimatedCost: number;
  latitude: number;
  longitude: number;
}

export interface PlanDay {
  day: number;
  title: string;
  activities: PlanActivity[];
}

export interface SidequestPlan {
  title: string;
  summary: string;
  location: { city: string; country: string };
  days: PlanDay[];
  estimatedBudget: number;
  tips: string[];
}

export async function generateSidequest(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<SidequestPlan | null> {
  try {
    const timeout = AbortSignal.timeout(45_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await fetch(GENERATE_URL, {
      method: "POST",
      signal: combined,
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(request),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const plan = (data?.plan ?? data) as SidequestPlan;
    return plan?.days?.length ? plan : null;
  } catch {
    return null;
  }
}

// Flatten a structured plan into the app's AIStop shape (with real coords).
export function planToStops(plan: SidequestPlan): AIStop[] {
  return plan.days.flatMap((day) =>
    day.activities.map((a) => ({
      day: day.day,
      title: a.name,
      place: a.name,
      area: "",
      type: a.category,
      description: a.description,
      estimatedCost: a.estimatedCost,
      durationMinutes: a.durationMinutes,
      time: a.time,
      latitude: a.latitude,
      longitude: a.longitude,
    })),
  );
}

// --- Intent parsing --------------------------------------------------------

type IntentDraft = Partial<
  Pick<
    TripIntent,
    | "mode"
    | "origin"
    | "destination"
    | "durationHours"
    | "durationDays"
    | "budget"
    | "party"
    | "interests"
    | "pace"
    | "transport"
    | "novelty"
    | "maxDriveMinutes"
  >
>;

const INTENT_SYSTEM = `You are the intent parser for Sidequest, a global free-time and travel planner.
Read the user's request and return ONLY JSON matching this shape:
{
  "mode": "city" | "nearby" | "long_trip" | "surprise",
  "origin": string,
  "destination": string | null,
  "durationHours": number | null,
  "durationDays": number | null,
  "budget": number | null,
  "party": "solo" | "couple" | "friends" | "family" | "group",
  "interests": string[],
  "pace": "slow" | "balanced" | "packed",
  "transport": "walk" | "public_transport" | "car" | "bike" | "mixed",
  "novelty": "familiar" | "balanced" | "unexpected",
  "maxDriveMinutes": number | null
}
Rules: never invent facts. Leave anything unknown null. "origin" is the city the user names, anywhere in the world.
"city" = explore where they already are. "nearby" = a day escape. "long_trip" = multi day.
interests are lowercase single words like food, coffee, nature, culture, nightlife, adventure, romantic, shopping, relax.`;

export async function parseIntentAI(input: string, signal?: AbortSignal): Promise<IntentDraft | null> {
  return chatJSON<IntentDraft>(
    [
      { role: "system", content: INTENT_SYSTEM },
      { role: "user", content: input },
    ],
    {},
    signal,
  );
}

// --- Legacy plan generation (kept for the day-plan flow) -------------------
// Bridges the existing UI to the structured endpoint: it asks the server to
// generate a plan for the intent's location, then maps it into stops the app
// already knows how to render onto the map and timeline.

export interface GeneratedPlan {
  headline?: string;
  summary?: string;
  whyItFits?: string[];
  tradeoff?: string;
  estimatedBudget?: number;
  destination?: { city: string; country: string };
  stops: AIStop[];
}

export async function generatePlanAI(
  intent: TripIntent,
  userRequest: string,
  signal?: AbortSignal,
): Promise<GeneratedPlan | null> {
  if (!intent.location) return null;
  const wantsEvents = /\bevent|concert|gig|show|comedy|exhibition|performance\b/i.test(userRequest);
  const events = wantsEvents ? await discoverEvents(intent.location, signal) : [];
  const plan = await generateSidequest(
    {
      location: {
        city: intent.location.city,
        country: intent.location.country,
        latitude: intent.location.latitude,
        longitude: intent.location.longitude,
      },
      userRequest,
      mode: intent.mode,
      currency: currencyForCountryCode(intent.location.countryCode),
      duration: intent.durationDays ?? (intent.mode === "long_trip" ? 3 : 1),
      durationHours: intent.durationHours,
      startTime: intent.startTime,
      endTime: intent.endTime,
      budget: intent.budget ? String(intent.budget) : "moderate",
      travelStyle:
        intent.mode === "nearby"
          ? "day_escape"
          : intent.mode === "long_trip"
            ? "multi_day_trip"
            : intent.novelty === "unexpected"
              ? "adventure"
              : "balanced",
      transport: intent.transport,
      interests: intent.interests,
      events,
      constraints:
        intent.mode === "nearby"
          ? ["Include a realistic outbound route, return route, and enough time at the destination."]
          : intent.mode === "long_trip"
            ? [
                intent.durationDays === 1
                  ? "Plan a one-day destination getaway with realistic outward and return travel."
                  : "Plan consecutive days, include arrival, accommodation area guidance, and return logistics.",
              ]
            : [],
    },
    signal,
  );
  if (!plan) return null;
  return {
    headline: plan.title,
    summary: plan.summary,
    whyItFits: plan.tips?.slice(0, 4),
    tradeoff: "",
    estimatedBudget: plan.estimatedBudget,
    destination: plan.location,
    stops: planToStops(plan),
  };
}

// --- Free-text refinement --------------------------------------------------

export type RefineIntent =
  | "cheaper"
  | "slower"
  | "more_food"
  | "more_adventure"
  | "less_driving"
  | "more_local";

export async function classifyRefineAI(
  text: string,
  signal?: AbortSignal,
): Promise<RefineIntent | null> {
  const res = await chatJSON<{ action: RefineIntent }>(
    [
      {
        role: "system",
        content: `Map the user's edit request to exactly one action from:
cheaper, slower, more_food, more_adventure, less_driving, more_local.
Return ONLY JSON: { "action": "..." }.`,
      },
      { role: "user", content: text },
    ],
    {},
    signal,
  );
  return res?.action ?? null;
}
