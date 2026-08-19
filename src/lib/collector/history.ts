import type { SupabaseClient } from "@supabase/supabase-js";

import { firstJoin } from "./format";

export type CollectorClosedAccountRow = {
  id: string;
  loanAccountNo: string | null;
  borrowerName: string;
  borrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  outstandingBalance: number;
  closedAt: string;
};

export type CollectorClosedAccountSortKey = "borrower" | "account" | "closedAt";

export type CollectorClosedAccountsQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CollectorClosedAccountSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CollectorClosedAccountsKpiCounts = {
  total: number;
};

export type CollectorTurnedOverRow = {
  id: string;
  masterlistId: string;
  loanAccountNo: string | null;
  borrowerName: string;
  borrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  turnedOverAt: string;
  turnoverReason: string;
};

export type CollectorTurnedOverSortKey = "borrower" | "account" | "turnedOverAt";

export type CollectorTurnedOverQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CollectorTurnedOverSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CollectorTurnedOverKpiCounts = {
  total: number;
};

export const COLLECTOR_HISTORY_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export const SYSTEM_TURNOVER_REASON = "System (aging threshold)";

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCollectorHistoryPageSize(pageSize: number): number {
  return (COLLECTOR_HISTORY_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/**
 * Display label for a turnover reason. Null/blank reasons (no audit text)
 * map to the aging-cron style fallback — exported for Phase 5 tests.
 */
export function turnoverReasonLabel(
  reason: string | null | undefined,
): string {
  const trimmed = reason?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : SYSTEM_TURNOVER_REASON;
}

/** Strip PostgREST wildcard/list chars and collapse whitespace. */
export function sanitizeCollectorHistorySearch(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Inclusive start-of-day bound for YYYY-MM-DD date-range filters. */
export function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

/** Inclusive end-of-day bound for YYYY-MM-DD date-range filters. */
export function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

/**
 * Paid-off accounts on this collector's book: `account_status='paid'` with
 * a stamped `closed_at`, scoped via `assignments!inner` to
 * `collector_user_id`. Search is denormalized same-table `.or()` on
 * borrower_name / borrower_no / loan_account_no.
 */
export async function getCollectorClosedAccountsHistory(
  supabase: SupabaseClient,
  collectorId: string,
  params: CollectorClosedAccountsQueryParams,
): Promise<{ rows: CollectorClosedAccountRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "closedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCollectorHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeCollectorHistorySearch(search);

  let query = supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_account_no,
      borrower_name,
      borrower_no,
      segment,
      outstanding_balance,
      closed_at,
      assignments!inner ( collector_user_id )
    `,
      { count: "exact" },
    )
    .eq("assignments.collector_user_id", collectorId)
    .eq("account_status", "paid")
    .not("closed_at", "is", null);

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (from) {
    query = query.gte("closed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("closed_at", toInclusiveEnd(to));
  }

  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `borrower_name.ilike."${pattern}",borrower_no.ilike."${pattern}",loan_account_no.ilike."${pattern}"`,
    );
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", { ascending });
  } else if (sortKey === "account") {
    query = query.order("loan_account_no", { ascending });
  } else {
    query = query.order("closed_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const closedAt = row.closed_at as string | null;
    if (!closedAt) return [];

    const segmentRaw = row.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return [
      {
        id: row.id as string,
        loanAccountNo: (row.loan_account_no as string | null) ?? null,
        borrowerName: row.borrower_name as string,
        borrowerNo: row.borrower_no as string,
        segment,
        outstandingBalance: Number(row.outstanding_balance),
        closedAt,
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Paid-off KPI — date-scoped only (ignores search), same collector book.
 */
export async function getCollectorClosedAccountsKpiCounts(
  supabase: SupabaseClient,
  collectorId: string,
  bounds: { from?: string | null; to?: string | null },
): Promise<CollectorClosedAccountsKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("masterlist")
    .select("id, assignments!inner(collector_user_id)", {
      count: "exact",
      head: true,
    })
    .eq("assignments.collector_user_id", collectorId)
    .eq("account_status", "paid")
    .not("closed_at", "is", null);

  if (from) {
    query = query.gte("closed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("closed_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

async function findMasterlistIdsForSearch(
  supabase: SupabaseClient,
  term: string,
): Promise<string[]> {
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("masterlist")
    .select("id")
    .or(
      `borrower_name.ilike."${pattern}",borrower_no.ilike."${pattern}",loan_account_no.ilike."${pattern}"`,
    )
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id as string);
}

/**
 * Turned-over history for one collector — sourced from `remedial_turnovers`
 * (`from_collector_id`), not the collector masterlist RLS branch (that
 * branch still requires `remedial_flag=false`). Left-embed `masterlist`
 * for identity + outstanding_balance.
 *
 * Search: identity lives on masterlist, not the turnover row. Embed `.or()`
 * is fragile (standing History rule / AR DCR precedent). Matching
 * masterlist ids are resolved first with a same-table `.or()` on
 * borrower_name / borrower_no / loan_account_no (RLS-scoped), then
 * `.in("masterlist_id", ids)` — server-side and pagination-safe. Not
 * JS-after-fetch.
 *
 * Aging-cron flips that set remedial_flag/account_status without inserting
 * a `remedial_turnovers` row will not appear here. Collector masterlist RLS
 * and the Phase 1 `masterlist_collector_turned_over_select` addendum both
 * require a turnover row. No extra RLS invented.
 */
export async function getCollectorTurnedOverHistory(
  supabase: SupabaseClient,
  collectorId: string,
  params: CollectorTurnedOverQueryParams,
): Promise<{ rows: CollectorTurnedOverRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "turnedOverAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCollectorHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeCollectorHistorySearch(search);

  let masterlistIds: string[] | null = null;
  if (term) {
    masterlistIds = await findMasterlistIdsForSearch(supabase, term);
    if (masterlistIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("remedial_turnovers")
    .select(
      `
      id,
      masterlist_id,
      turnover_reason,
      confirmed_at,
      created_at,
      masterlist (
        loan_account_no,
        borrower_name,
        borrower_no,
        outstanding_balance,
        segment
      )
    `,
      { count: "exact" },
    )
    .eq("from_collector_id", collectorId);

  if (segmentFilter !== "all") {
    query = query.eq("masterlist.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("confirmed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("confirmed_at", toInclusiveEnd(to));
  }

  if (masterlistIds) {
    query = query.in("masterlist_id", masterlistIds);
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", {
      ascending,
      foreignTable: "masterlist",
    });
  } else if (sortKey === "account") {
    query = query.order("loan_account_no", {
      ascending,
      foreignTable: "masterlist",
    });
  } else {
    query = query.order("confirmed_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const turnedOverAt =
      (row.confirmed_at as string | null) ??
      (row.created_at as string | null);
    if (!turnedOverAt) return [];

    const masterlist = firstJoin(row.masterlist);

    const segmentRaw = masterlist?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return [
      {
        id: row.id as string,
        masterlistId: row.masterlist_id as string,
        loanAccountNo:
          (masterlist?.loan_account_no as string | null | undefined) ?? null,
        borrowerName: (masterlist?.borrower_name as string | undefined) ?? "",
        borrowerNo: (masterlist?.borrower_no as string | undefined) ?? "",
        segment,
        turnedOverAt,
        turnoverReason: turnoverReasonLabel(
          row.turnover_reason as string | null,
        ),
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Turned-over KPI — date-scoped only on `confirmed_at` (ignores search),
 * same collector (`from_collector_id`).
 */
export async function getCollectorTurnedOverKpiCounts(
  supabase: SupabaseClient,
  collectorId: string,
  bounds: { from?: string | null; to?: string | null },
): Promise<CollectorTurnedOverKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("remedial_turnovers")
    .select("id", { count: "exact", head: true })
    .eq("from_collector_id", collectorId);

  if (from) {
    query = query.gte("confirmed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("confirmed_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}
