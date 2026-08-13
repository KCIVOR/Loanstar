import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCompletedLraQueueItem,
  lraQueueBucket,
  type LraQueueClassifyInput,
} from "@/lib/lra/queue-classify";

/**
 * Param-driven LRA release queue over `release_queue`.
 *
 * ## Scope split (active / completed / all)
 * Completed is an OR across embeds + blocker prefix (`isCompletedLraQueueItem`).
 * PostgREST 3-way OR across nested tables is fragile, so date / search run in
 * SQL where reliable; the full matching set is fetched, then scope + application
 * status are applied in JS (status via left-join embed `.eq` does not filter
 * parent rows). Sort + pagination run in JS on that filtered set. `totalCount`
 * is the post-scope/status filtered length.
 *
 * ## Search
 * Multi-step (same pattern as `history.ts`): borrowers → loan_applications →
 * `release_queue.loan_application_id.in.(...)`. Matches application_no and
 * borrower first/last/email/borrower_no. Does not attempt ilike on embedded
 * columns in the main query.
 *
 * ## Tradeoff
 * Acceptable while the date/search-filtered `release_queue` set stays modest
 * (typical for LRA). PostgREST pages are walked in chunks of
 * `QUEUE_FETCH_PAGE` so results are not silently truncated at 1000.
 * Status is filtered in JS with scope (not SQL embed `.eq`).
 */

export type LraQueueScope = "active" | "completed" | "all";

export type LraQueueSortKey = "priority" | "queued" | "status";

export type LraQueueItem = {
  applicationId: string;
  computationId: string;
  queuedAt: string;
  segment: "sme" | "seafarer" | null;
  application: {
    applicationNo: string | null;
    status: string;
    blocker: string | null;
    updatedAt: string;
  } | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  releaseFile: {
    status: string;
    releasePath: string | null;
  } | null;
};

export type LraQueueQueryParams = {
  search?: string;
  scope?: LraQueueScope;
  statusFilter?: string;
  segmentFilter?: "all" | "seafarer" | "sme";
  from?: string | null;
  to?: string | null;
  sortKey?: LraQueueSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type LraQueueKpiCounts = {
  /** Active in queue (not completed). */
  active: number;
  /** Setup / encoding bucket among active. */
  setup: number;
  /** Awaiting briefing among active. */
  briefing: number;
  /** Ready to release among active. */
  ready: number;
};

export const LRA_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** PostgREST page size when walking the date/search-filtered set. */
export const QUEUE_FETCH_PAGE = 1000;

const BUCKET_RANK: Record<string, number> = {
  ready: 0,
  setup: 1,
  briefing: 2,
  other: 3,
  completed: 4,
};

const QUEUE_SELECT = `
  loan_application_id,
  computation_id,
  queued_at,
  loan_applications (
    id,
    application_no,
    status,
    segment,
    blocker,
    updated_at,
    borrowers (
      borrower_no,
      first_name,
      last_name
    ),
    release_files (
      status,
      release_path
    )
  )
`;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampLraQueuePageSize(pageSize: number): number {
  return (LRA_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Pure scope → filter-spec (testable; Phase 7). */
export type ScopeFilterSpec =
  | { mode: "all" }
  | { mode: "active" }
  | { mode: "completed" };

export function scopeFilterSpec(scope: LraQueueScope): ScopeFilterSpec {
  if (scope === "active") return { mode: "active" };
  if (scope === "completed") return { mode: "completed" };
  return { mode: "all" };
}

/** Pure status-filter → query-builder spec (application.status). */
export type StatusFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; status: string };

export function statusFilterSpec(filter: string): StatusFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  return { mode: "eq", status: filter };
}

/** Pure client-style search matcher — mirrors `src/app/lra/page.tsx`. */
export function matchesLraQueueSearch(
  item: Pick<LraQueueItem, "application" | "borrower">,
  rawTerm: string,
): boolean {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;
  const name = item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(term) ||
    (item.borrower?.borrowerNo.toLowerCase().includes(term) ?? false) ||
    (item.application?.applicationNo?.toLowerCase().includes(term) ?? false)
  );
}

