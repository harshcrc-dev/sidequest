import { useEffect, useState } from "react";
import type { ItineraryItem } from "../types";
import { Icon, type IconName } from "./Icon";
import { MiniMap } from "./MiniMap";
import { getPlaceDescription, PlaceImage } from "./PlaceImage";
import { money } from "../lib/format";

const TYPE_LABEL: Record<ItineraryItem["type"], string> = {
  food: "Food",
  activity: "Activity",
  culture: "Culture",
  nature: "Nature",
  shopping: "Shopping",
  nightlife: "Nightlife",
  transport: "Transport",
  rest: "Rest",
};

const TYPE_ICON: Record<ItineraryItem["type"], IconName> = {
  food: "food",
  activity: "bolt",
  culture: "palette",
  nature: "leaf",
  shopping: "bag",
  nightlife: "moon",
  transport: "car",
  rest: "coffee",
};

function routeIcon(mode: string): IconName {
  return mode === "walk" ? "walk" : mode === "transit" ? "route" : "car";
}

function routeLabel(mode: string) {
  return mode === "walk" ? "walk" : mode === "drive" ? "drive" : mode === "transit" ? "transit" : "ride";
}

function PlaceDescription({ place, fallback, context }: { place: string; fallback: string; context?: string }) {
  const [description, setDescription] = useState(fallback);
  useEffect(() => {
    let active = true;
    setDescription(fallback);
    void getPlaceDescription(place, context).then((summary) => {
      if (active && summary) setDescription(summary);
    });
    return () => {
      active = false;
    };
  }, [place, fallback, context]);
  return <div className="tl-card__desc">{description}</div>;
}

export function Itinerary({
  title,
  items,
  onSwap,
  swappingId,
  onSave,
  saved,
  saving,
  saveError,
  context,
}: {
  title: string;
  items: ItineraryItem[];
  onSwap: (id: string) => void;
  swappingId?: string | null;
  onSave: () => void;
  saved: boolean;
  saving?: boolean;
  saveError?: string;
  context?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "map">("list");
  const total = items.reduce((s, i) => s + i.estimatedCost, 0);

  return (
    <section className="itin">
      <div className="itin__head">
        <div>
          <h2 className="section-title">{title}</h2>
          <span className="itin__sub">
            {items.length} stops · {items[0]?.startTime} → {items[items.length - 1]?.endTime}
          </span>
        </div>
        <div className="seg">
          <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
            List
          </button>
          <button className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>
            Map
          </button>
        </div>
      </div>

      <div className={`itin__layout ${tab}`}>
        <div className="timeline">
          {items.map((item, n) => (
            <div key={item.id}>
              {item.day && (n === 0 || items[n - 1].day !== item.day) && (
                <div className="itin__day">Day {item.day}</div>
              )}
              <div
                className={`tl-item${active === item.id ? " on" : ""}`}
                onMouseEnter={() => setActive(item.id)}
                onMouseLeave={() => setActive(null)}
              >
                <div className="tl-time">
                  <span className="tl-num">{n + 1}</span>
                  {item.startTime}
                </div>
                <div className="tl-card">
                  <div className="tl-thumb">
                    <PlaceImage
                      place={item.place}
                      alt={item.place}
                      className="tl-img"
                      fallbackSrc={item.image}
                      context={context}
                    />
                  </div>
                  <div className="tl-main">
                    <span className="tl-badge">
                      <Icon name={TYPE_ICON[item.type]} size={13} />
                      {TYPE_LABEL[item.type]}
                    </span>
                    <div className="tl-card__title">{item.title}</div>
                    <div className="tl-card__place">
                      <Icon name="pin" size={13} />
                      {item.place}
                    </div>
                    <PlaceDescription place={item.place} fallback={item.description} context={context} />
                    <button
                      className="tl-swap"
                      onClick={() => onSwap(item.id)}
                      disabled={Boolean(swappingId)}
                    >
                      <Icon name="swap" size={14} />
                      {swappingId === item.id ? "Updating..." : "Swap"}
                    </button>
                  </div>
                  <div className="tl-card__side">
                    <div className="tl-card__cost">
                      {item.estimatedCost === 0 ? "Free" : money(item.estimatedCost)}
                    </div>
                    <div className="tl-card__dur">{item.durationMinutes} min</div>
                  </div>
                </div>
              </div>
              {item.routeToNext && (
                <div className="tl-route">
                  <Icon name={routeIcon(item.routeToNext.mode)} size={15} />
                  {item.routeToNext.durationMinutes} min {routeLabel(item.routeToNext.mode)} ·{" "}
                  {item.routeToNext.distanceKm} km
                </div>
              )}
            </div>
          ))}
        </div>

        <aside className="itin__map">
          <MiniMap items={items} activeId={active} onHover={setActive} />
        </aside>
      </div>

      <div className="budget">
        <div className="budget__left">
          <b>{money(total)}</b>
          <small>Estimated total for the day</small>
        </div>
        <button
          className={`btn btn--forest btn--lg${saved ? " is-saved" : ""}`}
          onClick={onSave}
          disabled={saved || saving}
        >
          {saved ? (
            <>
              <Icon name="check" size={18} /> Saved to your sidequests
            </>
          ) : saving ? (
            <>Saving…</>
          ) : (
            <>
              <Icon name="heart" size={18} /> Save this sidequest
            </>
          )}
        </button>
      </div>
      {saveError && <div className="auth__error">{saveError}</div>}
    </section>
  );
}
