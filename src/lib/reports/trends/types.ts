import type { MetricUnit } from "@/lib/reports/metrics/types";

export type TrendGroupId = "portfolio" | "collections" | "delinquency" | "approvals";

/** One month in a trend line. `value` is null when the month has no basis to
 *  measure against (e.g. collection efficiency in a month where nothing fell
 *  due) — never 0, so the chart can break the line instead of implying a crash. */
export type TrendPoint = {
  /** `YYYY-MM` — stable key, safe to join series on */
  month: string;
  /** Short display label, e.g. "Jun" */
  label: string;
  value: number | null;
};

export type TrendSeries = {
  id: string;
  label: string;
  unit: MetricUnit;
  points: TrendPoint[];
};

/**
 * How much of the requested window the underlying data can actually speak to.
 * Committee decisions only start 2026-07, so a 6-month approval trend is four
 * empty months and one real slope. Every group carries this so the assistant
 * and the brief say so instead of narrating a line through nothing.
 */
export type Coverage = {
  requestedMonths: number;
  monthsWithData: number;
  firstMonth: string | null;
  /** Human sentence, present only when coverage is partial */
  note: string | null;
};

export type TrendGroup = {
  id: TrendGroupId;
  label: string;
  series: TrendSeries[];
  coverage: Coverage;
};

export type TrendBundle = {
  months: number;
  generatedAt: string;
  groups: TrendGroup[];
};
