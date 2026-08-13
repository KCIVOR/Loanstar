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
import { formatDate } from "@/lib/committee/format";
import type { CommitteeStatusFilter } from "@/lib/committee/queue";
import { tatTone } from "@/lib/committee/votes";

type QueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
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
  verification: {
    finding: string | null;
    forwardedAt: string | null;
    completedAt: string | null;
  } | null;
  tatDays: number | null;
};

type QueueKpi = {
  total: number;
  needsDecision: number;
  onHold: number;
  inNegotiation: number;
  tatOverdue: number;
};

type SortKey = "priority" | "tat" | "forwarded" | "status";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: QueueKpi = {
  total: 0,
  needsDecision: 0,
  onHold: 0,
  inNegotiation: 0,
  tatOverdue: 0,
};

const STATUS_CHIPS: Array<{ id: CommitteeStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "for_approval", label: "Needs decision" },
  { id: "committee_hold", label: "On hold" },
  { id: "negotiating_terms", label: "In negotiation" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

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
const IconGavel = (
  <svg {...iconProps}>
    <path d="m14 13-7.5 7.5a1 1 0 0 1-3-3L11 10" />
    <path d="m16 16 6-6" />
    <path d="m8 8 6-6" />
    <path d="m9 7 8 8" />
    <path d="m21 11-8-8" />
  </svg>
);
const IconHandshake = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
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

function statusFilterLabel(filter: CommitteeStatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function findingBadge(finding: string | null | undefined) {
  if (finding === "positive") {
    return <Badge variant="success">Positive</Badge>;
  }
  if (finding === "negative") {
    return <Badge variant="danger">Negative</Badge>;
  }
  return <Badge variant="neutral">Pending</Badge>;
}

function buildQueueQuery(params: {
  search: string;
  statusFilter: CommitteeStatusFilter;
  segment: "all" | "seafarer" | "sme";
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("status", params.statusFilter);
  qs.set("segment", params.segment);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `priority` is client-only (current page); omit sortKey so server uses updated_at default.
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

export default function CommitteeDashboardPage() {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<QueueKpi>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<CommitteeStatusFilter>("all");
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
        statusFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/committee/applications?${query}`);
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as {
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

  const displayRows = useMemo(() => {
    if (sortKey !== "priority") return rows;
    return [...rows].sort((a, b) => {
      const aFlag =
        (a.tatDays != null && a.tatDays >= 5) ||
        a.verification?.finding === "negative"
          ? 0
          : 1;
      const bFlag =
        (b.tatDays != null && b.tatDays >= 5) ||
        b.verification?.finding === "negative"
          ? 0
          : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      const aTime = a.verification?.forwardedAt
        ? new Date(a.verification.forwardedAt).getTime()
        : 0;
      const bTime = b.verification?.forwardedAt
        ? new Date(b.verification.forwardedAt).getTime()
        : 0;
      return aTime - bTime;
    });
  }, [rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "tat" || key === "forwarded" ? "desc" : "asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      <PageHeader
        title="Committee queue"
        description="Applications auto-forwarded from CIG after verification is complete."
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
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi tone="navy" icon={IconLayers} label="In queue" value={kpi.total} />
            <Kpi
              tone="teal"
              icon={IconGavel}
              label="Needs decision"
              value={kpi.needsDecision}
            />
            <Kpi
              tone="danger"
              icon={IconClock}
              label="On hold"
              value={kpi.onHold}
            />
            <Kpi
              tone="navy"
              icon={IconHandshake}
              label="In negotiation"
              value={kpi.inNegotiation}
            />
            <Kpi
              tone="danger"
              icon={IconClock}
              label="TAT overdue (5d+)"
              value={kpi.tatOverdue}
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
            {statusFilter !== "all" ? (
              <span className="active-pill">
                {statusFilterLabel(statusFilter)}
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
            <span className="filter-group-label">Forwarded date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Application</Th>
                <Th>Segment</Th>
                <Th>Status</Th>
                <Th>CIG finding</Th>
                <Th>TAT</Th>
                <Th>Forwarded</Th>
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
      ) : kpi.total === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No files pending committee decision."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching applications"
          description="Try a different search term or status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((app) => (
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
                  <span className="k">CIG finding</span>
                  <span className="v">
                    {app.verification?.finding === "positive"
                      ? "Positive"
                      : app.verification?.finding === "negative"
                        ? "Negative"
                        : "Pending"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">TAT</span>
                  <span className="v mono">
                    {app.tatDays != null ? `${app.tatDays}d` : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Forwarded</span>
                  <span className="v mono">
                    {app.verification?.forwardedAt
                      ? formatDate(app.verification.forwardedAt)
                      : "—"}
                  </span>
                </div>
              </div>
              <Link href={`/committee/applications/${app.id}`}>
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              </Link>
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
                <Th>Application</Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  {sortArrow("status")}
                </Th>
                <Th>CIG finding</Th>
                <Th className="sortable" onClick={() => toggleSort("tat")}>
                  TAT
                  {sortArrow("tat")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("forwarded")}
                >
                  Forwarded
                  {sortArrow("forwarded")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((app) => (
                <tr key={app.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {queueBorrowerName(app)}
                    </div>
                    <span className="id">
                      {app.applicationNo ??
                        app.borrower?.borrowerNo ??
                        app.id.slice(0, 8)}
                      {app.isReloan ? " · Reloan" : ""}
                    </span>
                  </Td>
                  <Td>{segmentBadge(app.segment)}</Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(app.status)} dot>
                      {formatStatusLabel(app.status)}
                    </Badge>
                  </Td>
                  <Td>{findingBadge(app.verification?.finding)}</Td>
                  <Td>
                    {app.tatDays != null ? (
                      <Badge variant={tatTone(app.tatDays)} dot>
                        <span className="mono">{app.tatDays}d</span>
                      </Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                  <Td className="mono">
                    {app.verification?.forwardedAt
                      ? formatDate(app.verification.forwardedAt)
                      : "—"}
                  </Td>
                  <Td>
                    <Link href={`/committee/applications/${app.id}`}>
                      <Button variant="secondary" size="sm">
                        Review
                      </Button>
                    </Link>
                  </Td>
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
