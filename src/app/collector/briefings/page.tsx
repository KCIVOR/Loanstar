"use client";

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
import {
  BRIEFING_LIST_PAGE_SIZES,
  clampBriefingListPageSize,
  computeBriefingListKpis,
  daysWaiting,
  briefingSearchPredicate,
  passesWaitingBucket,
  sortBriefingsByUpdatedAt,
  waitingBucketFilterSpec,
  type BriefingQueueItem,
  type BriefingWaitingBucket,
} from "@/lib/collector/briefings";
import { formatDateTime } from "@/lib/collector/format";

const PAGE_SIZE_OPTIONS = BRIEFING_LIST_PAGE_SIZES;

const WAITING_CHIPS: Array<{ id: BriefingWaitingBucket; label: string }> = [
  { id: "all", label: "All" },
  { id: "1-3", label: "1–3 days" },
  { id: "4-7", label: "4–7 days" },
  { id: "8+", label: "8+ days" },
];

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

const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
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

function waitingChipLabel(filter: BriefingWaitingBucket): string {
  return WAITING_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function formatWaitingDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  return `${days}d`;
}

function borrowerName(item: BriefingQueueItem): string {
  return item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`
    : "Unknown borrower";
}

function pathLabel(releasePath: string | null): string {
  if (releasePath === "with_pdc") return "With PDC";
  if (releasePath === "without_pdc") return "Without PDC";
  return "—";
}

function rowId(item: BriefingQueueItem): string {
  return (
    item.application?.applicationNo ??
    item.borrower?.borrowerNo ??
    item.releaseFileId.slice(0, 8)
  );
}

export default function CollectorBriefingsPage() {
  const [items, setItems] = useState<BriefingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<BriefingQueueItem | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [waitingFilter, setWaitingFilter] =
    useState<BriefingWaitingBucket>("all");
  const [signedSortDir, setSignedSortDir] = useState<"asc" | "desc" | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/collector/briefings");
      if (!res.ok) throw new Error("Failed to load briefing queue");
      const data = (await res.json()) as { items: BriefingQueueItem[] };
      setItems(data.items);
      if (!opts?.silent) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, waitingFilter, pageSize, signedSortDir]);

  async function acknowledge(releaseFileId: string) {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/collector/briefings/${releaseFileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to check off briefing");
      }
      setConfirmItem(null);
      setMessage("Briefing checked off — file is ready for release.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  function toggleSignedSort() {
    setSignedSortDir((prev) => {
      if (prev === null) return "desc";
      return prev === "asc" ? "desc" : "asc";
    });
  }

  function setWaiting(raw: string) {
    setWaitingFilter(waitingBucketFilterSpec(raw));
  }

  const kpi = useMemo(() => computeBriefingListKpis(items), [items]);

  const filtered = useMemo(() => {
    const searched = items.filter((item) =>
      briefingSearchPredicate(item, search),
    );
    const bucketed = searched.filter((item) =>
      passesWaitingBucket(daysWaiting(item.updatedAt), waitingFilter),
    );
    return signedSortDir === null
      ? bucketed
      : sortBriefingsByUpdatedAt(bucketed, signedSortDir);
  }, [items, search, waitingFilter, signedSortDir]);

  const safePageSize = clampBriefingListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;

  const activeFilterCount = waitingFilter !== "all" ? 1 : 0;

  function renderConductButton(item: BriefingQueueItem) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirmItem(item)}
      >
        Conduct briefing
      </Button>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pre-release briefings"
        description="Files handed off by LRA — brief the borrower on payment rules and legal consequences, then check off the briefing to unlock release."
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
              icon={IconLayers}
              label="Awaiting briefing"
              value={kpi.awaiting}
            />
            <Kpi
              tone="warning"
              icon={IconClock}
              label="Oldest waiting"
              value={
                kpi.oldestWaitingDays === 0 ? 0 : `${kpi.oldestWaitingDays}d`
              }
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
              placeholder="Search borrower, app no, or borrower no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {waitingFilter !== "all" ? (
              <span className="active-pill">
                Waiting: {waitingChipLabel(waitingFilter)}
                <button
                  type="button"
                  aria-label="Clear waiting filter"
                  onClick={() => setWaiting("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => setWaiting("all")}
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
            <span className="filter-group-label">Waiting</span>
            <div className="flex flex-wrap gap-1.5">
              {WAITING_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", waitingFilter === chip.id && "is-on")}
                  onClick={() => setWaiting(chip.id)}
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
                <Th>Path</Th>
                <Th>Signed since</Th>
                <Th>Waiting</Th>
                <Th className="w-1">{""}</Th>
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
      ) : kpi.awaiting === 0 ? (
        <EmptyState
          title="No briefings pending"
          description="Files will appear here once LRA completes the signing session."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching briefings"
          description="Try a different search term or waiting filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((item) => {
            const waiting = daysWaiting(item.updatedAt);
            return (
              <div key={item.releaseFileId} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">{rowId(item)}</span>
                  <Badge variant="navy" dot>
                    {pathLabel(item.releasePath)}
                  </Badge>
                </div>
                <div className="gcard-name">{borrowerName(item)}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Signed since</span>
                    <span className="v mono">
                      {formatDateTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Waiting</span>
                    <span className="v mono">{formatWaitingDays(waiting)}</span>
                  </div>
                </div>
                {renderConductButton(item)}
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
                <Th>Path</Th>
                <Th className="sortable" onClick={toggleSignedSort}>
                  Signed since
                  {signedSortDir ? (
                    <span className="arr">
                      {signedSortDir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </Th>
                <Th>Waiting</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const waiting = daysWaiting(item.updatedAt);
                return (
                  <tr key={item.releaseFileId}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {borrowerName(item)}
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-400">
                        <span className="id">{rowId(item)}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge variant="navy" dot>
                        {pathLabel(item.releasePath)}
                      </Badge>
                    </Td>
                    <Td className="mono">{formatDateTime(item.updatedAt)}</Td>
                    <Td className="mono">{formatWaitingDays(waiting)}</Td>
                    <Td>{renderConductButton(item)}</Td>
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

      <ConfirmDialog
        open={confirmItem !== null}
        title="Check off this briefing?"
        message={
          <>
            Confirm you have briefed{" "}
            <span className="font-medium text-ink-900">
              {confirmItem?.borrower
                ? `${confirmItem.borrower.firstName} ${confirmItem.borrower.lastName}`
                : "the borrower"}
            </span>{" "}
            on the items below. This unlocks release and cannot be undone.
          </>
        }
        confirmLabel="Briefing completed"
        cancelLabel="Cancel"
        loading={acting}
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => {
          if (confirmItem) void acknowledge(confirmItem.releaseFileId);
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-500">
          {(confirmItem?.briefing?.checklist ?? []).map((item) => (
            <li key={item.key}>{item.label}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
