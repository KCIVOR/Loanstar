import {
  buildCoverage,
  inWindow,
  parseDate,
  point,
  round,
  type MonthWindow,
} from "./calendar";
import type { TrendInputs, TrendPostingRow } from "./inputs";
import type { TrendGroup, TrendPoint } from "./types";

/** Cumulative amount posted per loan, advanced window by window so each month
 *  end sees every payment made on or before it. */
function advancePaid(
  sorted: TrendPostingRow[],
  cursor: number,
  window: MonthWindow,
  paidByLoan: Map<string, number>,
): number {
  let index = cursor;
  while (index < sorted.length) {
    const posting = sorted[index]!;
    const at = parseDate(posting.postedAt);
    if (!at || at >= window.end) break;
    if (posting.masterlistId) {
      paidByLoan.set(
        posting.masterlistId,
        (paidByLoan.get(posting.masterlistId) ?? 0) + posting.amount,
      );
    }
    index += 1;
  }
  return index;
}

function sortByPostedAt(postings: TrendPostingRow[]): TrendPostingRow[] {
  return [...postings]
    .filter((p) => p.postedAt)
    .sort((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
}

/**
 * Book size over time. Outstanding at a month end is total released on or
 * before that date minus everything posted against it by then — the same
 * reconstruction `buildArWidget` uses for its dashboard trend, applied per loan
 * so the active-loan count stays consistent with the peso figure beside it.
 */
export function computePortfolioTrend(
  inputs: TrendInputs,
  windows: MonthWindow[],
): TrendGroup {
  const sorted = sortByPostedAt(inputs.postings);
  const paidByLoan = new Map<string, number>();
  let cursor = 0;

  const released: TrendPoint[] = [];
  const outstanding: TrendPoint[] = [];
  const activeLoans: TrendPoint[] = [];

  for (const window of windows) {
    cursor = advancePaid(sorted, cursor, window, paidByLoan);

    let releasedInMonth = 0;
    let outstandingAtEnd = 0;
    let activeAtEnd = 0;

    for (const loan of inputs.loans) {
      if (!loan.releaseDate) continue;
      if (inWindow(loan.releaseDate, window)) releasedInMonth += loan.totalLoan;
      const releasedAt = parseDate(loan.releaseDate);
      if (!releasedAt || releasedAt >= window.end) continue;

      const balance = loan.totalLoan - (paidByLoan.get(loan.id) ?? 0);
      if (balance > 0) {
        outstandingAtEnd += balance;
        activeAtEnd += 1;
      }
    }

    released.push(point(window, round(releasedInMonth)));
    outstanding.push(point(window, round(outstandingAtEnd)));
    activeLoans.push(point(window, activeAtEnd));
  }

  return {
    id: "portfolio",
    label: "Portfolio performance",
    series: [
      { id: "portfolio.outstanding", label: "Outstanding at month end", unit: "php", points: outstanding },
      { id: "portfolio.released", label: "Released in month", unit: "php", points: released },
      { id: "portfolio.activeLoans", label: "Active loans", unit: "count", points: activeLoans },
    ],
    coverage: buildCoverage(
      "Loan releases",
      windows,
      inputs.loans.map((loan) => loan.releaseDate),
    ),
  };
}
