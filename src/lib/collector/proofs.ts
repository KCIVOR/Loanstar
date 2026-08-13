import { firstJoin } from "@/lib/collector/format";

/** Desk row shape from `GET /api/collector/payments?scope=desk` (client-side filters). */
export type ProofMasterlistJoin = {
  borrower_name: string;
  loan_account_no: string | null;
};

export type ProofQueueItem = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  uploaded_by?: string | null;
  uploadedByName?: string | null;
  masterlist?: ProofMasterlistJoin | ProofMasterlistJoin[] | null;
};

export const PROOF_STATUS_FILTERS = [
  "all",
  "pending_verification",
  "confirmed",
] as const;
export type ProofStatusFilter = (typeof PROOF_STATUS_FILTERS)[number];

export const PROOF_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampProofListPageSize(n: number): number {
  return (PROOF_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/** Map a raw status query/chip value to a fixed filter, else `"all"`. */
export function proofStatusFilterSpec(raw: string): ProofStatusFilter {
  if (raw === "pending_verification" || raw === "confirmed") return raw;
  return "all";
}

export function passesProofStatusFilter(
  status: string,
  spec: ProofStatusFilter,
): boolean {
  if (spec === "all") return true;
  return status === spec;
}

/**
 * Case-insensitive match on reference no, borrower name, or loan account no.
 * Accepts already-unwrapped strings or a desk row with `masterlist` (via firstJoin).
 */
export function proofSearchPredicate(
  item: {
    reference_no?: string | null;
    borrower_name?: string | null;
    loan_account_no?: string | null;
    masterlist?: ProofMasterlistJoin | ProofMasterlistJoin[] | null;
  },
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const ml = firstJoin(item.masterlist);
  const borrowerName = item.borrower_name ?? ml?.borrower_name ?? null;
  const accountNo = item.loan_account_no ?? ml?.loan_account_no ?? null;
  return (
    (item.reference_no?.toLowerCase().includes(q) ?? false) ||
    (borrowerName?.toLowerCase().includes(q) ?? false) ||
    (accountNo?.toLowerCase().includes(q) ?? false)
  );
}

/** Stable copy-sort by `payment_date` (ISO dates). Does not mutate `rows`. */
export function sortProofsByDate<T extends { payment_date: string }>(
  rows: T[],
  dir: "asc" | "desc",
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.payment_date) || 0;
    const bTime = Date.parse(b.payment_date) || 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

/** KPIs over the full desk set (before search/status filter). */
export function computeProofListKpis(rows: { status: string }[]): {
  pendingReview: number;
  confirmedAwaitingDcr: number;
} {
  let pendingReview = 0;
  let confirmedAwaitingDcr = 0;
  for (const row of rows) {
    if (row.status === "pending_verification") pendingReview += 1;
    else if (row.status === "confirmed") confirmedAwaitingDcr += 1;
  }
  return { pendingReview, confirmedAwaitingDcr };
}
