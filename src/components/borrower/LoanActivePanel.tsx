"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";

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

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }

  if (!loan) return null;

  const schedules = (loan.amortization_schedules as ScheduleRow[]) ?? [];

  return (
    <Card className="mb-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-ink">Loan active</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Balance{" "}
        <span className="font-mono font-bold tabular-nums text-gold-600">
          {formatMoney(Number(loan.outstanding_balance))}
        </span>{" "}
        · Status <Badge variant="gold">{String(loan.account_status)}</Badge>
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

      <h3 className="mb-2 font-medium text-ink">Amortization schedule</h3>
      <ul className="mb-4 divide-y divide-neutral-100 text-sm">
        {schedules.map((row) => (
          <li key={row.installment_no} className="flex justify-between py-2">
            <span className="text-ink-muted">
              #{row.installment_no} ·{" "}
              <span className="font-mono text-ink">{row.due_date}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono font-medium tabular-nums text-ink">
                {formatMoney(Number(row.amount_due))}
              </span>
              <Badge variant="neutral">{row.status}</Badge>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 font-medium text-ink">Submit payment proof</h3>
      <form onSubmit={(e) => void submitPayment(e)} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount</Label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Payment date</Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Reference no.</Label>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>
        <div>
          <Label>Channel</Label>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
          >
            <option value="bank_deposit">Bank deposit</option>
            <option value="check">Check</option>
            <option value="pos_cash">POS / Cash</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={submitting}>
            Submit proof
          </Button>
        </div>
      </form>

      {payments.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 font-medium text-ink">Payment history</h3>
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-ink-muted">
                <span className="font-mono text-ink">{p.payment_date}</span>
                <span aria-hidden>·</span>
                <span className="font-mono font-medium tabular-nums text-ink">
                  {formatMoney(Number(p.amount))}
                </span>
                <Badge variant="neutral">{p.status}</Badge>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
