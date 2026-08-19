import { buildBottleneckReport } from "@/lib/reports/bottlenecks";
import {
  pickCollectionMetrics,
  type CollectionSegment,
} from "@/lib/reports/collections-register";
import { getMetric, METRICS } from "@/lib/reports/metrics/registry";
import { priorPeriod } from "@/lib/reports/period";
import {
  fetchCollectorCollections,
  fetchPastDueRegister,
} from "@/lib/reports/register-queries";
import type { RegisterFilters } from "@/lib/reports/registers";
import {
  clampMonths,
  computeTrendBundle,
  findTrendGroup,
  monthWindows,
  type TrendGroupId,
} from "@/lib/reports/trends";

import { budgetFor, fitToBudget } from "./budget";
import { TREND_SERIES } from "./defs";
import {
  loadComputedMetrics,
  loadLoanRegister,
  loadOrigination,
  loadMoney,
  loadStaff,
  loadSummary,
  loadTrendInputs,
} from "./loaders";
import {
  buildListAccountsPayload,
  buildListPastDuePayload,
  buildListPipelinePayload,
  redactStuckFile,
} from "./redact";
import {
  ACCOUNT_AGING,
  ACCOUNT_STATUSES,
  ACCOUNT_VIEWS,
  COLLATERALS,
  enrichMetrics,
  findMetricValue,
  parseObjectArgs,
  parseQuery,
  PAST_DUE_AGING,
  pickEnum,
  SEGMENTS,
  type SkillContext,
  type SkillResult,
} from "./shared";

export function runGetCatalog(): SkillResult {
  return { ok: true, name: "get_catalog", data: { definitions: METRICS } };
}

export async function runGetSnapshot(ctx: SkillContext): Promise<SkillResult> {
  const [summary, metrics, origination] = await Promise.all([
    loadSummary(ctx),
    loadComputedMetrics(ctx),
    loadOrigination(ctx),
  ]);

  const base = {
    period: ctx.period,
    prior: priorPeriod(ctx.period),
    metrics: enrichMetrics(metrics),
    pipeline: summary.pipeline,
    aging: summary.aging,
    income: summary.income,
    collection: summary.collection,
    activeLoans: summary.activeLoans,
    tat: summary.tat.map((row) => ({
      label: row.label,
      averageDays: row.averageDays,
      sampleCount: row.sampleCount,
    })),
  };

  return {
    ok: true,
    name: "get_snapshot",
    data: fitToBudget(
      origination.stuckFiles,
      budgetFor("get_snapshot"),
      (visible, omitted) => ({
        ...base,
        stuckFileCount: origination.stuckFiles.length,
        omitted,
        stuckFiles: visible.map((file) => redactStuckFile(file, false)),
      }),
    ),
  };
}

export async function runGetMetric(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed || typeof parsed.id !== "string") {
    return { ok: false, name: "get_metric", error: "invalid_args" };
  }
  const def = getMetric(parsed.id);
  if (!def) return { ok: false, name: "get_metric", error: "unknown_metric" };

  const value = findMetricValue(await loadComputedMetrics(ctx), parsed.id);
  if (!value) return { ok: false, name: "get_metric", error: "missing_value" };
  return { ok: true, name: "get_metric", data: { def, value } };
}

export async function runGetTrends(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed) return { ok: false, name: "get_trends", error: "invalid_args" };

  const series = pickEnum(parsed.series, TREND_SERIES, "portfolio") as TrendGroupId;
  const months = clampMonths(parsed.months);
  const inputs = await loadTrendInputs(ctx);
  const bundle = computeTrendBundle(inputs, monthWindows(months));
  const group = findTrendGroup(bundle, series);
  if (!group) return { ok: false, name: "get_trends", error: "unknown_series" };

  return {
    ok: true,
    name: "get_trends",
    data: { months, series, group },
  };
}

export async function runGetBottlenecks(ctx: SkillContext): Promise<SkillResult> {
  const origination = await loadOrigination(ctx);
  const report = await buildBottleneckReport(ctx.supabase, origination.stuckFiles);
  return { ok: true, name: "get_bottlenecks", data: report };
}

