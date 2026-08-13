import { masterlistSecondaryIdentity } from "@/lib/ar/masterlist-display";
import { severityRank, type RemedialSeverity } from "@/lib/remedial/desk";

export type RemedialQueueSortKey =
  | "priority"
  | "balance"
  | "dpd"
  | "borrower"
  | "turned";

export type RemedialQueueMappedRow = {
  id: string;
  borrowerName: string;
  borrowerNo: string;
  loanAccountNo: string | null;
  segment: "sme" | "seafarer";
  manningAgency: string | null;
  vesselName: string | null;
  outstandingBalance: number;
  agingBucket: string;
  accountStatus: string;
  monthlyAmortization: number;
  daysPastDue: number;
  severity: RemedialSeverity;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  turnedOverAt: string | null;
  turnoverReason: string;
  fromCollectorName: string | null;
};

export type RemedialQueueKpis = {
  assigned: number;
  critical: number;
  avgDpd: number;
  outstanding: number;
};

export type SeverityFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; severity: RemedialSeverity };

export const REMEDIAL_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export type RemedialQueuePageSize = (typeof REMEDIAL_QUEUE_PAGE_SIZES)[number];

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampRemedialQueuePageSize(pageSize: number): number {
  return (REMEDIAL_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Pure severity-filter → JS membership spec. */
export function severityFilterSpec(raw: string): SeverityFilterSpec {
  if (!raw || raw === "all") return { mode: "all" };
  if (raw === "critical" || raw === "elevated" || raw === "watch") {
    return { mode: "eq", severity: raw };
  }
  return { mode: "all" };
}

export function passesSeverity(
  severity: RemedialSeverity,
  spec: SeverityFilterSpec,
): boolean {
  if (spec.mode === "all") return true;
  return severity === spec.severity;
}

export const REMEDIAL_SEGMENT_FILTERS = ["all", "seafarer", "sme"] as const;

export type RemedialSegmentFilter =
  (typeof REMEDIAL_SEGMENT_FILTERS)[number];

/** Map a raw segment query param to Seafarer/SME, else `"all"`. */
export function segmentFilterSpec(raw: string): RemedialSegmentFilter {
  if (raw === "seafarer" || raw === "sme") return raw;
  return "all";
}

/** Exact segment match; `"all"` always passes. */
export function passesSegmentFilter(
  segment: string,
  spec: RemedialSegmentFilter,
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
  RemedialQueueMappedRow,
  | "borrowerName"
  | "borrowerNo"
  | "loanAccountNo"
  | "manningAgency"
  | "vesselName"
>;

/** Case-insensitive substring over name / no / account / secondary identity. */
export function remedialSearchPredicate(
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

function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

export function inTurnedOverBounds(
  turnedOverAt: string | null,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!turnedOverAt) return false;
  if (from && turnedOverAt < toInclusiveStart(from)) return false;
  if (to && turnedOverAt > toInclusiveEnd(to)) return false;
  return true;
}

type SortableRow = Pick<
  RemedialQueueMappedRow,
  | "severity"
  | "outstandingBalance"
  | "daysPastDue"
  | "borrowerName"
  | "turnedOverAt"
>;

/**
 * Extracted from `page.tsx:190-212` / Phase 1 route comparator.
 * Priority uses `severityRank` then balance desc; sortDir does not reverse it.
 */
export function sortRemedialQueue<T extends SortableRow>(
  rows: T[],
  sortKey: RemedialQueueSortKey,
  sortDir: "asc" | "desc",
): T[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "balance") {
      return dir * (a.outstandingBalance - b.outstandingBalance);
    }
    if (sortKey === "dpd") {
      return dir * (a.daysPastDue - b.daysPastDue);
    }
    if (sortKey === "borrower") {
      return dir * a.borrowerName.localeCompare(b.borrowerName);
    }
    if (sortKey === "turned") {
      const at = a.turnedOverAt ?? "";
      const bt = b.turnedOverAt ?? "";
      return dir * at.localeCompare(bt);
    }
    const ar = severityRank(a.severity);
    const br = severityRank(b.severity);
    if (ar !== br) return ar - br;
    return b.outstandingBalance - a.outstandingBalance;
  });
}

/** KPIs over the full unfiltered mapped set (Phase 1). */
export function computeRemedialQueueKpis(
  rows: Pick<
    RemedialQueueMappedRow,
    "severity" | "daysPastDue" | "outstandingBalance"
  >[],
): RemedialQueueKpis {
  const assigned = rows.length;
  const critical = rows.filter((row) => row.severity === "critical").length;
  const avgDpd =
    assigned === 0
      ? 0
      : Math.round(
          rows.reduce((sum, row) => sum + row.daysPastDue, 0) / assigned,
        );
  const outstanding = rows.reduce(
    (sum, row) => sum + row.outstandingBalance,
    0,
  );
  return { assigned, critical, avgDpd, outstanding };
}
