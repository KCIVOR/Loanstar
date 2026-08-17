"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { dcrItemTotal } from "@/lib/collector/desk";
import {
  dcrStatusVariant,
  firstJoin,
  formatDate,
  formatDateTime,
  formatMoney,
  isWithinRecentDays,
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
  created_at: string;
  reviewed_at?: string | null;
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

const PAGE_SIZE = 10;
const RECENT_DAYS = 30;

type RangeFilter = "recent" | "all";
type HistoryTab = "dcrs" | "payments";
type SegmentFilter = "all" | "seafarer" | "sme";
type PayStatusFilter = "all" | "confirmed" | "rejected" | "posted" | "pending_verification";
type DcrStatusFilter = "all" | "draft" | "submitted" | "reconciled" | "rejected";

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All segment" },
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

export default function CollectorHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dcrs, setDcrs] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<HistoryTab>("dcrs");
  const [range, setRange] = useState<RangeFilter>("recent");
  const [search, setSearch] = useState("");
  const [payStatus, setPayStatus] = useState<PayStatusFilter>("all");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [dcrStatus, setDcrStatus] = useState<DcrStatusFilter>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, dcrRes] = await Promise.all([
        fetch("/api/collector/payments?scope=history"),
        fetch("/api/collector/dcr?limit=100"),
      ]);
      if (!payRes.ok || !dcrRes.ok) throw new Error("Failed to load history");
      const payData = (await payRes.json()) as { payments: Payment[] };
      const dcrData = (await dcrRes.json()) as { dcrs: DcrRow[] };
      setPayments(payData.payments);
      setDcrs(dcrData.dcrs ?? []);
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
  }, [tab, range, search, payStatus, segmentFilter, dcrStatus]);

  const filteredDcrs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return dcrs.filter((dcr) => {
      if (dcrStatus !== "all" && dcr.status !== dcrStatus) return false;
      const when = dcr.submitted_at ?? dcr.created_at;
      if (range === "recent" && !isWithinRecentDays(when, RECENT_DAYS)) {
        return false;
      }
      if (!term) return true;
      return (
        dcr.id.toLowerCase().includes(term) ||
        dcr.status.toLowerCase().includes(term)
      );
    });
  }, [dcrs, dcrStatus, range, search]);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((pay) => {
      if (payStatus !== "all" && pay.status !== payStatus) return false;
      const ml = firstJoin(pay.masterlist);
      if (segmentFilter !== "all" && ml?.segment !== segmentFilter) {
        return false;
      }
      const when = pay.reviewed_at ?? pay.created_at;
      if (range === "recent" && !isWithinRecentDays(when, RECENT_DAYS)) {
        return false;
      }
      if (!term) return true;
      return (
        (pay.reference_no?.toLowerCase().includes(term) ?? false) ||
        (ml?.borrower_name.toLowerCase().includes(term) ?? false) ||
        (ml?.loan_account_no?.toLowerCase().includes(term) ?? false) ||
        pay.status.toLowerCase().includes(term)
      );
    });
  }, [payments, payStatus, segmentFilter, range, search]);

  const rows = tab === "dcrs" ? filteredDcrs : filteredPayments;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedDcrs = filteredDcrs.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const pagedPayments = filteredPayments.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  if (loading) return <Spinner />;

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
          className={cn("fchip", tab === "dcrs" && "on")}
          onClick={() => setTab("dcrs")}
        >
          DCRRs
        </button>
        <button
          type="button"
          className={cn("fchip", tab === "payments" && "on")}
          onClick={() => setTab("payments")}
        >
          Payments
        </button>
        <span className="mx-1 self-center text-ink-300">|</span>
        <button
          type="button"
          className={cn("fchip", range === "recent" && "on")}
          onClick={() => setRange("recent")}
        >
          Recent (30d)
        </button>
        <button
          type="button"
          className={cn("fchip", range === "all" && "on")}
          onClick={() => setRange("all")}
        >
          All
        </button>
      </div>

      <div className="tbl-toolbar mb-3.5">
        <div className="gsearch" style={{ maxWidth: 280 }}>
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
              height: 36,
              paddingRight: 12,
              borderRadius: "var(--r-md)",
            }}
            placeholder={
              tab === "dcrs"
                ? "Search DCRR id or status"
                : "Search ref, borrower, status"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tab === "dcrs"
            ? (
                [
                  ["all", "All status"],
                  ["draft", "Draft"],
                  ["submitted", "Submitted"],
                  ["reconciled", "Reconciled"],
                  ["rejected", "Rejected"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn("fchip", dcrStatus === value && "on")}
                  onClick={() => setDcrStatus(value)}
                >
                  {label}
                </button>
              ))
            : (
                <>
                  {(
                    [
                      ["all", "All status"],
                      ["pending_verification", "Pending"],
                      ["confirmed", "Confirmed"],
                      ["posted", "Posted"],
                      ["rejected", "Rejected"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={cn("fchip", payStatus === value && "on")}
                      onClick={() => setPayStatus(value)}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="mx-1 self-center text-ink-300">|</span>
                  {SEGMENT_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={cn("fchip", segmentFilter === chip.id && "on")}
                      onClick={() => setSegmentFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </>
              )}
        </div>
      </div>

      {tab === "dcrs" ? (
        filteredDcrs.length === 0 ? (
          <EmptyState
            title="No DCRR history"
            description="Submitted and reconciled DCRRs will appear here."
            showMark={false}
          />
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="tbl-wrap">
              <Table>
                <thead>
                  <tr>
                    <Th>DCRR</Th>
                    <Th>Status</Th>
                    <Th num>Items</Th>
                    <Th num>Total</Th>
                    <Th>Created</Th>
                    <Th>Submitted</Th>
                    <Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDcrs.map((dcr) => {
                    const items = dcr.dcr_items ?? [];
                    return (
                      <tr key={dcr.id}>
                        <Td className="mono text-xs">{dcr.id.slice(0, 8)}…</Td>
                        <Td>
                          <Badge variant={dcrStatusVariant(dcr.status)}>
                            {dcr.status}
                          </Badge>
                        </Td>
                        <Td num className="mono">
                          {items.length}
                        </Td>
                        <Td num className="mono text-teal-600">
                          {formatMoney(dcrItemTotal(items))}
                        </Td>
                        <Td className="mono text-sm">
                          {formatDateTime(dcr.created_at)}
                        </Td>
                        <Td className="mono text-sm">
                          {dcr.submitted_at
                            ? formatDateTime(dcr.submitted_at)
                            : "—"}
                        </Td>
                        <Td className="max-w-[260px] text-sm">
                          {dcr.status === "rejected" && dcr.notes
                            ? dcr.notes
                            : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            {filteredDcrs.length > PAGE_SIZE ? (
              <Pagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            ) : null}
          </div>
        )
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          title="No payment history"
          description="Proofs for your assigned accounts will appear here."
          showMark={false}
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Borrower</Th>
                  <Th>Segment</Th>
                  <Th>Reference</Th>
                  <Th>Date</Th>
                  <Th num>Amount</Th>
                  <Th>Status</Th>
                  <Th>Recorded</Th>
                </tr>
              </thead>
              <tbody>
                {pagedPayments.map((pay) => {
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
                      <Td>{segmentBadge(ml?.segment)}</Td>
                      <Td className="mono">{pay.reference_no ?? "—"}</Td>
                      <Td className="mono">{formatDate(pay.payment_date)}</Td>
                      <Td num className="mono text-teal-600">
                        {formatMoney(Number(pay.amount))}
                      </Td>
                      <Td>
                        <Badge variant={paymentStatusVariant(pay.status)}>
                          {pay.status.replaceAll("_", " ")}
                        </Badge>
                      </Td>
                      <Td className="mono text-sm">
                        {formatDateTime(pay.created_at)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          {filteredPayments.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