export async function runGetStaff(ctx: SkillContext): Promise<SkillResult> {
  const series = await loadStaff(ctx);
  return {
    ok: true,
    name: "get_staff",
    data: {
      period: ctx.period,
      collectors: series.collectorScorecard.map((row) => ({
        name: row.name,
        accountsHeld: row.accountsHeld,
        amountCollected: row.amountCollected,
        amountCollectedAllTime: row.amountCollectedAllTime,
        dcrsSubmitted: row.dcrsSubmitted,
        dcrsReconciled: row.dcrsReconciled,
        dcrsRejected: row.dcrsRejected,
        rejectionRatePct: row.rejectionRatePct,
        avgCycleDays: row.avgCycleDays,
      })),
      committeeParticipation: series.committeeParticipation.map((row) => ({
        name: row.name,
        votesCast: row.votesCast,
        avgTurnaroundDays: row.avgTurnaroundDays,
      })),
      agents: series.agentScorecard.map((row) => ({
        name: row.name,
        leadsCreated: row.leadsCreated,
        leadsConverted: row.leadsConverted,
        conversionRatePct: row.conversionRatePct,
      })),
      creditInvestigation: series.cigScorecard.map((row) => ({
        name: row.name,
        verificationsCompleted: row.verificationsCompleted,
        avgDaysToComplete: row.avgDaysToComplete,
        checksRecorded: row.checksRecorded,
        checkPassRatePct: row.checkPassRatePct,
      })),
      releaseOfficers: series.lraScorecard.map((row) => ({
        name: row.name,
        filesAssigned: row.filesAssigned,
        filesReleased: row.filesReleased,
        avgDaysToRelease: row.avgDaysToRelease,
      })),
      remedial: series.remedialScorecard.map((row) => ({
        name: row.name,
        accountsHeld: row.accountsHeld,
        turnoversReceived: row.turnoversReceived,
        amountRecovered: row.amountRecovered,
      })),
      proofBacklog: series.proofBacklog,
    },
  };
}

export async function runListAccounts(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed) return { ok: false, name: "list_accounts", error: "invalid_args" };

  const q = parseQuery(parsed.q);
  const view = pickEnum(parsed.view, ACCOUNT_VIEWS, "loans");
  const filters: RegisterFilters = {
    status: pickEnum(parsed.status, ACCOUNT_STATUSES, q ? "all" : "unpaid"),
    segment: pickEnum(parsed.segment, SEGMENTS, "all"),
    aging: pickEnum(parsed.aging, ACCOUNT_AGING, "all"),
    collateral: pickEnum(parsed.collateral, COLLATERALS, "all"),
  };
  const loans = await loadLoanRegister(ctx);
  return {
    ok: true,
    name: "list_accounts",
    data: buildListAccountsPayload(
      loans,
      filters,
      view,
      Boolean(ctx.includeBorrowerNames),
      q,
    ),
  };
}

export async function runListPastDue(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed) return { ok: false, name: "list_past_due", error: "invalid_args" };

  const aging = pickEnum(parsed.aging, PAST_DUE_AGING, "all");
  const q = parseQuery(parsed.q);
  const rows = await fetchPastDueRegister(ctx.supabase, aging);
  return {
    ok: true,
    name: "list_past_due",
    data: buildListPastDuePayload(rows, aging, Boolean(ctx.includeBorrowerNames), q),
  };
}

export async function runListCollections(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed) return { ok: false, name: "list_collections", error: "invalid_args" };

  const segment = pickEnum(parsed.segment, SEGMENTS, "all") as CollectionSegment;
  const [money, collectors] = await Promise.all([
    loadMoney(ctx),
    fetchCollectorCollections(ctx.supabase, ctx.period, segment),
  ]);
  return {
    ok: true,
    name: "list_collections",
    data: {
      period: ctx.period,
      segment,
      metrics: pickCollectionMetrics(money.metrics),
      collectors,
    },
  };
}

export async function runListPipeline(
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  const parsed = parseObjectArgs(argsJson);
  if (!parsed) return { ok: false, name: "list_pipeline", error: "invalid_args" };

  const q = parseQuery(parsed.q);
  const origination = await loadOrigination(ctx);
  return {
    ok: true,
    name: "list_pipeline",
    data: buildListPipelinePayload(
      ctx.period,
      origination.metrics,
      origination.stuckFiles,
      Boolean(ctx.includeBorrowerNames),
      q,
    ),
  };
}
