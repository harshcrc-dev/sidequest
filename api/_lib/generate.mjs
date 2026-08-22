// ---------------------------------------------------------------------------
// Shared Sidequest AI implementation. Used by BOTH the local dev server
// (server/index.mjs) and the Vercel serverless functions (api/*). There is only
// one AI code path. Keys are read from the environment and never returned to
// the client.
//
// Provider-agnostic: works with any OpenAI-compatible /chat/completions API.
// Pick whichever you have a (free) key for by setting ONE of:
//   OPENAI_API_KEY   -> OpenAI            (gpt-4o-mini)
//   GROQ_API_KEY     -> Groq  (free)      (llama-3.3-70b-versatile)
//   GEMINI_API_KEY   -> Google Gemini     (free)  (gemini-2.0-flash)
// Force a specific one with AI_PROVIDER=openai|groq|gemini.
// ---------------------------------------------------------------------------

const PROVIDERS = {
  openai: {
    envKey: ["OPENAI_API_KEY", "AI_API_KEY"],
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  groq: {
    envKey: ["GROQ_API_KEY"],
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  gemini: {
    envKey: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-flash-lite-latest",
  },
};

function firstEnv(names) {
  for (const n of names) {
    if (process.env[n]) return process.env[n];
  }
  return "";
}

export function config() {
  const forced = (process.env.AI_PROVIDER ?? "").toLowerCase();
  // Prefer the free providers (Gemini, then Groq). OpenAI (paid) is only used
  // when it is the only key present or is explicitly forced via AI_PROVIDER.
  const order = forced && PROVIDERS[forced] ? [forced] : ["gemini", "groq", "openai"];
  let provider = "none";
  let apiKey = "";
  let baseUrl = "";
  let model = "";
  for (const name of order) {
    const p = PROVIDERS[name];
    const key = firstEnv(p.envKey);
    if (key) {
      provider = name;
      apiKey = key;
      baseUrl = p.baseUrl;
      model = p.model;
      break;
    }
  }
  return {
    provider,
    apiKey,
    baseUrl: process.env.AI_BASE_URL ?? baseUrl,
    model: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? model,
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    ticketmasterApiKey: process.env.TICKETMASTER_API_KEY ?? "",
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
    publicEventSources: (process.env.PUBLIC_EVENT_SOURCES ?? "")
      .split(",")
      .map((source) => source.trim())
      .filter((source) => source.startsWith("https://"))
      .slice(0, 5),
  };
}

export function health() {
  const c = config();
  return {
    ok: true,
    service: "sidequest-api",
    aiReady: Boolean(c.apiKey),
  };
}

const robotsCache = new Map();
const travelContextCache = new Map();
const TRAVEL_CONTEXT_TTL_MS = 30 * 60 * 1_000;

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function publicEventFromJsonLd(event, fallbackUrl) {
  const types = Array.isArray(event?.["@type"]) ? event["@type"] : [event?.["@type"]];
  if (!types.some((type) => typeof type === "string" && /Event$/i.test(type))) return null;
  const start = String(event.startDate ?? "");
  const eventDate = new Date(start);
  if (!event.name || Number.isNaN(eventDate.getTime()) || eventDate.getTime() < Date.now() - 60_000) return null;
  const place = Array.isArray(event.location) ? event.location[0] : event.location;
  const offer = Array.isArray(event.offers) ? event.offers[0] : event.offers;
  const image = Array.isArray(event.image) ? event.image[0] : event.image;
  return {
    name: String(event.name),
    start: start.slice(0, 10),
    time: /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(start)?.[1] ?? "",
    venue: String(place?.name ?? ""),
    url: String(offer?.url ?? event.url ?? fallbackUrl),
    image: typeof image === "string" ? image : String(image?.url ?? ""),
  };
}

async function allowsPublicEventFetch(source) {
  const origin = new URL(source).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(3_000),
      headers: { "User-Agent": "SidequestEventBot/1.0 (+https://sidequest.example)" },
    });
    if (!response.ok) {
      robotsCache.set(origin, true);
      return true;
    }
    const text = await response.text();
    const path = new URL(source).pathname;
    const blocked = text
      .split(/\r?\n/)
      .some((line) => /^\s*disallow:\s*\//i.test(line) && path.startsWith(line.split(":")[1].trim()));
    const allowed = !blocked;
    robotsCache.set(origin, allowed);
    return allowed;
  } catch {
    return false;
  }
}

