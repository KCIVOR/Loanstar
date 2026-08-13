import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cigMatchesWorkFilter,
  cigNeedsAttention,
  daysSince,
  type CigWorkFilter,
} from "@/lib/cig/desk";

export type CigQueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  endorsedAt: string | null;
  createdAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  isRevision: boolean;
  callbackOverdueAt: string | null;
  segment: "sme" | "seafarer" | null;
};

export type CigQueueSortKey = "priority" | "endorsed" | "waiting" | "status";

export type CigQueueKpis = {
  inQueue: number;
  revisions: number;
  callbackOverdue: number;
  endorsedToday: number;
  needsAttention: number;
};

export const CIG_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export type CigQueuePageSize = (typeof CIG_QUEUE_PAGE_SIZES)[number];

export const CIG_WORK_FILTERS = [
  "all",
  "revisions",
  "callback_overdue",
  "endorsed_today",
] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCigQueuePageSize(pageSize: number): number {
  return (CIG_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/**
 * Validate a raw work/filter query param to a `CigWorkFilter`.
 * Unknown values fall back to `"all"`.
 */
export function workFilterSpec(raw: string): CigWorkFilter {
  if (
    raw === "revisions" ||
    raw === "callback_overdue" ||
    raw === "endorsed_today"
  ) {
    return raw;
  }
  return "all";
}

export function passesWorkFilter(
  row: Pick<CigQueueItem, "isRevision" | "callbackOverdueAt" | "endorsedAt">,
  filter: CigWorkFilter,
  asOf = new Date(),
): boolean {
  return cigMatchesWorkFilter(row, filter, asOf);
}

export function passesSegmentFilter(
  row: Pick<CigQueueItem, "segment">,
  segment: "all" | "seafarer" | "sme",
): boolean {
  if (segment === "all") return true;
  return row.segment === segment;
}

function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SearchableRow = Pick<CigQueueItem, "applicationNo" | "borrower">;

/**
 * Case-insensitive substring over borrower name / borrowerNo / email /
 * applicationNo — same fields as the pre-Phase-6 page search.
 */
export function cigQueueSearchPredicate(
  row: SearchableRow,
  rawTerm: string,
): boolean {
  const term = sanitizeSearchTerm(rawTerm).toLowerCase();
  if (!term) return true;
  const name = row.borrower
    ? `${row.borrower.firstName} ${row.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(term) ||
    (row.borrower?.borrowerNo.toLowerCase().includes(term) ?? false) ||
    (row.borrower?.email.toLowerCase().includes(term) ?? false) ||
    (row.applicationNo?.toLowerCase().includes(term) ?? false)
  );
}

function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

/**
 * Date filter column: `endorsedAt` (when the file arrived at CIG).
 * Inclusive T00:00:00 / T23:59:59.999. All time (`from`/`to` both null) applies
 * no bound. Null endorsedAt fails once any bound is set.
 */
export function inEndorsedAtBounds(
  endorsedAt: string | null,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!endorsedAt) return false;
  if (from && endorsedAt < toInclusiveStart(from)) return false;
  if (to && endorsedAt > toInclusiveEnd(to)) return false;
  return true;
}

type SortableRow = Pick<
  CigQueueItem,
  "status" | "endorsedAt" | "isRevision" | "callbackOverdueAt"
>;

/**
 * Extracted from `page.tsx:227-260` (pre-Phase-6) — match EXACTLY:
 * - `priority` (default): needs-attention first, then endorsedAt asc.
 *   **sortDir does not reverse priority.**
 * - `endorsed`: endorsedAt timestamp
 * - `waiting`: daysSince(endorsedAt), null as -1
 * - `status`: localeCompare
 */
export function sortCigQueue<T extends SortableRow>(
  rows: T[],
  sortKey: CigQueueSortKey,
  sortDir: "asc" | "desc",
  asOf = new Date(),
): T[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "endorsed") {
      const aTime = a.endorsedAt ? new Date(a.endorsedAt).getTime() : 0;
      const bTime = b.endorsedAt ? new Date(b.endorsedAt).getTime() : 0;
      return dir * (aTime - bTime);
    }
    if (sortKey === "waiting") {
      const aDays = daysSince(a.endorsedAt, asOf) ?? -1;
      const bDays = daysSince(b.endorsedAt, asOf) ?? -1;
      return dir * (aDays - bDays);
    }
    if (sortKey === "status") {
      return dir * a.status.localeCompare(b.status);
    }
    const aFlag = cigNeedsAttention({
      isRevision: a.isRevision,
      callbackOverdueAt: a.callbackOverdueAt,
    })
      ? 0
      : 1;
    const bFlag = cigNeedsAttention({
      isRevision: b.isRevision,
      callbackOverdueAt: b.callbackOverdueAt,
    })
      ? 0
      : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    const aTime = a.endorsedAt ? new Date(a.endorsedAt).getTime() : 0;
    const bTime = b.endorsedAt ? new Date(b.endorsedAt).getTime() : 0;
    return aTime - bTime;
  });
}

/**
 * KPIs over the full mapped active set BEFORE search/work/date filters
 * (standing queue KPI rule — not date-scoped).
 */
export function computeCigQueueKpis(
  rows: Pick<
    CigQueueItem,
    "isRevision" | "callbackOverdueAt" | "endorsedAt"
  >[],
  asOf = new Date(),
): CigQueueKpis {
  const inQueue = rows.length;
  const revisions = rows.filter((row) => row.isRevision).length;
  const callbackOverdue = rows.filter((row) =>
    Boolean(row.callbackOverdueAt),
  ).length;
  const endorsedToday = rows.filter((row) =>
    cigMatchesWorkFilter(row, "endorsed_today", asOf),
  ).length;
  const needsAttention = rows.filter((row) =>
    cigNeedsAttention({
      isRevision: row.isRevision,
      callbackOverdueAt: row.callbackOverdueAt,
    }),
  ).length;
  return {
    inQueue,
    revisions,
    callbackOverdue,
    endorsedToday,
    needsAttention,
  };
}

/**
 * Active CIG queue: applications currently in verification, plus
 * for_revision files Committee routed back to CIG specifically (checked via
 * the open revisit_notices row, since "for_revision" alone is shared with
 * CSA-routed revisions). Files with a future callback are hidden until due;
 * ones with an already-due callback stay visible and are flagged overdue.
 *
 * Classification is computed — callers fetch this superset then
 * filter/sort/paginate in JS (same justification as Remedial/Collector).
 */
export async function getCigQueue(supabase: SupabaseClient): Promise<CigQueueItem[]> {
  const now = new Date().toISOString();

  const { data: applications, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      endorsed_at,
      created_at,
      segment,
      borrowers (
        borrower_no,
        first_name,
        last_name,
        email
      )
    `,
    )
    .in("status", ["for_verification", "for_revision"])
    .order("endorsed_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  const revisionIds = (applications ?? [])
    .filter((row) => row.status === "for_revision")
    .map((row) => row.id as string);

  let cigRevisionIds = new Set<string>();
  if (revisionIds.length) {
    const { data: notices, error: noticeError } = await supabase
      .from("revisit_notices")
      .select("loan_application_id, route_to")
      .in("loan_application_id", revisionIds)
      .eq("route_to", "cig")
      .is("resolved_at", null);

    if (noticeError) {
      throw new Error(noticeError.message);
    }

    cigRevisionIds = new Set(
      (notices ?? []).map((n) => n.loan_application_id as string),
    );
  }

  const inQueue = (applications ?? []).filter(
    (row) =>
      row.status === "for_verification" ||
      cigRevisionIds.has(row.id as string),
  );

  const ids = inQueue.map((a) => a.id as string);
  if (!ids.length) return [];

  const { data: callbacks, error: cbError } = await supabase
    .from("callbacks")
    .select("loan_application_id, scheduled_at")
    .in("loan_application_id", ids)
    .is("resolved_at", null);

  if (cbError) {
    throw new Error(cbError.message);
  }

  const hiddenIds = new Set(
    (callbacks ?? [])
      .filter((c) => (c.scheduled_at as string) > now)
      .map((c) => c.loan_application_id as string),
  );

  const overdueTimes = new Map(
    (callbacks ?? [])
      .filter((c) => (c.scheduled_at as string) <= now)
      .map((c) => [c.loan_application_id as string, c.scheduled_at as string]),
  );

  return inQueue
    .filter((row) => !hiddenIds.has(row.id as string))
    .map((row) => {
      const borrower = Array.isArray(row.borrowers)
        ? row.borrowers[0]
        : row.borrowers;
      const segmentRaw = row.segment as string | null;
      const segment: "sme" | "seafarer" | null =
        segmentRaw === "sme" || segmentRaw === "seafarer" ? segmentRaw : null;
      return {
        id: row.id as string,
        applicationNo: row.application_no as string | null,
        status: row.status as string,
        endorsedAt: row.endorsed_at as string | null,
        createdAt: row.created_at as string,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
        isRevision: row.status === "for_revision",
        callbackOverdueAt: overdueTimes.get(row.id as string) ?? null,
        segment,
      };
    });
}

