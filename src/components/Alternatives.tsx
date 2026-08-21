import type { Recommendation } from "../types";
import { Icon } from "./Icon";
import { PlaceImage } from "./PlaceImage";
import { useTilt } from "../hooks/useTilt";
import { moneyRange } from "../lib/format";

function range(a: number, b: number) {
  return moneyRange(a, b);
}

export function Alternatives({
  alternatives,
  onSelect,
  context,
}: {
  alternatives: Recommendation[];
  onSelect: (rec: Recommendation) => void;
  context?: string;
}) {
  if (alternatives.length === 0) return null;
  return (
    <section className="alts">
      <h2 className="section-title">Or take one of these.</h2>
      <div className="alt-grid">
        {alternatives.map((a) => (
          <AltCard key={a.id} rec={a} onSelect={onSelect} range={range} context={context} />
        ))}
      </div>
    </section>
  );
}

function AltCard({
  rec: a,
  onSelect,
  range,
  context,
}: {
  rec: Recommendation;
  onSelect: (r: Recommendation) => void;
  range: (x: number, y: number) => string;
  context?: string;
}) {
  const tilt = useTilt<HTMLButtonElement>(9);
  return (
    <button
      className="alt tilt"
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      onClick={() => onSelect(a)}
    >
      <div className="alt__media">
        <PlaceImage
          place={a.itinerary[0]?.place ?? a.title}
          alt={a.title}
          className="alt__img"
          context={context}
          fallbackSrc={a.itinerary[0]?.image ?? a.image}
        />
        <span className="alt__badge">{a.badge}</span>
      </div>
      <div className="alt__body">
        <div className="alt__title">{a.title}</div>
        <p className="alt__summary">{a.summary}</p>
        <div className="alt__meta">
          <span>
            <Icon name="rupee" size={14} />
            {range(a.costLow, a.costHigh)}
          </span>
          <span>
            <Icon name="clock" size={14} />
            {a.startTime} to {a.endTime}
          </span>
        </div>
        <span className="alt__cta">
          Switch to this
          <Icon name="arrow" size={15} />
        </span>
      </div>
    </button>
  );
}
