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
  terms: number;
  addonMonths: number;
  pfRate: number;
  interestRate: number;
  securityFeeRate: number;
  principal: number;
  processingFee: number;
  adminCost: number;
  docStamp: number;
  notaryFee: number;
  securityFee: number;
  otherDeductionsTotal: number;
  totalDeductions: number;
  netReleased: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
  lineItems: Array<{ key: string; label: string; amount: number }>;
  coverageWarning: boolean;
  signedAt: string | null;
  loanTypeName: string | null;
  loanTypeId?: string | null;
};

type ComputationPanelProps = {
  applicationId: string;
  loanTypeId: string | null;
  editable: boolean;
  computation: Computation | null;
  onUpdated: () => void;
  /** When false, compute/recalculate is disabled (hard workflow sequence). */
  interviewComplete?: boolean;
  interviewBlockReason?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(2)}%`;
}

const INPUT_MODE_LABEL: Record<string, string> = {
  NET_SARADO: "Net sarado",
  NET_LESS_SECURITY: "Net less security",
  PRINCIPAL: "Principal",
};

function buildComputationSteps(c: Computation) {
  const pfBundle = c.processingFee + c.docStamp + c.notaryFee + c.adminCost;
  const principalFormula =
    c.inputMode === "PRINCIPAL"
      ? "Entered directly as the loan principal"
      : `Solved so Net Released = ₱${formatMoney(c.inputAmount)} (${INPUT_MODE_LABEL[c.inputMode] ?? c.inputMode})`;

  return [
    { label: "Principal", formula: principalFormula, value: c.principal },
    {
      label: "PF bundle",
      formula: `Processing + Doc Stamp + Notary + Admin (≈ ${pct(c.pfRate)} of principal)`,
      value: pfBundle,
    },
    {
      label: "Security fee",
      formula: `₱${formatMoney(c.principal)} × ${pct(c.securityFeeRate)}`,
      value: c.securityFee,
    },
    {
      label: "Total deductions",
      formula: `PF bundle + Security fee + Other (₱${formatMoney(c.otherDeductionsTotal)})`,
      value: c.totalDeductions,
    },
    {
      label: "Net released",
      formula: "Principal − Total deductions",
      value: c.netReleased,
    },
    {
      label: "Total interest",
      formula: `₱${formatMoney(c.principal)} × (${c.terms} + ${c.addonMonths} addon mo) × ${pct(c.interestRate)}`,
      value: c.totalInterest,
    },
    {
      label: "Total loan",
      formula: "Principal + Total interest",
      value: c.totalLoan,
    },
    {
      label: "Monthly amortization",
      formula: `Total loan ÷ ${c.terms} months`,
      value: c.monthlyAmortization,
    },
  ];
}

const KEY_AMOUNT_KEYS = new Set([
  "principal",
  "net_released",
  "netReleased",
  "total_loan",
  "totalLoan",
]);

const AMORT_KEYS = new Set(["monthly_amortization", "monthlyAmortization"]);

export function ComputationPanel({
  applicationId,
  loanTypeId,
  editable,
  computation,
  onUpdated,
  interviewComplete = true,
  interviewBlockReason = null,
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

  // Hydrate inputs from the saved active computation so refresh keeps the
  // last calculated loan params instead of blank/default fields.
  useEffect(() => {
    if (!computation) return;
    if (
      computation.inputMode === "NET_SARADO" ||
      computation.inputMode === "NET_LESS_SECURITY" ||
      computation.inputMode === "PRINCIPAL"
    ) {
      setInputMode(computation.inputMode);
    }
    setAmount(String(computation.inputAmount));
    setTerms(String(computation.terms));
    setAddonMonths(String(computation.addonMonths));
    if (computation.loanTypeId) {
      setSelectedLoanTypeId(computation.loanTypeId);
    }
  }, [
    computation?.id,
    computation?.inputMode,
    computation?.inputAmount,
    computation?.terms,
    computation?.addonMonths,
    computation?.loanTypeId,
  ]);

  async function handleCompute(e: FormEvent) {
    e.preventDefault();
    if (!editable || !interviewComplete) return;
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

  const breakdown = computation
    ? computation.lineItems.filter((item) => !AMORT_KEYS.has(item.key))
    : [];

  const form = (
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
      <div className="sm:col-span-2">
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
      <div className="sm:col-span-2">
        <Label htmlFor="amount" required>
          Amount
        </Label>
        <div className="affix">
          <span className="add">₱</span>
          <Input
            id="amount"
            type="number"
            min="1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            mono
          />
        </div>
      </div>
      <div>
        <Label htmlFor="terms" required>
          Terms
        </Label>
        <div className="affix">
          <Input
            id="terms"
            type="number"
            min="1"
            required
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            mono
            className="lead"
          />
          <span className="add">mo</span>
        </div>
      </div>
      <div>
        <Label htmlFor="addonMonths" required>
          Addon months
        </Label>
        <div className="affix">
          <Input
            id="addonMonths"
            type="number"
            min="1"
            required
            value={addonMonths}
            onChange={(e) => setAddonMonths(e.target.value)}
            mono
            className="lead"
          />
          <span className="add">mo</span>
        </div>
      </div>
      {coverageMessage ? (
        <div className="sm:col-span-2">
          <Alert variant="warning">{coverageMessage}</Alert>
        </div>
      ) : null}
      {!interviewComplete ? (
        <div className="sm:col-span-2">
          <Alert variant="warning">
            {interviewBlockReason ??
              "Initial interview must be recorded before preparing the loan computation"}
          </Alert>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Button
          type="submit"
          loading={computing}
          block
          disabled={!interviewComplete}
        >
          {computation ? "Recalculate" : "Compute"}
        </Button>
      </div>
    </form>
  );

  if (computation) {
    return (
      <div className="card emi !max-w-none">
        <div className="in">
          <div className="mb-4">
            <div className="font-display text-lg font-semibold text-navy-900">
              Computation
            </div>
            <p className="text-sm text-ink-500">
              {computation.loanTypeName ?? "Loan"} ·{" "}
              {computation.inputMode.replace(/_/g, " ")}
            </p>
          </div>
          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {editable ? (
            form
          ) : (
            <p className="text-sm text-ink-500">
              Computation is locked once the file is endorsed.
            </p>
          )}

          <div className="mt-5 border-t border-line-soft pt-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              How this was computed
            </div>
            <div className="space-y-2.5">
              {buildComputationSteps(computation).map((step) => (
                <div key={step.label} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-900">{step.label}</div>
                    <div className="mono text-xs text-ink-400">{step.formula}</div>
                  </div>
                  <div className="mono shrink-0 text-sm font-semibold text-ink-900">
                    ₱{formatMoney(step.value)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line-soft pt-3 text-xs text-ink-400">
              <span>
                PF rate <b className="mono text-ink-700">{pct(computation.pfRate)}</b>
              </span>
              <span>
                Interest{" "}
                <b className="mono text-ink-700">{pct(computation.interestRate)}/mo</b>
              </span>
              <span>
                Security <b className="mono text-ink-700">{pct(computation.securityFeeRate)}</b>
              </span>
            </div>
          </div>
        </div>
        <div className="out">
          <div>
            <div className="ok">Monthly amortization</div>
            <div className="ov" style={{ color: "var(--teal-400)" }}>
              ₱{formatMoney(computation.monthlyAmortization)}
            </div>
          </div>
          {breakdown.map((item) => {
            const isKey = KEY_AMOUNT_KEYS.has(item.key);
            return (
              <div key={item.key} className="row2">
                <span>{item.label}</span>
                <b style={isKey ? { color: "var(--teal-400)" } : undefined}>
                  {formatMoney(item.amount)}
                </b>
              </div>
            );
          })}
          <div className="row2" style={{ borderTop: "1px dashed rgba(255,255,255,.2)" }}>
            <span className="flex items-center gap-2">
              <i
                className="dot"
                style={{
                  background: computation.signedAt
                    ? "var(--success)"
                    : "var(--warning)",
                }}
              />
              {computation.signedAt ? "Signed by borrower" : "Awaiting signature"}
            </span>
            {computation.signedAt ? (
              <b className="font-normal text-navy-200" style={{ fontSize: 11.5 }}>
                {new Date(computation.signedAt).toLocaleDateString()}
              </b>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
        Computation
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        No computation recorded yet — run one below to see the amortization
        breakdown.
      </p>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {editable ? form : <p className="text-sm text-ink-500">Nothing to show.</p>}
    </Card>
  );
}
