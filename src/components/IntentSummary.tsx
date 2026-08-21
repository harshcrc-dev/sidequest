import type { TripIntent } from "../types";
import { money as fmtMoney } from "../lib/format";

function money(n?: number) {
  if (!n) return null;
  return fmtMoney(n);
}

const PARTY_LABEL: Record<TripIntent["party"], string> = {
  solo: "Solo",
  couple: "Couple",
  friends: "Friends",
  family: "Family",
  group: "Group",
};

export function IntentSummary({
  intent,
  onEdit,
}: {
  intent: TripIntent;
  onEdit: () => void;
}) {
  const chips: { label: string; value: string }[] = [];
  if (intent.origin) chips.push({ label: "Where", value: intent.origin });
  if (intent.durationDays) chips.push({ label: "How long", value: `${intent.durationDays} days` });
  else if (intent.durationHours) chips.push({ label: "How long", value: `${intent.durationHours} hours` });
  const budget = money(intent.budget);
  if (budget) chips.push({ label: "Budget", value: budget });
  chips.push({ label: "Who", value: PARTY_LABEL[intent.party] });
  chips.push({
    label: "Mood",
    value: intent.interests
      .slice(0, 2)
      .map((i) => i[0].toUpperCase() + i.slice(1))
      .join(" + "),
  });
  chips.push({ label: "Pace", value: `${intent.pace[0].toUpperCase()}${intent.pace.slice(1)}` });

  return (
    <div className="intent">
      <div className="intent__top">
        <span className="intent__label">Here's what we understood</span>
        <button className="link-btn light" onClick={onEdit}>
          Change something
        </button>
      </div>
      <div className="intent__grid">
        {chips.map((c) => (
          <div key={c.label} className="intent__cell">
            <span>{c.label}</span>
            <b>{c.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
