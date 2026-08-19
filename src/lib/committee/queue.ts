import type { SupabaseClient } from "@supabase/supabase-js";

import { computeTatDays } from "@/lib/committee/votes";

export type CommitteeStatusFilter =
  | "all"
  | "for_approval"
  | "committee_hold"
  | "negotiating_terms";

export type CommitteeQueueSortKey = "status" | "tat" | "forwarded";

export type CommitteeQueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  isReloan: boolean;
  segment: "sme" | "seafarer" | "individual" | null;
  createdAt: string;
  updatedAt: string;
  tatDays: number | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  verification: {
    finding: string | null;
    forwardedAt: string | null;
    completedAt: string | null;
  } | null;
};

export type CommitteeQueueQueryParams = {
  search?: string;
  statusFilter?: CommitteeStatusFilter;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CommitteeQueueSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CommitteeQueueKpiCounts = {
  total: number;
  needsDecision: number;
  onHold: number;
  inNegotiation: number;
  tatOverdue: number;
};

/** Active committee voting-queue statuses (base filter on every queue query). */
export const ACTIVE_COMMITTEE_STATUSES = [
  "for_approval",
  "negotiating_terms",
  "committee_hold",
] as const;

export const COMMITTEE_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Pure status-filter → query-builder spec (testable without Supabase). */
export type StatusFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; status: (typeof ACTIVE_COMMITTEE_STATUSES)[number] };

export function statusFilterSpec(
  filter: CommitteeStatusFilter,
): StatusFilterSpec {
  if (filter === "all") return { mode: "all" };
  return { mode: "eq", status: filter };
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

/** ISO timestamp for "now minus N days" — used by TAT-overdue KPI. */
export function tatOverdueCutoffIso(asOf = new Date(), days = 5): string {
  const d = new Date(asOf);
  d.setDate(d.getDate() - days);
  return d.toISOString();
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
 * Active committee voting queue — server-side search / status / date / sort / pagination.
 *
 * Sort notes:
 * - `status` — column on loan_applications
 * - `forwarded` / `tat` — both order by `verifications.forwarded_at` (TAT is
 *   monotonically derived from that timestamp; same proxy pattern as CSA's
 *   waiting → updated_at)
 * - `priority` (page default) stays client-current-page-only; when sortKey is
 *   omitted the server uses `updated_at` ascending (pre–Phase-5 default order)
 */
export async function getCommitteeQueue(
  supabase: SupabaseClient,
  params: CommitteeQueueQueryParams,
): Promise<{ rows: CommitteeQueueItem[]; totalCount: number }> {
  const {
    search = "",
    statusFilter = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey,
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = (
    COMMITTEE_QUEUE_PAGE_SIZES as readonly number[]
  ).includes(pageSize)
    ? pageSize
    : 10;
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);
  const dateScoped = Boolean(from || to);

  let borrowerIds: string[] = [];
  if (term) {
    borrowerIds = await findBorrowerIdsForSearch(supabase, term);
  }

  const verificationEmbed = dateScoped
    ? `verifications!inner (
        finding,
        forwarded_at,
        completed_at
      )`
    : `verifications (
        finding,
        forwarded_at,
        completed_at
      )`;

  let query = supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      is_reloan,
      segment,
      created_at,
      updated_at,
      borrowers (
        borrower_no,
        first_name,
        last_name,
        email
      ),
      ${verificationEmbed}
    `,
      { count: "exact" },
    )
    .in("status", [...ACTIVE_COMMITTEE_STATUSES]);

  const filterSpec = statusFilterSpec(statusFilter);
  if (filterSpec.mode === "eq") {
    query = query.eq("status", filterSpec.status);
  }

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (from) {
    query = query.gte("verifications.forwarded_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("verifications.forwarded_at", toInclusiveEnd(to));
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

  if (sortKey === "status") {
    query = query.order("status", { ascending });
  } else if (sortKey === "forwarded" || sortKey === "tat") {
    query = query.order("forwarded_at", {
      ascending,
      foreignTable: "verifications",
    });
  } else {
    // Default / priority placeholder — matches pre–Phase-5 list order
    query = query.order("updated_at", { ascending: true });
  }

  query = query.range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows: CommitteeQueueItem[] = (data ?? []).map((row) => {
    const borrowerRaw = row.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    const verificationRaw = row.verifications;
    const verification = Array.isArray(verificationRaw)
      ? verificationRaw[0]
      : verificationRaw;
    const forwardedAt =
      (verification?.forwarded_at as string | null | undefined) ?? null;

    const segmentRaw = row.segment as string | null;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return {
      id: row.id as string,
      applicationNo: (row.application_no as string | null) ?? null,
      status: row.status as string,
      isReloan: Boolean(row.is_reloan),
      segment,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      tatDays: computeTatDays(forwardedAt, null),
      borrower: borrower
        ? {
            borrowerNo: borrower.borrower_no as string,
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
            email: borrower.email as string,
          }
        : null,
      verification: verification
        ? {
            finding: (verification.finding as string | null) ?? null,
            forwardedAt,
            completedAt:
              (verification.completed_at as string | null) ?? null,
          }
        : null,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Queue KPI counts over the active-status universe only — not date-scoped
 * (preserves pre–Phase-5 behavior).
 */
export async function getCommitteeQueueKpiCounts(
  supabase: SupabaseClient,
): Promise<CommitteeQueueKpiCounts> {
  const cutoff = tatOverdueCutoffIso();

  const [totalRes, needsDecisionRes, onHoldRes, negotiationRes, tatOverdueRes] =
    await Promise.all([
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .in("status", [...ACTIVE_COMMITTEE_STATUSES]),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "for_approval"),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "committee_hold"),
      supabase
        .from("loan_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "negotiating_terms"),
      supabase
        .from("loan_applications")
        .select("id, verifications!inner(forwarded_at)", {
          count: "exact",
          head: true,
        })
        .in("status", [...ACTIVE_COMMITTEE_STATUSES])
        .lte("verifications.forwarded_at", cutoff),
    ]);

  if (totalRes.error) throw new Error(totalRes.error.message);
  if (needsDecisionRes.error) throw new Error(needsDecisionRes.error.message);
  if (onHoldRes.error) throw new Error(onHoldRes.error.message);
  if (negotiationRes.error) throw new Error(negotiationRes.error.message);
  if (tatOverdueRes.error) throw new Error(tatOverdueRes.error.message);

  return {
    total: totalRes.count ?? 0,
    needsDecision: needsDecisionRes.count ?? 0,
    onHold: onHoldRes.count ?? 0,
    inNegotiation: negotiationRes.count ?? 0,
    tatOverdue: tatOverdueRes.count ?? 0,
  };
}
