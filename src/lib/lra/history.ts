import type { SupabaseClient } from "@supabase/supabase-js";

export type ReleasePath = "with_pdc" | "without_pdc";

export type ReleasedLoanRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  releasePath: ReleasePath | null;
  loanTypeName: string | null;
  netReleased: number | null;
  pdcCollectedAt: string | null;
  closedAt: string;
};

export type ReleasedLoansSortKey = "applicationNo" | "borrower" | "closedAt";

export type ReleasedLoansQueryParams = {
  search?: string;
  releasePath?: ReleasePath | "all";
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
 * Mirrors Committee's actionFilterSpec — eq filter when set.
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

/**
 * Closed release files — one row per `release_files` with status `closed`.
 * `closedAt` comes from the matching `release_events` row (`event_type =
 * 'closed'`). Amount/loan type come from the pinned `computation_id` FK
 * (not latest-active lookup).
 *
 * Sort note: `applicationNo` orders via foreignTable `loan_applications`
 * (1-hop). `borrower` is **not** sorted server-side — PostgREST 2-hop
 * foreign-table order (`loan_applications.borrowers`) is unreliable;
 * callers should sort `borrower` client-side on the current page. When
 * `sortKey` is `borrower`, the server falls back to `closedAt`.
 * `closedAt` orders via foreignTable `release_events.acted_at`.
 * Primary order is always followed by `.order("id", { ascending: true })`.
 */
export async function getReleasedLoansHistory(
  supabase: SupabaseClient,
  params: ReleasedLoansQueryParams,
): Promise<{ rows: ReleasedLoanRow[]; totalCount: number }> {
  const {
    search = "",
    releasePath = "all",
    from = null,
    to = null,
    sortKey = "closedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampReleasedLoansPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
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

  let query = supabase
    .from("release_files")
    .select(
      `
      id,
      loan_application_id,
      release_path,
      computation_id,
      pdc_collected_at,
      loan_applications (
        application_no,
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
    `,
      { count: "exact" },
    )
    .eq("status", "closed")
    .eq("release_events.event_type", "closed");

  const pathEq = releasePathFilterSpec(releasePath);
  if (pathEq) {
    query = query.eq("release_path", pathEq);
  }

  if (from) {
    query = query.gte("release_events.acted_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("release_events.acted_at", toInclusiveEnd(to));
  }

  if (applicationIds) {
    query = query.in("loan_application_id", applicationIds);
  }

  if (sortKey === "applicationNo") {
    query = query.order("application_no", {
      ascending,
      foreignTable: "loan_applications",
    });
  } else {
    // closedAt default; also used when sortKey === "borrower" (client-page sort)
    query = query.order("acted_at", {
      ascending,
      foreignTable: "release_events",
    });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const eventsRaw = row.release_events;
    const event = Array.isArray(eventsRaw) ? eventsRaw[0] : eventsRaw;
    const closedAt = (event?.acted_at as string | null | undefined) ?? null;
    if (!closedAt) return [];

    const appRaw = row.loan_applications;
    const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
    const borrowerRaw = app?.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    const computationRaw = row.computations;
    const computation = Array.isArray(computationRaw)
      ? computationRaw[0]
      : computationRaw;

    const netRaw = computation?.net_released;
    const netReleased =
      netRaw === null || netRaw === undefined ? null : Number(netRaw);

    const pathRaw = row.release_path as string | null;
    const releasePathValue =
      pathRaw === "with_pdc" || pathRaw === "without_pdc" ? pathRaw : null;

    return [
      {
        id: row.id as string,
        applicationId: row.loan_application_id as string,
        applicationNo: (app?.application_no as string | null) ?? null,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
        releasePath: releasePathValue,
        loanTypeName: (computation?.loan_type_name as string | null) ?? null,
        netReleased,
        pdcCollectedAt: (row.pdc_collected_at as string | null) ?? null,
        closedAt,
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
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