async function searchPublicEvents(location) {
  const sources = config().publicEventSources;
  const results = [];
  for (const source of sources) {
    if (!(await allowsPublicEventFetch(source))) continue;
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(6_000),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "SidequestEventBot/1.0 (+https://sidequest.example)",
        },
      });
      if (!response.ok) continue;
      const html = await response.text();
      const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const script of scripts) {
        try {
          const events = flattenJsonLd(JSON.parse(script[1]))
            .map((event) => publicEventFromJsonLd(event, source))
            .filter(Boolean)
            .filter((event) => !event.venue || !location.city || new RegExp(location.city, "i").test(JSON.stringify(event)));
          results.push(...events);
        } catch {
          // Ignore malformed JSON-LD from a source without failing discovery.
        }
      }
    } catch {
      // A single source failure must not block other sources or the plan.
    }
  }
  return results;
}

export async function searchEvents(location) {
  const c = config();
  if (!location) return [];
  const results = [];
  if (c.ticketmasterApiKey) try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", c.ticketmasterApiKey);
    url.searchParams.set("latlong", `${location.latitude},${location.longitude}`);
    url.searchParams.set("radius", "40");
    url.searchParams.set("unit", "km");
    url.searchParams.set("startDateTime", new Date().toISOString());
    url.searchParams.set("size", "5");
    url.searchParams.set("sort", "date,asc");
    const response = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!response.ok) return [];
    const data = await response.json();
    results.push(...(data?._embedded?.events ?? []).map((event) => ({
      name: String(event.name ?? ""),
      start: String(event.dates?.start?.localDate ?? ""),
      time: String(event.dates?.start?.localTime ?? ""),
      venue: String(event._embedded?.venues?.[0]?.name ?? ""),
      url: String(event.url ?? ""),
      image: String(event.images?.[0]?.url ?? ""),
    })).filter((event) => event.name && event.venue));
  } catch {
    // Fall through to configured public venue pages.
  }
  results.push(...await searchPublicEvents(location));
  const seen = new Set();
  return results.filter((event) => {
    const key = `${event.name}|${event.start}|${event.venue}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function cacheTravelContext(key, value) {
  travelContextCache.set(key, { value, expiresAt: Date.now() + TRAVEL_CONTEXT_TTL_MS });
  return value;
}

async function fetchWeather(location) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("current", "temperature_2m,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "2");
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      temperatureC: Number(data.current?.temperature_2m),
      weatherCode: Number(data.current?.weather_code),
      windKph: Number(data.current?.wind_speed_10m),
      todayRainChance: Number(data.daily?.precipitation_probability_max?.[0]),
      todayHighC: Number(data.daily?.temperature_2m_max?.[0]),
      todayLowC: Number(data.daily?.temperature_2m_min?.[0]),
    };
  } catch {
    return null;
  }
}

async function fetchNearbyPois(location) {
  // One small, cached query. Public Overpass instances are not for bulk crawling.
  const query = `[out:json][timeout:20];(
    nwr(around:6000,${location.latitude},${location.longitude})[tourism=museum];
    nwr(around:6000,${location.latitude},${location.longitude})[tourism=gallery];
    nwr(around:6000,${location.latitude},${location.longitude})[tourism=attraction];
    nwr(around:6000,${location.latitude},${location.longitude})[tourism=viewpoint];
    nwr(around:6000,${location.latitude},${location.longitude})[leisure=park];
    nwr(around:6000,${location.latitude},${location.longitude})[leisure=garden];
    nwr(around:6000,${location.latitude},${location.longitude})[amenity=arts_centre];
    nwr(around:6000,${location.latitude},${location.longitude})[amenity=marketplace];
    nwr(around:6000,${location.latitude},${location.longitude})[amenity=restaurant];
    nwr(around:6000,${location.latitude},${location.longitude})[amenity=cafe];
    nwr(around:6000,${location.latitude},${location.longitude})[amenity=theatre];
  );out center tags 300;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "SidequestPlanner/1.0 (+https://sidequest.example)",
      },
      body: new URLSearchParams({ data: query }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const seen = new Set();
    return (data.elements ?? [])
      .map((item) => ({
        name: String(item.tags?.name ?? ""),
        kind: String(item.tags?.tourism ?? item.tags?.leisure ?? item.tags?.amenity ?? "place"),
      }))
      .filter((poi) => poi.name && !seen.has(poi.name.toLowerCase()) && seen.add(poi.name.toLowerCase()))
      .slice(0, 300);
  } catch {
    return [];
  }
}

