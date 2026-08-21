import { useCallback, useRef } from "react";

// Pointer-driven 3D tilt. Applies a subtle perspective rotation that follows
// the cursor and eases back out on leave. Respects reduced-motion.
export function useTilt<T extends HTMLElement = HTMLDivElement>(max = 8) {
  const ref = useRef<T>(null);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el || reduce) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((py + 0.5) * 100).toFixed(1)}%`);
    },
    [max, reduce],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}
