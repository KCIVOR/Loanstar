"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  cn,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import { formatDate } from "@/lib/lra/format";
import type { LraQueueItem, LraQueueKpiCounts, LraQueueScope } from "@/lib/lra/queue";
import {
  isCompletedLraQueueItem,
  lraQueueBucket,
} from "@/lib/lra/queue-classify";

type SortKey = "priority" | "queued" | "status";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: LraQueueKpiCounts = {
  active: 0,
  setup: 0,
  briefing: 0,
  ready: 0,
};

const SCOPE_CHIPS: Array<{ id: LraQueueScope; label: string }> = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

/** Application statuses commonly seen on the release queue. */
const STATUS_CHIPS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "lra_pending", label: "LRA pending" },
  { id: "release_signing", label: "Signing" },
  { id: "release_briefing", label: "Awaiting briefing" },
  { id: "release_ready", label: "Ready" },
  { id: "released", label: "Released" },
  { id: "closed", label: "Closed" },
  { id: "paid_off", label: "Paid off" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

const BUCKET_RANK: Record<string, number> = {
  ready: 0,
  setup: 1,
  briefing: 2,
  other: 3,
  completed: 4,
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconWrench = (
  <svg {...iconProps}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  </svg>
);
const IconUser = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
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
  value: number;
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

function classifyInput(item: LraQueueItem) {
  return {
    applicationStatus: item.application?.status,
    blocker: item.application?.blocker,
    releaseFileStatus: item.releaseFile?.status,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function queueBorrowerName(item: LraQueueItem): string {
  return item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`
    : "Unknown borrower";
}

function releasePathLabel(path: string | null | undefined): string {
  if (path === "with_pdc") return "With PDC";
  if (path === "without_pdc") return "Without PDC";
  return "—";
}

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function scopeLabel(scope: LraQueueScope): string {
  return SCOPE_CHIPS.find((chip) => chip.id === scope)?.label ?? scope;
}

function statusChipLabel(filter: string): string {
  return (
    STATUS_CHIPS.find((chip) => chip.id === filter)?.label ??
    formatStatusLabel(filter)
  );
}

function segmentBadge(segment: "sme" | "seafarer" | null) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function blockerBadgeVariant(item: LraQueueItem) {
  if (isCompletedLraQueueItem(classifyInput(item))) return "success" as const;
  if (lraQueueBucket(classifyInput(item)) === "ready") return "teal" as const;
  return "warning" as const;
}

function buildQueueQuery(params: {
  search: string;
  scope: LraQueueScope;
  statusFilter: string;
  segment: "all" | "seafarer" | "sme";
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("scope", params.scope);
  qs.set("status", params.statusFilter);
  qs.set("segment", params.segment);
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
    qs.set("sortDir", "asc");
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

export default function LraDashboardPage() {
  const [rows, setRows] = useState<LraQueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<LraQueueKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<LraQueueScope>("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme"
  >("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    scopeFilter,
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
        scope: scopeFilter,
        statusFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/lra/queue?${query}`);
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as {
        rows: LraQueueItem[];
        totalCount: number;
        kpi: LraQueueKpiCounts;
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
    scopeFilter,
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
      setSortDir("asc");
    }
  }

  const displayRows = useMemo(() => {
    if (sortKey !== "priority") return rows;
    // priority: ready → setup → briefing, then oldest queued (FIFO) — current page only
    return [...rows].sort((a, b) => {
      const aBucket = lraQueueBucket(classifyInput(a));
      const bBucket = lraQueueBucket(classifyInput(b));
      const aRank = BUCKET_RANK[aBucket] ?? 3;
      const bRank = BUCKET_RANK[bBucket] ?? 3;
      if (aRank !== bRank) return aRank - bRank;
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
  }, [rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "all";
  const defaultScope = scopeFilter === "active";
  const activeFilterCount =
    (defaultScope ? 0 : 1) +
    (statusFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);

  const queueIsClear =
    kpi.active === 0 &&
    scopeFilter === "active" &&
    statusFilter === "all" &&
    dateIsDefault &&
    !debouncedSearch.trim();

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  function renderOpenButton(item: LraQueueItem) {
    return (
      <Link href={`/lra/applications/${item.applicationId}`}>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </Link>
    );
  }

  function renderBlocker(item: LraQueueItem) {
    if (!item.application?.blocker) {
      return <span className="text-ink-300">—</span>;
    }
    return (
      <Badge variant={blockerBadgeVariant(item)} dot>
        {item.application.blocker}
      </Badge>
    );
  }

  return (
    <div>
      <PageHeader
        title="LRA release queue"
        description="Files with signed computation ready for documentation and release."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
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
            <Kpi
              tone="navy"
              icon={IconLayers}
              label="Active in queue"
              value={kpi.active}
            />
            <Kpi
              tone="warning"
              icon={IconWrench}
              label="Setup / encoding"
              value={kpi.setup}
            />
            <Kpi
              tone="teal"
              icon={IconUser}
              label="Awaiting briefing"
              value={kpi.briefing}
            />
            <Kpi
              tone="success"
              icon={IconCheck}
              label="Ready to release"
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
              placeholder="Search borrower or application no."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {!defaultScope ? (
              <span className="active-pill">
                Scope: {scopeLabel(scopeFilter)}
                <button
                  type="button"
                  aria-label="Clear scope filter"
                  onClick={() => setScopeFilter("active")}
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
                  setScopeFilter("active");
                  setStatusFilter("all");
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
            <span className="filter-group-label">Scope</span>
            <div className="filter-bar">
              {SCOPE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", scopeFilter === chip.id && "is-on")}
                  onClick={() => setScopeFilter(chip.id)}
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
            <span className="filter-group-label">Queued date</span>
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
                <Th>Status</Th>
                <Th>Stage / blocker</Th>
                <Th>Path</Th>
                <Th>Queued</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={7}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : queueIsClear ? (
        <EmptyState
          title="Queue is clear"
          description="No files pending LRA processing."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching files"
          description="Try a different search, scope, or status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((item) => (
            <div key={item.applicationId} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id">
                  {item.application?.applicationNo ??
                    item.borrower?.borrowerNo ??
                    item.applicationId.slice(0, 8)}
                </span>
                {item.application ? (
                  <Badge
                    variant={statusBadgeVariant(item.application.status)}
                    dot
                  >
                    {formatStatusLabel(item.application.status)}
                  </Badge>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </div>
              <div className="gcard-name">{queueBorrowerName(item)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Path</span>
                  <span className="v">
                    {releasePathLabel(item.releaseFile?.releasePath)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Status</span>
                  <span className="v">
                    {item.application
                      ? formatStatusLabel(item.application.status)
                      : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Queued</span>
                  <span className="v mono">{formatDateTime(item.queuedAt)}</span>
                </div>
                {item.application?.blocker ? (
                  <div className="row">
                    <span className="k">Blocker</span>
                    <span className="v">{item.application.blocker}</span>
                  </div>
                ) : null}
              </div>
              {renderOpenButton(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table
            className={viewMode === "compact" ? "is-compact" : undefined}
          >
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  {sortArrow("status")}
                </Th>
                <Th>Stage / blocker</Th>
                <Th>Path</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("queued")}
                >
                  Queued
                  {sortArrow("queued")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((item) => (
                <tr key={item.applicationId}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {queueBorrowerName(item)}
                    </div>
                    <span className="id">
                      {item.application?.applicationNo ??
                        item.borrower?.borrowerNo ??
                        item.applicationId.slice(0, 8)}
                    </span>
                  </Td>
                  <Td>{segmentBadge(item.segment)}</Td>
                  <Td>
                    {item.application ? (
                      <Badge
                        variant={statusBadgeVariant(item.application.status)}
                        dot
                      >
                        {formatStatusLabel(item.application.status)}
                      </Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                  <Td>{renderBlocker(item)}</Td>
                  <Td>
                    {releasePathLabel(item.releaseFile?.releasePath)}
                  </Td>
                  <Td className="mono">{formatDateTime(item.queuedAt)}</Td>
                  <Td>{renderOpenButton(item)}</Td>
                </tr>
              ))}
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
    </div>
  );
}
