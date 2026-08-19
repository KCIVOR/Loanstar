import type { CollateralType, LoanSegment, ReportCollateral, ReportSegment } from "./segments";

export type LoanRegisterRow = {
  masterlistId: string;
  loanAccountNo: string | null;
  borrowerId: string;
  borrowerName: string;
  segment: LoanSegment | null;
  collateralType: CollateralType;
  accountStatus: "active" | "remedial" | "paid" | string;
  agingBucket: "current" | "1-30" | "31-60" | "61-90" | "91+" | string;
  outstanding: number;
  totalLoan: number;
  releaseDate: string | null;
  collectorName: string | null;
  remedialName: string | null;
};

export type BorrowerRegisterRow = {
  borrowerId: string;
  name: string;
  loanCount: number;
  outstanding: number;
  worstAging: string;
  segment: string | null;
  largestMasterlistId: string;
};

export type RegisterFilters = {
  status: "unpaid" | "paid" | "all";
  segment: ReportSegment;
  aging: "all" | "current" | "1-30" | "31-60" | "61-90" | "91+";
  collateral: ReportCollateral;
};

export type PastDueAging = "all" | "1-30" | "31-60" | "61-90" | "91+" | "par30";

export type PastDueRow = LoanRegisterRow & { daysLate: number };

export const PAST_DUE_BUCKETS = ["1-30", "31-60", "61-90", "91+"] as const;
export const PAR30_BUCKETS = ["31-60", "61-90", "91+"] as const;

export const PAGE_SIZES = [10, 20, 30, 50, 100] as const;

const AGING_RANK = ["91+", "61-90", "31-60", "1-30", "current"];

const UNPAID = new Set(["active", "remedial"]);

export function groupLoansByBorrower(rows: LoanRegisterRow[]): BorrowerRegisterRow[] {
  const groups = new Map<string, LoanRegisterRow[]>();
  for (const row of rows) {
    const list = groups.get(row.borrowerId) ?? [];
    list.push(row);
    groups.set(row.borrowerId, list);
  }

  const result: BorrowerRegisterRow[] = [];
  for (const [borrowerId, loans] of groups) {
    const segments = new Set(loans.map((l) => l.segment));
    let worstAging = loans[0]?.agingBucket ?? "current";
    for (const rank of AGING_RANK) {
      if (loans.some((l) => l.agingBucket === rank)) {
        worstAging = rank;
        break;
      }
    }
    const largest = loans.reduce((best, row) =>
      row.outstanding > best.outstanding ? row : best,
    );
    result.push({
      borrowerId,
      name: loans[0]?.borrowerName ?? "",
      loanCount: loans.length,
      outstanding: loans.reduce((s, l) => s + l.outstanding, 0),
      worstAging,
      segment: segments.size === 1 ? (loans[0]?.segment ?? null) : "mixed",
      largestMasterlistId: largest.masterlistId,
    });
  }

  result.sort((a, b) => b.outstanding - a.outstanding);
  return result;
}

export function filterLoanRegister(
  rows: LoanRegisterRow[],
  filters: RegisterFilters,
): LoanRegisterRow[] {
  return rows.filter((row) => {
    if (filters.status === "unpaid" && !UNPAID.has(row.accountStatus)) return false;
    if (filters.status === "paid" && row.accountStatus !== "paid") return false;
    if (filters.segment !== "all" && row.segment !== filters.segment) return false;
    if (filters.aging !== "all" && row.agingBucket !== filters.aging) return false;
    if (filters.collateral !== "all" && row.collateralType !== filters.collateral) return false;
    return true;
  });
}

export function isPastDueLoan(row: LoanRegisterRow): boolean {
  return UNPAID.has(row.accountStatus) && (PAST_DUE_BUCKETS as readonly string[]).includes(row.agingBucket);
}

export function bucketsForPastDueAging(aging: PastDueAging): readonly string[] {
  if (aging === "all") return PAST_DUE_BUCKETS;
  if (aging === "par30") return PAR30_BUCKETS;
  return [aging];
}

export function filterPastDue(
  rows: LoanRegisterRow[],
  aging: PastDueAging,
): LoanRegisterRow[] {
  const buckets = new Set(bucketsForPastDueAging(aging));
  return rows.filter((row) => isPastDueLoan(row) && buckets.has(row.agingBucket));
}

export function sortByOutstandingDesc<T extends { outstanding: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.outstanding - a.outstanding);
}

export function clampPage(page: number, pageCount: number): number {
  const max = Math.max(1, pageCount);
  return Math.min(Math.max(1, page), max);
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { page: number; pageCount: number; slice: T[] } {
  const size = (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / size) || 1);
  const current = clampPage(page, pageCount);
  const start = (current - 1) * size;
  return { page: current, pageCount, slice: rows.slice(start, start + size) };
}
