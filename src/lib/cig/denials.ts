import type { SupabaseClient } from "@supabase/supabase-js";

import { daysSince } from "@/lib/cig/desk";

export type DenialCallItem = {
  noticeId: string;
  applicationId: string;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | "individual" | null;
  deniedAt: string;
  borrower: {
    firstName: string;
    lastName: string;
    email: string;
    mobilePhone: string | null;
  } | null;
};

export type DenialCallsQueryParams = {
  segment?: "all" | "seafarer" | "sme" | "individual";
};

function mapSegment(raw: unknown): "sme" | "seafarer" | "individual" | null {
  return raw === "sme" || raw === "seafarer" || raw === "individual" ? raw : null;
}

/** Segment chip filter — mirrors waiting-bucket `passesWaitingBucket` shape. */
export function passesSegmentFilter(
  row: Pick<DenialCallItem, "segment">,
  segment: "all" | "seafarer" | "sme" | "individual",
): boolean {
  if (segment === "all") return true;
  return row.segment === segment;
}

/**
 * Denied files waiting for CIG's courtesy call to the borrower. The written
 * denial email is already sent on committee Deny; CIG informs by phone without
 * disclosing the reason, then marks the call done.
 */
export async function getPendingDenialCalls(
  supabase: SupabaseClient,
  params: DenialCallsQueryParams = {},
): Promise<DenialCallItem[]> {
  const { segment: segmentFilter = "all" } = params;

  let query = supabase
    .from("denial_notices")
    .select(
      `
      id,
      loan_application_id,
      created_at,
      loan_applications (
        application_no,
        segment,
        borrowers (
          first_name,
          last_name,
          email,
          mobile_phone
        )
      )
    `,
    )
    .is("informed_at", null);

  if (segmentFilter !== "all") {
    query = query.eq("loan_applications.segment", segmentFilter);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const app = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    const borrowerRaw = app?.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;
    return {
      noticeId: row.id as string,
      applicationId: row.loan_application_id as string,
      applicationNo: (app?.application_no as string) ?? null,
      segment: mapSegment(app?.segment),
      deniedAt: row.created_at as string,
      borrower: borrower
        ? {
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
            email: borrower.email as string,
            mobilePhone: (borrower.mobile_phone as string) ?? null,
          }
        : null,
    };
  });
}

export async function markDenialInformed(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
): Promise<{ noticeId: string }> {
  const { data, error } = await supabase
    .from("denial_notices")
    .update({
      informed_at: new Date().toISOString(),
      informed_by: actorId,
    })
    .eq("loan_application_id", applicationId)
    .is("informed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No pending denial call for this application");
  }

  return { noticeId: data.id as string };
}

/** Case-insensitive match on borrower name, application no, or application id. */
export function denialCallMatchesSearch(
  item: Pick<DenialCallItem, "applicationId" | "applicationNo" | "borrower">,
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const name = item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(q) ||
    (item.applicationNo?.toLowerCase().includes(q) ?? false) ||
    item.applicationId.toLowerCase().includes(q)
  );
}

/** Stable copy-sort by `deniedAt` (ISO timestamps). Does not mutate `rows`. */
export function sortDenialCallsByDeniedAt<T extends { deniedAt: string }>(
  rows: T[],
  dir: "asc" | "desc",
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.deniedAt) || 0;
    const bTime = Date.parse(b.deniedAt) || 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

export const DENIAL_WAITING_BUCKETS = ["all", "1-3", "4-7", "8+"] as const;
export type DenialWaitingBucket = (typeof DENIAL_WAITING_BUCKETS)[number];

export const DENIAL_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampDenialListPageSize(n: number): number {
  return (DENIAL_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/** Whole days since deniedAt; invalid/missing → null. */
export function daysWaiting(
  deniedAt: string | null | undefined,
  asOf = new Date(),
): number | null {
  return daysSince(deniedAt, asOf);
}

/** Map a raw waiting query/chip value to a fixed bucket, else `"all"`. */
export function waitingBucketFilterSpec(raw: string): DenialWaitingBucket {
  if (raw === "1-3" || raw === "4-7" || raw === "8+") return raw;
  return "all";
}

/**
 * Map days → bucket id (excluding "all"): 1-3, 4-7, 8+.
 * Day 0 is not in any chip bucket (only "all").
 */
export function waitingBucketForDays(
  days: number,
): Exclude<DenialWaitingBucket, "all"> | null {
  if (days >= 8) return "8+";
  if (days >= 4) return "4-7";
  if (days >= 1) return "1-3";
  return null;
}

export function passesWaitingBucket(
  days: number | null,
  spec: DenialWaitingBucket,
): boolean {
  if (spec === "all") return true;
  if (days == null || days === 0) return false;
  return waitingBucketForDays(days) === spec;
}

/** KPIs over the full pending set (before search/waiting filter). */
export function computeDenialListKpis(
  rows: { deniedAt: string }[],
  asOf = new Date(),
): {
  pending: number;
  oldestWaitingDays: number;
} {
  if (rows.length === 0) return { pending: 0, oldestWaitingDays: 0 };
  let oldestWaitingDays = 0;
  for (const row of rows) {
    const days = daysWaiting(row.deniedAt, asOf);
    if (days != null && days > oldestWaitingDays) oldestWaitingDays = days;
  }
  return { pending: rows.length, oldestWaitingDays };
}
