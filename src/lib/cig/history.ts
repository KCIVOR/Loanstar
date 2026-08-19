import type { SupabaseClient } from "@supabase/supabase-js";

export type CigRecentVerification = {
  id: string;
  applicationNo: string | null;
  status: string;
  finding: "positive" | "negative" | null;
  forwardedAt: string | null;
  completedAt: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type CigScheduledCallback = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | "individual" | null;
  scheduledAt: string;
  notes: string | null;
  /** True when `scheduledAt <= now` (still unresolved). */
  isOverdue: boolean;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type CigScheduledCallbacksQueryParams = {
  segment?: "all" | "seafarer" | "sme" | "individual";
};

const RECENT_LIMIT = 100;

export type CigRecentFindingFilter = "all" | "positive" | "negative";

export type CigHistoryBorrower = {
  borrowerNo: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type CigForwardedHistoryRow = {
  id: string;
  verificationId: string;
  applicationNo: string | null;
  status: string;
  segment: "sme" | "seafarer" | "individual" | null;
  finding: "positive" | "negative" | null;
  forwardedAt: string | null;
  completedAt: string | null;
  borrower: CigHistoryBorrower | null;
};

export type CigForwardedSortKey =
  | "forwardedAt"
  | "applicationNo"
  | "borrower";

export type CigForwardedQueryParams = {
  search?: string;
  finding?: CigRecentFindingFilter;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CigForwardedSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CigReturnedHistoryRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | "individual" | null;
  returnedAt: string;
  note: string | null;
  borrower: CigHistoryBorrower | null;
};

export type CigReturnedSortKey = "returnedAt" | "applicationNo" | "borrower";

export type CigReturnedQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: CigReturnedSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CigDenialCallsHistoryRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  informedAt: string;
  informedBy: string | null;
  deniedAt: string;
  borrower: CigHistoryBorrower | null;
};

export type CigDenialCallsSortKey =
  | "informedAt"
  | "applicationNo"
  | "borrower";

export type CigDenialCallsQueryParams = {
  search?: string;
  from?: string | null;
  to?: string | null;
  sortKey?: CigDenialCallsSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CigCancellationsHistoryRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  cancelledAt: string;
  cancelledBy: string | null;
  reason: string;
  borrower: CigHistoryBorrower | null;
};

export type CigCancellationsSortKey =
  | "cancelledAt"
  | "applicationNo"
  | "borrower";

export type CigCancellationsQueryParams = {
  search?: string;
  from?: string | null;
  to?: string | null;
  sortKey?: CigCancellationsSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CigCallbacksResolvedHistoryRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  scheduledAt: string;
  resolvedAt: string;
  notes: string | null;
  borrower: CigHistoryBorrower | null;
};

export type CigCallbacksResolvedSortKey =
  | "resolvedAt"
  | "applicationNo"
  | "scheduledAt";

export type CigCallbacksResolvedQueryParams = {
  search?: string;
  from?: string | null;
  to?: string | null;
  sortKey?: CigCallbacksResolvedSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type CigHistoryKpiCounts = {
  total: number;
};

export const CIG_HISTORY_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Exact prefix `returnToCsa()` writes on `status_history.note`. */
export const CIG_RETURN_TO_CSA_NOTE_PREFIX = "Returned to CSA by CIG";

/** Exact `cig_return_to_csa_events` view WHERE: `LIKE 'Returned to CSA by CIG%'`. */
export const CIG_RETURN_TO_CSA_NOTE_LIKE = "Returned to CSA by CIG%";

/**
 * SQL LIKE semantics for `cig_return_to_csa_events`: case-sensitive
 * prefix match of `Returned to CSA by CIG` (equivalent to
 * `LIKE 'Returned to CSA by CIG%'`). Null/empty → false.
 */
export function isCigReturnToCsaNote(
  note: string | null | undefined,
): boolean {
  if (note == null || note === "") return false;
  return note.startsWith(CIG_RETURN_TO_CSA_NOTE_PREFIX);
}

const APPLICATION_BORROWER_EMBED = `
  loan_applications (
    id,
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
`;

function mapSegment(
  raw: unknown,
): "sme" | "seafarer" | "individual" | null {
  return raw === "sme" || raw === "seafarer" || raw === "individual"
    ? raw
    : null;
}

export function cigRecentMatchesSearch(
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

export function cigRecentMatchesFinding(
  finding: "positive" | "negative" | null,
  filter: CigRecentFindingFilter,
): boolean {
  if (filter === "all") return true;
  return finding === filter;
}

export function cigRecentMatchesStatus(
  status: string,
  filter: string,
): boolean {
  if (filter === "all") return true;
  return status === filter;
}

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCigHistoryPageSize(pageSize: number): number {
  return (CIG_HISTORY_PAGE_SIZES as readonly number[]).includes(pageSize)
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

/** Strip PostgREST wildcard/list chars and collapse whitespace. */
export function sanitizeCigHistorySearch(term: string): string {
  return sanitizeSearchTerm(term);
}

/** Inclusive start-of-day bound for YYYY-MM-DD date-range filters. */
export function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

/** Inclusive end-of-day bound for YYYY-MM-DD date-range filters. */
export function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapBorrower(raw: unknown): CigHistoryBorrower | null {
  const row = firstEmbed(
    raw as Record<string, unknown> | Record<string, unknown>[] | null,
  );
  if (!row) return null;
  return {
    borrowerNo: row.borrower_no as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
  };
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
 * Identity search for event tables that join `loan_applications` +
 * `borrowers`. Do **not** put `.or()` on left-embedded columns of the
 * parent query (PostgREST does not treat that as a parent filter).
 *
 * Approach: same-table search on `loan_applications.application_no` and
 * `borrowers` (name / email / borrower_no), then
 * `.in("loan_application_id", ids)`. Empty id list → no matches.
 */
async function findApplicationIdsForIdentitySearch(
  supabase: SupabaseClient,
  term: string,
): Promise<string[]> {
  const borrowerIds = await findBorrowerIdsForSearch(supabase, term);
  return findLoanApplicationIdsForSearch(supabase, term, borrowerIds);
}

/**
 * Files CIG already completed/forwarded — desk history, not active work.
 */
export async function getCigRecentVerifications(
  supabase: SupabaseClient,
  limit = RECENT_LIMIT,
): Promise<CigRecentVerification[]> {
  const { data, error } = await supabase
    .from("verifications")
    .select(
      `
      finding,
      forwarded_at,
      completed_at,
      loan_applications (
        id,
        application_no,
        status,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
    )
    .not("forwarded_at", "is", null)
    .order("forwarded_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).flatMap((row) => {
    const application = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    if (!application) return [];

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    return [
      {
        id: application.id as string,
        applicationNo: (application.application_no as string | null) ?? null,
        status: application.status as string,
        finding: (row.finding as CigRecentVerification["finding"]) ?? null,
        forwardedAt: (row.forwarded_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
      },
    ];
  });
}

/** True when the callback due time is at or before `asOf`. */
export function callbackIsOverdue(
  scheduledAt: string,
  asOf: Date = new Date(),
): boolean {
  const due = Date.parse(scheduledAt);
  if (Number.isNaN(due)) return false;
  return due <= asOf.getTime();
}

export const CALLBACK_STATUS_FILTERS = ["all", "upcoming", "overdue"] as const;
export type CallbackStatusFilter = (typeof CALLBACK_STATUS_FILTERS)[number];

export const CALLBACK_LIST_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampCallbackListPageSize(n: number): number {
  return (CALLBACK_LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
}

/** Map a raw status query/chip value to a fixed filter, else `"all"`. */
export function callbackStatusFilterSpec(raw: string): CallbackStatusFilter {
  if (raw === "upcoming" || raw === "overdue") return raw;
  return "all";
}

export function passesCallbackStatusFilter(
  isOverdue: boolean,
  spec: CallbackStatusFilter,
): boolean {
  if (spec === "all") return true;
  if (spec === "overdue") return isOverdue;
  return !isOverdue;
}

/** Stable copy-sort by `scheduledAt` (ISO timestamps). Does not mutate `rows`. */
export function sortCallbacksByDue<T extends { scheduledAt: string }>(
  rows: T[],
  dir: "asc" | "desc",
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.scheduledAt) || 0;
    const bTime = Date.parse(b.scheduledAt) || 0;
    if (aTime === bTime) return 0;
    return (aTime - bTime) * mult;
  });
}

/** KPIs over the full unresolved set (before search/status filter). */
export function computeCallbackListKpis(rows: { isOverdue: boolean }[]): {
  upcoming: number;
  overdue: number;
} {
  let upcoming = 0;
  let overdue = 0;
  for (const row of rows) {
    if (row.isOverdue) overdue += 1;
    else upcoming += 1;
  }
  return { upcoming, overdue };
}

/**
 * Full unresolved callback backlog (upcoming + overdue) for applications
 * still in `for_verification` / `for_revision`. Ordered by due ascending.
 */
export async function getCigScheduledCallbacks(
  supabase: SupabaseClient,
  params: CigScheduledCallbacksQueryParams = {},
): Promise<CigScheduledCallback[]> {
  const { segment: segmentFilter = "all" } = params;
  const asOf = new Date();

  let query = supabase
    .from("callbacks")
    .select(
      `
      id,
      scheduled_at,
      notes,
      loan_application_id,
      loan_applications (
        id,
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
    )
    .is("resolved_at", null);

  if (segmentFilter !== "all") {
    query = query.eq("loan_applications.segment", segmentFilter);
  }

  const { data, error } = await query.order("scheduled_at", {
    ascending: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const allowed = new Set(["for_verification", "for_revision"]);

  return (data ?? []).flatMap((row) => {
    const application = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    if (!application) return [];
    if (!allowed.has(application.status as string)) return [];

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    const scheduledAt = row.scheduled_at as string;

    return [
      {
        id: row.id as string,
        applicationId: application.id as string,
        applicationNo: (application.application_no as string | null) ?? null,
        segment: mapSegment(application.segment),
        scheduledAt,
        notes: (row.notes as string | null) ?? null,
        isOverdue: callbackIsOverdue(scheduledAt, asOf),
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
      },
    ];
  });
}

/**
 * Mark a single unresolved callback as resolved. Idempotent: only updates
 * rows still at `resolved_at IS NULL`.
 */
export async function markCallbackResolved(
  supabase: SupabaseClient,
  applicationId: string,
  callbackId: string,
): Promise<{ callbackId: string }> {
  const { data, error } = await supabase
    .from("callbacks")
    .update({
      resolved_at: new Date().toISOString(),
    })
    .eq("id", callbackId)
    .eq("loan_application_id", applicationId)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No pending callback for this application");
  }

  return { callbackId: data.id as string };
}

/**
 * Forwarded-to-Committee history — `verifications` with `forwarded_at`
 * set. Same join shape as `getCigRecentVerifications`.
 *
 * Search: two-query identity lookup (see
 * `findApplicationIdsForIdentitySearch`), then
 * `.in("loan_application_id", ids)`. Finding is filtered on the parent
 * `verifications.finding` column (safe `.eq`).
 *
 * Sort: `applicationNo` is 1-hop `loan_applications`. `borrower` is a
 * 2-hop embed (`loan_applications.borrowers`) — PostgREST cannot reliably
 * order the parent by that path, so the server falls back to
 * `forwarded_at` (Phase 3 may client-sort the current page).
 */
export async function getCigForwardedHistory(
  supabase: SupabaseClient,
  params: CigForwardedQueryParams,
): Promise<{ rows: CigForwardedHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    finding = "all",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "forwardedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCigHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let applicationIds: string[] | null = null;
  if (term) {
    applicationIds = await findApplicationIdsForIdentitySearch(supabase, term);
    if (applicationIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("verifications")
    .select(
      `
      id,
      finding,
      forwarded_at,
      completed_at,
      loan_application_id,
      ${APPLICATION_BORROWER_EMBED}
    `,
      { count: "exact" },
    )
    .not("forwarded_at", "is", null);

  if (finding === "positive" || finding === "negative") {
    query = query.eq("finding", finding);
  }

  if (segmentFilter !== "all") {
    query = query.eq("loan_applications.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("forwarded_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("forwarded_at", toInclusiveEnd(to));
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
    query = query.order("forwarded_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const application = firstEmbed(
      row.loan_applications as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null,
    );
    if (!application) return [];

    return [
      {
        id: application.id as string,
        verificationId: row.id as string,
        applicationNo: (application.application_no as string | null) ?? null,
        status: application.status as string,
        segment: mapSegment(application.segment),
        finding: (row.finding as CigForwardedHistoryRow["finding"]) ?? null,
        forwardedAt: (row.forwarded_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        borrower: mapBorrower(application.borrowers),
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Forwarded KPI — date-scoped only (ignores search/finding).
 */
export async function getCigForwardedKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CigHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("verifications")
    .select("id", { count: "exact", head: true })
    .not("forwarded_at", "is", null);

  if (from) {
    query = query.gte("forwarded_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("forwarded_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

/**
 * Returned-to-CSA history — `cig_return_to_csa_events` view. Borrower
 * identity is already on the view (Phase 1 LEFT JOIN); query it directly,
 * no N+1.
 *
 * Search: same-table `.or()` on application_no / borrower_no / first_name
 * / last_name / email / note. Sort including `borrower` is same-table
 * `last_name` (reliable).
 */
export async function getCigReturnedHistory(
  supabase: SupabaseClient,
  params: CigReturnedQueryParams,
): Promise<{ rows: CigReturnedHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "returnedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCigHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let query = supabase
    .from("cig_return_to_csa_events")
    .select(
      `
      id,
      application_id,
      application_no,
      segment,
      borrower_no,
      first_name,
      last_name,
      email,
      returned_at,
      note
    `,
      { count: "exact" },
    );

  if (from) {
    query = query.gte("returned_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("returned_at", toInclusiveEnd(to));
  }

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `application_no.ilike."${pattern}",borrower_no.ilike."${pattern}",first_name.ilike."${pattern}",last_name.ilike."${pattern}",email.ilike."${pattern}",note.ilike."${pattern}"`,
    );
  }

  if (sortKey === "applicationNo") {
    query = query.order("application_no", { ascending });
  } else if (sortKey === "borrower") {
    query = query.order("last_name", { ascending });
  } else {
    query = query.order("returned_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const returnedAt = row.returned_at as string | null;
    if (!returnedAt) return [];

    const hasBorrower =
      row.borrower_no != null ||
      row.first_name != null ||
      row.last_name != null ||
      row.email != null;

    return [
      {
        id: row.id as string,
        applicationId: row.application_id as string,
        applicationNo: (row.application_no as string | null) ?? null,
        segment: mapSegment(row.segment),
        returnedAt,
        note: (row.note as string | null) ?? null,
        borrower: hasBorrower
          ? {
              borrowerNo: (row.borrower_no as string) ?? "",
              firstName: (row.first_name as string) ?? "",
              lastName: (row.last_name as string) ?? "",
              email: (row.email as string) ?? "",
            }
          : null,
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Returned KPI — date-scoped only (ignores search).
 */
export async function getCigReturnedKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CigHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("cig_return_to_csa_events")
    .select("id", { count: "exact", head: true });

  if (from) {
    query = query.gte("returned_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("returned_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

/**
 * Completed denial-call history — `denial_notices` with `informed_at`
 * set. Display join is `loan_applications` + `borrowers`.
 *
 * Search: two-query identity lookup, then `.in("loan_application_id")`.
 * `deniedAt` is `created_at` (notice stamp at committee Deny).
 *
 * Sort: `applicationNo` is 1-hop. `borrower` 2-hop is unreliable; falls
 * back to `informed_at`.
 */
export async function getCigDenialCallsHistory(
  supabase: SupabaseClient,
  params: CigDenialCallsQueryParams,
): Promise<{ rows: CigDenialCallsHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    from = null,
    to = null,
    sortKey = "informedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCigHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let applicationIds: string[] | null = null;
  if (term) {
    applicationIds = await findApplicationIdsForIdentitySearch(supabase, term);
    if (applicationIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("denial_notices")
    .select(
      `
      id,
      loan_application_id,
      informed_at,
      informed_by,
      created_at,
      loan_applications (
        application_no,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
      { count: "exact" },
    )
    .not("informed_at", "is", null);

  if (from) {
    query = query.gte("informed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("informed_at", toInclusiveEnd(to));
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
    query = query.order("informed_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const informedAt = row.informed_at as string | null;
    if (!informedAt) return [];

    const application = firstEmbed(
      row.loan_applications as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null,
    );

    return [
      {
        id: row.id as string,
        applicationId: row.loan_application_id as string,
        applicationNo: (application?.application_no as string | null) ?? null,
        informedAt,
        informedBy: (row.informed_by as string | null) ?? null,
        deniedAt: row.created_at as string,
        borrower: mapBorrower(application?.borrowers),
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Denial-call KPI — date-scoped only (ignores search).
 */
export async function getCigDenialCallsKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CigHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("denial_notices")
    .select("id", { count: "exact", head: true })
    .not("informed_at", "is", null);

  if (from) {
    query = query.gte("informed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("informed_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

/**
 * Cancelled-application history — `application_cancellations`. Display
 * join is `loan_applications` + `borrowers`. Closest existing shape is
 * denial calls (actor + reason + timestamp).
 *
 * Search: two-query identity lookup, then `.in("loan_application_id")`.
 * Date scope and default sort use `created_at` (cancellation stamp).
 *
 * Sort: `applicationNo` is 1-hop. `borrower` 2-hop is unreliable; falls
 * back to `created_at`.
 */
export async function getCigCancellationsHistory(
  supabase: SupabaseClient,
  params: CigCancellationsQueryParams,
): Promise<{ rows: CigCancellationsHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    from = null,
    to = null,
    sortKey = "cancelledAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCigHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let applicationIds: string[] | null = null;
  if (term) {
    applicationIds = await findApplicationIdsForIdentitySearch(supabase, term);
    if (applicationIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("application_cancellations")
    .select(
      `
      id,
      loan_application_id,
      reason,
      cancelled_by,
      created_at,
      loan_applications (
        application_no,
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

  if (from) {
    query = query.gte("created_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("created_at", toInclusiveEnd(to));
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
    query = query.order("created_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const cancelledAt = row.created_at as string | null;
    if (!cancelledAt) return [];

    const application = firstEmbed(
      row.loan_applications as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null,
    );

    return [
      {
        id: row.id as string,
        applicationId: row.loan_application_id as string,
        applicationNo: (application?.application_no as string | null) ?? null,
        cancelledAt,
        cancelledBy: (row.cancelled_by as string | null) ?? null,
        reason: row.reason as string,
        borrower: mapBorrower(application?.borrowers),
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Cancellations KPI — date-scoped only (ignores search).
 */
export async function getCigCancellationsKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CigHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("application_cancellations")
    .select("id", { count: "exact", head: true });

  if (from) {
    query = query.gte("created_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("created_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

/**
 * Resolved-callback history — `callbacks` with `resolved_at` set. Not the
 * same set as `getCigScheduledCallbacks` (unresolved backlog).
 *
 * Search: two-query identity lookup, then `.in("loan_application_id")`.
 * Sort keys are all parent or 1-hop (`scheduled_at` / `resolved_at` /
 * `loan_applications.application_no`).
 */
export async function getCigCallbacksResolvedHistory(
  supabase: SupabaseClient,
  params: CigCallbacksResolvedQueryParams,
): Promise<{ rows: CigCallbacksResolvedHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    from = null,
    to = null,
    sortKey = "resolvedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampCigHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let applicationIds: string[] | null = null;
  if (term) {
    applicationIds = await findApplicationIdsForIdentitySearch(supabase, term);
    if (applicationIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("callbacks")
    .select(
      `
      id,
      loan_application_id,
      scheduled_at,
      resolved_at,
      notes,
      loan_applications (
        application_no,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
      { count: "exact" },
    )
    .not("resolved_at", "is", null);

  if (from) {
    query = query.gte("resolved_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("resolved_at", toInclusiveEnd(to));
  }

  if (applicationIds) {
    query = query.in("loan_application_id", applicationIds);
  }

  if (sortKey === "applicationNo") {
    query = query.order("application_no", {
      ascending,
      foreignTable: "loan_applications",
    });
  } else if (sortKey === "scheduledAt") {
    query = query.order("scheduled_at", { ascending });
  } else {
    query = query.order("resolved_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const resolvedAt = row.resolved_at as string | null;
    if (!resolvedAt) return [];

    const application = firstEmbed(
      row.loan_applications as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null,
    );

    return [
      {
        id: row.id as string,
        applicationId: row.loan_application_id as string,
        applicationNo: (application?.application_no as string | null) ?? null,
        scheduledAt: row.scheduled_at as string,
        resolvedAt,
        notes: (row.notes as string | null) ?? null,
        borrower: mapBorrower(application?.borrowers),
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Resolved-callback KPI — date-scoped only (ignores search).
 */
export async function getCigCallbacksResolvedKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<CigHistoryKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("callbacks")
    .select("id", { count: "exact", head: true })
    .not("resolved_at", "is", null);

  if (from) {
    query = query.gte("resolved_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("resolved_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}
