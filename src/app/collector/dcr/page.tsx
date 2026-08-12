"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
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

type MasterlistJoin = {
  borrower_name: string;
  loan_account_no: string | null;
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

  async function addToDcr(paymentId: string) {
    if (!draftDcrId) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/collector/dcr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          dcrId: draftDcrId,
          paymentId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not add to DCR");
      }
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

  const available = payments.filter((p) => !inDraft.has(p.id));

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
        ) : (
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Payment</Th>
                  <Th num>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item) => {
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
        ) : (
          <div className="tbl-wrap">
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
                {payments.map((pay) => {
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
                            onClick={() => void addToDcr(pay.id)}
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
        {draftDcrId && available.length === 0 && payments.length > 0 ? (
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
    </div>
  );
}
