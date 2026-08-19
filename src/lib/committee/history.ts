import type { SupabaseClient } from "@supabase/supabase-js";

export type CommitteeDecisionAction = "approve" | "deny" | "revisit" | "hold";

export type CommitteeHistoryRow = {
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
  action: CommitteeDecisionAction;
  comment: string | null;
  myVote: "approve" | "deny" | null;
  loanTypeName: string | null;
  principal: number | null;
  actedAt: string;
  currentStatus: string;
};

export type CommitteeHistorySortKey =
  | "applicationNo"
  | "borrower"
  | "action"
  | "actedAt";

export type CommitteeHistoryQueryParams = {
  search?: string;
  action?: CommitteeDecisionAction | "all";
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CommitteeHistorySortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CommitteeHistoryKpiCounts = {
  total: number;
  approve: number;
  deny: number;
  revisit: number;
  hold: number;
};

export const COMMITTEE_DECISION_ACTIONS = [
  "approve",
  "deny",
  "revisit",
  "hold",
] as const;

export const COMMITTEE_DECISION_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

type ComputationHistRow = {
  loan_application_id: string;
  loan_type_name: string | null;
  principal: number | null;
  version: number;
};

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

/** Resolve the current user's vote from a decision-time votes_snapshot. */
export function myVoteFromSnapshot(
  snapshot: Array<{ voterId: string; vote: "approve" | "deny" }> | null | undefined,
  userId: string,
): "approve" | "deny" | null {
  if (!snapshot?.length) return null;
  const mine = snapshot.find((entry) => entry.voterId === userId);
  return mine?.vote ?? null;
}

/**
 * Action filter for History KPI/list queries, or null for "all".
 * Mirrors CSA's statusesForHistoryGroup — eq filter, not a status bucket.
 */
export function actionFilterSpec(
  action: CommitteeDecisionAction | "all",
): CommitteeDecisionAction | null {
  if (action === "all") return null;
  return action;
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
 * Append-only committee decision log — one row per committee_actions entry.
 * Server-side search / action / date / sort / pagination.
 *
 * Sort note: `applicationNo` orders via foreignTable `loan_applications`
 * (1-hop). `borrower` is **not** sorted server-side — PostgREST 2-hop
 * foreign-table order (`loan_applications.borrowers`) is unreliable for
 * parent ordering; callers should sort `borrower` client-side on the
 * current page (same scoping as CSA History's Amount). When `sortKey` is
 * `borrower`, the server falls back to `acted_at`.
 */
export async function getCommitteeDecisionHistory(
  supabase: SupabaseClient,
  userId: string,
  params: CommitteeHistoryQueryParams,
): Promise<{ rows: CommitteeHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    action = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "actedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = (
    COMMITTEE_DECISION_PAGE_SIZES as readonly number[]
  ).includes(pageSize)
    ? pageSize
    : 10;
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
    .from("committee_actions")
    .select(
      `
      id,
      loan_application_id,
      action,
      comment,
      acted_at,
      votes_snapshot,
      loan_applications (
        application_no,
        status,
        segment,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
      { count: "exact" },
    );

  const actionEq = actionFilterSpec(action);
  if (actionEq) {
    query = query.eq("action", actionEq);
  }

  if (segmentFilter !== "all") {
    query = query.eq("loan_applications.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("acted_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("acted_at", toInclusiveEnd(to));
  }

  if (applicationIds) {
    query = query.in("loan_application_id", applicationIds);
  }

  if (sortKey === "applicationNo") {
    query = query.order("application_no", {
      ascending,
      foreignTable: "loan_applications",
    });
  } else if (sortKey === "action") {
    query = query.order("action", { ascending });
  } else {
    // actedAt default; also used when sortKey === "borrower" (client-page sort)
    query = query.order("acted_at", { ascending });
  }

  query = query.range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const actions = data ?? [];
  const totalCount = count ?? 0;

  if (actions.length === 0) {
    return { rows: [], totalCount };
  }

  const ids = [
    ...new Set(
      actions.map((row) => row.loan_application_id as string),
    ),
  ];

  const { data: computationRows, error: computationError } = await supabase
    .from("computations")
    .select("loan_application_id, loan_type_name, principal, version")
    .in("loan_application_id", ids)
    .eq("is_active", true);

  if (computationError) {
    throw new Error(computationError.message);
  }

  const computations = (computationRows ?? []) as ComputationHistRow[];

  const rows = actions.map((row) => {
    const applicationId = row.loan_application_id as string;
    const appRaw = row.loan_applications;
    const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
    const borrowerRaw = app?.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    const computation = pickLatestActiveComputation(computations, applicationId);
    const snapshot = row.votes_snapshot as
      | Array<{ voterId: string; vote: "approve" | "deny" }>
      | null;

    const segmentRaw = app?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return {
      id: row.id as string,
      applicationId,
      applicationNo: (app?.application_no as string | null) ?? null,
      segment,
      borrower: borrower
        ? {
            borrowerNo: borrower.borrower_no as string,
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
            email: borrower.email as string,
          }
        : null,
      action: row.action as CommitteeDecisionAction,
      comment: (row.comment as string | null) ?? null,
      myVote: myVoteFromSnapshot(snapshot, userId),
      loanTypeName: computation?.loanTypeName ?? null,
      principal: computation?.principal ?? null,
      actedAt: row.acted_at as string,
      currentStatus: (app?.status as string | null) ?? "unknown",
    };
  });

  return { rows, totalCount };
}

/**
 * History KPI counts — date-scoped only (ignores action/search), matching
 * CSA History KPI behavior.
 */
export async function getCommitteeHistoryKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CommitteeHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  async function countFor(
    action: CommitteeDecisionAction | "all",
  ): Promise<number> {
    let query = supabase
      .from("committee_actions")
      .select("id", { count: "exact", head: true });

    const actionEq = actionFilterSpec(action);
    if (actionEq) {
      query = query.eq("action", actionEq);
    }

    if (from) {
      query = query.gte("acted_at", toInclusiveStart(from));
    }
    if (to) {
      query = query.lte("acted_at", toInclusiveEnd(to));
    }

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const [total, approve, deny, revisit, hold] = await Promise.all([
    countFor("all"),
    countFor("approve"),
    countFor("deny"),
    countFor("revisit"),
    countFor("hold"),
  ]);

  return { total, approve, deny, revisit, hold };
}
