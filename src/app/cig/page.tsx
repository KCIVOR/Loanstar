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
import {
  cigNeedsAttention,
  cigNextActionLabel,
  daysSince,
  type CigWorkFilter,
} from "@/lib/cig/desk";
import { formatDate } from "@/lib/cig/format";
import {
  CIG_QUEUE_PAGE_SIZES,
  type CigQueueItem,
  type CigQueueKpis,
  type CigQueueSortKey,
} from "@/lib/cig/queue";

type SortKey = CigQueueSortKey;

const PAGE_SIZE_OPTIONS = CIG_QUEUE_PAGE_SIZES;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: CigQueueKpis = {
  inQueue: 0,
  revisions: 0,
  callbackOverdue: 0,
  endorsedToday: 0,
  needsAttention: 0,
};

const WORK_CHIPS: Array<{ id: CigWorkFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "revisions", label: "Revisions" },
  { id: "callback_overdue", label: "Callback overdue" },
  { id: "endorsed_today", label: "Endorsed today" },
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
const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const IconCheck = (
  <svg {...iconProps}>
    <path d="M20 6 9 17l-5-5" />
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

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function workChipLabel(filter: CigWorkFilter): string {
  return WORK_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function buildQueueQuery(params: {
  search: string;
  workFilter: CigWorkFilter;
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
  qs.set("sortKey", params.sortKey);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

function borrowerDisplayName(app: CigQueueItem): string {
  return app.borrower
    ? `${app.borrower.firstName} ${app.borrower.lastName}`
    : "Unknown borrower";
}

export default function CigDashboardPage() {
  const [rows, setRows] = useState<CigQueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CigQueueKpis>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [workFilter, setWorkFilter] = useState<CigWorkFilter>("all");
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
      const res = await fetch(`/api/cig/applications?${query}`);
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as {
        rows: CigQueueItem[];
        totalCount: number;
        kpi: CigQueueKpis;
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

  function setFilter(next: CigWorkFilter) {
    setWorkFilter(next);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "endorsed" || key === "waiting" ? "asc" : "asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (workFilter !== "all" ? 1 : 0) + (dateIsDefault ? 0 : 1);

  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  const { callbackOverdue, revisions, needsAttention } = kpi;

  function renderVerifyButton(app: CigQueueItem) {
    return (
      <Link href={`/cig/applications/${app.id}`}>
        <Button variant="secondary" size="sm">
          Verify
        </Button>
      </Link>
    );
  }

  function renderBorrowerCell(app: CigQueueItem) {
    return (
      <>
        <div className="font-medium text-ink-900">{borrowerDisplayName(app)}</div>
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
      </>
    );
  }

  function renderStatusCell(app: CigQueueItem) {
    return (
      <>
        <Badge variant={statusBadgeVariant(app.status)} dot>
          {formatStatusLabel(app.status)}
        </Badge>
        {app.isRevision ? (
          <div className="mt-1">
            <Badge variant="danger" dot>
              Committee revisit
            </Badge>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="CIG verification queue"
        description="Endorsed applications awaiting verification. Callback-held files reappear when due."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {/* Meridian verification desk strip */}
      <section className="mb-6 overflow-hidden rounded-[var(--r-lg)] border border-navy-800 bg-navy-950 text-white">
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Verification desk
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
              Clear callbacks. Re-check revisits.
            </h2>
            <p className="mt-2 max-w-md text-sm text-navy-100/80">
              Prioritize overdue callbacks and committee revisits before routine
              verification files.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r-md)] border border-navy-700 bg-navy-900/80 px-4 py-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
                Overdue callbacks
              </p>
              <p className="mono mt-1 text-2xl font-semibold text-teal-300">
                {callbackOverdue}
              </p>
            </div>
            <div className="rounded-[var(--r-md)] border border-navy-700 bg-navy-900/80 px-4 py-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
                Committee revisits
              </p>
              <p className="mono mt-1 text-2xl font-semibold text-teal-300">
                {revisions}
              </p>
            </div>
          </div>
        </div>
      </section>

      {!loading && needsAttention > 0 ? (
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
            <span className="mono font-semibold">{needsAttention}</span> file
            {needsAttention === 1 ? "" : "s"} need attention
            {callbackOverdue > 0
              ? ` · ${callbackOverdue} callback overdue`
              : ""}
            {revisions > 0 ? ` · ${revisions} committee revisit` : ""}
          </span>
          <span className="sp">
            <button
              type="button"
              className="text-[13px] font-semibold underline-offset-2 hover:underline"
              onClick={() =>
                setFilter(
                  callbackOverdue > 0 ? "callback_overdue" : "revisions",
                )
              }
            >
              Show urgent queue
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
              value={kpi.inQueue}
              active={workFilter === "all"}
              onClick={() => setFilter("all")}
            />
            <Kpi
              tone="danger"
              icon={IconAlert}
              label="Revisions"
              value={kpi.revisions}
              active={workFilter === "revisions"}
              onClick={() => setFilter("revisions")}
            />
            <Kpi
              tone="warning"
              icon={IconClock}
              label="Callback overdue"
              value={kpi.callbackOverdue}
              active={workFilter === "callback_overdue"}
              onClick={() => setFilter("callback_overdue")}
            />
            <Kpi
              tone="teal"
              icon={IconCheck}
              label="Endorsed today"
              value={kpi.endorsedToday}
              active={workFilter === "endorsed_today"}
              onClick={() => setFilter("endorsed_today")}
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

          <div className="flex flex-wrap gap-1.5">
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

          <div className="active-pill-row">
            {workFilter !== "all" ? (
              <span className="active-pill">
                Work: {workChipLabel(workFilter)}
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
            <span className="filter-group-label">Endorsed date</span>
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
                <Th>Callback</Th>
                <Th>Endorsed</Th>
                <Th>Waiting</Th>
                <Th>Next action</Th>
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
      ) : kpi.inQueue === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No applications in the active queue."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching applications"
          description="Try a different search term, work filter, or date range."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((app) => {
            const nextAction = cigNextActionLabel({
              isRevision: app.isRevision,
              callbackOverdueAt: app.callbackOverdueAt,
            });
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
                <div className="gcard-name">{borrowerDisplayName(app)}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Next action</span>
                    <span className="v">{nextAction}</span>
                  </div>
                  {app.isRevision ? (
                    <div className="row">
                      <span className="k">Flag</span>
                      <span className="v">
                        <Badge variant="danger" dot>
                          Committee revisit
                        </Badge>
                      </span>
                    </div>
                  ) : null}
                  {app.callbackOverdueAt ? (
                    <div className="row">
                      <span className="k">Callback</span>
                      <span className="v">
                        <Badge variant="warning" dot>
                          Overdue{" "}
                          <span className="mono">
                            {formatDate(app.callbackOverdueAt)}
                          </span>
                        </Badge>
                      </span>
                    </div>
                  ) : null}
                </div>
                {renderVerifyButton(app)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th className="sortable" onClick={() => toggleSort("status")}>
                  Status
                  {sortArrow("status")}
                </Th>
                <Th>Callback</Th>
                <Th className="sortable" onClick={() => toggleSort("endorsed")}>
                  Endorsed
                  {sortArrow("endorsed")}
                </Th>
                <Th className="sortable" onClick={() => toggleSort("waiting")}>
                  Waiting
                  {sortArrow("waiting")}
                </Th>
                <Th>Next action</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((app) => {
                const attention = cigNeedsAttention({
                  isRevision: app.isRevision,
                  callbackOverdueAt: app.callbackOverdueAt,
                });
                const waiting = daysSince(app.endorsedAt);
                const nextAction = cigNextActionLabel({
                  isRevision: app.isRevision,
                  callbackOverdueAt: app.callbackOverdueAt,
                });
                return (
                  <tr
                    key={app.id}
                    className={cn(
                      attention &&
                        "bg-[color-mix(in_srgb,var(--warning-bg)_55%,transparent)]",
                    )}
                  >
                    <Td>{renderBorrowerCell(app)}</Td>
                    <Td>{segmentBadge(app.segment)}</Td>
                    <Td>{renderStatusCell(app)}</Td>
                    <Td>
                      {app.callbackOverdueAt ? (
                        <Badge variant="warning" dot>
                          Overdue{" "}
                          <span className="mono">
                            {formatDate(app.callbackOverdueAt)}
                          </span>
                        </Badge>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </Td>
                    <Td className="mono">
                      {app.endorsedAt ? formatDate(app.endorsedAt) : "—"}
                    </Td>
                    <Td className="mono">
                      {waiting == null
                        ? "—"
                        : waiting === 0
                          ? "Today"
                          : `${waiting}d`}
                    </Td>
                    <Td className="text-[13px] text-ink-700">{nextAction}</Td>
                    <Td>{renderVerifyButton(app)}</Td>
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