async function fetchGooglePlaces(location) {
  const key = config().googlePlacesApiKey;
  if (!key) return [];
  const types = ["tourist_attraction", "museum", "restaurant", "cafe", "park", "shopping_mall"];
  try {
    const results = await Promise.all(types.map(async (type) => {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.set("location", `${location.latitude},${location.longitude}`);
      url.searchParams.set("radius", "6000");
      url.searchParams.set("type", type);
      url.searchParams.set("key", key);
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.results)
        ? data.results.map((place) => ({ name: String(place.name ?? ""), kind: type }))
        : [];
    }));
    const seen = new Set();
    return results.flat().filter((place) => {
      const keyName = place.name.toLowerCase();
      return place.name && !seen.has(keyName) && seen.add(keyName);
    }).slice(0, 150);
  } catch {
    return [];
  }
}

export async function getTravelContext(location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return { weather: null, places: [] };
  }
  const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
  const cached = travelContextCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const [weather, osmPlaces, googlePlaces] = await Promise.all([
    fetchWeather(location),
    fetchNearbyPois(location),
    fetchGooglePlaces(location),
  ]);
  const seen = new Set();
  const places = [...osmPlaces, ...googlePlaces].filter((place) => {
    const name = place.name.toLowerCase();
    return !seen.has(name) && seen.add(name);
  }).slice(0, 300);
  return cacheTravelContext(key, { weather, places });
}

const UPSTREAM_TIMEOUT_MS = 30_000;

const ACTIVITY_CATEGORIES = [
  "food", "activity", "culture", "nature", "shopping", "nightlife", "transport", "rest",
];

