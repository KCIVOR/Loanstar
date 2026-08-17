import type { SupabaseClient } from "@supabase/supabase-js";

import { SEQUENTIAL_RAMP } from "@/components/dashboard/charts/theme";
import { halfUp } from "@/lib/computation/money";

import type { MetricDef, MetricValue } from "./types";

export const RISK_METRIC_DEFS: MetricDef[] = [
  {
    id: "risk.par30",
    label: "PAR > 30",
    description:
      "Share of the outstanding book that is more than 30 days late — the 1-30 bucket is not counted as at-risk.",
    formula:
      "SUM(masterlist.outstanding_balance) where aging_bucket IN ('31-60','61-90','91+') ÷ SUM(outstanding_balance)",
    unit: "percent",
    direction: "down_good",
    theme: "risk",
  },
  {
    id: "risk.par90",
    label: "PAR > 90",
    description: "Share of the outstanding book that is more than 90 days late.",
    formula:
      "SUM(masterlist.outstanding_balance) where aging_bucket = '91+' ÷ SUM(outstanding_balance)",
    unit: "percent",
    direction: "down_good",
    theme: "risk",
  },
  {
    id: "risk.top10Concentration",
    label: "Top 10 concentration",
    description:
      "Share of the outstanding book held by the 10 largest accounts — how exposed the portfolio is to a handful of borrowers.",
    formula:
      "SUM(outstanding_balance of the 10 largest accounts) ÷ SUM(outstanding_balance)",
    unit: "percent",
    direction: "down_good",
    theme: "risk",
  },
  {
    id: "risk.remedialRecoveryRate",
    label: "Remedial recovery rate",
    description:
      "Of the balance owed at the moment an account was turned over to Remedial, the share collected since.",
    formula:
      "SUM(postings.amount posted after remedial_turnovers.confirmed_at) ÷ SUM(outstanding balance at the moment of turnover)",
    unit: "percent",
    direction: "up_good",
    theme: "risk",
  },
  {
    id: "risk.rolloverCount",
    label: "Rolled-over installments",
    description:
      "Count of installments that were rolled into a later installment instead of being collected on schedule.",
    formula: "COUNT(amortization_schedules) where rolled_at IS NOT NULL",
    unit: "count",
    direction: "down_good",
    theme: "risk",
  },
];

const AGING_BUCKETS = [
  { bucket: "current", label: "Current" },
  { bucket: "1-30", label: "1–30 days" },
  { bucket: "31-60", label: "31–60 days" },
  { bucket: "61-90", label: "61–90 days" },
  { bucket: "91+", label: "90+ days" },
] as const;

export type RiskSeries = {
  /** Ordered severity buckets, colored on the sequential ramp light→dark. */
  aging: Array<{ bucket: string; label: string; outstanding: number; color: string }>;
  /** Largest 10 accounts by outstanding balance. */
  top10: Array<{ masterlistId: string; name: string; outstanding: number }>;
  /** Concentration by segment — the only dimension with full coverage today. */
  concentrationBySegment: Array<{ name: string; value: number; color?: string }>;
  /**
   * Vintage — current delinquency rate by release-month cohort, capped at 6
   * cohorts (older folded into "Other"). This is a single snapshot per
   * cohort, not a multi-point curve: the schema has no historical
   * aging-bucket table, so "months on book" trajectories cannot be
   * reconstructed — only each cohort's delinquency rate as of today.
   */
  vintage: Array<{ cohort: string; accountCount: number; delinquencyPct: number }>;
};

export type RiskMetrics = {
  metrics: MetricValue[];
  series: RiskSeries;
};

type MasterlistRow = {
  id: string;
  borrower_name: string | null;
  loan_account_no: string | null;
  outstanding_balance: number;
  aging_bucket: string;
  segment: string | null;
  release_date: string | null;
};

