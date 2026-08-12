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
import {
  firstJoin,
  formatDate,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";
import {
  PROOF_LIST_PAGE_SIZES,
  clampProofListPageSize,
  computeProofListKpis,
  passesProofStatusFilter,
  proofSearchPredicate,
  proofStatusFilterSpec,
  sortProofsByDate,
  type ProofQueueItem,
  type ProofStatusFilter,
} from "@/lib/collector/proofs";

const PAGE_SIZE_OPTIONS = PROOF_LIST_PAGE_SIZES;

const STATUS_CHIPS: Array<{ id: ProofStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending_verification", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
];

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconFile = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);

const IconCheck = (
  <svg {...iconProps}>
    <path d="M20 6 9 17l-5-5" />
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

function statusChipLabel(filter: ProofStatusFilter): string {
  return STATUS_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export default function CollectorProofsPage() {
  const [payments, setPayments] = useState<ProofQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProofStatusFilter>("all");
  const [dateSortDir, setDateSortDir] = useState<"asc" | "desc" | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/collector/payments?scope=desk");
      if (!res.ok) throw new Error("Failed to load proofs");
      const data = (await res.json()) as { payments: ProofQueueItem[] };
      setPayments(data.payments);
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
  }, [search, statusFilter, pageSize, dateSortDir]);

  async function viewProof(id: string) {
    setError(null);
    setViewingId(id);
    try {
      const res = await fetch(`/api/collector/payments/${id}/download`);
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

  async function reviewPayment(id: string, status: "confirmed" | "rejected") {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/collector/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Review failed");
      }
      setRejectId(null);
      setMessage(
        status === "confirmed" ? "Payment confirmed." : "Payment rejected.",
      );
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  function toggleDateSort() {
    setDateSortDir((prev) => {
      if (prev === null) return "desc";
      return prev === "asc" ? "desc" : "asc";
    });
  }

  function setStatus(raw: string) {
    setStatusFilter(proofStatusFilterSpec(raw));
  }

  const kpi = useMemo(() => computeProofListKpis(payments), [payments]);
  const kpiTotal = kpi.pendingReview + kpi.confirmedAwaitingDcr;

  const filtered = useMemo(() => {
    const searched = payments.filter((pay) =>
      proofSearchPredicate(pay, search),
    );
    const statused = searched.filter((pay) =>
      passesProofStatusFilter(pay.status, statusFilter),
    );
    return dateSortDir === null
      ? statused
      : sortProofsByDate(statused, dateSortDir);
  }, [payments, search, statusFilter, dateSortDir]);

  const safePageSize = clampProofListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;

  const activeFilterCount = statusFilter !== "all" ? 1 : 0;

  function renderActions(pay: ProofQueueItem) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {pay.status === "pending_verification" ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={acting}
              onClick={() => void reviewPayment(pay.id, "confirmed")}
            >
              Confirm
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              loading={acting}
              onClick={() => setRejectId(pay.id)}
            >
              Reject
            </Button>
          </>
        ) : pay.status === "confirmed" ? (
          <Link href="/collector/dcr" className="btn btn-secondary btn-sm">
            Add via DCR
          </Link>
        ) : null}
        {pay.storage_path ? (
          <Button
            variant="secondary"
            size="sm"
            loading={viewingId === pay.id}
            onClick={() => void viewProof(pay.id)}
          >
            View
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Payment proofs"
        description="Confirm or reject borrower payment uploads. Batch confirmed proofs on the DCR page."
        actions={
          <Link href="/collector/dcr" className="btn btn-secondary">
            Go to DCR
          </Link>
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

      <div className="kpi-grid mb-4">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi
              tone="warning"
              icon={IconFile}
              label="Pending review"
              value={kpi.pendingReview}
            />
            <Kpi
              tone="navy"
              icon={IconCheck}
              label="Confirmed, awaiting DCR"
              value={kpi.confirmedAwaitingDcr}
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
              placeholder="Search ref, borrower, account"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

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
                <Th>Borrower</Th>
                <Th>Reference</Th>
                <Th>Date</Th>
                <Th num>Amount</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
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
          title="No proofs to review"
          description="Pending and confirmed (not yet submitted) proofs appear here."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching proofs"
          description="Try a different search term or status filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((pay) => {
            const ml = firstJoin(pay.masterlist);
            return (
              <div key={pay.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">{pay.reference_no ?? "—"}</span>
                  <Badge variant={paymentStatusVariant(pay.status)}>
                    {statusLabel(pay.status)}
                  </Badge>
                </div>
                <div className="gcard-name">{ml?.borrower_name ?? "—"}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Account</span>
                    <span className="v mono">{ml?.loan_account_no ?? "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Date</span>
                    <span className="v mono">{formatDate(pay.payment_date)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Amount</span>
                    <span className="v mono text-teal-600">
                      {formatMoney(Number(pay.amount))}
                    </span>
                  </div>
                </div>
                {renderActions(pay)}
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
                <Th>Reference</Th>
                <Th className="sortable" onClick={toggleDateSort}>
                  Date
                  {dateSortDir ? (
                    <span className="arr">
                      {dateSortDir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </Th>
                <Th num>Amount</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pay) => {
                const ml = firstJoin(pay.masterlist);
                return (
                  <tr key={pay.id}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {ml?.borrower_name ?? "—"}
                      </div>
                      <div className="mono text-xs text-ink-500">
                        {ml?.loan_account_no ?? "—"}
                      </div>
                    </Td>
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
                    <Td>{renderActions(pay)}</Td>
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
        open={rejectId !== null}
        title="Reject payment proof?"
        message="The borrower proof will be marked rejected."
        confirmLabel="Reject"
        variant="danger"
        loading={acting}
        onConfirm={() => {
          if (rejectId) void reviewPayment(rejectId, "rejected");
        }}
        onCancel={() => setRejectId(null)}
      />
    </div>
  );
}
