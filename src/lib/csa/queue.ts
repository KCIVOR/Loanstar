import type { SupabaseClient } from "@supabase/supabase-js";

export type CsaWorkFilter =
  | "all"
  | "attention"
  | "documents"
  | "negotiation";

export type CsaQueueSortKey =
  | "borrower"
  | "type"
  | "status"
  | "filed"
  | "waiting";

export type CsaQueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  blocker: string | null;
  isReloan: boolean;
  segment: "sme" | "seafarer" | null;
  createdAt: string;
  updatedAt: string;
  borrower: {
    id: string;
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type CsaQueueQueryParams = {
  search?: string;
  workFilter?: CsaWorkFilter;
  segment?: "all" | "seafarer" | "sme";
  from?: string | null;
  to?: string | null;
  sortKey?: CsaQueueSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CsaQueueKpiCounts = {
  total: number;
  needsAttention: number;
  documentsPending: number;
  inNegotiation: number;
};

/** Active CSA intake queue statuses (base filter on every queue query). */
export const ACTIVE_QUEUE_STATUSES = [
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
  "approved",
  "awaiting_confirmation",
  "negotiating_terms",
] as const;

export const ATTENTION_STATUSES = ["on_hold", "for_revision"] as const;

export const DOCUMENT_STATUSES = [
  "registered",
  "documents_pending",
  "submitted",
  "for_revision",
] as const;

export const NEGOTIATION_STATUSES = [
  "negotiating_terms",
  "awaiting_confirmation",
] as const;

export const CSA_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

export function csaNeedsAttention(input: {
  status: string;
  blocker?: string | null;
}): boolean {
  return (
    (ATTENTION_STATUSES as readonly string[]).includes(input.status) ||
    Boolean(input.blocker?.trim())
  );
}

export function csaMatchesWorkFilter(
  input: { status: string; blocker?: string | null },
  filter: CsaWorkFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return csaNeedsAttention(input);
  if (filter === "documents") {
    return (DOCUMENT_STATUSES as readonly string[]).includes(input.status);
  }
  if (filter === "negotiation") {
    return (NEGOTIATION_STATUSES as readonly string[]).includes(input.status);
  }
  return true;
}

/** Whole days since the given timestamp (usually updated_at or created_at). */
export function daysInQueue(sinceIso: string, asOf = new Date()): number {
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return 0;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatBlockerLabel(
  blocker: string | null | undefined,
): string | null {
  if (!blocker?.trim()) return null;
  const plain = blocker.replaceAll("_", " ").trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Pure work-filter → query-builder spec (testable without Supabase). */
export type WorkFilterSpec =
  | { mode: "all" }
  | { mode: "in"; statuses: readonly string[] }
  | { mode: "attention"; statuses: readonly string[] };

export function workFilterSpec(filter: CsaWorkFilter): WorkFilterSpec {
  if (filter === "all") return { mode: "all" };
  if (filter === "documents") {
    return { mode: "in", statuses: DOCUMENT_STATUSES };
  }
  if (filter === "negotiation") {
    return { mode: "in", statuses: NEGOTIATION_STATUSES };
  }
  return { mode: "attention", statuses: ATTENTION_STATUSES };
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
 * Active CSA intake queue — server-side search / work filter / date / sort / pagination.
 * Note: `priority` sort stays client-side (current page only); omit sortKey for default filed desc.
 */
export async function getCsaQueue(
  supabase: SupabaseClient,
  params: CsaQueueQueryParams,
): Promise<{ rows: CsaQueueItem[]; totalCount: number }> {
  const {
    search = "",
    workFilter = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey,
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = (CSA_QUEUE_PAGE_SIZES as readonly number[]).includes(
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
      blocker,
      is_reloan,
      segment,
      created_at,
      updated_at,
      borrowers!inner (
        id,
        borrower_no,
        first_name,
        last_name,
        email
      )
    `,
      { count: "exact" },
    )
    .in("status", [...ACTIVE_QUEUE_STATUSES]);

  const filterSpec = workFilterSpec(workFilter);
  if (filterSpec.mode === "in") {
    query = query.in("status", [...filterSpec.statuses]);
  } else if (filterSpec.mode === "attention") {
    query = query.or(
      `status.in.(${filterSpec.statuses.join(",")}),blocker.not.is.null`,
    );
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
    if (borrowerIds.length > 0) {
      query = query.or(
        `application_no.ilike."${pattern}",borrower_id.in.(${borrowerIds.join(",")})`,
      );
    } else {
      query = query.ilike("application_no", pattern);
    }
  }

  if (sortKey === "borrower") {
    query = query.order("last_name", {
      ascending,
      foreignTable: "borrowers",
    });
  } else if (sortKey === "type") {
    query = query.order("is_reloan", { ascending });
  } else if (sortKey === "status") {
    query = query.order("status", { ascending });
  } else if (sortKey === "waiting") {
    query = query.order("updated_at", { ascending });
  } else {
    // filed (default) — also used when client sorts by priority on the page
    query = query.order("created_at", { ascending });
  }

  query = query.range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows: CsaQueueItem[] = (data ?? []).map((row) => {
    const borrowerRaw = row.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    const segmentRaw = row.segment as string | null;
    const segment: "sme" | "seafarer" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" ? segmentRaw : null;

    return {
      id: row.id as string,
      applicationNo: (row.application_no as string | null) ?? null,
      status: row.status as string,
      blocker: (row.blocker as string | null) ?? null,
      isReloan: Boolean(row.is_reloan),
      segment,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      borrower: borrower
        ? {
            id: borrower.id as string,
            borrowerNo: borrower.borrower_no as string,
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
            email: borrower.email as string,
          }
        : null,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Queue KPI counts over the active-status universe only — not date-scoped
 * (preserves pre–Phase-10 behavior).
 */
export async function getCsaQueueKpiCounts(
  supabase: SupabaseClient,
): Promise<CsaQueueKpiCounts> {
  const [totalRes, attentionRes, documentsRes, negotiationRes] =
    await Promise.all([
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .in("status", [...ACTIVE_QUEUE_STATUSES]),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .in("status", [...ACTIVE_QUEUE_STATUSES])
        .or(
          `status.in.(${ATTENTION_STATUSES.join(",")}),blocker.not.is.null`,
        ),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .in("status", [...DOCUMENT_STATUSES]),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .in("status", [...NEGOTIATION_STATUSES]),
    ]);

  if (totalRes.error) throw new Error(totalRes.error.message);
  if (attentionRes.error) throw new Error(attentionRes.error.message);
  if (documentsRes.error) throw new Error(documentsRes.error.message);
  if (negotiationRes.error) throw new Error(negotiationRes.error.message);

  return {
    total: totalRes.count ?? 0,
    needsAttention: attentionRes.count ?? 0,
    documentsPending: documentsRes.count ?? 0,
    inNegotiation: negotiationRes.count ?? 0,
  };
}
