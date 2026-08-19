"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { NewLeadModal } from "@/components/agent/NewLeadModal";
import {
  DateRangeFilter,
  ViewModeToggle,
  type DateRangeValue,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { formatDate } from "@/lib/agent/format";
import {
  leadPipelineStage,
  leadStatusVariant,
  pipelineStageLabel,
  pipelineStageVariant,
  type LeadPipelineStage,
} from "@/lib/agent/pipeline";
import type {
  AgentLeadQueueRow,
  AgentLeadsQueueKpiCounts,
  AgentLeadsSortKey,
  AgentLeadStageFilter,
  AgentLeadStatusFilter,
} from "@/lib/agent/queue";
import { AGENT_LEADS_QUEUE_PAGE_SIZES } from "@/lib/agent/queue";

type SortKey = AgentLeadsSortKey;
type StageFilter = AgentLeadStageFilter;
type StatusFilter = AgentLeadStatusFilter;

const PAGE_SIZE_OPTIONS = AGENT_LEADS_QUEUE_PAGE_SIZES;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: AgentLeadsQueueKpiCounts = {
  awaitingLink: 0,
  gathering: 0,
  ready: 0,
};

const STAGE_CHIPS: Array<{ id: StageFilter; label: string }> = [
  { id: "all", label: "All stages" },
  { id: "awaiting_link", label: "Awaiting link" },
  { id: "gathering_docs", label: "Gathering docs" },
  { id: "docs_ready", label: "Docs ready" },
];

const STATUS_CHIPS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "converted", label: "Converted" },
];

type SegmentFilter = "all" | "seafarer" | "sme" | "individual";

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
  { id: "individual", label: "Individual" },
];

