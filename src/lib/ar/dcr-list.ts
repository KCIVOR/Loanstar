/** AR DCR queue helpers (`GET /api/ar/dcr` — client-side filters). */

export const AR_DCR_WAITING_BUCKETS = ["all", "1-3", "4-7", "8+"] as const;
export type ArDcrWaitingBucket = (typeof AR_DCR_WAITING_BUCKETS)[number];

export const AR_DCR_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampArDcrListPageSize(n: number): number {
  return (AR_DCR_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/**
 * Whole days since `submittedAt`; invalid/missing → null.
 * Local copy of collector briefings `daysWaiting` math (no CIG/Collector import).
 */
export function daysWaiting(
  submittedAt: string | null | undefined,
  asOf = new Date(),
): number | null {
  if (!submittedAt) return null;
  const since = new Date(submittedAt);
  if (Number.isNaN(since.getTime())) return null;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Map a raw waiting query/chip value to a fixed bucket, else `"all"`. */
export function waitingBucketFilterSpec(raw: string): ArDcrWaitingBucket {
  if (raw === "1-3" || raw === "4-7" || raw === "8+") return raw;
  return "all";
}

/**
 * Map days → bucket id (excluding "all"): 1-3, 4-7, 8+.
 * Day 0 is not in any chip bucket (only "all").
 */
export function waitingBucketForDays(
  days: number,
): Exclude<ArDcrWaitingBucket, "all"> | null {
  if (days >= 8) return "8+";
  if (days >= 4) return "4-7";
  if (days >= 1) return "1-3";
  return null;
}

export function passesWaitingBucket(
  days: number | null,
  spec: ArDcrWaitingBucket,
): boolean {
  if (spec === "all") return true;
  if (days == null || days === 0) return false;
  return waitingBucketForDays(days) === spec;
}

/** Minimal DCR shape for client-side search (id / borrower / account / payment ref). */
export type ArDcrSearchItem = {
  id: string;
  dcr_items?: Array<{
    payments?: {
      reference_no?: string | null;
      masterlist?: {
        borrower_name?: string | null;
        loan_account_no?: string | null;
      } | null;
    } | null;
  }> | null;
};

/** Case-insensitive match on DCR id, borrower name, loan account, or payment ref. */
export function arDcrSearchPredicate(dcr: ArDcrSearchItem, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (dcr.id.toLowerCase().includes(q)) return true;
  return (dcr.dcr_items ?? []).some((item) => {
    const name = item.payments?.masterlist?.borrower_name?.toLowerCase() ?? "";
    const acct =
      item.payments?.masterlist?.loan_account_no?.toLowerCase() ?? "";
    const ref = item.payments?.reference_no?.toLowerCase() ?? "";
    return name.includes(q) || acct.includes(q) || ref.includes(q);
  });
}

/**
 * Stable copy-sort by `submitted_at`. Missing/invalid timestamps are treated as
 * epoch 0 (sort first in asc, last in desc). Does not mutate `rows`.
 */
export function sortDcrsBySubmittedAt<
  T extends { submitted_at?: string | null },
>(rows: T[], dir: "asc" | "desc"): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.submitted_at ?? "") || 0;
    const bTime = Date.parse(b.submitted_at ?? "") || 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}
