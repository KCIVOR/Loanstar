import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Active AR masterlist queue — server-side search / status / aging / date /
 * sort / pagination.
 *
 * Date field: `created_at` — masterlist rows are inserted at AR receive
 * (loan release / enrollment) in `createMasterlistFromRelease`
 * (`src/lib/ar/masterlist.ts`). That is the AR-relevant arrival timestamp;
 * `release_date` is a date-only loan field, not a queue-arrival event.
 *
 * Search: borrower_name, borrower_no, loan_account_no, plus the denormalized
 * columns that back `masterlistSecondaryIdentity` (manning_agency, vessel_name).
 * Gap vs page.tsx: the page matches the joined "agency · vessel" string; SQL
 * searches each column separately, so a term that only matches across the
 * " · " join (e.g. spanning both parts) will not hit.
 *
 * Sort: status / borrower / balance are server-side. `priority` stays
 * client-current-page-only (omit sortKey → created_at desc + id for
 * pagination stability).
 */

export type MasterlistQueueSortKey = "status" | "borrower" | "balance";

export type MasterlistQueueQueryParams = {
  search?: string;
  statusFilter?: string;
  agingFilter?: string;
  segmentFilter?: "all" | "seafarer" | "sme";
  from?: string | null;
  to?: string | null;
  sortKey?: MasterlistQueueSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type MasterlistQueueRow = Record<string, unknown> & {
  id: string;
  loan_account_no: string | null;
  borrower_name: string;
  borrower_no: string;
  outstanding_balance: number;
  aging_bucket: string;
  account_status: string;
  monthly_amortization: number;
  remedial_flag?: boolean | null;
  segment?: string | null;
  manning_agency?: string | null;
  vessel_name?: string | null;
  created_at?: string;
  portfolios?:
    | { name: string; investor_label: string | null }
    | Array<{ name: string; investor_label: string | null }>
    | null;
  assignments?:
    | { collector_user_id: string | null; remedial_user_id: string | null }
    | Array<{
        collector_user_id: string | null;
        remedial_user_id: string | null;
      }>
    | null;
};

export type MasterlistQueueKpiCounts = {
  total: number;
  activeCount: number;
  attentionCount: number;
  totalOutstanding: number;
};

export const MASTERLIST_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/**
 * PostgREST/Supabase default max rows per request. Outstanding-balance KPI
 * sums page at this size so totals are not silently truncated at 1000.
 */
export const OUTSTANDING_BALANCE_FETCH_PAGE = 1000;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampMasterlistQueuePageSize(pageSize: number): number {
  return (MASTERLIST_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Pure status-filter → query-builder spec (testable without Supabase). */
export type StatusFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; status: string };

export function statusFilterSpec(filter: string): StatusFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  return { mode: "eq", status: filter };
}

/** Pure aging-filter → query-builder spec (testable without Supabase). */
export type AgingFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; aging: string };

export function agingFilterSpec(filter: string): AgingFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  return { mode: "eq", aging: filter };
}

/**
 * Pure needs-attention predicate — mirrors `src/app/ar/page.tsx`.
 * Remedial flag, or aging bucket that is neither "current" nor empty
 * (case-insensitive on the bucket).
 */
export function needsAttention(row: {
  remedial_flag?: boolean | null;
  aging_bucket: string;
}): boolean {
  if (row.remedial_flag) return true;
  const bucket = row.aging_bucket.toLowerCase();
  return bucket !== "current" && bucket !== "";
}

/** Pure sum of outstanding balances — exported for unit tests. */
export function sumOutstandingBalances(
  rows: { outstanding_balance: number }[],
): number {
  let total = 0;
  for (const row of rows) {
    total += Number(row.outstanding_balance) || 0;
  }
  return total;
}

function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

const MASTERLIST_QUEUE_SELECT = `
  *,
  portfolios ( name, investor_label ),
  assignments ( collector_user_id, remedial_user_id )
`;

/**
 * Active masterlist queue with server-side filters, sort, and pagination.
 */
export async function getMasterlistQueue(
  supabase: SupabaseClient,
  params: MasterlistQueueQueryParams,
): Promise<{ rows: MasterlistQueueRow[]; totalCount: number }> {
  const {
    search = "",
    statusFilter = "all",
    agingFilter = "all",
    segmentFilter = "all",
    from = null,
    to = null,
    sortKey,
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampMasterlistQueuePageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let query = supabase
    .from("masterlist")
    .select(MASTERLIST_QUEUE_SELECT, { count: "exact" });

  const statusSpec = statusFilterSpec(statusFilter);
  if (statusSpec.mode === "eq") {
    query = query.eq("account_status", statusSpec.status);
  }

  const agingSpec = agingFilterSpec(agingFilter);
  if (agingSpec.mode === "eq") {
    query = query.eq("aging_bucket", agingSpec.aging);
  }

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (from) {
    query = query.gte("created_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("created_at", toInclusiveEnd(to));
  }

  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `borrower_name.ilike."${pattern}",borrower_no.ilike."${pattern}",loan_account_no.ilike."${pattern}",manning_agency.ilike."${pattern}",vessel_name.ilike."${pattern}"`,
    );
  }

  if (sortKey === "status") {
    query = query.order("account_status", { ascending });
  } else if (sortKey === "borrower") {
    query = query.order("borrower_name", { ascending });
  } else if (sortKey === "balance") {
    query = query.order("outstanding_balance", { ascending });
  } else {
    // Default / priority placeholder — matches pre–Phase-6 GET order
    query = query.order("created_at", { ascending: false });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as MasterlistQueueRow[],
    totalCount: count ?? 0,
  };
}

/**
 * Masterlist KPI counts — not date-scoped (preserves pre–Phase-6 page.tsx
 * behavior over the full masterlist universe).
 *
 * attentionCount uses the same predicate as `needsAttention`: remedial_flag
 * OR aging_bucket not equal to 'current' (schema forbids empty buckets).
 */
export async function getMasterlistQueueKpiCounts(
  supabase: SupabaseClient,
): Promise<MasterlistQueueKpiCounts> {
  const [totalRes, activeRes, attentionRes] = await Promise.all([
    supabase.from("masterlist").select("id", { count: "exact", head: true }),
    supabase
      .from("masterlist")
      .select("id", { count: "exact", head: true })
      .eq("account_status", "active"),
    supabase
      .from("masterlist")
      .select("id", { count: "exact", head: true })
      .or("remedial_flag.eq.true,aging_bucket.neq.current"),
  ]);

  if (totalRes.error) throw new Error(totalRes.error.message);
  if (activeRes.error) throw new Error(activeRes.error.message);
  if (attentionRes.error) throw new Error(attentionRes.error.message);

  const balanceRows: { outstanding_balance: number }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("masterlist")
      .select("outstanding_balance")
      .order("id", { ascending: true })
      .range(offset, offset + OUTSTANDING_BALANCE_FETCH_PAGE - 1);

    if (error) throw new Error(error.message);

    const batch = data ?? [];
    for (const row of batch) {
      balanceRows.push({
        outstanding_balance: Number(row.outstanding_balance),
      });
    }

    if (batch.length < OUTSTANDING_BALANCE_FETCH_PAGE) {
      break;
    }
    offset += OUTSTANDING_BALANCE_FETCH_PAGE;
  }

  return {
    total: totalRes.count ?? 0,
    activeCount: activeRes.count ?? 0,
    attentionCount: attentionRes.count ?? 0,
    totalOutstanding: sumOutstandingBalances(balanceRows),
  };
}
