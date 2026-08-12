/** Queue row shape from `GET /api/collector/briefings` (client-side filters). */
export type BriefingQueueItem = {
  releaseFileId: string;
  releasePath: string | null;
  updatedAt: string;
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
  } | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  briefing: {
    acknowledgedAt: string | null;
    checklist: Array<{ key: string; label: string }> | null;
  } | null;
};

export const BRIEFING_WAITING_BUCKETS = ["all", "1-3", "4-7", "8+"] as const;
export type BriefingWaitingBucket = (typeof BRIEFING_WAITING_BUCKETS)[number];

export const BRIEFING_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampBriefingListPageSize(n: number): number {
  return (BRIEFING_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/**
 * Whole days since `updatedAt`; invalid/missing → null.
 * Local copy of desk `daysSince` math (no CIG import).
 */
export function daysWaiting(
  updatedAt: string | null | undefined,
  asOf = new Date(),
): number | null {
  if (!updatedAt) return null;
  const since = new Date(updatedAt);
  if (Number.isNaN(since.getTime())) return null;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Map a raw waiting query/chip value to a fixed bucket, else `"all"`. */
export function waitingBucketFilterSpec(raw: string): BriefingWaitingBucket {
  if (raw === "1-3" || raw === "4-7" || raw === "8+") return raw;
  return "all";
}

/**
 * Map days → bucket id (excluding "all"): 1-3, 4-7, 8+.
 * Day 0 is not in any chip bucket (only "all").
 */
export function waitingBucketForDays(
  days: number,
): Exclude<BriefingWaitingBucket, "all"> | null {
  if (days >= 8) return "8+";
  if (days >= 4) return "4-7";
  if (days >= 1) return "1-3";
  return null;
}

export function passesWaitingBucket(
  days: number | null,
  spec: BriefingWaitingBucket,
): boolean {
  if (spec === "all") return true;
  if (days == null || days === 0) return false;
  return waitingBucketForDays(days) === spec;
}

/** Case-insensitive match on borrower name, borrower no, application no, or release file id. */
export function briefingSearchPredicate(
  item: Pick<
    BriefingQueueItem,
    "releaseFileId" | "application" | "borrower"
  >,
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const name = item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(q) ||
    (item.borrower?.borrowerNo?.toLowerCase().includes(q) ?? false) ||
    (item.application?.applicationNo?.toLowerCase().includes(q) ?? false) ||
    item.releaseFileId.toLowerCase().includes(q)
  );
}

/** Stable copy-sort by `updatedAt` (ISO timestamps). Does not mutate `rows`. */
export function sortBriefingsByUpdatedAt<T extends { updatedAt: string }>(
  rows: T[],
  dir: "asc" | "desc",
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt) || 0;
    const bTime = Date.parse(b.updatedAt) || 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

/** KPIs over the full awaiting set (before search/waiting filter). */
export function computeBriefingListKpis(
  rows: { updatedAt: string }[],
  asOf = new Date(),
): {
  awaiting: number;
  oldestWaitingDays: number;
} {
  if (rows.length === 0) return { awaiting: 0, oldestWaitingDays: 0 };
  let oldestWaitingDays = 0;
  for (const row of rows) {
    const days = daysWaiting(row.updatedAt, asOf);
    if (days != null && days > oldestWaitingDays) oldestWaitingDays = days;
  }
  return { awaiting: rows.length, oldestWaitingDays };
}
