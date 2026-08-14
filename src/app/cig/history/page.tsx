"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import { formatDate, formatDateTime } from "@/lib/cig/format";
import {
  CIG_HISTORY_PAGE_SIZES,
  type CigCallbacksResolvedHistoryRow,
  type CigCallbacksResolvedSortKey,
  type CigCancellationsHistoryRow,
  type CigCancellationsSortKey,
  type CigDenialCallsHistoryRow,
  type CigDenialCallsSortKey,
  type CigForwardedHistoryRow,
  type CigForwardedSortKey,
  type CigHistoryBorrower,
  type CigHistoryKpiCounts,
  type CigRecentFindingFilter,
  type CigReturnedHistoryRow,
  type CigReturnedSortKey,
} from "@/lib/cig/history";

type HistoryTab =
  | "forwarded"
  | "returned"
  | "denialCalls"
  | "callbacks"
  | "cancellations";
type CallbacksUiSortKey = CigCallbacksResolvedSortKey | "borrower";

const EMPTY_KPI: CigHistoryKpiCounts = { total: 0 };

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const TAB_CHIPS: Array<{ id: HistoryTab; label: string }> = [
  { id: "forwarded", label: "Forwarded to Committee" },
  { id: "returned", label: "Returned to CSA" },
  { id: "denialCalls", label: "Denial Calls" },
  { id: "callbacks", label: "Callbacks Resolved" },
  { id: "cancellations", label: "Cancelled" },
];

const FINDING_CHIPS: Array<{ id: CigRecentFindingFilter; label: string }> = [
  { id: "all", label: "All findings" },
  { id: "positive", label: "Positive" },
  { id: "negative", label: "Negative" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

function segmentBadge(segment: "sme" | "seafarer" | null) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function borrowerName(borrower: CigHistoryBorrower | null): string {
  if (!borrower) return "Unknown borrower";
  const name = `${borrower.firstName} ${borrower.lastName}`.trim();
  return name || "Unknown borrower";
}

function borrowerSortValue(borrower: CigHistoryBorrower | null): string {
  if (!borrower) return "";
  return `${borrower.lastName} ${borrower.firstName}`.toLowerCase();
}

function sortBorrowerPage<T extends { borrower: CigHistoryBorrower | null }>(
  rows: T[],
  sortDir: "asc" | "desc",
): T[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = borrowerSortValue(a.borrower).localeCompare(
      borrowerSortValue(b.borrower),
    );
    return dir * cmp;
  });
}

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function findingLabel(finding: CigRecentFindingFilter): string {
  if (finding === "positive") return "Positive";
  if (finding === "negative") return "Negative";
  return "All findings";
}

function buildHistoryQuery(params: {
  search: string;
  dateRange: DateRangeValue;
  sortKey: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
  finding?: CigRecentFindingFilter;
  segment?: "all" | "seafarer" | "sme";
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  qs.set("sortKey", params.sortKey);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.finding) qs.set("finding", params.finding);
  if (params.segment) qs.set("segment", params.segment);
  return qs.toString();
}

function ViewApplicationButton({ applicationId }: { applicationId: string }) {
  return (
    <Link href={`/cig/applications/${applicationId}`}>
      <Button variant="secondary" size="sm">
        View
      </Button>
    </Link>
  );
}

function SearchIcon() {
  return (
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
  );
}

