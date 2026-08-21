// Lightweight inline SVG icons. No dependency, tree-shakeable, currentColor.

import type { ReactNode } from "react";

export type IconName =
  | "rupee"
  | "clock"
  | "pin"
  | "car"
  | "walk"
  | "coffee"
  | "food"
  | "mountain"
  | "sparkles"
  | "calendar"
  | "users"
  | "compass"
  | "sun"
  | "wave"
  | "camera"
  | "music"
  | "leaf"
  | "palette"
  | "bag"
  | "moon"
  | "bolt"
  | "heart"
  | "check"
  | "swap"
  | "arrow"
  | "arrowUpRight"
  | "route"
  | "tag"
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "minus"
  | "plus";

const PATHS: Record<IconName, ReactNode> = {
  rupee: <path d="M6 3h12M6 8h12M6 13h6.5c3 0 5-1.7 5-4.5M6 13l7 8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  car: (
    <>
      <path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5h-3v-2H6v2H3v-5Z" />
      <circle cx="7.5" cy="15.5" r="1.2" />
      <circle cx="16.5" cy="15.5" r="1.2" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.6" />
      <path d="M13 8l-2 4 3 2 1 6M11 12l-3 1-2 4M14 14l4 1" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
      <path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" />
    </>
  ),
  food: (
    <>
      <path d="M6 3v8M4 3v4a2 2 0 0 0 2 2M6 3v6M8 3v4a2 2 0 0 1-2 2M6 11v10" />
      <path d="M17 3c-2 0-3 2-3 5s1 4 3 4v9" />
    </>
  ),
  mountain: <path d="M3 20l6-11 4 6 2-3 6 8H3Z" />,
  sparkles: (
    <path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3L12 3ZM19 14l.9 2.3 2.1.7-2.1.7L19 20l-.9-2.3-2.1-.7 2.1-.7L19 14Z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17M8 3v4M16 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M21 20a6 6 0 0 0-4-5.6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  wave: <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />,
  camera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
    </>
  ),
  leaf: <path d="M4 20c0-9 7-15 16-15 0 9-6 15-15 15H4Zm3-3c5-4 8-8 9-11" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-.6-1.5-.6-2.5S14 15 15.5 15H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16" cy="10.5" r="1" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z" />,
  heart: <path d="M12 20s-7-4.7-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.3-7 10-7 10Z" />,
  check: <path d="M4 12l5 5L20 6" />,
  swap: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUpRight: <path d="M7 17L17 7M8 7h9v9" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  route: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12l8-8h9v9l-8 8-9-9Z" />
      <circle cx="15.5" cy="8.5" r="1.3" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
