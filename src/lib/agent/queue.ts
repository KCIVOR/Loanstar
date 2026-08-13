import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checklistProgress,
  leadPipelineStage,
  type LeadPipelineStage,
} from "@/lib/agent/pipeline";

/**
 * Param-driven agent leads queue over `leads`.
 *
 * ## Stage filter (JS, not SQL)
 * Pipeline stage is derived from `application_id` + checklist completion via
 * `get_checklist_flags` RPC → `checklistProgress` → `leadPipelineStage`
 * (imported from `pipeline.ts` — do not reimplement). That cannot be expressed
 * as a reliable PostgREST filter, so date / search / status run in SQL where
 * they are same-table and reliable; the matching set is fetched, enriched with
 * checklist, classified, then stage-filtered / sorted / paginated in JS.
 *
 * ## Tradeoff
 * Checklist enrichment is one RPC per lead with an `application_id` (same
 * Promise.all N+1 pattern as the pre–Phase-5 GET). Acceptable while an agent's
 * lead set stays modest; large agents will pay N+1 latency. PostgREST pages are
 * walked in chunks of `QUEUE_FETCH_PAGE` so the SQL-filtered set is not silently
 * truncated at 1000 before JS stage filtering.
 *
 * ## Status default
 * `statusFilter` defaults to `"all"` — preserves today's behavior of showing
 * both open and converted leads (no silent exclusion of converted).
 */

export type AgentLeadStatusFilter = "all" | "open" | "converted";

export type AgentLeadStageFilter = "all" | LeadPipelineStage;

export type AgentLeadsSortKey =
  | "priority"
  | "borrower"
  | "created"
  | "progress";

export type AgentLeadQueueRow = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  borrowerId: string | null;
  applicationId: string | null;
  segment: "sme" | "seafarer" | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  checklistRequired: number;
  checklistComplete: number;
  checklistPercent: number | null;
  stage: LeadPipelineStage;
};

export type AgentLeadsQueueParams = {
  search?: string;
  stageFilter?: AgentLeadStageFilter | string;
  statusFilter?: AgentLeadStatusFilter | string;
  segmentFilter?: "all" | "seafarer" | "sme" | string;
  from?: string | null;
  to?: string | null;
  sortKey?: AgentLeadsSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type AgentLeadsQueueKpiCounts = {
  awaitingLink: number;
  gathering: number;
  ready: number;
};

export const AGENT_LEADS_QUEUE_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** PostgREST page size when walking the date/search/status-filtered set. */
export const QUEUE_FETCH_PAGE = 1000;

const STAGE_RANK: Record<LeadPipelineStage, number> = {
  awaiting_link: 0,
  gathering_docs: 1,
  docs_ready: 2,
};

const LEAD_SELECT = `
  id,
  borrower_name,
  business_name,
  borrower_id,
  application_id,
  status,
  created_at,
  updated_at,
  loan_applications ( segment )
`;

type FlagRow = {
  is_required: boolean;
  completion_status: string;
};

type RawLeadRow = {
  id: string;
  borrower_name: string;
  business_name: string | null;
  borrower_id: string | null;
  application_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  loan_applications?:
    | { segment: string | null }
    | { segment: string | null }[]
    | null;
};

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampAgentLeadsQueuePageSize(pageSize: number): number {
  return (AGENT_LEADS_QUEUE_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Pure status-filter → SQL eq spec (same-table `leads.status`). */
export type StatusFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; status: "open" | "converted" };

export function statusFilterSpec(filter: string): StatusFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  if (filter === "open" || filter === "converted") {
    return { mode: "eq", status: filter };
  }
  return { mode: "all" };
}

/** Pure stage-filter → JS membership spec (after `leadPipelineStage`). */
export type StageFilterSpec =
  | { mode: "all" }
  | { mode: "eq"; stage: LeadPipelineStage };

export function stageFilterSpec(filter: string): StageFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  if (
    filter === "awaiting_link" ||
    filter === "gathering_docs" ||
    filter === "docs_ready"
  ) {
    return { mode: "eq", stage: filter };
  }
  return { mode: "all" };
}

/** Stage membership after classification — wired to `leadPipelineStage`. */
export function passesStage(
  stage: LeadPipelineStage,
  spec: StageFilterSpec,
): boolean {
  if (spec.mode === "all") return true;
  return stage === spec.stage;
}

