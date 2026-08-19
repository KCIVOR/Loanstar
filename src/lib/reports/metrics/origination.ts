import type { SupabaseClient } from "@supabase/supabase-js";

import { approvalRatePct } from "@/lib/reports/approval-rate";
import {
  computeSlaBreachesFromHistories,
  computeTatFromHistories,
  TAT_PAIRS,
} from "@/lib/reports/aggregates";

import {
  asCollateralType,
  asLoanSegment,
  collateralLabel,
  segmentLabel,
  type CollateralType,
  type LoanSegment,
} from "@/lib/reports/segments";

import type { Period } from "./types";
import type { MetricDef, MetricValue } from "./types";

export const ORIGINATION_METRIC_DEFS: MetricDef[] = [
  {
    id: "origination.conversionRate",
    label: "Lead conversion",
    description:
      "Share of leads created in the period whose loan was released in that same period.",
    formula: "COUNT(masterlist released in period) ÷ COUNT(leads created in period)",
    unit: "percent",
    direction: "up_good",
    theme: "origination",
  },
  {
    id: "origination.approvalRate",
    label: "Approval rate",
    description: "Of applications Committee has decided on, the share approved rather than denied.",
    formula:
      "COUNT(applications Committee approved, including those that later moved to LRA/release/active/paid off) ÷ COUNT(those + denied)",
    unit: "percent",
    direction: "up_good",
    theme: "origination",
  },
  {
    id: "origination.avgTimeToDecision",
    label: "Avg. time to decision",
    description: "Average days between an application entering Committee review and receiving a decision.",
    formula: "mean(approved_at − for_approval_at) from status_history, the 'Committee decision' TAT step",
    unit: "days",
    direction: "down_good",
    theme: "origination",
  },
  {
    id: "origination.slaBreaches",
    label: "SLA breaches",
    description: "Count of stage-to-stage transitions that took longer than that stage's target turnaround.",
    formula: "SUM(breachCount) across all tracked stage transitions, each vs. its own target",
    unit: "count",
    direction: "down_good",
    theme: "origination",
  },
  {
    id: "origination.avgApprovedAmount",
    label: "Avg. loan amount",
    description: "Average total loan amount across accounts that have been released.",
    formula: "mean(masterlist.total_loan)",
    unit: "php",
    direction: "neutral",
    theme: "origination",
  },
  {
    id: "origination.avgTerm",
    label: "Avg. term",
    description: "Average loan term across accounts that have been released.",
    formula: "mean(masterlist.terms)",
    unit: "months",
    direction: "neutral",
    theme: "origination",
  },
];

const FUNNEL_STAGES: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "leads", label: "Leads", statuses: [] },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "submitted", label: "Submitted", statuses: ["submitted"] },
  { key: "documents_pending", label: "Documents pending", statuses: ["documents_pending"] },
  { key: "for_verification", label: "CIG verification", statuses: ["for_verification"] },
  { key: "for_approval", label: "Committee review", statuses: ["for_approval"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "lra_pending", label: "LRA processing", statuses: ["lra_pending"] },
  { key: "released", label: "Released", statuses: ["released", "closed"] },
  { key: "loan_active", label: "Active loan", statuses: ["loan_active", "paid_off"] },
];

export type OriginationSeries = {
  funnel: Array<{ stage: string; label: string; count: number; dropoffPct: number | null }>;
  tatVsTarget: Array<{
    label: string;
    averageDays: number | null;
    targetDays: number;
    breachCount: number;
    sampleCount: number;
  }>;
  denialReasons: Array<{ reason: string; count: number }>;
  cancellationReasons: Array<{ reason: string; count: number }>;
  mixBySegment: Array<{ name: string; value: number }>;
  mixByCollateral: Array<{ name: string; value: number }>;
};

export type StuckFile = {
  applicationId: string;
  applicationNo: string | null;
  borrowerName: string | null;
  status: string;
  daysInStatus: number;
  targetDays: number;
  segment: LoanSegment | null;
  collateralType: CollateralType;
};

export type OriginationMetrics = {
  metrics: MetricValue[];
  series: OriginationSeries;
  stuckFiles: StuckFile[];
};

