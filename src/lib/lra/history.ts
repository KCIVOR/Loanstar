import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReleasePath } from "@/lib/lra/constants";

export type { ReleasePath };

export type ReleasedLoanRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | "individual" | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  releasePaths: ReleasePath[];
  loanTypeName: string | null;
  netReleased: number | null;
  pdcCollectedAt: string | null;
  closedAt: string;
};

export type ReleasedLoansSortKey = "applicationNo" | "borrower" | "closedAt";

export type ReleasedLoansQueryParams = {
  search?: string;
  releasePath?: ReleasePath | "all";
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: ReleasedLoansSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type ReleasedLoansKpiCounts = {
  total: number;
};

export const RELEASE_PATHS = ["with_pdc", "without_pdc"] as const;

export const RELEASED_LOANS_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/**
 * Release-path filter for History queries, or null for "all".
 * Applied via `.contains("release_paths", [path])` so a "both" file matches
 * either single-path filter chip.
 */
export function releasePathFilterSpec(
  releasePath: ReleasePath | "all",
): ReleasePath | null {
  if (releasePath === "all") return null;
  return releasePath;
}

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampReleasedLoansPageSize(pageSize: number): number {
  return (RELEASED_LOANS_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
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

async function findBorrowerIdsForSearch(
  supabase: SupabaseClient,
  term: string,
): Promise<string[]> {
  const pattern = `"%${term}%"`;
  const { data, error } = await supabase
    .from("borrowers")
    .select("id")
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},borrower_no.ilike.${pattern}`,
    )
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id as string);
}

async function findLoanApplicationIdsForSearch(
  supabase: SupabaseClient,
  term: string,
  borrowerIds: string[],
): Promise<string[]> {
  const pattern = `%${term}%`;
  let query = supabase.from("loan_applications").select("id").limit(500);

  if (borrowerIds.length > 0) {
    query = query.or(
      `application_no.ilike."${pattern}",borrower_id.in.(${borrowerIds.join(",")})`,
    );
  } else {
    query = query.ilike("application_no", pattern);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id as string);
}

const HISTORY_SELECT = `
  id,
  loan_application_id,
  release_paths,
  computation_id,
  pdc_collected_at,
  loan_applications (
    application_no,
    segment,
    borrowers (
      borrower_no,
      first_name,
      last_name,
      email
    )
  ),
  computations (
    loan_type_name,
    net_released
  ),
  release_events!inner (
    acted_at
  )
`;

/**
 * PostgREST/Supabase default max rows per request. The superset fetch walks
 * pages at this size so results are not silently truncated at 1000.
 */
export const HISTORY_FETCH_PAGE = 1000;

function mapHistoryRow(row: Record<string, unknown>): ReleasedLoanRow | null {
  const eventsRaw = row.release_events;
  const event = Array.isArray(eventsRaw) ? eventsRaw[0] : eventsRaw;
  const closedAt =
    ((event as { acted_at?: string } | undefined)?.acted_at as
      | string
      | null
      | undefined) ?? null;
  if (!closedAt) return null;

  const appRaw = row.loan_applications;
  const app = (Array.isArray(appRaw) ? appRaw[0] : appRaw) as
    | {
        application_no?: string | null;
        segment?: string | null;
        borrowers?: unknown;
      }
    | undefined;
  const borrowerRaw = app?.borrowers;
  const borrower = (
    Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
  ) as
    | {
        borrower_no: string;
        first_name: string;
        last_name: string;
        email: string;
      }
    | undefined;

  const computationRaw = row.computations;
  const computation = (
    Array.isArray(computationRaw) ? computationRaw[0] : computationRaw
  ) as { loan_type_name?: string | null; net_released?: unknown } | undefined;

  const netRaw = computation?.net_released;
  const netReleased =
    netRaw === null || netRaw === undefined ? null : Number(netRaw);

  const pathsRaw = row.release_paths;
  const releasePaths: ReleasePath[] = Array.isArray(pathsRaw)
    ? pathsRaw.filter(
        (p): p is ReleasePath => p === "with_pdc" || p === "without_pdc",
      )
    : [];

  const segmentRaw = app?.segment;
  const segment: "sme" | "seafarer" | "individual" | null =
    segmentRaw === "sme" ||
    segmentRaw === "seafarer" ||
    segmentRaw === "individual"
      ? segmentRaw
      : null;

  return {
    id: row.id as string,
    applicationId: row.loan_application_id as string,
    applicationNo: app?.application_no ?? null,
    segment,
    borrower: borrower
      ? {
          borrowerNo: borrower.borrower_no,
          firstName: borrower.first_name,
          lastName: borrower.last_name,
          email: borrower.email,
        }
      : null,
    releasePaths,
    loanTypeName: computation?.loan_type_name ?? null,
    netReleased,
    pdcCollectedAt: (row.pdc_collected_at as string | null) ?? null,
    closedAt,
  };
}

/** Null segment never matches a concrete Seafarer/SME/Individual filter. */
export function passesHistorySegmentFilter(
  row: { segment: "sme" | "seafarer" | "individual" | null },
  segmentFilter: "all" | "seafarer" | "sme" | "individual",
): boolean {
  if (segmentFilter === "all") return true;
  return row.segment === segmentFilter;
}

/**
 * Fetch date/path/search-filtered closed `release_files` rows, walking
 * PostgREST pages so large sets are not silently truncated at 1000. Segment
 * is applied later in JS — filtering an embedded to-one resource
 * (`loan_applications.segment`) via `.eq()` does not restrict the parent
 * `release_files` rows unless the embed is marked `!inner` (same class of
 * pitfall documented in `queue.ts` for `release_queue`'s status filter);
 * without it Supabase silently ignores the filter and returns every closed
 * file regardless of segment.
 */
async function fetchHistorySuperset(
  supabase: SupabaseClient,
  opts: {
    applicationIds: string[] | null;
    releasePath: ReleasePath | "all";
    from: string | null;
    to: string | null;
  },
): Promise<ReleasedLoanRow[]> {
  const rows: ReleasedLoanRow[] = [];
  const pathEq = releasePathFilterSpec(opts.releasePath);
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("release_files")
      .select(HISTORY_SELECT)
      .eq("status", "closed")
      .eq("release_events.event_type", "closed")
      .order("id", { ascending: true })
      .range(offset, offset + HISTORY_FETCH_PAGE - 1);

    if (pathEq) {
      query = query.contains("release_paths", [pathEq]);
    }
    if (opts.from) {
      query = query.gte("release_events.acted_at", toInclusiveStart(opts.from));
    }
    if (opts.to) {
      query = query.lte("release_events.acted_at", toInclusiveEnd(opts.to));
    }
    if (opts.applicationIds) {
      query = query.in("loan_application_id", opts.applicationIds);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as Record<string, unknown>[];
    for (const row of batch) {
      const mapped = mapHistoryRow(row);
      if (mapped) rows.push(mapped);
    }

    if (batch.length < HISTORY_FETCH_PAGE) break;
    offset += HISTORY_FETCH_PAGE;
  }

  return rows;
}

function compareHistoryRows(
  a: ReleasedLoanRow,
  b: ReleasedLoanRow,
  sortKey: ReleasedLoansSortKey,
  sortDir: "asc" | "desc",
): number {
  const dir = sortDir === "asc" ? 1 : -1;

  if (sortKey === "applicationNo") {
    const cmp = (a.applicationNo ?? "").localeCompare(b.applicationNo ?? "");
    if (cmp !== 0) return cmp * dir;
  } else if (sortKey === "borrower") {
    // Server-side 2-hop foreign-table order is unreliable — sort client-side
    // instead, same fallback documented on the old query-builder approach.
    const aName = `${a.borrower?.lastName ?? ""} ${a.borrower?.firstName ?? ""}`;
    const bName = `${b.borrower?.lastName ?? ""} ${b.borrower?.firstName ?? ""}`;
    const cmp = aName.localeCompare(bName);
    if (cmp !== 0) return cmp * dir;
  } else {
    const cmp =
      new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime();
    if (cmp !== 0) return cmp * dir;
  }

  return a.id.localeCompare(b.id);
}

/**
 * Closed release files — one row per `release_files` with status `closed`.
 * `closedAt` comes from the matching `release_events` row (`event_type =
 * 'closed'`). Amount/loan type come from the pinned `computation_id` FK
 * (not latest-active lookup).
 *
 * Path/date/search filters run in SQL (reliable — they target the
 * `release_files`/`release_events!inner` row itself, not an optional
 * embed). Segment, sort, and pagination run in JS over the fetched superset
 * — see `fetchHistorySuperset` for why segment can't be a SQL `.eq()`.
 */
export async function getReleasedLoansHistory(
  supabase: SupabaseClient,
  params: ReleasedLoansQueryParams,
): Promise<{ rows: ReleasedLoanRow[]; totalCount: number }> {
  const {
    search = "",
    releasePath = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "closedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampReleasedLoansPageSize(pageSize);
  const term = sanitizeSearchTerm(search);

  let applicationIds: string[] | null = null;
  if (term) {
    const borrowerIds = await findBorrowerIdsForSearch(supabase, term);
    applicationIds = await findLoanApplicationIdsForSearch(
      supabase,
      term,
      borrowerIds,
    );
    if (applicationIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  const superset = await fetchHistorySuperset(supabase, {
    applicationIds,
    releasePath,
    from,
    to,
  });

  const filtered = superset.filter((row) =>
    passesHistorySegmentFilter(row, segmentFilter),
  );
  filtered.sort((a, b) => compareHistoryRows(a, b, sortKey, sortDir));

  const totalCount = filtered.length;
  const offset = (safePage - 1) * safePageSize;
  const rows = filtered.slice(offset, offset + safePageSize);

  return { rows, totalCount };
}

/**
 * Released-loans KPI — date-scoped only on closed events (ignores
 * search/path), matching AR Closed Accounts.
 */
export async function getReleasedLoansKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<ReleasedLoansKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("release_files")
    .select("id, release_events!inner(acted_at)", {
      count: "exact",
      head: true,
    })
    .eq("status", "closed")
    .eq("release_events.event_type", "closed");

  if (from) {
    query = query.gte("release_events.acted_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("release_events.acted_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}
