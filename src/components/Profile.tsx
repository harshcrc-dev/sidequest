import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchLocations } from "../services/locations";
import type { Location } from "../types/location";
import type { Pace } from "../types";

const INTERESTS = [
  "Food", "Coffee", "Nature", "Culture", "Nightlife",
  "Adventure", "Romantic", "Shopping", "Wellness", "Photography",
];

const PACES: { key: Pace; label: string; hint: string }[] = [
  { key: "slow", label: "Slow", hint: "2 to 4 things a day" },
  { key: "balanced", label: "Balanced", hint: "4 to 6 things a day" },
  { key: "packed", label: "Packed", hint: "Maximise it" },
];

const BUDGETS = ["budget", "moderate", "premium"];
const STYLES = ["relaxed", "balanced", "adventure"];
const DURATIONS = ["a few hours", "a full day", "a weekend", "a longer trip"];

export function Profile() {
  const { user, profile, saveProfile } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const prefs = profile?.preferences ?? {};
  const [interests, setInterests] = useState<string[]>(prefs.interests ?? []);
  const [pace, setPace] = useState<Pace>(prefs.pace ?? "balanced");
  const [budget, setBudget] = useState<string>(prefs.budget ?? "moderate");
  const [style, setStyle] = useState<string>(prefs.travelStyle ?? "balanced");
  const [duration, setDuration] = useState<string>(prefs.tripDuration ?? "a full day");

  const [homeQuery, setHomeQuery] = useState(profile?.homeCity ?? "");
  const [home, setHome] = useState<Location | null>(
    profile?.homeCity
      ? {
          city: profile.homeCity,
          country: profile.homeCountry ?? "",
          latitude: profile.homeLat ?? 0,
          longitude: profile.homeLng ?? 0,
        }
      : null,
  );
  const [results, setResults] = useState<Location[]>([]);
  const searchRef = useRef<AbortController | null>(null);

  // Re-sync local state when the profile loads/changes.
  useEffect(() => {
    if (!profile) return;
    const p = profile.preferences ?? {};
    setInterests(p.interests ?? []);
    setPace(p.pace ?? "balanced");
    setBudget(p.budget ?? "moderate");
    setStyle(p.travelStyle ?? "balanced");
    setDuration(p.tripDuration ?? "a full day");
    setHomeQuery(profile.homeCity ?? "");
  }, [profile]);

  const label = useMemo(
    () => (home ? `${home.city}${home.country ? `, ${home.country}` : ""}` : ""),
    [home],
  );

  if (!user) return null;

  const toggle = (i: string) =>
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const runSearch = async (q: string) => {
    setHomeQuery(q);
    setHome(null);
    searchRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    searchRef.current = controller;
    try {
      const found = await searchLocations(q, controller.signal);
      if (!controller.signal.aborted) setResults(found);
    } catch {
      setResults([]);
    }
  };

  const pickHome = (loc: Location) => {
    setHome(loc);
    setHomeQuery(`${loc.city}${loc.country ? `, ${loc.country}` : ""}`);
    setResults([]);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveProfile({
        homeCity: home?.city ?? null,
        homeCountry: home?.country ?? null,
        homeLat: home?.latitude ?? null,
        homeLng: home?.longitude ?? null,
        onboardingCompleted: true,
        preferences: {
          interests,
          pace,
          budget,
          travelStyle: style,
          tripDuration: duration,
          home: home ?? undefined,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container page">
      <div className="page__head">
        <div>
          <p className="eyebrow">Your profile</p>
          <h1 className="page__title">{user.name}</h1>
          <span className="profile__email">{user.email}</span>
        </div>
        <div className="profile__avatar">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name.charAt(0).toUpperCase()}
        </div>
      </div>

      <section className="panel">
        <h3>Where are you based?</h3>
        <p className="panel__hint">
          Your home base for plans close by. Search any city, anywhere in the world.
        </p>
        <label className="field">
          <input
            value={homeQuery}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search a city, e.g. Lisbon, Tokyo, Nairobi"
            autoComplete="off"
          />
        </label>
        {results.length > 0 && (
          <div className="pill-wrap">
            {results.map((r) => (
              <button
                key={`${r.latitude},${r.longitude}`}
                className="pill"
                onClick={() => pickHome(r)}
              >
                {r.city}
                {r.country ? `, ${r.country}` : ""}
              </button>
            ))}
          </div>
        )}
        {label && <p className="panel__hint">Home base: {label}</p>}
      </section>

      <section className="panel">
        <h3>Your travel style</h3>
        <p className="panel__hint">We'll weight future recommendations toward these.</p>
        <div className="pill-wrap">
          {INTERESTS.map((i) => (
            <button
              key={i}
              className={`pill${interests.includes(i) ? " on" : ""}`}
              onClick={() => toggle(i)}
            >
              {i}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Your pace</h3>
        <div className="pace-row">
          {PACES.map((p) => (
            <button
              key={p.key}
              className={`pace-card${pace === p.key ? " on" : ""}`}
              onClick={() => setPace(p.key)}
            >
              <b>{p.label}</b>
              <span>{p.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Defaults</h3>
        <p className="panel__hint">Budget, style and how long you usually have.</p>
        <div className="pill-wrap">
          {BUDGETS.map((b) => (
            <button
              key={b}
              className={`pill${budget === b ? " on" : ""}`}
              onClick={() => setBudget(b)}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="pill-wrap">
          {STYLES.map((s) => (
            <button
              key={s}
              className={`pill${style === s ? " on" : ""}`}
              onClick={() => setStyle(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="pill-wrap">
          {DURATIONS.map((d) => (
            <button
              key={d}
              className={`pill${duration === d ? " on" : ""}`}
              onClick={() => setDuration(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="auth__error">{error}</div>}

      <button className="btn btn--dark btn--lg" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : saved ? "✓ Saved" : "Save preferences"}
      </button>
    </main>
  );
}
