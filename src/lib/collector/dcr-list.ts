/** Recent-DCRs list helpers. Drafts belong to the builder, not this list. */

export const DCR_LIST_STATUS_FILTERS = [
  "all",
  "submitted",
  "reconciled",
] as const;
export type DcrListStatusFilter = (typeof DCR_LIST_STATUS_FILTERS)[number];

export const DCR_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampDcrListPageSize(n: number): number {
  return (DCR_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/** Map a raw status query/chip value to a fixed filter, else `"all"`. */
export function dcrListStatusFilterSpec(raw: string): DcrListStatusFilter {
  if (raw === "submitted" || raw === "reconciled") return raw;
  return "all";
}

export function passesDcrListStatusFilter(
  status: string,
  spec: DcrListStatusFilter,
): boolean {
  if (spec === "all") return true;
  return status === spec;
}

/**
 * Rows that belong on Recent DCRs (not the builder).
 * `rejected` is unused in practice but still listed if present.
 */
export function isDcrListRow(status: string): boolean {
  return status !== "draft";
}

function dcrListSortTime(row: {
  submitted_at?: string | null;
  created_at: string;
}): number {
  return Date.parse(row.submitted_at ?? row.created_at) || 0;
}

/**
 * Stable copy-sort by `submitted_at` falling back to `created_at`.
 * Does not mutate `rows`.
 */
export function sortDcrsByDate<
  T extends { submitted_at?: string | null; created_at: string },
>(rows: T[], dir: "asc" | "desc"): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = dcrListSortTime(a);
    const bTime = dcrListSortTime(b);
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

/**
 * KPIs over the non-draft Recent-DCRs set (drafts belong to the builder).
 * Counts `submitted` and `reconciled` only — `rejected` is not a KPI.
 * Passing the full fetch including drafts is safe: drafts do not increment either count.
 */
export function computeDcrListKpis(rows: { status: string }[]): {
  submitted: number;
  reconciled: number;
} {
  let submitted = 0;
  let reconciled = 0;
  for (const row of rows) {
    if (row.status === "submitted") submitted += 1;
    else if (row.status === "reconciled") reconciled += 1;
  }
  return { submitted, reconciled };
}
