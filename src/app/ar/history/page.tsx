"use client";

import Link from "next/link";
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
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/ar/format";
import type {
  ClosedAccountRow,
  ClosedAccountsKpiCounts,
  ClosedAccountSortKey,
  ReconciledDcrKpiCounts,
  ReconciledDcrSortKey,
  ReconciledPostingRow,
} from "@/lib/ar/history";

type HistoryTab = "accounts" | "dcr";
type SegmentFilter = "all" | "seafarer" | "sme";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const EMPTY_ACCOUNTS_KPI: ClosedAccountsKpiCounts = { total: 0 };
const EMPTY_DCR_KPI: ReconciledDcrKpiCounts = { total: 0, totalAmount: 0 };

const TAB_OPTIONS: Array<{ value: HistoryTab; label: string }> = [
  { value: "accounts", label: "Closed accounts" },
  { value: "dcr", label: "Reconciled DCRRs" },
];

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

function AccountsHistoryPanel() {
  const [rows, setRows] = useState<ClosedAccountRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<ClosedAccountsKpiCounts>(EMPTY_ACCOUNTS_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<ClosedAccountSortKey>("closedAt");
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
      const res = await fetch(`/api/ar/history/accounts?${query}`);
      if (!res.ok) throw new Error("Failed to load closed accounts history");
      const data = (await res.json()) as {
        rows: ClosedAccountRow[];
        totalCount: number;
        kpi: ClosedAccountsKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_ACCOUNTS_KPI);
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

  function toggleSort(key: ClosedAccountSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "closedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: ClosedAccountSortKey) {
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
            <div className="k">Total closed</div>
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
                <Th>Account No.</Th>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th num>Outstanding</Th>
                <Th>Portfolio</Th>
                <Th>Closed On</Th>
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
                  <span className="k">Outstanding</span>
                  <span className="v mono">
                    {formatMoney(row.outstandingBalance)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Portfolio</span>
                  <span className="v">{row.portfolioName ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Closed On</span>
                  <span className="v mono">{formatDate(row.closedAt)}</span>
                </div>
              </div>
              <Link href={`/ar/masterlist/${row.id}`}>
                <Button variant="secondary" size="sm">
                  View
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
                <Th
                  className="sortable"
                  onClick={() => toggleSort("account")}
                >
                  Account No.
                  {sortArrow("account")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Segment</Th>
                <Th num>Outstanding</Th>
                <Th>Portfolio</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("closedAt")}
                >
                  Closed On
                  {sortArrow("closedAt")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td className="mono">
                    <span className="font-medium text-ink-900">
                      {row.loanAccountNo ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <div>{row.borrowerName}</div>
                    {row.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">
                        {row.borrowerNo}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td num className="mono">
                    {formatMoney(row.outstandingBalance)}
                  </Td>
                  <Td>{row.portfolioName ?? "—"}</Td>
                  <Td className="mono">{formatDate(row.closedAt)}</Td>
                  <Td>
                    <Link href={`/ar/masterlist/${row.id}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                  </Td>
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

function DcrHistoryPanel() {
  const [rows, setRows] = useState<ReconciledPostingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<ReconciledDcrKpiCounts>(EMPTY_DCR_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<ReconciledDcrSortKey>("postedAt");
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
      const res = await fetch(`/api/ar/history/dcr?${query}`);
      if (!res.ok) throw new Error("Failed to load reconciled DCRR history");
      const data = (await res.json()) as {
        rows: ReconciledPostingRow[];
        totalCount: number;
        kpi: ReconciledDcrKpiCounts;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_DCR_KPI);
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

  function toggleSort(key: ReconciledDcrSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "postedAt" || key === "amount" ? "desc" : "asc");
    }
  }

  function sortArrow(key: ReconciledDcrSortKey) {
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
          <>
            <div className="card stat">
              <div className="k">Total postings</div>
              <div className="v">{kpi.total}</div>
            </div>
            <div className="card stat">
              <div className="k">Total amount</div>
              <div className="v">{formatMoney(kpi.totalAmount)}</div>
            </div>
          </>
        ) : (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
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
              placeholder="Search borrower, account, reference…"
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
            <span className="filter-group-label">Posted date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Borrower / Account</Th>
                <Th>Segment</Th>
                <Th num>Amount</Th>
                <Th>Posted On</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={6}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
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
                  {row.depositReference ?? row.id.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{row.borrowerName}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Account</span>
                  <span className="v mono">{row.loanAccountNo ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Amount</span>
                  <span
                    className="v mono"
                    style={
                      row.amount > 0 ? { color: "var(--teal-600)" } : undefined
                    }
                  >
                    {formatMoney(row.amount)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Posted On</span>
                  <span className="v mono">{formatDate(row.postedAt)}</span>
                </div>
              </div>
              <Link href={`/ar/masterlist/${row.masterlistId}`}>
                <Button variant="secondary" size="sm">
                  View
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
                <Th>Reference</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower / Account
                  {sortArrow("borrower")}
                </Th>
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  num
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                  {sortArrow("amount")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("postedAt")}
                >
                  Posted On
                  {sortArrow("postedAt")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td className="mono">
                    <span className="font-medium text-ink-900">
                      {row.depositReference ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <div>{row.borrowerName}</div>
                    <div className="mono text-xs text-ink-400">
                      {row.loanAccountNo ?? row.borrowerNo ?? "—"}
                    </div>
                  </Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td num className="mono">
                    <span
                      style={
                        row.amount > 0
                          ? { color: "var(--teal-600)" }
                          : undefined
                      }
                    >
                      {formatMoney(row.amount)}
                    </span>
                  </Td>
                  <Td className="mono">{formatDate(row.postedAt)}</Td>
                  <Td>
                    <Link href={`/ar/masterlist/${row.masterlistId}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                  </Td>
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

export default function ArHistoryPage() {
  const [tab, setTab] = useState<HistoryTab>("accounts");

  return (
    <div>
      <PageHeader
        title="AR Posting History"
        description="Closed accounts and reconciled DCRRs."
      />

      <div className="mb-4">
        <SegmentedControl
          value={tab}
          options={TAB_OPTIONS}
          onChange={setTab}
        />
      </div>

      {/* Keep both panels mounted so each tab retains its own filters/sort/page. */}
      <div hidden={tab !== "accounts"}>
        <AccountsHistoryPanel />
      </div>
      <div hidden={tab !== "dcr"}>
        <DcrHistoryPanel />
      </div>
    </div>
  );
}
