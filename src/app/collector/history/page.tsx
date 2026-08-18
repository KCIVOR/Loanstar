"use client";

import { useEffect, useMemo, useState } from "react";

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
import {
  COLLECTION_HISTORY_PAGE_SIZES,
  clampCollectionHistoryPageSize,
  computeDcrHistoryKpis,
  computePaymentHistoryKpis,
  isInCollectionHistoryRange,
  sortCollectionHistoryRows,
  type CollectionHistoryRange,
  type CollectionHistorySortDirection,
} from "@/lib/collector/collection-history-ui";
import { dcrItemTotal } from "@/lib/collector/desk";
import {
  dcrStatusVariant,
  firstJoin,
  formatDate,
  formatDateTime,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";

type MasterlistJoin = {
  borrower_name: string;
  loan_account_no: string | null;
  segment: "sme" | "seafarer" | null;
};

type Payment = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  channel: string;
  created_at: string;
  reviewed_at?: string | null;
  uploadedByName?: string | null;
  masterlist?: MasterlistJoin | MasterlistJoin[] | null;
};

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

type HistoryTab = "dcrs" | "payments";
type SegmentFilter = "all" | "seafarer" | "sme";
type PayStatusFilter =
  | "all"
  | "confirmed"
  | "rejected"
  | "posted"
  | "pending_verification";
type DcrStatusFilter =
  | "all"
  | "draft"
  | "submitted"
  | "reconciled"
  | "rejected";

const DCR_STATUS_CHIPS: Array<{ id: DcrStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "reconciled", label: "Reconciled" },
  { id: "rejected", label: "Rejected" },
];

const PAYMENT_STATUS_CHIPS: Array<{ id: PayStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending_verification", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "posted", label: "Posted" },
  { id: "rejected", label: "Rejected" },
];

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