export function classifyQueueItem(item: LraQueueItem): LraQueueClassifyInput {
  return {
    applicationStatus: item.application?.status,
    blocker: item.application?.blocker,
    releaseFileStatus: item.releaseFile?.status,
  };
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

type NestedBorrower = {
  borrower_no: string;
  first_name: string;
  last_name: string;
};

type NestedReleaseFile = {
  status: string;
  release_path: string | null;
};

type NestedApplication = {
  application_no: string | null;
  status: string;
  segment: string | null;
  blocker: string | null;
  updated_at: string;
  borrowers: NestedBorrower | NestedBorrower[] | null;
  release_files: NestedReleaseFile | NestedReleaseFile[] | null;
};

type RawQueueRow = {
  loan_application_id: string;
  computation_id: string;
  queued_at: string;
  loan_applications: NestedApplication | NestedApplication[] | null;
};

function mapQueueRow(row: RawQueueRow): LraQueueItem {
  const appRaw = row.loan_applications;
  const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
  const borrowerRaw = app?.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  const releaseRaw = app?.release_files;
  const releaseFile = Array.isArray(releaseRaw) ? releaseRaw[0] : releaseRaw;
  const segmentRaw = app?.segment ?? null;
  const segment: "sme" | "seafarer" | null =
    segmentRaw === "sme" || segmentRaw === "seafarer" ? segmentRaw : null;

  return {
    applicationId: row.loan_application_id,
    computationId: row.computation_id,
    queuedAt: row.queued_at,
    segment,
    application: app
      ? {
          applicationNo: app.application_no,
          status: app.status,
          blocker: app.blocker,
          updatedAt: app.updated_at,
        }
      : null,
    borrower: borrower
      ? {
          borrowerNo: borrower.borrower_no,
          firstName: borrower.first_name,
          lastName: borrower.last_name,
        }
      : null,
    releaseFile: releaseFile
      ? {
          status: releaseFile.status,
          releasePath: releaseFile.release_path ?? null,
        }
      : null,
  };
}

/** Scope membership after map — must stay wired to `isCompletedLraQueueItem`. */
export function passesScope(
  item: LraQueueItem,
  scope: ScopeFilterSpec,
): boolean {
  if (scope.mode === "all") return true;
  const completed = isCompletedLraQueueItem(classifyQueueItem(item));
  if (scope.mode === "active") return !completed;
  return completed;
}

/** Mirrors page.tsx — null application never matches a concrete status. */
function passesStatusFilter(
  item: LraQueueItem,
  statusSpec: StatusFilterSpec,
): boolean {
  if (statusSpec.mode === "all") return true;
  return item.application?.status === statusSpec.status;
}

/** Null segment never matches a concrete Seafarer/SME filter. */
export function passesSegmentFilter(
  item: LraQueueItem,
  segment: "all" | "seafarer" | "sme",
): boolean {
  if (segment === "all") return true;
  return item.segment === segment;
}

function compareQueueItems(
  a: LraQueueItem,
  b: LraQueueItem,
  sortKey: LraQueueSortKey,
  sortDir: "asc" | "desc",
): number {
  const dir = sortDir === "asc" ? 1 : -1;

  if (sortKey === "queued") {
    const primary =
      dir *
      (new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());
    if (primary !== 0) return primary;
  } else if (sortKey === "status") {
    const primary =
      dir *
      (a.application?.status ?? "").localeCompare(b.application?.status ?? "");
    if (primary !== 0) return primary;
  } else {
    // priority: ready → setup → briefing → other → completed, then FIFO queued
    // (matches page.tsx; sortDir does not reverse bucket rank)
    const aRank = BUCKET_RANK[lraQueueBucket(classifyQueueItem(a))] ?? 3;
    const bRank = BUCKET_RANK[lraQueueBucket(classifyQueueItem(b))] ?? 3;
    if (aRank !== bRank) return aRank - bRank;
    const queued =
      new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    if (queued !== 0) return queued;
  }

  return a.applicationId.localeCompare(b.applicationId);
}

/**
 * Fetch date/search-filtered `release_queue` rows, walking PostgREST pages
 * so large sets are not truncated at 1000. Status/scope are applied later in JS.
 */
async function fetchQueueSuperset(
  supabase: SupabaseClient,
  opts: {
    applicationIds: string[] | null;
    from: string | null;
    to: string | null;
  },
): Promise<LraQueueItem[]> {
  const items: LraQueueItem[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("release_queue")
      .select(QUEUE_SELECT)
      .order("queued_at", { ascending: true })
      .order("loan_application_id", { ascending: true })
      .range(offset, offset + QUEUE_FETCH_PAGE - 1);

    if (opts.applicationIds) {
      query = query.in("loan_application_id", opts.applicationIds);
    }
    if (opts.from) {
      query = query.gte("queued_at", toInclusiveStart(opts.from));
    }
    if (opts.to) {
      query = query.lte("queued_at", toInclusiveEnd(opts.to));
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as RawQueueRow[];
    for (const row of batch) {
      items.push(mapQueueRow(row));
    }

    if (batch.length < QUEUE_FETCH_PAGE) break;
    offset += QUEUE_FETCH_PAGE;
  }

  return items;
}

/**
 * Param-driven LRA queue. Date/search in SQL; scope + status + sort +
 * pagination in JS after map (status must not use left-join embed `.eq`).
 */
export async function getLraQueue(
  supabase: SupabaseClient,
  params: LraQueueQueryParams,
): Promise<{ rows: LraQueueItem[]; totalCount: number }> {
  const {
    search = "",
    scope = "active",
    statusFilter = "all",
    segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "priority",
    sortDir = "asc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampLraQueuePageSize(pageSize);
  const term = sanitizeSearchTerm(search);
  const scopeSpec = scopeFilterSpec(scope);
  const statusSpec = statusFilterSpec(statusFilter);
  const segmentSpec = segmentFilter;

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

  const superset = await fetchQueueSuperset(supabase, {
    applicationIds,
    from,
    to,
  });

  const filtered = superset.filter(
    (item) =>
      passesScope(item, scopeSpec) &&
      passesStatusFilter(item, statusSpec) &&
      passesSegmentFilter(item, segmentSpec),
  );
  filtered.sort((a, b) => compareQueueItems(a, b, sortKey, sortDir));

  const totalCount = filtered.length;
  const offset = (safePage - 1) * safePageSize;
  const rows = filtered.slice(offset, offset + safePageSize);

  return { rows, totalCount };
}

/**
 * Four KPI counts over the **active** scope only — not date-scoped
 * (preserves pre–Phase-5 `/lra` page behavior).
 */
export async function getLraQueueKpiCounts(
  supabase: SupabaseClient,
): Promise<LraQueueKpiCounts> {
  const items = await fetchQueueSuperset(supabase, {
    applicationIds: null,
    from: null,
    to: null,
  });

  let active = 0;
  let setup = 0;
  let briefing = 0;
  let ready = 0;

  for (const item of items) {
    const input = classifyQueueItem(item);
    if (isCompletedLraQueueItem(input)) continue;
    active += 1;
    const bucket = lraQueueBucket(input);
    if (bucket === "setup") setup += 1;
    else if (bucket === "briefing") briefing += 1;
    else if (bucket === "ready") ready += 1;
  }

  return { active, setup, briefing, ready };
}
