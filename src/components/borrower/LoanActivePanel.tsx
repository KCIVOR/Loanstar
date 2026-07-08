"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/admin/ui";

type LoanPanelProps = {
  applicationId: string;
  applicationStatus: string;
};

type ScheduleRow = {
  installment_no: number;
  due_date: string;
  amount_due: number;
  status: string;
  penalty_amount: number;
};

type PaymentRow = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  channel: string;
  status: string;
};

export function LoanActivePanel({ applicationId, applicationStatus }: LoanPanelProps) {
  const [loan, setLoan] = useState<Record<string, unknown> | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [channel, setChannel] = useState<"bank_deposit" | "check" | "pos_cash">(
    "bank_deposit",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!["loan_active", "closed"].includes(applicationStatus)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/borrower/applications/${applicationId}/loan`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        loan: Record<string, unknown>;
        payments: PaymentRow[];
      };
      setLoan(data.loan);
      setPayments(data.payments);
    } finally {
      setLoading(false);
    }
  }, [applicationId, applicationStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!["loan_active", "closed"].includes(applicationStatus)) return null;
  if (loading && !loan) return <Spinner />;

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/borrower/applications/${applicationId}/loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          paymentDate,
          referenceNo: referenceNo || undefined,
          channel,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setMessage("Payment proof submitted — pending verification.");
      setAmount("");
      setReferenceNo("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loan) return null;

  const schedules = (loan.amortization_schedules as ScheduleRow[]) ?? [];

  return (
    <Card className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Loan active</h2>
      <p className="mb-4 text-sm text-zinc-600">
        Balance{" "}
        {Number(loan.outstanding_balance).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
        })}{" "}
        · Status {String(loan.account_status)}
      </p>

      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-3">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      <h3 className="mb-2 font-medium">Amortization schedule</h3>
      <ul className="mb-4 divide-y divide-zinc-100 text-sm">
        {schedules.map((row) => (
          <li key={row.installment_no} className="flex justify-between py-2">
            <span>
              #{row.installment_no} · {row.due_date}
            </span>
            <span>
              {Number(row.amount_due).toLocaleString("en-PH", { minimumFractionDigits: 2 })}{" "}
              · {row.status}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 font-medium">Submit payment proof</h3>
      <form onSubmit={(e) => void submitPayment(e)} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <Label>Payment date</Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
        </div>
        <div>
          <Label>Reference no.</Label>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>
        <div>
          <Label>Channel</Label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="bank_deposit">Bank deposit</option>
            <option value="check">Check</option>
            <option value="pos_cash">POS / Cash</option>
          </Select>
        </div>
        <Button type="submit">Submit proof</Button>
      </form>

      {payments.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 font-medium">Payment history</h3>
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="py-1">
                {p.payment_date} · {Number(p.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} ·{" "}
                {p.status}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
