export interface TimeOption {
  value: string;
  label: string;
}

function clockLabel(hours: number, minutes: number): string {
  const suffix = hours < 12 ? "AM" : "PM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export const TIME_OPTIONS: TimeOption[] = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return {
    value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    label: clockLabel(hours, minutes),
  };
});