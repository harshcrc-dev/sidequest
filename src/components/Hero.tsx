import { useRef, useState } from "react";
import { IMG } from "../lib/images";
import { detectCurrentLocation } from "../services/locations";
import { Img } from "./Img";
import { Icon, type IconName } from "./Icon";
import { TIME_OPTIONS } from "../lib/time";
import type { Location } from "../types/location";

const VIBES: { label: string; icon: IconName }[] = [
  { label: "Food", icon: "food" },
  { label: "Coffee", icon: "coffee" },
  { label: "Nature", icon: "leaf" },
  { label: "Culture", icon: "palette" },
  { label: "Nightlife", icon: "moon" },
  { label: "Something new", icon: "sparkles" },
];

const MODES: { key: import("../types").PlannerMode; label: string; sub: string; img: string }[] = [
  { key: "city", label: "City day", sub: "Find a new side of where you are", img: IMG.cityQuest },
  { key: "nearby", label: "Go nearby", sub: "A day out, back home tonight", img: IMG.skandagiri },
  { key: "long_trip", label: "Go somewhere", sub: "Take the longer trip", img: IMG.gokarna },
  { key: "surprise", label: "Surprise me", sub: "Give me something unexpected", img: IMG.adventureQuest },
];

const PLACEHOLDER =
  "I've got Saturday free, \u20B92,000, and want to do something I've never done.";

