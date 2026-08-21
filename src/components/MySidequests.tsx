import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { tripsService } from "../services/trips";
import type { SavedTrip } from "../types";
import { Img } from "./Img";
import { Icon } from "./Icon";

const TABS: { key: SavedTrip["status"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "completed", label: "Completed" },
];

const RATINGS: { key: NonNullable<SavedTrip["feedback"]>["rating"]; emoji: string; label: string }[] = [
  { key: "loved", emoji: "❤️", label: "Loved it" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "fine", emoji: "😐", label: "Fine" },
  { key: "no", emoji: "👎", label: "Not for me" },
];

export function MySidequests({
  onStart,
  onOpen,
}: {
  onStart: () => void;
  onOpen: (trip: SavedTrip) => void;
}) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [tab, setTab] = useState<SavedTrip["status"] | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      setTrips(await tripsService.list(user.id));
    } catch {
      setError("We couldn't load your sidequests right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user) return null;

  const filtered = tab === "all" ? trips : trips.filter((t) => t.status === tab);

  const rate = async (id: string, rating: NonNullable<SavedTrip["feedback"]>["rating"]) => {
    try {
      await tripsService.setFeedback(user.id, id, { rating });
      await refresh();
    } catch {
      setError("We couldn't save your rating right now. Please try again.");
    }
  };

  const remove = async (id: string) => {
    try {
      await tripsService.remove(user.id, id);
      await refresh();
    } catch {
      setError("We couldn't remove that sidequest right now. Please try again.");
    }
  };

  return (
    <main className="container page">
      <div className="page__head">
        <div>
          <p className="eyebrow">Hi {user.name}</p>
          <h1 className="page__title">My sidequests</h1>
        </div>
        <button className="btn btn--accent btn--lg" onClick={onStart}>
          Plan a new one <Icon name="arrow" size={17} />
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="auth__error">{error}</div>}

      {loading ? (
        <div className="empty">
          <h3>Loading your sidequests…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__art" aria-hidden>
            <Icon name="sparkles" size={30} />
          </div>
          <h3>Nothing here yet.</h3>
          <p>Plan a sidequest and save it, and it'll show up right here.</p>
          <button className="btn btn--dark btn--lg" onClick={onStart}>
            Start a sidequest
          </button>
        </div>
      ) : (
        <div className="trip-grid">
          {filtered.map((t) => (
            <article key={t.id} className="trip">
              <div className="trip__media">
                <Img src={t.image} alt={t.title} className="trip__img" />
                <span className="trip__status">{t.status}</span>
              </div>
              <div className="trip__body">
                <h3>{t.title}</h3>
                <span className="trip__meta">
                  {t.origin} · {t.startTime} → {t.endTime}
                </span>

                {t.feedback ? (
                  <div className="trip__rated">
                    You rated this{" "}
                    {RATINGS.find((r) => r.key === t.feedback!.rating)?.emoji}{" "}
                    {RATINGS.find((r) => r.key === t.feedback!.rating)?.label}
                  </div>
                ) : (
                  <div className="trip__rate">
                    <span>How was it?</span>
                    <div>
                      {RATINGS.map((r) => (
                        <button key={r.key} title={r.label} onClick={() => void rate(t.id, r.key)}>
                          {r.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button className="btn btn--forest btn--full" onClick={() => onOpen(t)}>
                  Open sidequest <Icon name="arrow" size={15} />
                </button>

                <button className="link-btn danger" onClick={() => void remove(t.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
