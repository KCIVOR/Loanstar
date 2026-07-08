import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationStatus } from "@/lib/constants";

export type AgingReport = {
  current: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket91_plus: number;
  totalOutstanding: number;
};

export type PipelineReport = Record<string, number>;

export type IncomeReport = {
  totalPosted: number;
  totalPenalties: number;
  paymentCount: number;
};

export type CollectionReport = {
  dcrsSubmitted: number;
  dcrsReconciled: number;
  pendingProofs: number;
  postedPayments: number;
};

export type TatStep = {
  from: ApplicationStatus | string;
  to: ApplicationStatus | string;
  label: string;
  averageDays: number | null;
  sampleCount: number;
};

const TAT_PAIRS: Array<{
  from: string;
  to: string;
  label: string;
}> = [
  { from: "submitted", to: "for_verification", label: "Intake → CIG" },
  { from: "for_verification", to: "for_approval", label: "CIG → Committee" },
  { from: "for_approval", to: "approved", label: "Committee decision" },
  { from: "approved", to: "lra_pending", label: "Approval → LRA queue" },
  { from: "lra_pending", to: "closed", label: "LRA processing" },
  { from: "closed", to: "loan_active", label: "Close → Active loan" },
];

function daysBetween(a: string, b: string): number {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  return (end - start) / (1000 * 60 * 60 * 24);
}

export function computeTatFromHistories(
  histories: Array<Array<{ status: string; at: string }>>,
): TatStep[] {
  return TAT_PAIRS.map((pair) => {
    const durations: number[] = [];

    for (const history of histories) {
      const fromEntry = history.find((e) => e.status === pair.from);
      const toEntry = history.find(
        (e) => e.status === pair.to && (!fromEntry || e.at >= fromEntry.at),
      );
      if (fromEntry && toEntry) {
        durations.push(daysBetween(fromEntry.at, toEntry.at));
      }
    }

    const averageDays =
      durations.length > 0
        ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) /
          10
        : null;

    return {
      from: pair.from,
      to: pair.to,
      label: pair.label,
      averageDays,
      sampleCount: durations.length,
    };
  });
}

export async function buildAgingReport(
  supabase: SupabaseClient,
): Promise<AgingReport> {
  const { data, error } = await supabase
    .from("masterlist")
    .select("aging_bucket, outstanding_balance, account_status")
    .neq("account_status", "paid");

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const sum = (bucket: string) =>
    rows
      .filter((r) => r.aging_bucket === bucket)
      .reduce((s, r) => s + Number(r.outstanding_balance), 0);

  return {
    current: rows.filter((r) => r.aging_bucket === "current").length,
    bucket1_30: rows.filter((r) => r.aging_bucket === "1-30").length,
    bucket31_60: rows.filter((r) => r.aging_bucket === "31-60").length,
    bucket61_90: rows.filter((r) => r.aging_bucket === "61-90").length,
    bucket91_plus: rows.filter((r) => r.aging_bucket === "91+").length,
    totalOutstanding: rows.reduce(
      (s, r) => s + Number(r.outstanding_balance),
      0,
    ),
  };
}

export async function buildPipelineReport(
  supabase: SupabaseClient,
): Promise<PipelineReport> {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("status");

  if (error) throw new Error(error.message);

  const counts: PipelineReport = {};
  for (const row of data ?? []) {
    const status = row.status as string;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function buildIncomeReport(
  supabase: SupabaseClient,
): Promise<IncomeReport> {
  const [{ data: postings, error: pErr }, { data: penalties, error: penErr }] =
    await Promise.all([
      supabase.from("postings").select("amount"),
      supabase.from("penalties").select("amount"),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (penErr) throw new Error(penErr.message);

  return {
    totalPosted: (postings ?? []).reduce((s, r) => s + Number(r.amount), 0),
    totalPenalties: (penalties ?? []).reduce((s, r) => s + Number(r.amount), 0),
    paymentCount: postings?.length ?? 0,
  };
}

export async function buildCollectionReport(
  supabase: SupabaseClient,
): Promise<CollectionReport> {
  const [
    { count: submitted },
    { count: reconciled },
    { count: pendingProofs },
    { count: postedPayments },
  ] = await Promise.all([
    supabase
      .from("dcr")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("dcr")
      .select("id", { count: "exact", head: true })
      .eq("status", "reconciled"),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_verification"),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted"),
  ]);

  return {
    dcrsSubmitted: submitted ?? 0,
    dcrsReconciled: reconciled ?? 0,
    pendingProofs: pendingProofs ?? 0,
    postedPayments: postedPayments ?? 0,
  };
}

export async function buildExecutiveSummary(
  supabase: SupabaseClient,
) {
  const [
    pipeline,
    aging,
    income,
    collection,
    { count: activeLoans },
    { data: portfolios },
  ] = await Promise.all([
    buildPipelineReport(supabase),
    buildAgingReport(supabase),
    buildIncomeReport(supabase),
    buildCollectionReport(supabase),
    supabase.from("masterlist").select("id", { count: "exact", head: true }),
    supabase.from("portfolios").select("id, name"),
  ]);

  const { data: histories } = await supabase
    .from("loan_applications")
    .select("status_history")
    .not("status_history", "eq", "[]");

  const tat = computeTatFromHistories(
    (histories ?? []).map((h) => h.status_history as Array<{ status: string; at: string }>),
  );

  return {
    pipeline,
    aging,
    income,
    collection,
    activeLoans: activeLoans ?? 0,
    portfolios: portfolios ?? [],
    tat,
    generatedAt: new Date().toISOString(),
  };
}
