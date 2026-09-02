"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { AccountLedger } from "@/components/ledger/AccountLedger";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import { type LedgerPdcCheck } from "@/lib/ledger/build-account-ledger-rows";
import {
  buildDeskLedgerRows,
  type DeskLedgerPosting,
} from "@/lib/ledger/desk-ledger";

/**
 * Move of Payment — Phase 5, see
 * docs/revision-plans/feature-move-of-payment-implementation-plan.md.
 * A new, separate page — does not touch the existing Record Payment
 * modal/flow (Phase 5's own constraint). Extended per the manual-selection
 * addendum: instead of only offering the earliest open due date, the
 * Collector sees every open due date and picks which one to move.
 */

type MoveOfPaymentCandidate = { dueDate: string; surchargeAmount: number };

type MoveOfPaymentPreview =
  | { eligible: true; candidates: MoveOfPaymentCandidate[] }
  | { eligible: false; reason: string };

type ScheduleRow = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  penaltyAmount: number;
  discountAmount?: number;
  status: string;
  movedAt?: string | null;
  moveSurchargeAmount?: number | null;
  moveOfPaymentBatchId?: string | null;
  deferredFromMoveOfPaymentBatchId?: string | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  move_of_payment_batch_id: string | null;
};

type AccountPayload = {
  account: {
    id: string;
    borrowerName: string;
    loanAccountNo: string | null;
    totalLoan: number;
    // Move of Payment (Phase 7) — read-only surfacing, no new logic.
    moveOfPaymentUsedAt: string | null;
  };
  schedules: ScheduleRow[];
  payments?: PaymentRow[];
  postings?: DeskLedgerPosting[];
  pdcChecks?: LedgerPdcCheck[];
  moveOfPayment: MoveOfPaymentPreview;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function CollectorMoveOfPaymentPage() {
  const params = useParams();
  const masterlistId = params.id as string;
  const apiPath = `/api/collector/accounts/${masterlistId}`;

  const [data, setData] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDueDate, setSelectedDueDate] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ surchargeAmount: number; deadlineDate: string } | null>(
    null,
  );

  // Fixes Plan Phase 2 (Issue 3) — record the surcharge for an in-effect
  // move as a real, tagged payment (a separate action from offering the move).
  const [sPaymentDate, setSPaymentDate] = useState("");
  const [sReferenceNo, setSReferenceNo] = useState("");
  const [sChannel, setSChannel] = useState<"bank_deposit" | "check" | "pos_cash">(
    "bank_deposit",
  );
  const [sSubmitting, setSSubmitting] = useState(false);
  const [sError, setSError] = useState<string | null>(null);
  const [sDone, setSDone] = useState(false);

  // Fixes Plan Phase 4b (Issue 7) — record a replacement PDC check for the
  // installment appended by the move.
  const [rcCheckNo, setRcCheckNo] = useState("");
  const [rcCheckDate, setRcCheckDate] = useState("");
  const [rcBank, setRcBank] = useState("");
  const [rcSubmitting, setRcSubmitting] = useState(false);
  const [rcError, setRcError] = useState<string | null>(null);
  const [rcDone, setRcDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load account");
      }
      const body = (await res.json()) as AccountPayload;
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${apiPath}/move-of-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlineDate, dueDate: selectedDueDate }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; surchargeAmount?: number; deadlineDate?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to apply Move of Payment");
      }
      setResult({
        surchargeAmount: body?.surchargeAmount ?? 0,
        deadlineDate: body?.deadlineDate ?? deadlineDate,
      });
      setConfirmOpen(false);
      // Refresh so the "Record surcharge payment" section appears for the
      // move that was just applied.
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to apply Move of Payment");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function recordSurcharge() {
    setSSubmitting(true);
    setSError(null);
    try {
      const res = await fetch(`${apiPath}/move-of-payment/surcharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceNo: sReferenceNo.trim(),
          channel: sChannel,
          paymentDate: sPaymentDate,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to record the surcharge payment");
      }
      setSDone(true);
      await load();
    } catch (err) {
      setSError(err instanceof Error ? err.message : "Failed to record the surcharge payment");
    } finally {
      setSSubmitting(false);
    }
  }

  async function recordReplacementCheck() {
    setRcSubmitting(true);
    setRcError(null);
    try {
      const res = await fetch(`${apiPath}/move-of-payment/replacement-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkNumber: rcCheckNo.trim(),
          checkDate: rcCheckDate,
          bankName: rcBank.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to record the replacement check");
      }
      setRcDone(true);
      await load();
    } catch (err) {
      setRcError(
        err instanceof Error ? err.message : "Failed to record the replacement check",
      );
    } finally {
      setRcSubmitting(false);
    }
  }

  const ledgerRows = useMemo(() => {
    if (!data) return [];
    return buildDeskLedgerRows({
      totalLoan: data.account.totalLoan,
      schedules: data.schedules,
      postings: data.postings ?? [],
      pdcChecks: data.pdcChecks ?? [],
    });
  }, [data]);

  const preview = data?.moveOfPayment ?? null;
  const todayStr = new Date().toISOString().slice(0, 10);

  // An in-effect move: one or more schedule rows at status 'moved' sharing a
  // batch id. The surcharge amount is the sum of moveSurchargeAmount across
  // them (only the interest-bearing row carries a non-zero value).
  const movedRows = (data?.schedules ?? []).filter(
    (r) => r.status === "moved" && r.moveOfPaymentBatchId,
  );
  const activeMoveBatchId = movedRows[0]?.moveOfPaymentBatchId ?? null;
  const surchargeAmount = movedRows.reduce(
    (sum, r) => sum + Number(r.moveSurchargeAmount ?? 0),
    0,
  );
  const surchargeAlreadyRecorded = Boolean(
    activeMoveBatchId &&
      (data?.payments ?? []).some(
        (p) => p.move_of_payment_batch_id === activeMoveBatchId,
      ),
  );
  const sPaymentValid = sReferenceNo.trim().length > 0 && sPaymentDate.length > 0;

  // Phase 4b — a held check exists for this move → a replacement can be
  // recorded; a replaced check → it already was.
  const heldCheckExists = (data?.pdcChecks ?? []).some((c) => c.status === "held");
  const replacementRecorded =
    rcDone || (data?.pdcChecks ?? []).some((c) => c.status === "replaced");
  const rcValid = rcCheckNo.trim().length > 0 && rcCheckDate.length > 0;

  const deadlineValid = deadlineDate.length > 0 && deadlineDate > todayStr;
  const selectedCandidate =
    preview && preview.eligible
      ? preview.candidates.find((c) => c.dueDate === selectedDueDate) ?? null
      : null;
  const canOffer = selectedCandidate !== null && deadlineValid;

  const ledgerSelection = useMemo(() => {
    if (!preview || !preview.eligible) return undefined;
    return {
      eligibleDueDates: new Set(preview.candidates.map((c) => c.dueDate)),
      selectedDueDate,
      surchargeByDueDate: new Map(
        preview.candidates.map((c) => [c.dueDate, c.surchargeAmount]),
      ),
      onSelect: setSelectedDueDate,
    };
  }, [preview, selectedDueDate]);

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Accounts", href: "/collector/accounts" },
          { label: "Move of Payment" },
        ]}
      />
      <PageHeader
        title={data?.account.borrowerName ?? "Move of Payment"}
        description="One-time relief — the borrower pays one month's interest to shift their next payment date forward, without changing what they still owe."
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}

      {error ? (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      ) : null}

      {!loading && !error && data ? (
        <Card>
          <div className="mb-4">
            <div className="text-sm text-ink-500">Account</div>
            <div className="font-medium text-ink-900">
              {data.account.borrowerName}
              {data.account.loanAccountNo ? ` · ${data.account.loanAccountNo}` : ""}
            </div>
            {/* Move of Payment (Phase 7) — read-only surfacing of
                masterlist.move_of_payment_used_at, already written by
                applyMoveOfPayment (Phase 2). No new logic, just display. */}
            {!result && data.account.moveOfPaymentUsedAt ? (
              <p className="mt-1 text-xs text-ink-500">
                Move of Payment already used on{" "}
                {formatDate(data.account.moveOfPaymentUsedAt.slice(0, 10))}.
              </p>
            ) : null}
          </div>

          <section className="mb-6 min-w-0">
            <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
              Account ledger
            </h2>
            <p className="mb-3 text-sm text-ink-500">
              {ledgerSelection
                ? "Select any open installment below to move it. The Surcharge column is the real one-month interest cost of moving that payment."
                : "Full schedule and posting history for this account."}
            </p>
            {ledgerRows.length === 0 ? (
              <EmptyState
                title="No ledger activity"
                description="Amortization and posted payments will appear here."
                showMark={false}
              />
            ) : (
              <AccountLedger rows={ledgerRows} selection={ledgerSelection} />
            )}
          </section>

          {/* Fixes Plan Phase 2 (Issue 3) — record the surcharge for an
              in-effect move as a real, tagged payment. Separate from
              offering the move. */}
          {activeMoveBatchId ? (
            <>
            {surchargeAlreadyRecorded || sDone ? (
              <Alert variant="success" title="Surcharge recorded">
                The ₱{formatMoney(surchargeAmount)} surcharge for this Move of Payment has been
                recorded as a payment. It will appear on the ledger once AR reconciles it, as a
                surcharge line that does not reduce the loan balance.
              </Alert>
            ) : (
              <div className="mb-6 rounded-md border border-ink-200 bg-ink-50/50 p-3">
                <p className="mb-1 text-sm font-medium text-ink-900">
                  Record surcharge payment
                </p>
                <p className="mb-3 text-xs text-ink-500">
                  The borrower owes a{" "}
                  <b>₱{formatMoney(surchargeAmount)}</b> surcharge (one month&rsquo;s interest)
                  for this move. Record how they paid it. It goes on the ledger as a surcharge
                  and does not reduce what they still owe.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label required>Payment date</Label>
                    <Input
                      type="date"
                      max={todayStr}
                      value={sPaymentDate}
                      onChange={(e) => setSPaymentDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label required>Reference no.</Label>
                    <Input
                      value={sReferenceNo}
                      onChange={(e) => setSReferenceNo(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Channel</Label>
                    <Select
                      value={sChannel}
                      onChange={(e) =>
                        setSChannel(
                          e.target.value as "bank_deposit" | "check" | "pos_cash",
                        )
                      }
                    >
                      <option value="bank_deposit">Bank deposit</option>
                      <option value="check">Check</option>
                      <option value="pos_cash">POS / Cash</option>
                    </Select>
                  </div>
                </div>
                {sError ? (
                  <div className="mt-3">
                    <Alert variant="danger">{sError}</Alert>
                  </div>
                ) : null}
                <div className="mt-3">
                  <Button
                    variant="primary"
                    disabled={!sPaymentValid}
                    loading={sSubmitting}
                    onClick={recordSurcharge}
                  >
                    Record surcharge payment
                  </Button>
                </div>
              </div>
            )}

            {/* Fixes Plan Phase 4b (Issue 7) — replacement PDC check for the
                installment appended by the move. Only shown when the move put
                a check on hold (loan types with 1:1 check↔installment). */}
            {heldCheckExists ? (
              replacementRecorded ? (
                <Alert variant="success" title="Replacement check recorded">
                  The post-dated check for the moved payment is marked replaced, and the new
                  check is now on file for the installment at the end of the loan.
                </Alert>
              ) : (
                <div className="mt-4 rounded-md border border-ink-200 bg-ink-50/50 p-3">
                  <p className="mb-1 text-sm font-medium text-ink-900">
                    Replacement check for the extended installment
                  </p>
                  <p className="mb-3 text-xs text-ink-500">
                    The moved payment&rsquo;s post-dated check is on hold. The new installment
                    at the end of the loan has no check yet — collect a replacement from the
                    borrower and record it here.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label required>Check no.</Label>
                      <Input
                        value={rcCheckNo}
                        onChange={(e) => setRcCheckNo(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label required>Check date</Label>
                      <Input
                        type="date"
                        value={rcCheckDate}
                        onChange={(e) => setRcCheckDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label>Bank</Label>
                      <Input
                        value={rcBank}
                        onChange={(e) => setRcBank(e.target.value)}
                      />
                    </div>
                  </div>
                  {rcError ? (
                    <div className="mt-3">
                      <Alert variant="danger">{rcError}</Alert>
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <Button
                      variant="primary"
                      disabled={!rcValid}
                      loading={rcSubmitting}
                      onClick={recordReplacementCheck}
                    >
                      Record replacement check
                    </Button>
                  </div>
                </div>
              )
            ) : null}
            </>
          ) : null}

          {result ? (
            <Alert variant="success" title="Move of Payment applied">
              The selected payment has been deferred and the loan&rsquo;s last installment
              pushed out by one cycle. Record the ₱{formatMoney(result.surchargeAmount)}{" "}
              surcharge in the section above. The deferred payment returns to the schedule as
              due on {formatDate(result.deadlineDate)} — from then it is a normal installment
              (with a penalty if overdue), and the extra installment at the end is removed. This
              account cannot use Move of Payment again.
            </Alert>
          ) : preview && !preview.eligible ? (
            <Alert variant="warning" title="Not eligible">
              {preview.reason}
            </Alert>
          ) : preview && preview.eligible ? (
            <div>
              {selectedCandidate ? (
                <div className="mb-4 rounded-md border border-ink-200 bg-ink-50/50 p-3 text-xs text-ink-600">
                  The borrower owes a{" "}
                  <b>₱{formatMoney(selectedCandidate.surchargeAmount)}</b> surcharge (one
                  month&rsquo;s interest) for this move. After you offer it, a{" "}
                  <b>Record surcharge payment</b> section appears here — offering the move does
                  not record the payment.
                </div>
              ) : null}

              <div className="mb-4">
                <Label required>Date the shifted payment becomes due again</Label>
                <Input
                  type="date"
                  min={todayStr}
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-ink-500">
                  You set this date yourself — it is not calculated automatically. Until this
                  date the shifted payment is deferred with no penalty. On this date it returns
                  to the schedule as due; if it is still unpaid it is treated as a normal
                  overdue installment from then. The extra installment at the end of the loan is
                  also removed.
                </p>
              </div>

              {submitError ? (
                <div className="mb-4">
                  <Alert variant="danger">{submitError}</Alert>
                </div>
              ) : null}

              <Button variant="primary" disabled={!canOffer} onClick={() => setConfirmOpen(true)}>
                Offer Move of Payment
              </Button>
            </div>
          ) : null}

          <div className="mt-6">
            <Link href="/collector/accounts" className="btn btn-secondary btn-sm">
              Back to accounts
            </Link>
          </div>
        </Card>
      ) : null}

      {preview && preview.eligible && selectedCandidate ? (
        <ConfirmDialog
          open={confirmOpen}
          title="Confirm Move of Payment"
          message={
            <>
              Defer the <b>{formatDate(selectedCandidate.dueDate)}</b> payment. It returns to
              the schedule as due on{" "}
              <b>{deadlineDate ? formatDate(deadlineDate) : "—"}</b>, penalty-free until then.
              The loan&rsquo;s last installment moves out by one cycle and what they still owe
              does not change. The borrower owes a{" "}
              <b>₱{formatMoney(selectedCandidate.surchargeAmount)}</b> surcharge (one
              month&rsquo;s interest) — you record it in the next step, not here.{" "}
              <b>This can only be used once per loan.</b>
            </>
          }
          confirmLabel="Confirm"
          loading={submitting}
          confirmDisabled={!canOffer}
          onConfirm={submit}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}
