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
import { formatDate, formatMoney } from "@/lib/lra/format";
import type { ReleasePath, ReleasedLoanRow } from "@/lib/lra/history";

type HistoryKpi = {
  total: number;
};

type ReleasePathFilter = "all" | ReleasePath;
type SortKey =
  | "applicationNo"
  | "borrower"
  | "netReleased"
  | "closedAt";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const PATH_CHIPS: Array<{ id: ReleasePathFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "with_pdc", label: "With PDC" },
  { id: "without_pdc", label: "Without PDC" },
];

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const EMPTY_KPI: HistoryKpi = {
  total: 0,
};

function borrowerName(row: ReleasedLoanRow): string {
  if (!row.borrower) return "Unknown borrower";
  return `${row.borrower.firstName} ${row.borrower.lastName}`;
}

function borrowerSortKey(row: ReleasedLoanRow): string {
  if (!row.borrower) return "";
  return `${row.borrower.lastName} ${row.borrower.firstName}`.toLowerCase();
}

function releasePathLabel(path: ReleasePath): string {
  if (path === "with_pdc") return "With PDC";
  return "Without PDC";
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
  releasePath: ReleasePathFilter;
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("releasePath", params.releasePath);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `borrower` and `netReleased` are client-only (current page);
  // server falls back to closedAt.
  qs.set(
    "sortKey",
    params.sortKey === "borrower" || params.sortKey === "netReleased"
      ? "closedAt"
      : params.sortKey,
  );
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

export default function LraHistoryPage() {
  const [rows, setRows] = useState<ReleasedLoanRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<HistoryKpi>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [releasePath, setReleasePath] = useState<ReleasePathFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("closedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, releasePath, dateRange, pageSize, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildHistoryQuery({
        search: debouncedSearch,
        releasePath,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/lra/history?${query}`);
      if (!res.ok) throw new Error("Failed to load released loans");
      const data = (await res.json()) as {
        rows: ReleasedLoanRow[];
        totalCount: number;
        kpi: HistoryKpi;
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
    releasePath,
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
    if (sortKey !== "borrower" && sortKey !== "netReleased") return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "netReleased") {
      return [...rows].sort(
        (a, b) => dir * ((a.netReleased ?? 0) - (b.netReleased ?? 0)),
      );
    }
    return [...rows].sort((a, b) => {
      const cmp = borrowerSortKey(a).localeCompare(borrowerSortKey(b));
      return dir * cmp;
    });
  }, [rows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "closedAt" || key === "netReleased" ? "desc" : "asc",
      );
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount =
    (releasePath !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      <PageHeader
        title="Released Loans"
        description="Loans you've already released and closed out."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <div className="card stat">
            <div className="k">Total released</div>
            <div className="v">{kpi.total}</div>
          </div>
        ) : (
          <Skeleton variant="kpi" />
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
              placeholder="Search borrower, application no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {releasePath !== "all" ? (
              <span className="active-pill">
                {releasePathLabel(releasePath)}
                <button
                  type="button"
                  aria-label="Clear release path filter"
                  onClick={() => setReleasePath("all")}
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
                  setReleasePath("all");
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
            <span className="filter-group-label">Release path</span>
            <div className="filter-bar">
              {PATH_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", releasePath === chip.id && "is-on")}
                  onClick={() => setReleasePath(chip.id)}
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
                <Th>Application No.</Th>
                <Th>Borrower</Th>
                <Th>Loan Type</Th>
                <Th num>Net Released</Th>
                <Th>PDC Collected</Th>
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
          {displayRows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id">
                  {row.applicationNo ?? row.applicationId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{borrowerName(row)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Loan Type</span>
                  <span className="v">{row.loanTypeName ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Net Released</span>
                  <span
                    className="v mono"
                    style={
                      (row.netReleased ?? 0) > 0
                        ? { color: "var(--teal-600)" }
                        : undefined
                    }
                  >
                    {row.netReleased != null
                      ? formatMoney(row.netReleased)
                      : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">PDC Collected</span>
                  <span className="v mono">
                    {row.pdcCollectedAt
                      ? formatDate(row.pdcCollectedAt)
                      : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Closed On</span>
                  <span className="v mono">{formatDate(row.closedAt)}</span>
                </div>
              </div>
              <Link href={`/lra/applications/${row.applicationId}`}>
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
                  onClick={() => toggleSort("applicationNo")}
                >
                  Application No.
                  {sortArrow("applicationNo")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Loan Type</Th>
                <Th
                  className="sortable"
                  num
                  onClick={() => toggleSort("netReleased")}
                >
                  Net Released
                  {sortArrow("netReleased")}
                </Th>
                <Th>PDC Collected</Th>
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
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <Td className="mono">
                    <span className="font-medium text-ink-900">
                      {row.applicationNo ?? "—"}
                    </span>
                  </Td>
                  <Td>{borrowerName(row)}</Td>
                  <Td>{row.loanTypeName ?? "—"}</Td>
                  <Td num className="mono">
                    <span
                      style={
                        (row.netReleased ?? 0) > 0
                          ? { color: "var(--teal-600)" }
                          : undefined
                      }
                    >
                      {row.netReleased != null
                        ? formatMoney(row.netReleased)
                        : "—"}
                    </span>
                  </Td>
                  <Td className="mono">
                    {row.pdcCollectedAt
                      ? formatDate(row.pdcCollectedAt)
                      : "—"}
                  </Td>
                  <Td className="mono">{formatDate(row.closedAt)}</Td>
                  <Td>
                    <Link href={`/lra/applications/${row.applicationId}`}>
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
