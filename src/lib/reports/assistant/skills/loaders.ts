import { buildExecutiveSummary } from "@/lib/reports/aggregates";
import { computeMoneyMetrics } from "@/lib/reports/metrics/money";
import { computeOriginationMetrics } from "@/lib/reports/metrics/origination";
import { computeRiskMetrics } from "@/lib/reports/metrics/risk";
import { computeStaffMetrics } from "@/lib/reports/metrics/staff";
import type { MetricValue } from "@/lib/reports/metrics/types";
import { fetchLoanRegister } from "@/lib/reports/register-queries";
import { fetchTrendInputs, type TrendInputs } from "@/lib/reports/trends";

import { memo, type SkillContext } from "./shared";

/**
 * Every expensive read the skills share, memoized per request. Without this a
 * single turn that calls get_snapshot, list_pipeline and get_bottlenecks would
 * compute origination metrics three times over the same rows.
 */

export const loadMoney = (ctx: SkillContext) =>
  memo(ctx, "money", () => computeMoneyMetrics(ctx.supabase, ctx.period));

export const loadRisk = (ctx: SkillContext) =>
  memo(ctx, "risk", () => computeRiskMetrics(ctx.supabase));

export const loadOrigination = (ctx: SkillContext) =>
  memo(ctx, "origination", () => computeOriginationMetrics(ctx.supabase, ctx.period));

export const loadSummary = (ctx: SkillContext) =>
  memo(ctx, "summary", () => buildExecutiveSummary(ctx.supabase));

export const loadStaff = (ctx: SkillContext) =>
  memo(ctx, "staff", () => computeStaffMetrics(ctx.supabase, ctx.period));

export const loadLoanRegister = (ctx: SkillContext) =>
  memo(ctx, "loanRegister", () => fetchLoanRegister(ctx.supabase));

export const loadTrendInputs = (ctx: SkillContext): Promise<TrendInputs> =>
  memo(ctx, "trendInputs", () => fetchTrendInputs(ctx.supabase));

export async function loadComputedMetrics(ctx: SkillContext): Promise<MetricValue[]> {
  const [money, risk, origination] = await Promise.all([
    loadMoney(ctx),
    loadRisk(ctx),
    loadOrigination(ctx),
  ]);
  return [...money.metrics, ...risk.metrics, ...origination.metrics];
}
