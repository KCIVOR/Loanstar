import { masterlistSecondaryIdentity } from "@/lib/ar/masterlist-display";
import { agingNeedsAttention } from "@/lib/collector/desk";

/**
 * SQL invariant for GET /api/collector/accounts: the masterlist select
 * uses `.eq("account_status", COLLECTOR_QUEUE_ACCOUNT_STATUS)` ("active")
 * in addition to `.eq("remedial_flag", false)`.
 *
 * Paid-off (`account_status='paid'`) and remedial accounts never reach the
 * mapped set these helpers operate on. Pure helpers cannot hit SQL — Phase 7
 * should assert this constant plus the route's `.eq("account_status", "active")`
 * (do not treat `closed_at IS NULL` as a substitute).
 */
export const COLLECTOR_QUEUE_ACCOUNT_STATUS = "active" as const;

export type CollectorQueueSortKey = "priority" | "balance" | "borrower" | "due";

export type CollectorLastContact = {
  contactType: string;
  callbackAt: string | null;
  createdAt: string;
};

export type CollectorQueueMappedRow = {
  id: string;
  borrowerId: string;
  borrowerName: string;
  borrowerNo: string;
  loanAccountNo: string | null;
  segment: "sme" | "seafarer";
  manningAgency: string | null;
  vesselName: string | null;
  outstandingBalance: number;
  agingBucket: string;
  firstPaymentDate: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  lastContact: CollectorLastContact | null;
};

export type CollectorQueueKpis = {
  assigned: number;
  callbackDue: number;
  agingCritical: number;
  totalBalance: number;
};

export const COLLECTOR_AGING_FILTERS = [
  "all",
  "current",
  "1-30",
  "31-60",
  "61-90",
  "91+",
] as const;

export type CollectorAgingFilter = (typeof COLLECTOR_AGING_FILTERS)[number];

