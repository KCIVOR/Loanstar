import type { SupabaseClient } from "@supabase/supabase-js";

import { computeDelta, priorPeriod } from "../period";
import type { MetricDef, MetricValue, Period } from "./types";

export const MONEY_METRIC_DEFS: MetricDef[] = [
  {
    id: "money.released",
    label: "Released",
    description:
      "Total principal of loans released to borrowers during the selected period.",
    formula: "SUM(masterlist.total_loan) where release_date is in the period",
    unit: "php",
    direction: "up_good",
    theme: "money",
  },
  {
    id: "money.receivable",
    label: "Total receivable",
    description:
      "Total amount contractually due across the entire active book, paid or not — the ceiling collections can reach.",
    formula:
      "SUM(amortization_schedules.amount_due + penalty_amount) across all schedules",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
  {
    id: "money.collected",
    label: "Collected",
    description: "Total cash posted to borrower accounts during the selected period.",
    formula: "SUM(postings.amount) where posted_at is in the period",
    unit: "php",
    direction: "up_good",
    theme: "money",
  },
  {
    id: "money.outstanding",
    label: "Outstanding",
    description:
      "Total balance still owed across the active book as of now — a snapshot, not scoped to the selected period.",
    formula: "SUM(masterlist.outstanding_balance)",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
  {
    id: "money.collectionEfficiency",
    label: "Collection efficiency",
    description:
      "Share of the amount that fell due during the period which was actually collected in that same period.",
    formula:
      "SUM(postings.amount in period) ÷ SUM(amortization_schedules.amount_due + penalty_amount where due_date in period)",
    unit: "percent",
    direction: "up_good",
    theme: "money",
  },
  {
    id: "money.penaltyIncome",
    label: "Penalty income",
    description:
      "Total late-payment penalties assessed during the selected period — a symptom of delinquency as much as it is revenue.",
    formula: "SUM(penalties.amount) where calculated_at is in the period",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
  {
    id: "money.avgDaysToCollect",
    label: "Average days to collect",
    description:
      "Average number of days between an installment's due date and the day it was actually posted, for postings in the selected period.",
    formula:
      "mean(postings.posted_at − amortization_schedules.due_date) for postings in the period with a linked schedule",
    unit: "days",
    direction: "down_good",
    theme: "money",
  },
  {
    id: "money.projected30",
    label: "Projected inflow (30 days)",
    description:
      "Total amount due across all unpaid installments falling due within the next 30 days from today.",
    formula:
      "SUM(amount_due + penalty_amount − amount_paid) where status <> 'paid' and due_date is within 30 days of today",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
  {
    id: "money.projected60",
    label: "Projected inflow (60 days)",
    description:
      "Total amount due across all unpaid installments falling due within the next 60 days from today.",
    formula:
      "SUM(amount_due + penalty_amount − amount_paid) where status <> 'paid' and due_date is within 60 days of today",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
  {
    id: "money.projected90",
    label: "Projected inflow (90 days)",
    description:
      "Total amount due across all unpaid installments falling due within the next 90 days from today.",
    formula:
      "SUM(amount_due + penalty_amount − amount_paid) where status <> 'paid' and due_date is within 90 days of today",
    unit: "php",
    direction: "neutral",
    theme: "money",
  },
];

export type MoneySeries = {
  /** Monthly collected totals, oldest first — feeds the cash-in trend LineMini. */
  cashInTrend: Array<{ month: string; collected: number }>;
  /** Single-row split of total receivable into collected vs still outstanding — feeds the HBarMini. */
  collectedVsOutstanding: Array<{ name: string; collected: number; outstanding: number }>;
};

export type MoneyMetrics = {
  metrics: MetricValue[];
  series: MoneySeries;
};

function inPeriod(dateIso: string, period: Period): boolean {
  return dateIso >= period.from && dateIso <= period.to;
}

function daysBetween(a: string, b: string): number {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  return (end - start) / (1000 * 60 * 60 * 24);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function sumPostingsCollected(
  supabase: SupabaseClient,
  period: Period,
): Promise<number> {
  const { data, error } = await supabase
    .from("postings")
    .select("amount, posted_at")
    .gte("posted_at", `${period.from}T00:00:00.000Z`)
    .lte("posted_at", `${period.to}T23:59:59.999Z`);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

/** All-time collected total — the counterpart to `outstanding` when splitting
 * total receivable (both are stocks, unlike the period-scoped `collected` KPI). */
async function sumAllTimeCollected(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("postings").select("amount");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

async function sumReleasedInPeriod(
  supabase: SupabaseClient,
  period: Period,
): Promise<number> {
  const { data, error } = await supabase
    .from("masterlist")
    .select("total_loan, release_date")
    .gte("release_date", period.from)
    .lte("release_date", period.to);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.total_loan ?? 0), 0);
}

async function sumPenaltyIncome(
  supabase: SupabaseClient,
  period: Period,
): Promise<number> {
  const { data, error } = await supabase
    .from("penalties")
    .select("amount, calculated_at")
    .gte("calculated_at", `${period.from}T00:00:00.000Z`)
    .lte("calculated_at", `${period.to}T23:59:59.999Z`);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

async function sumDueInPeriod(
  supabase: SupabaseClient,
  period: Period,
): Promise<number> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select("amount_due, penalty_amount, due_date")
    .gte("due_date", period.from)
    .lte("due_date", period.to);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (s, r) => s + Number(r.amount_due) + Number(r.penalty_amount ?? 0),
    0,
  );
}

async function computeAvgDaysToCollect(
  supabase: SupabaseClient,
  period: Period,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("postings")
    .select("posted_at, amortization_schedule_id")
    .gte("posted_at", `${period.from}T00:00:00.000Z`)
    .lte("posted_at", `${period.to}T23:59:59.999Z`)
    .not("amortization_schedule_id", "is", null);
  if (error) throw new Error(error.message);

  const scheduleIds = Array.from(
    new Set((data ?? []).map((r) => r.amortization_schedule_id as string)),
  );
  if (!scheduleIds.length) return null;

  const { data: schedules, error: schedError } = await supabase
    .from("amortization_schedules")
    .select("id, due_date")
    .in("id", scheduleIds);
  if (schedError) throw new Error(schedError.message);

  const dueDateById = new Map(
    (schedules ?? []).map((s) => [s.id as string, s.due_date as string]),
  );

  const days: number[] = [];
  for (const row of data ?? []) {
    const dueDate = dueDateById.get(row.amortization_schedule_id as string);
    if (!dueDate) continue;
    days.push(daysBetween(dueDate, (row.posted_at as string).slice(0, 10)));
  }
  if (!days.length) return null;
  return days.reduce((s, d) => s + d, 0) / days.length;
}

async function sumProjectedInflow(
  supabase: SupabaseClient,
  withinDays: number,
): Promise<number> {
  const today = toIsoDate(new Date());
  const horizon = toIsoDate(addDays(new Date(), withinDays));
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select("amount_due, penalty_amount, amount_paid, due_date, status")
    .neq("status", "paid")
    .gte("due_date", today)
    .lte("due_date", horizon);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (s, r) =>
      s +
      Number(r.amount_due) +
      Number(r.penalty_amount ?? 0) -
      Number(r.amount_paid ?? 0),
    0,
  );
}

async function buildCashInTrend(
  supabase: SupabaseClient,
): Promise<MoneySeries["cashInTrend"]> {
  const { data, error } = await supabase
    .from("postings")
    .select("amount, posted_at")
    .order("posted_at", { ascending: true });
  if (error) throw new Error(error.message);

  const byMonth = new Map<string, number>();
  for (const row of data ?? []) {
    const month = (row.posted_at as string).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(row.amount));
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, collected]) => ({ month, collected }));
}

export async function computeMoneyMetrics(
  supabase: SupabaseClient,
  period: Period,
): Promise<MoneyMetrics> {
  const prior = priorPeriod(period);

  const [
    released,
    releasedPrior,
    collected,
    collectedPrior,
    penaltyIncome,
    penaltyIncomePrior,
    dueInPeriod,
    dueInPeriodPrior,
    avgDaysToCollect,
    avgDaysToCollectPrior,
    receivableRows,
    outstandingRows,
    allTimeCollected,
    projected30,
    projected60,
    projected90,
    cashInTrend,
  ] = await Promise.all([
    sumReleasedInPeriod(supabase, period),
    sumReleasedInPeriod(supabase, prior),
    sumPostingsCollected(supabase, period),
    sumPostingsCollected(supabase, prior),
    sumPenaltyIncome(supabase, period),
    sumPenaltyIncome(supabase, prior),
    sumDueInPeriod(supabase, period),
    sumDueInPeriod(supabase, prior),
    computeAvgDaysToCollect(supabase, period),
    computeAvgDaysToCollect(supabase, prior),
    supabase.from("amortization_schedules").select("amount_due, penalty_amount"),
    supabase.from("masterlist").select("outstanding_balance"),
    sumAllTimeCollected(supabase),
    sumProjectedInflow(supabase, 30),
    sumProjectedInflow(supabase, 60),
    sumProjectedInflow(supabase, 90),
    buildCashInTrend(supabase),
  ]);

  if (receivableRows.error) throw new Error(receivableRows.error.message);
  if (outstandingRows.error) throw new Error(outstandingRows.error.message);

  const receivable = (receivableRows.data ?? []).reduce(
    (s, r) => s + Number(r.amount_due) + Number(r.penalty_amount ?? 0),
    0,
  );
  const outstanding = (outstandingRows.data ?? []).reduce(
    (s, r) => s + Number(r.outstanding_balance ?? 0),
    0,
  );

  const collectionEfficiency = dueInPeriod > 0 ? (collected / dueInPeriod) * 100 : null;
  const collectionEfficiencyPrior =
    dueInPeriodPrior > 0 ? (collectedPrior / dueInPeriodPrior) * 100 : null;

  function metric(id: string, value: number, prior: number | null): MetricValue {
    const { deltaAbs, deltaPct } = computeDelta(value, prior);
    return { id, value, prior, deltaAbs, deltaPct };
  }

  const metrics: MetricValue[] = [
    metric("money.released", released, releasedPrior),
    metric("money.receivable", receivable, null),
    metric("money.collected", collected, collectedPrior),
    metric("money.outstanding", outstanding, null),
    metric(
      "money.collectionEfficiency",
      collectionEfficiency ?? 0,
      collectionEfficiency === null ? null : collectionEfficiencyPrior,
    ),
    metric("money.penaltyIncome", penaltyIncome, penaltyIncomePrior),
    metric(
      "money.avgDaysToCollect",
      avgDaysToCollect ?? 0,
      avgDaysToCollect === null ? null : avgDaysToCollectPrior,
    ),
    metric("money.projected30", projected30, null),
    metric("money.projected60", projected60, null),
    metric("money.projected90", projected90, null),
  ];

  return {
    metrics,
    series: {
      cashInTrend,
      collectedVsOutstanding: [
        { name: "Book", collected: allTimeCollected, outstanding },
      ],
    },
  };
}