export function Hero({ onPlan }: { onPlan: (prompt: string, mode?: import("../types").PlannerMode, city?: string, location?: Location) => void }) {
  const [prompt, setPrompt] = useState("");
  const [city, setCity] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location>();
  const [locating, setLocating] = useState(false);
  const [vibes, setVibes] = useState<string[]>([]);
  const [mode, setMode] = useState<import("../types").PlannerMode>("city");
  const [days, setDays] = useState<number>();
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("22:00");
  const cityRef = useRef<HTMLInputElement>(null);

  const toggleVibe = (v: string) =>
    setVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  // One-tap city from the browser. If it's blocked we stay silent and let the
  // user type or use the follow-up city prompt: no dead ends, no red errors.
  const detectLocation = async () => {
    setLocating(true);
    try {
      const here = await detectCurrentLocation();
      if (here.city) {
        setCity(here.city);
        setSelectedLocation(here);
      }
    } catch {
      cityRef.current?.focus();
    } finally {
      setLocating(false);
    }
  };

  const submit = () => {
    const parts = [prompt.trim() || PLACEHOLDER];
    if (vibes.length) parts.push(vibes.join(", ").toLowerCase());
    parts.push(`${shownDays} days, start at ${startTime}, finish at ${endTime}`);
    // City is optional here: if it's empty, App opens the city prompt (which
    // also offers geolocation) rather than blocking with an error.
    onPlan(parts.join(". "), mode, city.trim() || undefined, selectedLocation);
  };

  const scrollToPlanner = () =>
    document.getElementById("planner-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const shownDays = days ?? 1;
  const endOptions = TIME_OPTIONS.filter((option) => option.value > startTime);

  return (
    <section className="fx-hero-wrap">
      <div className="fx-hero">
        <Img src={IMG.hero} alt="" className="fx-hero__img" eager />
        <div className="fx-hero__scrim" />
        <p className="fx-hero__life-line">
          Cats get nine lives, we only get <span className="fx-hero__one">one
            <svg className="fx-hero__paw" viewBox="0 0 72 66" aria-hidden="true">
              <g fill="rgba(244, 240, 230, 0.16)" stroke="rgba(255, 255, 255, 0.42)" strokeWidth="1.8" strokeLinejoin="round">
                <circle cx="14" cy="22" r="9.5" />
                <circle cx="29" cy="13" r="9.5" />
                <circle cx="46" cy="14" r="9.5" />
                <circle cx="60" cy="24" r="9.5" />
                <path d="M37 28c-9 0-17 6-19 15-2 8 2 15 9 17 4 1 7-2 10-2s6 3 10 2c7-2 11-9 9-17-2-9-10-15-19-15Z" />
              </g>
            </svg>
          </span>.
        </p>
        <div className="fx-hero__content container">
          <p className="label fx-hero__eyebrow">AMAZING PLANS, WHEREVER YOU ARE</p>
          <h1 className="display fx-hero__title">
            Make your free
            <br />
            <span className="fx-hero__title-fade">time an adventure.</span>
          </h1>
          <p className="fx-hero__sub">
            Tell us your mood, your budget and how long you&rsquo;ve got. We curate
            a real tour of the city, with hand-picked stops, timed and mapped,
            or an escape nearby. From a spare hour to a long weekend.
          </p>
          <div className="fx-hero__cta">
            <button className="fx-btn fx-btn--accent" onClick={submit}>
              Plan my day <Icon name="arrow" size={16} />
            </button>
            <button className="fx-btn fx-btn--glass" onClick={scrollToPlanner}>
              Start below <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </div>

      <div id="planner-panel" className="fx-planner">
        <div className="fx-planner__inner">
          <h2 className="display fx-planner__title">What's your sidequest?</h2>
          <p className="fx-planner__lede">
            Tell us which city you&rsquo;re in, describe your day, then add a few vibes.
          </p>

          {/* Input box: pick a city, describe your day, then tag some vibes */}
          <div className="fx-box">
            <div className="fx-box__where">
              <Icon name="pin" size={16} />
              <input
                ref={cityRef}
                className="fx-box__city"
                placeholder="Which city? e.g. Lisbon, Tokyo, Mexico City"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setSelectedLocation(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                className="fx-box__locate"
                onClick={() => void detectLocation()}
                disabled={locating}
                title="Use my current location"
              >
                <Icon name="pin" size={13} />
                {locating ? "Locating..." : "Use my location"}
              </button>
            </div>
            <textarea
              className="fx-box__input"
              placeholder={PLACEHOLDER}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="fx-box__foot">
              <div className="fx-box__tags">
                <span className="fx-box__hint">Add a vibe</span>
                {VIBES.map((v) => (
                  <button
                    key={v.label}
                    className={`fx-tag${vibes.includes(v.label) ? " on" : ""}`}
                    onClick={() => toggleVibe(v.label)}
                    type="button"
                  >
                    <Icon name={v.icon} size={13} />
                    {v.label}
                  </button>
                ))}
              </div>
              <button className="fx-box__go" onClick={submit}>
                Plan my day <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="fx-box__time">
              <span className="fx-box__hint">Your schedule</span>
              <div className="fx-clock-pair">
                <label className="fx-clock-input">
                  <span>Start</span>
                  <select
                    value={startTime}
                    onChange={(event) => {
                      const nextStart = event.target.value;
                      setStartTime(nextStart);
                      if (endTime <= nextStart) setEndTime(TIME_OPTIONS.find((option) => option.value > nextStart)?.value ?? endTime);
                    }}
                    aria-label="Start time"
                  >
                    {TIME_OPTIONS.slice(0, -1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="fx-clock-input">
                  <span>End</span>
                  <select value={endTime} onChange={(event) => setEndTime(event.target.value)} aria-label="End time">
                    {endOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="fx-days-stepper fx-time-stepper" role="group" aria-label="Trip length in days">
                <button type="button" aria-label="Decrease days" onClick={() => setDays(Math.max(1, shownDays - 1))}><Icon name="minus" size={15} /></button>
                <label><input type="number" min={1} max={21} value={shownDays} onChange={(event) => setDays(Math.min(21, Math.max(1, Number(event.target.value) || 1)))} aria-label="Trip days" /><span>days</span></label>
                <button type="button" aria-label="Increase days" onClick={() => setDays(Math.min(21, shownDays + 1))}><Icon name="plus" size={15} /></button>
              </div>
            </div>
          </div>

          <div className="fx-picker">
            <div className="fx-picker__head">
              <span className="label fx-picker__label">Or pick a direction</span>
            </div>
            <div className="fx-marquee">
              <div className="fx-marquee__track">
                {[...MODES, ...MODES].map((option, index) => (
                  <button
                    key={`${option.key}-${index}`}
                    type="button"
                    className={`fx-mode img-zoom${mode === option.key ? " on" : ""}`}
                    onClick={() => setMode(option.key)}
                    aria-label={`${option.label}: ${option.sub}`}
                  >
                    <Img src={option.img} alt={option.sub} className="fx-mode__img" />
                    <div className="fx-mode__body">
                      <span className="label fx-mode__label">{option.label}</span>
                      <span className="fx-mode__sub">{option.sub}</span>
                      {mode === option.key && (
                        <span className="fx-mode__check">
                          <Icon name="check" size={13} /> Selected
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

