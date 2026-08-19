import type { StuckFile } from "@/lib/reports/metrics/origination";
import type { MetricValue, Period } from "@/lib/reports/metrics/types";
import {
  filterLoanRegister,
  groupLoansByBorrower,
  sortByOutstandingDesc,
  type BorrowerRegisterRow,
  type LoanRegisterRow,
  type PastDueAging,
  type PastDueRow,
  type RegisterFilters,
} from "@/lib/reports/registers";

import { budgetFor, fitToBudget } from "./budget";
import {
  enrichMetrics,
  LIST_SKILL_LIMIT,
  matchesRegisterQuery,
  type AccountView,
} from "./shared";

export function redactLoanRow(
  row: LoanRegisterRow,
  includeBorrowerNames: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    loanAccountNo: row.loanAccountNo,
    segment: row.segment,
    collateralType: row.collateralType,
    accountStatus: row.accountStatus,
    agingBucket: row.agingBucket,
    outstanding: row.outstanding,
    totalLoan: row.totalLoan,
    releaseDate: row.releaseDate,
    collectorName: row.collectorName,
    remedialName: row.remedialName,
  };
  if (includeBorrowerNames) {
    base.borrowerName = row.borrowerName;
    base.masterlistId = row.masterlistId;
  }
  return base;
}

export function redactBorrowerRow(
  row: BorrowerRegisterRow,
  includeBorrowerNames: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    loanCount: row.loanCount,
    outstanding: row.outstanding,
    worstAging: row.worstAging,
    segment: row.segment,
  };
  if (includeBorrowerNames) {
    base.name = row.name;
    base.borrowerId = row.borrowerId;
    base.largestMasterlistId = row.largestMasterlistId;
  }
  return base;
}

export function redactPastDueRow(
  row: PastDueRow,
  includeBorrowerNames: boolean,
): Record<string, unknown> {
  return { ...redactLoanRow(row, includeBorrowerNames), daysLate: row.daysLate };
}

export function redactStuckFile(
  file: StuckFile,
  includeBorrowerNames: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    applicationNo: file.applicationNo,
    status: file.status,
    daysInStatus: file.daysInStatus,
    targetDays: file.targetDays,
    segment: file.segment,
    collateralType: file.collateralType,
  };
  if (includeBorrowerNames) {
    base.borrowerName = file.borrowerName;
  }
  return base;
}

/**
 * Two ceilings apply, in order: `LIST_SKILL_LIMIT` caps how many rows are ever
 * worth sending, then the character budget trims further if those rows are wide.
 * `kpis.count` always reports the true total, so the model can say "the 12
 * largest of 340" rather than mistaking the page for the whole book.
 */
function paginateRegister<R extends { outstanding: number }, H extends object>(
  rows: R[],
  budget: number,
  map: (row: R) => Record<string, unknown>,
  head: H,
) {
  const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);
  const capped = rows.slice(0, LIST_SKILL_LIMIT);
  const beyondCap = rows.length - capped.length;

  return fitToBudget(capped, budget, (visible, dropped) => {
    const omitted = beyondCap + dropped;
    return {
      ...head,
      kpis: { count: rows.length, outstanding },
      shown: visible.length,
      omitted,
      truncated: omitted > 0,
      rows: visible.map(map),
    };
  });
}

export function buildListAccountsPayload(
  loans: LoanRegisterRow[],
  filters: RegisterFilters,
  view: AccountView,
  includeBorrowerNames: boolean,
  q = "",
  budget = budgetFor("list_accounts"),
) {
  let filtered = sortByOutstandingDesc(filterLoanRegister(loans, filters));
  if (q) {
    filtered = filtered.filter((row) =>
      matchesRegisterQuery([row.borrowerName, row.loanAccountNo], q),
    );
  }
  const head = { view, filters, q: q || undefined };

  if (view === "borrowers") {
    const borrowers = groupLoansByBorrower(filtered).filter((row) =>
      q ? matchesRegisterQuery([row.name], q) : true,
    );
    return paginateRegister(
      borrowers,
      budget,
      (row) => redactBorrowerRow(row, includeBorrowerNames),
      head,
    );
  }

  return paginateRegister(
    filtered,
    budget,
    (row) => redactLoanRow(row, includeBorrowerNames),
    head,
  );
}

export function buildListPastDuePayload(
  rows: PastDueRow[],
  aging: PastDueAging,
  includeBorrowerNames: boolean,
  q = "",
  budget = budgetFor("list_past_due"),
) {
  let sorted = sortByOutstandingDesc(rows);
  if (q) {
    sorted = sorted.filter((row) =>
      matchesRegisterQuery([row.borrowerName, row.loanAccountNo], q),
    );
  }
  return paginateRegister(
    sorted,
    budget,
    (row) => redactPastDueRow(row, includeBorrowerNames),
    { aging, q: q || undefined },
  );
}

export function buildListPipelinePayload(
  period: Period,
  metrics: MetricValue[],
  stuckFiles: StuckFile[],
  includeBorrowerNames: boolean,
  q = "",
  budget = budgetFor("list_pipeline"),
) {
  const matched = q
    ? stuckFiles.filter((file) =>
        matchesRegisterQuery([file.borrowerName, file.applicationNo], q),
      )
    : stuckFiles;
  const capped = matched.slice(0, LIST_SKILL_LIMIT);
  const beyondCap = matched.length - capped.length;

  return fitToBudget(capped, budget, (visible, dropped) => {
    const omitted = beyondCap + dropped;
    return {
      period,
      q: q || undefined,
      metrics: enrichMetrics(metrics),
      kpis: { stuckFileCount: matched.length },
      shown: visible.length,
      omitted,
      truncated: omitted > 0,
      stuckFiles: visible.map((file) => redactStuckFile(file, includeBorrowerNames)),
    };
  });
}
