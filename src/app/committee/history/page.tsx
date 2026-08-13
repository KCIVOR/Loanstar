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
import { formatDate, formatMoney } from "@/lib/committee/format";
import type { CommitteeDecisionAction } from "@/lib/committee/history";
import { formatStatusLabel, statusBadgeVariant } from "@/lib/applications/status";

type HistoryRow = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  segment: "sme" | "seafarer" | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  action: CommitteeDecisionAction;
  comment: string | null;
  myVote: "approve" | "deny" | null;
  loanTypeName: string | null;
  principal: number | null;
  actedAt: string;
  currentStatus: string;
};

type HistoryKpi = {
  total: number;
  approve: number;
  deny: number;
  revisit: number;
  hold: number;
};

type ActionFilter = "all" | CommitteeDecisionAction;
type SortKey =
  | "applicationNo"
  | "borrower"
  | "amount"
  | "action"
  | "actedAt";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const ACTION_CHIPS: Array<{ id: ActionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "approve", label: "Approved" },
  { id: "deny", label: "Rejected" },
  { id: "revisit", label: "Revisit" },
  { id: "hold", label: "Hold" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "30d",
  from: "",
  to: "",
};

const EMPTY_KPI: HistoryKpi = {
  total: 0,
  approve: 0,
  deny: 0,
  revisit: 0,
  hold: 0,
};

function decisionVariant(
  action: CommitteeDecisionAction,
): "success" | "danger" | "warning" | "neutral" {
  if (action === "approve") return "success";
  if (action === "deny") return "danger";
  if (action === "revisit") return "warning";
  return "neutral";
}

function decisionLabel(action: CommitteeDecisionAction): string {
  if (action === "approve") return "Approved";
  if (action === "deny") return "Rejected";
  if (action === "revisit") return "Revisit";
  return "Hold";
}

function voteLabel(vote: "approve" | "deny" | null): string {
  if (vote === "approve") return "Approve";
  if (vote === "deny") return "Reject";
  return "—";
}

function borrowerName(row: HistoryRow): string {
  if (!row.borrower) return "Unknown borrower";
  return `${row.borrower.firstName} ${row.borrower.lastName}`;
}

function segmentBadge(segment: "sme" | "seafarer" | null) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function borrowerSortKey(row: HistoryRow): string {
  if (!row.borrower) return "";
  return `${row.borrower.lastName} ${row.borrower.firstName}`.toLowerCase();
}

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function actionFilterLabel(action: CommitteeDecisionAction): string {
  return decisionLabel(action);
}

