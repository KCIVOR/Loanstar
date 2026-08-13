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
  Th,
} from "@/components/ui";
import { dcrItemTotal } from "@/lib/collector/desk";
import {
  firstJoin,
  formatDate,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";
import { halfUp } from "@/lib/computation/money";

type SegmentFilter = "all" | "seafarer" | "sme";

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
  amountPaid: number;
  status: string;
};

type AllocationRow = PreviewInstallment & {
  checked: boolean;
  amount: number;
};

type AllocationModalState = {
  paymentId: string;
  paymentAmount: number;
  borrowerName: string;
  rows: AllocationRow[];
};

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

function installmentRemainingDue(inst: PreviewInstallment): number {
  return halfUp(
    inst.amountDue + inst.penaltyAmount - inst.amountPaid,
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
        setMessage("Resumed open DCR draft.");
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
        throw new Error(body?.error ?? "Failed to create DCR");
      }
      const data = (await res.json()) as { dcrId: string };
      setDraftDcrId(data.dcrId);
      setDraftPaymentIds([]);
      setMessage("DCR draft created.");
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

      setAllocationModal({
        paymentId,
        paymentAmount: Number(pay?.amount ?? 0),
        borrowerName: firstJoin(pay?.masterlist)?.borrower_name ?? "—",
        rows,
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
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not add to DCR");
      }
      setAllocationModal(null);
      setMessage("Payment added to DCR.");
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
      setMessage("DCR submitted to AR.");
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
        title="DCR builder"
        description="Batch confirmed payments into a daily collection report for AR."
        actions={
          <div className="flex gap-2">
            <Link href="/collector/dcr/history" className="btn btn-secondary">
              DCR history
            </Link>
            {draftDcrId ? (
              <Button
                loading={acting}
                onClick={() => setConfirmSubmit(true)}
                disabled={draftItems.length === 0}
              >
                Submit DCR
              </Button>
            ) : (
              <Button loading={acting} onClick={() => void startDcr()}>
                New DCR
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
            Start a DCR draft, then add confirmed payments below. Confirm new
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
                : "Create a New DCR to begin batching."
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
                            In DCR
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
                            Add to DCR
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
        title="Submit DCR to AR?"
        message={`Submit ${draftItems.length} payment${draftItems.length === 1 ? "" : "s"} totaling ₱${formatMoney(draftTotal)} for reconciliation.`}
        confirmLabel="Submit DCR"
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
              disabled={allocationMismatch}
            >
              Add to DCR
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
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
