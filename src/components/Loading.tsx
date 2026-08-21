import { useEffect, useState } from "react";

const STEPS = [
  "Reading what you asked for",
  "Checking what's open",
  "Shaping the route",
  "Balancing the time",
  "Putting it together",
];

export function Loading() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => Math.min(a + 1, STEPS.length)), 380);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="container loading">
      <div className="loading__cube" aria-hidden>
        <div className="loading__cube-inner">
          <span className="cf cf--f" />
          <span className="cf cf--b" />
          <span className="cf cf--l" />
          <span className="cf cf--r" />
          <span className="cf cf--t" />
          <span className="cf cf--bo" />
        </div>
      </div>
      <h2 className="loading__title">Finding the right shape for your day…</h2>
      <ul className="loading__steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < active ? "on" : ""}>
            <i aria-hidden>{i < active ? "✓" : "○"}</i>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
