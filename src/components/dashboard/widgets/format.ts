/** Compact peso formatting for widget KPIs. */
export function peso(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`;
  return `₱${value.toLocaleString("en-PH")}`;
}

export function pct(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

export function days(value: number | null): string {
  return value != null ? `${value}d` : "—";
}