function buildHistoryQuery(params: {
  search: string;
  action: ActionFilter;
  segment: "all" | "seafarer" | "sme";
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("action", params.action);
  qs.set("segment", params.segment);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `amount` and `borrower` are client-only (current page); server falls back to actedAt.
  qs.set(
    "sortKey",
    params.sortKey === "amount" || params.sortKey === "borrower"
      ? "actedAt"
      : params.sortKey,
  );
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

export default function CommitteeHistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<HistoryKpi>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme"
  >("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("actedAt");
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
    actionFilter,
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
        action: actionFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/committee/history?${query}`);
      if (!res.ok) throw new Error("Failed to load decision history");
      const data = (await res.json()) as {
        rows: HistoryRow[];
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
    actionFilter,
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
    if (sortKey !== "amount" && sortKey !== "borrower") return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") {
      return [...rows].sort(
        (a, b) => dir * ((a.principal ?? 0) - (b.principal ?? 0)),
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
      setSortDir(key === "actedAt" || key === "amount" ? "desc" : "asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  function setDecisionFilter(next: ActionFilter) {
    setActionFilter(next);
  }

  const dateIsDefault = dateRange.preset === "30d";
  const activeFilterCount =
    (actionFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  return (
    <div>
      <PageHeader
        title="Decision History"
        description="Applications you and the committee have already decided on."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {!loading ? (
          <>
            <button
              type="button"
              className={cn(
                "card stat is-clickable",
                actionFilter === "all" && "is-on",
              )}
              onClick={() => setDecisionFilter("all")}
            >
              <div className="k">Total records</div>
              <div className="v">{kpi.total}</div>
            </button>
            <button
              type="button"
              className={cn(
                "card stat is-clickable",
                actionFilter === "approve" && "is-on",
              )}
              onClick={() => setDecisionFilter("approve")}
            >
              <div className="k">Approved</div>
              <div className="v">{kpi.approve}</div>
            </button>
            <button
              type="button"
              className={cn(
                "card stat is-clickable",
                actionFilter === "deny" && "is-on",
              )}
              onClick={() => setDecisionFilter("deny")}
            >
              <div className="k">Rejected</div>
              <div className="v">{kpi.deny}</div>
            </button>
            <button
              type="button"
              className={cn(
                "card stat is-clickable",
                actionFilter === "revisit" && "is-on",
              )}
              onClick={() => setDecisionFilter("revisit")}
            >
              <div className="k">Revisit</div>
              <div className="v">{kpi.revisit}</div>
            </button>
            <button
              type="button"
              className={cn(
                "card stat is-clickable",
                actionFilter === "hold" && "is-on",
              )}
              onClick={() => setDecisionFilter("hold")}
            >
              <div className="k">Hold</div>
              <div className="v">{kpi.hold}</div>
            </button>
          </>
        ) : (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
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
              placeholder="Search borrower, application no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {actionFilter !== "all" ? (
              <span className="active-pill">
                {actionFilterLabel(actionFilter)}
                <button
                  type="button"
                  aria-label="Clear decision filter"
                  onClick={() => setDecisionFilter("all")}
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
                  setDecisionFilter("all");
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
            <span className="filter-group-label">Decision</span>
            <div className="filter-bar">
              {ACTION_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", actionFilter === chip.id && "is-on")}
                  onClick={() => setDecisionFilter(chip.id)}
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
            <span className="filter-group-label">Decided date</span>
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
                <Th>Segment</Th>
                <Th num>Amount</Th>
                <Th>Your Vote</Th>
                <Th>Final Decision</Th>
                <Th>Current Status</Th>
                <Th>Decided On</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={9}>
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
                <Badge variant={decisionVariant(row.action)} dot>
                  {decisionLabel(row.action)}
                </Badge>
              </div>
              <div className="gcard-name">{borrowerName(row)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Amount</span>
                  <span
                    className="v mono"
                    style={
                      (row.principal ?? 0) > 0
                        ? { color: "var(--teal-600)" }
                        : undefined
                    }
                  >
                    {row.principal != null ? formatMoney(row.principal) : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Your Vote</span>
                  <span className="v">{voteLabel(row.myVote)}</span>
                </div>
                <div className="row">
                  <span className="k">Current Status</span>
                  <span className="v">
                    <Badge variant={statusBadgeVariant(row.currentStatus)}>
                      {formatStatusLabel(row.currentStatus)}
                    </Badge>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Decided On</span>
                  <span className="v mono">{formatDate(row.actedAt)}</span>
                </div>
              </div>
              <Link href={`/committee/applications/${row.applicationId}`}>
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
                <Th>Segment</Th>
                <Th
                  className="sortable"
                  num
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                  {sortArrow("amount")}
                </Th>
                <Th>Your Vote</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("action")}
                >
                  Final Decision
                  {sortArrow("action")}
                </Th>
                <Th>Current Status</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("actedAt")}
                >
                  Decided On
                  {sortArrow("actedAt")}
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
                  <Td>{segmentBadge(row.segment)}</Td>
                  <Td num className="mono">
                    <span
                      style={
                        (row.principal ?? 0) > 0
                          ? { color: "var(--teal-600)" }
                          : undefined
                      }
                    >
                      {row.principal != null
                        ? formatMoney(row.principal)
                        : "—"}
                    </span>
                  </Td>
                  <Td>{voteLabel(row.myVote)}</Td>
                  <Td>
                    <Badge variant={decisionVariant(row.action)} dot>
                      {decisionLabel(row.action)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(row.currentStatus)}>
                      {formatStatusLabel(row.currentStatus)}
                    </Badge>
                  </Td>
                  <Td className="mono">{formatDate(row.actedAt)}</Td>
                  <Td>
                    <Link
                      href={`/committee/applications/${row.applicationId}`}
                    >
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
