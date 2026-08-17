import { handleApiError, jsonOk } from "@/lib/api/handler";
import { buildExecutiveSummary } from "@/lib/reports/aggregates";
import { computeMoneyMetrics } from "@/lib/reports/metrics/money";
import { computeOriginationMetrics } from "@/lib/reports/metrics/origination";
import { computeRiskMetrics } from "@/lib/reports/metrics/risk";
import { computeStaffMetrics } from "@/lib/reports/metrics/staff";
import { parsePeriod, priorPeriod } from "@/lib/reports/period";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    // Aggregate-only, already gated above — runs under the service role so
    // roles without a direct grant on postings/penalties (e.g. Committee,
    // which holds reports:view but not accounting_ar/collection/remedial)
    // don't silently see zeroed-out figures from RLS.
    const supabase = createServiceClient();
    const period = parsePeriod(new URL(request.url).searchParams);
    const prior = priorPeriod(period);

    const [summary, money, risk, origination, staff] = await Promise.all([
      buildExecutiveSummary(supabase),
      computeMoneyMetrics(supabase, period),
      computeRiskMetrics(supabase),
      computeOriginationMetrics(supabase, period),
      computeStaffMetrics(supabase),
    ]);

    return jsonOk({
      ...summary,
      period,
      // The prior period's date range — every metric's own `.prior` value
      // was already computed against this window; surfacing it here lets a
      // reader (or an AI) know what the comparison numbers refer to without
      // re-deriving it from `period`.
      prior,
      metrics: [...money.metrics, ...risk.metrics, ...origination.metrics],
      series: {
        money: money.series,
        risk: risk.series,
        origination: origination.series,
        staff,
      },
      stuckFiles: origination.stuckFiles,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
