"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DateRangeFilter,
  ViewModeToggle,
  type DateRangeValue,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Badge,
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
import { formatDate, formatMoney } from "@/lib/collector/format";
import {
  COLLECTOR_HISTORY_PAGE_SIZES,
  type CollectorClosedAccountRow,
  type CollectorClosedAccountSortKey,
  type CollectorClosedAccountsKpiCounts,
  type CollectorTurnedOverKpiCounts,
  type CollectorTurnedOverRow,
  type CollectorTurnedOverSortKey,
} from "@/lib/collector/history";

type HistoryTab = "paidOff" | "turnedOver";
type SegmentFilter = "all" | "seafarer" | "sme";

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const EMPTY_PAID_OFF_KPI: CollectorClosedAccountsKpiCounts = { total: 0 };
const EMPTY_TURNED_OVER_KPI: CollectorTurnedOverKpiCounts = { total: 0 };

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

function segmentBadge(segment: "sme" | "seafarer" | null | undefined) {
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

function buildHistoryQuery(params: {
  search: string;
  segment: SegmentFilter;
  dateRange: DateRangeValue;
  sortKey: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("segment", params.segment);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  qs.set("sortKey", params.sortKey);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

function PaidOffHistoryPanel() {
  const [rows, setRows] = useState<CollectorClosedAccountRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] =
    useState<CollectorClosedAccountsKpiCounts>(EMPTY_PAID_OFF_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof COLLECTOR_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] =
    useState<CollectorClosedAccountSortKey>("closedAt");
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
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(
        `/api/collector/history/closed-accounts?${query}`,
      );
      if (!res.ok) throw new Error("Failed to load paid-off accounts");
      const data = (await res.json()) as {
        rows: CollectorClosedAccountRow[];
        totalCount: number;
        kpi: CollectorClosedAccountsKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_PAID_OFF_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, segmentFilter, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CollectorClosedAccountSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "closedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CollectorClosedAccountSortKey) {
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
            <div className="k">Total paid off</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div className="gsearch" style={{ maxWidth: 300, flex: 1, minWidth: 190 }}>
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
              style={{ height: 37, paddingRight: 12, borderRadius: "var(--r-md)" }}
              placeholder="Search borrower, account no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {segmentFilter === "sme" ? "SME" : "Seafarer"}
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
            <span className="filter-group-label">Closed date</span>
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
                <Th>Account</Th>
                <Th>Segment</Th>
                <Th num>Balance (at closure)</Th>
                <Th>Closed date</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={5}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No paid-off accounts in this date range."
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
                  {row.loanAccountNo ?? row.id.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{row.borrowerName}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Balance (at closure)</span>
                  <span className="v mono">
                    {formatMoney(row.outstandingBalance)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Closed date</span>
                  <span className="v mono">{formatDate(row.closedAt)}</span>
                </div>
              </div>
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
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("account")}
                >
                  Account
                  {sortArrow("account")}
                </Th>
                <Th>Segment</Th>
                <Th num>Balance (at closure)</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("closedAt")}
                >
                  Closed date
                  {sortArrow("closedAt")}
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div>{row.borrowerName}</div>
                    {row.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">
                    <span className="font-medium text-ink-900">
                      {row.loanAccountNo ?? "—"}
                    </span>
                  </Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td num className="mono">
                    {formatMoney(row.outstandingBalance)}
                  </Td>
                  <Td className="mono">{formatDate(row.closedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(
                Number(e.target.value) as (typeof COLLECTOR_HISTORY_PAGE_SIZES)[number],
              );
            }}
            style={{ width: 72, height: 34 }}
          >
            {COLLECTOR_HISTORY_PAGE_SIZES.map((size) => (
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

function TurnedOverHistoryPanel() {
  const [rows, setRows] = useState<CollectorTurnedOverRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] =
    useState<CollectorTurnedOverKpiCounts>(EMPTY_TURNED_OVER_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof COLLECTOR_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] =
    useState<CollectorTurnedOverSortKey>("turnedOverAt");
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
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(
        `/api/collector/history/remedial-turnovers?${query}`,
      );
      if (!res.ok) throw new Error("Failed to load turned-over accounts");
      const data = (await res.json()) as {
        rows: CollectorTurnedOverRow[];
        totalCount: number;
        kpi: CollectorTurnedOverKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_TURNED_OVER_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, segmentFilter, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: CollectorTurnedOverSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "turnedOverAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: CollectorTurnedOverSortKey) {
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
            <div className="k">Total turned over</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
        )}
      </div>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div className="gsearch" style={{ maxWidth: 300, flex: 1, minWidth: 190 }}>
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
              style={{ height: 37, paddingRight: 12, borderRadius: "var(--r-md)" }}
              placeholder="Search borrower, account no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {segmentFilter === "sme" ? "SME" : "Seafarer"}
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
            <span className="filter-group-label">Turned-over date</span>
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
                <Th>Account</Th>
                <Th>Segment</Th>
                <Th>Turned-over date</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={5}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No matching records"
          description="No accounts turned over in this date range."
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
                  {row.loanAccountNo ?? row.id.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{row.borrowerName}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Turned-over date</span>
                  <span className="v mono">{formatDate(row.turnedOverAt)}</span>
                </div>
                <div className="row">
                  <span className="k">Reason</span>
                  <span className="v">{row.turnoverReason}</span>
                </div>
              </div>
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
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("account")}
                >
                  Account
                  {sortArrow("account")}
                </Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("turnedOverAt")}
                >
                  Turned-over date
                  {sortArrow("turnedOverAt")}
                </Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div>{row.borrowerName}</div>
                    {row.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="mono">
                    <span className="font-medium text-ink-900">
                      {row.loanAccountNo ?? "—"}
                    </span>
                  </Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td className="mono">{formatDate(row.turnedOverAt)}</Td>
                  <Td>{row.turnoverReason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(
                Number(e.target.value) as (typeof COLLECTOR_HISTORY_PAGE_SIZES)[number],
              );
            }}
            style={{ width: 72, height: 34 }}
          >
            {COLLECTOR_HISTORY_PAGE_SIZES.map((size) => (
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

export default function CollectorClosedAccountsPage() {
  const [tab, setTab] = useState<HistoryTab>("paidOff");

  return (
    <div>
      <PageHeader
        title="Closed accounts"
        description="Paid-off accounts and accounts turned over to Remedial."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={cn("fchip", tab === "paidOff" && "on")}
          onClick={() => setTab("paidOff")}
        >
          Paid Off
        </button>
        <button
          type="button"
          className={cn("fchip", tab === "turnedOver" && "on")}
          onClick={() => setTab("turnedOver")}
        >
          Turned Over to Remedial
        </button>
      </div>

      {/* Keep both panels mounted so each tab retains its own filters/sort/page. */}
      <div hidden={tab !== "paidOff"}>
        <PaidOffHistoryPanel />
      </div>
      <div hidden={tab !== "turnedOver"}>
        <TurnedOverHistoryPanel />
      </div>
    </div>
  );
}
