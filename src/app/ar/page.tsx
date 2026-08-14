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
  Card,
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
import { formatDate, formatMoney } from "@/lib/ar/format";
import { masterlistSecondaryIdentity } from "@/lib/ar/masterlist-display";
import {
  MASTERLIST_QUEUE_PAGE_SIZES,
  needsAttention,
  type MasterlistQueueKpiCounts,
  type MasterlistQueueRow,
} from "@/lib/ar/queue";

type PortfolioJoin = {
  name: string;
  investor_label: string | null;
};

type AssignmentJoin = {
  collector_user_id: string | null;
  remedial_user_id: string | null;
};

type MasterlistRow = MasterlistQueueRow;

type QueueRow = {
  id: string;
  loan_application_id: string;
  queued_at: string;
  loan_applications?:
    | {
        application_no: string | null;
        status: string;
        borrowers?:
          | {
              borrower_no: string;
              first_name: string;
              last_name: string;
            }
          | Array<{
              borrower_no: string;
              first_name: string;
              last_name: string;
            }>
          | null;
      }
    | Array<{
        application_no: string | null;
        status: string;
        borrowers?:
          | { borrower_no: string; first_name: string; last_name: string }
          | Array<{ borrower_no: string; first_name: string; last_name: string }>
          | null;
      }>
    | null;
};

type SortKey = "priority" | "balance" | "borrower" | "status";
type StatusFilter = "all" | "active" | "paid" | "default" | "remedial";
type AgingFilter = "all" | "current" | "1-30" | "31-60" | "61-90" | "91+";
type SegmentFilter = "all" | "seafarer" | "sme";

const PAGE_SIZE_OPTIONS = MASTERLIST_QUEUE_PAGE_SIZES;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: MasterlistQueueKpiCounts = {
  total: 0,
  activeCount: 0,
  attentionCount: 0,
  totalOutstanding: 0,
};

const STATUS_CHIPS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paid", label: "Paid" },
  { id: "default", label: "Default" },
  { id: "remedial", label: "Remedial" },
];

const AGING_CHIPS: Array<{ id: AgingFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "current", label: "Current" },
  { id: "1-30", label: "1–30" },
  { id: "31-60", label: "31–60" },
  { id: "61-90", label: "61–90" },
  { id: "91+", label: "91+" },
];

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

function accountStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  const s = status.toLowerCase();
  if (s === "active" || s === "current") return "success";
  if (s === "paid" || s === "paid_off") return "teal";
  if (
    s === "overdue" ||
    s === "delinquent" ||
    s === "past_due" ||
    s === "remedial" ||
    s === "default"
  )
    return "danger";
  return "neutral";
}

