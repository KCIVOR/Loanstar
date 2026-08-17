/** Meridian chart palette — hex values mirror globals.css :root tokens.
 * Recharts renders SVG presentation attributes; CSS var() cannot be used there. */
export const CHART = {
  /* primary action (teal) */
  gold: "#0D9488",       /* --teal-600 */
  goldHover: "#12A797",  /* --teal-500 */
  goldDark: "#0A7D71",   /* --teal-700 */
  /* navy scale */
  navy: "#0C2247",       /* --navy-900 */
  navySurface: "#071633",/* --navy-950 */
  navyChrome: "#071633", /* --navy-950 */
  navyMuted: "#B9CBE7",  /* --navy-200 */
  /* neutral */
  cream: "#FFFFFF",      /* --surface */
  /* semantic */
  success: "#178A50",    /* --success */
  danger: "#C2362F",     /* --danger */
  warning: "#B96A00",    /* --warning */
  info: "#23539E",       /* --info */
  /* text */
  ink: "#16233B",        /* --ink-900 */
  inkFaint: "#8C99B0",   /* --ink-400 */
  /* grid lines */
  grid: "#E7ECF3",       /* --line-soft */
} as const;

/**
 * Ordered categorical palette for multi-series charts. Validated against the
 * accessibility six-checks (lightness band, chroma floor, CVD separation,
 * normal-vision floor, contrast vs surface) — all pass in this order.
 * `navyMuted` (#B9CBE7) is deliberately excluded: it fails lightness, chroma,
 * and contrast, and reads as gray. Do not reorder without re-validating —
 * amber and green in particular must not sit adjacent (fails CVD separation).
 */
export const CATEGORY_COLORS = [
  CHART.gold, // #0D9488 teal — brand primary
  CHART.warning, // #B96A00 amber
  CHART.info, // #23539E blue
  CHART.danger, // #C2362F red
  "#7C3AED", // violet
  CHART.success, // #178A50 green
];

/** Single-hue sequential ramp, light → dark, for ordered/severity scales
 * (aging buckets, backlog age) — never assign these by categorical identity. */
export const SEQUENTIAL_RAMP = [
  "#CCFBF1",
  "#5EEAD4",
  "#2DD4BF",
  "#0D9488",
  "#0A7D71",
];

export const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,            /* --r-md */
  border: `1px solid ${CHART.grid}`,
  boxShadow: "0 8px 24px rgba(12, 34, 71, 0.12)", /* --sh-3 */
} as const;

export const AXIS_TICK = { fontSize: 10, fill: CHART.inkFaint } as const;
