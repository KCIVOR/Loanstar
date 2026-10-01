"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DateRangeFilter,
  ViewModeToggle,
  type DateRangeValue,
  type HistoryViewMode,
} from "@/components/history";
import { resolveDateBounds } from "@/components/history/DateRangeFilter";
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
import {
  computeBriefingHistoryKpis,
  type BriefingHistoryRow,
} from "@/lib/collector/briefings";
import { formatDate, formatDateTime } from "@/lib/collector/format";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

type SegmentFilter = "all" | "seafarer" | "sme" | "individual";
type SortKey = "borrower" | "acknowledgedAt";

const DEFAULT_DATE_RANGE: DateRangeValue = { preset: "all", from: "", to: "" };

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
  { id: "individual", label: "Individual" },
];

function segmentBadge(segment: BriefingHistoryRow["segment"]) {
  if (segment === "sme") {
    return (
      <Badge variant="navy" dot>
        SME
      </Badge>
    );
  }
  if (segment === "individual") {
    return (
      <Badge variant="warning" dot>
        Individual
      </Badge>
    );
  }
  return (
    <Badge variant="teal" dot>
      Seafarer
    </Badge>
  );
}

function releaseStatusBadge(status: string | null) {
  if (!status) return "—";
  const done = status === "released" || status === "closed";
  return <Badge variant={done ? "success" : "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

export default function BriefingHistoryPage() {
  const [allRows, setAllRows] = useState<BriefingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const [sortKey, setSortKey] = useState<SortKey>("acknowledgedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/collector/briefings/history");
        if (!res.ok) throw new Error("Failed to load briefing history");
        const data = (await res.json()) as { rows: BriefingHistoryRow[] };
        if (!cancelled) setAllRows(data.rows ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any filter/sort/page-size change resets to page 1 (derived, no effect).
  const filterKey = JSON.stringify([search, segmentFilter, dateRange, pageSize, sortKey, sortDir]);
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });

  const kpi = useMemo(() => computeBriefingHistoryKpis(allRows), [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const { from, to } = resolveDateBounds(dateRange, new Date());
    const matched = allRows.filter((row) => {
      if (segmentFilter !== "all" && (row.segment ?? "seafarer") !== segmentFilter) return false;
      const day = row.acknowledgedAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return (
        row.borrowerName.toLowerCase().includes(q) ||
        (row.borrowerNo?.toLowerCase().includes(q) ?? false) ||
        (row.applicationNo?.toLowerCase().includes(q) ?? false)
      );
    });
    const mult = sortDir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) =>
      sortKey === "borrower"
        ? a.borrowerName.localeCompare(b.borrowerName) * mult
        : (Date.parse(a.acknowledgedAt) - Date.parse(b.acknowledgedAt)) * mult,
    );
  }, [allRows, search, segmentFilter, dateRange, sortKey, sortDir]);

  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "acknowledgedAt" ? "desc" : "asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount = (segmentFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  function clearFilters() {
    setSegmentFilter("all");
    setDateRange(DEFAULT_DATE_RANGE);
  }

  return (
    <div>
      <PageHeader
        title="Briefing History"
        description="Borrowers you have briefed and signed off before release."
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
              <div className="k">Total briefed</div>
              <div className="v">{kpi.total}</div>
            </div>
            <div className="card stat">
              <div className="k">This month</div>
              <div className="v">{kpi.thisMonth}</div>
            </div>
            <div className="card stat">
              <div className="k">Last 7 days</div>
              <div className="v">{kpi.last7Days}</div>
            </div>
          </>
        ) : (
          <>
            <Skeleton variant="kpi" />
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
              placeholder="Search borrower, borrower no, application no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {SEGMENT_CHIPS.find((c) => c.id === segmentFilter)?.label}
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
              <button type="button" className="clear-link" onClick={clearFilters}>
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
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">Segment</span>
            <div className="flex flex-wrap gap-1.5">
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
            <span className="filter-group-label">Briefed date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
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
          title={allRows.length === 0 ? "No briefings yet" : "No matching records"}
          description={
            allRows.length === 0
              ? "Borrowers you brief will appear here once you sign off."
              : "Try clearing a filter or search term."
          }
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((row) => (
            <div key={row.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id">
                  {row.applicationNo ?? row.releaseFileId.slice(0, 8)}
                </span>
              </div>
              <div className="gcard-name">{row.borrowerName}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Borrower no</span>
                  <span className="v mono">{row.borrowerNo ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(row.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Release status</span>
                  <span className="v">{releaseStatusBadge(row.releaseStatus)}</span>
                </div>
                <div className="row">
                  <span className="k">Briefed on</span>
                  <span className="v mono">{formatDateTime(row.acknowledgedAt)}</span>
                </div>
              </div>
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
                <Th>Segment</Th>
                <Th>Application</Th>
                <Th>Checklist items</Th>
                <Th>Release status</Th>
                <Th className="sortable" onClick={() => toggleSort("acknowledgedAt")}>
                  Briefed on
                  {sortArrow("acknowledgedAt")}
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <span className="font-medium text-ink-900">{row.borrowerName}</span>
                    {row.borrowerNo ? (
                      <div className="mono text-xs text-ink-400">{row.borrowerNo}</div>
                    ) : null}
                  </Td>
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td className="mono">{row.applicationNo ?? "—"}</Td>
                  <Td className="mono">{row.checklistCount}</Td>
                  <Td>{releaseStatusBadge(row.releaseStatus)}</Td>
                  <Td className="mono">{formatDateTime(row.acknowledgedAt)}</Td>
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
            onChange={(e) =>
              setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
            }
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
