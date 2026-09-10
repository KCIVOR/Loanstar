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
  /** Task 4 — peso amount already allocated by a pending item on another
   * unposted DCRR, and how many such DCRRs. */
  pendingElsewhere: number;
  pendingDcrCount: number;
};

/** Remaining still free on this row after posted payments AND another
 * unposted DCRR's claim. */
function installmentFreeToAllocate(row: AllocationRow): number {
  return Math.max(0, halfUp(installmentRemainingDue(row) - row.pendingElsewhere));
}

/** An overdue installment with a late fee still owed — eligible for the
 * "Late fee paid" split and the penalty waiver. `feeOwed` = charged − waived −
 * already paid (from the allocation-preview route). */
type PenaltyEligibleInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  penaltyAmount: number;
  feeOwed: number;
};

/** A not-yet-due installment — the only kind whose interest can still be
 * waived. On a remedial account this list is usually empty. */
type InterestEligibleInstallment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  interestPortion: number;
};

type AllocationModalState = {
  paymentId: string;
  paymentAmount: number;
  borrowerName: string;
  rows: AllocationRow[];
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
 * amount when Remedial manually checks a row the auto-allocation skipped. */
function installmentRemainingDue(inst: PreviewInstallment): number {
  return Math.max(
    0,
    halfUp(
      inst.amountDue - (inst.discountAmount ?? 0) + inst.penaltyAmount - inst.amountPaid,
    ),
  );
}

export default function RemedialDcrPage() {
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
  // "Late fee paid" — installment no -> peso string the remedial officer marks
  // as late-fee money on this payment. Not a waiver: no permission gate, no
  // reason. Reset every time the allocation modal opens.
  const [penaltyPaidSelections, setPenaltyPaidSelections] = useState<
    Map<number, string>
  >(new Map());

  // Penalty / interest discount (waiver) — installment no -> percent string.
  // Gated on `canDiscount`; requires a written approval note. Reset with the
  // modal.
  const [interestDiscountSelections, setInterestDiscountSelections] = useState<
    Map<number, string>
  >(new Map());
  const [penaltyDiscountSelections, setPenaltyDiscountSelections] = useState<
    Map<number, string>
  >(new Map());
  const [discountReason, setDiscountReason] = useState("");

  const { permissions } = usePermissions();
  const canDiscount =
    permissions?.fieldRules?.remedial?.collector_discount === "edit";

  const interestSelectionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [no, pctStr] of interestDiscountSelections.entries()) {
      const pct = Number(pctStr);
      if (!Number.isNaN(pct)) map.set(no, pct);
    }
    return map;
  }, [interestDiscountSelections]);

  const penaltySelectionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [no, pctStr] of penaltyDiscountSelections.entries()) {
      const pct = Number(pctStr);
      if (!Number.isNaN(pct)) map.set(no, pct);
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
        amount: inst.feeOwed,
      })),
      penaltySelectionMap,
    ).discountAmount;
  }, [allocationModal, penaltySelectionMap]);

  const hasDiscount = interestDiscountTotal > 0 || penaltyDiscountTotal > 0;
  const discountReasonMissing = hasDiscount && discountReason.trim() === "";

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

  // Every ticked "Late fee paid" installment. A ticked row left at ₱0 means
  // "all to principal, leave the fee outstanding", so ticked-with-0 counts.
  const penaltyPaidInstallmentNos = useMemo(
    () => Array.from(penaltyPaidSelections.keys()),
    [penaltyPaidSelections],
  );
  const penaltyPaidTotal = useMemo(
    () =>
      halfUp(
        Array.from(penaltyPaidSelections.values()).reduce(
          (sum, v) => sum + (Number(v) > 0 ? Number(v) : 0),
          0,
        ),
      ),
    [penaltyPaidSelections],
  );

  function togglePenaltyPaidInstallment(installmentNo: number, checked: boolean) {
    setPenaltyPaidSelections((prev) => {
      const next = new Map(prev);
      if (checked) next.set(installmentNo, "");
      else next.delete(installmentNo);
      return next;
    });
  }

  function updatePenaltyPaidAmount(installmentNo: number, amount: string) {
    setPenaltyPaidSelections((prev) => {
      const next = new Map(prev);
      next.set(installmentNo, amount);
      return next;
    });
  }

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
    setPenaltyPaidSelections(new Map());
    setInterestDiscountSelections(new Map());
    setPenaltyDiscountSelections(new Map());
    setDiscountReason("");
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
        interestEligible?: InterestEligibleInstallment[];
        penaltyEligible?: PenaltyEligibleInstallment[];
        pendingByInstallment?: Record<
          string,
          { amount: number; dcrCount: number }
        >;
      };

      const allocBySchedule = new Map(
        preview.allocation
          .filter((line) => line.amortizationScheduleId)
          .map((line) => [line.amortizationScheduleId!, line.amount]),
      );
      const pendingMap = preview.pendingByInstallment ?? {};

      const rows: AllocationRow[] = preview.installments.map((inst) => {
        const allocated = allocBySchedule.get(inst.id);
        const pending = pendingMap[inst.id];
        const pendingElsewhere = pending?.amount ?? 0;
        const base: AllocationRow = {
          ...inst,
          checked: allocated !== undefined,
          amount: allocated ?? installmentRemainingDue(inst),
          pendingElsewhere,
          pendingDcrCount: pending?.dcrCount ?? 0,
        };
        if (pendingElsewhere > 0 && installmentFreeToAllocate(base) <= 0) {
          base.checked = false;
        }
        return base;
      });

      setAllocationModal({
        paymentId,
        paymentAmount: Number(pay?.amount ?? 0),
        borrowerName: firstJoin(pay?.masterlist)?.borrower_name ?? "—",
        rows,
        interestEligible: preview.interestEligible ?? [],
        penaltyEligible: preview.penaltyEligible ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
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

    // "Late fee paid" split — sent whenever an installment is ticked (amount
    // may be ₱0 = "all to principal, leave the fee"). No permission gate.
    const penaltyPaidFields =
      penaltyPaidInstallmentNos.length > 0
        ? { penaltyPaidAmount: penaltyPaidTotal, penaltyPaidInstallmentNos }
        : {};

    if (discountReasonMissing) return;

    // Penalty / interest waiver — only sent when the permission is actually
    // held and a nonzero amount exists. The route re-checks the field rule.
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
          ...penaltyPaidFields,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not add to DCRR");
      }
      setAllocationModal(null);
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
        title="DCRR"
        description="Batch confirmed remedial payments into a daily collection report for AR."
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
            Start a DCRR draft, then add confirmed payments below. Record
            payments from an assigned account in the{" "}
            <Link href="/remedial" className="font-semibold underline">
              recovery queue
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
            description="Record a payment on an assigned account first, then return here."
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
                      <Td className="mono">{pay.reference_no ?? "—"}</Td>
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
        onClose={() => setAllocationModal(null)}
        className="!max-w-3xl"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAllocationModal(null)}
              disabled={acting}
            >
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
                      {allocationModal.rows.map((row) => {
                        const free = installmentFreeToAllocate(row);
                        const fullyClaimed =
                          row.pendingElsewhere > 0 && free <= 0;
                        return (
                          <tr
                            key={row.id}
                            className={fullyClaimed ? "opacity-55" : undefined}
                          >
                            <Td>
                              <input
                                type="checkbox"
                                checked={row.checked}
                                disabled={fullyClaimed}
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
                              {row.pendingElsewhere > 0 ? (
                                <span className="mt-0.5 block text-xs font-normal text-amber-600">
                                  ₱{formatMoney(row.pendingElsewhere)} on{" "}
                                  {row.pendingDcrCount || 1} unposted DCRR
                                  {(row.pendingDcrCount || 1) > 1 ? "s" : ""}
                                  {fullyClaimed
                                    ? " — fully covered"
                                    : ` · ₱${formatMoney(free)} free`}
                                </span>
                              ) : null}
                            </Td>
                            <Td num>
                              <div className="affix ml-auto w-36">
                                <span className="add">PHP</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={
                                    row.pendingElsewhere > 0 ? free : undefined
                                  }
                                  step="0.01"
                                  className="text-right"
                                  mono
                                  value={row.amount}
                                  disabled={!row.checked || fullyClaimed}
                                  onChange={(event) =>
                                    updateAllocationRow(row.id, {
                                      amount: Number(event.target.value),
                                    })
                                  }
                                />
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </section>
            )}

            {canDiscount ? (
              <section className="space-y-4 border-t border-line-soft pt-5">
                <div>
                  <h3 className="font-display text-base font-semibold text-navy-900">
                    Remedial discount
                  </h3>
                  <p className="mt-1 text-xs text-ink-500">
                    Only enter an amount that management has already approved
                    for this borrower. Interest can only be waived on
                    installments not yet due; penalty can only be waived on
                    installments already overdue.
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
                                      className="text-right lead"
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
                                  {formatMoney(inst.feeOwed)}
                                </Td>
                                <Td num>
                                  <div className="affix ml-auto w-24">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="1"
                                      className="text-right lead"
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
                      onChange={(event) => setDiscountReason(event.target.value)}
                      placeholder="Who approved this discount, and when"
                      rows={2}
                    />
                    {discountReasonMissing ? (
                      <p className="mt-1 text-xs text-red-600">
                        A reason is required before this discount can be added.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {allocationModal.penaltyEligible.length > 0 ? (
              <section>
                <h3 className="mb-1 font-display text-base font-semibold text-navy-900">
                  Late fee paid
                </h3>
                <p className="mb-2 text-xs text-ink-500">
                  Of this payment, how much is late-fee money on each overdue
                  month. Tick a month and leave it ₱0 to put the whole payment
                  toward principal and keep the fee outstanding. Leave a month
                  unticked to let the system split automatically (fee first).
                </p>
                <div className="tbl-wrap max-h-56 overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th className="w-10"> </Th>
                        <Th>#</Th>
                        <Th>Due date</Th>
                        <Th num>Fee owed</Th>
                        <Th num>Fee paid</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationModal.penaltyEligible.map((inst) => {
                        const checked = penaltyPaidSelections.has(
                          inst.installmentNo,
                        );
                        return (
                          <tr key={inst.id}>
                            <Td>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  togglePenaltyPaidInstallment(
                                    inst.installmentNo,
                                    event.target.checked,
                                  )
                                }
                                aria-label={`Mark late-fee paid on installment ${inst.installmentNo}`}
                              />
                            </Td>
                            <Td className="mono">{inst.installmentNo}</Td>
                            <Td className="mono">{formatDate(inst.dueDate)}</Td>
                            <Td num className="mono">
                              {formatMoney(inst.feeOwed)}
                            </Td>
                            <Td num>
                              <div className="affix ml-auto w-28">
                                <span className="add">₱</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={inst.feeOwed}
                                  step="0.01"
                                  className="text-right"
                                  mono
                                  placeholder="0 = skip fee"
                                  value={
                                    penaltyPaidSelections.get(
                                      inst.installmentNo,
                                    ) ?? ""
                                  }
                                  disabled={!checked}
                                  onChange={(event) =>
                                    updatePenaltyPaidAmount(
                                      inst.installmentNo,
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
                {penaltyPaidTotal > 0 ? (
                  <p className="mt-2 text-sm">
                    Late fee paid total:{" "}
                    <span className="mono font-semibold text-navy-900">
                      ₱{formatMoney(penaltyPaidTotal)}
                    </span>
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
