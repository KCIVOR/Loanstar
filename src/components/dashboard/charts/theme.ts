/** Deep Harbor chart palette — hex mirrors of the tokens in globals.css.
 * Recharts writes SVG presentation attributes, which cannot resolve CSS var(). */
export const CHART = {
  gold: "#d9a855",
  goldHover: "#e8c078",
  goldDark: "#b3822f",
  navy: "#152c5c",
  navySurface: "#0e2149",
  navyChrome: "#0a1b3d",
  navyMuted: "#9fb0d1",
  cream: "#f4f1e8",
  success: "#4e9f6e",
  danger: "#d9695b",
  warning: "#d6a23b",
  info: "#5b8fd9",
  ink: "#0f2148",
  inkFaint: "#8087a0",
  grid: "#e7e9f0",
} as const;

/** Ordered categorical palette for multi-series charts. */
export const CATEGORY_COLORS = [
  CHART.gold,
  CHART.info,
  CHART.success,
  CHART.warning,
  CHART.danger,
  CHART.navyMuted,
];

export const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${CHART.grid}`,
  boxShadow: "0 4px 8px rgba(15, 33, 72, 0.07)",
} as const;

export const AXIS_TICK = { fontSize: 10, fill: CHART.inkFaint } as const;
