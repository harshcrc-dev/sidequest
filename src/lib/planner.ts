import { IMG } from "./images";
import type { CatalogueLocation } from "./sidequest_catalogue";
import type {
  Destination,
  ItineraryItem,
  PartyType,
  PlannerMode,
  Recommendation,
  TripIntent,
} from "../types";

const INTEREST_KEYWORDS: Record<string, string[]> = {
  food: ["food", "eat", "eating", "dinner", "lunch", "breakfast", "foodie", "cuisine"],
  coffee: ["coffee", "café", "cafe", "brunch"],
  nature: ["nature", "park", "green", "outdoors", "hike", "hiking", "trail"],
  culture: ["culture", "gallery", "museum", "art", "heritage", "history"],
  nightlife: ["nightlife", "bar", "drinks", "party", "club", "night out"],
  adventure: ["adventure", "wild", "thrill", "unexpected", "new", "never done"],
  romantic: ["romantic", "date", "girlfriend", "boyfriend", "partner", "couple"],
  shopping: ["shopping", "market", "shop", "boutique"],
  relax: ["relax", "reset", "slow", "quiet", "chill", "calm"],
};

function detectMode(text: string): PlannerMode {
  const t = text.toLowerCase();
  if (/\b(surprise|whatever|figure it out|anything)\b/.test(t)) return "surprise";
  if (/\b(\d+)\s*(day|days|week|nights?)\b/.test(t) || /long trip|road trip|getaway|vacation/.test(t))
    return "long_trip";
  if (/\b(out of|outside|nearby|escape|drive|driving|day trip|hills|beach)\b/.test(t))
    return "nearby";
  return "city";
}

function detectParty(text: string): PartyType {
  const t = text.toLowerCase();
  if (/girlfriend|boyfriend|partner|date|couple|wife|husband/.test(t)) return "couple";
  if (/friends|gang|group|mates/.test(t)) return "friends";
  if (/family|kids|parents/.test(t)) return "family";
  if (/solo|alone|myself|by myself/.test(t)) return "solo";
  return "solo";
}

function detectBudget(text: string): number | undefined {
  const match = text.toLowerCase().match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*)\s*(k)?/);
  if (!match) return undefined;
  let amount = Number(match[1].replace(/,/g, ""));
  if (match[2] === "k") amount *= 1000;
  return amount >= 300 ? amount : undefined;
}

function detectDuration(text: string): { hours?: number; days?: number } {
  const t = text.toLowerCase();
  const days = t.match(/\b(\d+)\s*(day|days|nights?)\b/);
  const hours = t.match(/\b(\d+)\s*(hour|hours|hrs?)\b/);
  if (days) return { days: Number(days[1]), hours: hours ? Number(hours[1]) : undefined };
  if (/weekend/.test(t)) return { days: 2, hours: hours ? Number(hours[1]) : undefined };
  if (hours) return { hours: Number(hours[1]) };
  if (/saturday|sunday|full day|whole day/.test(t)) return { hours: 12 };
  if (/half day|afternoon|evening|morning/.test(t)) return { hours: 5 };
  return {};
}

