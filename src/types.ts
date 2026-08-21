import type { Location } from "./types/location";

export type PlannerMode = "city" | "nearby" | "long_trip" | "surprise";

export type PartyType = "solo" | "couple" | "friends" | "family" | "group";

export type Pace = "slow" | "balanced" | "packed";

export type Transport = "walk" | "public_transport" | "car" | "bike" | "mixed";

export interface TripIntent {
  mode: PlannerMode;
  origin?: string;
  /** Resolved real-world destination with coordinates. Drives global planning. */
  location?: Location;
  destination?: string;
  durationHours?: number;
  durationDays?: number;
  startTime?: string;
  endTime?: string;
  budget?: number;
  currency: string;
  party: PartyType;
  interests: string[];
  mood: string[];
  pace: Pace;
  transport: Transport;
  novelty: "familiar" | "balanced" | "unexpected";
  maxDriveMinutes?: number;
  raw: string;
}

export type ItineraryItemType =
  | "food"
  | "activity"
  | "culture"
  | "nature"
  | "shopping"
  | "nightlife"
  | "transport"
  | "rest";

export interface RouteSegment {
  mode: "walk" | "drive" | "transit" | "bike";
  durationMinutes: number;
  distanceKm: number;
}

export interface ItineraryItem {
  id: string;
  day?: number;
  startTime: string;
  endTime: string;
  type: ItineraryItemType;
  title: string;
  place: string;
  description: string;
  image: string;
  lat: number;
  lng: number;
  estimatedCost: number;
  durationMinutes: number;
  status: "open" | "closing_soon" | "closed" | "unknown";
  routeToNext?: RouteSegment;
}

export interface RecommendationScore {
  overall: number;
  moodFit: number;
  timeFit: number;
  budgetFit: number;
  travelEffort: number;
  activityFit: number;
  novelty: number;
}

export interface Recommendation {
  id: string;
  title: string;
  badge: string;
  summary: string;
  image: string;
  costLow: number;
  costHigh: number;
  startTime: string;
  endTime: string;
  pace: string;
  whyItFits: string[];
  tradeoff: string;
  score: RecommendationScore;
  itinerary: ItineraryItem[];
}

export interface Destination {
  id: string;
  name: string;
  region: string;
  badge: string;
  tags: string[];
  image: string;
  durationLabel: string;
  budgetLabel: string;
  travelLabel: string;
  why: string;
  tradeoff: string;
  highlights?: string[];
  bestTime?: string;
  idealFor?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  preferences: {
    interests: string[];
    pace: Pace;
  };
}

export interface SavedTrip {
  id: string;
  userId: string;
  title: string;
  mode: PlannerMode;
  origin: string;
  city?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  image: string;
  costLow: number;
  costHigh: number;
  startTime: string;
  endTime: string;
  itinerary: ItineraryItem[];
  status: "saved" | "upcoming" | "completed";
  feedback?: { rating: "loved" | "good" | "fine" | "no"; note?: string };
  createdAt: string;
}
