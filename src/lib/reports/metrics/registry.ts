import { MONEY_METRIC_DEFS } from "./money";
import { ORIGINATION_METRIC_DEFS } from "./origination";
import { RISK_METRIC_DEFS } from "./risk";
import type { MetricDef, MetricTheme } from "./types";

/**
 * Single source of truth for every metric the reports dashboard exposes.
 * Phases 2–5 append their definitions here as each theme is built —
 * this file has no values, only the static shape an AI or a UI panel reads.
 */
export const METRICS: MetricDef[] = [
  ...MONEY_METRIC_DEFS,
  ...RISK_METRIC_DEFS,
  ...ORIGINATION_METRIC_DEFS,
];

export function getMetric(id: string): MetricDef | undefined {
  return METRICS.find((m) => m.id === id);
}

export function metricsByTheme(theme: MetricTheme): MetricDef[] {
  return METRICS.filter((m) => m.theme === theme);
}