// Call any OpenAI-compatible chat-completions endpoint. `format` only affects
// token budget; JSON is enforced via response_format + prompt, then validated.
// Retries briefly on transient 429/503 (providers' free tiers spike under load).
async function callChat(messages, { format = "json" } = {}) {
  const c = config();
  if (!c.apiKey) throw new Error("No AI provider is configured.");
  const body = JSON.stringify({
    model: c.model,
    messages: messages.map(({ role, content }) => ({ role, content })),
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: format === "plan" ? 3_000 : 800,
  });
  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
    let res;
    try {
      res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.apiKey}`,
        },
        body,
      });
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "network error";
      if (attempt < 4) continue;
      throw new Error(`AI request failed: ${lastDetail}`);
    }
    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    }
    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");
    if (res.status !== 429 && res.status !== 503) break;
  }
  throw new Error(`AI request failed (${lastStatus})${lastDetail ? `: ${lastDetail.slice(0, 200)}` : ""}`);
}

// Free-form chat proxy (intent parsing, refinement). Returns raw text.
export async function chat(messages, options = {}) {
  return callChat(messages, options);
}


export function validateGenerateInput(body) {
  if (!body || typeof body !== "object") return "Request body is required.";
  const loc = body.location;
  if (!loc || typeof loc !== "object") return "location is required.";
  if (typeof loc.city !== "string" || !loc.city.trim()) return "location.city is required.";
  if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
    return "location.latitude and location.longitude are required.";
  }
  if (body.duration !== undefined && (typeof body.duration !== "number" || body.duration < 1)) {
    return "duration must be a positive number.";
  }
  if (
    body.durationHours !== undefined &&
    (typeof body.durationHours !== "number" || body.durationHours < 1 || body.durationHours > 24)
  ) {
    return "durationHours must be between 1 and 24.";
  }
  if (body.startTime !== undefined && (typeof body.startTime !== "string" || !/^\d{2}:\d{2}$/.test(body.startTime))) {
    return "startTime must be a HH:MM clock time.";
  }
  if (body.endTime !== undefined && (typeof body.endTime !== "string" || !/^\d{2}:\d{2}$/.test(body.endTime))) {
    return "endTime must be a HH:MM clock time.";
  }
  if (typeof body.startTime === "string" && typeof body.endTime === "string" && body.endTime <= body.startTime) {
    return "endTime must be after startTime.";
  }
  if (body.interests !== undefined && !Array.isArray(body.interests)) {
    return "interests must be an array.";
  }
  if (body.events !== undefined && !Array.isArray(body.events)) {
    return "events must be an array.";
  }
  if (body.nearbyPlaces !== undefined && !Array.isArray(body.nearbyPlaces)) {
    return "nearbyPlaces must be an array.";
  }
  if (
    body.userRequest !== undefined &&
    (typeof body.userRequest !== "string" || body.userRequest.length > 4_000)
  ) {
    return "userRequest must be a string up to 4000 characters.";
  }
  return null;
}

function cleanCopy(value) {
  return String(value ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*,+/g, ",")
    .trim();
}

// Validate the model's JSON before trusting it. Never return unchecked output.
function validatePlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  if (typeof plan.title !== "string" || !Array.isArray(plan.days) || plan.days.length === 0) {
    return null;
  }
  const days = plan.days
    .map((d) => ({
      day: Number(d.day) || 1,
      title: cleanCopy(d.title),
      activities: (Array.isArray(d.activities) ? d.activities : [])
        .filter((a) => a && typeof a.name === "string")
        .map((a) => ({
          time: String(a.time ?? ""),
          name: cleanCopy(a.name),
          description: cleanCopy(a.description),
          category: ACTIVITY_CATEGORIES.includes(a.category) ? a.category : "activity",
          durationMinutes: Math.min(240, Math.max(15, Number(a.durationMinutes) || 60)),
          estimatedCost: Math.max(0, Number(a.estimatedCost) || 0),
          latitude: Number(a.latitude) || 0,
          longitude: Number(a.longitude) || 0,
        })),
    }))
    .filter((d) => d.activities.length > 0);
  if (days.length === 0) return null;
  return {
    title: cleanCopy(plan.title),
    summary: cleanCopy(plan.summary),
    location: {
      city: String(plan.location?.city ?? ""),
      country: String(plan.location?.country ?? ""),
    },
    days,
    estimatedBudget: Math.max(0, Number(plan.estimatedBudget) || 0),
    tips: Array.isArray(plan.tips) ? plan.tips.map(cleanCopy).slice(0, 8) : [],
  };
}

const SYSTEM = `You are Sidequest's global day planner. You build realistic, personalised plans for ANY city or town on earth.
The request's "userRequest" field contains the user's exact homepage message. Follow it closely and make its stated preferences, timing, budget, interests and constraints control the plan. Do not replace it with a generic itinerary.
Use the destination's real neighbourhoods, landmarks, food and culture. Never assume a specific country unless the destination implies it.
Return a geographically coherent plan: a sensible start for the actual requested window, a tight route with no filler, and a clear finish. Never schedule breakfast after 10:30 or at 17:00.
Every activity needs real-world coordinates (latitude/longitude) near the destination, a short practical description, one allowed category, a realistic duration (15 to 240 minutes) and an estimated per-person cost.
Every activity name MUST be the exact official name of a real venue, landmark, park or mapped route that can be searched on OpenStreetMap. Never invent descriptive business names such as "A Local Cafe" or "South Bank Coffee".
EVENT RULE: If the request contains a non-empty "events" list, only use events from that verified list. Include the exact event name and venue, and do not invent events when the list is empty.
LIVE CONTEXT RULE: The request can contain public weather and nearby mapped places. Use them as evidence: avoid outdoor-heavy plans in high rain probability or severe conditions, and prefer named places from nearbyPlaces when they fit. Do not invent weather, places, or events beyond the supplied context. Sparse nearbyPlaces means the destination may be a small town: make a shorter, stronger plan rather than padding it with uncertain stops.
MODE RULES (critical): The request has a "mode" field. Always honor durationDays and durationHours. For "city", create a local plan; when durationDays is greater than one, create distinct consecutive local days rather than repeating one day. For "nearby", the supplied location is the ORIGIN, not the destination. Select one specific real destination 30 to 120 km outside that origin. Set response.location to that destination, name it in the title, and include realistic outward and return travel as activities. Build the rest of the itinerary at that destination only; for multiple days, include an overnight stay and distinct days. Never return an origin-city plan or vague suggestions. For "long_trip" with durationDays=1, create a one-day destination getaway with realistic outward and return travel. For "long_trip" longer than one day, create a genuine consecutive multi-day trip: include arrival and return logistics, an accommodation-area recommendation in tips, distinct activities on every day, and respect durationHours as the user's active touring hours per day.
DATE PLAN RULE: If the request is clearly a date, romantic night, couple outing, or includes words like date, romantic, couple, sunset, evening, drinks, wine, dinner, city lights, then create an evening-focused plan with a late-afternoon start (typically 17:00-18:00), no breakfast, no midday brunch filler, and 3-5 tight, coherent activities that fit the evening window. Make the flow feel like a real date: a walk, one strong food stop, one atmosphere stop, and a natural finish.
SCHEDULE RULE: When the request contains startTime and endTime, every relevant itinerary day must start at or after startTime and finish by endTime. Never schedule activities outside that chosen clock window. If an evening date is requested and the schedule window is 17:00-23:00, do not schedule breakfast or lunch anywhere in that plan.
MONEY RULES (critical): All amounts (each activity's estimatedCost and the plan's estimatedBudget) MUST be realistic integer amounts in the currency given by the request's "currency" field (an ISO 4217 code such as INR, EUR, USD, JPY, GBP). Use typical real-world local prices for that destination and currency, and never convert to another currency. estimatedCost is the realistic per-person spend at that stop today (a full sit-down meal, the real ticket/entry price, drinks, a workshop fee, etc.), not a minimum. Do not lowball: a proper lunch or dinner at a named restaurant, a museum ticket, a guided activity or a bar round should each cost what a real visitor would actually pay. Paid services (restaurants, cafes, museums, galleries, tickets, workshops, bars, clubs, shopping, paid transport) MUST have a realistic non-zero cost; only genuinely free things (public parks, walking a street, a viewpoint, free-entry museums, window shopping) may be 0. estimatedBudget MUST equal the exact sum of every activity's estimatedCost.
TIME RULES (critical): Every activity's "time" MUST be a 24-hour "HH:MM" clock time. Times MUST run in strict chronological order through the day and never overlap: each activity starts after the previous one's start plus its durationMinutes plus realistic travel time between their coordinates. Schedule things at sensible real-world hours: breakfast around 08:00-09:30, lunch around 12:00-14:00, dinner around 19:00-21:00, nightlife after 21:00, and cultural sites during normal opening hours. For date plans, use 17:00-23:00 with walk, dinner, drinks or sunset finish rather than breakfast or midday filler.
Do not invent fake businesses, events or opening hours. Keep copy concise and do not use an em dash.

Respond with ONLY a JSON object (no markdown, no prose) with EXACTLY this shape:
{
  "title": string,
  "summary": string,
  "location": { "city": string, "country": string },
  "days": [
    {
      "day": number,
      "title": string,
      "activities": [
        {
          "time": "HH:MM",
          "name": string,
          "description": string,
          "category": "food" | "activity" | "culture" | "nature" | "shopping" | "nightlife" | "transport" | "rest",
          "durationMinutes": number,
          "estimatedCost": number,
          "latitude": number,
          "longitude": number
        }
      ]
    }
  ],
  "estimatedBudget": number,
  "tips": string[]
}
ACTIVITY COUNT RULES: Quality and feasibility matter more than quantity. Respect the request's "durationHours" and available nearbyPlaces. Use 2 to 3 activities for up to 3 hours, 3 to 4 for up to 6 hours, and 3 to 5 for a full day. For date plans, aim for 3-4 strong, close-by activities in a single tight arc, not an all-day breakfast-to-dinner spread. When nearbyPlaces is sparse or the destination is a small town, use only 2 to 4 strong stops for the day. For a "long_trip", use 2 to 4 meaningful activities per day so there is room for arrival, meals, accommodation and realistic transfers. Never add a weak, duplicate, distant or uncertain stop merely to reach a count. Latitude/longitude must be real and close to the destination.`;

function distanceKm(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lngDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function planMatchesDestination(plan, location, mode = "city") {
  const activities = plan.days.flatMap((day) => day.activities);
  if (activities.length === 0) return false;
  const nearby = activities.filter(
    (activity) =>
      Number.isFinite(activity.latitude) &&
      Number.isFinite(activity.longitude) &&
      distanceKm(location, activity) <= 120,
  );
  if (nearby.length / activities.length < 0.8) return false;
  if (mode !== "nearby") return true;

  // A nearby escape needs a genuine destination beyond the origin city, not a
  // city itinerary relabelled as a day trip. One verified destination stop at
  // least 25 km away is sufficient; travel-origin stops may stay near home.
  return activities.some(
    (activity) =>
      Number.isFinite(activity.latitude) &&
      Number.isFinite(activity.longitude) &&
      distanceKm(location, activity) >= 25 &&
      distanceKm(location, activity) <= 120,
  );
}

function clockMinutes(value) {
  const match = typeof value === "string" && value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function planMatchesSchedule(plan, startTime, endTime) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  if (start === null || end === null || end <= start) return true;
  return plan.days.every((day) => {
    const activities = day.activities;
    const first = activities[0];
    const last = activities[activities.length - 1];
    const firstStart = clockMinutes(first?.time);
    const lastStart = clockMinutes(last?.time);
    if (firstStart === null || lastStart === null) return false;
    const lastEnd = lastStart + last.durationMinutes;
    return firstStart >= start && lastEnd <= end;
  });
}

function planMatchesActivityQuality(plan, userRequest = "") {
  const isDate = /\b(date|romantic|couple|evening|night out)\b/i.test(userRequest);
  return plan.days.every((day) => {
    let previousStart = -1;
    return day.activities.every((activity) => {
      const start = clockMinutes(activity.time);
      if (start === null || start <= previousStart) return false;
      previousStart = start;
      const text = `${activity.name} ${activity.description}`.toLowerCase();
      if (/breakfast|brunch/.test(text) && start > 10 * 60 + 30) return false;
      if (/\blunch\b/.test(text) && (start < 11 * 60 || start > 15 * 60)) return false;
      if (isDate && /breakfast|brunch|\blunch\b/.test(text)) return false;
      return true;
    });
  });
}

function planMatchesRequestedDuration(plan, durationDays, durationHours) {
  const requestedDays = Math.max(1, Number(durationDays) || 1);
  if (plan.days.length < requestedDays) return false;
  const dayNumbers = new Set(plan.days.map((day) => day.day));
  for (let day = 1; day <= requestedDays; day += 1) {
    if (!dayNumbers.has(day)) return false;
  }
  if (requestedDays === 1) return plan.days[0].activities.length >= 2;
  const minimumPerDay = durationHours !== null && durationHours <= 3 ? 1 : 2;
  return plan.days
    .filter((day) => day.day <= requestedDays)
    .every((day) => day.activities.length >= minimumPerDay);
}

const geocodeCache = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

async function readPersistentGeocode(cacheKey) {
  const c = config();
  if (!c.supabaseUrl || !c.supabaseServiceKey) return null;
  try {
    const url = new URL(`${c.supabaseUrl}/rest/v1/geocode_cache`);
    url.searchParams.set("cache_key", `eq.${cacheKey}`);
    url.searchParams.set("select", "latitude,longitude");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
      headers: {
        apikey: c.supabaseServiceKey,
        Authorization: `Bearer ${c.supabaseServiceKey}`,
      },
    });
    if (!response.ok) return null;
    const [row] = await response.json();
    return row && Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
      ? { latitude: row.latitude, longitude: row.longitude }
      : null;
  } catch {
    return null;
  }
}