/** Segment membership — unconverted (null) never match a non-"all" filter. */
export function passesSegmentFilter(
  row: Pick<AgentLeadQueueRow, "segment">,
  segment: "all" | "seafarer" | "sme",
): boolean {
  if (segment === "all") return true;
  return row.segment === segment;
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

async function loadChecklistSummary(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ required: number; complete: number; percent: number | null }> {
  const { data: flags, error } = await supabase.rpc("get_checklist_flags", {
    p_application_id: applicationId,
  });

  if (error) {
    return { required: 0, complete: 0, percent: null };
  }

  return checklistProgress(
    ((flags ?? []) as FlagRow[]).map((flag) => ({
      isRequired: Boolean(flag.is_required),
      completionStatus: String(flag.completion_status ?? "pending"),
    })),
  );
}

function mapEnrichedLead(
  row: RawLeadRow,
  summary: { required: number; complete: number; percent: number | null },
): AgentLeadQueueRow {
  const applicationId = row.application_id;
  const stage = leadPipelineStage({
    applicationId,
    checklistPercent: summary.percent,
  });
  const appRaw = row.loan_applications;
  const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
  const segmentRaw = app?.segment;
  const segment: "sme" | "seafarer" | null =
    segmentRaw === "sme" || segmentRaw === "seafarer" ? segmentRaw : null;

  return {
    id: row.id,
    borrowerName: row.borrower_name,
    businessName: row.business_name,
    borrowerId: row.borrower_id,
    applicationId,
    segment,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checklistRequired: summary.required,
    checklistComplete: summary.complete,
    checklistPercent: summary.percent,
    stage,
  };
}

/**
 * Fetch date/search/status-filtered `leads` for one agent, walking PostgREST
 * pages so large sets are not truncated at 1000 before JS stage work.
 */
async function fetchLeadSuperset(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    term: string;
    statusSpec: StatusFilterSpec;
    from: string | null;
    to: string | null;
  },
): Promise<RawLeadRow[]> {
  const rows: RawLeadRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("agent_user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + QUEUE_FETCH_PAGE - 1);

    if (opts.statusSpec.mode === "eq") {
      query = query.eq("status", opts.statusSpec.status);
    }
    if (opts.from) {
      query = query.gte("created_at", toInclusiveStart(opts.from));
    }
    if (opts.to) {
      query = query.lte("created_at", toInclusiveEnd(opts.to));
    }
    if (opts.term) {
      const pattern = `%${opts.term}%`;
      query = query.or(
        `borrower_name.ilike."${pattern}",business_name.ilike."${pattern}"`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as RawLeadRow[];
    rows.push(...batch);

    if (batch.length < QUEUE_FETCH_PAGE) break;
    offset += QUEUE_FETCH_PAGE;
  }

  return rows;
}

async function enrichLeads(
  supabase: SupabaseClient,
  raw: RawLeadRow[],
): Promise<AgentLeadQueueRow[]> {
  // N+1: one get_checklist_flags RPC per linked application (same as pre–Phase-5 GET).
  return Promise.all(
    raw.map(async (lead) => {
      const summary = lead.application_id
        ? await loadChecklistSummary(supabase, lead.application_id)
        : { required: 0, complete: 0, percent: null as number | null };
      return mapEnrichedLead(lead, summary);
    }),
  );
}

function compareLeads(
  a: AgentLeadQueueRow,
  b: AgentLeadQueueRow,
  sortKey: AgentLeadsSortKey,
  sortDir: "asc" | "desc",
): number {
  const dir = sortDir === "asc" ? 1 : -1;

  if (sortKey === "borrower") {
    const primary = dir * a.borrowerName.localeCompare(b.borrowerName);
    if (primary !== 0) return primary;
  } else if (sortKey === "created") {
    const primary = dir * a.createdAt.localeCompare(b.createdAt);
    if (primary !== 0) return primary;
  } else if (sortKey === "progress") {
    const ap = a.checklistPercent ?? -1;
    const bp = b.checklistPercent ?? -1;
    const primary = dir * (ap - bp);
    if (primary !== 0) return primary;
  } else {
    // priority: awaiting link first, then lowest progress, then newest
    // (matches page.tsx; sortDir does not reverse stage rank)
    const ar = STAGE_RANK[a.stage];
    const br = STAGE_RANK[b.stage];
    if (ar !== br) return ar - br;
    const ap = a.checklistPercent ?? -1;
    const bp = b.checklistPercent ?? -1;
    if (ap !== bp) return ap - bp;
    const created = b.createdAt.localeCompare(a.createdAt);
    if (created !== 0) return created;
  }

  return a.id.localeCompare(b.id);
}

/**
 * Param-driven agent leads queue. Date/search/status in SQL; checklist enrich
 * + stage filter + sort + pagination in JS.
 */
export async function getAgentLeadsQueue(
  supabase: SupabaseClient,
  userId: string,
  params: AgentLeadsQueueParams,
): Promise<{ rows: AgentLeadQueueRow[]; totalCount: number }> {
  const {
    search = "",
    stageFilter = "all",
    statusFilter = "all",
    segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "priority",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampAgentLeadsQueuePageSize(pageSize);
  const term = sanitizeSearchTerm(search);
  const statusSpec = statusFilterSpec(statusFilter);
  const stageSpec = stageFilterSpec(stageFilter);
  const segmentSpec: "all" | "seafarer" | "sme" =
    segmentFilter === "seafarer" || segmentFilter === "sme"
      ? segmentFilter
      : "all";

  const raw = await fetchLeadSuperset(supabase, userId, {
    term,
    statusSpec,
    from,
    to,
  });

  const enriched = await enrichLeads(supabase, raw);
  const filtered = enriched.filter(
    (row) =>
      passesStage(row.stage, stageSpec) &&
      passesSegmentFilter(row, segmentSpec),
  );
  filtered.sort((a, b) => compareLeads(a, b, sortKey, sortDir));

  const totalCount = filtered.length;
  const offset = (safePage - 1) * safePageSize;
  const rows = filtered.slice(offset, offset + safePageSize);

  return { rows, totalCount };
}

/**
 * Three pipeline KPI buckets over **all** of the agent's leads (open +
 * converted) — not date-scoped. Keys match `src/app/agent/page.tsx`
 * (`awaitingLink` / `gathering` / `ready`).
 */
export async function getAgentLeadsQueueKpiCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<AgentLeadsQueueKpiCounts> {
  const raw = await fetchLeadSuperset(supabase, userId, {
    term: "",
    statusSpec: { mode: "all" },
    from: null,
    to: null,
  });
  const enriched = await enrichLeads(supabase, raw);

  let awaitingLink = 0;
  let gathering = 0;
  let ready = 0;

  for (const row of enriched) {
    if (row.stage === "awaiting_link") awaitingLink += 1;
    else if (row.stage === "gathering_docs") gathering += 1;
    else ready += 1;
  }

  return { awaitingLink, gathering, ready };
}
