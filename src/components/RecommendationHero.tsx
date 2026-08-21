import type { Recommendation } from "../types";
import { Icon } from "./Icon";
import { PlaceImage } from "./PlaceImage";
import { moneyRange } from "../lib/format";

function range(a: number, b: number) {
  return moneyRange(a, b);
}

export function RecommendationHero({
  rec,
  context,
}: {
  rec: Recommendation;
  context?: string;
}) {
  return (
    <article className="rec rec--enter">
      <div className="rec__media">
        <PlaceImage
          place={rec.itinerary[0]?.place ?? rec.title}
          alt={rec.title}
          className="rec__img"
          eager
          fallbackSrc={rec.itinerary[0]?.image ?? rec.image}
          context={context}
        />
        <div className="rec__scrim" />
        <span className="rec__badge">{rec.badge}</span>
        <div className="rec__score">
          <b>{rec.score.overall}</b>
          <small>Match</small>
        </div>
        <div className="rec__media-text">
          <span className="eyebrow" style={{ color: "rgba(255,255,255,0.8)" }}>
            Here's what we'd do
          </span>
          <h3>{rec.title}</h3>
        </div>
      </div>

      <div className="rec__body">
        <p className="rec__summary">{rec.summary}</p>

        <div className="rec__cols">
          <div className="why">
            <h4>Why it fits</h4>
            <ul>
              {rec.whyItFits.map((w) => (
                <li key={w}>
                  <Icon name="check" size={16} />
                  {w}
                </li>
              ))}
            </ul>
          </div>
          <div className="tradeoff">
            <h4>The trade-off</h4>
            <p>{rec.tradeoff}</p>
            <div className="scorebars">
              {(
                [
                  ["Mood", rec.score.moodFit],
                  ["Time", rec.score.timeFit],
                  ["Budget", rec.score.budgetFit],
                  ["Novelty", rec.score.novelty],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="scorebar">
                  <span>{label}</span>
                  <i>
                    <b style={{ width: `${val}%` }} />
                  </i>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rec__meta">
          <span>
            <Icon name="rupee" size={17} />
            <small>Estimated</small>
            <b>{range(rec.costLow, rec.costHigh)}</b>
          </span>
          <span>
            <Icon name="clock" size={17} />
            <small>Window</small>
            <b>
              {rec.startTime} to {rec.endTime}
            </b>
          </span>
          <span>
            <Icon name="bolt" size={17} />
            <small>Pace</small>
            <b>{rec.pace}</b>
          </span>
        </div>
      </div>
    </article>
  );
}
