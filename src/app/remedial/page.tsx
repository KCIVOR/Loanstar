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
import { masterlistSecondaryIdentity } from "@/lib/ar/masterlist-display";
import {
  severityLabel,
  severityVariant,
  type RemedialSeverity,
} from "@/lib/remedial/desk";
import {
  REMEDIAL_QUEUE_PAGE_SIZES,
  type RemedialQueueKpis,
  type RemedialQueueMappedRow,
  type RemedialQueueSortKey,
  type RemedialSegmentFilter,
} from "@/lib/remedial/queue";

type SortKey = RemedialQueueSortKey;
type SeverityFilter = "all" | RemedialSeverity;

const PAGE_SIZE_OPTIONS = REMEDIAL_QUEUE_PAGE_SIZES;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: RemedialQueueKpis = {
  assigned: 0,
  critical: 0,
  avgDpd: 0,
  outstanding: 0,
};

const SEVERITY_CHIPS: Array<{ id: SeverityFilter; label: string }> = [
  { id: "all", label: "All severity" },
  { id: "critical", label: "Critical" },
  { id: "elevated", label: "Elevated" },
  { id: "watch", label: "Watch" },
];

const SEGMENT_CHIPS: Array<{ id: RemedialSegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
  { id: "individual", label: "Individual" },
];

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
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
  value: string | number;
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

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

