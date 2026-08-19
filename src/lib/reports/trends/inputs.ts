import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/reports/paginate";

/** Raw rows the pure trend modules run on. Nothing here is period-scoped —
 *  trends always look back over whole months, and the caller picks how many. */
export type TrendLoanRow = {
  id: string;
  totalLoan: number;
  releaseDate: string | null;
  accountStatus: string;
};

export type TrendScheduleRow = {
  id: string;
  masterlistId: string;
  dueDate: string;
  amountDue: number;
  penaltyAmount: number;
};

export type TrendPostingRow = {
  scheduleId: string | null;
  masterlistId: string | null;
  amount: number;
  postedAt: string | null;
};

export type TrendDecisionRow = {
  action: string;
  actedAt: string | null;
};

export type TrendInputs = {
  loans: TrendLoanRow[];
  schedules: TrendScheduleRow[];
  postings: TrendPostingRow[];
  decisions: TrendDecisionRow[];
};

type RawLoan = {
  id: string;
  total_loan: number | null;
  release_date: string | null;
  account_status: string | null;
};
type RawSchedule = {
  id: string;
  masterlist_id: string;
  due_date: string;
  amount_due: number | null;
  penalty_amount: number | null;
};
type RawPosting = {
  amortization_schedule_id: string | null;
  masterlist_id: string | null;
  amount: number | null;
  posted_at: string | null;
};
type RawDecision = { action: string | null; acted_at: string | null };

export async function fetchTrendInputs(supabase: SupabaseClient): Promise<TrendInputs> {
  const [loans, schedules, postings, decisions] = await Promise.all([
    fetchAllRows<RawLoan>(supabase, {
      table: "masterlist",
      columns: "id, total_loan, release_date, account_status",
      order: "id",
    }),
    fetchAllRows<RawSchedule>(supabase, {
      table: "amortization_schedules",
      columns: "id, masterlist_id, due_date, amount_due, penalty_amount",
      order: "id",
    }),
    fetchAllRows<RawPosting>(supabase, {
      table: "postings",
      columns: "amortization_schedule_id, masterlist_id, amount, posted_at",
      order: "id",
    }),
    fetchAllRows<RawDecision>(supabase, {
      table: "committee_actions",
      columns: "action, acted_at",
      order: "id",
    }),
  ]);

  return {
    loans: loans.map((row) => ({
      id: row.id,
      totalLoan: Number(row.total_loan ?? 0),
      releaseDate: row.release_date,
      accountStatus: row.account_status ?? "",
    })),
    schedules: schedules.map((row) => ({
      id: row.id,
      masterlistId: row.masterlist_id,
      dueDate: row.due_date,
      amountDue: Number(row.amount_due ?? 0),
      penaltyAmount: Number(row.penalty_amount ?? 0),
    })),
    postings: postings.map((row) => ({
      scheduleId: row.amortization_schedule_id,
      masterlistId: row.masterlist_id,
      amount: Number(row.amount ?? 0),
      postedAt: row.posted_at,
    })),
    decisions: decisions.map((row) => ({
      action: row.action ?? "",
      actedAt: row.acted_at,
    })),
  };
}