async function writePersistentGeocode(cacheKey, name, location, point) {
  const c = config();
  if (!c.supabaseUrl || !c.supabaseServiceKey) return;
  try {
    const url = new URL(`${c.supabaseUrl}/rest/v1/geocode_cache`);
    url.searchParams.set("on_conflict", "cache_key");
    await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(3_000),
      headers: {
        apikey: c.supabaseServiceKey,
        Authorization: `Bearer ${c.supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        place_name: name,
        city: location.city,
        country: location.country ?? null,
        latitude: point.latitude,
        longitude: point.longitude,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // A cache miss must not fail a valid plan.
  }
}

function normalizePlaceName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isRelevantGeocode(activityName, resultName) {
  const activity = normalizePlaceName(activityName);
  const result = normalizePlaceName(resultName);
  if (!activity || !result) return false;
  if (activity === result) return true;
  return result.length >= 4 && (activity.includes(result) || result.includes(activity));
}

async function geocodePlace(name, location) {
  const key = normalizePlaceName(`${name}|${location.city}|${location.country ?? ""}`);
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const persisted = await readPersistentGeocode(key);
  if (persisted) {
    geocodeCache.set(key, persisted);
    return persisted;
  }

  const lookup = geocodeQueue.then(async () => {
    const wait = Math.max(0, 1_000 - (Date.now() - lastGeocodeAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${name}, ${location.city}, ${location.country ?? ""}`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "3");
    url.searchParams.set("accept-language", "en");
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Sidequest/1.0 venue-coordinate-verification",
        },
      });
      lastGeocodeAt = Date.now();
      if (!response.ok) return null;
      const results = await response.json();
      const match = results.find((result) => {
        const point = { latitude: Number(result.lat), longitude: Number(result.lon) };
        return (
          isRelevantGeocode(name, result.name) &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          distanceKm(location, point) <= 120
        );
      });
      return match
        ? { latitude: Number(match.lat), longitude: Number(match.lon) }
        : null;
    } catch {
      lastGeocodeAt = Date.now();
      return null;
    }
  });
  geocodeQueue = lookup.then(() => undefined, () => undefined);
  const result = await lookup;
  if (result) {
    geocodeCache.set(key, result);
    await writePersistentGeocode(key, name, location, result);
  }
  return result;
}

