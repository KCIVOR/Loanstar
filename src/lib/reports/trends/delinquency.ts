import {
  buildCoverage,
  daysLateAt,
  parseDate,
  point,
  round,
  type MonthWindow,
} from "./calendar";
import type { TrendInputs, TrendPostingRow, TrendScheduleRow } from "./inputs";
import type { TrendGroup, TrendPoint } from "./types";

type Cursor = {
  index: number;
  /** Cumulative posted against a specific installment */
  paidBySchedule: Map<string, number>;
  /** Cumulative posted against a loan with no installment named */
  looseByLoan: Map<string, number>;
};

function sortByPostedAt(postings: TrendPostingRow[]): TrendPostingRow[] {
  return [...postings]
    .filter((p) => p.postedAt)
    .sort((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
}

function groupSchedulesByLoan(
  schedules: TrendScheduleRow[],
): Map<string, TrendScheduleRow[]> {
  const byLoan = new Map<string, TrendScheduleRow[]>();
  for (const schedule of schedules) {
    const list = byLoan.get(schedule.masterlistId) ?? [];
    list.push(schedule);
    byLoan.set(schedule.masterlistId, list);
  }
  for (const list of byLoan.values()) {
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }
  return byLoan;
}

function advance(sorted: TrendPostingRow[], cursor: Cursor, window: MonthWindow): void {
  while (cursor.index < sorted.length) {
    const posting = sorted[cursor.index]!;
    const at = parseDate(posting.postedAt);
    if (!at || at >= window.end) break;
    if (posting.scheduleId) {
      cursor.paidBySchedule.set(
        posting.scheduleId,
        (cursor.paidBySchedule.get(posting.scheduleId) ?? 0) + posting.amount,
      );
    } else if (posting.masterlistId) {
      cursor.looseByLoan.set(
        posting.masterlistId,
        (cursor.looseByLoan.get(posting.masterlistId) ?? 0) + posting.amount,
      );
    }
    cursor.index += 1;
  }
}

export type AgingSnapshot = {
  month: string;
  buckets: { "1-30": number; "31-60": number; "61-90": number; "91+": number };
  overdueTotal: number;
  overdueAccounts: number;
};

/**
 * Reconstructs delinquency at each month end from the payment ledger, which is
 * what makes PAR history possible without a nightly snapshot table: a schedule
 * was overdue on date D if it was due by D and the payments recorded by D did
 * not cover it.
 *
 * About 5% of postings carry no installment reference. Those are pooled per
 * loan and waterfalled oldest-debt-first, the same order AR applies cash, so an
 * unreferenced payment still clears the debt it was meant for instead of
 * leaving a phantom arrear on the chart.
 *
 * `outstandingByMonth` comes from the portfolio group so PAR shares its
 * denominator with the outstanding figure shown next to it.
 */
export function computeDelinquencyTrend(
  inputs: TrendInputs,
  windows: MonthWindow[],
  outstandingByMonth: Map<string, number>,
): TrendGroup & { snapshots: AgingSnapshot[] } {
  const sorted = sortByPostedAt(inputs.postings);
  const schedulesByLoan = groupSchedulesByLoan(inputs.schedules);
  const cursor: Cursor = {
    index: 0,
    paidBySchedule: new Map(),
    looseByLoan: new Map(),
  };

  const par30: TrendPoint[] = [];
  const par90: TrendPoint[] = [];
  const overdueAmount: TrendPoint[] = [];
  const snapshots: AgingSnapshot[] = [];

  for (const window of windows) {
    advance(sorted, cursor, window);

    const buckets = { "1-30": 0, "31-60": 0, "61-90": 0, "91+": 0 };
    let overdueTotal = 0;
    let over30 = 0;
    let over90 = 0;
    const lateLoans = new Set<string>();

    for (const [loanId, schedules] of schedulesByLoan) {
      let pool = cursor.looseByLoan.get(loanId) ?? 0;

      for (const schedule of schedules) {
        const dueAt = parseDate(schedule.dueDate);
        if (!dueAt || dueAt >= window.end) break;

        const owed = schedule.amountDue + schedule.penaltyAmount;
        let shortfall = owed - (cursor.paidBySchedule.get(schedule.id) ?? 0);
        if (shortfall > 0 && pool > 0) {
          const applied = Math.min(pool, shortfall);
          pool -= applied;
          shortfall -= applied;
        }
        if (shortfall <= 0.005) continue;

        const daysLate = daysLateAt(schedule.dueDate, window);
        if (daysLate < 1) continue;

        overdueTotal += shortfall;
        lateLoans.add(loanId);
        if (daysLate <= 30) buckets["1-30"] += shortfall;
        else if (daysLate <= 60) buckets["31-60"] += shortfall;
        else if (daysLate <= 90) buckets["61-90"] += shortfall;
        else buckets["91+"] += shortfall;

        if (daysLate > 30) over30 += shortfall;
        if (daysLate > 90) over90 += shortfall;
      }
    }

    const outstanding = outstandingByMonth.get(window.key) ?? 0;
    par30.push(point(window, outstanding > 0 ? round((over30 / outstanding) * 100, 1) : null));
    par90.push(point(window, outstanding > 0 ? round((over90 / outstanding) * 100, 1) : null));
    overdueAmount.push(point(window, round(overdueTotal)));
    snapshots.push({
      month: window.key,
      buckets: {
        "1-30": round(buckets["1-30"]),
        "31-60": round(buckets["31-60"]),
        "61-90": round(buckets["61-90"]),
        "91+": round(buckets["91+"]),
      },
      overdueTotal: round(overdueTotal),
      overdueAccounts: lateLoans.size,
    });
  }

  return {
    id: "delinquency",
    label: "Delinquency risk",
    series: [
      { id: "delinquency.par30", label: "PAR > 30", unit: "percent", points: par30 },
      { id: "delinquency.par90", label: "PAR > 90", unit: "percent", points: par90 },
      { id: "delinquency.overdue", label: "Amount overdue", unit: "php", points: overdueAmount },
    ],
    coverage: buildCoverage(
      "Installment due dates",
      windows,
      inputs.schedules.map((schedule) => schedule.dueDate),
    ),
    snapshots,
  };
}