function segmentCell(
  segment: "sme" | "seafarer" | "individual" | null | undefined,
) {
  if (segment !== "sme" && segment !== "seafarer" && segment !== "individual") {
    return <span className="text-ink-400">—</span>;
  }
  const variant =
    segment === "sme" ? "navy" : segment === "individual" ? "warning" : "teal";
  const label =
    segment === "sme" ? "SME" : segment === "individual" ? "Individual" : "Seafarer";
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

const STAGE_RANK: Record<LeadPipelineStage, number> = {
  awaiting_link: 0,
  gathering_docs: 1,
  docs_ready: 2,
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconUsers = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconLink = (
  <svg {...iconProps}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const IconDocs = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 15h6M9 11h6" />
  </svg>
);
const IconCheck = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi flex h-full flex-col">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function stageOf(lead: AgentLeadQueueRow): LeadPipelineStage {
  return leadPipelineStage({
    applicationId: lead.applicationId,
    checklistPercent: lead.checklistPercent,
  });
}

function ProgressCell({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-ink-400">—</span>;
  }
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="mono text-ink-500">{percent}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-navy-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-teal-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function stageChipLabel(filter: StageFilter): string {
  return STAGE_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function statusChipLabel(filter: StatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function buildQueueQuery(params: {
  search: string;
  stageFilter: StageFilter;
  statusFilter: StatusFilter;
  segmentFilter: SegmentFilter;
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("stage", params.stageFilter);
  qs.set("status", params.statusFilter);
  qs.set("segment", params.segmentFilter);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `priority` is client-only (current page); omit sortKey so server uses its default.
  if (params.sortKey !== "priority") {
    qs.set("sortKey", params.sortKey);
    qs.set("sortDir", params.sortDir);
  } else {
    qs.set("sortDir", "desc");
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

export default function AgentPipelinePage() {
  const [rows, setRows] = useState<AgentLeadQueueRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<AgentLeadsQueueKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    stageFilter,
    statusFilter,
    segmentFilter,
    dateRange,
    pageSize,
    sortKey,
    sortDir,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQueueQuery({
        search: debouncedSearch,
        stageFilter,
        statusFilter,
        segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/agent/leads?${query}`);
      if (!res.ok) throw new Error("Failed to load leads");
      const data = (await res.json()) as {
        rows: AgentLeadQueueRow[];
        totalCount: number;
        kpi: AgentLeadsQueueKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    stageFilter,
    statusFilter,
    segmentFilter,
    dateRange,
    sortKey,
    sortDir,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" ? "asc" : "desc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  // priority: awaiting link first, then lowest progress, then newest — current page only
  const displayRows = useMemo(() => {
    if (sortKey !== "priority") return rows;
    return [...rows].sort((a, b) => {
      const ar = STAGE_RANK[stageOf(a)];
      const br = STAGE_RANK[stageOf(b)];
      if (ar !== br) return ar - br;
      const ap = a.checklistPercent ?? -1;
      const bp = b.checklistPercent ?? -1;
      if (ap !== bp) return ap - bp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  const leadsTotal = kpi.awaitingLink + kpi.gathering + kpi.ready;
  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (stageFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);

  const pipelineIsClear =
    leadsTotal === 0 &&
    stageFilter === "all" &&
    statusFilter === "all" &&
    segmentFilter === "all" &&
    dateIsDefault &&
    !debouncedSearch.trim();

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  function renderOpenButton(lead: AgentLeadQueueRow) {
    return (
      <Link href={`/agent/leads/${lead.id}`}>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </Link>
    );
  }

  return (
    <div>
      <PageHeader
        title="Lead pipeline"
        description="Track registration links and intake checklist readiness for your borrowers."
        actions={
          <Button onClick={() => setNewLeadOpen(true)}>New lead</Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!loading && kpi.awaitingLink > 0 ? (
        <div className="banner warn mb-6">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            <span className="mono font-semibold">{kpi.awaitingLink}</span> lead
            {kpi.awaitingLink === 1 ? "" : "s"} waiting for borrower registration
            / application link
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi tone="navy" icon={IconUsers} label="Leads" value={leadsTotal} />
            <Kpi
              tone="warning"
              icon={IconLink}
              label="Awaiting link"
              value={kpi.awaitingLink}
            />
            <Kpi
              tone="teal"
              icon={IconDocs}
              label="Gathering docs"
              value={kpi.gathering}
            />
            <Kpi
              tone="success"
              icon={IconCheck}
              label="Docs ready"
              value={kpi.ready}
            />
          </>
        )}
      </div>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div
            className="gsearch"
            style={{ maxWidth: 300, flex: 1, minWidth: 190 }}
          >
            <span className="icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className="input"
              style={{
                height: 37,
                paddingRight: 12,
                borderRadius: "var(--r-md)",
              }}
              placeholder="Search borrower or business"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {stageFilter !== "all" ? (
              <span className="active-pill">
                Stage: {stageChipLabel(stageFilter)}
                <button
                  type="button"
                  aria-label="Clear stage filter"
                  onClick={() => setStageFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {statusFilter !== "all" ? (
              <span className="active-pill">
                {statusChipLabel(statusFilter)}
                <button
                  type="button"
                  aria-label="Clear status filter"
                  onClick={() => setStatusFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment:{" "}
                {segmentFilter === "sme"
                  ? "SME"
                  : segmentFilter === "individual"
                    ? "Individual"
                    : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {!dateIsDefault ? (
              <span className="active-pill">
                {dateRangePillLabel(dateRange)}
                <button
                  type="button"
                  aria-label="Clear date filter"
                  onClick={() => setDateRange(DEFAULT_DATE_RANGE)}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => {
                  setStageFilter("all");
                  setStatusFilter("all");
                  setSegmentFilter("all");
                  setDateRange(DEFAULT_DATE_RANGE);
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="sp">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <button
              type="button"
              className={cn("btn btn-outline", filterPanelOpen && "is-on")}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={16}
                height={16}
                aria-hidden
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {activeFilterCount > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--r-full)",
                    background: "var(--teal-600)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">Stage</span>
            <div className="filter-bar">
              {STAGE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", stageFilter === chip.id && "is-on")}
                  onClick={() => setStageFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Status</span>
            <div className="filter-bar">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", statusFilter === chip.id && "is-on")}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Segment</span>
            <div className="filter-bar">
              {SEGMENT_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", segmentFilter === chip.id && "is-on")}
                  onClick={() => setSegmentFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Created date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th>Business</Th>
                <Th>Pipeline</Th>
                <Th>Checklist</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={8}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : pipelineIsClear ? (
        <EmptyState
          title="No leads yet"
          description="Create a lead to start tracking a borrower through registration and documents."
          action={
            <Button onClick={() => setNewLeadOpen(true)}>New lead</Button>
          }
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching leads"
          description="Try a different search, stage, or status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((lead) => {
            const stage = stageOf(lead);
            return (
              <div key={lead.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">{lead.id.slice(0, 8)}</span>
                  <Badge variant={pipelineStageVariant(stage)}>
                    {pipelineStageLabel(stage)}
                  </Badge>
                </div>
                <div className="gcard-name">{lead.borrowerName}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Segment</span>
                    <span className="v">{segmentCell(lead.segment)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Business</span>
                    <span className="v">{lead.businessName ?? "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Checklist</span>
                    <span className="v mono">
                      {lead.checklistPercent === null
                        ? "—"
                        : `${lead.checklistPercent}%`}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Status</span>
                    <span className="v">{lead.status}</span>
                  </div>
                  <div className="row">
                    <span className="k">Created</span>
                    <span className="v mono">{formatDate(lead.createdAt)}</span>
                  </div>
                </div>
                {renderOpenButton(lead)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table
            className={viewMode === "compact" ? "is-compact" : undefined}
          >
            <thead>
              <tr>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Segment</Th>
                <Th>Business</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("priority")}
                >
                  Pipeline
                  {sortArrow("priority")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("progress")}
                >
                  Checklist
                  {sortArrow("progress")}
                </Th>
                <Th>Status</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("created")}
                >
                  Created
                  {sortArrow("created")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((lead) => {
                const stage = stageOf(lead);
                return (
                  <tr key={lead.id}>
                    <Td>
                      <Link
                        href={`/agent/leads/${lead.id}`}
                        className="font-medium text-ink-900 hover:text-teal-700"
                      >
                        {lead.borrowerName}
                      </Link>
                    </Td>
                    <Td>{segmentCell(lead.segment)}</Td>
                    <Td>{lead.businessName ?? "—"}</Td>
                    <Td>
                      <Badge variant={pipelineStageVariant(stage)}>
                        {pipelineStageLabel(stage)}
                      </Badge>
                    </Td>
                    <Td>
                      <ProgressCell percent={lead.checklistPercent} />
                    </Td>
                    <Td>
                      <Badge variant={leadStatusVariant(lead.status)}>
                        {lead.status}
                      </Badge>
                    </Td>
                    <Td className="mono text-xs text-ink-400">
                      {formatDate(lead.createdAt)}
                    </Td>
                    <Td>{renderOpenButton(lead)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(
                Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
              );
            }}
            style={{ width: 72, height: 34 }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
          <span>per page</span>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={`Showing ${summaryStart}–${summaryEnd} of ${totalCount}`}
        />
      </div>

      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
      />
    </div>
  );
}
