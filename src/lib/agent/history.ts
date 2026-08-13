import type { SupabaseClient } from "@supabase/supabase-js";

export type ClosedLeadRow = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  applicationId: string | null;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | null;
  convertedAt: string;
};

export type ClosedLeadsSortKey = "borrower" | "business" | "convertedAt";

export type ClosedLeadsQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme";
  from?: string | null;
  to?: string | null;
  sortKey?: ClosedLeadsSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type ClosedLeadsKpiCounts = {
  total: number;
};

export const CLOSED_LEADS_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampClosedLeadsPageSize(pageSize: number): number {
  return (CLOSED_LEADS_PAGE_SIZES as readonly number[]).includes(pageSize)
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

/**
 * Converted leads for one agent — `agent_user_id = userId`, status
 * `converted`. `convertedAt` is `updated_at` (stamped once at conversion).
 * Search is same-table on borrower_name / business_name.
 */
export async function getClosedLeadsHistory(
  supabase: SupabaseClient,
  userId: string,
  params: ClosedLeadsQueryParams,
): Promise<{ rows: ClosedLeadRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "convertedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampClosedLeadsPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let query = supabase
    .from("leads")
    .select(
      `
      id,
      borrower_name,
      business_name,
      application_id,
      updated_at,
      loan_applications ( application_no, segment )
    `,
      { count: "exact" },
    )
    .eq("agent_user_id", userId)
    .eq("status", "converted");

  if (segmentFilter !== "all") {
    query = query.eq("loan_applications.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("updated_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("updated_at", toInclusiveEnd(to));
  }

  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `borrower_name.ilike."${pattern}",business_name.ilike."${pattern}"`,
    );
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", { ascending });
  } else if (sortKey === "business") {
    query = query.order("business_name", { ascending });
  } else {
    query = query.order("updated_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) => {
    const appRaw = row.loan_applications;
    const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
    const segmentRaw = app?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" ? segmentRaw : null;

    return {
      id: row.id as string,
      borrowerName: row.borrower_name as string,
      businessName: (row.business_name as string | null) ?? null,
      applicationId: (row.application_id as string | null) ?? null,
      applicationNo: (app?.application_no as string | null | undefined) ?? null,
      segment,
      convertedAt: row.updated_at as string,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Converted-leads KPI — date-scoped only (ignores search), same agent scope.
 */
export async function getClosedLeadsKpiCounts(
  supabase: SupabaseClient,
  userId: string,
  bounds: { from?: string | null; to?: string | null },
): Promise<ClosedLeadsKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_user_id", userId)
    .eq("status", "converted");

  if (from) {
    query = query.gte("updated_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("updated_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}
