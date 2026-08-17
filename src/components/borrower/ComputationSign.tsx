"use client";

import { FormEvent, useState } from "react";

import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { computationConfirmState } from "@/lib/negotiation/computation-confirm-state";

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

const KEY_AMOUNT_KEYS = new Set([
  "principal",
  "net_released",
  "netReleased",
  "total_loan",
  "totalLoan",
  "monthly_amortization",
  "monthlyAmortization",
]);

export function ComputationSign({
  applicationId,
  applicationStatus,
  computation,
  negotiationStatus,
  onSigned,
}: ComputationSignProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [countering, setCountering] = useState(false);

  if (!computation) return null;

  const confirmState = computationConfirmState({
    signedAt: computation.signedAt,
    negotiationStatus,
    applicationStatus,
  });
  const canSign = confirmState === "confirm";
  const canCounter =
    negotiationStatus === "awaiting_signature" ||
    negotiationStatus === "negotiating";

  async function handleSign() {
    setConfirming(true);
    setError(null);
    setMessage(null);
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
    setMessage(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(counterAmount),
            message: counterMessage.trim() || undefined,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Counter failed");
      setCounterAmount("");
      setCounterMessage("");
      setMessage(
        "Counter-offer submitted. Committee will review the new amount.",
      );
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Counter failed");
    } finally {
      setCountering(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
        Loan computation
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        {computation.loanTypeName ?? "Loan"} · review and confirm your loan
        terms.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {computation.lineItems.map((item) => {
          const isKey = KEY_AMOUNT_KEYS.has(item.key);
          return (
            <div
              key={item.key}
              className="flex justify-between border-b border-line-soft py-1.5 text-sm"
            >
              <span className="text-ink-500">{item.label}</span>
              <span
                className={
                  isKey
                    ? "mono font-bold tabular-nums text-teal-600"
                    : "mono font-medium tabular-nums text-ink-900"
                }
              >
                {formatMoney(item.amount)}
              </span>
            </div>
          );
        })}
      </div>

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

      {confirmState === "waiting_disclosure" ? (
        <Alert variant="info">
          Committee approved these terms. CSA will disclose them shortly — then
          you can confirm / sign (or submit a counter-offer).
        </Alert>
      ) : confirmState === "confirmed" ? (
        <Alert variant="success">
          You confirmed this computation on{" "}
          <span className="mono">
            {new Date(computation.signedAt!).toLocaleString()}
          </span>
          .
        </Alert>
      ) : canSign ? (
        <>
          <Button onClick={() => setShowDialog(true)}>
            Review & confirm computation
          </Button>
          <ConfirmDialog
            open={showDialog}
            title="Confirm computation"
            message="I confirm that I have reviewed the loan computation above and agree to the stated principal, net release, and monthly amortization."
            confirmLabel="I confirm / sign"
            cancelLabel="Cancel"
            loading={confirming}
            onConfirm={() => void handleSign()}
            onCancel={() => setShowDialog(false)}
          />
        </>
      ) : null}

      {canCounter ? (
        <form
          onSubmit={(e) => void handleCounter(e)}
          className="mt-6 space-y-3 border-t border-line-soft pt-4"
        >
          <h3 className="font-medium text-ink-900">Counter-offer (optional)</h3>
          <p className="text-sm text-ink-500">
            Not required. Only use this if you want a different net release
            amount sent back to Committee. To accept the terms above, use{" "}
            <span className="font-medium text-ink-700">
              Review & confirm computation
            </span>
            .
          </p>
          <div>
            <Label htmlFor="counterAmount" required>
              Requested amount
            </Label>
            <Input
              id="counterAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              required
              className="mono"
            />
          </div>
          <div>
            <Label htmlFor="counterMessage">Note (optional)</Label>
            <Textarea
              id="counterMessage"
              rows={2}
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              placeholder="Explain why you're requesting this amount…"
            />
          </div>
          <Button type="submit" variant="secondary" loading={countering}>
            Submit counter-offer
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
