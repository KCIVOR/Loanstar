"use client";

import { FormEvent, useState } from "react";

import { Alert, Button, Card, Input, Label } from "@/components/admin/ui";

type ComputationSummary = {
  id: string;
  inputMode: string;
  principal: number;
  netReleased: number;
  totalLoan: number;
  monthlyAmortization: number;
  lineItems: Array<{ key: string; label: string; amount: number }>;
  signedAt: string | null;
  loanTypeName: string | null;
};

type ComputationSignProps = {
  applicationId: string;
  applicationStatus: string;
  computation: ComputationSummary | null;
  negotiationStatus?: string | null;
  onSigned: () => void;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const COUNTER_STATUSES = [
  "approved",
  "awaiting_confirmation",
  "negotiating_terms",
];

export function ComputationSign({
  applicationId,
  applicationStatus,
  computation,
  negotiationStatus,
  onSigned,
}: ComputationSignProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [countering, setCountering] = useState(false);

  if (!computation) return null;

  const canCounter = COUNTER_STATUSES.includes(applicationStatus);
  const canSign =
    !negotiationStatus || negotiationStatus === "awaiting_signature";

  async function handleSign() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/computation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sign failed");
      setShowDialog(false);
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign failed");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCounter(e: FormEvent) {
    e.preventDefault();
    setCountering(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: Number(counterAmount) }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Counter failed");
      setCounterAmount("");
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Counter failed");
    } finally {
      setCountering(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Loan computation</h2>
      <p className="mb-4 text-sm text-zinc-600">
        {computation.loanTypeName ?? "Loan"} · review and confirm your loan terms.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {computation.lineItems.map((item) => (
          <div key={item.key} className="flex justify-between border-b border-zinc-100 py-1 text-sm">
            <span className="text-zinc-600">{item.label}</span>
            <span className="font-medium tabular-nums">{formatMoney(item.amount)}</span>
          </div>
        ))}
      </div>

      {computation.signedAt ? (
        <Alert variant="success">
          You confirmed this computation on{" "}
          {new Date(computation.signedAt).toLocaleString()}.
        </Alert>
      ) : canSign ? (
        <>
          {error ? (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {showDialog ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-3 text-sm text-zinc-700">
                I confirm that I have reviewed the loan computation above and agree to the
                stated principal, net release, and monthly amortization.
              </p>
              <div className="flex gap-2">
                <Button disabled={confirming} onClick={() => void handleSign()}>
                  {confirming ? "Confirming…" : "I confirm / sign"}
                </Button>
                <Button variant="secondary" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowDialog(true)}>Review & confirm computation</Button>
          )}
        </>
      ) : negotiationStatus === "pending_disclosure" ? (
        <Alert>Approved terms will be disclosed by CSA shortly.</Alert>
      ) : null}

      {canCounter && applicationStatus !== "lra_pending" ? (
        <form
          onSubmit={(e) => void handleCounter(e)}
          className="mt-6 space-y-3 border-t border-zinc-100 pt-4"
        >
          <h3 className="font-medium text-zinc-900">Counter-offer</h3>
          <p className="text-sm text-zinc-600">
            Propose a different net release amount for Committee review.
          </p>
          <div>
            <Label htmlFor="counterAmount">Requested amount</Label>
            <Input
              id="counterAmount"
              type="number"
              step="0.01"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="secondary" disabled={countering}>
            {countering ? "Submitting…" : "Submit counter-offer"}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
