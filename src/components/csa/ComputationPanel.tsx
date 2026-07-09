"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Select,
} from "@/components/ui";

type LoanType = {
  id: string;
  name: string;
  interestRate: number;
  pfRate: number;
  securityFeeRate: number;
};

type Computation = {
  id: string;
  inputMode: string;
  inputAmount: number;
  principal: number;
  netReleased: number;
  totalLoan: number;
  monthlyAmortization: number;
  lineItems: Array<{ key: string; label: string; amount: number }>;
  coverageWarning: boolean;
  signedAt: string | null;
  loanTypeName: string | null;
};

type ComputationPanelProps = {
  applicationId: string;
  loanTypeId: string | null;
  editable: boolean;
  computation: Computation | null;
  onUpdated: () => void;
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

export function ComputationPanel({
  applicationId,
  loanTypeId,
  editable,
  computation,
  onUpdated,
}: ComputationPanelProps) {
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [inputMode, setInputMode] = useState<
    "NET_SARADO" | "NET_LESS_SECURITY" | "PRINCIPAL"
  >("NET_SARADO");
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("6");
  const [addonMonths, setAddonMonths] = useState("2");
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState(loanTypeId ?? "");
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverageMessage, setCoverageMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/csa/loan-types")
      .then((res) => res.json())
      .then((data: { loanTypes: LoanType[] }) => {
        setLoanTypes(data.loanTypes);
        setSelectedLoanTypeId((current) => current || loanTypeId || data.loanTypes[0]?.id || "");
      });
  }, [loanTypeId]);

  async function handleCompute(e: FormEvent) {
    e.preventDefault();
    if (!editable) return;
    setComputing(true);
    setError(null);
    setCoverageMessage(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/computation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMode,
            amount: Number(amount),
            terms: Number(terms),
            addonMonths: Number(addonMonths),
            loanTypeId: selectedLoanTypeId || loanTypeId,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        coverage?: { message?: string | null; warning?: boolean };
      };
      if (!res.ok) throw new Error(data.error ?? "Computation failed");
      if (data.coverage?.message) {
        setCoverageMessage(data.coverage.message);
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Computation failed");
    } finally {
      setComputing(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">Computation</h2>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {computation ? (
        <div className="mb-6 space-y-2 text-sm">
          <p className="font-medium text-ink">
            {computation.loanTypeName ?? "Loan"} ·{" "}
            {computation.inputMode.replace(/_/g, " ")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {computation.lineItems.map((item) => {
              const isKey = KEY_AMOUNT_KEYS.has(item.key);
              return (
                <div
                  key={item.key}
                  className="flex justify-between border-b border-neutral-100 py-1.5"
                >
                  <span className="text-ink-muted">{item.label}</span>
                  <span
                    className={
                      isKey
                        ? "font-mono font-bold tabular-nums text-gold-600"
                        : "font-mono font-medium tabular-nums text-ink"
                    }
                  >
                    {formatMoney(item.amount)}
                  </span>
                </div>
              );
            })}
          </div>
          {computation.signedAt ? (
            <Alert variant="success">
              Signed by borrower on{" "}
              <span className="font-mono">
                {new Date(computation.signedAt).toLocaleString()}
              </span>
            </Alert>
          ) : (
            <Alert variant="warning">Awaiting borrower signature</Alert>
          )}
        </div>
      ) : (
        <p className="mb-4 text-sm text-ink-muted">No computation yet.</p>
      )}

      {editable ? (
        <form onSubmit={(e) => void handleCompute(e)} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="loanType">Loan type</Label>
            <Select
              id="loanType"
              value={selectedLoanTypeId}
              onChange={(e) => setSelectedLoanTypeId(e.target.value)}
            >
              <option value="">Select loan type</option>
              {loanTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="inputMode">Input mode</Label>
            <Select
              id="inputMode"
              value={inputMode}
              onChange={(e) =>
                setInputMode(
                  e.target.value as "NET_SARADO" | "NET_LESS_SECURITY" | "PRINCIPAL",
                )
              }
            >
              <option value="NET_SARADO">Net sarado</option>
              <option value="NET_LESS_SECURITY">Net less security</option>
              <option value="PRINCIPAL">Principal</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="terms">Terms (months)</Label>
            <Input
              id="terms"
              type="number"
              min="1"
              required
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="addonMonths">Addon months</Label>
            <Input
              id="addonMonths"
              type="number"
              min="1"
              required
              value={addonMonths}
              onChange={(e) => setAddonMonths(e.target.value)}
            />
          </div>
          {coverageMessage ? (
            <div className="sm:col-span-2">
              <Alert variant="warning">{coverageMessage}</Alert>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" loading={computing}>
              {computation ? "Recalculate" : "Compute"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
