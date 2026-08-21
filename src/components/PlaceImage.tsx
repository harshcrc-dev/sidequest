import { useEffect, useState } from "react";
import { Img } from "./Img";
import { IMG } from "../lib/images";

const imageRequests = new Map<string, Promise<string | null>>();

// Tracks which place has claimed a given resolved photo, so two different stops
// (e.g. a temple and the street beside it that share a Wikipedia article) don't
// render the same image — the later stop falls back to its own type photo.
const claimedImages = new Map<string, string>();

function placeName(place: string) {
  return place.split(",")[0]?.trim() || place;
}

// Turn an activity title into the underlying venue/landmark name so Wikipedia
// search matches the real place, e.g. "Breakfast at The Wolseley" -> "The
// Wolseley", "Stroll along the South Bank" -> "South Bank".
function cleanPlaceName(place: string): string {
  let s = placeName(place);
  s = s.replace(
    /^(breakfast|brunch|lunch|dinner|supper|coffee|drinks?|snacks?|tea|cocktails?|nightcap)\b[^A-Za-z0-9]*(at|in|near|by|@)\s+/i,
    "",
  );
  s = s.replace(
    /^(visit|explore|see|discover|tour|stroll|walk|wander|browse|shopping|shop|relax|experience|enjoy|admire|check out|ride|climb)\b\s*(the\s+|along\s+|through\s+|around\s+|at\s+|in\s+|to\s+|down\s+)?/i,
    "",
  );
  return s.trim() || placeName(place);
}

// Wikipedia often returns a logo, flag, map or icon as an article's lead image.
// Those never look like a real place photo, so we reject them and fall back.
function looksLikeLogo(url: string): boolean {
  return /logo|\.svg|icon|flag|coat[_ ]?of[_ ]?arms|locator|_map|seal|emblem|wordmark/i.test(url);
}

const GENERIC_PLACE = /\b(local|neighbou?rhood|well-loved|best-known|breakfast spot|lunch spot|dinner spot|coffee bar|craft studio|food street|old quarter|central market|sunset viewpoint|live-music venue)\b/i;
const IMAGE_STOP_WORDS = new Set(["the", "and", "for", "near", "spot", "local", "visit", "walk"]);

function relevantArticle(title: string, place: string): boolean {
  const normalise = (value: string) =>
    value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const article = normalise(title);
  const subject = normalise(cleanPlaceName(place));
  if (!article || !subject) return false;
  if (article.includes(subject) || subject.includes(article)) return true;
  const tokens = subject
    .split(" ")
    .filter((token) => token.length > 2 && !IMAGE_STOP_WORDS.has(token));
  if (tokens.length === 0) return false;
  const matches = tokens.filter((token) => article.split(" ").includes(token)).length;
  return matches >= (tokens.length >= 3 ? 2 : 1);
}

// Resolve a real photo for a named place. We use Wikipedia's search API (not the
// exact-title summary endpoint) so romanized or partial names still find the
// right article, and we pass the city as context to disambiguate common names.
function getPlaceImage(place: string, context?: string): Promise<string | null> {
  const name = cleanPlaceName(place);
  if (GENERIC_PLACE.test(name)) return Promise.resolve(null);
  const key = `${name}|${context ?? ""}`.toLowerCase();
  const cached = imageRequests.get(key);
  if (cached) return cached;

  const search = context ? `${name} ${context}` : name;
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    `&generator=search&gsrsearch=${encodeURIComponent(search)}&gsrlimit=1` +
    "&prop=pageimages&piprop=thumbnail&pithumbsize=800";

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      const pages = data?.query?.pages as
        | Record<string, { title?: string; thumbnail?: { source?: string } }>
        | undefined;
      const first = pages ? Object.values(pages)[0] : undefined;
      const source = first?.thumbnail?.source;
      if (
        typeof source !== "string" ||
        typeof first?.title !== "string" ||
        looksLikeLogo(source) ||
        !relevantArticle(first.title, name)
      ) return null;
      return source;
    })
    .catch(() => null);
  imageRequests.set(key, request);
  return request;
}

export function PlaceImage({
  place,
  alt,
  className,
  eager = false,
  fallbackSrc,
  context,
}: {
  place: string;
  alt: string;
  className?: string;
  eager?: boolean;
  fallbackSrc?: string;
  context?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let claimed: string | null = null;
    setSrc(null);
    void getPlaceImage(place, context).then((image) => {
      if (!active) return;
      if (image) {
        const owner = claimedImages.get(image);
        if (owner && owner !== place) {
          // Another stop already uses this photo; fall back to our type image.
          setSrc(null);
          return;
        }
        claimedImages.set(image, place);
        claimed = image;
      }
      setSrc(image);
    });
    return () => {
      active = false;
      if (claimed && claimedImages.get(claimed) === place) claimedImages.delete(claimed);
    };
  }, [place, context]);

  // A relevant category photo is preferable to a letter tile when an exact
  // venue photo is unavailable. The neutral final fallback keeps every card
  // visual even if a remote image service is temporarily unavailable.
  const resolved = src ?? fallbackSrc ?? IMG.placeFallback;
  return <Img src={resolved} alt={alt} className={className} eager={eager} />;
}
