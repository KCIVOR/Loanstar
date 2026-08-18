"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  cn,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import {
  AR_DCR_LIST_PAGE_SIZES,
  arDcrSearchPredicate,
  clampArDcrListPageSize,
  daysWaiting,
  passesWaitingBucket,
  sortDcrsBySubmittedAt,
  waitingBucketFilterSpec,
  type ArDcrWaitingBucket,
} from "@/lib/ar/dcr-list";

type SegmentFilter = "all" | "seafarer" | "sme";

type DcrRow = {
  id: string;
  submitted_at: string | null;
  rejected_at: string | null;
  notes: string | null;
  collector_name: string | null;
  dcr_items: Array<{
    id?: string;
    amount: number;
    status?: "pending" | "posted" | "rejected";
    deposit_reference?: string | null;
    deposit_amount?: number | null;
    posted_at?: string | null;
    payments: {
      id?: string;
      reference_no: string | null;
      payment_date: string;
      amount?: number;
      masterlist_id?: string;
      storage_path?: string | null;
      file_name?: string | null;
      notes?: string | null;
      masterlist: {
        borrower_name: string;
        loan_account_no: string | null;
        segment: "sme" | "seafarer" | null;
      } | null;
    } | null;
  }>;
};

const PAGE_SIZE_OPTIONS = AR_DCR_LIST_PAGE_SIZES;

const WAITING_CHIPS: Array<{ id: ArDcrWaitingBucket; label: string }> = [
  { id: "all", label: "All" },
  { id: "1-3", label: "1–3 days" },
  { id: "4-7", label: "4–7 days" },
  { id: "8+", label: "8+ days" },
];

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

