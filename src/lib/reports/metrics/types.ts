export type MetricUnit = "php" | "count" | "percent" | "days" | "months";
export type MetricDirection = "up_good" | "down_good" | "neutral";
export type MetricTheme = "money" | "risk" | "origination" | "staff";

/** Static, human- and LLM-readable definition. Never contains a value. */
export type MetricDef = {
  id: string; // stable dot-namespaced key, e.g. "money.collected"
  label: string; // UI label
  description: string; // ONE plain sentence — this is what the AI reads
  formula: string; // plain-English derivation, e.g. "SUM(postings.amount) in period"
  unit: MetricUnit;
  direction: MetricDirection;
  theme: MetricTheme;
};

/** A computed value for one period, with its own prior-period comparison. */
export type MetricValue = {
  id: string;
  value: number;
  prior: number | null;
  deltaAbs: number | null;
  deltaPct: number | null; // null when prior is 0 or null — never Infinity
};

export type Period = { from: string; to: string }; // inclusive ISO dates