const RANGE_CHIPS: Array<{
  id: CollectionHistoryRange;
  label: string;
}> = [
  { id: "recent", label: "Recent (30d)" },
  { id: "all", label: "All time" },
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

const IconClock = (
  <svg {...collectorIconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const IconReceipt = (
  <svg {...collectorIconProps}>
    <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </svg>
);

const IconX = (
  <svg {...collectorIconProps}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

function segmentBadge(segment: string | null | undefined) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function paymentHistoryDate(payment: Payment) {
  return payment.reviewed_at ?? payment.created_at;
}

function dcrHistoryDate(dcr: DcrRow) {
  return dcr.submitted_at ?? dcr.created_at;
}

function ActiveCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 font-mono text-[10px] font-bold text-white"
    >
      {count}
    </span>
  );
}

export default function CollectorHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dcrs, setDcrs] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<HistoryTab>("dcrs");
  const [range, setRange] = useState<CollectionHistoryRange>("recent");
  const [search, setSearch] = useState("");
  const [payStatus, setPayStatus] = useState<PayStatusFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dcrStatus, setDcrStatus] = useState<DcrStatusFilter>("all");
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [dateSortDir, setDateSortDir] =
    useState<CollectionHistorySortDirection>("desc");
  const [pageSize, setPageSize] =
    useState<(typeof COLLECTION_HISTORY_PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [payRes, dcrRes] = await Promise.all([
          fetch("/api/collector/payments?scope=history"),
          fetch("/api/collector/dcr?limit=100"),
        ]);
        if (!payRes.ok || !dcrRes.ok) throw new Error("Failed to load history");
        const payData = (await payRes.json()) as { payments: Payment[] };
        const dcrData = (await dcrRes.json()) as { dcrs: DcrRow[] };
        if (!cancelled) {
          setPayments(payData.payments ?? []);
          setDcrs(dcrData.dcrs ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dcrKpis = useMemo(() => computeDcrHistoryKpis(dcrs), [dcrs]);
  const paymentKpis = useMemo(
    () => computePaymentHistoryKpis(payments),
    [payments],
  );

  const filteredDcrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = dcrs.filter((dcr) => {
      if (dcrStatus !== "all" && dcr.status !== dcrStatus) return false;
      if (!isInCollectionHistoryRange(dcrHistoryDate(dcr), range)) return false;
      if (!term) return true;
      return (
        dcr.id.toLowerCase().includes(term) ||
        dcr.status.toLowerCase().includes(term)
      );
    });
    return sortCollectionHistoryRows(rows, dcrHistoryDate, dateSortDir);
  }, [dcrs, dcrStatus, range, search, dateSortDir]);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = payments.filter((payment) => {
      if (payStatus !== "all" && payment.status !== payStatus) return false;
      const masterlist = firstJoin(payment.masterlist);
      if (
        segmentFilter !== "all" &&
        masterlist?.segment !== segmentFilter
      ) {
        return false;
      }
      if (
        !isInCollectionHistoryRange(paymentHistoryDate(payment), range)
      ) {
        return false;
      }
      if (!term) return true;
      return (
        (payment.reference_no?.toLowerCase().includes(term) ?? false) ||
        (masterlist?.borrower_name.toLowerCase().includes(term) ?? false) ||
        (masterlist?.loan_account_no?.toLowerCase().includes(term) ?? false) ||
        payment.status.toLowerCase().includes(term)
      );
    });
    return sortCollectionHistoryRows(rows, paymentHistoryDate, dateSortDir);
  }, [
    payments,
    payStatus,
    segmentFilter,
    range,
    search,
    dateSortDir,
  ]);

  const safePageSize = clampCollectionHistoryPageSize(pageSize);
  const totalCount =
    tab === "dcrs" ? filteredDcrs.length : filteredPayments.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const pagedDcrs = filteredDcrs.slice(pageStart, pageStart + safePageSize);
  const pagedPayments = filteredPayments.slice(
    pageStart,
    pageStart + safePageSize,
  );
  const shownCount =
    tab === "dcrs" ? pagedDcrs.length : pagedPayments.length;
  const summaryStart = shownCount ? pageStart + 1 : 0;
  const summaryEnd = pageStart + shownCount;

  const activeFilterCount =
    (range === "recent" ? 0 : 1) +
    (tab === "dcrs"
      ? dcrStatus === "all"
        ? 0
        : 1
      : (payStatus === "all" ? 0 : 1) +
        (segmentFilter === "all" ? 0 : 1));

  function selectTab(nextTab: HistoryTab) {
    setTab(nextTab);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function selectRange(nextRange: CollectionHistoryRange) {
    setRange(nextRange);
    setPage(1);
  }

  function selectDcrStatus(status: DcrStatusFilter) {
    setDcrStatus(status);
    setPage(1);
  }

  function selectPaymentStatus(status: PayStatusFilter) {
    setPayStatus(status);
    setPage(1);
  }

  function selectSegment(segment: SegmentFilter) {
    setSegmentFilter(segment);
    setPage(1);
  }

  function clearFilters() {
    setRange("recent");
    setDcrStatus("all");
    setPayStatus("all");
    setSegmentFilter("all");
    setPage(1);
  }

  function toggleDateSort() {
    setDateSortDir((direction) =>
      direction === "asc" ? "desc" : "asc",
    );
    setPage(1);
  }

  const searchPlaceholder =
    tab === "dcrs"
      ? "Search DCRR ID or status…"
      : "Search borrower, account, reference…";

  return (
    <div>
      <PageHeader
        title="Collection history"
        description="Past DCRRs and payment proofs for your assigned accounts."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={cn("fchip", tab === "dcrs" && "is-on")}
          onClick={() => selectTab("dcrs")}
        >
          DCRRs
        </button>
        <button
          type="button"
          className={cn("fchip", tab === "payments" && "is-on")}
          onClick={() => selectTab("payments")}
        >
          Payments
        </button>
      </div>

      <div className="kpi-grid mb-4">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : tab === "dcrs" ? (
          <>
            <CollectorKpi
              tone="teal"
              icon={IconSend}
              label="Submitted"
              value={dcrKpis.submitted}
            />
            <CollectorKpi
              tone="success"
              icon={IconCheck}
              label="Reconciled"
              value={dcrKpis.reconciled}
            />
            <CollectorKpi
              tone="danger"
              icon={IconX}
              label="Rejected"
              value={dcrKpis.rejected}
            />
          </>
        ) : (
          <>
            <CollectorKpi
              tone="warning"
              icon={IconClock}
              label="Pending"
              value={paymentKpis.pending}
            />
            <CollectorKpi
              tone="navy"
              icon={IconReceipt}
              label="Confirmed"
              value={paymentKpis.confirmed}
            />
            <CollectorKpi
              tone="success"
              icon={IconCheck}
              label="Posted"
              value={paymentKpis.posted}
            />
            <CollectorKpi
              tone="danger"
              icon={IconX}
              label="Rejected"
              value={paymentKpis.rejected}
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
                aria-hidden
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
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {range === "all" ? (
              <span className="active-pill">
                All time
                <button
                  type="button"
                  aria-label="Reset date range"
                  onClick={() => selectRange("recent")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {tab === "dcrs" && dcrStatus !== "all" ? (
              <span className="active-pill">
                Status: {statusLabel(dcrStatus)}
                <button
                  type="button"
                  aria-label="Clear DCRR status"
                  onClick={() => selectDcrStatus("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {tab === "payments" && payStatus !== "all" ? (
              <span className="active-pill">
                Status: {statusLabel(payStatus)}
                <button
                  type="button"
                  aria-label="Clear payment status"
                  onClick={() => selectPaymentStatus("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {tab === "payments" && segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {segmentFilter === "sme" ? "SME" : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment"
                  onClick={() => selectSegment("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={clearFilters}
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
              <ActiveCount count={activeFilterCount} />
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {(tab === "dcrs"
                ? DCR_STATUS_CHIPS
                : PAYMENT_STATUS_CHIPS
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn(
                    "fchip",
                    (tab === "dcrs"
                      ? dcrStatus === chip.id
                      : payStatus === chip.id) && "is-on",
                  )}
                  onClick={() => {
                    if (tab === "dcrs") {
                      selectDcrStatus(chip.id as DcrStatusFilter);
                    } else {
                      selectPaymentStatus(chip.id as PayStatusFilter);
                    }
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "payments" ? (
            <div className="filter-group">
              <span className="filter-group-label">Segment</span>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={cn(
                      "fchip",
                      segmentFilter === chip.id && "is-on",
                    )}
                    onClick={() => selectSegment(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="filter-group">
            <span className="filter-group-label">Date</span>
            <div className="flex flex-wrap gap-1.5">
              {RANGE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", range === chip.id && "is-on")}
                  onClick={() => selectRange(chip.id)}
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
                <Th>{tab === "dcrs" ? "DCRR" : "Borrower"}</Th>
                <Th>Status</Th>
                <Th num>{tab === "dcrs" ? "Items" : "Amount"}</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, index) => (
                <tr key={index}>
                  <Td colSpan={4}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : totalCount === 0 ? (
        <EmptyState
          title={tab === "dcrs" ? "No matching DCRRs" : "No matching payments"}
          description={
            tab === "dcrs"
              ? "Try a different search, status, or date filter."
              : "Try a different search, status, segment, or date filter."
          }
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {tab === "dcrs"
            ? pagedDcrs.map((dcr) => {
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
                        <span className="v mono">
                          {formatDate(dcrHistoryDate(dcr))}
                        </span>
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
              })
            : pagedPayments.map((pay) => {
                const masterlist = firstJoin(pay.masterlist);
                return (
                  <div key={pay.id} className="gcard">
                    <div className="gcard-top">
                      <span className="gcard-id">
                        {pay.reference_no ?? "No reference"}
                      </span>
                      <Badge variant={paymentStatusVariant(pay.status)}>
                        {statusLabel(pay.status)}
                      </Badge>
                    </div>
                    <div className="gcard-name">
                      {masterlist?.borrower_name ?? "—"}
                    </div>
                    {pay.uploadedByName ? (
                      <p className="mb-2 text-xs text-ink-500">
                        Recorded by {pay.uploadedByName}
                      </p>
                    ) : null}
                    <div className="gcard-meta">
                      <div className="row">
                        <span className="k">Account</span>
                        <span className="v mono">
                          {masterlist?.loan_account_no ?? "—"}
                        </span>
                      </div>
                      <div className="row">
                        <span className="k">Segment</span>
                        <span className="v">
                          {segmentBadge(masterlist?.segment)}
                        </span>
                      </div>
                      <div className="row">
                        <span className="k">Amount</span>
                        <span className="v mono text-teal-600">
                          {formatMoney(Number(pay.amount))}
                        </span>
                      </div>
                      <div className="row">
                        <span className="k">Date</span>
                        <span className="v mono">
                          {formatDate(pay.payment_date)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      ) : tab === "dcrs" ? (
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
                  <span className="arr">
                    {dateSortDir === "asc" ? "▲" : "▼"}
                  </span>
                </Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {pagedDcrs.map((dcr) => {
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
                    <Td className="mono">{formatDate(dcrHistoryDate(dcr))}</Td>
                    <Td>
                      {dcr.status === "rejected" ? dcr.notes ?? "—" : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th>Reference</Th>
                <Th className="sortable" onClick={toggleDateSort}>
                  Date
                  <span className="arr">
                    {dateSortDir === "asc" ? "▲" : "▼"}
                  </span>
                </Th>
                <Th num>Amount</Th>
                <Th>Status</Th>
                <Th>Recorded</Th>
              </tr>
            </thead>
            <tbody>
              {pagedPayments.map((pay) => {
                const masterlist = firstJoin(pay.masterlist);
                return (
                  <tr key={pay.id}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {masterlist?.borrower_name ?? "—"}
                      </div>
                      <div className="mono text-xs text-ink-500">
                        {masterlist?.loan_account_no ?? "—"}
                      </div>
                    </Td>
                    <Td>{segmentBadge(masterlist?.segment)}</Td>
                    <Td className="mono">{pay.reference_no ?? "—"}</Td>
                    <Td className="mono">{formatDate(pay.payment_date)}</Td>
                    <Td num className="mono text-teal-600">
                      {formatMoney(Number(pay.amount))}
                    </Td>
                    <Td>
                      <Badge variant={paymentStatusVariant(pay.status)}>
                        {statusLabel(pay.status)}
                      </Badge>
                    </Td>
                    <Td className="mono text-sm">
                      {formatDateTime(pay.created_at)}
                      {pay.uploadedByName ? (
                        <div className="mt-1 font-sans text-xs text-ink-500">
                          Recorded by {pay.uploadedByName}
                        </div>
                      ) : null}
                    </Td>
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
            onChange={(event) => {
              setPageSize(
                Number(
                  event.target.value,
                ) as (typeof COLLECTION_HISTORY_PAGE_SIZES)[number],
              );
              setPage(1);
            }}
            style={{ width: 72, height: 34 }}
            disabled={loading}
          >
            {COLLECTION_HISTORY_PAGE_SIZES.map((size) => (
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
