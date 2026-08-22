import type { Location } from "../types/location";
import type { Json, SearchRow } from "../types/database";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Global location resolution. No hardcoded city whitelist: destinations are
// resolved dynamically from OpenStreetMap's Nominatim geocoder, so any real
// place on earth is supported. Reverse geocoding turns device coordinates into
// a named place; forward search turns typed text into candidate destinations.
// ---------------------------------------------------------------------------

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

function cityFromAddress(a: NominatimAddress | undefined): string {
  return a?.city || a?.town || a?.village || a?.municipality || a?.county || a?.state || "";
}

function toLocation(r: NominatimResult): Location {
  const a = r.address;
  return {
    city: cityFromAddress(a) || r.display_name.split(",")[0],
    country: a?.country ?? "",
    countryCode: a?.country_code?.toUpperCase(),
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    formattedAddress: r.display_name,
  };
}

export class LocationError extends Error {}

// Search for destinations by free text (city, neighbourhood or landmark).
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<Location[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("limit", "6");
  // Retry once on a transient failure (Nominatim rate-limits per-keystroke
  // searches); a momentary miss must never silently resolve to another city.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
      const data = (await res.json()) as NominatimResult[];
      return data.map(toLocation).filter((l) => l.city);
    } catch (error) {
      if (signal?.aborted) return [];
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      // eslint-disable-next-line no-console
      console.error("[locations] search", error);
      throw new LocationError(
        "We couldn't find that destination. Try a city, neighbourhood, or landmark.",
      );
    }
  }
  return [];
}

// Turn raw coordinates (e.g. from the browser) into a named place.
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Location> {
  try {
    const url = new URL(`${NOMINATIM}/reverse`);
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Reverse geocoder responded ${res.status}`);
    const data = (await res.json()) as NominatimResult;
    return toLocation({ ...data, lat: String(latitude), lon: String(longitude) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[locations] reverseGeocode", error);
    throw new LocationError("We couldn't determine your location. Search for a destination instead.");
  }
}

// Ask the browser for the current position, then resolve it to a place.
export async function detectCurrentLocation(): Promise<Location> {
  if (!("geolocation" in navigator)) {
    throw new LocationError("We couldn't determine your location. Search for a destination instead.");
  }
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 300_000,
    });
  }).catch(() => {
    throw new LocationError("We couldn't determine your location. Search for a destination instead.");
  });
  return reverseGeocode(position.coords.latitude, position.coords.longitude);
}

// Persist a completed/selected destination search. Fails silently: search
// history is a nice-to-have and must never block the user's flow.
export async function recordSearch(params: {
  userId: string | null;
  query: string;
  location: Location;
  filters?: Json;
}): Promise<void> {
  if (!isSupabaseConfigured || !params.userId) return;
  try {
    await supabase.from("searches").insert({
      user_id: params.userId,
      query: params.query,
      city: params.location.city,
      country: params.location.country,
      latitude: params.location.latitude,
      longitude: params.location.longitude,
      filters: params.filters ?? {},
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[locations] recordSearch", error);
  }
}

export async function listSearchHistory(userId: string, limit = 8): Promise<SearchRow[]> {
  if (!isSupabaseConfigured || !userId) return [];
  const { data, error } = await supabase
    .from("searches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new LocationError("We couldn't load your recent searches right now.");
  return data ?? [];
}
