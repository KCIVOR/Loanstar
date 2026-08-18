export const COLLECTION_HISTORY_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export type CollectionHistoryRange = "recent" | "all";
export type CollectionHistorySortDirection = "asc" | "desc";

export function clampCollectionHistoryPageSize(value: number) {
  return (COLLECTION_HISTORY_PAGE_SIZES as readonly number[]).includes(value)
    ? value
    : 10;
}

export function computeDcrHistoryKpis(rows: Array<{ status: string }>) {
  let submitted = 0;
  let reconciled = 0;
  let rejected = 0;

  for (const row of rows) {
    if (row.status === "submitted") submitted += 1;
    else if (row.status === "reconciled") reconciled += 1;
    else if (row.status === "rejected") rejected += 1;
  }

  return { submitted, reconciled, rejected };
}

export function computePaymentHistoryKpis(rows: Array<{ status: string }>) {
  let pending = 0;
  let confirmed = 0;
  let posted = 0;
  let rejected = 0;

  for (const row of rows) {
    if (row.status === "pending_verification") pending += 1;
    else if (row.status === "confirmed") confirmed += 1;
    else if (row.status === "posted") posted += 1;
    else if (row.status === "rejected") rejected += 1;
  }

  return { pending, confirmed, posted, rejected };
}

export function isInCollectionHistoryRange(
  value: string,
  range: CollectionHistoryRange,
  now = Date.now(),
) {
  if (range === "all") return true;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= now - 30 * 24 * 60 * 60 * 1000;
}

export function sortCollectionHistoryRows<T>(
  rows: T[],
  dateOf: (row: T) => string,
  direction: CollectionHistorySortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      ((Date.parse(dateOf(a)) || 0) - (Date.parse(dateOf(b)) || 0)) *
      multiplier,
  );
}
