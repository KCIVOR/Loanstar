"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  cn,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { dcrItemTotal } from "@/lib/collector/desk";
import {
  firstJoin,
  formatDate,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";
import { computeCollectorDiscount } from "@/lib/computation/collector-discount";
import { halfUp } from "@/lib/computation/money";
import { usePermissions } from "@/hooks/usePermissions";

type SegmentFilter = "all" | "seafarer" | "sme" | "individual";

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
  notes?: string | null;
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
  dcr_items: DcrItem[] | null;
};

type PreviewInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  penaltyAmount: number;
  /** Origination or early-settlement discount on this installment, if any. */
  discountAmount?: number;
  amountPaid: number;
  status: string;
};

type AllocationRow = PreviewInstallment & {
  checked: boolean;
  amount: number;
};

/** Collector Discount (feature-collector-discount-implementation-plan.md,
 * Phase 4) — an installment not yet due, eligible for an interest waiver.
 * interestPortion is derived server-side (Phase 2), never here. */
type InterestEligibleInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  interestPortion: number;
};

/** An overdue installment carrying a penalty, eligible for a penalty
 * waiver. */
type PenaltyEligibleInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  penaltyAmount: number;
};

type AllocationModalState = {
  paymentId: string;
  paymentAmount: number;
  borrowerName: string;
  rows: AllocationRow[];
  /** Fixes Plan Phase 3 — this payment is a Move of Payment surcharge;
   * defaulted to fully-unapplied so it does not pay down an installment. */
  isSurcharge: boolean;
  interestEligible: InterestEligibleInstallment[];
  penaltyEligible: PenaltyEligibleInstallment[];
};

const SEGMENT_CHIPS: Array<{ id: SegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
  { id: "individual", label: "Individual" },
];