export const COLLECTOR_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export type CollectorQueuePageSize = (typeof COLLECTOR_QUEUE_PAGE_SIZES)[number];

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCollectorQueuePageSize(pageSize: number): number {
  return (COLLECTOR_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Map a raw aging query param to a fixed AR bucket chip, else `"all"`. */
export function agingFilterSpec(raw: string): CollectorAgingFilter {
  if (
    raw === "current" ||
    raw === "1-30" ||
    raw === "31-60" ||
    raw === "61-90" ||
    raw === "91+"
  ) {
    return raw;
  }
  return "all";
}

/** Exact bucket match against the five AR chips; `"all"` always passes. */
export function passesAgingFilter(
  bucket: string,
  spec: CollectorAgingFilter,
): boolean {
  if (spec === "all") return true;
  return bucket === spec;
}

export const COLLECTOR_SEGMENT_FILTERS = ["all", "seafarer", "sme"] as const;

export type CollectorSegmentFilter =
  (typeof COLLECTOR_SEGMENT_FILTERS)[number];

/** Map a raw segment query param to Seafarer/SME, else `"all"`. */
export function segmentFilterSpec(raw: string): CollectorSegmentFilter {
  if (raw === "seafarer" || raw === "sme") return raw;
  return "all";
}

/** Exact segment match; `"all"` always passes. */
export function passesSegmentFilter(
  segment: string,
  spec: CollectorSegmentFilter,
): boolean {
  if (spec === "all") return true;
  return segment === spec;
}

export function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SearchableRow = Pick<
  CollectorQueueMappedRow,
  | "borrowerName"
  | "borrowerNo"
  | "loanAccountNo"
  | "manningAgency"
  | "vesselName"
>;

/**
 * Case-insensitive substring over borrower name / borrower no / loan
 * account no / `masterlistSecondaryIdentity` (same fields as the pre-Phase-6
 * page, plus borrower no which that page's Account type did not expose).
 */
export function collectorSearchPredicate(
  row: SearchableRow,
  rawTerm: string,
): boolean {
  const term = sanitizeSearchTerm(rawTerm).toLowerCase();
  if (!term) return true;
  const secondary =
    masterlistSecondaryIdentity({
      manning_agency: row.manningAgency,
      vessel_name: row.vesselName,
    })?.toLowerCase() ?? "";
  return (
    row.borrowerName.toLowerCase().includes(term) ||
    row.borrowerNo.toLowerCase().includes(term) ||
    (row.loanAccountNo?.toLowerCase().includes(term) ?? false) ||
    secondary.includes(term)
  );
}

/**
 * Callback is overdue when `callbackAt` is in the past.
 * Extracted from `page.tsx` (pre-Phase-6).
 */
export function callbackDue(
  contact: { callbackAt: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!contact?.callbackAt) return false;
  return new Date(contact.callbackAt).getTime() < now;
}

export function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

export function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

/**
 * Date filter column: `first_payment_date` (the queue's existing default
 * `.order` column). The active queue had no date filter before Phase 6;
 * All time (`from`/`to` both null) applies no bound.
 *
 * `first_payment_date` is a DATE (`YYYY-MM-DD`). Date-only values are
 * normalized to `T00:00:00` before inclusive start/end compare so a loan
 * whose first payment falls on the from/to calendar day is included.
 * Rows with a null first-payment date fail the filter when any bound is set.
 */
export function inFirstPaymentBounds(
  firstPaymentDate: string | null,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!firstPaymentDate) return false;
  const ts = firstPaymentDate.includes("T")
    ? firstPaymentDate
    : `${firstPaymentDate}T00:00:00`;
  if (from && ts < toInclusiveStart(from)) return false;
  if (to && ts > toInclusiveEnd(to)) return false;
  return true;
}

type SortableRow = Pick<
  CollectorQueueMappedRow,
  | "outstandingBalance"
  | "borrowerName"
  | "agingBucket"
  | "nextDueDate"
  | "lastContact"
>;

/**
 * Extracted from `page.tsx` comparator (pre-Phase-6) — match EXACTLY:
 * - `priority` (default): callback-due first, then `agingNeedsAttention`,
 *   then balance desc. **sortDir does not reverse priority.**
 * - `balance`: numeric outstanding
 * - `borrower`: localeCompare
 * - `due`: next due date (`"9999"` if none)
 */
export function sortCollectorQueue<T extends SortableRow>(
  rows: T[],
  sortKey: CollectorQueueSortKey,
  sortDir: "asc" | "desc",
  now = Date.now(),
): T[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "balance") {
      return dir * (a.outstandingBalance - b.outstandingBalance);
    }
    if (sortKey === "borrower") {
      return dir * a.borrowerName.localeCompare(b.borrowerName);
    }
    if (sortKey === "due") {
      const aDue = a.nextDueDate ?? "9999";
      const bDue = b.nextDueDate ?? "9999";
      return dir * aDue.localeCompare(bDue);
    }
    const aCallback = callbackDue(a.lastContact, now) ? 0 : 1;
    const bCallback = callbackDue(b.lastContact, now) ? 0 : 1;
    if (aCallback !== bCallback) return aCallback - bCallback;
    const aFlag = agingNeedsAttention(a.agingBucket) ? 0 : 1;
    const bFlag = agingNeedsAttention(b.agingBucket) ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return b.outstandingBalance - a.outstandingBalance;
  });
}

/**
 * KPIs over the full mapped active set BEFORE search/aging/date filters
 * (standing queue KPI rule — not date-scoped).
 */
export function computeCollectorQueueKpis(
  rows: Pick<
    CollectorQueueMappedRow,
    "outstandingBalance" | "agingBucket" | "lastContact"
  >[],
  now = Date.now(),
): CollectorQueueKpis {
  const assigned = rows.length;
  const callbackDueCount = rows.filter((row) =>
    callbackDue(row.lastContact, now),
  ).length;
  const agingCritical = rows.filter((row) =>
    agingNeedsAttention(row.agingBucket),
  ).length;
  const totalBalance = rows.reduce(
    (sum, row) => sum + row.outstandingBalance,
    0,
  );
  return {
    assigned,
    callbackDue: callbackDueCount,
    agingCritical,
    totalBalance,
  };
}
