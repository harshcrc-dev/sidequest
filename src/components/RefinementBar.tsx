import { useEffect, useState } from "react";
import type { PlannerMode } from "../types";
import type { RefineAction } from "../lib/planner";
import { Icon, type IconName } from "./Icon";
import { money } from "../lib/format";
import { TIME_OPTIONS } from "../lib/time";

const CHIPS: { label: string; action: RefineAction; icon: IconName }[] = [
  { label: "Cheaper", action: "cheaper", icon: "rupee" },
  { label: "Slower", action: "slower", icon: "clock" },
  { label: "More food", action: "more_food", icon: "food" },
  { label: "More adventure", action: "more_adventure", icon: "mountain" },
  { label: "Less driving", action: "less_driving", icon: "walk" },
  { label: "More local", action: "more_local", icon: "compass" },
];

export function RefinementBar({
  onRefine,
  onFreeform,
  onApplySettings,
  budget,
  mode,
  durationDays,
  startTime,
  endTime,
  busy,
}: {
  onRefine: (action: RefineAction) => void;
  onFreeform: (text: string) => void;
  onApplySettings: (settings: { budget: number; durationDays: number; startTime: string; endTime: string }, note?: string) => void;
  budget: number;
  mode: PlannerMode;
  durationDays?: number;
  startTime?: string;
  endTime?: string;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [targetBudget, setTargetBudget] = useState(budget);
  const [targetDays, setTargetDays] = useState(durationDays ?? (mode === "long_trip" ? 3 : 1));
  const [targetStartTime, setTargetStartTime] = useState(startTime ?? "10:00");
  const [targetEndTime, setTargetEndTime] = useState(endTime ?? "22:00");
  const minimum = Math.max(1, Math.round(budget * 0.4));
  const maximum = Math.max(minimum + 10, Math.round(budget * 2));
  const endOptions = TIME_OPTIONS.filter((option) => option.value > targetStartTime);
  const setDays = (value: number) => setTargetDays(Math.min(21, Math.max(1, value)));

  useEffect(() => {
    setTargetBudget(budget);
  }, [budget]);
  useEffect(() => {
    setTargetDays(durationDays ?? (mode === "long_trip" ? 3 : 1));
  }, [durationDays, mode]);
  useEffect(() => {
    setTargetStartTime(startTime ?? "10:00");
  }, [startTime]);
  useEffect(() => {
    setTargetEndTime(endTime ?? "22:00");
  }, [endTime]);

  const send = () => {
    const note = text.trim();
    const hasSettingsChange =
      targetBudget !== budget ||
      targetDays !== (durationDays ?? (mode === "long_trip" ? 3 : 1)) ||
      targetStartTime !== (startTime ?? "10:00") ||
      targetEndTime !== (endTime ?? "22:00");
    if (hasSettingsChange) {
      onApplySettings({ budget: targetBudget, durationDays: targetDays, startTime: targetStartTime, endTime: targetEndTime }, note || undefined);
    } else if (note) {
      onFreeform(note);
    }
    setText("");
  };

  return (
    <section className="refine">
      <div className="refine__head">
        <h3>Make it mine</h3>
        <span>Tweak it until it's yours. The rest of the plan adjusts.</span>
      </div>
      <div className="refine__chips">
        {CHIPS.map((c) => (
          <button
            key={c.action}
            className="chip"
            onClick={() => onRefine(c.action)}
            disabled={busy}
          >
            <Icon name={c.icon} size={16} />
            {c.label}
          </button>
        ))}
      </div>
      <div className={`refine__settings refine__settings--${mode}`}>
        <div className="refine-setting refine-setting--budget">
          <div className="refine-setting__head">
            <span>Budget</span>
            <b>{money(targetBudget)}</b>
          </div>
          <input
            type="range"
            min={minimum}
            max={maximum}
            step={1}
            value={targetBudget}
            onChange={(event) => setTargetBudget(Number(event.target.value))}
            disabled={busy}
            aria-label="Target budget"
          />
        </div>
        <div className="refine-setting refine-setting--start">
          <div className="refine-setting__head"><span>Start time</span></div>
          <select
            className="refine-time-select"
            value={targetStartTime}
            onChange={(event) => {
              const nextStart = event.target.value;
              setTargetStartTime(nextStart);
              if (targetEndTime <= nextStart) setTargetEndTime(TIME_OPTIONS.find((option) => option.value > nextStart)?.value ?? targetEndTime);
            }}
            disabled={busy}
            aria-label="Trip start time"
          >
            {TIME_OPTIONS.slice(0, -1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="refine-setting refine-setting--end">
          <div className="refine-setting__head"><span>End time</span></div>
          <select
            className="refine-time-select"
            value={targetEndTime}
            onChange={(event) => setTargetEndTime(event.target.value)}
            disabled={busy}
            aria-label="Trip end time"
          >
            {endOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <>
          <div className="refine-setting refine-setting--days">
            <div className="refine-setting__head"><span>Adjust trip length</span><b>{targetDays} days</b></div>
            <div className="refine-stepper" role="group" aria-label="Trip duration in days">
              <button type="button" aria-label="Decrease trip days" onClick={() => setDays(targetDays - 1)} disabled={busy || targetDays <= 1}><Icon name="minus" size={15} /></button>
              <input
                type="number"
                min={1}
                max={21}
                value={targetDays}
                onChange={(event) => setTargetDays(Math.min(21, Math.max(1, Number(event.target.value) || 1)))}
                disabled={busy}
                aria-label="Trip days"
              />
              <button type="button" aria-label="Increase trip days" onClick={() => setDays(targetDays + 1)} disabled={busy || targetDays >= 21}><Icon name="plus" size={15} /></button>
            </div>
          </div>
        </>
      </div>
      <div className="refine__input">
        <input
          placeholder="Make the afternoon more relaxed…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <button className="btn btn--accent" onClick={send} disabled={busy}>
          {busy ? "Updating..." : "Update plan"}
        </button>
      </div>
    </section>
  );
}
