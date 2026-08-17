"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CollectorKpi,
  collectorIconProps,
} from "@/components/collector/CollectorKpi";
import {
  ViewModeToggle,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Badge,
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
import { dcrItemTotal } from "@/lib/collector/desk";
import {
  DCR_LIST_PAGE_SIZES,
  clampDcrListPageSize,
  computeDcrListKpis,
  dcrListStatusFilterSpec,
  isDcrListRow,
  passesDcrListStatusFilter,
  sortDcrsByDate,
  type DcrListStatusFilter,
} from "@/lib/collector/dcr-list";
import { dcrStatusVariant, formatDate, formatMoney } from "@/lib/collector/format";

type DcrItem = {
  id: string;
  payment_id: string;
  amount: number;
};

type DcrRow = {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  notes: string | null;
  dcr_items: DcrItem[] | null;
};

const PAGE_SIZE_OPTIONS = DCR_LIST_PAGE_SIZES;

const STATUS_CHIPS: Array<{ id: DcrListStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "reconciled", label: "Reconciled" },
  { id: "rejected", label: "Rejected" },
];

const IconSend = (
  <svg {...collectorIconProps}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const IconCheck = (
  <svg {...collectorIconProps}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const IconX = (
  <svg {...collectorIconProps}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

function statusChipLabel(filter: DcrListStatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function dcrListDate(dcr: DcrRow): string {
  return dcr.submitted_at ?? dcr.created_at;
}

export default function CollectorDcrHistoryPage() {
  const [dcrs, setDcrs] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DcrListStatusFilter>("all");
  const [dateSortDir, setDateSortDir] = useState<"asc" | "desc" | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collector/dcr?limit=100");
      if (!res.ok) throw new Error("Failed to load DCRR history");
      const data = (await res.json()) as { dcrs: DcrRow[] };
      setDcrs(data.dcrs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize, dateSortDir]);

  function toggleDateSort() {
    setDateSortDir((prev) => {
      if (prev === null) return "desc";
      return prev === "asc" ? "desc" : "asc";
    });
  }

  function setStatus(raw: string) {
    setStatusFilter(dcrListStatusFilterSpec(raw));
  }

  const recentRows = useMemo(
    () => dcrs.filter((dcr) => isDcrListRow(dcr.status)),
    [dcrs],
  );
  const kpi = useMemo(() => computeDcrListKpis(recentRows), [recentRows]);

  const filtered = useMemo(() => {
    const statused = recentRows.filter((dcr) =>
      passesDcrListStatusFilter(dcr.status, statusFilter),
    );
    return dateSortDir === null
      ? statused
      : sortDcrsByDate(statused, dateSortDir);
  }, [recentRows, statusFilter, dateSortDir]);

  const safePageSize = clampDcrListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;
  const activeFilterCount = statusFilter !== "all" ? 1 : 0;

  return (
    <div>
      <PageHeader
        title="DCRR history"
        description="Submitted and reconciled daily collection reports."
        actions={
          <Link href="/collector/dcr" className="btn btn-secondary">
            Back to DCRR builder
          </Link>
        }
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
            <CollectorKpi
              tone="teal"
              icon={IconSend}
              label="Submitted"
              value={kpi.submitted}
            />
            <CollectorKpi
              tone="success"
              icon={IconCheck}
              label="Reconciled"
              value={kpi.reconciled}
            />
            <CollectorKpi
              tone="danger"
              icon={IconX}
              label="Rejected"
              value={kpi.rejected}
            />
          </>
        )}
      </div>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div className="active-pill-row">
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
                onClick={() => setStatus("all")}
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
                <Th>DCRR</Th>
                <Th>Status</Th>
                <Th num>Items</Th>
                <Th num>Total</Th>
                <Th>Created / Submitted</Th>
                <Th>Reason</Th>
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
      ) : recentRows.length === 0 ? (
        <EmptyState
          title="No past DCRRs"
          description="Submitted and reconciled DCRRs will appear here after you submit a draft."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching DCRRs"
          description="Try a different status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((dcr) => {
            const items = dcr.dcr_items ?? [];
            return (
              <div key={dcr.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">{dcr.id.slice(0, 8)}</span>
                  <Badge variant={dcrStatusVariant(dcr.status)}>
                    {statusLabel(dcr.status)}
                  </Badge>
                </div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Items</span>
                    <span className="v mono">{items.length}</span>
                  </div>
                  <div className="row">
                    <span className="k">Total</span>
                    <span className="v mono text-teal-600">
                      {formatMoney(dcrItemTotal(items))}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Date</span>
                    <span className="v mono">{formatDate(dcrListDate(dcr))}</span>
                  </div>
                  {dcr.status === "rejected" && dcr.notes ? (
                    <div className="row">
                      <span className="k">Reason</span>
                      <span className="v">{dcr.notes}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th>DCRR</Th>
                <Th>Status</Th>
                <Th num>Items</Th>
                <Th num>Total</Th>
                <Th className="sortable" onClick={toggleDateSort}>
                  Created / Submitted
                  {dateSortDir ? (
                    <span className="arr">
                      {dateSortDir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((dcr) => {
                const items = dcr.dcr_items ?? [];
                return (
                  <tr key={dcr.id}>
                    <Td className="mono font-medium text-ink-900">
                      {dcr.id.slice(0, 8)}
                    </Td>
                    <Td>
                      <Badge variant={dcrStatusVariant(dcr.status)}>
                        {statusLabel(dcr.status)}
                      </Badge>
                    </Td>
                    <Td num className="mono">
                      {items.length}
                    </Td>
                    <Td num className="mono text-teal-600">
                      {formatMoney(dcrItemTotal(items))}
                    </Td>
                    <Td className="mono">{formatDate(dcrListDate(dcr))}</Td>
                    <Td>{dcr.status === "rejected" ? dcr.notes ?? "—" : "—"}</Td>
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
            disabled={loading}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
          <span>per page</span>
        </div>
        {!loading ? (
          <Pagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
            summary={`Showing ${summaryStart}–${summaryEnd} of ${totalCount}`}
          />
        ) : null}
      </div>
    </div>
  );
}