function segmentBadge(segment: string | null | undefined) {
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

/** Net of any active discount — what's really still owed (fixed 2026-08-31,
 * see docs/payment-flow-discount-audit-and-fix-plan.md). This client-side
 * copy existed independently of the server's netInstallmentDue() and had
 * gone stale — used both for the "Amount Due" display and as the fallback
 * amount when a Collector manually checks a row the auto-allocation skipped. */
function installmentRemainingDue(inst: PreviewInstallment): number {
  return Math.max(
    0,
    halfUp(
      inst.amountDue - (inst.discountAmount ?? 0) + inst.penaltyAmount - inst.amountPaid,
    ),
  );
}

export default function CollectorDcrPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [draftPaymentIds, setDraftPaymentIds] = useState<string[]>([]);
  const [dcrs, setDcrs] = useState<DcrRow[]>([]);
  const [draftDcrId, setDraftDcrId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [allocationModal, setAllocationModal] =
    useState<AllocationModalState | null>(null);

  // Collector Discount (Phase 4) — installment number -> percent string,
  // reset every time the allocation modal opens/closes. Gated below on
  // `canDiscount`; kept independent of each other per Rule 1 (a single
  // settlement may waive both interest and penalty at once).
  const [interestDiscountSelections, setInterestDiscountSelections] =
    useState<Map<number, string>>(new Map());
  const [penaltyDiscountSelections, setPenaltyDiscountSelections] =
    useState<Map<number, string>>(new Map());
  const [discountReason, setDiscountReason] = useState("");

  const { permissions } = usePermissions();
  const canDiscount =
    permissions?.fieldRules?.collection?.collector_discount === "edit";

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [payRes, dcrRes] = await Promise.all([
        fetch("/api/collector/payments?scope=dcr"),
        fetch("/api/collector/dcr?limit=100"),
      ]);
      if (!payRes.ok) throw new Error("Failed to load payments");
      const payData = (await payRes.json()) as {
        payments: Payment[];
        draftPaymentIds?: string[];
      };
      setPayments(payData.payments);
      setDraftPaymentIds(payData.draftPaymentIds ?? []);

      if (dcrRes.ok) {
        const dcrData = (await dcrRes.json()) as { dcrs: DcrRow[] };
        const list = dcrData.dcrs ?? [];
        setDcrs(list);
        const draft = list.find((d) => d.status === "draft");
        if (draft) {
          setDraftDcrId(draft.id);
          setDraftPaymentIds(
            (draft.dcr_items ?? []).map((item) => item.payment_id),
          );
        } else if (!opts?.silent) {
          setDraftDcrId(null);
        }
      }
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

  const activeDraft = useMemo(
    () => dcrs.find((d) => d.id === draftDcrId && d.status === "draft") ?? null,
    [dcrs, draftDcrId],
  );
  const draftItems = activeDraft?.dcr_items ?? [];
  const draftTotal = dcrItemTotal(draftItems);
  const inDraft = useMemo(
    () => new Set(draftPaymentIds),
    [draftPaymentIds],
  );

  const allocationCheckedTotal = useMemo(() => {
    if (!allocationModal) return 0;
    return halfUp(
      allocationModal.rows
        .filter((row) => row.checked)
        .reduce((sum, row) => sum + row.amount, 0),
    );
  }, [allocationModal]);

  const allocationLeftover = useMemo(() => {
    if (!allocationModal) return 0;
    return halfUp(allocationModal.paymentAmount - allocationCheckedTotal);
  }, [allocationModal, allocationCheckedTotal]);

  const allocationMismatch = allocationLeftover < 0;

  // Collector Discount (Phase 4) — live, client-side totals using Phase 3's
  // math, same UX pattern as the existing Offset discount modal in
  // ComputationPanel.tsx. Purely for display here; nothing is applied to a
  // balance until Phase 5's posting logic runs.
  const interestSelectionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [no, pctStr] of interestDiscountSelections.entries()) {
      const pct = Number(pctStr);
      if (!isNaN(pct)) map.set(no, pct);
    }
    return map;
  }, [interestDiscountSelections]);

  const penaltySelectionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [no, pctStr] of penaltyDiscountSelections.entries()) {
      const pct = Number(pctStr);
      if (!isNaN(pct)) map.set(no, pct);
    }
    return map;
  }, [penaltyDiscountSelections]);

  const interestDiscountTotal = useMemo(() => {
    if (!allocationModal) return 0;
    return computeCollectorDiscount(
      allocationModal.interestEligible.map((inst) => ({
        installmentNo: inst.installmentNo,
        amount: inst.interestPortion,
      })),
      interestSelectionMap,
    ).discountAmount;
  }, [allocationModal, interestSelectionMap]);

  const penaltyDiscountTotal = useMemo(() => {
    if (!allocationModal) return 0;
    return computeCollectorDiscount(
      allocationModal.penaltyEligible.map((inst) => ({
        installmentNo: inst.installmentNo,
        amount: inst.penaltyAmount,
      })),
      penaltySelectionMap,
    ).discountAmount;
  }, [allocationModal, penaltySelectionMap]);

  const hasDiscount = interestDiscountTotal > 0 || penaltyDiscountTotal > 0;
  const discountReasonMissing = hasDiscount && discountReason.trim() === "";

  async function startDcr() {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const existing = dcrs.find((d) => d.status === "draft");
      if (existing) {
        setDraftDcrId(existing.id);
        setDraftPaymentIds(
          (existing.dcr_items ?? []).map((item) => item.payment_id),
        );
        setMessage("Resumed open DCRR draft.");
        return;
      }
      const res = await fetch("/api/collector/dcr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to create DCRR");
      }
      const data = (await res.json()) as { dcrId: string };
      setDraftDcrId(data.dcrId);
      setDraftPaymentIds([]);
      setMessage("DCRR draft created.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function openAllocationModal(paymentId: string) {
    if (!draftDcrId) return;
    setActing(true);
    setError(null);
    try {
      const pay = payments.find((p) => p.id === paymentId);
      const previewRes = await fetch(
        `/api/collector/dcr/allocation-preview?paymentId=${encodeURIComponent(paymentId)}`,
      );
      if (!previewRes.ok) {
        const body = (await previewRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not load allocation preview");
      }
      const preview = (await previewRes.json()) as {
        installments: PreviewInstallment[];
        allocation: {
          amortizationScheduleId: string | null;
          amount: number;
        }[];
        isSurcharge?: boolean;
        interestEligible?: InterestEligibleInstallment[];
        penaltyEligible?: PenaltyEligibleInstallment[];
      };

      const allocBySchedule = new Map(
        preview.allocation
          .filter((line) => line.amortizationScheduleId)
          .map((line) => [line.amortizationScheduleId!, line.amount]),
      );

      const rows: AllocationRow[] = preview.installments.map((inst) => {
        const allocated = allocBySchedule.get(inst.id);
        return {
          ...inst,
          checked: allocated !== undefined,
          amount: allocated ?? installmentRemainingDue(inst),
        };
      });

      setInterestDiscountSelections(new Map());
      setPenaltyDiscountSelections(new Map());
      setDiscountReason("");

      setAllocationModal({
        paymentId,
        paymentAmount: Number(pay?.amount ?? 0),
        borrowerName: firstJoin(pay?.masterlist)?.borrower_name ?? "—",
        rows,
        isSurcharge: Boolean(preview.isSurcharge),
        interestEligible: preview.interestEligible ?? [],
        penaltyEligible: preview.penaltyEligible ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  function closeAllocationModal() {
    setAllocationModal(null);
    setInterestDiscountSelections(new Map());
    setPenaltyDiscountSelections(new Map());
    setDiscountReason("");
  }

  function toggleDiscountInstallment(
    kind: "interest" | "penalty",
    installmentNo: number,
    checked: boolean,
  ) {
    const setter =
      kind === "interest"
        ? setInterestDiscountSelections
        : setPenaltyDiscountSelections;
    setter((prev) => {
      const next = new Map(prev);
      if (checked) next.set(installmentNo, "100");
      else next.delete(installmentNo);
      return next;
    });
  }

  function updateDiscountPercent(
    kind: "interest" | "penalty",
    installmentNo: number,
    percent: string,
  ) {
    const setter =
      kind === "interest"
        ? setInterestDiscountSelections
        : setPenaltyDiscountSelections;
    setter((prev) => {
      const next = new Map(prev);
      next.set(installmentNo, percent);
      return next;
    });
  }

  function updateAllocationRow(
    scheduleId: string,
    patch: Partial<Pick<AllocationRow, "checked" | "amount">>,
  ) {
    setAllocationModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.id !== scheduleId) return row;
          const next = { ...row, ...patch };
          if (patch.checked === true && patch.amount === undefined) {
            // Cap at what's left of the payment after other checked rows —
            // not the full amount due — so re-checking a row after
            // unchecking it reproduces the same auto-allocation split
            // instead of over-applying past the payment amount.
            const othersTotal = prev.rows
              .filter((r) => r.id !== scheduleId && r.checked)
              .reduce((sum, r) => sum + r.amount, 0);
            const available = halfUp(prev.paymentAmount - othersTotal);
            next.amount = Math.max(
              0,
              Math.min(installmentRemainingDue(row), available),
            );
          }
          return next;
        }),
      };
    });
  }

  async function confirmAddToDcr() {
    if (!draftDcrId || !allocationModal) return;

    const checkedRows = allocationModal.rows.filter((row) => row.checked);
    const checkedTotal = halfUp(
      checkedRows.reduce((sum, row) => sum + row.amount, 0),
    );
    const leftover = halfUp(allocationModal.paymentAmount - checkedTotal);
    if (leftover < 0) return;

    const allocations: {
      amortizationScheduleId: string | null;
      amount: number;
    }[] = checkedRows.map((row) => ({
      amortizationScheduleId: row.id,
      amount: halfUp(row.amount),
    }));
    if (leftover > 0) {
      allocations.push({
        amortizationScheduleId: null,
        amount: leftover,
      });
    }

    if (discountReasonMissing) return;

    // Collector Discount (Phase 4) — collected and sent here; nothing in
    // this phase applies it to a balance (Phase 5's job). Only included
    // when the permission is actually held and a nonzero amount exists,
    // so an ungated user's request looks identical to today's payload.
    const discountFields =
      canDiscount && hasDiscount
        ? {
            interestDiscountAmount: interestDiscountTotal,
            interestDiscountedInstallmentNos: Array.from(
              interestSelectionMap.keys(),
            ),
            penaltyDiscountAmount: penaltyDiscountTotal,
            penaltyDiscountedInstallmentNos: Array.from(
              penaltySelectionMap.keys(),
            ),
            discountReason: discountReason.trim(),
          }
        : {};

    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/collector/dcr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          dcrId: draftDcrId,
          paymentId: allocationModal.paymentId,
          allocations,
          ...discountFields,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not add to DCRR");
      }
      closeAllocationModal();
      setMessage("Payment added to DCRR.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function submitDcr() {
    if (!draftDcrId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/collector/dcr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", dcrId: draftDcrId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Submit failed");
      }
      setConfirmSubmit(false);
      setDraftDcrId(null);
      setDraftPaymentIds([]);
      setMessage("DCRR submitted to AR.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <Spinner />;

  const filteredPayments =
    segmentFilter === "all"
      ? payments
      : payments.filter(
          (p) => firstJoin(p.masterlist)?.segment === segmentFilter,
        );
  const filteredDraftItems =
    segmentFilter === "all"
      ? draftItems
      : draftItems.filter((item) => {
          const pay = payments.find((p) => p.id === item.payment_id);
          return firstJoin(pay?.masterlist)?.segment === segmentFilter;
        });
  const available = filteredPayments.filter((p) => !inDraft.has(p.id));

  return (
    <div>
      <PageHeader
        title="DCRR builder"
        description="Batch confirmed payments into a daily collection report for AR."
        actions={
          <div className="flex gap-2">
            <Link href="/collector/dcr/history" className="btn btn-secondary">
              DCRR history
            </Link>
            {draftDcrId ? (
              <Button
                loading={acting}
                onClick={() => setConfirmSubmit(true)}
                disabled={draftItems.length === 0}
              >
                Submit DCRR
              </Button>
            ) : (
              <Button loading={acting} onClick={() => void startDcr()}>
                New DCRR
              </Button>
            )}
          </div>
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

      {draftDcrId ? (
        <div className="mb-6">
          <Alert variant="info">
            Draft{" "}
            <span className="mono font-semibold">{draftDcrId.slice(0, 8)}</span>
            {" — "}
            <span className="mono font-semibold">{draftItems.length}</span> item
            {draftItems.length === 1 ? "" : "s"}
            {" · "}
            <span className="mono font-semibold">
              ₱{formatMoney(draftTotal)}
            </span>
          </Alert>
        </div>
      ) : (
        <div className="mb-6">
          <Alert variant="info">
            Start a DCRR draft, then add confirmed payments below. Confirm new
            proofs on{" "}
            <Link href="/collector/proofs" className="font-semibold underline">
              Payment proofs
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="filter-group-label">Segment</span>
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

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          Draft line items
        </h2>
        {!draftDcrId || draftItems.length === 0 ? (
          <EmptyState
            title={draftDcrId ? "Draft is empty" : "No open draft"}
            description={
              draftDcrId
                ? "Add confirmed payments from the list below."
                : "Create a New DCRR to begin batching."
            }
            showMark={false}
          />
        ) : filteredDraftItems.length === 0 ? (
          <EmptyState
            title="No matching draft items"
            description="Try a different segment filter."
            showMark={false}
          />
        ) : (
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Payment</Th>
                  <Th>Segment</Th>
                  <Th num>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDraftItems.map((item) => {
                  const pay = payments.find((p) => p.id === item.payment_id);
                  const ml = pay ? firstJoin(pay.masterlist) : null;
                  return (
                    <tr key={item.id}>
                      <Td>
                        <div className="font-medium text-ink-900">
                          {ml?.borrower_name ?? "Payment"}
                        </div>
                        <div className="mono text-xs text-ink-500">
                          {pay?.reference_no ?? item.payment_id.slice(0, 8)}
                        </div>
                      </Td>
                      <Td>{segmentBadge(ml?.segment)}</Td>
                      <Td num className="mono text-teal-600">
                        {formatMoney(Number(item.amount))}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          Confirmed payments
        </h2>
        {payments.length === 0 ? (
          <EmptyState
            title="Nothing ready to batch"
            description="Confirm payment proofs first, then return here."
            showMark={false}
          />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            title="No matching payments"
            description="Try a different segment filter."
            showMark={false}
          />
        ) : (
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
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((pay) => {
                  const ml = firstJoin(pay.masterlist);
                  const already = inDraft.has(pay.id);
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
                      <Td className="mono">
                        {pay.reference_no ?? "—"}
                        {pay.notes ? (
                          <div className="mt-1 whitespace-normal text-xs font-normal text-ink-500">
                            {pay.notes}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="mono">{formatDate(pay.payment_date)}</Td>
                      <Td num className="mono text-teal-600">
                        {formatMoney(Number(pay.amount))}
                      </Td>
                      <Td>
                        <Badge variant={paymentStatusVariant(pay.status)}>
                          {pay.status.replaceAll("_", " ")}
                        </Badge>
                        {already ? (
                          <Badge variant="success" className="ml-1.5">
                            In DCRR
                          </Badge>
                        ) : null}
                      </Td>
                      <Td>
                        {draftDcrId && !already ? (
                          <Button
                            size="sm"
                            loading={acting}
                            onClick={() => void openAllocationModal(pay.id)}
                          >
                            Add to DCRR
                          </Button>
                        ) : already ? (
                          <span className="text-xs text-ink-400">Added</span>
                        ) : (
                          <span className="text-xs text-ink-400">
                            Start draft first
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
        {draftDcrId && available.length === 0 && filteredPayments.length > 0 ? (
          <p className="mt-3 text-sm text-ink-500">
            All confirmed payments are already on this draft.
          </p>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit DCRR to AR?"
        message={`Submit ${draftItems.length} payment${draftItems.length === 1 ? "" : "s"} totaling ₱${formatMoney(draftTotal)} for reconciliation.`}
        confirmLabel="Submit DCRR"
        loading={acting}
        onConfirm={() => void submitDcr()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <Modal
        open={allocationModal !== null}
        title={
          allocationModal
            ? `Allocate payment — ${allocationModal.borrowerName}`
            : "Allocate payment to installments"
        }
        onClose={closeAllocationModal}
        className="!max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={closeAllocationModal} disabled={acting}>
              Cancel
            </Button>
            <Button
              onClick={() => void confirmAddToDcr()}
              loading={acting}
              disabled={allocationMismatch || discountReasonMissing}
            >
              Add to DCRR
            </Button>
          </>
        }
      >
        {allocationModal ? (
          <div className="space-y-5">
            {allocationModal.isSurcharge ? (
              <Alert variant="info">
                This is a <strong>Move of Payment surcharge</strong>. It has been left
                unallocated so it does not pay down an installment — the borrower still owes the
                same amount. Only change this if you know it should be applied to a specific
                installment.
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Payment amount
                </p>
                <p className="mono mt-1 text-lg font-semibold text-navy-900">
                  ₱{formatMoney(allocationModal.paymentAmount)}
                </p>
              </div>
              <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Checked total
                </p>
                <p
                  className={`mono mt-1 text-lg font-semibold ${allocationMismatch ? "text-red-600" : "text-navy-900"}`}
                >
                  ₱{formatMoney(allocationCheckedTotal)}
                </p>
              </div>
              <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {allocationLeftover >= 0 ? "Advance (leftover)" : "Over-applied"}
                </p>
                <p
                  className={`mono mt-1 text-lg font-semibold ${allocationMismatch ? "text-red-600" : "text-navy-900"}`}
                >
                  ₱{formatMoney(Math.abs(allocationLeftover))}
                </p>
              </div>
            </div>

            {allocationMismatch ? (
              <Alert variant="danger">
                Checked amounts exceed the payment by ₱
                {formatMoney(Math.abs(allocationLeftover))}. Reduce applied
                amounts before confirming.
              </Alert>
            ) : null}

            {allocationModal.rows.length === 0 ? (
              <p className="text-sm text-ink-500">
                No open installments — the full amount will be recorded as an
                advance.
              </p>
            ) : (
              <section>
                <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
                  Open installments
                </h3>
                <div className="tbl-wrap max-h-96 overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th className="w-10"> </Th>
                        <Th>#</Th>
                        <Th>Due date</Th>
                        <Th num>Amount due</Th>
                        <Th num>Apply</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationModal.rows.map((row) => (
                        <tr key={row.id}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={(event) =>
                                updateAllocationRow(row.id, {
                                  checked: event.target.checked,
                                })
                              }
                              aria-label={`Apply to installment ${row.installmentNo}`}
                            />
                          </Td>
                          <Td className="mono">{row.installmentNo}</Td>
                          <Td className="mono">{formatDate(row.dueDate)}</Td>
                          <Td num className="mono">
                            {formatMoney(installmentRemainingDue(row))}
                          </Td>
                          <Td num>
                            <div className="affix ml-auto w-36">
                              <span className="add">PHP</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="text-right"
                                mono
                                value={row.amount}
                                disabled={!row.checked}
                                onChange={(event) =>
                                  updateAllocationRow(row.id, {
                                    amount: Number(event.target.value),
                                  })
                                }
                              />
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </section>
            )}

            {canDiscount ? (
              <section className="space-y-4 border-t border-line-soft pt-5">
                <div>
                  <h3 className="font-display text-base font-semibold text-navy-900">
                    Collector discount
                  </h3>
                  <p className="mt-1 text-xs text-ink-500">
                    Only enter an amount that management has already
                    approved for this borrower. Interest can only be
                    waived on installments not yet due; penalty can only
                    be waived on installments already overdue.
                  </p>
                </div>

                {allocationModal.interestEligible.length > 0 ? (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-ink-700">
                      Interest discount
                    </h4>
                    <div className="tbl-wrap max-h-56 overflow-y-auto">
                      <Table>
                        <thead>
                          <tr>
                            <Th className="w-10"> </Th>
                            <Th>#</Th>
                            <Th>Due date</Th>
                            <Th num>Interest</Th>
                            <Th num>Percent</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocationModal.interestEligible.map((inst) => {
                            const checked = interestDiscountSelections.has(
                              inst.installmentNo,
                            );
                            return (
                              <tr key={inst.id}>
                                <Td>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      toggleDiscountInstallment(
                                        "interest",
                                        inst.installmentNo,
                                        event.target.checked,
                                      )
                                    }
                                    aria-label={`Discount interest on installment ${inst.installmentNo}`}
                                  />
                                </Td>
                                <Td className="mono">{inst.installmentNo}</Td>
                                <Td className="mono">
                                  {formatDate(inst.dueDate)}
                                </Td>
                                <Td num className="mono">
                                  {formatMoney(inst.interestPortion)}
                                </Td>
                                <Td num>
                                  <div className="affix ml-auto w-24">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="1"
                                      className="text-right"
                                      mono
                                      value={
                                        interestDiscountSelections.get(
                                          inst.installmentNo,
                                        ) ?? ""
                                      }
                                      disabled={!checked}
                                      onChange={(event) =>
                                        updateDiscountPercent(
                                          "interest",
                                          inst.installmentNo,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span className="add">%</span>
                                  </div>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                    <p className="mt-2 text-sm">
                      Interest discount total:{" "}
                      <span className="mono font-semibold text-navy-900">
                        ₱{formatMoney(interestDiscountTotal)}
                      </span>
                    </p>
                  </div>
                ) : null}

                {allocationModal.penaltyEligible.length > 0 ? (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-ink-700">
                      Penalty discount
                    </h4>
                    <div className="tbl-wrap max-h-56 overflow-y-auto">
                      <Table>
                        <thead>
                          <tr>
                            <Th className="w-10"> </Th>
                            <Th>#</Th>
                            <Th>Due date</Th>
                            <Th num>Penalty</Th>
                            <Th num>Percent</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocationModal.penaltyEligible.map((inst) => {
                            const checked = penaltyDiscountSelections.has(
                              inst.installmentNo,
                            );
                            return (
                              <tr key={inst.id}>
                                <Td>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      toggleDiscountInstallment(
                                        "penalty",
                                        inst.installmentNo,
                                        event.target.checked,
                                      )
                                    }
                                    aria-label={`Discount penalty on installment ${inst.installmentNo}`}
                                  />
                                </Td>
                                <Td className="mono">{inst.installmentNo}</Td>
                                <Td className="mono">
                                  {formatDate(inst.dueDate)}
                                </Td>
                                <Td num className="mono">
                                  {formatMoney(inst.penaltyAmount)}
                                </Td>
                                <Td num>
                                  <div className="affix ml-auto w-24">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="1"
                                      className="text-right"
                                      mono
                                      value={
                                        penaltyDiscountSelections.get(
                                          inst.installmentNo,
                                        ) ?? ""
                                      }
                                      disabled={!checked}
                                      onChange={(event) =>
                                        updateDiscountPercent(
                                          "penalty",
                                          inst.installmentNo,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span className="add">%</span>
                                  </div>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                    <p className="mt-2 text-sm">
                      Penalty discount total:{" "}
                      <span className="mono font-semibold text-navy-900">
                        ₱{formatMoney(penaltyDiscountTotal)}
                      </span>
                    </p>
                  </div>
                ) : null}

                {hasDiscount ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-700">
                      Approval note <span className="text-red-600">*</span>
                    </label>
                    <Textarea
                      value={discountReason}
                      onChange={(event) =>
                        setDiscountReason(event.target.value)
                      }
                      placeholder="Who approved this discount, and when — e.g. &quot;Approved by Sir Rene, 09/03, per phone call&quot;"
                      rows={2}
                    />
                    {discountReasonMissing ? (
                      <p className="mt-1 text-xs text-red-600">
                        A reason is required before this discount can be
                        added.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