function FiltersButton({
  open,
  activeCount,
  onClick,
}: {
  open: boolean;
  activeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("btn btn-outline", open && "is-on")}
      onClick={onClick}
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
      {activeCount > 0 ? (
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
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

function HistoryToolbar({
  search,
  onSearchChange,
  placeholder,
  pills,
  activeFilterCount,
  onClearAll,
  viewMode,
  onViewModeChange,
  filterPanelOpen,
  onToggleFilters,
  filterPanel,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  pills: ReactNode;
  activeFilterCount: number;
  onClearAll: () => void;
  viewMode: HistoryViewMode;
  onViewModeChange: (mode: HistoryViewMode) => void;
  filterPanelOpen: boolean;
  onToggleFilters: () => void;
  filterPanel: ReactNode;
}) {
  return (
    <div className="card mb-4" style={{ overflow: "visible" }}>
      <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
        <div className="gsearch" style={{ maxWidth: 300, flex: 1, minWidth: 190 }}>
          <SearchIcon />
          <input
            className="input"
            style={{ height: 37, paddingRight: 12, borderRadius: "var(--r-md)" }}
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="active-pill-row">
          {pills}
          {activeFilterCount > 0 ? (
            <button type="button" className="clear-link" onClick={onClearAll}>
              Clear all
            </button>
          ) : null}
        </div>

        <div className="sp">
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
          <FiltersButton
            open={filterPanelOpen}
            activeCount={activeFilterCount}
            onClick={onToggleFilters}
          />
        </div>
      </div>

      <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
        {filterPanel}
      </div>
    </div>
  );
}

function HistoryPager({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  summaryStart,
  summaryEnd,
  totalCount,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: (typeof CIG_HISTORY_PAGE_SIZES)[number]) => void;
  summaryStart: number;
  summaryEnd: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
        <span>Show</span>
        <Select
          value={String(pageSize)}
          onChange={(e) => {
            onPageSizeChange(
              Number(e.target.value) as (typeof CIG_HISTORY_PAGE_SIZES)[number],
            );
          }}
          style={{ width: 72, height: 34 }}
        >
          {CIG_HISTORY_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
        <span>per page</span>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        onPageChange={onPageChange}
        summary={`Showing ${summaryStart}–${summaryEnd} of ${totalCount}`}
      />
    </div>
  );
}

function TableSkeleton({ columns, colSpan }: { columns: string[]; colSpan: number }) {
  return (
    <div className="mb-4">
      <Table>
        <thead>
          <tr>
            {columns.map((label) => (
              <Th key={label} className={label === "" ? "w-1" : undefined}>
                {label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, i) => (
            <tr key={i}>
              <Td colSpan={colSpan}>
                <Skeleton variant="line" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function DatePill({
  dateRange,
  onClear,
}: {
  dateRange: DateRangeValue;
  onClear: () => void;
}) {
  if (dateRange.preset === "30d") return null;
  return (
    <span className="active-pill">
      {dateRangePillLabel(dateRange)}
      <button type="button" aria-label="Clear date filter" onClick={onClear}>
        ×
      </button>
    </span>
  );
}

function FindingBadge({
  finding,
}: {
  finding: CigForwardedHistoryRow["finding"];
}) {
  if (!finding) return <span className="text-ink-300">—</span>;
  return (
    <Badge variant={finding === "positive" ? "success" : "danger"} dot>
      {finding === "positive" ? "Positive" : "Negative"}
    </Badge>
  );
}

function ForwardedHistoryPanel() {
  const [rows, setRows] = useState<CigForwardedHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigHistoryKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [finding, setFinding] = useState<CigRecentFindingFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme"
  >("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof CIG_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<CigForwardedSortKey>("forwardedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    finding,
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
      const query = buildHistoryQuery({
        search: debouncedSearch,
        dateRange,
        sortKey: sortKey === "borrower" ? "forwardedAt" : sortKey,
        sortDir,
        page,
        pageSize,
        finding,
        segment: segmentFilter,
      });
      const res = await fetch(`/api/cig/history/forwarded?${query}`);
      if (!res.ok) throw new Error("Failed to load forwarded history");
      const data = (await res.json()) as {
        rows: CigForwardedHistoryRow[];
        totalCount: number;
        kpi: CigHistoryKpiCounts;
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
    finding,
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

  const displayRows = useMemo(
    () => (sortKey === "borrower" ? sortBorrowerPage(rows, sortDir) : rows),
    [rows, sortKey, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CigForwardedSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "forwardedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CigForwardedSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount =
    (finding !== "all" ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);
  const summaryStart = displayRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total forwarded</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search borrower, application no…"
        pills={
          <>
            {finding !== "all" ? (
              <span className="active-pill">
                {findingLabel(finding)}
                <button
                  type="button"
                  aria-label="Clear finding filter"
                  onClick={() => setFinding("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                {segmentFilter === "sme" ? "SME" : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            <DatePill
              dateRange={dateRange}
              onClear={() => setDateRange(DEFAULT_DATE_RANGE)}
            />
          </>
        }
        activeFilterCount={activeFilterCount}
        onClearAll={() => {
          setFinding("all");
          setSegmentFilter("all");
          setDateRange(DEFAULT_DATE_RANGE);
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterPanelOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((open) => !open)}
        filterPanel={
          <>
            <div className="filter-group">
              <span className="filter-group-label">Finding</span>
              <div className="flex flex-wrap gap-1.5">
                {FINDING_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={cn("fchip", finding === chip.id && "is-on")}
                    onClick={() => setFinding(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">Segment</span>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={cn(
                      "fchip",
                      segmentFilter === chip.id && "is-on",
                    )}
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
          </>
        }
      />

      {loading ? (
        <TableSkeleton
          columns={[
            "Borrower",
            "App no",
            "Segment",
            "Finding",
            "Forwarded date",
            "Status",
            "",
          ]}
          colSpan={7}
        />
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No files forwarded to Committee in this date range."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((row) => (
            <div key={row.verificationId} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.applicationNo ?? row.id.slice(0, 8)}
                </span>
                <FindingBadge finding={row.finding} />
              </div>
              <div className="gcard-name">{borrowerName(row.borrower)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Forwarded</span>
                  <span className="v mono">
                    {row.forwardedAt ? formatDate(row.forwardedAt) : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Status</span>
                  <span className="v">
                    <Badge variant={statusBadgeVariant(row.status)} dot>
                      {formatStatusLabel(row.status)}
                    </Badge>
                  </span>
                </div>
              </div>
              <ViewApplicationButton applicationId={row.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("applicationNo")}
                >
                  App no
                  {sortArrow("applicationNo")}
                </Th>
                <Th>Segment</Th>
                <Th>Finding</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("forwardedAt")}
                >
                  Forwarded date
                  {sortArrow("forwardedAt")}
                </Th>
                <Th>Status</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.verificationId}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(row.borrower)}
                    </div>
                    {row.borrower?.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrower.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td>
                    <FindingBadge finding={row.finding} />
                  </Td>
                  <Td className="mono">
                    {row.forwardedAt ? formatDate(row.forwardedAt) : "—"}
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(row.status)} dot>
                      {formatStatusLabel(row.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <ViewApplicationButton applicationId={row.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        summaryStart={summaryStart}
        summaryEnd={summaryEnd}
        totalCount={totalCount}
      />
    </div>
  );
}

function ReturnedHistoryPanel() {
  const [rows, setRows] = useState<CigReturnedHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigHistoryKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme"
  >("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof CIG_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<CigReturnedSortKey>("returnedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, segmentFilter, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
        segment: segmentFilter,
      });
      const res = await fetch(`/api/cig/history/returned?${query}`);
      if (!res.ok) throw new Error("Failed to load returned-to-CSA history");
      const data = (await res.json()) as {
        rows: CigReturnedHistoryRow[];
        totalCount: number;
        kpi: CigHistoryKpiCounts;
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

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CigReturnedSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "returnedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CigReturnedSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount =
    (segmentFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);
  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total returned</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search borrower, application no, note…"
        pills={
          <>
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                {segmentFilter === "sme" ? "SME" : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            <DatePill
              dateRange={dateRange}
              onClear={() => setDateRange(DEFAULT_DATE_RANGE)}
            />
          </>
        }
        activeFilterCount={activeFilterCount}
        onClearAll={() => {
          setSegmentFilter("all");
          setDateRange(DEFAULT_DATE_RANGE);
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterPanelOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((open) => !open)}
        filterPanel={
          <>
            <div className="filter-group">
              <span className="filter-group-label">Segment</span>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={cn(
                      "fchip",
                      segmentFilter === chip.id && "is-on",
                    )}
                    onClick={() => setSegmentFilter(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">Returned date</span>
              <DateRangeFilter value={dateRange} onChange={setDateRange} />
            </div>
          </>
        }
      />

      {loading ? (
        <TableSkeleton
          columns={["Borrower", "App no", "Segment", "Returned date", "Note", ""]}
          colSpan={6}
        />
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No returns to CSA in this date range."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.applicationNo ?? row.applicationId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{borrowerName(row.borrower)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Returned</span>
                  <span className="v mono">{formatDate(row.returnedAt)}</span>
                </div>
                <div className="row">
                  <span className="k">Note</span>
                  <span className="v">{row.note ?? "—"}</span>
                </div>
              </div>
              <ViewApplicationButton applicationId={row.applicationId} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("applicationNo")}
                >
                  App no
                  {sortArrow("applicationNo")}
                </Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("returnedAt")}
                >
                  Returned date
                  {sortArrow("returnedAt")}
                </Th>
                <Th>Note</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(row.borrower)}
                    </div>
                    {row.borrower?.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrower.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td className="mono">{formatDate(row.returnedAt)}</Td>
                  <Td>
                    <span className="line-clamp-2">{row.note ?? "—"}</span>
                  </Td>
                  <Td>
                    <ViewApplicationButton applicationId={row.applicationId} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        summaryStart={summaryStart}
        summaryEnd={summaryEnd}
        totalCount={totalCount}
      />
    </div>
  );
}

function DenialCallsHistoryPanel() {
  const [rows, setRows] = useState<CigDenialCallsHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigHistoryKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof CIG_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<CigDenialCallsSortKey>("informedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        dateRange,
        sortKey: sortKey === "borrower" ? "informedAt" : sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/cig/history/denial-calls?${query}`);
      if (!res.ok) throw new Error("Failed to load denial-call history");
      const data = (await res.json()) as {
        rows: CigDenialCallsHistoryRow[];
        totalCount: number;
        kpi: CigHistoryKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () => (sortKey === "borrower" ? sortBorrowerPage(rows, sortDir) : rows),
    [rows, sortKey, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CigDenialCallsSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "informedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CigDenialCallsSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount = dateIsDefault ? 0 : 1;
  const summaryStart = displayRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total denial calls</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search borrower, application no…"
        pills={
          <DatePill
            dateRange={dateRange}
            onClear={() => setDateRange(DEFAULT_DATE_RANGE)}
          />
        }
        activeFilterCount={activeFilterCount}
        onClearAll={() => setDateRange(DEFAULT_DATE_RANGE)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterPanelOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((open) => !open)}
        filterPanel={
          <div className="filter-group">
            <span className="filter-group-label">Informed date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        }
      />

      {loading ? (
        <TableSkeleton
          columns={["Borrower", "App no", "Informed date", ""]}
          colSpan={4}
        />
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No completed denial calls in this date range."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.applicationNo ?? row.applicationId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{borrowerName(row.borrower)}</div>
              <div className="gcard-meta">
                {row.borrower?.email ? (
                  <div className="row">
                    <span className="k">Email</span>
                    <span className="v">{row.borrower.email}</span>
                  </div>
                ) : null}
                <div className="row">
                  <span className="k">Informed</span>
                  <span className="v mono">
                    {formatDateTime(row.informedAt)}
                  </span>
                </div>
              </div>
              <ViewApplicationButton applicationId={row.applicationId} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("applicationNo")}
                >
                  App no
                  {sortArrow("applicationNo")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("informedAt")}
                >
                  Informed date
                  {sortArrow("informedAt")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(row.borrower)}
                    </div>
                    {row.borrower?.email ? (
                      <div className="truncate text-xs text-ink-400">
                        {row.borrower.email}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td className="mono">{formatDateTime(row.informedAt)}</Td>
                  <Td>
                    <ViewApplicationButton applicationId={row.applicationId} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        summaryStart={summaryStart}
        summaryEnd={summaryEnd}
        totalCount={totalCount}
      />
    </div>
  );
}

function CancellationsHistoryPanel() {
  const [rows, setRows] = useState<CigCancellationsHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigHistoryKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof CIG_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<CigCancellationsSortKey>("cancelledAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        dateRange,
        sortKey: sortKey === "borrower" ? "cancelledAt" : sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/cig/history/cancellations?${query}`);
      if (!res.ok) throw new Error("Failed to load cancellation history");
      const data = (await res.json()) as {
        rows: CigCancellationsHistoryRow[];
        totalCount: number;
        kpi: CigHistoryKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () => (sortKey === "borrower" ? sortBorrowerPage(rows, sortDir) : rows),
    [rows, sortKey, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CigCancellationsSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "cancelledAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CigCancellationsSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount = dateIsDefault ? 0 : 1;
  const summaryStart = displayRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total cancelled</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search borrower, application no…"
        pills={
          <DatePill
            dateRange={dateRange}
            onClear={() => setDateRange(DEFAULT_DATE_RANGE)}
          />
        }
        activeFilterCount={activeFilterCount}
        onClearAll={() => setDateRange(DEFAULT_DATE_RANGE)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterPanelOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((open) => !open)}
        filterPanel={
          <div className="filter-group">
            <span className="filter-group-label">Cancelled date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        }
      />

      {loading ? (
        <TableSkeleton
          columns={[
            "Borrower",
            "App no",
            "Reason",
            "Cancelled by",
            "Cancelled date",
            "",
          ]}
          colSpan={6}
        />
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No cancelled applications in this date range."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.applicationNo ?? row.applicationId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{borrowerName(row.borrower)}</div>
              <div className="gcard-meta">
                {row.borrower?.email ? (
                  <div className="row">
                    <span className="k">Email</span>
                    <span className="v">{row.borrower.email}</span>
                  </div>
                ) : null}
                <div className="row">
                  <span className="k">Reason</span>
                  <span className="v">{row.reason}</span>
                </div>
                <div className="row">
                  <span className="k">Cancelled by</span>
                  <span className="v mono">{row.cancelledBy ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Cancelled</span>
                  <span className="v mono">
                    {formatDateTime(row.cancelledAt)}
                  </span>
                </div>
              </div>
              <ViewApplicationButton applicationId={row.applicationId} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("applicationNo")}
                >
                  App no
                  {sortArrow("applicationNo")}
                </Th>
                <Th>Reason</Th>
                <Th>Cancelled by</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("cancelledAt")}
                >
                  Cancelled date
                  {sortArrow("cancelledAt")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(row.borrower)}
                    </div>
                    {row.borrower?.email ? (
                      <div className="truncate text-xs text-ink-400">
                        {row.borrower.email}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td>
                    <span className="line-clamp-2">{row.reason}</span>
                  </Td>
                  <Td className="mono">{row.cancelledBy ?? "—"}</Td>
                  <Td className="mono">{formatDateTime(row.cancelledAt)}</Td>
                  <Td>
                    <ViewApplicationButton applicationId={row.applicationId} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        summaryStart={summaryStart}
        summaryEnd={summaryEnd}
        totalCount={totalCount}
      />
    </div>
  );
}

function CallbacksResolvedHistoryPanel() {
  const [rows, setRows] = useState<CigCallbacksResolvedHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigHistoryKpiCounts>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof CIG_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<CallbacksUiSortKey>("resolvedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        dateRange,
        sortKey: sortKey === "borrower" ? "resolvedAt" : sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/cig/history/callbacks-resolved?${query}`);
      if (!res.ok) throw new Error("Failed to load resolved-callback history");
      const data = (await res.json()) as {
        rows: CigCallbacksResolvedHistoryRow[];
        totalCount: number;
        kpi: CigHistoryKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () => (sortKey === "borrower" ? sortBorrowerPage(rows, sortDir) : rows),
    [rows, sortKey, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CallbacksUiSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "resolvedAt" || key === "scheduledAt" ? "desc" : "asc",
      );
    }
  }

  function sortArrow(key: CallbacksUiSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount = dateIsDefault ? 0 : 1;
  const summaryStart = displayRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total resolved</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search borrower, application no…"
        pills={
          <DatePill
            dateRange={dateRange}
            onClear={() => setDateRange(DEFAULT_DATE_RANGE)}
          />
        }
        activeFilterCount={activeFilterCount}
        onClearAll={() => setDateRange(DEFAULT_DATE_RANGE)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterPanelOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((open) => !open)}
        filterPanel={
          <div className="filter-group">
            <span className="filter-group-label">Resolved date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        }
      />

      {loading ? (
        <TableSkeleton
          columns={[
            "Borrower",
            "App no",
            "Scheduled",
            "Resolved",
            "Notes",
            "",
          ]}
          colSpan={6}
        />
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No resolved callbacks in this date range."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.applicationNo ?? row.applicationId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{borrowerName(row.borrower)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Scheduled</span>
                  <span className="v mono">
                    {formatDateTime(row.scheduledAt)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Resolved</span>
                  <span className="v mono">
                    {formatDateTime(row.resolvedAt)}
                  </span>
                </div>
                {row.notes ? (
                  <div className="row">
                    <span className="k">Notes</span>
                    <span className="v">{row.notes}</span>
                  </div>
                ) : null}
              </div>
              <ViewApplicationButton applicationId={row.applicationId} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("applicationNo")}
                >
                  App no
                  {sortArrow("applicationNo")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("scheduledAt")}
                >
                  Scheduled
                  {sortArrow("scheduledAt")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("resolvedAt")}
                >
                  Resolved
                  {sortArrow("resolvedAt")}
                </Th>
                <Th>Notes</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(row.borrower)}
                    </div>
                    {row.borrower?.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrower.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td className="mono">{formatDateTime(row.scheduledAt)}</Td>
                  <Td className="mono">{formatDateTime(row.resolvedAt)}</Td>
                  <Td>
                    <span className="line-clamp-2">{row.notes ?? "—"}</span>
                  </Td>
                  <Td>
                    <ViewApplicationButton applicationId={row.applicationId} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        summaryStart={summaryStart}
        summaryEnd={summaryEnd}
        totalCount={totalCount}
      />
    </div>
  );
}

export default function CigHistoryPage() {
  const [tab, setTab] = useState<HistoryTab>("forwarded");

  return (
    <div>
      <PageHeader
        title="CIG History"
        description="Files forwarded to Committee, returned to CSA, completed denial calls, and resolved callbacks."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TAB_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={cn("fchip", tab === chip.id && "is-on")}
            onClick={() => setTab(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Keep all panels mounted so each tab retains its own filters/sort/page. */}
      <div hidden={tab !== "forwarded"}>
        <ForwardedHistoryPanel />
      </div>
      <div hidden={tab !== "returned"}>
        <ReturnedHistoryPanel />
      </div>
      <div hidden={tab !== "denialCalls"}>
        <DenialCallsHistoryPanel />
      </div>
      <div hidden={tab !== "callbacks"}>
        <CallbacksResolvedHistoryPanel />
      </div>
      <div hidden={tab !== "cancellations"}>
        <CancellationsHistoryPanel />
      </div>
    </div>
  );
}
