import { useRef, useState } from "react";
import type { Location } from "../types/location";
import { detectCurrentLocation, searchLocations } from "../services/locations";
import { Icon } from "./Icon";

// Shown when a plan is requested but no city was given. We never guess a
// location: we ask, then resolve it globally via the geocoder. To keep this
// low-effort, we also offer one-tap detection from the browser's geolocation.
export function CityPrompt({
  onClose,
  onConfirm,
  reason,
}: {
  onClose: () => void;
  onConfirm: (city: string, location?: Location) => void;
  reason?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const searchRef = useRef<AbortController | null>(null);

  const runSearch = async (q: string) => {
    setQuery(q);
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

  const detectLocation = async () => {
    setLocateError(null);
    setLocating(true);
    try {
      const here = await detectCurrentLocation();
      if (here.city) {
        onConfirm(here.city, here);
        return;
      }
      setLocateError("We couldn't name your location. Try searching instead.");
    } catch {
      setLocateError("Location access was blocked. Search for a city instead.");
    } finally {
      setLocating(false);
    }
  };

  const confirm = (city: string, location?: Location) => {
    const value = city.trim();
    if (!value) return;
    onConfirm(value, location);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal citymodal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <div className="citymodal__body">
          <span className="eyebrow">One quick thing</span>
          <h3 className="citymodal__title">Which city is this for?</h3>
          <p className="citymodal__lede">
            {reason ??
              "Tell us where you are and we'll build a real, mapped plan for that place."}
          </p>
          <button
            className="btn btn--ghost citymodal__locate"
            onClick={() => void detectLocation()}
            disabled={locating}
          >
            <Icon name="pin" size={16} />
            {locating ? "Finding you..." : "Use my current location"}
          </button>
          {locateError && <p className="citymodal__error">{locateError}</p>}
          <div className="citymodal__or">or search</div>
          <label className="field">
            <input
              autoFocus
              value={query}
              onChange={(e) => void runSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm(query);
                }
              }}
              placeholder="Search a city, e.g. Lisbon, Tokyo, Mexico City"
              autoComplete="off"
            />
          </label>
          {results.length > 0 && (
            <div className="pill-wrap citymodal__results">
              {results.map((r) => (
                <button
                  key={`${r.latitude},${r.longitude}`}
                  className="pill"
                  onClick={() => confirm(r.city, r)}
                >
                  {r.city}
                  {r.country ? `, ${r.country}` : ""}
                </button>
              ))}
            </div>
          )}
          <button
            className="btn btn--accent btn--lg citymodal__go"
            onClick={() => confirm(query)}
            disabled={!query.trim()}
          >
            Build my plan <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
