/** Queue row shape from `GET /api/csa/leads` (client-side filters). */
export type CsaLeadListRow = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  agentName: string | null;
  createdAt: string;
};

export const CSA_LEADS_WAITING_BUCKETS = ["all", "1-3", "4-7", "8+"] as const;
export type CsaLeadsWaitingBucket = (typeof CSA_LEADS_WAITING_BUCKETS)[number];

export const CSA_LEADS_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCsaLeadsListPageSize(n: number): number {
  return (CSA_LEADS_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/**
 * Whole days since `createdAt`; invalid/missing → null.
 * Local copy of desk `daysSince` math (no collector/CIG/AR import).
 */
export function daysWaiting(
  createdAt: string | null | undefined,
  asOf = new Date(),
): number | null {
  if (!createdAt) return null;
  const since = new Date(createdAt);
  if (Number.isNaN(since.getTime())) return null;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Map a raw waiting query/chip value to a fixed bucket, else `"all"`. */
export function waitingBucketFilterSpec(raw: string): CsaLeadsWaitingBucket {
  if (raw === "1-3" || raw === "4-7" || raw === "8+") return raw;
  return "all";
}

/**
 * Map days → bucket id (excluding "all"): 1-3, 4-7, 8+.
 * Day 0 is not in any chip bucket (only "all").
 */
export function waitingBucketForDays(
  days: number,
): Exclude<CsaLeadsWaitingBucket, "all"> | null {
  if (days >= 8) return "8+";
  if (days >= 4) return "4-7";
  if (days >= 1) return "1-3";
  return null;
}

export function passesWaitingBucket(
  days: number | null,
  spec: CsaLeadsWaitingBucket,
): boolean {
  if (spec === "all") return true;
  if (days == null || days === 0) return false;
  return waitingBucketForDays(days) === spec;
}

/** Case-insensitive match on borrower name or agent name. */
export function csaLeadSearchPredicate(
  item: Pick<CsaLeadListRow, "borrowerName" | "agentName">,
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const borrower = item.borrowerName.toLowerCase();
  const agent = item.agentName?.toLowerCase() ?? "";
  return borrower.includes(q) || agent.includes(q);
}

/** Stable copy-sort by `createdAt` (ISO timestamps). Does not mutate `rows`. */
export function sortLeadsByCreatedAt<
  T extends { createdAt: string | null | undefined },
>(rows: T[], dir: "asc" | "desc"): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

/** KPIs over the full open-leads set (before search/waiting filter). */
export function computeCsaLeadsListKpis(
  rows: { createdAt: string }[],
  asOf = new Date(),
): {
  open: number;
  oldestWaitingDays: number;
} {
  if (rows.length === 0) return { open: 0, oldestWaitingDays: 0 };
  let oldestWaitingDays = 0;
  for (const row of rows) {
    const days = daysWaiting(row.createdAt, asOf);
    if (days != null && days > oldestWaitingDays) oldestWaitingDays = days;
  }
  return { open: rows.length, oldestWaitingDays };
}
