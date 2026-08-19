import type { SupabaseClient } from "@supabase/supabase-js";

export type CsaHistoryStatusGroup = "in_progress" | "denied" | "released";

export type CsaHistoryRow = {
  id: string;
  applicationNo: string | null;
  status: string;
  statusGroup: CsaHistoryStatusGroup;
  segment: "sme" | "seafarer" | "individual" | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  loanTypeName: string | null;
  principal: number | null;
  endorsedAt: string;
};

export type CsaHistorySortKey =
  | "applicationNo"
  | "borrower"
  | "status"
  | "endorsedAt";

export type CsaHistoryQueryParams = {
  search?: string;
  statusGroup?: CsaHistoryStatusGroup | "all";
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CsaHistorySortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CsaHistoryKpiCounts = {
  total: number;
  in_progress: number;
  denied: number;
  released: number;
};

/** Statuses that bucket to `in_progress` in `csaHistoryStatusGroup`. */
export const IN_PROGRESS_STATUSES = [
  "for_verification",
  "for_approval",
  "committee_hold",
  "approved",
  "for_revision",
  "negotiating_terms",
  "awaiting_confirmation",
  "lra_pending",
  "release_signing",
  "release_briefing",
  "release_ready",
] as const;

export const RELEASED_STATUSES = [
  "released",
  "closed",
  "loan_active",
  "paid_off",
] as const;

export const CSA_HISTORY_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

type ComputationHistRow = {
  loan_application_id: string;
  loan_type_name: string | null;
  principal: number | null;
  version: number;
};

/**
 * Bucket a post-endorsement application status for CSA history filters.
 * Unknown/future statuses default to in_progress (not dropped).
 */
export function csaHistoryStatusGroup(status: string): CsaHistoryStatusGroup {
  if (status === "denied" || status === "cancelled") return "denied";
  if ((RELEASED_STATUSES as readonly string[]).includes(status)) {
    return "released";
  }
  return "in_progress";
}

/** Status list for a History KPI/filter group, or null for "all". */
export function statusesForHistoryGroup(
  statusGroup: CsaHistoryStatusGroup | "all",
): readonly string[] | null {
  if (statusGroup === "all") return null;
  if (statusGroup === "denied") return ["denied", "cancelled"];
  if (statusGroup === "released") return RELEASED_STATUSES;
  return IN_PROGRESS_STATUSES;
}

/** Prefer highest version among active computation rows for one application. */
export function pickLatestActiveComputation(
  rows: ComputationHistRow[],
  applicationId: string,
): { loanTypeName: string | null; principal: number | null } | null {
  let best: ComputationHistRow | null = null;
  for (const row of rows) {
    if (row.loan_application_id !== applicationId) continue;
    if (!best || row.version > best.version) best = row;
  }
  if (!best) return null;
  return {
    loanTypeName: best.loan_type_name ?? null,
    principal: best.principal ?? null,
  };
}

export function csaHistoryMatchesSearch(
  item: {
    applicationNo: string | null;
    borrower: {
      borrowerNo: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  },
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const name = item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(q) ||
    (item.borrower?.borrowerNo.toLowerCase().includes(q) ?? false) ||
    (item.borrower?.email.toLowerCase().includes(q) ?? false) ||
    (item.applicationNo?.toLowerCase().includes(q) ?? false)
  );
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

/**
 * Applications CSA already endorsed out of the active queue — read-only history.
 * Server-side search / status / date / sort / pagination.
 */
export async function getCsaApplicationHistory(
  supabase: SupabaseClient,
  params: CsaHistoryQueryParams,
): Promise<{ rows: CsaHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    statusGroup = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "endorsedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = (CSA_HISTORY_PAGE_SIZES as readonly number[]).includes(
    pageSize,
  )
    ? pageSize
    : 10;
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let borrowerIds: string[] = [];
  if (term) {
    borrowerIds = await findBorrowerIdsForSearch(supabase, term);
  }

  let query = supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      segment,
      endorsed_at,
      borrowers!inner (
        borrower_no,
        first_name,
        last_name,
        email
      )
    `,
      { count: "exact" },
    )
    .not("endorsed_at", "is", null);

  const statuses = statusesForHistoryGroup(statusGroup);
  if (statuses) {
    query = query.in("status", [...statuses]);
  }

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (from) {
    query = query.gte("endorsed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("endorsed_at", toInclusiveEnd(to));
  }

  if (term) {
    const pattern = `%${term}%`;
    if (borrowerIds.length > 0) {
      query = query.or(
        `application_no.ilike."${pattern}",borrower_id.in.(${borrowerIds.join(",")})`,
      );
    } else {
      query = query.ilike("application_no", pattern);
    }
  }

  if (sortKey === "applicationNo") {
    query = query.order("application_no", { ascending });
  } else if (sortKey === "borrower") {
    query = query.order("last_name", {
      ascending,
      foreignTable: "borrowers",
    });
  } else if (sortKey === "status") {
    query = query.order("status", { ascending });
  } else {
    query = query.order("endorsed_at", { ascending });
  }

  query = query.range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const applications = data ?? [];
  const totalCount = count ?? 0;

  if (applications.length === 0) {
    return { rows: [], totalCount };
  }

  const ids = applications.map((row) => row.id as string);

  const { data: computationRows, error: computationError } = await supabase
    .from("computations")
    .select("loan_application_id, loan_type_name, principal, version")
    .in("loan_application_id", ids)
    .eq("is_active", true);

  if (computationError) {
    throw new Error(computationError.message);
  }

  const computations = (computationRows ?? []) as ComputationHistRow[];

  const rows = applications.flatMap((row) => {
    const endorsedAt = row.endorsed_at as string | null;
    if (!endorsedAt) return [];

    const borrowerRaw = row.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

    const computation = pickLatestActiveComputation(
      computations,
      row.id as string,
    );

    const segmentRaw = row.segment as string | null;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return [
      {
        id: row.id as string,
        applicationNo: (row.application_no as string | null) ?? null,
        status: row.status as string,
        statusGroup: csaHistoryStatusGroup(row.status as string),
        segment,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
        loanTypeName: computation?.loanTypeName ?? null,
        principal: computation?.principal ?? null,
        endorsedAt,
      },
    ];
  });

  return { rows, totalCount };
}

/**
 * History KPI counts — date-scoped only (ignores status/search), matching
 * existing History page behavior.
 */
export async function getCsaHistoryKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CsaHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  async function countFor(
    statusGroup: CsaHistoryStatusGroup | "all",
  ): Promise<number> {
    let query = supabase
      .from("loan_applications")
      .select("id", { count: "exact", head: true })
      .not("endorsed_at", "is", null);

    const statuses = statusesForHistoryGroup(statusGroup);
    if (statuses) {
      query = query.in("status", [...statuses]);
    }

    if (from) {
      query = query.gte("endorsed_at", toInclusiveStart(from));
    }
    if (to) {
      query = query.lte("endorsed_at", toInclusiveEnd(to));
    }

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const [total, in_progress, denied, released] = await Promise.all([
    countFor("all"),
    countFor("in_progress"),
    countFor("denied"),
    countFor("released"),
  ]);

  return { total, in_progress, denied, released };
}
