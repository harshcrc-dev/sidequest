import type { Destination } from "../types";
import { Icon } from "./Icon";
import { PlaceImage } from "./PlaceImage";
import { useTilt } from "../hooks/useTilt";

export function DestinationGrid({
  title,
  subtitle,
  destinations,
  onBuild,
}: {
  title: string;
  subtitle: string;
  destinations: Destination[];
  onBuild: (d: Destination) => void;
}) {
  return (
    <section className="dest">
      <div className="dest__head">
        <h2 className="section-title">{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="dest__grid">
        {destinations.map((d) => (
          <DCard key={d.id} d={d} onBuild={onBuild} />
        ))}
      </div>
    </section>
  );
}

function DCard({ d, onBuild }: { d: Destination; onBuild: (d: Destination) => void }) {
  const tilt = useTilt<HTMLElement>(7);
  return (
    <article
      className="dcard tilt"
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
            <div className="dcard__media">
              <PlaceImage place={d.name} alt={d.name} className="dcard__img" />
              <div className="dcard__scrim" />
              <span className="dcard__badge">{d.badge}</span>
              <div className="dcard__title">
                <h3>{d.name}</h3>
                <span>{d.region}</span>
              </div>
            </div>
            <div className="dcard__body">
              <div className="dcard__tags">
                {d.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="dcard__facts">
                <span>
                  <Icon name="clock" size={16} />
                  <small>Length</small>
                  <b>{d.durationLabel}</b>
                </span>
                <span>
                  <Icon name="rupee" size={16} />
                  <small>Budget</small>
                  <b>{d.budgetLabel}</b>
                </span>
                <span>
                  <Icon name="car" size={16} />
                  <small>Getting there</small>
                  <b>{d.travelLabel}</b>
                </span>
              </div>
              {d.highlights && d.highlights.length > 0 && (
                <ul className="dcard__highlights">
                  {d.highlights.map((h) => (
                    <li key={h}>
                      <Icon name="check" size={15} />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              {(d.bestTime || d.idealFor) && (
                <div className="dcard__meta">
                  {d.bestTime && (
                    <span>
                      <Icon name="calendar" size={15} />
                      {d.bestTime}
                    </span>
                  )}
                  {d.idealFor && (
                    <span>
                      <Icon name="users" size={15} />
                      {d.idealFor}
                    </span>
                  )}
                </div>
              )}
              <p className="dcard__why">
                <b>Why go.</b> {d.why}
              </p>
              <p className="dcard__trade">
                <b>Trade-off.</b> {d.tradeoff}
              </p>
              <button className="btn btn--dark btn--full" onClick={() => onBuild(d)}>
                Build this sidequest
                <Icon name="arrow" size={17} />
              </button>
            </div>
    </article>
  );
}
