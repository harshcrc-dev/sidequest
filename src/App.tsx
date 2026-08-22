import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { Navigation, type View } from "./components/Navigation";
import { Hero } from "./components/Hero";
import { Loading } from "./components/Loading";
import { IntentSummary } from "./components/IntentSummary";
import { RecommendationHero } from "./components/RecommendationHero";
import { Alternatives } from "./components/Alternatives";
import { Itinerary } from "./components/Itinerary";
import { RefinementBar } from "./components/RefinementBar";
import { ExplorePreview } from "./components/ExplorePreview";
import { DestinationGrid } from "./components/DestinationGrid";
import { MySidequests } from "./components/MySidequests";
import { Profile } from "./components/Profile";
import { AuthModal } from "./components/AuthModal";
import { CityPrompt } from "./components/CityPrompt";
import { AdminPanel } from "./components/AdminPanel";
import { useAuth } from "./context/AuthContext";
import { useReveal } from "./hooks/useReveal";
import { tripsService } from "./services/trips";
import { searchLocations, recordSearch } from "./services/locations";
import { setDisplayCurrency } from "./lib/format";
import { loadStaticCatalogueLocation } from "./lib/sidequest_catalogue";
import { recordPageView } from "./services/analytics";
import type { Location } from "./types/location";
import {
  aiLabel,
  generatePlanAI,
  isAIAvailable,
  parseIntentAI,
} from "./lib/ai";
import {
  buildItineraryFromStops,
  generateRecommendations,
  LONG_TRIP_DESTINATIONS,
  parseIntent,
  refineItinerary,
  swapStop,
  type RefineAction,
} from "./lib/planner";
import type {
  Destination,
  ItineraryItem,
  PlannerMode,
  Recommendation,
  SavedTrip,
  TripIntent,
} from "./types";

type Stage = "home" | "loading" | "results" | "nearby" | "longtrip";

function initialView(): View {
  return window.location.pathname === "/admin" ? "admin" : "home";
}

// Phrases that are not a real, geocodable place. We must never plan for these
// as if they were a city; they signal "use my location" instead.
const VAGUE_PLACE = /^(current location|my location|here|near me|nearby|around me|somewhere)$/i;
function isVaguePlace(value?: string): boolean {
  return !!value && VAGUE_PLACE.test(value.trim());
}

function isOriginGrounded(prompt: string, origin: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const promptWords = new Set(normalize(prompt).split(" ").filter(Boolean));
  const originWords = normalize(origin).split(" ").filter(Boolean);
  const generic = new Set(["city", "town", "greater", "metropolitan", "area", "district"]);
  const meaningful = originWords.filter((word) => word.length >= 3 && !generic.has(word));
  if (meaningful.some((word) => promptWords.has(word))) return true;
  const acronym = originWords.map((word) => word[0]).join("");
  return acronym.length >= 2 && promptWords.has(acronym);
}

function hoursBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const difference = toMinutes(end) - toMinutes(start);
  return Math.max(1, Math.round((difference > 0 ? difference : difference + 24 * 60) / 60));
}