function metric(id: string, value: number): MetricValue {
  return { id, value, prior: null, deltaAbs: null, deltaPct: null };
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export type ApplicationRow = {
  id: string;
  application_no: string | null;
  status: string;
  status_history: Array<{ status: string; at: string }> | null;
  segment: string | null;
  collateral_type?: string | null;
  created_at: string;
};

/** For each application, the set of funnel stages it has ever reached —
 * from status_history when present, falling back to its current status. */
function reachedStages(app: ApplicationRow): Set<string> {
  const statuses = new Set<string>();
  for (const entry of app.status_history ?? []) {
    statuses.add(entry.status);
  }
  statuses.add(app.status);
  return statuses;
}

/**
 * Ordered, cumulative funnel counts with drop-off % from the prior stage.
 * "Cumulative" means an application that reached a later stage counts at
 * every earlier stage too, even if some intermediate history entries are
 * missing — a denied/cancelled application simply never reaches further.
 * Pure and exported so the cumulative-reach logic is unit-testable without
 * a database.
 */
export function buildFunnel(
  apps: ApplicationRow[],
  totalLeads: number,
): OriginationSeries["funnel"] {
  const stageReach = new Map<string, Set<string>>();
  for (const app of apps) {
    const reached = reachedStages(app);
    for (const stage of FUNNEL_STAGES) {
      if (stage.key === "leads") continue;
      if (stage.statuses.some((s) => reached.has(s))) {
        const set = stageReach.get(stage.key) ?? new Set<string>();
        set.add(app.id);
        stageReach.set(stage.key, set);
      }
    }
  }
  const stageOrder = FUNNEL_STAGES.map((s) => s.key);
  for (let i = stageOrder.length - 1; i > 1; i -= 1) {
    const later = stageReach.get(stageOrder[i]) ?? new Set<string>();
    const earlier = stageReach.get(stageOrder[i - 1]) ?? new Set<string>();
    for (const id of later) earlier.add(id);
    stageReach.set(stageOrder[i - 1], earlier);
  }

  const funnel: OriginationSeries["funnel"] = [];
  let prevCount: number | null = null;
  for (const stage of FUNNEL_STAGES) {
    const count = stage.key === "leads" ? totalLeads : (stageReach.get(stage.key)?.size ?? 0);
    const dropoffPct =
      prevCount === null || prevCount === 0 ? null : ((prevCount - count) / prevCount) * 100;
    funnel.push({ stage: stage.key, label: stage.label, count, dropoffPct });
    prevCount = count;
  }
  return funnel;
}

export async function computeOriginationMetrics(
  supabase: SupabaseClient,
  period: Period,
): Promise<OriginationMetrics> {
  const [
    { data: applications, error: appError },
    { count: leadsCreatedInPeriod, error: leadsError },
    { count: totalLeads, error: totalLeadsError },
    { count: releasedInPeriodCount, error: releasedError },
    { data: masterlistRows, error: mlError },
    { data: denialRows, error: denialError },
    { data: cancellationRows, error: cancelError },
  ] = await Promise.all([
    supabase
      .from("loan_applications")
      .select("id, application_no, status, status_history, segment, collateral_type, created_at"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${period.from}T00:00:00.000Z`)
      .lte("created_at", `${period.to}T23:59:59.999Z`),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("masterlist")
      .select("id", { count: "exact", head: true })
      .gte("release_date", period.from)
      .lte("release_date", period.to),
    supabase.from("masterlist").select("total_loan, terms"),
    supabase
      .from("denial_notices")
      .select("committee_action_id, committee_actions ( comment )"),
    supabase.from("application_cancellations").select("reason"),
  ]);

  if (appError) throw new Error(appError.message);
  if (leadsError) throw new Error(leadsError.message);
  if (totalLeadsError) throw new Error(totalLeadsError.message);
  if (releasedError) throw new Error(releasedError.message);
  if (mlError) throw new Error(mlError.message);
  if (denialError) throw new Error(denialError.message);
  if (cancelError) throw new Error(cancelError.message);

  const apps = (applications ?? []) as ApplicationRow[];
  const histories = apps.map((a) => a.status_history ?? []);

  // --- Funnel -------------------------------------------------------------
  const funnel = buildFunnel(apps, totalLeads ?? 0);

  // --- TAT vs target / SLA breaches -----------------------------------------
  const tat = computeTatFromHistories(histories);
  const breaches = computeSlaBreachesFromHistories(histories);
  const tatVsTarget = TAT_PAIRS.map((pair) => {
    const t = tat.find((x) => x.label === pair.label);
    const b = breaches.find((x) => x.label === pair.label);
    return {
      label: pair.label,
      averageDays: t?.averageDays ?? null,
      targetDays: pair.targetDays,
      breachCount: b?.breachCount ?? 0,
      sampleCount: b?.sampleCount ?? 0,
    };
  });
  const decisionStep = tatVsTarget.find((s) => s.label === "Committee decision");
  const totalBreaches = tatVsTarget.reduce((s, x) => s + x.breachCount, 0);

  // --- Loan size / term -------------------------------------------------
  const mlRows = masterlistRows ?? [];
  const avgApprovedAmount =
    mlRows.length > 0
      ? mlRows.reduce((s, r) => s + Number(r.total_loan ?? 0), 0) / mlRows.length
      : 0;
  const avgTerm =
    mlRows.length > 0
      ? mlRows.reduce((s, r) => s + Number(r.terms ?? 0), 0) / mlRows.length
      : 0;

  // --- Denial / cancellation reasons -----------------------------------
  const denialCounts = new Map<string, number>();
  for (const row of denialRows ?? []) {
    const raw = row.committee_actions as { comment: string | null } | { comment: string | null }[] | null;
    const action = Array.isArray(raw) ? raw[0] : raw;
    const reason = action?.comment?.trim() || "No reason recorded";
    denialCounts.set(reason, (denialCounts.get(reason) ?? 0) + 1);
  }
  const cancellationCounts = new Map<string, number>();
  for (const row of cancellationRows ?? []) {
    const reason = (row.reason as string | null)?.trim() || "No reason recorded";
    cancellationCounts.set(reason, (cancellationCounts.get(reason) ?? 0) + 1);
  }

  // --- Mix by segment / collateral (full coverage; loan_type_name is null pre-release) ---
  const segmentCounts = new Map<string, number>();
  const collateralCounts = new Map<CollateralType, number>();
  for (const app of apps) {
    const segmentKey = app.segment ?? "Unassigned";
    segmentCounts.set(segmentKey, (segmentCounts.get(segmentKey) ?? 0) + 1);
    const collateralKey = asCollateralType(app.collateral_type);
    collateralCounts.set(collateralKey, (collateralCounts.get(collateralKey) ?? 0) + 1);
  }

  const metrics: MetricValue[] = [
    metric("origination.conversionRate", pctOf(releasedInPeriodCount ?? 0, leadsCreatedInPeriod ?? 0)),
    metric("origination.approvalRate", approvalRatePct(apps)),
    metric("origination.avgTimeToDecision", decisionStep?.averageDays ?? 0),
    metric("origination.slaBreaches", totalBreaches),
    metric("origination.avgApprovedAmount", avgApprovedAmount),
    metric("origination.avgTerm", avgTerm),
  ];

  // --- Stuck files -----------------------------------------------------
  const targetByFromStatus = new Map(TAT_PAIRS.map((p) => [p.from, p.targetDays]));
  const now = Date.now();
  const stuckFiles: StuckFile[] = [];
  const stuckApps = apps.filter((a) => targetByFromStatus.has(a.status));
  if (stuckApps.length) {
    // `supabase` is already the service-role client the caller (the
    // dashboard route) constructed — reuse it rather than creating a
    // second one, which would pull `createServiceClient` (and its
    // `next/headers` import) into any client bundle that imports this
    // module's METRIC_DEFS, e.g. via the registry.
    const { data: withBorrowers } = await supabase
      .from("loan_applications")
      .select("id, borrowers ( first_name, last_name )")
      .in(
        "id",
        stuckApps.map((a) => a.id),
      );
    const nameById = new Map<string, string>();
    for (const row of withBorrowers ?? []) {
      const raw = row.borrowers as
        | { first_name: string | null; last_name: string | null }
        | { first_name: string | null; last_name: string | null }[]
        | null;
      const b = Array.isArray(raw) ? raw[0] : raw;
      const name = [b?.first_name, b?.last_name].filter(Boolean).join(" ").trim();
      if (name) nameById.set(row.id as string, name);
    }

    for (const app of stuckApps) {
      const target = targetByFromStatus.get(app.status) ?? 9999;
      if (target >= 9999) continue;
      const enteredAt =
        [...(app.status_history ?? [])].reverse().find((e) => e.status === app.status)?.at ??
        app.created_at;
      const daysInStatus = (now - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysInStatus > target) {
        stuckFiles.push({
          applicationId: app.id,
          applicationNo: app.application_no,
          borrowerName: nameById.get(app.id) ?? null,
          status: app.status,
          daysInStatus: Math.round(daysInStatus * 10) / 10,
          targetDays: target,
          segment: asLoanSegment(app.segment),
          collateralType: asCollateralType(app.collateral_type),
        });
      }
    }
    stuckFiles.sort((a, b) => b.daysInStatus - a.daysInStatus);
  }

  return {
    metrics,
    series: {
      funnel,
      tatVsTarget,
      denialReasons: Array.from(denialCounts.entries()).map(([reason, count]) => ({ reason, count })),
      cancellationReasons: Array.from(cancellationCounts.entries()).map(([reason, count]) => ({
        reason,
        count,
      })),
      mixBySegment: Array.from(segmentCounts.entries()).map(([name, value]) => ({
        name: segmentLabel(name),
        value,
      })),
      mixByCollateral: Array.from(collateralCounts.entries()).map(([name, value]) => ({
        name: collateralLabel(name),
        value,
      })),
    },
    stuckFiles,
  };
}
