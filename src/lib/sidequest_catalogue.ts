export type PlaceType =
  | "culture" | "nature" | "shopping" | "food" | "viewpoint" | "religious"
  | "museum" | "architecture" | "historic" | "adventure" | "neighbourhood" | "other";

export interface CataloguePlace {
  name: string;
  type: PlaceType;
  description: string;
  image: string;
  sourceUrl: string;
  latitude?: number;
  longitude?: number;
  timing?: { start?: string; end?: string; confidence?: string };
}

export interface CatalogueLocation {
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  places: CataloguePlace[];
  hydrated?: boolean;
  source?: "seed" | "wikidata";
}

export interface StaticCatalogueDestination {
  id?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  spotIds?: string[];
  spotIdsByDistance?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface StaticCatalogueSpot {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
  preferredStartTime?: string;
  preferredEndTime?: string;
  [key: string]: unknown;
}

// Sidequest static catalogue loader
// Keep destinations.json / spots.json in the same public static directory.
export async function loadDestinations(): Promise<StaticCatalogueDestination[] | Record<string, unknown>> {
  const res = await fetch('/destinations.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load Sidequest destinations: ${res.status}`);
  return res.json();
}
export async function loadSpots(): Promise<StaticCatalogueSpot[]> {
  const res = await fetch('/spots.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load Sidequest spots: ${res.status}`);
  return res.json();
}
export async function loadCatalogue(): Promise<{
  destinations: StaticCatalogueDestination[] | Record<string, unknown>;
  spots: StaticCatalogueSpot[];
}> {
  const [destinations, spots] = await Promise.all([loadDestinations(), loadSpots()]);
  return {
    destinations: Array.isArray(destinations)
      ? destinations
      : (destinations.destinations as StaticCatalogueDestination[] ?? []),
    spots,
  };
}

let destinationIndexPromise: Promise<StaticCatalogueDestination[]> | null = null;
let spotsPromise: Promise<StaticCatalogueSpot[]> | null = null;

function loadDestinationIndex() {
  if (!destinationIndexPromise) {
    destinationIndexPromise = loadDestinations().then((destinations) =>
      Array.isArray(destinations)
        ? destinations
        : (destinations.destinations as StaticCatalogueDestination[] ?? []),
    );
  }
  return destinationIndexPromise;
}

function loadSpotDatabase() {
  if (!spotsPromise) spotsPromise = loadSpots();
  return spotsPromise;
}

function placeType(value: unknown): PlaceType {
  const known: PlaceType[] = [
    "culture", "nature", "shopping", "food", "viewpoint", "religious", "museum",
    "architecture", "historic", "adventure", "neighbourhood", "other",
  ];
  return known.includes(value as PlaceType) ? value as PlaceType : "other";
}

export async function loadStaticCatalogueLocation(
  city: string,
  country: string,
  limit = 30,
): Promise<CatalogueLocation | null> {
  const destinations = await loadDestinationIndex();
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const matchingCity = destinations.filter((candidate) =>
    normalise(String(candidate.city ?? candidate.name ?? "")) === normalise(city),
  );
  const destination = matchingCity.find((candidate) =>
    normalise(String(candidate.country ?? "")) === normalise(country),
  ) ?? matchingCity[0];
  if (!destination) return null;
  const spots = await loadSpotDatabase();
  const byId = new Map(spots.map((spot) => [String(spot.id ?? ""), spot]));
  const ids = Array.isArray(destination.spotIds) ? destination.spotIds : [];
  const places: CataloguePlace[] = ids
    .map((id) => byId.get(String(id)))
    .filter((spot): spot is StaticCatalogueSpot => Boolean(spot?.name || spot?.title))
    .slice(0, Math.max(1, limit))
    .map((spot) => ({
      name: String(spot.name ?? spot.title),
      type: placeType(spot.type ?? spot.kind),
      description: String(spot.description ?? ""),
      image: String(spot.imageUrl ?? spot.image ?? ""),
      sourceUrl: String(spot.sourceUrl ?? ""),
      latitude: Number(spot.latitude),
      longitude: Number(spot.longitude),
      timing: spot.timing && typeof spot.timing === "object"
        ? {
            start: typeof (spot.timing as { start?: unknown }).start === "string"
              ? (spot.timing as { start: string }).start
              : undefined,
            end: typeof (spot.timing as { end?: unknown }).end === "string"
              ? (spot.timing as { end: string }).end
              : undefined,
            confidence: typeof (spot.timing as { confidence?: unknown }).confidence === "string"
              ? (spot.timing as { confidence: string }).confidence
              : undefined,
          }
        : undefined,
    }));
  return {
    city,
    country,
    latitude: Number(destination.latitude),
    longitude: Number(destination.longitude),
    places,
    hydrated: true,
    source: "wikidata",
  };
}