async function geocodePlan(plan, location) {
  for (const day of plan.days) {
    const verifiedActivities = [];
    for (const activity of day.activities) {
      const verified = await geocodePlace(activity.name, location);
      if (verified) {
        activity.latitude = verified.latitude;
        activity.longitude = verified.longitude;
        verifiedActivities.push(activity);
      } else if (
        Number.isFinite(activity.latitude) &&
        Number.isFinite(activity.longitude) &&
        distanceKm(location, activity) <= 120
      ) {
        // Smaller towns often have sparse venue coverage in Nominatim. Keep
        // the model's destination-grounded coordinate instead of deleting a
        // valid stop just because its name is not indexed.
        verifiedActivities.push(activity);
      }
    }
    day.activities = verifiedActivities;
  }
  plan.days = plan.days.filter((day) => day.activities.length > 0);
  plan.estimatedBudget = plan.days.reduce(
    (total, day) =>
      total + day.activities.reduce((dayTotal, activity) => dayTotal + activity.estimatedCost, 0),
    0,
  );
  return plan;
}

// Generate a structured, validated Sidequest plan for a global destination.
export async function generateSidequestPlan(body) {
  const travelContext = await getTravelContext(body.location);
  const context = {
    location: body.location,
    userRequest: typeof body.userRequest === "string" ? body.userRequest.trim() : "",
    mode: ["city", "nearby", "long_trip", "surprise"].includes(body.mode) ? body.mode : "city",
    currency: body.currency || "USD",
    durationDays: body.duration ?? 1,
    durationHours: Number.isFinite(body.durationHours) ? body.durationHours : null,
    startTime: typeof body.startTime === "string" ? body.startTime : null,
    endTime: typeof body.endTime === "string" ? body.endTime : null,
    budget: body.budget ?? "moderate",
    travelStyle: body.travelStyle ?? "balanced",
    transport: body.transport ?? "mixed",
    interests: Array.isArray(body.interests) ? body.interests : [],
    events: Array.isArray(body.events) ? body.events.slice(0, 5) : [],
    weather: travelContext.weather,
    nearbyPlaces: travelContext.places,
    constraints: Array.isArray(body.constraints) ? body.constraints : [],
  };
  const destination = `${body.location.city}, ${body.location.country ?? ""}`.trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    const instruction =
      `NON-NEGOTIABLE DESTINATION: ${destination} at ` +
      `${body.location.latitude}, ${body.location.longitude}. ` +
      "Every activity must be a real place in or very near this destination. " +
      `MAPPED PLACE AVAILABILITY: ${context.nearbyPlaces.length} nearby places were found. ` +
      (context.nearbyPlaces.length < 6
        ? "Treat this as sparse coverage and return a compact plan with no filler stops. "
        : "Use only the mapped places that genuinely improve the plan. ") +
      (attempt > 0 ? "The previous response used the wrong city; correct that now. " : "") +
      `REQUEST: ${JSON.stringify(context)}`;
    const raw = await callChat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: instruction },
      ],
      { format: "plan" },
    );
    if (!raw) continue;
    try {
      const plan = validatePlan(JSON.parse(raw));
      if (
        plan &&
        planMatchesDestination(plan, body.location, context.mode) &&
        planMatchesSchedule(plan, context.startTime, context.endTime) &&
        planMatchesActivityQuality(plan, context.userRequest) &&
        planMatchesRequestedDuration(plan, context.durationDays, context.durationHours)
      ) {
        const geocoded = await geocodePlan(plan, body.location);
        const verifiedCount = geocoded.days.reduce(
          (count, day) => count + day.activities.length,
          0,
        );
        const minimumVerified = context.durationDays > 1 ? 2 : 2;
        if (
          verifiedCount >= minimumVerified &&
          planMatchesRequestedDuration(geocoded, context.durationDays, context.durationHours)
        ) return geocoded;
      }
    } catch {
      // Retry once for malformed JSON or a plan in the wrong city.
    }
  }
  return null;
}

// --- Supabase logging (service role, server-side only) ---------------------
// Verifies the caller's user from their bearer token, then records the
// generation. Best-effort: logging must never block a successful response.

async function verifyUser(token) {
  const c = config();
  if (!c.supabaseUrl || !token) return null;
  try {
    const res = await fetch(`${c.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: c.supabaseServiceKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

export async function logGeneration({ token, requestType, input, output, status, errorMessage, latencyMs }) {
  const c = config();
  if (!c.supabaseUrl || !c.supabaseServiceKey) return;
  try {
    const userId = await verifyUser(token);
    await fetch(`${c.supabaseUrl}/rest/v1/ai_generations`, {
      method: "POST",
      headers: {
        apikey: c.supabaseServiceKey,
        Authorization: `Bearer ${c.supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        provider: c.provider,
        model: c.model,
        request_type: requestType,
        input: input ?? {},
        output: output ?? {},
        status: status ?? "completed",
        error_message: errorMessage ?? null,
        latency_ms: latencyMs ?? null,
      }),
    });
  } catch {
    // Swallow logging errors; the user's request already succeeded.
  }
}

export function bearerFromHeader(headerValue) {
  if (typeof headerValue !== "string") return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
