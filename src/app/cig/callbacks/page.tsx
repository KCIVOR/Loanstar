"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ViewModeToggle,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
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
import { formatDateTime } from "@/lib/cig/format";
import {
  CALLBACK_LIST_PAGE_SIZES,
  callbackStatusFilterSpec,
  cigRecentMatchesSearch,
  clampCallbackListPageSize,
  computeCallbackListKpis,
  passesCallbackStatusFilter,
  sortCallbacksByDue,
  type CallbackStatusFilter,
  type CigScheduledCallback,
} from "@/lib/cig/history";

const PAGE_SIZE_OPTIONS = CALLBACK_LIST_PAGE_SIZES;

const STATUS_CHIPS: Array<{ id: CallbackStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
];

const SEGMENT_CHIPS: Array<{
  id: "all" | "seafarer" | "sme" | "individual";
  label: string;
}> = [
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

const IconCalendar = (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
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
    <div className="kpi flex h-full w-full flex-col text-left">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function statusChipLabel(filter: CallbackStatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function borrowerName(cb: CigScheduledCallback): string {
  return cb.borrower
    ? `${cb.borrower.firstName} ${cb.borrower.lastName}`
    : "Unknown borrower";
}

function StatusBadgeForCallback({ isOverdue }: { isOverdue: boolean }) {
  return isOverdue ? (
    <Badge variant="warning" dot>
      Overdue
    </Badge>
  ) : (
    <Badge variant="navy" dot>
      Upcoming
    </Badge>
  );
}

function segmentBadge(segment: "sme" | "seafarer" | "individual" | null) {
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

export default function CigCallbacksPage() {
  const [scheduledCallbacks, setScheduledCallbacks] = useState<
    CigScheduledCallback[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<CallbackStatusFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<
    "all" | "seafarer" | "sme" | "individual"
  >("all");
  const [dueSortDir, setDueSortDir] = useState<"asc" | "desc" | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [resolveTarget, setResolveTarget] =
    useState<CigScheduledCallback | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("segment", segmentFilter);
      const res = await fetch(`/api/cig/callbacks?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to load scheduled callbacks");
      const data = (await res.json()) as {
        scheduledCallbacks: CigScheduledCallback[];
      };
      setScheduledCallbacks(data.scheduledCallbacks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [segmentFilter]);

  async function handleResolveConfirm() {
    if (!resolveTarget) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cig/applications/${resolveTarget.applicationId}/callback-resolved`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callbackId: resolveTarget.id }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to mark resolved");
      setResolveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark resolved");
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, segmentFilter, pageSize, dueSortDir]);

  function toggleDueSort() {
    setDueSortDir((prev) => {
      if (prev === null) return "asc";
      return prev === "asc" ? "desc" : "asc";
    });
  }

  function setStatus(raw: string) {
    setStatusFilter(callbackStatusFilterSpec(raw));
  }

  const kpi = useMemo(
    () => computeCallbackListKpis(scheduledCallbacks),
    [scheduledCallbacks],
  );
  const kpiTotal = kpi.upcoming + kpi.overdue;

  const filtered = useMemo(() => {
    const searched = scheduledCallbacks.filter((cb) =>
      cigRecentMatchesSearch(
        {
          applicationNo: cb.applicationNo,
          borrower: cb.borrower,
        },
        search,
      ),
    );
    const statused = searched.filter((cb) =>
      passesCallbackStatusFilter(cb.isOverdue, statusFilter),
    );
    return dueSortDir === null
      ? statused
      : sortCallbacksByDue(statused, dueSortDir);
  }, [scheduledCallbacks, search, statusFilter, dueSortDir]);

  const safePageSize = clampCallbackListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (segmentFilter !== "all" ? 1 : 0);

  function renderActions(cb: CigScheduledCallback) {
    return (
      <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
        <Link href={`/cig/applications/${cb.applicationId}`}>
          <Button variant="secondary" size="sm">
            Open
          </Button>
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setResolveTarget(cb)}
        >
          Mark resolved
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Scheduled callbacks"
        description="Upcoming and overdue follow-ups held out of the active queue. Mark resolved when the call is done; overdue items also surface as badges on the main CIG queue."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi
              tone="navy"
              icon={IconCalendar}
              label="Upcoming"
              value={kpi.upcoming}
            />
            <Kpi
              tone="warning"
              icon={IconAlert}
              label="Overdue"
              value={kpi.overdue}
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
              placeholder="Search borrower or application no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                {segmentFilter === "sme" ? "SME" : segmentFilter === "individual" ? "Individual" : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {statusFilter !== "all" ? (
              <span className="active-pill">
                Status: {statusChipLabel(statusFilter)}
                <button
                  type="button"
                  aria-label="Clear status filter"
                  onClick={() => setStatus("all")}
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
                  setStatus("all");
                }}
              >
                Clear
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
            <span className="filter-group-label">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", statusFilter === chip.id && "is-on")}
                  onClick={() => setStatus(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
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
                <Th>Due</Th>
                <Th>Status</Th>
                <Th>Notes</Th>
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
      ) : kpiTotal === 0 ? (
        <EmptyState
          title="No scheduled callbacks"
          description="Upcoming and overdue follow-ups will appear here until they are marked resolved."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching callbacks"
          description="Try a different search term or status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((cb) => (
            <div key={cb.id} className="gcard">
              <div className="gcard-top">
                <span className="gcard-id">
                  {cb.applicationNo ??
                    cb.borrower?.borrowerNo ??
                    cb.applicationId.slice(0, 8)}
                </span>
                <StatusBadgeForCallback isOverdue={cb.isOverdue} />
              </div>
              <div className="gcard-name">{borrowerName(cb)}</div>
              <div className="gcard-meta">
                <div className="row">
                  <span className="k">Segment</span>
                  <span className="v">{segmentBadge(cb.segment)}</span>
                </div>
                <div className="row">
                  <span className="k">Due</span>
                  <span className="v mono">{formatDateTime(cb.scheduledAt)}</span>
                </div>
                <div className="row">
                  <span className="k">Notes</span>
                  <span className="v">
                    {cb.notes?.trim() ? cb.notes : "—"}
                  </span>
                </div>
              </div>
              {renderActions(cb)}
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th className="sortable" onClick={toggleDueSort}>
                  Due
                  {dueSortDir ? (
                    <span className="arr">
                      {dueSortDir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </Th>
                <Th>Status</Th>
                <Th>Notes</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cb) => (
                <tr key={cb.id}>
                  <Td>
                    <div className="font-medium text-ink-900">
                      {borrowerName(cb)}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-400">
                      <span className="id">
                        {cb.applicationNo ??
                          cb.borrower?.borrowerNo ??
                          cb.applicationId.slice(0, 8)}
                      </span>
                    </div>
                  </Td>
                  <Td>{segmentBadge(cb.segment)}</Td>
                  <Td className="mono">{formatDateTime(cb.scheduledAt)}</Td>
                  <Td>
                    <StatusBadgeForCallback isOverdue={cb.isOverdue} />
                  </Td>
                  <Td className="text-[13px] text-ink-600">
                    {cb.notes?.trim() ? cb.notes : "—"}
                  </Td>
                  <Td>{renderActions(cb)}</Td>
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

      <ConfirmDialog
        open={resolveTarget !== null}
        title="Confirm callback resolved"
        message={
          <>
            Confirm you completed the scheduled follow-up with{" "}
            <span className="font-medium text-ink-900">
              {resolveTarget?.borrower
                ? `${resolveTarget.borrower.firstName} ${resolveTarget.borrower.lastName}`
                : "the borrower"}
            </span>
            . This only records that the callback was handled — it does not
            change the application status.
          </>
        }
        confirmLabel="Yes, resolved"
        cancelLabel="Cancel"
        loading={resolving}
        onConfirm={() => void handleResolveConfirm()}
        onCancel={() => setResolveTarget(null)}
      />
    </div>
  );
}
