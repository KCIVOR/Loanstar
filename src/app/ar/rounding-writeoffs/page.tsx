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
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/ar/format";
import type {
  RoundingWriteoffKpiCounts,
  RoundingWriteoffRow,
  RoundingWriteoffSortKey,
} from "@/lib/ar/history";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const EMPTY_KPI: RoundingWriteoffKpiCounts = { total: 0, totalAmount: 0 };

type Performer = { id: string; name: string };

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

function buildHistoryQuery(params: {
  search: string;
  performedBy: string;
  dateRange: DateRangeValue;
  sortKey: RoundingWriteoffSortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.performedBy !== "all") qs.set("performedBy", params.performedBy);
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

export default function ArRoundingWriteoffsPage() {
  const [rows, setRows] = useState<RoundingWriteoffRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<RoundingWriteoffKpiCounts>(EMPTY_KPI);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [performedBy, setPerformedBy] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<RoundingWriteoffSortKey>("performedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, performedBy, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        performedBy,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/ar/history/rounding-writeoffs?${query}`);
      if (!res.ok) throw new Error("Failed to load rounding write-off history");
      const data = (await res.json()) as {
        rows: RoundingWriteoffRow[];
        totalCount: number;
        kpi: RoundingWriteoffKpiCounts;
        performers: Performer[];
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
      setPerformers(data.performers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, performedBy, dateRange, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: RoundingWriteoffSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "performedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: RoundingWriteoffSortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const performerName = (id: string) =>
    performers.find((p) => p.id === id)?.name ?? id;

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount =
    (performedBy !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);
  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  return (
    <div>
      <PageHeader
        title="Rounding write-off history"
        description="Every installment remainder written off as a rounding difference, across all accounts."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <>
            <div className="card stat">
              <div className="k">Total write-offs</div>
              <div className="v">{kpi.total}</div>
            </div>
            <div className="card stat">
              <div className="k">Total amount written off</div>
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
              placeholder="Search borrower, account no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {performedBy !== "all" ? (
              <span className="active-pill">
                AR user: {performerName(performedBy)}
                <button
                  type="button"
                  aria-label="Clear AR user filter"
                  onClick={() => setPerformedBy("all")}
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
                  setPerformedBy("all");
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
            <span className="filter-group-label">AR user</span>
            <Select
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              style={{ width: 220, height: 34 }}
            >
              <option value="all">All AR users</option>
              {performers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Date</span>
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
                <Th>Account No.</Th>
                <Th>Installment</Th>
                <Th num>Amount</Th>
                <Th>Performed by</Th>
                <Th>Date</Th>
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
          title="No rounding write-offs yet"
          description="Try clearing a filter or search term."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id mono">
                  {row.loanAccountNo ?? row.masterlistId.slice(0, 8)}
                </span>
                {segmentBadge(row.segment)}
              </div>
              <div className="gcard-name">{row.borrowerName}</div>
              <div className="gcard-meta">
                {row.installmentNo !== null ? (
                  <div className="row">
                    <span className="k">Installment</span>
                    <span className="v mono">#{row.installmentNo}</span>
                  </div>
                ) : null}
                <div className="row">
                  <span className="k">Amount</span>
                  <span className="v mono text-teal-600">
                    {formatMoney(row.amount)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Performed by</span>
                  <span className="v">{row.performedByName}</span>
                </div>
                <div className="row">
                  <span className="k">Date</span>
                  <span className="v mono">{formatDate(row.performedAt)}</span>
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
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th className="sortable" onClick={() => toggleSort("borrower")}>
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Account No.</Th>
                <Th>Installment</Th>
                <Th
                  className="sortable"
                  num
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                  {sortArrow("amount")}
                </Th>
                <Th>Performed by</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("performedAt")}
                >
                  Date
                  {sortArrow("performedAt")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {row.borrowerName}
                    </div>
                    <div className="mono text-xs text-ink-400">
                      {row.borrowerNo}
                    </div>
                  </Td>
                  <Td className="mono">{row.loanAccountNo ?? "—"}</Td>
                  <Td className="mono">
                    {row.installmentNo !== null ? `#${row.installmentNo}` : "—"}
                  </Td>
                  <Td num className="mono text-teal-600">
                    {formatMoney(row.amount)}
                  </Td>
                  <Td>{row.performedByName}</Td>
                  <Td className="mono">{formatDate(row.performedAt)}</Td>
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