function segmentBadge(segment: string | null | undefined) {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function dcrPassesSegmentFilter(
  dcr: DcrRow,
  segmentFilter: SegmentFilter,
): boolean {
  if (segmentFilter === "all") return true;
  return (dcr.dcr_items ?? []).some(
    (item) => item.payments?.masterlist?.segment === segmentFilter,
  );
}

function lineItemsForSegment(
  items: DcrRow["dcr_items"],
  segmentFilter: SegmentFilter,
) {
  if (segmentFilter === "all") return items ?? [];
  return (items ?? []).filter(
    (item) => item.payments?.masterlist?.segment === segmentFilter,
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function waitingChipLabel(filter: ArDcrWaitingBucket): string {
  return WAITING_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconList = (
  <svg {...iconProps}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
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

export default function ArDcrPage() {
  const [queue, setQueue] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [depositRef, setDepositRef] = useState<Record<string, string>>({});
  const [depositAmt, setDepositAmt] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [waitingFilter, setWaitingFilter] =
    useState<ArDcrWaitingBucket>("all");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewStatus, setViewStatus] = useState<"submitted" | "rejected">(
    "submitted",
  );
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean; status?: "submitted" | "rejected" }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const status = opts?.status ?? viewStatus;
        const res = await fetch(`/api/ar/dcr?status=${status}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { dcrQueue: DcrRow[] };
        setQueue(data.dcrQueue);
        if (!opts?.silent) setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [viewStatus],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function reject(itemId: string) {
    const reason = rejectReason.trim();
    if (!reason) return;
    setRejecting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/dcr/items/${itemId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Reject failed");
      }
      setRejectId(null);
      setRejectReason("");
      setMessage("Payment rejected — the collector and borrower were notified. Other items on this DCRR are unaffected.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search, waitingFilter, segmentFilter, sortDir, pageSize, viewStatus]);

  async function viewProof(paymentId: string) {
    setError(null);
    setViewingId(paymentId);
    try {
      const res = await fetch(`/api/ar/payments/${paymentId}/download`);
      const body = (await res.json()) as {
        signedUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.signedUrl) {
        throw new Error(body.error ?? "Download failed");
      }
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setViewingId(null);
    }
  }

  async function reconcile(itemId: string) {
    const ref = depositRef[itemId]?.trim();
    const amount = Number(depositAmt[itemId]);
    if (!ref || !amount) return;
    setReconciling(itemId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/dcr/items/${itemId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositReference: ref, depositAmount: amount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Reconcile failed");
      }
      setConfirmId(null);
      setDepositRef((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setDepositAmt((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setMessage("Payment posted — marked Paid. Other items on this DCRR are unaffected.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setReconciling(null);
    }
  }

  function setWaiting(raw: string) {
    setWaitingFilter(waitingBucketFilterSpec(raw));
  }

  const lineItemCount = queue.reduce(
    (sum, dcr) => sum + (dcr.dcr_items?.length ?? 0),
    0,
  );
  const totalToPost = queue.reduce(
    (sum, dcr) =>
      sum +
      (dcr.dcr_items ?? []).reduce(
        (inner, item) => inner + Number(item.amount ?? 0),
        0,
      ),
    0,
  );

  const filtered = useMemo(() => {
    const searched = queue.filter((dcr) => arDcrSearchPredicate(dcr, search));
    const bucketed = searched.filter((dcr) =>
      passesWaitingBucket(daysWaiting(dcr.submitted_at), waitingFilter),
    );
    const segmented = bucketed.filter((dcr) =>
      dcrPassesSegmentFilter(dcr, segmentFilter),
    );
    return sortDcrsBySubmittedAt(segmented, sortDir);
  }, [queue, search, waitingFilter, segmentFilter, sortDir]);

  const safePageSize = clampArDcrListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;

  const activeFilterCount =
    (waitingFilter !== "all" ? 1 : 0) + (segmentFilter !== "all" ? 1 : 0);

  const confirmItem = confirmId
    ? (queue
        .flatMap((d) => d.dcr_items ?? [])
        .find((item) => item.id === confirmId) ?? null)
    : null;
  const confirmBorrowerName =
    confirmItem?.payments?.masterlist?.borrower_name ?? "this borrower";
  const confirmAmount = Number(confirmItem?.amount ?? 0);

  return (
    <div>
      <PageHeader
        title="DCRR reconciliation"
        description="Match bank deposits and post payments — the only path to Paid."
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

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={cn("fchip", viewStatus === "submitted" && "on")}
          onClick={() => setViewStatus("submitted")}
        >
          Submitted
        </button>
        <button
          type="button"
          className={cn("fchip", viewStatus === "rejected" && "on")}
          onClick={() => setViewStatus("rejected")}
        >
          Rejected
        </button>
      </div>

      <div className="kpi-grid mb-6">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi
              tone="navy"
              icon={IconLayers}
              label={
                viewStatus === "rejected" ? "Rejected DCRRs" : "Pending DCRRs"
              }
              value={queue.length}
            />
            <Kpi
              tone="warning"
              icon={IconList}
              label="Line items"
              value={lineItemCount}
            />
            <Kpi
              tone="teal"
              icon={IconCash}
              label={
                viewStatus === "rejected" ? "Total rejected" : "Total to post"
              }
              value={`₱${formatMoney(totalToPost)}`}
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
              placeholder="Search borrower, account, or payment ref"
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
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => {
                  setWaiting("all");
                  setSegmentFilter("all");
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="sp">
            <Select
              aria-label="Sort"
              value={sortDir}
              onChange={(e) =>
                setSortDir(e.target.value === "desc" ? "desc" : "asc")
              }
              style={{ width: 148, height: 34 }}
            >
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </Select>
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
        </div>
      </div>

      {loading ? (
        <div className="mb-4 flex flex-col gap-3.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Skeleton variant="line" />
              <div className="mt-3">
                <Skeleton variant="line" />
              </div>
            </Card>
          ))}
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          title={
            viewStatus === "rejected" ? "No rejected DCRRs" : "No DCRRs pending"
          }
          description={
            viewStatus === "rejected"
              ? "DCRRs you reject will stay listed here with the reason, for audit."
              : "Submitted collector DCRRs will appear here for deposit matching."
          }
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching DCRRs"
          description="Try a different search term, waiting filter, or segment."
          showMark={false}
        />
      ) : (
        <div className="mb-4 flex flex-col gap-3.5">
          {rows.map((dcr) => {
            const allItems = dcr.dcr_items ?? [];
            const items = lineItemsForSegment(allItems, segmentFilter);
            const batchTotal = allItems.reduce(
              (sum, item) => sum + Number(item.amount ?? 0),
              0,
            );
            const shortId = dcr.id.slice(0, 8);

            return (
              <Card key={dcr.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-semibold text-navy-900">
                        DCRR
                      </h2>
                      <span className="id">{shortId}</span>
                      {viewStatus === "rejected" ? (
                        <Badge variant="danger" dot>
                          Rejected
                        </Badge>
                      ) : (
                        <Badge variant="warning" dot>
                          Submitted
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {viewStatus === "rejected" ? (
                        <>
                          Rejected{" "}
                          <span className="mono">
                            {dcr.rejected_at
                              ? formatDateTime(dcr.rejected_at)
                              : "—"}
                          </span>
                        </>
                      ) : (
                        <>
                          Submitted{" "}
                          <span className="mono">
                            {dcr.submitted_at
                              ? formatDateTime(dcr.submitted_at)
                              : "—"}
                          </span>
                        </>
                      )}
                      {dcr.collector_name ? (
                        <> · {dcr.collector_name}</>
                      ) : null}
                      {" · "}
                      <span className="mono font-semibold text-teal-600">
                        ₱{formatMoney(batchTotal)}
                      </span>
                      {" · "}
                      {allItems.length} item
                      {allItems.length === 1 ? "" : "s"}
                    </p>
                    {viewStatus === "rejected" && dcr.notes ? (
                      <p className="mt-2 rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink-700">
                        <span className="font-semibold text-danger">
                          Reason:
                        </span>{" "}
                        {dcr.notes}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mb-4 overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Borrower</Th>
                        <Th>Account</Th>
                        <Th>Segment</Th>
                        <Th className="num">Amount</Th>
                        <Th>Payment ref</Th>
                        <Th>Date</Th>
                        <Th>Proof</Th>
                        {viewStatus === "submitted" ? (
                          <Th className="min-w-[280px]">Reconcile</Th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const masterlistId = item.payments?.masterlist_id;
                        const name =
                          item.payments?.masterlist?.borrower_name ??
                          "Borrower";
                        const acct =
                          item.payments?.masterlist?.loan_account_no ?? "—";
                        return (
                          <tr key={item.id ?? `${dcr.id}-${idx}`}>
                            <Td>
                              {masterlistId ? (
                                <Link
                                  href={`/ar/masterlist/${masterlistId}`}
                                  className="font-medium text-teal-700 hover:underline"
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span className="font-medium text-ink-900">
                                  {name}
                                </span>
                              )}
                            </Td>
                            <Td>
                              <span className="id">{acct}</span>
                            </Td>
                            <Td>
                              {segmentBadge(item.payments?.masterlist?.segment)}
                            </Td>
                            <Td className="num mono text-teal-600">
                              {formatMoney(Number(item.amount))}
                            </Td>
                            <Td className="mono">
                              {item.payments?.reference_no ?? "—"}
                              {item.payments?.notes ? (
                                <div className="mt-1 whitespace-normal text-xs font-normal text-ink-500">
                                  {item.payments.notes}
                                </div>
                              ) : null}
                            </Td>
                            <Td className="mono">
                              {item.payments?.payment_date
                                ? formatDate(item.payments.payment_date)
                                : "—"}
                            </Td>
                            <Td>
                              {item.payments?.id &&
                              item.payments.storage_path ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  loading={viewingId === item.payments.id}
                                  onClick={() =>
                                    void viewProof(item.payments!.id!)
                                  }
                                >
                                  View
                                </Button>
                              ) : (
                                <span className="text-ink-400">—</span>
                              )}
                            </Td>
                            {viewStatus === "submitted" ? (
                              <Td>
                                {item.status === "posted" ? (
                                  <div>
                                    <Badge variant="success" dot>
                                      Posted
                                    </Badge>
                                    {item.deposit_reference ? (
                                      <div className="mt-1 mono text-xs text-ink-400">
                                        Ref {item.deposit_reference}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : item.status === "rejected" ? (
                                  <Badge variant="danger" dot>
                                    Rejected
                                  </Badge>
                                ) : item.id ? (
                                  (() => {
                                    const itemId = item.id;
                                    const itemAmount = Number(item.amount ?? 0);
                                    const amountMismatch =
                                      depositAmt[itemId] &&
                                      Number(depositAmt[itemId]) !== itemAmount;
                                    return (
                                      <div className="flex flex-col gap-1.5">
                                        <Input
                                          aria-label={`Bank deposit reference — ${name}`}
                                          placeholder="Deposit ref *"
                                          value={depositRef[itemId] ?? ""}
                                          onChange={(e) =>
                                            setDepositRef((prev) => ({
                                              ...prev,
                                              [itemId]: e.target.value,
                                            }))
                                          }
                                          className="mono"
                                        />
                                        <div className="flex items-center gap-1.5">
                                          <Input
                                            aria-label={`Deposit amount — ${name}`}
                                            type="number"
                                            step="0.01"
                                            placeholder={formatMoney(itemAmount)}
                                            value={depositAmt[itemId] ?? ""}
                                            onChange={(e) =>
                                              setDepositAmt((prev) => ({
                                                ...prev,
                                                [itemId]: e.target.value,
                                              }))
                                            }
                                            className={cn(
                                              "mono w-28",
                                              amountMismatch && "border-warning",
                                            )}
                                          />
                                          <Button
                                            size="sm"
                                            loading={reconciling === itemId}
                                            disabled={
                                              !depositRef[itemId]?.trim() ||
                                              !Number(depositAmt[itemId])
                                            }
                                            onClick={() => setConfirmId(itemId)}
                                          >
                                            Post
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="danger-soft"
                                            onClick={() => {
                                              setRejectReason("");
                                              setRejectId(itemId);
                                            }}
                                          >
                                            Reject
                                          </Button>
                                        </div>
                                        {amountMismatch ? (
                                          <p className="text-xs text-warning">
                                            Doesn&apos;t match ₱{formatMoney(itemAmount)}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })()
                                ) : null}
                              </Td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>

              </Card>
            );
          })}
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
        open={confirmId !== null}
        title="Post this payment?"
        message={
          confirmItem
            ? `This posts ₱${formatMoney(confirmAmount)} for ${confirmBorrowerName} against deposit reference “${depositRef[confirmId ?? ""]?.trim() ?? ""}” and marks it Paid. Other items on the same DCRR are unaffected. This cannot be undone from this screen.`
            : "Post this payment to the ledger?"
        }
        confirmLabel="Yes, post / Paid"
        loading={reconciling === confirmId}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) void reconcile(confirmId);
        }}
      />

      <Modal
        open={rejectId !== null}
        title="Reject this payment?"
        onClose={() => {
          if (rejecting) return;
          setRejectId(null);
          setRejectReason("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={rejecting}
              onClick={() => {
                setRejectId(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger-soft"
              loading={rejecting}
              disabled={rejectReason.trim().length < 3}
              onClick={() => {
                if (rejectId) void reject(rejectId);
              }}
            >
              Yes, reject
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-600">
          The collector who submitted this DCRR and the affected borrower
          will be notified. This payment becomes available to re-batch onto
          a new DCRR — nothing is deleted. Other items on this DCRR are
          unaffected.
        </p>
        <Label htmlFor="rejectReason" required>
          Reason
        </Label>
        <Textarea
          id="rejectReason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="What's wrong with this payment?"
        />
      </Modal>
    </div>
  );
}
