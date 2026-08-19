import type { SupabaseClient } from "@supabase/supabase-js";

import { computeApprovalTrend } from "./approvals";
import { monthWindows, type MonthWindow } from "./calendar";
import { computeCollectionTrend } from "./collections";
import { computeDelinquencyTrend } from "./delinquency";
import { fetchTrendInputs, type TrendInputs } from "./inputs";
import { computePortfolioTrend } from "./portfolio";
import type { TrendBundle, TrendGroup, TrendGroupId, TrendSeries } from "./types";

export const DEFAULT_TREND_MONTHS = 6;
export const MAX_TREND_MONTHS = 12;

export function clampMonths(value: unknown): number {
  const n = typeof value === "number" ? Math.trunc(value) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_TREND_MONTHS;
  return Math.min(Math.max(n, 2), MAX_TREND_MONTHS);
}

function seriesToMap(series: TrendSeries | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of series?.points ?? []) {
    if (p.value !== null) map.set(p.month, p.value);
  }
  return map;
}

/** Pure composition — every group derived from one set of rows and one set of
 *  windows, so all four line up index-for-index on a shared x-axis. */
export function computeTrendBundle(
  inputs: TrendInputs,
  windows: MonthWindow[],
  now = new Date(),
): TrendBundle {
  const portfolio = computePortfolioTrend(inputs, windows);
  const outstandingByMonth = seriesToMap(
    portfolio.series.find((s) => s.id === "portfolio.outstanding"),
  );

  return {
    months: windows.length,
    generatedAt: now.toISOString(),
    groups: [
      portfolio,
      computeCollectionTrend(inputs, windows),
      computeDelinquencyTrend(inputs, windows, outstandingByMonth),
      computeApprovalTrend(inputs.decisions, windows),
    ],
  };
}

export async function buildTrendBundle(
  supabase: SupabaseClient,
  months = DEFAULT_TREND_MONTHS,
  now = new Date(),
): Promise<TrendBundle> {
  const inputs = await fetchTrendInputs(supabase);
  return computeTrendBundle(inputs, monthWindows(months, now), now);
}

export function findTrendGroup(
  bundle: TrendBundle,
  id: TrendGroupId,
): TrendGroup | undefined {
  return bundle.groups.find((group) => group.id === id);
}

export { monthWindows } from "./calendar";
export { fetchTrendInputs } from "./inputs";
export type { TrendInputs } from "./inputs";
export type {
  Coverage,
  TrendBundle,
  TrendGroup,
  TrendGroupId,
  TrendPoint,
  TrendSeries,
} from "./types";