function agingBucketVariant(
  bucket: string,
): "success" | "warning" | "danger" | "neutral" {
  const b = bucket.toLowerCase();
  if (b === "current") return "success";
  if (b.includes("91") || b.includes("120") || b.includes("180")) return "danger";
  if (b.includes("dpd") || b.includes("day") || b.includes("30") || b.includes("60"))
    return "warning";
  return "neutral";
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isAssigned(row: MasterlistRow): boolean {
  const assignment = firstJoin(row.assignments as AssignmentJoin | AssignmentJoin[] | null);
  return Boolean(
    assignment?.collector_user_id || assignment?.remedial_user_id,
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
const IconCheck = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);
const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
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

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function statusFilterLabel(filter: StatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function agingFilterLabel(filter: AgingFilter): string {
  return AGING_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function segmentBadge(segment: string | null | undefined) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function buildQueueQuery(params: {
  search: string;
  statusFilter: StatusFilter;
  agingFilter: AgingFilter;
  birStatusFilter: string;
  segmentFilter: SegmentFilter;
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("status", params.statusFilter);
  qs.set("aging", params.agingFilter);
  qs.set("birStatus", params.birStatusFilter);
  qs.set("segment", params.segmentFilter);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  // `priority` is client-only (current page); omit sortKey so server uses created_at default.
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

export default function ArDashboardPage() {
  const [rows, setRows] = useState<MasterlistRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<MasterlistQueueKpiCounts>(EMPTY_KPI);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agingFilter, setAgingFilter] = useState<AgingFilter>("all");
  const [birStatusFilter, setBirStatusFilter] = useState("all");
  const [birStatusCodes, setBirStatusCodes] = useState<Record<string, string>>(
    {},
  );
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
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
    agingFilter,
    birStatusFilter,
    segmentFilter,
    dateRange,
    pageSize,
    sortKey,
    sortDir,
  ]);

  const loadQueue = useCallback(async () => {
    const qRes = await fetch("/api/ar/queue");
    if (!qRes.ok) throw new Error("Failed to load receive queue");
    const qData = (await qRes.json()) as { queue: QueueRow[] };
    setQueue(qData.queue ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQueueQuery({
        search: debouncedSearch,
        statusFilter,
        agingFilter,
        birStatusFilter,
        segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/ar/masterlist?${query}`);
      if (!res.ok) throw new Error("Failed to load masterlist");
      const data = (await res.json()) as {
        rows: MasterlistRow[];
        totalCount: number;
        kpi: MasterlistQueueKpiCounts;
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
    agingFilter,
    birStatusFilter,
    segmentFilter,
    dateRange,
    sortKey,
    sortDir,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void loadQueue().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load");
    });
  }, [loadQueue]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ar/bir-status-codes");
        if (!res.ok) return;
        const data = (await res.json()) as { codes?: Record<string, string> };
        setBirStatusCodes(data.codes ?? {});
      } catch {
        /* filter chips stay empty if config unavailable */
      }
    })();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function receiveFile(applicationId: string) {
    setReceiving(applicationId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/queue/${applicationId}/receive`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to receive file");
      }
      setMessage("File received — masterlist account created, loan is active.");
      await Promise.all([load(), loadQueue()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setReceiving(null);
    }
  }

  async function exportCsv() {
    const res = await fetch("/api/ar/masterlist", { method: "POST" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "masterlist-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" ? "asc" : "desc");
    }
  }

  const displayRows = useMemo(() => {
    if (sortKey !== "priority") return rows;
    return [...rows].sort((a, b) => {
      // priority: attention first, then highest outstanding (current page only)
      const aFlag = needsAttention(a) ? 0 : 1;
      const bFlag = needsAttention(b) ? 0 : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return Number(b.outstanding_balance) - Number(a.outstanding_balance);
    });
  }, [rows, sortKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (agingFilter !== "all" ? 1 : 0) +
    (birStatusFilter !== "all" ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);

  const summaryStart = displayRows.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const summaryEnd = (safePage - 1) * pageSize + displayRows.length;

  function renderRowActions(row: MasterlistRow) {
    return (
      <Link href={`/ar/masterlist/${row.id}`}>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </Link>
    );
  }

  function renderBorrowerCell(row: MasterlistRow) {
    const secondary = masterlistSecondaryIdentity(row);
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink-900">{row.borrower_name}</span>
        </div>
        {secondary ? (
          <div className="text-xs text-ink-500">{secondary}</div>
        ) : null}
        <span className="id">{row.borrower_no}</span>
      </>
    );
  }

  function renderStatusBadges(row: MasterlistRow) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={accountStatusVariant(row.account_status)} dot>
          {row.account_status}
        </Badge>
        {row.remedial_flag ? (
          <Badge variant="danger" dot>
            Remedial
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AR masterlist"
        description="Post-release accounts, portfolio assignment, and export."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {queue.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Receive queue
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            Closed files transmitted by LRA — receiving a file creates its
            masterlist account and amortization schedule.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Queued</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => {
                const appRaw = row.loan_applications;
                const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
                const borrowerRaw = app?.borrowers;
                const borrower = Array.isArray(borrowerRaw)
                  ? borrowerRaw[0]
                  : borrowerRaw;
                return (
                  <tr key={row.id}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {borrower
                          ? `${borrower.first_name} ${borrower.last_name}`
                          : "Unknown borrower"}
                      </div>
                      <span className="id">
                        {app?.application_no ??
                          borrower?.borrower_no ??
                          row.loan_application_id.slice(0, 8)}
                      </span>
                    </Td>
                    <Td className="mono">
                      {new Date(row.queued_at).toLocaleString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        loading={receiving === row.loan_application_id}
                        onClick={() =>
                          void receiveFile(row.loan_application_id)
                        }
                      >
                        Receive &amp; create account
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
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
            <Kpi tone="navy" icon={IconLayers} label="Accounts" value={kpi.total} />
            <Kpi
              tone="success"
              icon={IconCheck}
              label="Active"
              value={kpi.activeCount}
            />
            <Kpi
              tone="danger"
              icon={IconAlert}
              label="Needs attention"
              value={kpi.attentionCount}
            />
            <Kpi
              tone="teal"
              icon={IconCash}
              label="Outstanding"
              value={formatMoney(kpi.totalOutstanding)}
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
              placeholder="Search name, borrower no, account"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {statusFilter !== "all" ? (
              <span className="active-pill">
                Status: {statusFilterLabel(statusFilter)}
                <button
                  type="button"
                  aria-label="Clear status filter"
                  onClick={() => setStatusFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {agingFilter !== "all" ? (
              <span className="active-pill">
                Aging: {agingFilterLabel(agingFilter)}
                <button
                  type="button"
                  aria-label="Clear aging filter"
                  onClick={() => setAgingFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
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
                  setStatusFilter("all");
                  setAgingFilter("all");
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
            <span className="filter-group-label">Aging</span>
            <div className="filter-bar">
              {AGING_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", agingFilter === chip.id && "is-on")}
                  onClick={() => setAgingFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Classification</span>
            <div className="filter-bar">
              <button
                type="button"
                className={cn("fchip", birStatusFilter === "all" && "is-on")}
                onClick={() => setBirStatusFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={cn("fchip", birStatusFilter === "unset" && "is-on")}
                onClick={() => setBirStatusFilter("unset")}
              >
                Unset
              </button>
              {Object.entries(birStatusCodes).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={cn("fchip", birStatusFilter === code && "is-on")}
                  onClick={() => setBirStatusFilter(code)}
                >
                  {label}
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
            <span className="filter-group-label">Created date</span>
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
                <Th>Loan account</Th>
                <Th>Portfolio</Th>
                <Th className="num">Outstanding</Th>
                <Th className="num">Monthly</Th>
                <Th>Aging</Th>
                <Th>Status</Th>
                <Th>Assignment</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={10}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : kpi.total === 0 ? (
        <EmptyState
          title="No masterlist records"
          description="Closed files will appear here after release processing."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching accounts"
          description="Try a different search, status, or aging filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {displayRows.map((row) => {
            const portfolio = firstJoin(
              row.portfolios as PortfolioJoin | PortfolioJoin[] | null,
            );
            const assigned = isAssigned(row);
            return (
              <div key={row.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">
                    {row.loan_account_no ?? row.borrower_no}
                  </span>
                  <Badge variant={accountStatusVariant(row.account_status)} dot>
                    {row.account_status}
                  </Badge>
                </div>
                <div className="gcard-name">{row.borrower_name}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Segment</span>
                    <span className="v">{segmentBadge(row.segment)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Outstanding</span>
                    <span className="v mono text-teal-600">
                      {formatMoney(Number(row.outstanding_balance))}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Aging</span>
                    <span className="v">{row.aging_bucket}</span>
                  </div>
                  <div className="row">
                    <span className="k">Portfolio</span>
                    <span className="v">{portfolio?.name ?? "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Assignment</span>
                    <span className="v">
                      {assigned ? "Assigned" : "Unassigned"}
                    </span>
                  </div>
                </div>
                {renderRowActions(row)}
              </div>
            );
          })}
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
                <Th>Segment</Th>
                <Th>Loan account</Th>
                <Th>Portfolio</Th>
                <Th
                  className="num sortable"
                  onClick={() => toggleSort("balance")}
                >
                  Outstanding
                  {sortArrow("balance")}
                </Th>
                <Th className="num">Monthly</Th>
                <Th>Aging</Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  {sortArrow("status")}
                </Th>
                <Th>Assignment</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const portfolio = firstJoin(
                  row.portfolios as PortfolioJoin | PortfolioJoin[] | null,
                );
                const assigned = isAssigned(row);
                return (
                  <tr key={row.id}>
                    <Td>{renderBorrowerCell(row)}</Td>
                    <Td>{segmentBadge(row.segment)}</Td>
                    <Td>
                      <span className="id">
                        {row.loan_account_no ?? "—"}
                      </span>
                    </Td>
                    <Td>{portfolio?.name ?? "—"}</Td>
                    <Td className="num text-teal-600">
                      {formatMoney(Number(row.outstanding_balance))}
                    </Td>
                    <Td className="num">
                      {formatMoney(Number(row.monthly_amortization))}
                    </Td>
                    <Td>
                      <Badge
                        variant={agingBucketVariant(row.aging_bucket)}
                        dot
                      >
                        {row.aging_bucket}
                      </Badge>
                    </Td>
                    <Td>{renderStatusBadges(row)}</Td>
                    <Td>
                      <Badge variant={assigned ? "teal" : "warning"} dot>
                        {assigned ? "Assigned" : "Unassigned"}
                      </Badge>
                    </Td>
                    <Td>{renderRowActions(row)}</Td>
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
