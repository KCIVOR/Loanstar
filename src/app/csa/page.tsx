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
import { formatDate } from "@/lib/csa/format";
import {
  csaNeedsAttention,
  daysInQueue,
  formatBlockerLabel,
  type CsaWorkFilter,
} from "@/lib/csa/queue";

type QueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  blocker: string | null;
  isReloan: boolean;
  segment: "sme" | "seafarer" | null;
  createdAt: string;
  updatedAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

type QueueKpi = {
  total: number;
  needsAttention: number;
  documentsPending: number;
  inNegotiation: number;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: QueueKpi = {
  total: 0,
  needsAttention: 0,
  documentsPending: 0,
  inNegotiation: 0,
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
const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconFile = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);
const IconHandshake = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
  active,
  onClick,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "kpi flex h-full w-full flex-col text-left transition-[box-shadow,border-color]",
        active && "ring-2 ring-teal-600 ring-offset-2 ring-offset-canvas",
      )}
    >
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </button>
  );
}

type SortKey = "priority" | "filed" | "waiting" | "status";

const WORK_CHIPS: Array<{ id: CsaWorkFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "documents", label: "Documents" },
  { id: "negotiation", label: "Negotiation" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

function queueBorrowerName(app: QueueItem): string {
  return app.borrower
    ? `${app.borrower.firstName} ${app.borrower.lastName}`
    : "Unknown borrower";
}

function segmentBadge(segment: "sme" | "seafarer" | null) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
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

function workFilterLabel(filter: CsaWorkFilter): string {
  return WORK_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function buildQueueQuery(params: {
  search: string;
  workFilter: CsaWorkFilter;
  segment: "all" | "seafarer" | "sme";
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("work", params.workFilter);
  qs.set("segment", params.segment);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `priority` is client-only (current page); omit sortKey so server uses filed default.
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

export default function CsaDashboardPage() {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<QueueKpi>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [workFilter, setWorkFilter] = useState<CsaWorkFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme"
  >("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    workFilter,
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
        workFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const appsRes = await fetch(`/api/csa/applications?${query}`);
      if (!appsRes.ok) throw new Error("Failed to load queue");
      const data = (await appsRes.json()) as {
        rows: QueueItem[];
        totalCount: number;
        kpi: QueueKpi;
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
    workFilter,
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

  function setFilter(next: CsaWorkFilter) {
    setWorkFilter(next);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "filed" || key === "waiting" ? "desc" : "asc");
    }
  }

  const displayRows = useMemo(() => {
    if (sortKey !== "priority") return rows;
    return [...rows].sort((a, b) => {
      const aFlag = csaNeedsAttention({
        status: a.status,
        blocker: a.blocker,
      })
        ? 0
        : 1;
      const bFlag = csaNeedsAttention({
        status: b.status,
        blocker: b.blocker,
      })
        ? 0
        : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return (
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
      );
    });
  }, [rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (workFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      <PageHeader
        title="CSA intake queue"
        description="Applications pending intake, computation, and endorsement to CIG."
        actions={
          <Link href="/csa/applications/new">
            <Button>New application</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!loading && kpi.needsAttention > 0 ? (
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
            <span className="mono font-semibold">{kpi.needsAttention}</span> file
            {kpi.needsAttention === 1 ? "" : "s"} need attention (hold, revision, or
            blocker)
          </span>
          <span className="sp">
            <button
              type="button"
              className="text-[13px] font-semibold underline-offset-2 hover:underline"
              onClick={() => setFilter("attention")}
            >
              Show attention queue
            </button>
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
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
              label="In queue"
              value={kpi.total}
              active={workFilter === "all"}
              onClick={() => setFilter("all")}
            />
            <Kpi
              tone="danger"
              icon={IconAlert}
              label="Needs attention"
              value={kpi.needsAttention}
              active={workFilter === "attention"}
              onClick={() => setFilter("attention")}
            />
            <Kpi
              tone="warning"
              icon={IconFile}
              label="Documents"
              value={kpi.documentsPending}
              active={workFilter === "documents"}
              onClick={() => setFilter("documents")}
            />
            <Kpi
              tone="teal"
              icon={IconHandshake}
              label="In negotiation"
              value={kpi.inNegotiation}
              active={workFilter === "negotiation"}
              onClick={() => setFilter("negotiation")}
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
              placeholder="Search name, email, or app no."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {workFilter !== "all" ? (
              <span className="active-pill">
                {workFilterLabel(workFilter)}
                <button
                  type="button"
                  aria-label="Clear work filter"
                  onClick={() => setFilter("all")}
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
                  setFilter("all");
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
            <span className="filter-group-label">Work filter</span>
            <div className="filter-bar">
              {WORK_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", workFilter === chip.id && "is-on")}
                  onClick={() => setFilter(chip.id)}
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
            <span className="filter-group-label">Filed date</span>
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
                <Th>Type</Th>
                <Th>Segment</Th>
                <Th>Status</Th>
                <Th>Blocker</Th>
                <Th>Filed</Th>
                <Th>Waiting</Th>
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
      ) : kpi.total === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No applications in the intake queue."
          action={
            <Link href="/csa/applications/new">
              <Button>New application</Button>
            </Link>
          }
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching applications"
          description="Try a different search term or work filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((app) => {
            const blocker = formatBlockerLabel(app.blocker);
            const waiting = daysInQueue(app.updatedAt ?? app.createdAt);
            return (
              <div key={app.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">
                    {app.applicationNo ??
                      app.borrower?.borrowerNo ??
                      app.id.slice(0, 8)}
                  </span>
                  <Badge variant={statusBadgeVariant(app.status)} dot>
                    {formatStatusLabel(app.status)}
                  </Badge>
                </div>
                <div className="gcard-name">{queueBorrowerName(app)}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Type</span>
                    <span className="v">
                      {app.isReloan ? "Reloan" : "New loan"}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Blocker</span>
                    <span className="v">{blocker ?? "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Filed</span>
                    <span className="v mono">{formatDate(app.createdAt)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Waiting</span>
                    <span className="v mono">
                      {waiting === 0 ? "Today" : `${waiting}d`}
                    </span>
                  </div>
                </div>
                <Link href={`/csa/applications/${app.id}`}>
                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                </Link>
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
                <Th>Borrower</Th>
                <Th>Type</Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  {sortArrow("status")}
                </Th>
                <Th>Blocker</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("filed")}
                >
                  Filed
                  {sortArrow("filed")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("waiting")}
                >
                  Waiting
                  {sortArrow("waiting")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((app) => {
                const attention = csaNeedsAttention({
                  status: app.status,
                  blocker: app.blocker,
                });
                const blocker = formatBlockerLabel(app.blocker);
                const waiting = daysInQueue(app.updatedAt ?? app.createdAt);
                return (
                  <tr
                    key={app.id}
                    className={cn(
                      attention &&
                        "bg-[color-mix(in_srgb,var(--warning-bg)_55%,transparent)]",
                    )}
                  >
                    <Td>
                      <div className="font-medium text-ink-900">
                        {queueBorrowerName(app)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-400">
                        <span className="id">
                          {app.applicationNo ??
                            app.borrower?.borrowerNo ??
                            app.id.slice(0, 8)}
                        </span>
                        {app.borrower?.email ? (
                          <span className="truncate">{app.borrower.email}</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>{app.isReloan ? "Reloan" : "New loan"}</Td>
                    <Td>{segmentBadge(app.segment)}</Td>
                    <Td>
                      <Badge variant={statusBadgeVariant(app.status)} dot>
                        {formatStatusLabel(app.status)}
                      </Badge>
                    </Td>
                    <Td>
                      {blocker ? (
                        <p
                          className="max-w-[14rem] truncate text-sm text-ink-700"
                          title={blocker}
                        >
                          {blocker}
                        </p>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </Td>
                    <Td className="mono">{formatDate(app.createdAt)}</Td>
                    <Td className="mono">
                      {waiting === 0 ? "Today" : `${waiting}d`}
                    </Td>
                    <Td>
                      <Link href={`/csa/applications/${app.id}`}>
                        <Button variant="secondary" size="sm">
                          Open
                        </Button>
                      </Link>
                    </Td>
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
    </div>
  );
}
