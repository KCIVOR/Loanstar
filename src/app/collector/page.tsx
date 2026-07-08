"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";

type Account = {
  id: string;
  borrower_name: string;
  loan_account_no: string | null;
  outstanding_balance: number;
  aging_bucket: string;
  loan_application_id: string;
};

type Payment = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  masterlist_id: string;
};

export default function CollectorDashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [draftDcrId, setDraftDcrId] = useState<string | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accRes = await fetch("/api/collector/accounts");
      if (!accRes.ok) throw new Error("Failed to load accounts");
      const accData = (await accRes.json()) as { accounts: Account[] };
      setAccounts(accData.accounts);

      const ids = accData.accounts.map((a) => a.id);
      if (ids.length) {
        const payRes = await fetch("/api/collector/payments");
        if (payRes.ok) {
          const payData = (await payRes.json()) as { payments: Payment[] };
          setPendingPayments(payData.payments);
        }
      } else {
        setPendingPayments([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reviewPayment(id: string, status: "confirmed" | "rejected") {
    const res = await fetch(`/api/collector/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await load();
  }

  async function startDcr() {
    const res = await fetch("/api/collector/dcr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { dcrId: string };
    setDraftDcrId(data.dcrId);
    setSelectedPayments([]);
    setMessage("DCR draft created.");
  }

  async function addToDcr(paymentId: string) {
    if (!draftDcrId) return;
    const res = await fetch("/api/collector/dcr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_item", dcrId: draftDcrId, paymentId }),
    });
    if (res.ok) {
      setSelectedPayments((prev) => [...prev, paymentId]);
      setMessage("Payment added to DCR.");
    }
  }

  async function submitDcr() {
    if (!draftDcrId) return;
    const res = await fetch("/api/collector/dcr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", dcrId: draftDcrId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Submit failed");
      return;
    }
    setDraftDcrId(null);
    setMessage("DCR submitted to AR.");
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Collector workspace"
        description="Assigned borrowers, payment proofs, and DCR submission."
        actions={
          draftDcrId ? (
            <Button onClick={() => void submitDcr()}>Submit DCR</Button>
          ) : (
            <Button variant="secondary" onClick={() => void startDcr()}>
              New DCR
            </Button>
          )
        }
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {message ? <div className="mb-4"><Alert variant="success">{message}</Alert></div> : null}

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Assigned accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-600">No accounts assigned yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {accounts.map((acc) => (
              <li key={acc.id} className="flex justify-between py-2">
                <span>
                  {acc.borrower_name} · {acc.loan_account_no ?? "—"}
                </span>
                <span>
                  {Number(acc.outstanding_balance).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  · {acc.aging_bucket}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Pending payment proofs</h2>
        {pendingPayments.length === 0 ? (
          <p className="text-sm text-neutral-600">No pending proofs.</p>
        ) : (
          <ul className="space-y-3">
            {pendingPayments.map((pay) => (
              <li key={pay.id} className="rounded border border-neutral-200 p-3 text-sm">
                <p>
                  {pay.reference_no ?? "No ref"} · {pay.payment_date} ·{" "}
                  {Number(pay.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-neutral-500">{pay.status}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pay.status === "pending_verification" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => void reviewPayment(pay.id, "confirmed")}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void reviewPayment(pay.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {draftDcrId &&
                  ["pending_verification", "confirmed"].includes(pay.status) ? (
                    <Button onClick={() => void addToDcr(pay.id)}>Add to DCR</Button>
                  ) : null}
                  {selectedPayments.includes(pay.id) ? (
                    <span className="text-success-700">In DCR</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