function detectStartTime(text: string): string | undefined {
  const match = text.match(/\bstart(?:ing)?\s+(?:at\s+)?(\d{1,2}):(\d{2})\b/i);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function detectEndTime(text: string): string | undefined {
  const match = text.match(/\b(?:end|finish)(?:ing)?\s+(?:at\s+)?(\d{1,2}):(\d{2})\b/i);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function hoursBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const difference = toMinutes(end) - toMinutes(start);
  return difference > 0 ? Math.max(1, Math.round(difference / 60)) : undefined;
}

function detectCity(text: string): string | undefined {
  // Lightweight hint extraction only. Real, global resolution happens via the
  // geocoder in src/services/locations.ts; there is no hardcoded whitelist that
  // limits which destinations Sidequest supports.
  const patterns = [
    /\b(?:in|around|near|to|at)\s+([A-Z][a-zA-Z\u00C0-\u017F]+(?:\s+[A-Z][a-zA-Z\u00C0-\u017F]+){0,3})/,
    /\b(?:in|around|near|to|at)\s+([a-zA-Z\u00C0-\u017F]+(?:\s+[a-zA-Z\u00C0-\u017F]+){0,3})/,
    /^(?:trip(?:\s+to)?|plan(?:\s+for)?|day\s+in|weekend\s+in)\s+([A-Za-z\u00C0-\u017F]+(?:\s+[A-Za-z\u00C0-\u017F]+){0,3})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const city = match[1].trim();
      if (city && !/^(?:me|my|here|nearby|somewhere)$/i.test(city)) return city;
    }
  }

  // If the user just typed a place name on its own (for example "Lisbon" or "Tokyo"),
  // treat it as the city instead of asking for location again.
  const standalone = text
    .replace(/[^A-Za-z\u00C0-\u017F\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

  if (standalone && !/\b(?:trip|plan|day|weekend|saturday|sunday|week|today|tonight|morning|afternoon|evening|start|finish|budget|budgeted|with|for|and|or)\b/i.test(standalone)) {
    return standalone;
  }

  return undefined;
}

function detectInterests(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const [interest, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    if (keywords.some((k) => t.includes(k))) found.add(interest);
  }
  if (found.size === 0) {
    found.add("food");
    found.add("culture");
  }
  return [...found];
}

function detectPace(text: string): TripIntent["pace"] {
  const t = text.toLowerCase();
  if (/slow|relax|reset|chill|easy/.test(t)) return "slow";
  if (/packed|maximise|maximize|everything|as much/.test(t)) return "packed";
  return "balanced";
}

function detectNovelty(text: string): TripIntent["novelty"] {
  const t = text.toLowerCase();
  if (/never done|new|unexpected|surprise|haven't done|hidden|different/.test(t))
    return "unexpected";
  if (/usual|favourite|favorite|comfort|familiar/.test(t)) return "familiar";
  return "balanced";
}

function detectDrive(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d+)\s*(?:hour|hr|hrs|hours|min|mins|minutes)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /hour|hr/.test(m[0]) ? n * 60 : n;
}

export function parseIntent(input: string, forcedMode?: PlannerMode): TripIntent {
  const duration = detectDuration(input);
  const startTime = detectStartTime(input);
  const endTime = detectEndTime(input);
  return {
    mode: forcedMode ?? detectMode(input),
    origin: detectCity(input),
    durationHours: duration.hours ?? hoursBetween(startTime, endTime) ?? (duration.days ? undefined : 10),
    durationDays: duration.days,
    startTime,
    endTime,
    budget: detectBudget(input),
    currency: "INR",
    party: detectParty(input),
    interests: detectInterests(input),
    mood: detectNovelty(input) === "unexpected" ? ["curious", "open"] : ["easy"],
    pace: detectPace(input),
    transport: /drive|car/.test(input.toLowerCase())
      ? "car"
      : /walk/.test(input.toLowerCase())
        ? "walk"
        : "mixed",
    novelty: detectNovelty(input),
    maxDriveMinutes: detectDrive(input),
    raw: input.trim(),
  };
}

// --- Offline sample data (a Bangalore day) --------------------------------
// This is CLEARLY SAMPLE/DEMO content used only when the AI backend is offline
// during local development. Live, global plans come from the AI backend and are
// never limited to this dataset.

interface SeedPlace {
  title: string;
  place: string;
  type: ItineraryItem["type"];
  description: string;
  cost: number;
  minutes: number;
  interests: string[];
  slot: number;
  image: string;
  lat: number;
  lng: number;
}

const SAMPLE_PLACES: SeedPlace[] = [
  { title: "Breakfast", place: "Koshy's, St Marks Road", type: "food", description: "A slow, old-school breakfast to ease into the day.", cost: 400, minutes: 60, interests: ["food", "coffee"], slot: 1, image: IMG.breakfast, lat: 12.9736, lng: 77.6045 },
  { title: "Bakery start", place: "Glen's Bakehouse, Lavelle Road", type: "food", description: "Flaky pastries and a strong flat white to open the morning.", cost: 350, minutes: 45, interests: ["food", "coffee"], slot: 1, image: IMG.bakery, lat: 12.9711, lng: 77.5972 },
  { title: "Sunrise yoga", place: "Cubbon Park Lawns", type: "activity", description: "An open-air flow on the grass before the city wakes up.", cost: 300, minutes: 60, interests: ["nature", "relax"], slot: 1, image: IMG.park, lat: 12.9764, lng: 77.5946 },
  { title: "Neighbourhood walk", place: "Cubbon Park", type: "nature", description: "A green loop through the city's oldest lungs before it gets busy.", cost: 0, minutes: 45, interests: ["nature", "relax"], slot: 2, image: IMG.park, lat: 12.9763, lng: 77.5929 },
  { title: "Lakeside cycle", place: "Ulsoor Lake", type: "activity", description: "Rent a cycle and loop the water while the city is still quiet.", cost: 250, minutes: 60, interests: ["nature", "adventure"], slot: 2, image: IMG.cycling, lat: 12.9820, lng: 77.6205 },
  { title: "Temple stop", place: "Bull Temple, Basavanagudi", type: "culture", description: "A calm, centuries-old start with the giant granite Nandi.", cost: 0, minutes: 40, interests: ["culture", "relax"], slot: 2, image: IMG.temple, lat: 12.9421, lng: 77.5675 },
  { title: "Flower market run", place: "KR Market", type: "shopping", description: "Dawn colour and chaos at the city's wholesale flower bazaar.", cost: 150, minutes: 50, interests: ["shopping", "culture"], slot: 2, image: IMG.market, lat: 12.9611, lng: 77.5776 },
  { title: "Market wander", place: "Russell Market", type: "shopping", description: "Colour, spice and old-city energy in a covered heritage market.", cost: 200, minutes: 60, interests: ["shopping", "culture"], slot: 2, image: IMG.market, lat: 12.9985, lng: 77.6046 },
  { title: "Lunch", place: "MTR, Lalbagh Road", type: "food", description: "Legendary South Indian thali the way it's meant to be.", cost: 450, minutes: 75, interests: ["food"], slot: 3, image: IMG.lunch, lat: 12.9507, lng: 77.5848 },
  { title: "Street food crawl", place: "VV Puram Food Street", type: "food", description: "Graze your way down the city's most beloved snack lane.", cost: 350, minutes: 60, interests: ["food", "adventure"], slot: 3, image: IMG.streetfood, lat: 12.9507, lng: 77.5739 },
  { title: "Gallery stop", place: "National Gallery of Modern Art", type: "culture", description: "A calm, contemporary counterpoint to the morning's noise.", cost: 300, minutes: 90, interests: ["culture", "relax"], slot: 4, image: IMG.gallery, lat: 12.9878, lng: 77.5925 },
  { title: "Bookshop browse", place: "Blossom Book House, Church Street", type: "culture", description: "Three floors of secondhand finds to lose an hour in.", cost: 300, minutes: 50, interests: ["culture", "relax"], slot: 4, image: IMG.bookstore, lat: 12.9749, lng: 77.6069 },
  { title: "Pottery workshop", place: "Clay Station", type: "activity", description: "Hands-on and unexpected, something you probably haven't done.", cost: 800, minutes: 90, interests: ["adventure", "culture"], slot: 4, image: IMG.pottery, lat: 12.9611, lng: 77.6387 },
  { title: "Coffee tasting", place: "Third Wave, Indiranagar", type: "food", description: "Single-origin pour-over and a quiet corner to reset.", cost: 350, minutes: 45, interests: ["coffee", "relax"], slot: 4, image: IMG.coffee, lat: 12.9719, lng: 77.6412 },
  { title: "Sunset", place: "Sankey Tank", type: "nature", description: "Golden hour by the water with the locals.", cost: 0, minutes: 45, interests: ["nature", "romantic"], slot: 5, image: IMG.sunset, lat: 13.0068, lng: 77.5713 },
  { title: "Lake sundown", place: "Hebbal Lake", type: "nature", description: "Birdlife and a wide sky as the day cools off.", cost: 0, minutes: 45, interests: ["nature", "relax"], slot: 5, image: IMG.lake, lat: 13.0450, lng: 77.5910 },
  { title: "Dinner", place: "Toit, Indiranagar", type: "food", description: "Wood-fired plates and house brews to close the day.", cost: 900, minutes: 90, interests: ["food", "nightlife"], slot: 6, image: IMG.dinner, lat: 12.9784, lng: 77.6408 },
  { title: "Brewery night", place: "Arbor Brewing Company", type: "nightlife", description: "Craft pours and a buzzy room made for a group.", cost: 1000, minutes: 90, interests: ["nightlife", "food"], slot: 6, image: IMG.brewery, lat: 12.9346, lng: 77.6146 },
  { title: "Comedy night", place: "That Comedy Club, Koramangala", type: "nightlife", description: "A tight stand-up line-up to end the night laughing.", cost: 700, minutes: 90, interests: ["nightlife", "adventure"], slot: 6, image: IMG.music, lat: 12.9349, lng: 77.6205 },
  { title: "Live music", place: "The Humming Tree", type: "nightlife", description: "An intimate room with a genuinely good local line-up.", cost: 600, minutes: 90, interests: ["nightlife", "adventure"], slot: 6, image: IMG.music, lat: 12.9718, lng: 77.6395 },
  { title: "Rooftop drinks", place: "Skyye, UB City", type: "nightlife", description: "City lights and a slow last drink.", cost: 1200, minutes: 75, interests: ["nightlife", "romantic"], slot: 6, image: IMG.rooftop, lat: 12.9719, lng: 77.5967 },
];

function catalogueSeedsForCity(entry: CatalogueLocation): SeedPlace[] {
  const latitude = entry.latitude;
  const longitude = entry.longitude;
  const center: [number, number] =
    latitude !== null && longitude !== null ? [latitude, longitude] : CITY_CENTER;
  return entry.places.map((place, index) => {
    const type = place.type;
    const [lat, lng] = spreadAround(center, index + 1);
    return {
      title: type === "food" ? "Local food stop" : type === "nature" ? "Outdoor stop" : "Landmark stop",
      place: place.name,
      type: type as ItineraryItem["type"],
      description: place.description,
      cost: type === "food" ? 700 : type === "shopping" ? 300 : 0,
      minutes: type === "culture" ? 75 : 60,
      interests: type === "food" ? ["food"] : type === "nature" ? ["nature", "relax"] : ["culture"],
      slot: index + 1,
      image: place.image || IMG.placeFallback,
      lat: place.latitude ?? lat,
      lng: place.longitude ?? lng,
    };
  });
}

// Choose the seed set for the offline planner. If we resolved a real, non
// Bangalore destination we template stops for THAT city; otherwise we fall back
// to the curated Bangalore sample (used in local dev without an AI key).
function seedsFor(intent: TripIntent, catalogue?: CatalogueLocation): SeedPlace[] {
  const loc = intent.location;
  const city = (loc?.city ?? intent.origin ?? "").trim();
  if (catalogue) return catalogueSeedsForCity(catalogue);
  return city ? [] : SAMPLE_PLACES;
}


function walkOrDrive(minutes: number): ItineraryItem["routeToNext"] {
  const mode = minutes > 20 ? "drive" : "walk";
  return {
    mode,
    durationMinutes: minutes,
    distanceKm: Number((minutes * (mode === "walk" ? 0.08 : 0.4)).toFixed(1)),
  };
}

// Straight-line distance between two coordinates, in kilometres.
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Travel leg between two stops, derived from their real coordinates so the
// duration and distance match what the map actually shows.
function travelBetween(a: [number, number], b: [number, number]): ItineraryItem["routeToNext"] {
  const km = haversineKm(a, b);
  if (km < 1.1) {
    return { mode: "walk", durationMinutes: Math.max(5, Math.round(km * 13)), distanceKm: Number(km.toFixed(1)) };
  }
  return { mode: "drive", durationMinutes: Math.max(8, Math.round(km * 3 + 6)), distanceKm: Number(km.toFixed(1)) };
}

function minutesToClock(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Parse a model-authored "HH:MM" (or "H:MM") time into minutes from midnight.
function parseClock(value?: string): number | undefined {
  const m = value?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

function resolvePlanWindow(intent: TripIntent): { startHour: number; endHour: number } {
  const startMinute = parseClock(intent.startTime);
  const endMinute = parseClock(intent.endTime);
  const isDatePlan =
    intent.party === "couple" ||
    intent.interests.includes("romantic") ||
    /date|romantic|evening|night out/.test(intent.raw.toLowerCase());

  const startHour =
    startMinute !== undefined
      ? Math.floor(startMinute / 60)
      : isDatePlan
        ? 18
        : intent.durationHours && intent.durationHours <= 6
          ? 17
          : 10;

  const endHour =
    endMinute !== undefined
      ? Math.floor(endMinute / 60)
      : isDatePlan
        ? 23
        : startHour + Math.max(8, Math.round(intent.durationHours ?? 8));

  return { startHour, endHour };
}

function buildItinerary(
  places: SeedPlace[],
  startHour: number,
  budget?: number,
  times?: (string | undefined)[],
  endHour?: number,
): ItineraryItem[] {
  const items: ItineraryItem[] = [];
  const windowEnd = endHour !== undefined ? endHour * 60 : undefined;
  let cursor = startHour * 60;
  places.forEach((p, index) => {
    const wanted = parseClock(times?.[index]);
    const startAbs = wanted !== undefined && wanted >= cursor ? wanted : cursor;
    const endAbs = startAbs + p.minutes;
    if (windowEnd !== undefined && endAbs > windowEnd) return;
    const next = places[index + 1];
    const route = next ? travelBetween([p.lat, p.lng], [next.lat, next.lng]) : undefined;
    items.push({
      id: `item-${index}`,
      startTime: minutesToClock(startAbs),
      endTime: minutesToClock(endAbs),
      type: p.type,
      title: p.title,
      place: p.place,
      description: p.description,
      image: p.image,
      lat: p.lat,
      lng: p.lng,
      estimatedCost: p.cost,
      durationMinutes: p.minutes,
      status: "open",
      routeToNext: route,
    });
    cursor = endAbs + (route?.durationMinutes ?? 0);
  });
  if (budget) {
    const total = items.reduce((s, i) => s + i.estimatedCost, 0);
    if (total > budget) {
      const idx = items
        .map((i, n) => ({ i, n }))
        .filter(({ i }) => i.type === "nightlife" || i.type === "activity")
        .sort((a, b) => b.i.estimatedCost - a.i.estimatedCost)[0]?.n;
      if (idx !== undefined) items.splice(idx, 1);
    }
  }
  return items;
}

function buildFallbackItinerary(
  places: SeedPlace[],
  intent: TripIntent,
  startHour: number,
  budget?: number,
): ItineraryItem[] {
  const days = Math.max(1, intent.durationDays ?? 1);
  const { endHour } = resolvePlanWindow(intent);
  if (days === 1) return buildItinerary(places, startHour, budget, undefined, endHour);

  const dailyBudget = budget ? budget / days : undefined;
  return Array.from({ length: days }, (_, dayIndex) => {
    const shift = (dayIndex * Math.max(1, Math.floor(places.length / 2))) % places.length;
    const dayPlaces = places.slice(shift).concat(places.slice(0, shift));
    return buildItinerary(dayPlaces, startHour, dailyBudget, undefined, endHour).map((item) => ({
      ...item,
      id: `day-${dayIndex + 1}-${item.id}`,
      day: dayIndex + 1,
    }));
  }).flat();
}

function score(intent: TripIntent, matched: number, total: number): Recommendation["score"] {
  const moodFit = Math.round(78 + matched * 4);
  return {
    overall: Math.min(97, Math.round(82 + matched * 3)),
    moodFit: Math.min(98, moodFit),
    timeFit: 94,
    budgetFit: intent.budget ? 87 : 90,
    travelEffort: intent.transport === "walk" ? 95 : 89,
    activityFit: Math.min(96, 80 + total * 2),
    novelty: intent.novelty === "unexpected" ? 90 : 82,
  };
}

function pickByInterest(
  seeds: SeedPlace[],
  interests: string[],
  count: number,
  mustInclude: string[] = [],
): SeedPlace[] {
  const scored = seeds.map((p) => ({
    p,
    s:
      p.interests.filter((i) => interests.includes(i)).length +
      (mustInclude.some((m) => p.interests.includes(m)) ? 2 : 0),
  }));
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map((x) => x.p)
    .sort((a, b) => a.slot - b.slot || seeds.indexOf(a) - seeds.indexOf(b));
}

// Compact candidate list the AI can curate from. Ids are stable indexes so the
// model can only choose real, seeded places (never invent one).
export interface CityCandidate {
  id: string;
  title: string;
  place: string;
  type: ItineraryItem["type"];
  cost: number;
  minutes: number;
  interests: string[];
}

export function cityCandidates(): CityCandidate[] {
  return SAMPLE_PLACES.map((p, i) => ({
    id: `p${i}`,
    title: p.title,
    place: p.place,
    type: p.type,
    cost: p.cost,
    minutes: p.minutes,
    interests: p.interests,
  }));
}

// Build a real itinerary from AI-chosen candidate ids, keeping every price,
// coordinate and duration grounded in seeded data.
export function buildPlanFromIds(ids: string[], intent: TripIntent): ItineraryItem[] {
  const startHour = intent.durationHours && intent.durationHours <= 6 ? 17 : 10;
  const chosen = ids
    .map((id) => SAMPLE_PLACES[Number(id.replace(/[^0-9]/g, ""))])
    .filter((p): p is SeedPlace => Boolean(p))
    .sort((a, b) => a.slot - b.slot);
  return buildItinerary(chosen, startHour, intent.budget);
}

// --- AI-authored plans -----------------------------------------------------
// The model writes the actual stops in real time. We only attach a map
// coordinate and a matching photo locally, so the plan is genuinely AI-made
// while the map still renders in the right part of the city.

export interface AIStop {
  day?: number;
  title: string;
  place: string;
  area?: string;
  type: string;
  description: string;
  estimatedCost: number;
  durationMinutes: number;
  /** Preferred start time authored by the model, "HH:MM" (24h). */
  time?: string;
  /** Real coordinates from the AI plan, when available. */
  latitude?: number;
  longitude?: number;
}

// Fallback map centre used only by the offline sample plan (see SAMPLE_PLACES).
const CITY_CENTER: [number, number] = [12.9716, 77.5946];

// Keep fallback pins close to the destination centre so they stay on usable land
// instead of drifting into coastal or water-heavy areas when the AI response has
// no coordinate of its own. The wider radius is only for local dev / offline
// fallback and should be tight enough to stay in-city.
function spreadAround(center: [number, number], index: number): [number, number] {
  const angle = ((index * 137.5) * Math.PI) / 180;
  const r = 0.003 + (index % 5) * 0.0014;
  return [center[0] + Math.sin(angle) * r, center[1] + Math.cos(angle) * r];
}

const VALID_TYPES: ItineraryItem["type"][] = [
  "food", "activity", "culture", "nature", "shopping", "nightlife", "transport", "rest",
];

function normalizeType(raw: string): ItineraryItem["type"] {
  const v = (raw || "").toLowerCase().trim();
  if ((VALID_TYPES as string[]).includes(v)) return v as ItineraryItem["type"];
  if (/eat|drink|coffee|cafe|caf\u00e9|restaurant|breakfast|lunch|dinner|food|brunch/.test(v)) return "food";
  if (/bar|club|night|music|pub|comedy|gig/.test(v)) return "nightlife";
  if (/museum|temple|art|heritage|history|gallery/.test(v)) return "culture";
  if (/park|lake|garden|outdoor|nature|hike|trail/.test(v)) return "nature";
  if (/shop|market|mall|bazaar/.test(v)) return "shopping";
  if (/rest|break|relax|spa/.test(v)) return "rest";
  return "activity";
}

function imageForStop(type: ItineraryItem["type"], text: string): string {
  const t = text.toLowerCase();
  if (/date|romantic|couple|sunset|city lights|rooftop|wine|cocktail|drinks/.test(t)) return IMG.dateQuest;
  if (/breakfast|brunch|idli|dosa/.test(t)) return IMG.breakfast;
  if (/bakery|pastry|croissant/.test(t)) return IMG.bakery;
  if (/coffee|cafe|caf\u00e9|espresso/.test(t)) return IMG.coffee;
  if (/street food|chaat|snack/.test(t)) return IMG.streetfood;
  if (/dinner|thali|restaurant|eatery|bistro|diner|kitchen|grill|trattoria|osteria/.test(t)) return IMG.dinner;
  if (/temple|heritage/.test(t)) return IMG.temple;
  if (/museum|gallery|art/.test(t)) return IMG.gallery;
  if (/book|library/.test(t)) return IMG.bookstore;
  if (/pottery|workshop|craft/.test(t)) return IMG.pottery;
  if (/cycle|cycling|bike/.test(t)) return IMG.cycling;
  if (/lake|tank/.test(t)) return IMG.lake;
  if (/\bpark\b|botanical|\bgardens\b|nature walk|riverside walk/.test(t)) return IMG.park;
  if (/market|bazaar|shopping|mall/.test(t)) return IMG.market;
  if (/sunset|sundown/.test(t)) return IMG.sunset;
  if (/brewery|beer|pub|bar/.test(t)) return IMG.brewery;
  if (/rooftop|sky/.test(t)) return IMG.rooftop;
  if (/music|gig|comedy|live/.test(t)) return IMG.music;
  switch (type) {
    case "culture": return IMG.gallery;
    case "nature": return IMG.park;
    case "shopping": return IMG.market;
    case "rest": return IMG.coffee;
    default: return IMG.placeFallback;
  }
}


// Turn the model's authored stops into a real itinerary: times and routes are
// computed here. Each stop uses its own coordinate from the AI plan, falling
// back to a deterministic spread around the selected destination's centre, so
// the map renders correctly for any city on earth.
function isFiniteCoord(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

export function buildItineraryFromStops(stops: AIStop[], intent: TripIntent): ItineraryItem[] {
  const { startHour, endHour } = resolvePlanWindow(intent);
  const center: [number, number] = intent.location
    ? [intent.location.latitude, intent.location.longitude]
    : CITY_CENTER;
  const byDay = new Map<number, AIStop[]>();
  stops.forEach((stop) => {
    const day = Math.max(1, stop.day ?? 1);
    const group = byDay.get(day) ?? [];
    group.push(stop);
    byDay.set(day, group);
  });

  return [...byDay.entries()]
    .sort(([firstDay], [secondDay]) => firstDay - secondDay)
    .flatMap(([day, dayStops]) => {
      const seeds: SeedPlace[] = dayStops.map((stop, index) => {
        const type = normalizeType(stop.type);
        const lat = isFiniteCoord(stop.latitude) ? stop.latitude : spreadAround(center, index)[0];
        const lng = isFiniteCoord(stop.longitude) ? stop.longitude : spreadAround(center, index)[1];
        return {
          title: stop.title,
          place: stop.place,
          type,
          description: stop.description,
          cost: Math.max(0, Math.round(Number(stop.estimatedCost)) || 0),
          minutes: Math.min(180, Math.max(20, Math.round(Number(stop.durationMinutes)) || 60)),
          interests: [],
          slot: index + 1,
          image: imageForStop(type, `${stop.title} ${stop.place}`),
          lat,
          lng,
        };
      });
      return buildItinerary(seeds, startHour, undefined, dayStops.map((stop) => stop.time), endHour).map(
        (item) => ({ ...item, id: `day-${day}-${item.id}`, day }),
      );
    });
}


export function generateRecommendations(intent: TripIntent, catalogue?: CatalogueLocation): Recommendation[] {
  const startHour = intent.durationHours && intent.durationHours <= 6 ? 17 : 10;
  const itemCount = intent.pace === "slow" ? 3 : intent.pace === "packed" ? 5 : 4;
  const seeds = seedsFor(intent, catalogue);

  const primaryPlaces = pickByInterest(seeds, intent.interests, itemCount);
  const primaryItin = buildFallbackItinerary(primaryPlaces, intent, startHour, intent.budget);
  const primaryCost = primaryItin.reduce((s, i) => s + i.estimatedCost, 0);

  const foodPlaces = pickByInterest(seeds, ["food", "coffee"], 5, ["food"]);
  const foodItin = buildFallbackItinerary(foodPlaces, intent, startHour, intent.budget);
  const foodCost = foodItin.reduce((s, i) => s + i.estimatedCost, 0);

  const wildPlaces = pickByInterest(seeds, ["adventure", "nightlife", "culture"], 5, ["adventure"]);
  const wildItin = buildFallbackItinerary(wildPlaces, intent, startHour, intent.budget);
  const wildCost = wildItin.reduce((s, i) => s + i.estimatedCost, 0);

  const resetPlaces = pickByInterest(seeds, ["nature", "relax", "coffee"], 5, ["relax"]);
  const resetItin = buildFallbackItinerary(resetPlaces, intent, startHour, intent.budget);
  const resetCost = resetItin.reduce((s, i) => s + i.estimatedCost, 0);

  const endTime = primaryItin[primaryItin.length - 1]?.endTime ?? "21:30";
  const startTime = primaryItin[0]?.startTime ?? "10:00";

  const whyItFits = [
    intent.budget ? "Within your budget" : "Sensible, transparent spend",
    intent.transport === "walk" ? "Minimal driving" : "Easy to get between stops",
    intent.party === "couple" ? "Good for two" : `Works well ${intent.party === "solo" ? "solo" : "for a group"}`,
    intent.novelty === "unexpected" ? "High on novelty" : "Reliable, strong picks",
    intent.interests.includes("food") ? "Strong food options" : "Balanced across the day",
  ];

  const recs: Recommendation[] = [
    {
      id: "primary",
      title: "The old town, unhurried",
      badge: "Best overall",
      summary:
        "A slow, food-heavy day through some of the city's older neighbourhoods, with one cultural stop and a sunset finish.",
      image: IMG.recCity,
      costLow: Math.round(primaryCost * 0.9),
      costHigh: Math.round(primaryCost * 1.15),
      startTime,
      endTime,
      pace: intent.pace === "slow" ? "Easy pace" : intent.pace === "packed" ? "Full pace" : "Balanced pace",
      whyItFits,
      tradeoff: "You'll spend more time walking than sightseeing from a car.",
      score: score(intent, intent.interests.length, primaryPlaces.length),
      itinerary: primaryItin,
    },
    {
      id: "food",
      title: "The Food Quest",
      badge: "More eating, less sightseeing",
      summary: "Built around the table: a slow breakfast, a standout local lunch, coffee and a memorable dinner.",
      image: IMG.recFood,
      costLow: Math.round(foodCost * 0.9),
      costHigh: Math.round(foodCost * 1.15),
      startTime: foodItin[0]?.startTime ?? startTime,
      endTime: foodItin[foodItin.length - 1]?.endTime ?? endTime,
      pace: "Easy pace",
      whyItFits: ["Everything is walkable", "Great for food-first days", "Light on planning"],
      tradeoff: "Less variety if you wanted culture or the outdoors.",
      score: { ...score(intent, 3, 5), moodFit: 88 },
      itinerary: foodItin,
    },
    {
      id: "wild",
      title: "The Wild Card",
      badge: "Something different",
      summary: "Less obvious places and one unusual experience you probably haven't tried.",
      image: IMG.recWild,
      costLow: Math.round(wildCost * 0.9),
      costHigh: Math.round(wildCost * 1.15),
      startTime: wildItin[0]?.startTime ?? startTime,
      endTime: wildItin[wildItin.length - 1]?.endTime ?? endTime,
      pace: "Full pace",
      whyItFits: ["High on novelty", "One hands-on experience", "Good story to tell"],
      tradeoff: "A little more effort and a little less certainty.",
      score: { ...score(intent, 4, 5), novelty: 94 },
      itinerary: wildItin,
    },
    {
      id: "reset",
      title: "The Slow Reset",
      badge: "Calm and unhurried",
      summary: "Green spaces, a lake, good coffee and nothing you have to rush for.",
      image: IMG.recCity,
      costLow: Math.round(resetCost * 0.9),
      costHigh: Math.round(resetCost * 1.15),
      startTime: resetItin[0]?.startTime ?? startTime,
      endTime: resetItin[resetItin.length - 1]?.endTime ?? endTime,
      pace: "Easy pace",
      whyItFits: ["Low on planning", "Plenty of downtime", "Gentle on the wallet"],
      tradeoff: "Not much here if you were after a big night out.",
      score: { ...score(intent, 3, 5), moodFit: 90, travelEffort: 94 },
      itinerary: resetItin,
    },
  ];

  // Curate 4 to 6 plans: add extra angles only when the request calls for them,
  // so simple days stay focused and richer trips get more genuine options.
  const extras: Recommendation[] = [];

  const wantsNight =
    intent.interests.includes("nightlife") ||
    intent.party === "friends" ||
    intent.party === "group" ||
    intent.novelty === "unexpected";
  if (wantsNight) {
    const nightPlaces = pickByInterest(seeds, ["nightlife", "food"], 5, ["nightlife"]);
    const nightItin = buildItinerary(nightPlaces, Math.max(startHour, 17), intent.budget);
    const nightCost = nightItin.reduce((s, i) => s + i.estimatedCost, 0);
    extras.push({
      id: "night",
      title: "The Big Night Out",
      badge: "Evening and nightlife",
      summary: "Dinner, drinks and something live, built for a group that wants a proper night.",
      image: IMG.recWild,
      costLow: Math.round(nightCost * 0.9),
      costHigh: Math.round(nightCost * 1.15),
      startTime: nightItin[0]?.startTime ?? startTime,
      endTime: nightItin[nightItin.length - 1]?.endTime ?? endTime,
      pace: "Full pace",
      whyItFits: ["Made for the evening", "Great with friends", "Ends on a high"],
      tradeoff: "A later start means you skip the quiet morning stops.",
      score: { ...score(intent, 3, 5), moodFit: 89, novelty: 88 },
      itinerary: nightItin,
    });
  }

  const wantsCulture =
    intent.interests.includes("culture") || intent.interests.includes("shopping");
  if (wantsCulture) {
    const culturePlaces = pickByInterest(seeds, ["culture", "shopping"], 5, ["culture"]);
    const cultureItin = buildItinerary(culturePlaces, startHour, intent.budget);
    const cultureCost = cultureItin.reduce((s, i) => s + i.estimatedCost, 0);
    extras.push({
      id: "culture",
      title: "Art, Markets and History",
      badge: "Culture-first",
      summary: "Galleries, heritage stops and old-city markets for a day that leans into the city's story.",
      image: IMG.recCity,
      costLow: Math.round(cultureCost * 0.9),
      costHigh: Math.round(cultureCost * 1.15),
      startTime: cultureItin[0]?.startTime ?? startTime,
      endTime: cultureItin[cultureItin.length - 1]?.endTime ?? endTime,
      pace: intent.pace === "packed" ? "Full pace" : "Balanced pace",
      whyItFits: ["Rich in culture", "Easy to slow down", "Plenty to look at"],
      tradeoff: "Lighter on food and nightlife than the other plans.",
      score: { ...score(intent, 3, 5), moodFit: 87 },
      itinerary: cultureItin,
    });
  }

  // Bigger requests (packed pace or a long day) justify offering the full six.
  const roomForMore = intent.pace === "packed" || (intent.durationHours ?? 0) >= 10;
  const maxPlans = roomForMore ? 6 : 5;
  return [...recs, ...extras].slice(0, maxPlans);
}

// --- Nearby escapes & long trips -----------------------------------------

export const NEARBY_DESTINATIONS: Destination[] = [
  {
    id: "nandi",
    name: "Nandi Hills",
    region: "1h 15m away",
    badge: "Best overall",
    tags: ["Sunrise", "Views", "Easy escape"],
    image: IMG.nandi,
    durationLabel: "Full day",
    budgetLabel: "₹1,500-2,500",
    travelLabel: "1h 15m drive",
    why: "Short enough that the drive doesn't eat your day.",
    tradeoff: "Gets busy on weekends, so leave early.",
    highlights: ["Sunrise above the clouds", "Tipu's summer fort", "Breakfast at the top"],
    bestTime: "Leave by 4:30am for the sunrise",
    idealFor: "Couples and early risers",
  },
  {
    id: "skandagiri",
    name: "Skandagiri",
    region: "1h 30m away",
    badge: "Best for adventure",
    tags: ["Night trek", "Sunrise", "Fitness"],
    image: IMG.skandagiri,
    durationLabel: "Overnight trek",
    budgetLabel: "₹1,800-3,000",
    travelLabel: "1h 30m drive",
    why: "A moonlit hike that tops out just as the sun comes up.",
    tradeoff: "It is a real climb, so bring proper shoes.",
    highlights: ["Guided night trek", "Sea of clouds at dawn", "Old fort ruins"],
    bestTime: "Post-monsoon, Oct to Feb",
    idealFor: "Friends who want a challenge",
  },
  {
    id: "savandurga",
    name: "Savandurga",
    region: "1h 15m away",
    badge: "Best for a workout",
    tags: ["Rock climb", "Temple", "Views"],
    image: IMG.savandurga,
    durationLabel: "Half day",
    budgetLabel: "₹1,000-1,800",
    travelLabel: "1h 15m drive",
    why: "One of Asia's largest monoliths, and you can walk right up it.",
    tradeoff: "Almost no shade, so start at first light.",
    highlights: ["Barefoot rock ascent", "Hilltop Nandi temple", "Kaveri views"],
    bestTime: "Early morning, cooler months",
    idealFor: "Active solo travellers",
  },
  {
    id: "shivanasamudra",
    name: "Shivanasamudra Falls",
    region: "2h 30m away",
    badge: "Best after the rains",
    tags: ["Waterfall", "Nature", "Photography"],
    image: IMG.shivanasamudra,
    durationLabel: "Full day",
    budgetLabel: "₹2,000-3,500",
    travelLabel: "2h 30m drive",
    why: "Twin waterfalls at their thundering best once the monsoon lands.",
    tradeoff: "Underwhelming in peak summer when the flow drops.",
    highlights: ["Gaganachukki viewpoint", "Coracle ride", "Riverside lunch"],
    bestTime: "August to January",
    idealFor: "Nature and photo lovers",
  },
  {
    id: "mysuru",
    name: "Mysuru",
    region: "3h away",
    badge: "Best for culture",
    tags: ["Palace", "Heritage", "Food"],
    image: IMG.mysuru,
    durationLabel: "Overnight",
    budgetLabel: "₹3,500-6,000",
    travelLabel: "3h drive / train",
    why: "A royal city of palaces, markets and proper Mysore masala dosa.",
    tradeoff: "Feels rushed if you only give it a single day.",
    highlights: ["Mysore Palace lights", "Devaraja Market", "Chamundi Hills"],
    bestTime: "Cooler months, magical during Dussehra",
    idealFor: "Families and first-timers",
  },
  {
    id: "coorg",
    name: "Coorg",
    region: "5h 30m away",
    badge: "Best for nature",
    tags: ["Coffee estates", "Waterfalls", "Green"],
    image: IMG.coorg,
    durationLabel: "Overnight",
    budgetLabel: "₹4,000-7,000",
    travelLabel: "5h 30m drive",
    why: "Misty coffee country that feels a world away.",
    tradeoff: "Too far for a comfortable single-day trip.",
    highlights: ["Coffee estate stay", "Abbey Falls", "Pork curry and akki roti"],
    bestTime: "October to March",
    idealFor: "Couples wanting to slow down",
  },
];

export const LONG_TRIP_DESTINATIONS: Destination[] = [
  {
    id: "gokarna",
    name: "Gokarna",
    region: "Karnataka coast",
    badge: "Best overall",
    tags: ["Beach", "Slow", "Food"],
    image: IMG.gokarna,
    durationLabel: "3-4 days",
    budgetLabel: "₹18-22k",
    travelLabel: "Overnight bus / train",
    why: "Quiet beaches and a slow rhythm without Goa's crowds.",
    tradeoff: "Less nightlife than Goa.",
    highlights: ["Beach-hop to Om and Half Moon", "Temple town walk", "Cliffside sunsets"],
    bestTime: "November to February",
    idealFor: "Couples and solo travellers",
  },
  {
    id: "varkala",
    name: "Varkala",
    region: "Kerala coast",
    badge: "Best for slow travel",
    tags: ["Beach", "Food", "Wellness"],
    image: IMG.varkala,
    durationLabel: "3-4 days",
    budgetLabel: "₹21-25k",
    travelLabel: "Flight + drive",
    why: "Cliff-top cafés, long swims and proper Kerala food.",
    tradeoff: "The flight adds to the budget.",
    highlights: ["Cliff-edge cafes", "Ayurvedic spa day", "Fresh catch dinners"],
    bestTime: "October to March",
    idealFor: "Couples who want to reset",
  },
  {
    id: "hampi",
    name: "Hampi",
    region: "Karnataka interior",
    badge: "Best for something different",
    tags: ["Culture", "History", "Adventure"],
    image: IMG.hampi,
    durationLabel: "2-3 days",
    budgetLabel: "₹14-18k",
    travelLabel: "Overnight train",
    why: "Boulder-strewn ruins that feel genuinely otherworldly.",
    tradeoff: "Hot by midday, so mornings and evenings are best.",
    highlights: ["Vijayanagara ruins", "Sunset from Matanga Hill", "Coracle across the river"],
    bestTime: "November to February",
    idealFor: "History buffs and photographers",
  },
  {
    id: "pondicherry",
    name: "Pondicherry",
    region: "Tamil Nadu coast",
    badge: "Best for a vibe",
    tags: ["French quarter", "Cafes", "Beach"],
    image: IMG.pondicherry,
    durationLabel: "3 days",
    budgetLabel: "₹16-20k",
    travelLabel: "Flight to Chennai + drive",
    why: "Pastel French streets, sea-facing cafes and Auroville calm.",
    tradeoff: "The main beach is rocky, not for swimming.",
    highlights: ["White Town walk", "Auroville and Matrimandir", "Promenade at dawn"],
    bestTime: "October to March",
    idealFor: "Couples and creatives",
  },
  {
    id: "wayanad",
    name: "Wayanad",
    region: "Kerala hills",
    badge: "Best for green",
    tags: ["Forest", "Wildlife", "Trek"],
    image: IMG.wayanad,
    durationLabel: "3-4 days",
    budgetLabel: "₹19-24k",
    travelLabel: "Overnight bus / drive",
    why: "Spice plantations, caves and misty wildlife country.",
    tradeoff: "Winding ghat roads can be tiring.",
    highlights: ["Edakkal Caves", "Chembra Peak trek", "Plantation homestay"],
    bestTime: "October to May",
    idealFor: "Nature lovers and families",
  },
  {
    id: "munnar",
    name: "Munnar",
    region: "Kerala hills",
    badge: "Best for tea country",
    tags: ["Tea estates", "Views", "Cool weather"],
    image: IMG.munnar,
    durationLabel: "3-4 days",
    budgetLabel: "₹20-26k",
    travelLabel: "Flight to Kochi + drive",
    why: "Endless rolling tea gardens and cool mountain air.",
    tradeoff: "Popular, so book stays well ahead.",
    highlights: ["Tea museum and tasting", "Eravikulam National Park", "Top Station viewpoint"],
    bestTime: "September to March",
    idealFor: "Couples and honeymooners",
  },
  {
    id: "goa",
    name: "Goa",
    region: "Konkan coast",
    badge: "Best for the classic",
    tags: ["Beach", "Nightlife", "Food"],
    image: IMG.goa,
    durationLabel: "3-5 days",
    budgetLabel: "₹22-30k",
    travelLabel: "Direct flight",
    why: "Beaches for every mood, from party north to quiet south.",
    tradeoff: "Peak-season prices climb fast.",
    highlights: ["South Goa beach days", "Fontainhas old town", "Seafood shacks"],
    bestTime: "November to February",
    idealFor: "Friends and first big trips",
  },
  {
    id: "andaman",
    name: "Andaman Islands",
    region: "Bay of Bengal",
    badge: "Best for a splurge",
    tags: ["Islands", "Diving", "White sand"],
    image: IMG.andaman,
    durationLabel: "5-6 days",
    budgetLabel: "₹40-55k",
    travelLabel: "Flight to Port Blair",
    why: "Some of the clearest water and best diving in the country.",
    tradeoff: "The furthest and priciest option here.",
    highlights: ["Radhanagar Beach", "Scuba at Havelock", "Bioluminescence kayaking"],
    bestTime: "October to May",
    idealFor: "Couples and divers",
  },
];

export type RefineAction =
  | "cheaper"
  | "slower"
  | "more_food"
  | "more_adventure"
  | "less_driving"
  | "more_local";

function seedToItem(extra: SeedPlace, id: string): ItineraryItem {
  return {
    id,
    startTime: "13:00",
    endTime: "14:00",
    type: extra.type,
    title: extra.title,
    place: extra.place,
    description: extra.description,
    image: extra.image,
    lat: extra.lat,
    lng: extra.lng,
    estimatedCost: extra.cost,
    durationMinutes: extra.minutes,
    status: "open",
    routeToNext: walkOrDrive(12),
  };
}

export function refineItinerary(items: ItineraryItem[], action: RefineAction): ItineraryItem[] {
  const clone = items.map((i) => ({ ...i }));
  switch (action) {
    case "cheaper": {
      const idx = clone
        .map((i, n) => ({ i, n }))
        .sort((a, b) => b.i.estimatedCost - a.i.estimatedCost)[0]?.n;
      if (idx !== undefined && clone.length > 3) clone.splice(idx, 1);
      return clone;
    }
    case "slower":
      return clone.filter((_, n) => n < Math.max(3, clone.length - 1));
    case "more_food": {
      const extra = SAMPLE_PLACES.find((p) => p.type === "food");
      if (extra) clone.splice(Math.floor(clone.length / 2), 0, seedToItem(extra, `food-${Date.now()}`));
      return clone;
    }
    case "more_adventure": {
      const extra = SAMPLE_PLACES.find((p) => p.interests.includes("adventure"));
      if (extra) clone.splice(2, 0, seedToItem(extra, `adv-${Date.now()}`));
      return clone;
    }
    case "less_driving":
      return clone.map((i) => ({
        ...i,
        routeToNext: i.routeToNext
          ? { ...i.routeToNext, mode: "walk", durationMinutes: Math.min(i.routeToNext.durationMinutes, 15) }
          : undefined,
      }));
    case "more_local":
      return clone;
    default:
      return clone;
  }
}

// Replace a single stop with a different, same-type option for the same city,
// keeping its time slot, position and route so the rest of the day is intact.
export function swapStop(
  items: ItineraryItem[],
  id: string,
  intent: TripIntent,
): ItineraryItem[] {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return items;
  const current = items[idx];

  const seeds = seedsFor(intent);
  const usedPlaces = new Set(items.map((i) => i.place.toLowerCase()));
  const usedTitles = new Set(items.map((i) => i.title.toLowerCase()));

  const sameType = seeds.filter((s) => s.type === current.type);
  const pool = (sameType.length ? sameType : seeds).filter(
    (s) =>
      !usedPlaces.has(s.place.toLowerCase()) && !usedTitles.has(s.title.toLowerCase()),
  );
  const candidate = pool[Math.floor(Math.random() * pool.length)];
  if (!candidate) return items;

  const clone = items.map((i) => ({ ...i }));
  clone[idx] = {
    ...current,
    type: candidate.type,
    title: candidate.title,
    place: candidate.place,
    description: candidate.description,
    image: candidate.image,
    lat: candidate.lat,
    lng: candidate.lng,
    estimatedCost: candidate.cost,
    durationMinutes: candidate.minutes,
  };
  return clone;
}