export default function App() {
  const { user, profile } = useAuth();
  const [view, setView] = useState<View>(initialView);
  const [stage, setStage] = useState<Stage>("home");

  const [intent, setIntent] = useState<TripIntent | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [selectedId, setSelectedId] = useState("primary");
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string>();
  const [pendingSave, setPendingSave] = useState(false);
  const [cityAsk, setCityAsk] = useState<{ prompt: string; mode?: PlannerMode } | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [refining, setRefining] = useState(false);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    void isAIAvailable().then(setAiAvailable);
  }, []);
  useEffect(() => {
    if (!user && (view === "saved" || view === "profile" || view === "admin")) {
      setView("home");
      setStage("home");
    }
    if (view === "admin" && !user?.isAdmin) {
      setView("home");
      setStage("home");
    }
  }, [user, view]);

  useEffect(() => {
    void recordPageView(view === "admin" ? "/admin" : `/${view}`);
  }, [view]);

  const selected = recs.find((r) => r.id === selectedId) ?? recs[0];

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // Resolve the user's intent to a real, global destination with coordinates.
  // Order: a city named in the request, then the user's saved home base. No
  // hardcoded default city, so Sidequest works anywhere on earth.
  const resolveLocation = async (
    parsed: TripIntent,
    signal: AbortSignal,
  ): Promise<Location | null> => {
    const origin = parsed.origin?.trim();
    const homeCity = profile?.preferences.home?.city ?? profile?.homeCity ?? undefined;
    const homeLocation = (): Location | null => {
      if (profile?.preferences.home) return profile.preferences.home;
      if (profile?.homeCity) {
        return {
          city: profile.homeCity,
          country: profile.homeCountry ?? "",
          latitude: profile.homeLat ?? 0,
          longitude: profile.homeLng ?? 0,
        };
      }
      return null;
    };

    if (origin) {
      try {
        const [first] = await searchLocations(origin, signal);
        if (first) return first;
      } catch {
        /* handled below */
      }
      // The user named a place. Only use the saved home if that's the very
      // place they asked for; never silently swap in a different city.
      if (homeCity && homeCity.toLowerCase() === origin.toLowerCase()) return homeLocation();
      return null;
    }

    return homeLocation();
  };

  // The first choice is a live, web-assisted plan for the selected destination.
  // A deterministic sample plan remains available for local development when the
  // AI backend is offline.
  const runCity = async (
    parsed: TripIntent,
    prompt: string,
    preresolved?: Location | null,
    explicitOrigin?: boolean,
  ) => {
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setStage("loading");
    toTop();
    const liveAI = await isAIAvailable(request.signal);
    if (activeRequest.current !== request) return;
    setAiAvailable(liveAI);
    const minDelay = new Promise((resolve) => setTimeout(resolve, liveAI ? 350 : 200));

    let intentToUse = parsed;
    if (liveAI) {
      const draft = await parseIntentAI(prompt, request.signal).catch(() => null);
      if (activeRequest.current !== request) return;
      if (draft) {
        // The city the user typed always wins. Only accept an AI-guessed origin
        // when the user didn't name a place, and never a vague phrase.
        const draftOrigin =
          draft.origin && !isVaguePlace(draft.origin) ? draft.origin : undefined;
        intentToUse = {
          ...parsed,
          origin: explicitOrigin ? parsed.origin : draftOrigin ?? parsed.origin,
          durationHours: draft.durationHours ?? parsed.durationHours,
          durationDays: draft.durationDays ?? parsed.durationDays,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          budget: draft.budget ?? parsed.budget,
          party: draft.party ?? parsed.party,
          interests: draft.interests?.length ? draft.interests : parsed.interests,
          pace: draft.pace ?? parsed.pace,
          transport: draft.transport ?? parsed.transport,
          novelty: draft.novelty ?? parsed.novelty,
        };
      }
    }

    // Resolve coordinates for the destination so the map and AI are global.
    const location = preresolved ?? (await resolveLocation(intentToUse, request.signal));
    if (activeRequest.current !== request) return;
    if (!location) {
      activeRequest.current = null;
      setStage("home");
      setCityAsk({ prompt, mode: intentToUse.mode });
      return;
    }
    intentToUse = { ...intentToUse, location, origin: location.city };
    setDisplayCurrency(location.countryCode);
    setIntent(intentToUse);

    const plan = await generatePlanAI(intentToUse, prompt, request.signal).catch(() => null);
    if (activeRequest.current !== request) return;

    const staticCatalogue = plan?.stops?.length
      ? null
      : await loadStaticCatalogueLocation(location.city, location.country, 30).catch(() => null);
    if (activeRequest.current !== request) return;
    const recommendations = generateRecommendations(intentToUse, staticCatalogue ?? undefined);
    let primary = recommendations[0];
    let usedAI = false;
    if (plan?.stops?.length) {
        const aiItin = buildItineraryFromStops(plan.stops, intentToUse);
        if (aiItin.length >= 3) {
          if (intentToUse.mode === "nearby" && plan.destination?.city) {
            intentToUse = { ...intentToUse, destination: plan.destination.city };
            setIntent(intentToUse);
          }
          const lineItemTotal = aiItin.reduce((s, i) => s + i.estimatedCost, 0);
          // The headline must never read lower than the visible per-stop costs.
          const total = Math.max(lineItemTotal, plan.estimatedBudget ?? 0);
          primary = {
            ...primary,
            title: plan.headline?.trim() || primary.title,
            summary: plan.summary?.trim() || primary.summary,
            whyItFits: plan.whyItFits?.length ? plan.whyItFits : primary.whyItFits,
            tradeoff: plan.tradeoff?.trim() || primary.tradeoff,
            itinerary: aiItin,
            costLow: Math.round(total * 0.95),
            costHigh: Math.round(total * 1.15),
            startTime: aiItin[0].startTime,
            endTime: aiItin[aiItin.length - 1].endTime,
          };
          usedAI = true;
        }
    }

    await minDelay;
    if (activeRequest.current !== request) return;
    // Template variants are useful only for offline city samples. Live plans,
    // nearby escapes and longer trips should remain specific to the actual
    // place and request instead of being recast as Food/Wild/Reset templates.
    const finalRecs = !usedAI && intentToUse.mode === "city"
      ? [primary, ...recommendations.slice(1)]
      : [primary];
    setRecs(finalRecs);
    setSelectedId("primary");
    setItems(primary.itinerary);
    setSavedTripId(null);
    setAiUsed(usedAI);
    setStage("results");
    activeRequest.current = null;

    // Persist the completed, resolved destination search (best-effort).
    if (intentToUse.location) {
      void recordSearch({
        userId: user?.id ?? null,
        query: prompt,
        location: intentToUse.location,
        filters: { interests: intentToUse.interests, pace: intentToUse.pace },
      });
    }
  };

  const plan = async (
    prompt: string,
    mode?: PlannerMode,
    city?: string,
    preresolved?: Location,
  ) => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    const parsed = parseIntent(prompt, mode);
    // Never assume a location. Use an explicit city, one named in the text, or
    // the saved home base; if none of those exist, ask before planning.
    const typedCity = city?.trim();
    const homeCity = profile?.preferences.home?.city ?? profile?.homeCity ?? undefined;
    // A typed city (or a picked result) is an explicit choice the AI must not override.
    const selectedOrigin =
      preresolved?.city || (typedCity && !isVaguePlace(typedCity) ? typedCity : undefined);
    let explicitOrigin = Boolean(selectedOrigin);
    const namedOrigin = parsed.origin && !isVaguePlace(parsed.origin) ? parsed.origin : undefined;
    const nearbyOrigin = selectedOrigin || namedOrigin;
    let origin =
      selectedOrigin ||
      namedOrigin ||
      homeCity;

    // A nearby escape needs an origin to choose a real destination. Ask for
    // it before AI intent parsing so location access has a deterministic fallback.
    if (parsed.mode === "nearby" && !nearbyOrigin) {
      setCityAsk({ prompt, mode });
      return;
    }

    // The local parser is intentionally conservative. Before asking for a
    // location, let the model read natural phrases such as "a day in london".
    if (!origin) {
      const request = new AbortController();
      activeRequest.current = request;
      const liveAI = aiAvailable || (await isAIAvailable(request.signal));
      if (activeRequest.current !== request) return;
      setAiAvailable(liveAI);
      if (liveAI) {
        const draft = await parseIntentAI(prompt, request.signal).catch(() => null);
        if (activeRequest.current !== request) return;
        const modelOrigin =
          draft?.origin && !isVaguePlace(draft.origin) ? draft.origin.trim() : undefined;
        if (modelOrigin && isOriginGrounded(prompt, modelOrigin)) {
          parsed.origin = modelOrigin;
          origin = modelOrigin;
          explicitOrigin = true;
        }
      }
      activeRequest.current = null;
    }

    if (!origin) {
      const promptCity = parseIntent(prompt, mode).origin;
      if (promptCity && !isVaguePlace(promptCity)) {
        origin = promptCity;
        explicitOrigin = true;
      }
    }

    if (!origin) {
      setCityAsk({ prompt, mode });
      return;
    }
    parsed.origin = origin;
    if (preresolved) parsed.location = preresolved;
    setIntent(parsed);
    setView("home");
    if (parsed.mode === "long_trip") {
      setStage("longtrip");
      toTop();
    } else {
      void runCity(parsed, prompt, preresolved, explicitOrigin);
    }
  };

  const buildFromDestination = (d: Destination) => {
    const base = intent ?? parseIntent(`Trip to ${d.name}`);
    const mode = base.mode === "nearby" || base.mode === "long_trip" ? base.mode : "city";
    const durationMatch = d.durationLabel.match(/(\d+)/);
    const isHalfDay = /half day/i.test(d.durationLabel);
    const isOvernight = /overnight/i.test(d.durationLabel);
    const durationDays =
      mode === "long_trip"
        ? base.durationDays ?? Math.max(1, Number(durationMatch?.[1] ?? 3))
        : isOvernight
          ? 2
          : undefined;
    const parsed: TripIntent = {
      ...base,
      origin: d.name,
      destination: d.name,
      mode,
      durationDays,
      durationHours: durationDays ? undefined : isHalfDay ? 6 : 12,
      transport: mode === "nearby" ? "car" : mode === "long_trip" ? "mixed" : base.transport,
      raw: `${mode === "nearby" ? "Nearby escape" : "Longer trip"} to ${d.name}. ${d.durationLabel}. ${d.travelLabel}.`,
    };
    setIntent(parsed);
    void runCity(parsed, parsed.raw, null, true);
  };

  const selectRec = (rec: Recommendation) => {
    setSelectedId(rec.id);
    setItems(rec.itinerary);
    setSavedTripId(null);
    toTop();
  };

  const refineLabels: Record<RefineAction, string> = {
    cheaper: "Make the whole plan cheaper while keeping it worthwhile",
    slower: "Make the day slower and more relaxed",
    more_food: "Add more strong local food experiences",
    more_adventure: "Make the plan more adventurous and unexpected",
    less_driving: "Reduce driving and keep the route compact and walkable",
    more_local: "Replace touristy choices with places locals genuinely use",
  };

  const fallbackActionFor = (text: string): RefineAction => {
    const value = text.toLowerCase();
    if (/cheap|budget|less money/.test(value)) return "cheaper";
    if (/slow|relax|chill|less/.test(value)) return "slower";
    if (/food|eat|lunch|dinner/.test(value)) return "more_food";
    if (/adventure|wild|new|exciting/.test(value)) return "more_adventure";
    if (/driv|walk|transport/.test(value)) return "less_driving";
    return "more_local";
  };

  const refineWithAI = async (
    instruction: string,
    fallbackAction: RefineAction,
    settingsOverride?: Partial<Pick<TripIntent, "budget" | "durationHours" | "durationDays" | "startTime" | "endTime">>,
    fallback?: () => void,
  ) => {
    if (!intent?.location) {
      if (settingsOverride && intent) setIntent({ ...intent, ...settingsOverride });
      if (fallback) fallback();
      else setItems((previous) => refineItinerary(previous, fallbackAction));
      return;
    }

    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setRefining(true);
    const currentPlan = items
      .map((item) => `${item.startTime} ${item.place} (${item.estimatedCost})`)
      .join("; ");
    const modelRequest = [
      intent.raw,
      `Current itinerary: ${currentPlan}.`,
      `Requested change: ${instruction}.`,
      "Revise the full itinerary around this request. Keep good existing stops where they still fit.",
    ].join(" ").slice(0, 4_000);
    const revisedIntent = settingsOverride ? { ...intent, ...settingsOverride } : intent;
    const plan = await generatePlanAI(revisedIntent, modelRequest, request.signal).catch(() => null);
    if (activeRequest.current !== request) return;

    if (plan?.stops?.length) {
      const revised = buildItineraryFromStops(plan.stops, revisedIntent);
      if (revised.length >= 3) {
        const lineItemTotal = revised.reduce((sum, item) => sum + item.estimatedCost, 0);
        const total = Math.max(lineItemTotal, plan.estimatedBudget ?? 0);
        setItems(revised);
        setRecs((previous) =>
          previous.map((recommendation) =>
            recommendation.id === selectedId
              ? {
                  ...recommendation,
                  title: plan.headline?.trim() || recommendation.title,
                  summary: plan.summary?.trim() || recommendation.summary,
                  whyItFits: plan.whyItFits?.length
                    ? plan.whyItFits
                    : recommendation.whyItFits,
                  tradeoff: plan.tradeoff?.trim() || recommendation.tradeoff,
                  itinerary: revised,
                  costLow: Math.round(total * 0.95),
                  costHigh: Math.round(total * 1.15),
                  startTime: revised[0].startTime,
                  endTime: revised[revised.length - 1].endTime,
                }
              : recommendation,
          ),
        );
        if (settingsOverride) setIntent(revisedIntent);
        setAiUsed(true);
        setRefining(false);
        activeRequest.current = null;
        return;
      }
    }

    if (settingsOverride) setIntent(revisedIntent);
    if (fallback) fallback();
    else setItems((previous) => refineItinerary(previous, fallbackAction));
    setRefining(false);
    activeRequest.current = null;
  };

  const refine = (action: RefineAction) => {
    void refineWithAI(refineLabels[action], action);
  };

  const swapItem = (id: string) => {
    if (!intent) return;
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const instruction =
      `Replace only ${current.place} with a genuinely different ${current.type} stop. ` +
      "Keep every other stop where practical, and return the replacement's real coordinates so the route updates.";
    setSwappingId(id);
    void refineWithAI(instruction, "more_local", undefined, () => {
      setItems((previous) => swapStop(previous, id, intent));
    }).finally(() => setSwappingId(null));
  };

  const applyTripSettings = (
    settings: { budget: number; durationDays: number; startTime: string; endTime: string },
    note?: string,
  ) => {
    const duration = `${settings.durationDays} days`;
    const startTime = settings.startTime;
    const endTime = settings.endTime;
    const schedule = ` Schedule each day from ${startTime} to ${endTime}.`;
    const budget = ` Set the total per-person budget to ${settings.budget} in the requested local currency.`;
    const extra = note ? ` Also: ${note}` : "";
    void refineWithAI(
      `Set the trip duration to ${duration}.${schedule}${budget}${extra} Rebuild the itinerary so the activity count, pacing, costs and logistics fit exactly.`,
      note ? fallbackActionFor(note) : "slower",
      { ...settings, startTime, endTime, durationHours: hoursBetween(startTime, endTime) },
    );
  };

  const freeform = async (text: string) => {
    await refineWithAI(text, fallbackActionFor(text));
  };

  const persistTrip = useCallback(async () => {
    if (!user || !selected || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await tripsService.create(user.id, {
        title: selected.title,
        mode: intent?.mode ?? "city",
        origin: intent?.destination ?? intent?.location?.city ?? intent?.origin ?? selected.title,
        city: intent?.location?.city,
        country: intent?.location?.country,
        countryCode: intent?.location?.countryCode,
        latitude: intent?.location?.latitude,
        longitude: intent?.location?.longitude,
        image: selected.image,
        costLow: selected.costLow,
        costHigh: selected.costHigh,
        startTime: items[0]?.startTime ?? selected.startTime,
        endTime: items[items.length - 1]?.endTime ?? selected.endTime,
        itinerary: items,
        aiModel: aiUsed ? aiLabel : undefined,
      });
      setSavedTripId(saved.id);
    } catch {
      setSaveError("We couldn't save this sidequest right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [user, selected, intent, items, aiUsed, saving]);

  const saveTrip = () => {
    if (!user) {
      setAuthReason("Create an account to save this sidequest and come back to it.");
      setPendingSave(true);
      setAuthOpen(true);
      return;
    }
    void persistTrip();
  };

  const openSavedTrip = (trip: SavedTrip) => {
    const parsed = parseIntent(`Saved sidequest in ${trip.origin}`, "city");
    parsed.origin = trip.city ?? trip.origin;
    if (
      trip.city &&
      trip.latitude !== undefined &&
      trip.longitude !== undefined
    ) {
      parsed.location = {
        city: trip.city,
        country: trip.country ?? "",
        countryCode: trip.countryCode,
        latitude: trip.latitude,
        longitude: trip.longitude,
      };
      setDisplayCurrency(trip.countryCode);
    }
    const recommendation: Recommendation = {
      id: `saved-${trip.id}`,
      title: trip.title,
      badge: "Saved sidequest",
      summary: `Your saved plan for ${trip.origin}.`,
      image: trip.image,
      costLow: trip.costLow,
      costHigh: trip.costHigh,
      startTime: trip.startTime,
      endTime: trip.endTime,
      pace: "Saved plan",
      whyItFits: ["Saved to your account", "Ready when you are"],
      tradeoff: "",
      score: {
        overall: 100,
        moodFit: 100,
        timeFit: 100,
        budgetFit: 100,
        travelEffort: 100,
        activityFit: 100,
        novelty: 100,
      },
      itinerary: trip.itinerary,
    };
    setIntent(parsed);
    setRecs([recommendation]);
    setSelectedId(recommendation.id);
    setItems(trip.itinerary);
    setSavedTripId(trip.id);
    setView("home");
    setStage("results");
    toTop();
  };

  // Once the user finishes authenticating, complete a save they'd requested.
  useEffect(() => {
    if (user && pendingSave) {
      setPendingSave(false);
      void persistTrip();
    }
  }, [user, pendingSave, persistTrip]);

  const onAuthClose = () => {
    setAuthOpen(false);
  };

  const goHome = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setView("home");
    setStage("home");
    setIntent(null);
    toTop();
  };

  const navigate = (v: View) => {
    setView(v);
    if (v === "home") goHome();
    else toTop();
  };

  // Bring the user home, then scroll a section into view (and focus it).
  const jumpHome = (selector: string, focus = false) => {
    setView("home");
    setStage("home");
    setIntent(null);
    setTimeout(() => {
      const el = document.querySelector(selector);
      if (!el) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: focus ? "center" : "start" });
      if (focus) {
        const input = el.querySelector("textarea");
        (input as HTMLTextAreaElement | null)?.focus();
      }
    }, 60);
  };

  const goExplore = () => jumpHome("#explore");
  const goPlan = () => jumpHome(".planner", true);

  const showResults = view === "home" && stage === "results" && intent && selected;
  const overHero = view === "home" && stage === "home";

  return (
    <div className={`app${overHero ? "" : " app--offset"}`}>
      <Navigation
        view={view}
        onNavigate={navigate}
        onAuth={() => setAuthOpen(true)}
        onExplore={goExplore}
        onPlan={goPlan}
        overHero={overHero}
      />

      {view === "saved" && <MySidequests onStart={goHome} onOpen={openSavedTrip} />}
      {view === "profile" && <Profile />}
      {view === "admin" && <AdminPanel />}

      {view === "home" && stage === "home" && (
        <>
          <Hero onPlan={plan} />
          <ExplorePreview onPick={(p, mode) => plan(p, mode ?? "city")} />
          <Marketing />
        </>
      )}

      {view === "home" && stage === "loading" && <Loading />}

      {view === "home" && stage === "longtrip" && (
        <main className="container page">
          <PageHead
            eyebrow="Go somewhere"
            title="Places worth the journey."
            onBack={goHome}
          />
          <DestinationGrid
            title="Your shortlist"
            subtitle="Pick one and we'll build the whole trip."
            destinations={LONG_TRIP_DESTINATIONS}
            onBuild={buildFromDestination}
          />
        </main>
      )}

      {showResults && (
        <main className="container results">
          <div className="results__head">
            <div>
              <p className="eyebrow">{intent!.destination ?? intent!.origin}</p>
              <h2 className="results__title">Here's what we'd do.</h2>
            </div>
            <div className="results__head-right">
              <button className="link-btn" onClick={goHome}>
                Start over
              </button>
            </div>
          </div>

          <IntentSummary intent={intent!} onEdit={goHome} />
          <RecommendationHero
            rec={selected!}
            context={intent!.destination ?? intent!.location?.city ?? intent!.origin}
          />
          <Itinerary
            title={
              (intent!.durationDays ?? 1) > 1
                ? `Your ${intent!.durationDays}-day sidequest`
                : intent!.durationHours && intent!.durationHours <= 6
                ? "Your evening sidequest"
                : "Your day sidequest"
            }
            items={items}
            onSwap={swapItem}
            swappingId={swappingId}
            onSave={saveTrip}
            saved={!!savedTripId}
            saving={saving}
            saveError={saveError}
            context={intent!.destination ?? intent!.location?.city ?? intent!.origin}
          />
          <RefinementBar
            onRefine={refine}
            onFreeform={freeform}
            onApplySettings={applyTripSettings}
            budget={items.reduce((sum, item) => sum + item.estimatedCost, 0)}
            mode={intent!.mode}
            durationDays={intent!.durationDays}
            startTime={intent!.startTime}
            endTime={intent!.endTime}
            busy={refining}
          />
          <Alternatives
            alternatives={recs.filter((r) => r.id !== selectedId)}
            onSelect={selectRec}
            context={intent!.location?.city ?? intent!.origin}
          />
        </main>
      )}

      <Footer />

      {authOpen && <AuthModal onClose={onAuthClose} reason={authReason} />}
      {cityAsk && (
        <CityPrompt
          onClose={() => setCityAsk(null)}
          onConfirm={(city, location) => {
            const pending = cityAsk;
            setCityAsk(null);
            plan(pending.prompt, pending.mode, city, location);
          }}
        />
      )}
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="results__head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="results__title">{title}</h2>
      </div>
      <button className="link-btn" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Marketing() {
  const steps = [
    { n: "01", t: "Say what you want", d: "In your own words: time, budget, mood, whoever you're with." },
    { n: "02", t: "Get real choices, fast", d: "One clear best pick and genuinely different alternatives." },
    { n: "03", t: "Build, tweak, go", d: "A validated itinerary on a map you can make your own, then save it." },
  ];
  const r = useReveal();
  return (
    <section className="how">
      <div className="container">
        <p className="eyebrow" style={{ textAlign: "center" }}>
          How it works
        </p>
        <h2 className="how__title">
          Not more places to research.
          <br />A decision you can act on.
        </h2>
        <div className={`how__grid ${r.className}`} ref={r.ref}>
          {steps.map((s) => (
            <div key={s.n} className="how__step">
              <span className="how__n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CONTACT: string = "get.in.touch.sidequest@gmail.com";

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <b>SIDEQUEST</b>
          <span>Make your free time an adventure.</span>
        </div>

        <div className="footer__contact" aria-label="Support contact information">
          <span className="footer__contact-label">Support</span>
          <a className="footer__contact-email" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
        </div>

        <div className="footer__cols">
          <a href="#explore">Explore</a>
          <a href="#explore">Plan</a>
          <a href={`mailto:${CONTACT}`}>Contact</a>
        </div>
      </div>
    </footer>
  );
}
