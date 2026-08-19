import type { SupabaseClient } from "@supabase/supabase-js";

import { buildBottleneckReport, type BottleneckReport } from "@/lib/reports/bottlenecks";
import {
  loadComputedMetrics,
  loadOrigination,
  loadStaff,
  loadSummary,
  loadTrendInputs,
} from "@/lib/reports/assistant/skills/loaders";
import { enrichMetrics, newSkillCache } from "@/lib/reports/assistant/skills";
import type { StaffSeries } from "@/lib/reports/metrics/staff";
import type { Period } from "@/lib/reports/metrics/types";
import { priorPeriod } from "@/lib/reports/period";
import {
  computeTrendBundle,
  DEFAULT_TREND_MONTHS,
  monthWindows,
  type TrendBundle,
} from "@/lib/reports/trends";

type EnrichedMetric = ReturnType<typeof enrichMetrics>[number];
type Summary = Awaited<ReturnType<typeof loadSummary>>;

/**
 * Every number the brief may rest on, in one addressable document.
 *
 * The page renders from this. The model only reads a digest of it and returns
 * prose. Keeping them the same source is what guarantees the words on screen
 * and the figures beside them describe the same reality.
 */
export type EvidenceBundle = {
  period: Period;
  prior: Period;
  generatedAt: string;
  metrics: EnrichedMetric[];
  pipeline: Summary["pipeline"];
  aging: Summary["aging"];
  income: Summary["income"];
  collection: Summary["collection"];
  activeLoans: number;
  tat: Array<{ label: string; averageDays: number | null; sampleCount: number }>;
  trends: TrendBundle;
  bottlenecks: BottleneckReport;
  staff: StaffSeries;
  coverageNotes: string[];
  /** Every key a recommendation is allowed to cite. */
  keys: string[];
};

export function collectEvidenceKeys(input: {
  metrics: EnrichedMetric[];
  trends: TrendBundle;
  bottlenecks: BottleneckReport;
}): string[] {
  const keys = new Set<string>([
    "snapshot.pipeline",
    "snapshot.aging",
    "snapshot.income",
    "snapshot.collection",
    "snapshot.activeLoans",
    "snapshot.tat",
    "staff.collectors",
    "staff.committee",
    "staff.agents",
    "staff.creditInvestigation",
    "staff.releaseOfficers",
    "staff.remedial",
    "staff.proofBacklog",
  ]);
  for (const metric of input.metrics) keys.add(`metric.${metric.id}`);
  for (const group of input.trends.groups) {
    for (const series of group.series) keys.add(`trend.${series.id}`);
  }
  for (const entry of input.bottlenecks.entries) keys.add(entry.id);
  return Array.from(keys).sort();
}

export async function buildEvidenceBundle(
  supabase: SupabaseClient,
  period: Period,
  months = DEFAULT_TREND_MONTHS,
  now = new Date(),
): Promise<EvidenceBundle> {
  const ctx = { supabase, period, cache: newSkillCache() };

  const [summary, rawMetrics, origination, trendInputs, staff] = await Promise.all([
    loadSummary(ctx),
    loadComputedMetrics(ctx),
    loadOrigination(ctx),
    loadTrendInputs(ctx),
    loadStaff(ctx),
  ]);

  const trends = computeTrendBundle(trendInputs, monthWindows(months, now), now);
  const bottlenecks = await buildBottleneckReport(supabase, origination.stuckFiles, now);
  const metrics = enrichMetrics(rawMetrics);

  return {
    period,
    prior: priorPeriod(period),
    generatedAt: now.toISOString(),
    metrics,
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
    trends,
    bottlenecks,
    staff,
    coverageNotes: trends.groups
      .map((group) => group.coverage.note)
      .filter((note): note is string => Boolean(note)),
    keys: collectEvidenceKeys({ metrics, trends, bottlenecks }),
  };
}

function topN<T>(rows: T[], n = 5): T[] {
  return rows.slice(0, n);
}

/**
 * The compact projection the model actually reads. Full scorecards and every
 * stuck file would spend the context window on rows the model must not quote
 * anyway — it needs enough to form a judgment, not enough to recite.
 */
export function digestForModel(bundle: EvidenceBundle) {
  return {
    period: bundle.period,
    prior: bundle.prior,
    metrics: bundle.metrics.map((m) => ({
      key: `metric.${m.id}`,
      label: m.label,
      unit: m.unit,
      value: m.value,
      prior: m.prior,
      deltaPct: m.deltaPct,
    })),
    trends: bundle.trends.groups.map((group) => ({
      id: group.id,
      label: group.label,
      coverage: group.coverage.note,
      series: group.series.map((series) => ({
        key: `trend.${series.id}`,
        label: series.label,
        unit: series.unit,
        points: series.points.map((p) => [p.label, p.value] as const),
      })),
    })),
    bottlenecks: bundle.bottlenecks.entries.map((entry) => ({
      key: entry.id,
      stage: entry.stage,
      owner: entry.owner,
      waiting: entry.count,
      oldestDays: entry.oldestDays,
      targetDays: entry.targetDays,
      breached: entry.breached,
    })),
    pipeline: bundle.pipeline,
    aging: bundle.aging,
    activeLoans: bundle.activeLoans,
    tat: bundle.tat,
    staff: {
      collectors: topN(
        bundle.staff.collectorScorecard.map((r) => ({
          name: r.name,
          accountsHeld: r.accountsHeld,
          amountCollected: r.amountCollected,
          rejectionRatePct: Math.round(r.rejectionRatePct * 10) / 10,
        })),
      ),
      agents: topN(
        bundle.staff.agentScorecard.map((r) => ({
          name: r.name,
          leadsCreated: r.leadsCreated,
          leadsConverted: r.leadsConverted,
          conversionRatePct: r.conversionRatePct,
        })),
      ),
      creditInvestigation: topN(
        bundle.staff.cigScorecard.map((r) => ({
          name: r.name,
          verificationsCompleted: r.verificationsCompleted,
          avgDaysToComplete: r.avgDaysToComplete,
          checkPassRatePct: r.checkPassRatePct,
        })),
      ),
      releaseOfficers: topN(
        bundle.staff.lraScorecard.map((r) => ({
          name: r.name,
          filesAssigned: r.filesAssigned,
          filesReleased: r.filesReleased,
          avgDaysToRelease: r.avgDaysToRelease,
        })),
      ),
      remedial: topN(
        bundle.staff.remedialScorecard.map((r) => ({
          name: r.name,
          accountsHeld: r.accountsHeld,
          amountRecovered: r.amountRecovered,
        })),
      ),
      committee: topN(
        bundle.staff.committeeParticipation.map((r) => ({
          name: r.name,
          votesCast: r.votesCast,
          avgTurnaroundDays: r.avgTurnaroundDays,
        })),
      ),
      proofBacklog: bundle.staff.proofBacklog,
    },
    coverageNotes: bundle.coverageNotes,
    citableKeys: bundle.keys,
  };
}