function metric(id: string, value: number): MetricValue {
  return { id, value, prior: null, deltaAbs: null, deltaPct: null };
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export async function computeRiskMetrics(supabase: SupabaseClient): Promise<RiskMetrics> {
  const { data: masterlistRows, error: mlError } = await supabase
    .from("masterlist")
    .select("id, borrower_name, loan_account_no, outstanding_balance, aging_bucket, segment, release_date");
  if (mlError) throw new Error(mlError.message);

  const rows = ((masterlistRows ?? []) as MasterlistRow[]).map((r) => ({
    ...r,
    outstanding_balance: Number(r.outstanding_balance ?? 0),
  }));

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding_balance, 0);

  const par30Balance = rows
    .filter((r) => ["31-60", "61-90", "91+"].includes(r.aging_bucket))
    .reduce((s, r) => s + r.outstanding_balance, 0);
  const par90Balance = rows
    .filter((r) => r.aging_bucket === "91+")
    .reduce((s, r) => s + r.outstanding_balance, 0);

  const sortedByBalance = [...rows].sort((a, b) => b.outstanding_balance - a.outstanding_balance);
  const top10Rows = sortedByBalance.slice(0, 10);
  const top10Balance = top10Rows.reduce((s, r) => s + r.outstanding_balance, 0);

  const { count: rolloverCount, error: rolloverError } = await supabase
    .from("amortization_schedules")
    .select("id", { count: "exact", head: true })
    .not("rolled_at", "is", null);
  if (rolloverError) throw new Error(rolloverError.message);

  const { data: turnovers, error: turnoverError } = await supabase
    .from("remedial_turnovers")
    .select("masterlist_id, confirmed_at");
  if (turnoverError) throw new Error(turnoverError.message);

  let recoveredTotal = 0;
  let outstandingAtTurnoverTotal = 0;
  for (const turnover of turnovers ?? []) {
    const masterlistId = turnover.masterlist_id as string;
    const confirmedAt = turnover.confirmed_at as string;
    const { data: postingsAfter, error: postingsError } = await supabase
      .from("postings")
      .select("amount")
      .eq("masterlist_id", masterlistId)
      .gt("posted_at", confirmedAt);
    if (postingsError) throw new Error(postingsError.message);

    const recovered = (postingsAfter ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const currentOutstanding =
      rows.find((r) => r.id === masterlistId)?.outstanding_balance ?? 0;
    // Approximate the balance at the moment of turnover: add back what has
    // since been recovered (no historical outstanding-balance snapshot exists).
    const outstandingAtTurnover = halfUp(currentOutstanding + recovered);

    recoveredTotal = halfUp(recoveredTotal + recovered);
    outstandingAtTurnoverTotal = halfUp(outstandingAtTurnoverTotal + outstandingAtTurnover);
  }

  const metrics: MetricValue[] = [
    metric("risk.par30", pctOf(par30Balance, totalOutstanding)),
    metric("risk.par90", pctOf(par90Balance, totalOutstanding)),
    metric("risk.top10Concentration", pctOf(top10Balance, totalOutstanding)),
    metric("risk.remedialRecoveryRate", pctOf(recoveredTotal, outstandingAtTurnoverTotal)),
    metric("risk.rolloverCount", rolloverCount ?? 0),
  ];

  const aging = AGING_BUCKETS.map((b, i) => ({
    bucket: b.bucket,
    label: b.label,
    outstanding: rows
      .filter((r) => r.aging_bucket === b.bucket)
      .reduce((s, r) => s + r.outstanding_balance, 0),
    color: SEQUENTIAL_RAMP[i] ?? SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1],
  }));

  const top10 = top10Rows.map((r) => ({
    masterlistId: r.id,
    name: r.borrower_name ?? r.loan_account_no ?? "Unnamed",
    outstanding: r.outstanding_balance,
  }));

  const segmentTotals = new Map<string, number>();
  for (const r of rows) {
    const key = r.segment ?? "Unassigned";
    segmentTotals.set(key, (segmentTotals.get(key) ?? 0) + r.outstanding_balance);
  }
  const concentrationBySegment = Array.from(segmentTotals.entries()).map(([name, value]) => ({
    name: name === "sme" ? "SME" : name === "seafarer" ? "Seafarer" : name,
    value,
  }));

  const cohortAccounts = new Map<string, MasterlistRow[]>();
  for (const r of rows) {
    if (!r.release_date) continue;
    const cohort = r.release_date.slice(0, 7);
    const list = cohortAccounts.get(cohort) ?? [];
    list.push(r as unknown as MasterlistRow);
    cohortAccounts.set(cohort, list);
  }
  const cohortsSorted = Array.from(cohortAccounts.keys()).sort((a, b) => b.localeCompare(a));
  const topCohorts = cohortsSorted.slice(0, 6);
  const olderCohorts = cohortsSorted.slice(6);

  const vintage = topCohorts
    .map((cohort) => {
      const accounts = cohortAccounts.get(cohort) ?? [];
      const delinquent = accounts.filter((a) => a.aging_bucket !== "current").length;
      return {
        cohort,
        accountCount: accounts.length,
        delinquencyPct: pctOf(delinquent, accounts.length),
      };
    })
    .sort((a, b) => a.cohort.localeCompare(b.cohort));

  if (olderCohorts.length) {
    const otherAccounts = olderCohorts.flatMap((c) => cohortAccounts.get(c) ?? []);
    const otherDelinquent = otherAccounts.filter((a) => a.aging_bucket !== "current").length;
    vintage.unshift({
      cohort: "Other",
      accountCount: otherAccounts.length,
      delinquencyPct: pctOf(otherDelinquent, otherAccounts.length),
    });
  }

  return {
    metrics,
    series: { aging, top10, concentrationBySegment, vintage },
  };
}