function severityChipLabel(filter: SeverityFilter): string {
  return SEVERITY_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function segmentBadge(segment: "sme" | "seafarer" | "individual") {
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

function buildQueueQuery(params: {
  search: string;
  severity: SeverityFilter;
  segment: RemedialSegmentFilter;
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("severity", params.severity);
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

function secondaryOf(row: RemedialQueueMappedRow) {
  return masterlistSecondaryIdentity({
    manning_agency: row.manningAgency,
    vessel_name: row.vesselName,
  });
}

export default function RemedialQueuePage() {
  const [rows, setRows] = useState<RemedialQueueMappedRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<RemedialQueueKpis>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [segmentFilter, setSegmentFilter] =
    useState<RemedialSegmentFilter>("all");
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
    severityFilter,
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
        severity: severityFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/remedial/accounts?${query}`);
      if (!res.ok) throw new Error("Failed to load remedial accounts");
      const data = (await res.json()) as {
        rows: RemedialQueueMappedRow[];
        totalCount: number;
        kpi: RemedialQueueKpis;
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
    severityFilter,
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "borrower" ? "asc" : key === "priority" ? "asc" : "desc",
      );
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
    (severityFilter !== "all" ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);

  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  function renderOpenButton(acc: RemedialQueueMappedRow) {
    return (
      <Link href={`/remedial/accounts/${acc.id}`}>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </Link>
    );
  }

  function renderBorrowerCell(acc: RemedialQueueMappedRow) {
    const secondary = secondaryOf(acc);
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/remedial/accounts/${acc.id}`}
            className="font-medium text-ink-900 hover:text-teal-700"
          >
            {acc.borrowerName}
          </Link>
        </div>
        {secondary ? (
          <div className="text-xs text-ink-500">{secondary}</div>
        ) : null}
        <div className="mono text-xs text-ink-400">{acc.borrowerNo}</div>
      </>
    );
  }

  function renderNextDue(acc: RemedialQueueMappedRow) {
    if (!acc.nextDueDate) {
      return <span className="text-ink-400">—</span>;
    }
    return (
      <span className="text-sm">
        <span className="mono">{formatDate(acc.nextDueDate)}</span>
        {acc.nextDueAmount != null ? (
          <span className="text-ink-500">
            {" · "}₱{formatMoney(acc.nextDueAmount)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div>
      <PageHeader
        title="Remedial recovery"
        description="Escalated accounts at the 90-day aging threshold, turned over from collection."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!loading && kpi.critical > 0 ? (
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
            <span className="mono font-semibold">{kpi.critical}</span> critical
            recovery file{kpi.critical === 1 ? "" : "s"} need priority follow-up
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
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
              label="Assigned"
              value={kpi.assigned}
            />
            <Kpi
              tone="danger"
              icon={IconAlert}
              label="Critical"
              value={kpi.critical}
            />
            <Kpi
              tone="warning"
              icon={IconClock}
              label="Avg DPD"
              value={kpi.avgDpd}
            />
            <Kpi
              tone="teal"
              icon={IconCash}
              label="Outstanding"
              value={`₱${formatMoney(kpi.outstanding)}`}
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
              placeholder="Search borrower or account"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("fchip", severityFilter === chip.id && "is-on")}
                onClick={() => setSeverityFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>

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

          <div className="active-pill-row">
            {severityFilter !== "all" ? (
              <span className="active-pill">
                Severity: {severityChipLabel(severityFilter)}
                <button
                  type="button"
                  aria-label="Clear severity filter"
                  onClick={() => setSeverityFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {segmentFilter === "sme" ? "SME" : segmentFilter === "individual" ? "Individual" : "Seafarer"}
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
                  setSeverityFilter("all");
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
                <Th>Segment</Th>
                <Th>Account</Th>
                <Th>Severity</Th>
                <Th num>Outstanding</Th>
                <Th num>DPD</Th>
                <Th>Next due</Th>
                <Th>Turned over</Th>
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
      ) : kpi.assigned === 0 ? (
        <EmptyState
          title="No remedial accounts"
          description="Accounts turned over from AR/collection will appear here."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching accounts"
          description="Try a different search, severity, segment, or date range."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((acc) => {
            const secondary = secondaryOf(acc);
            return (
              <div key={acc.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">
                    {acc.loanAccountNo ?? acc.borrowerNo}
                  </span>
                  <Badge variant={severityVariant(acc.severity)}>
                    {severityLabel(acc.severity)}
                  </Badge>
                </div>
                <div className="gcard-name">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {acc.borrowerName}
                  </span>
                </div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Segment</span>
                    <span className="v">{segmentBadge(acc.segment)}</span>
                  </div>
                  {secondary ? (
                    <div className="row">
                      <span className="k">Identity</span>
                      <span className="v">{secondary}</span>
                    </div>
                  ) : null}
                  <div className="row">
                    <span className="k">Outstanding</span>
                    <span className="v mono text-teal-600">
                      {formatMoney(acc.outstandingBalance)}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">DPD</span>
                    <span className="v mono">{acc.daysPastDue}</span>
                  </div>
                  <div className="row">
                    <span className="k">Next due</span>
                    <span className="v">{renderNextDue(acc)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Turned over</span>
                    <span className="v">
                      {acc.turnedOverAt ? formatDate(acc.turnedOverAt) : "—"}
                      {acc.fromCollectorName
                        ? ` · from ${acc.fromCollectorName}`
                        : ""}
                    </span>
                  </div>
                </div>
                {renderOpenButton(acc)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Segment</Th>
                <Th>Account</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("priority")}
                >
                  Severity
                  {sortArrow("priority")}
                </Th>
                <Th
                  num
                  className="sortable"
                  onClick={() => toggleSort("balance")}
                >
                  Outstanding
                  {sortArrow("balance")}
                </Th>
                <Th num className="sortable" onClick={() => toggleSort("dpd")}>
                  DPD
                  {sortArrow("dpd")}
                </Th>
                <Th>Next due</Th>
                <Th className="sortable" onClick={() => toggleSort("turned")}>
                  Turned over
                  {sortArrow("turned")}
                </Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((acc) => (
                <tr key={acc.id}>
                  <Td>{renderBorrowerCell(acc)}</Td>
                  <Td>{segmentBadge(acc.segment)}</Td>
                  <Td className="mono">{acc.loanAccountNo ?? "—"}</Td>
                  <Td>
                    <Badge variant={severityVariant(acc.severity)}>
                      {severityLabel(acc.severity)}
                    </Badge>
                    <div className="mt-1">
                      <Badge variant="danger">{acc.agingBucket}</Badge>
                    </div>
                  </Td>
                  <Td num className="mono text-teal-600">
                    {formatMoney(acc.outstandingBalance)}
                  </Td>
                  <Td num className="mono">
                    {acc.daysPastDue}
                  </Td>
                  <Td>{renderNextDue(acc)}</Td>
                  <Td>
                    <div className="text-sm">
                      {acc.turnedOverAt ? formatDate(acc.turnedOverAt) : "—"}
                    </div>
                    {acc.fromCollectorName ? (
                      <div className="text-xs text-ink-400">
                        from {acc.fromCollectorName}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{renderOpenButton(acc)}</Td>
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
