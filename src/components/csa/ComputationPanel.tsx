"use client";

import { FormEvent, useEffect, useState } from "react";

import { buildDeductionBreakdownRows } from "@/lib/computation/deduction-breakdown";
import { halfUp } from "@/lib/computation/money";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Modal,
  Pagination,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";

type LoanType = {
  id: string;
  name: string;
  interestRate: number;
  pfRate: number;
  securityFeeRate: number;
};

type ActiveLoanOption = {
  loanApplicationId: string;
  loanAccountNo: string;
  outstandingBalance: number;
  monthlyAmortization: number;
  accountStatus: string;
  remainingInstallments?: number;
};

/** Never more than what's actually owed, rounded to centavos. */
function cappedOffsetAmount(monthly: number, monthCount: number, balance: number): number {
  return Math.min(halfUp(monthly * monthCount), balance);
}

/** One "Other Loan" row in the CSA form — account is optional (blank = manual/external). */
type OtherLoanRow = { accountNo: string; amount: string };

/** An applied offset selection, one per targeted loan account. */
type OffsetEntry = { accountNo: string | null; amount: number; months: number };

/** A loan block being edited live inside the offset modal, before Apply. */
type OffsetBlock = { accountNo: string; months: Set<number> };

export type Computation = {
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
  otherDeductions?: {
    otherLoan?: number;
    otherLoanAccountNo?: string | null;
    offset?: number;
    offsetAccountNo?: string | null;
    offsetMonths?: number | null;
    otherLoans?: Array<{ accountNo: string | null; amount: number }>;
    offsets?: Array<{ accountNo: string | null; amount: number; months: number | null }>;
    advancePayment?: number;
    accountOpening?: number;
  } | null;
  otherDeductionsTotal: number;
  totalDeductions: number;
  netReleased: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
  firstPaymentDate?: string | null;
  adminRate?: number | null;
  chattelRate?: number | null;
  chattelFee?: number | null;
  lineItems: Array<{ key: string; label: string; amount: number }>;
  coverageWarning: boolean;
  signedAt: string | null;
  witnessedBy: string | null;
  loanTypeName: string | null;
  loanTypeId?: string | null;
};

type ComputationPanelProps = {
  applicationId: string;
  loanTypeId: string | null;
  /** Drives which rate-input UI renders — free-text rates for sme/individual,
   * the existing loan-type-driven flow for seafarer. */
  segment: "seafarer" | "sme" | "individual";
  editable: boolean;
  computation: Computation | null;
  /** Borrower's past sme/individual rates, most recent first — read-only
   * reference, also used to pre-fill a brand-new (no active computation yet)
   * form. Not fetched by every caller (e.g. Committee mode) — defaults to
   * empty, which simply omits the history list/pre-fill. */
  rateHistory?: Array<{
    applicationNo: string | null;
    createdAt: string;
    pfRate: number;
    interestRate: number;
    adminRate: number | null;
    chattelRate: number | null;
  }>;
  onUpdated: () => void;
  /** When false, compute/recalculate is disabled (hard workflow sequence). */
  interviewComplete?: boolean;
  interviewBlockReason?: string | null;
  /** "csa" talks to the CSA computation endpoint (default). "committee" talks
   * to the committee override endpoint instead — same UI, different backend,
   * inheriting Override's existing status gate/audit trail/negotiation
   * side-effects rather than opening a new editing path. */
  mode?: "csa" | "committee";
  /** Extra fields merged into the POST body — e.g. committee mode's optional
   * `message` (logged as a negotiation offer note), which this shared panel
   * has no UI of its own for. */
  extraFields?: Record<string, unknown>;
};

export function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(rate: number) {
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

export type BreakdownRow = { label: string; formula: string; value: string };
export type BreakdownSection = { title: string; rows: BreakdownRow[] };

/** Full, client-facing formula breakdown for the standalone dev-tool page —
 * deliberately derived from the already-persisted computation fields (never
 * a parallel re-implementation of the sme/sf engines), so it can never drift
 * from the number the borrower/client actually sees or signs. */
export function buildDetailedComputationBreakdown(
  c: Computation,
  segment: "seafarer" | "sme" | "individual",
): BreakdownSection[] {
  const money = (n: number) => `₱${formatMoney(n)}`;
  const pfBundle = c.processingFee + c.docStamp + c.notaryFee + c.adminCost;
  const od = c.otherDeductions;
  const otherLoanRows = od?.otherLoans?.length
    ? od.otherLoans
    : od?.otherLoan
      ? [{ accountNo: od.otherLoanAccountNo ?? null, amount: od.otherLoan }]
      : [];
  const offsetRows = od?.offsets?.length
    ? od.offsets
    : od?.offset
      ? [{ accountNo: od.offsetAccountNo ?? null, amount: od.offset, months: od.offsetMonths ?? null }]
      : [];

  const sections: BreakdownSection[] = [
    {
      title: "Loan setup",
      rows: [
        { label: "Segment", formula: "As selected on the application", value: segment },
        { label: "Loan type", formula: "As selected on the application", value: c.loanTypeName ?? "—" },
        {
          label: "Input mode",
          formula: "How the entered amount is interpreted",
          value: INPUT_MODE_LABEL[c.inputMode] ?? c.inputMode,
        },
        { label: "Entered amount", formula: "As typed by staff", value: money(c.inputAmount) },
        { label: "Terms", formula: "Number of monthly amortizations", value: `${c.terms} months` },
        { label: "Addon months", formula: "Extra months included in the interest period", value: `${c.addonMonths} months` },
      ],
    },
    {
      title: "Rates applied",
      rows: [
        { label: "Interest rate", formula: "Per month, applied to principal × total periods", value: `${pct(c.interestRate)}/mo` },
        { label: "Processing fee rate", formula: "Applied to principal to size the fee bundle", value: pct(c.pfRate) },
        ...(c.adminRate != null
          ? [{ label: "Admin fee rate", formula: "Applied to principal", value: pct(c.adminRate) }]
          : []),
        ...(c.chattelRate != null
          ? [{ label: "Chattel mortgage fee (CMF) rate", formula: "Applied to principal", value: pct(c.chattelRate) }]
          : []),
        ...(c.securityFeeRate > 0
          ? [{ label: "Security fee rate", formula: "Applied to principal", value: pct(c.securityFeeRate) }]
          : []),
      ],
    },
    {
      title: "Step 1 — Principal",
      rows: [
        {
          label: "Principal",
          formula:
            c.inputMode === "PRINCIPAL"
              ? "Entered directly as the loan principal"
              : `Solved so Net Released = ${money(c.inputAmount)} (${INPUT_MODE_LABEL[c.inputMode] ?? c.inputMode})`,
          value: money(c.principal),
        },
      ],
    },
    {
      title: "Step 2 — Fee bundle",
      rows: [
        { label: "Processing fee", formula: `Sized so the bundle totals ${pct(c.pfRate)} of principal`, value: money(c.processingFee) },
        { label: "Doc stamp", formula: `Fixed rate on principal (≈ ${pct(c.principal ? c.docStamp / c.principal : 0)})`, value: money(c.docStamp) },
        { label: "Notary fee", formula: `Fixed rate on principal (≈ ${pct(c.principal ? c.notaryFee / c.principal : 0)})`, value: money(c.notaryFee) },
        { label: "Admin cost", formula: "Processing + Doc stamp + Notary + Admin cost", value: money(c.adminCost) },
        { label: "Fee bundle total", formula: `≈ ${pct(c.pfRate)} of principal (${money(c.principal)})`, value: money(pfBundle) },
      ],
    },
    ...(c.securityFee > 0 || c.securityFeeRate > 0
      ? [
          {
            title: "Step 3 — Security fee",
            rows: [
              {
                label: "Security fee",
                formula: `${money(c.principal)} × ${pct(c.securityFeeRate)}`,
                value: money(c.securityFee),
              },
            ],
          },
        ]
      : []),
    {
      title: "Step 4 — Other deductions",
      rows: [
        ...otherLoanRows.map((r, i) => ({
          label: `Other loan${otherLoanRows.length > 1 ? ` #${i + 1}` : ""}`,
          formula: r.accountNo ? `Deducted against account ${r.accountNo}` : "Manual / external — no linked account",
          value: money(r.amount),
        })),
        ...offsetRows.map((r, i) => ({
          label: `Offset${offsetRows.length > 1 ? ` #${i + 1}` : ""}`,
          formula: r.accountNo
            ? `${r.months ?? "—"} month(s) applied against ${r.accountNo}`
            : "Manual offset amount",
          value: money(r.amount),
        })),
        ...(od?.advancePayment
          ? [{ label: "Advance payment", formula: "Deducted upfront at release", value: money(od.advancePayment) }]
          : []),
        ...(od?.accountOpening
          ? [{ label: "Account opening", formula: "Deducted upfront at release", value: money(od.accountOpening) }]
          : []),
        ...(otherLoanRows.length === 0 && offsetRows.length === 0 && !od?.advancePayment && !od?.accountOpening
          ? [{ label: "Other deductions", formula: "None entered", value: money(0) }]
          : []),
        { label: "Other deductions total", formula: "Sum of the rows above", value: money(c.otherDeductionsTotal) },
      ],
    },
    {
      title: "Step 5 — Totals",
      rows: [
        {
          label: "Total deductions",
          formula: "Fee bundle + Security fee + Other deductions",
          value: money(c.totalDeductions),
        },
        { label: "Net released", formula: "Principal − Total deductions", value: money(c.netReleased) },
        {
          label: "Total interest",
          formula: `${money(c.principal)} × ${pct(c.interestRate)}/mo × (${c.terms} + ${c.addonMonths} addon) months`,
          value: money(c.totalInterest),
        },
        { label: "Total loan", formula: "Principal + Total interest", value: money(c.totalLoan) },
        { label: "Monthly amortization", formula: `Total loan ÷ ${c.terms} months`, value: money(c.monthlyAmortization) },
      ],
    },
    {
      title: "Schedule & checks",
      rows: [
        ...(c.firstPaymentDate
          ? [
              {
                label: "First payment date",
                formula: "Set per this segment/loan type's release-date policy",
                value: new Date(c.firstPaymentDate).toLocaleDateString(),
              },
            ]
          : []),
        ...(c.chattelFee
          ? [{ label: "Chattel mortgage fee (CMF)", formula: `${money(c.principal)} × ${pct(c.chattelRate ?? 0)}`, value: money(c.chattelFee) }]
          : []),
        {
          label: "Income coverage check",
          formula: "Monthly amortization vs. declared income, against policy threshold",
          value: c.coverageWarning ? "Flagged — exceeds threshold" : "Within threshold",
        },
        {
          label: "Signed",
          formula: "Borrower + witness sign-off status",
          value: c.signedAt ? `Signed ${new Date(c.signedAt).toLocaleDateString()}` : "Not yet signed",
        },
      ],
    },
  ];

  return sections;
}

/** Dev tool: stashes the full computation (plus segment, for labeling) under
 * a key the standalone breakdown page reads on load, then opens it in a new
 * tab. localStorage (not sessionStorage) so it survives being opened with
 * `noopener` — the new tab gets no `window.opener` to read the data from
 * directly, so it must fetch it back out of shared per-origin storage. */
function openComputationBreakdown(c: Computation, segment: "seafarer" | "sme" | "individual") {
  const payload = { ...c, segment };
  window.localStorage.setItem(
    `loanstar:computation-breakdown:${c.id}`,
    JSON.stringify(payload),
  );
  window.open(`/tools/computation-breakdown?id=${c.id}`, "_blank", "noopener");
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
  segment,
  editable,
  computation,
  rateHistory = [],
  onUpdated,
  interviewComplete = true,
  interviewBlockReason = null,
  mode = "csa",
  extraFields,
}: ComputationPanelProps) {
  const isRateEditableSegment = segment === "sme" || segment === "individual";
  const isIndividual = segment === "individual";
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [activeLoans, setActiveLoans] = useState<ActiveLoanOption[]>([]);

  /** Real remaining installments when known, else the balance÷monthly approximation. */
  function maxMonthsFor(accountNo: string): number {
    const match = activeLoans.find((l) => l.loanAccountNo === accountNo);
    if (!match) return 12;
    return Math.min(
      24,
      match.remainingInstallments !== undefined
        ? match.remainingInstallments
        : Math.ceil(match.outstandingBalance / (match.monthlyAmortization || 1)),
    );
  }

  const [inputMode, setInputMode] = useState<
    "NET_SARADO" | "NET_LESS_SECURITY" | "PRINCIPAL"
  >("NET_SARADO");
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("6");
  const [addonMonths, setAddonMonths] = useState("2");
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState(loanTypeId ?? "");
  // sme/individual free-text rates — percent-typed (e.g. "8" for 8%), converted
  // to decimal (0.08) only when building the POST body.
  const [interestRatePct, setInterestRatePct] = useState("");
  const [pfRatePct, setPfRatePct] = useState("");
  const [adminRatePct, setAdminRatePct] = useState("");
  const [chattelRatePct, setChattelRatePct] = useState("");
  const [otherLoanRows, setOtherLoanRows] = useState<OtherLoanRow[]>([
    { accountNo: "", amount: "" },
  ]);
  const [offsetEntries, setOffsetEntries] = useState<OffsetEntry[]>([]);
  const [offsetManualAmount, setOffsetManualAmount] = useState("");
  const [offsetModalOpen, setOffsetModalOpen] = useState(false);
  const [rateHistoryModalOpen, setRateHistoryModalOpen] = useState(false);
  const [rateHistorySearch, setRateHistorySearch] = useState("");
  const [rateHistoryYearFilter, setRateHistoryYearFilter] = useState("all");
  const [rateHistoryPage, setRateHistoryPage] = useState(0);
  const RATE_HISTORY_PAGE_SIZE = 8;
  const [modalBlocks, setModalBlocks] = useState<OffsetBlock[]>([
    { accountNo: "", months: new Set() },
  ]);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverageMessage, setCoverageMessage] = useState<string | null>(null);
  const [otherObligationsMessage, setOtherObligationsMessage] = useState<string | null>(null);

  // Both endpoints return `activeLoans` at the top level — CSA's dedicated
  // computation route, Committee's application detail route.
  const activeLoansSourceUrl =
    mode === "committee"
      ? `/api/committee/applications/${applicationId}`
      : `/api/csa/applications/${applicationId}/computation`;

  useEffect(() => {
    void fetch(activeLoansSourceUrl)
      .then((res) => res.json())
      .then((data: { activeLoans?: ActiveLoanOption[] }) => {
        if (data.activeLoans) {
          setActiveLoans(data.activeLoans);
        }
      })
      .catch(() => {});
  }, [activeLoansSourceUrl]);

  useEffect(() => {
    void fetch(`/api/${mode}/loan-types?segment=${segment}`)
      .then((res) => res.json())
      .then((data: { loanTypes: LoanType[] }) => {
        setLoanTypes(data.loanTypes);
        setSelectedLoanTypeId((current) => {
          const preferred = current || loanTypeId || "";
          // A held id can be stale (from before the segment filter existed,
          // or simply not in this segment's list) — fall back to the first
          // available option instead of leaving the dropdown pointed at
          // nothing. For sme/individual there's normally exactly one option,
          // so this also means staff never have to click it manually.
          const stillOffered = data.loanTypes.some((lt) => lt.id === preferred);
          return stillOffered ? preferred : (data.loanTypes[0]?.id ?? "");
        });
      });
  }, [loanTypeId, mode, segment]);

  // Hydrate inputs from the saved active computation so refresh keeps the
  // last calculated loan params instead of blank/default fields.
  const otherDeductionsKey = JSON.stringify(computation?.otherDeductions ?? null);
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
    if (isRateEditableSegment) {
      setInterestRatePct(String(computation.interestRate * 100));
      setPfRatePct(String(computation.pfRate * 100));
      setAdminRatePct(String((computation.adminRate ?? 0) * 100));
      setChattelRatePct(String((computation.chattelRate ?? 0) * 100));
    }
    const od = computation.otherDeductions;
    if (od?.otherLoans && od.otherLoans.length > 0) {
      setOtherLoanRows(
        od.otherLoans.map((e) => ({
          accountNo: e.accountNo ?? "",
          amount: String(e.amount),
        })),
      );
    } else if (od?.otherLoan) {
      setOtherLoanRows([
        { accountNo: od.otherLoanAccountNo ?? "", amount: String(od.otherLoan) },
      ]);
    } else {
      setOtherLoanRows([{ accountNo: "", amount: "" }]);
    }

    if (od?.offsets && od.offsets.length > 0) {
      setOffsetEntries(
        od.offsets.map((e) => ({
          accountNo: e.accountNo,
          amount: e.amount,
          months: e.months ?? 0,
        })),
      );
      setOffsetManualAmount("");
    } else if (od?.offset) {
      if (od.offsetAccountNo) {
        setOffsetEntries([
          { accountNo: od.offsetAccountNo, amount: od.offset, months: od.offsetMonths ?? 0 },
        ]);
        setOffsetManualAmount("");
      } else {
        setOffsetEntries([]);
        setOffsetManualAmount(String(od.offset));
      }
    } else {
      setOffsetEntries([]);
      setOffsetManualAmount("");
    }
  }, [
    computation?.id,
    computation?.inputMode,
    computation?.inputAmount,
    computation?.terms,
    computation?.addonMonths,
    computation?.loanTypeId,
    computation?.interestRate,
    computation?.pfRate,
    computation?.adminRate,
    computation?.chattelRate,
    isRateEditableSegment,
    otherDeductionsKey,
  ]);

  // Pre-fill sme/individual rate inputs from the borrower's most recent past
  // loan when there's no active computation yet (brand-new form) — a
  // convenience default only, never a locked value; the hydration effect
  // above always takes priority once a real computation exists.
  useEffect(() => {
    if (computation || !isRateEditableSegment || rateHistory.length === 0) return;
    const latest = rateHistory[0];
    setInterestRatePct(String(latest.interestRate * 100));
    setPfRatePct(String(latest.pfRate * 100));
    setAdminRatePct(String((latest.adminRate ?? 0) * 100));
    setChattelRatePct(String((latest.chattelRate ?? 0) * 100));
  }, [computation, isRateEditableSegment, rateHistory]);

  // Re-derive saved deduction amounts/months against the target accounts'
  // *current* balances — a saved computation can go stale (a real payment,
  // another transfer) between when it was saved and when it's reopened.
  // Deliberately its own effect, not folded into the hydration effect above:
  // `activeLoans` arrives from a separate async fetch that can resolve after
  // hydration has already run, and keying the hydration effect itself on
  // `activeLoans` would re-copy every field from the saved computation on
  // that second run, silently discarding any edit made in between. This
  // effect only ever touches the two deduction arrays.
  useEffect(() => {
    if (activeLoans.length === 0) return;

    setOffsetEntries((entries) =>
      entries.flatMap((e) => {
        if (!e.accountNo) return [e];
        const match = activeLoans.find((l) => l.loanAccountNo === e.accountNo);
        if (!match) return [e];
        const cap = maxMonthsFor(e.accountNo);
        if (cap <= 0) return []; // target already fully settled — drop the stale entry
        const cappedMonths = Math.min(e.months, cap);
        const cappedAmount = cappedOffsetAmount(
          match.monthlyAmortization,
          cappedMonths,
          match.outstandingBalance,
        );
        if (cappedMonths === e.months && cappedAmount === e.amount) return [e];
        return [{ ...e, months: cappedMonths, amount: cappedAmount }];
      }),
    );

    setOtherLoanRows((rows) =>
      rows.map((r) => {
        if (!r.accountNo) return r;
        const match = activeLoans.find((l) => l.loanAccountNo === r.accountNo);
        if (!match) return r;
        const capped = Math.min(Number(r.amount) || 0, match.outstandingBalance).toFixed(2);
        return capped === r.amount ? r : { ...r, amount: capped };
      }),
    );
    // Deliberately excludes offsetEntries/otherLoanRows (this effect writes
    // them — including them would re-run this on every write it makes) and
    // maxMonthsFor (recreated each render, but its output only meaningfully
    // changes when activeLoans does, already a dep below).
  }, [activeLoans, computation?.id]);

  // -- Other Loan rows -------------------------------------------------
  const usedOtherLoanAccounts = new Set(
    otherLoanRows.map((r) => r.accountNo).filter(Boolean),
  );

  function updateOtherLoanRowAccount(index: number, accountNo: string) {
    setOtherLoanRows((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const match = activeLoans.find((l) => l.loanAccountNo === accountNo);
        return {
          accountNo,
          amount: match ? match.outstandingBalance.toFixed(2) : r.amount,
        };
      }),
    );
  }

  function updateOtherLoanRowAmount(index: number, amount: string) {
    setOtherLoanRows((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        // A row tied to a real account can never be typed above what that
        // account actually owes — no custom/external row (accountNo empty)
        // has a real balance to check against, so it stays uncapped.
        const match = r.accountNo
          ? activeLoans.find((l) => l.loanAccountNo === r.accountNo)
          : undefined;
        const clamped =
          match && Number(amount) > match.outstandingBalance
            ? match.outstandingBalance.toFixed(2)
            : amount;
        return { ...r, amount: clamped };
      }),
    );
  }

  function addOtherLoanRow() {
    setOtherLoanRows((rows) => [...rows, { accountNo: "", amount: "" }]);
  }

  function removeOtherLoanRow(index: number) {
    setOtherLoanRows((rows) =>
      rows.length > 1
        ? rows.filter((_, i) => i !== index)
        : [{ accountNo: "", amount: "" }],
    );
  }

  // -- Offset modal ------------------------------------------------------
  const rateHistoryYears = Array.from(
    new Set(rateHistory.map((h) => String(new Date(h.createdAt).getFullYear()))),
  ).sort((a, b) => Number(b) - Number(a));

  const filteredRateHistory = rateHistory.filter((h) => {
    const matchesSearch = rateHistorySearch
      ? (h.applicationNo ?? "").toLowerCase().includes(rateHistorySearch.toLowerCase())
      : true;
    const matchesYear =
      rateHistoryYearFilter === "all"
        ? true
        : String(new Date(h.createdAt).getFullYear()) === rateHistoryYearFilter;
    return matchesSearch && matchesYear;
  });

  const rateHistoryPageCount = Math.max(
    1,
    Math.ceil(filteredRateHistory.length / RATE_HISTORY_PAGE_SIZE),
  );
  const rateHistoryPageSafe = Math.min(rateHistoryPage, rateHistoryPageCount - 1);
  const pagedRateHistory = filteredRateHistory.slice(
    rateHistoryPageSafe * RATE_HISTORY_PAGE_SIZE,
    rateHistoryPageSafe * RATE_HISTORY_PAGE_SIZE + RATE_HISTORY_PAGE_SIZE,
  );

  function useRateHistoryRow(h: {
    pfRate: number;
    interestRate: number;
    adminRate: number | null;
    chattelRate: number | null;
  }) {
    setInterestRatePct(String(h.interestRate * 100));
    setPfRatePct(String(h.pfRate * 100));
    setAdminRatePct(String((h.adminRate ?? 0) * 100));
    setChattelRatePct(String((h.chattelRate ?? 0) * 100));
    setRateHistoryModalOpen(false);
  }

  function openOffsetModal() {
    if (offsetEntries.length > 0) {
      setModalBlocks(
        offsetEntries.map((e) => {
          const accountNo = e.accountNo ?? "";
          // Prune to what's actually selectable now — a saved e.months
          // beyond the account's current real cap would otherwise sit in
          // the Set with no checkbox to represent or untick it.
          const cap = maxMonthsFor(accountNo);
          const months = new Set(
            Array.from({ length: e.months }, (_, i) => i + 1).filter((m) => m <= cap),
          );
          return { accountNo, months };
        }),
      );
    } else {
      setModalBlocks([{ accountNo: activeLoans[0]?.loanAccountNo ?? "", months: new Set() }]);
    }
    setOffsetModalOpen(true);
  }

  function updateModalBlockAccount(index: number, accountNo: string) {
    setModalBlocks((blocks) =>
      blocks.map((b, i) => (i === index ? { accountNo, months: new Set() } : b)),
    );
  }

  function toggleModalBlockMonth(index: number, month: number, checked: boolean) {
    setModalBlocks((blocks) =>
      blocks.map((b, i) => {
        if (i !== index) return b;
        const next = new Set(b.months);
        if (checked) next.add(month);
        else next.delete(month);
        return { ...b, months: next };
      }),
    );
  }

  function addModalBlock() {
    setModalBlocks((blocks) => [...blocks, { accountNo: "", months: new Set() }]);
  }

  function removeModalBlock(index: number) {
    setModalBlocks((blocks) =>
      blocks.length > 1
        ? blocks.filter((_, i) => i !== index)
        : [{ accountNo: "", months: new Set() }],
    );
  }

  function applyOffsetModal() {
    const entries: OffsetEntry[] = modalBlocks
      .filter((b) => b.months.size > 0)
      .map((b) => {
        const match = activeLoans.find((l) => l.loanAccountNo === b.accountNo);
        return {
          accountNo: b.accountNo || null,
          months: b.months.size,
          amount: match
            ? cappedOffsetAmount(match.monthlyAmortization, b.months.size, match.outstandingBalance)
            : 0,
        };
      });
    setOffsetEntries(entries);
    if (entries.length > 0) setOffsetManualAmount("");
    setOffsetModalOpen(false);
  }

  const usedOffsetAccounts = new Set(
    modalBlocks.map((b) => b.accountNo).filter(Boolean),
  );
  const offsetEntriesTotal = offsetEntries.reduce((sum, e) => sum + e.amount, 0);
  const modalGrandTotal = modalBlocks.reduce((sum, b) => {
    const match = activeLoans.find((l) => l.loanAccountNo === b.accountNo);
    return (
      sum +
      (match ? cappedOffsetAmount(match.monthlyAmortization, b.months.size, match.outstandingBalance) : 0)
    );
  }, 0);

  async function handleCompute(e: FormEvent) {
    e.preventDefault();
    if (!editable || !interviewComplete) return;
    setComputing(true);
    setError(null);
    setCoverageMessage(null);
    try {
      const otherLoansPayload = otherLoanRows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({ accountNo: r.accountNo || null, amount: Number(r.amount) }));

      const offsetsPayload =
        offsetEntries.length > 0
          ? offsetEntries.map((entry) => ({
              accountNo: entry.accountNo,
              amount: entry.amount,
              months: entry.months,
            }))
          : Number(offsetManualAmount) > 0
            ? [{ accountNo: null, amount: Number(offsetManualAmount), months: null }]
            : [];

      const computeUrl =
        mode === "committee"
          ? `/api/committee/applications/${applicationId}/override`
          : `/api/csa/applications/${applicationId}/computation`;

      const res = await fetch(
        computeUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMode,
            amount: Number(amount),
            terms: Number(terms),
            addonMonths: Number(addonMonths),
            loanTypeId: selectedLoanTypeId || loanTypeId,
            ...(otherLoansPayload.length > 0 || offsetsPayload.length > 0
              ? {
                  otherDeductions: {
                    otherLoans: otherLoansPayload,
                    offsets: offsetsPayload,
                  },
                }
              : {}),
            ...(isRateEditableSegment
              ? {
                  ...(interestRatePct.trim()
                    ? { interestRate: Number(interestRatePct) / 100 }
                    : {}),
                  ...(pfRatePct.trim() ? { pfRate: Number(pfRatePct) / 100 } : {}),
                  ...(adminRatePct.trim()
                    ? { adminRate: Number(adminRatePct) / 100 }
                    : {}),
                  ...(chattelRatePct.trim()
                    ? { chattelRate: Number(chattelRatePct) / 100 }
                    : {}),
                }
              : {}),
            ...extraFields,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        coverage?: { message?: string | null; warning?: boolean; otherMonthlyAmortization?: number };
      };
      if (!res.ok) throw new Error(data.error ?? "Computation failed");
      if (data.coverage?.message) {
        setCoverageMessage(data.coverage.message);
      } else {
        setCoverageMessage(null);
      }
      if (
        data.coverage?.otherMonthlyAmortization &&
        data.coverage.otherMonthlyAmortization > 0
      ) {
        setOtherObligationsMessage(
          `This borrower has other active loan account(s) with a combined amortization of ₱${data.coverage.otherMonthlyAmortization.toLocaleString("en-PH", { minimumFractionDigits: 2 })}/mo. ` +
          `This amount is included in the coverage ratio for Seafarer and Individual segments.`,
        );
      } else {
        setOtherObligationsMessage(null);
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Computation failed");
    } finally {
      setComputing(false);
    }
  }

  const deductionRows = computation
    ? buildDeductionBreakdownRows(computation.otherDeductions)
    : [];
  const breakdown = computation
    ? computation.lineItems
        .filter((item) => !AMORT_KEYS.has(item.key))
        .flatMap((item) =>
          item.key === "other_deductions" && deductionRows.length > 0
            ? deductionRows.map((row, i) => ({
                key: `other_deductions_${i}`,
                label: row.label,
                amount: row.amount,
              }))
            : [item],
        )
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
      {isRateEditableSegment ? (
        <>
          <div>
            <Label htmlFor="interestRatePct" required>
              Interest
            </Label>
            <div className="affix">
              <Input
                id="interestRatePct"
                type="number"
                min="0"
                step="0.01"
                required
                value={interestRatePct}
                onChange={(e) => setInterestRatePct(e.target.value)}
                mono
              />
              <span className="add">%/mo</span>
            </div>
          </div>
          <div>
            <Label htmlFor="pfRatePct" required>
              Processing fee
            </Label>
            <div className="affix">
              <Input
                id="pfRatePct"
                type="number"
                min="0"
                step="0.01"
                required
                value={pfRatePct}
                onChange={(e) => setPfRatePct(e.target.value)}
                mono
              />
              <span className="add">%</span>
            </div>
          </div>
          <div>
            <Label htmlFor="adminRatePct" required={!isIndividual}>
              Admin fee
            </Label>
            <div className="affix">
              <Input
                id="adminRatePct"
                type="number"
                min="0"
                step="0.01"
                required={!isIndividual}
                value={adminRatePct}
                onChange={(e) => setAdminRatePct(e.target.value)}
                mono
              />
              <span className="add">%</span>
            </div>
          </div>
          <div>
            <Label htmlFor="chattelRatePct" required={!isIndividual}>
              Chattel mortgage fee (CMF)
            </Label>
            <div className="affix">
              <Input
                id="chattelRatePct"
                type="number"
                min="0"
                step="0.01"
                required={!isIndividual}
                value={chattelRatePct}
                onChange={(e) => setChattelRatePct(e.target.value)}
                mono
              />
              <span className="add">%</span>
            </div>
          </div>
          {rateHistory.length > 0 ? (
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-line-soft p-2 text-xs text-ink-500">
              <span>
                {rateHistory.length} previous rate{rateHistory.length > 1 ? "s" : ""} on file for
                this borrower
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRateHistorySearch("");
                  setRateHistoryYearFilter("all");
                  setRateHistoryPage(0);
                  setRateHistoryModalOpen(true);
                }}
              >
                View
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
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
      <div className="sm:col-span-2">
        <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2/50 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Other deductions <span className="normal-case font-normal text-ink-400">(optional)</span>
            </span>
            {activeLoans.length > 0 ? (
              <span className="text-[11px] font-medium text-teal-700">
                {activeLoans.length} active loan account{activeLoans.length > 1 ? "s" : ""} on file
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Other Loan Section */}
            <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-line-soft bg-surface-1 p-3">
              <Label>Other Loan{otherLoanRows.length > 1 ? "s" : ""} (full buyout)</Label>
              <div className="flex flex-col gap-2.5">
                {otherLoanRows.map((row, index) => {
                  const rowOptions = activeLoans.filter(
                    (l) =>
                      l.loanAccountNo === row.accountNo ||
                      (!usedOtherLoanAccounts.has(l.loanAccountNo) &&
                        !usedOffsetAccounts.has(l.loanAccountNo)),
                  );
                  return (
                    <div key={index} className="flex items-start gap-1.5">
                      <div className="grid flex-1 grid-cols-2 gap-1.5">
                        {activeLoans.length > 0 ? (
                          <Select
                            aria-label={`Target loan ${index + 1}`}
                            value={row.accountNo}
                            onChange={(e) => updateOtherLoanRowAccount(index, e.target.value)}
                            title={
                              row.accountNo
                                ? `${row.accountNo} — ₱${formatMoney(
                                    activeLoans.find((l) => l.loanAccountNo === row.accountNo)
                                      ?.outstandingBalance ?? 0,
                                  )} balance`
                                : undefined
                            }
                          >
                            <option value="">None / Custom external loan</option>
                            {rowOptions.map((l) => (
                              <option key={l.loanAccountNo} value={l.loanAccountNo}>
                                {l.loanAccountNo} — ₱{formatMoney(l.outstandingBalance)} bal
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="flex items-center text-xs text-ink-500">Custom / external</span>
                        )}
                        <div className="affix">
                          <span className="add">₱</span>
                          <Input
                            aria-label={`Amount ${index + 1}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) => updateOtherLoanRowAmount(index, e.target.value)}
                            placeholder="0.00"
                            mono
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOtherLoanRow(index)}
                        className="mt-1 px-1 text-xs text-ink-400 hover:text-danger-700"
                        aria-label="Remove row"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={addOtherLoanRow}>
                + Add another loan
              </Button>
              <p className="text-[11px] text-ink-400">
                Full payoff amount(s) deducted from proceeds — account balance auto-fills, editable per row.
              </p>
            </div>

            {/* Offset Amount Section */}
            <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-line-soft bg-surface-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Offset amount</Label>
                {activeLoans.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={openOffsetModal}>
                    {offsetEntries.length > 0 ? "Edit selection" : "Select loan & months"}
                  </Button>
                ) : null}
              </div>

              {offsetEntries.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {offsetEntries.map((entry, i) => (
                    <div
                      key={i}
                      className="rounded-[var(--r-sm)] border border-line-soft bg-surface-2 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium text-ink-700">{entry.accountNo ?? "Custom"}</span>
                      <span className="text-ink-400"> · {entry.months} mo{entry.months > 1 ? "s" : ""} · </span>
                      <span className="mono font-medium text-navy-900">₱{formatMoney(entry.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-0.5 pt-0.5 text-xs">
                    <span className="text-ink-400">Combined offset total</span>
                    <span className="mono font-semibold text-navy-900">₱{formatMoney(offsetEntriesTotal)}</span>
                  </div>
                </div>
              ) : activeLoans.length === 0 ? (
                <div>
                  <Label htmlFor="offsetManualAmount">Offset amount (₱)</Label>
                  <div className="affix">
                    <span className="add">₱</span>
                    <Input
                      id="offsetManualAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={offsetManualAmount}
                      onChange={(e) => setOffsetManualAmount(e.target.value)}
                      placeholder="0.00"
                      mono
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-400">
                    No active accounts on file — partial payoff amount deducted from proceeds.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-ink-500">No months selected yet, or enter a custom amount:</p>
                  <div className="affix mt-1">
                    <span className="add">₱</span>
                    <Input
                      aria-label="Custom offset amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={offsetManualAmount}
                      onChange={(e) => setOffsetManualAmount(e.target.value)}
                      placeholder="0.00"
                      mono
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={offsetModalOpen}
        title="Select loans & months to offset"
        onClose={() => setOffsetModalOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOffsetModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyOffsetModal}>
              Apply
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {modalBlocks.map((block, index) => {
            const match = activeLoans.find((l) => l.loanAccountNo === block.accountNo);
            const maxMonths = maxMonthsFor(block.accountNo);
            const blockOptions = activeLoans.filter(
              (l) =>
                l.loanAccountNo === block.accountNo ||
                (!usedOffsetAccounts.has(l.loanAccountNo) &&
                  !usedOtherLoanAccounts.has(l.loanAccountNo)),
            );
            return (
              <div
                key={index}
                className="flex flex-col gap-2.5 rounded-[var(--r-md)] border border-line-soft bg-surface-1 p-3"
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <Label htmlFor={`offsetModalAccount-${index}`}>Target loan</Label>
                    <Select
                      id={`offsetModalAccount-${index}`}
                      value={block.accountNo}
                      onChange={(e) => updateModalBlockAccount(index, e.target.value)}
                    >
                      <option value="">Select an account…</option>
                      {blockOptions.map((l) => (
                        <option key={l.loanAccountNo} value={l.loanAccountNo}>
                          {l.loanAccountNo} — ₱{formatMoney(l.monthlyAmortization)}/mo · ₱{formatMoney(l.outstandingBalance)} bal
                        </option>
                      ))}
                    </Select>
                  </div>
                  {modalBlocks.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeModalBlock(index)}
                      className="mt-5 px-1 text-xs text-ink-400 hover:text-danger-700"
                      aria-label="Remove loan"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                {match ? (
                  <div>
                    <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                      How many months to cover
                    </div>
                    <p className="mb-2 text-[11px] text-ink-400">
                      Applied to the oldest unpaid months first, regardless of which boxes are checked — only the count matters.
                    </p>
                    <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-3">
                      {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => (
                        <Checkbox
                          key={m}
                          id={`offset-month-${index}-${m}`}
                          checked={block.months.has(m)}
                          onChange={(checked) => toggleModalBlockMonth(index, m, checked)}
                          label={`Month ${m}`}
                          description={`₱${formatMoney(match.monthlyAmortization)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
                      <span>
                        {block.months.size} month{block.months.size === 1 ? "" : "s"} selected
                      </span>
                      <span className="mono">
                        ₱{formatMoney(cappedOffsetAmount(match.monthlyAmortization, block.months.size, match.outstandingBalance))}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <Button type="button" variant="ghost" size="sm" onClick={addModalBlock}>
            + Add another loan
          </Button>

          <div className="flex items-center justify-between rounded-[var(--r-sm)] border border-line-soft bg-surface-2 px-3 py-2">
            <span className="text-xs font-medium text-ink-700">Combined offset total</span>
            <span className="mono text-sm font-semibold text-navy-900">₱{formatMoney(modalGrandTotal)}</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={rateHistoryModalOpen}
        title="Previous rates for this borrower"
        onClose={() => setRateHistoryModalOpen(false)}
        className="!max-w-3xl"
        footer={
          <Button type="button" variant="ghost" onClick={() => setRateHistoryModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              placeholder="Search by application no."
              value={rateHistorySearch}
              onChange={(e) => {
                setRateHistorySearch(e.target.value);
                setRateHistoryPage(0);
              }}
            />
          </div>
          <div className="w-40">
            <Select
              value={rateHistoryYearFilter}
              onChange={(e) => {
                setRateHistoryYearFilter(e.target.value);
                setRateHistoryPage(0);
              }}
            >
              <option value="all">All years</option>
              {rateHistoryYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
          <span className="text-xs text-ink-400">
            {filteredRateHistory.length} of {rateHistory.length} rate
            {rateHistory.length === 1 ? "" : "s"}
          </span>
        </div>

        {pagedRateHistory.length === 0 ? (
          <EmptyState
            title="No matching rates"
            description="Try clearing the search or year filter."
            showMark={false}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Application</Th>
                <Th>Date</Th>
                <Th num>Interest</Th>
                <Th num>Processing fee</Th>
                <Th num>Admin fee</Th>
                <Th num>CMF</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {pagedRateHistory.map((h, i) => (
                <tr key={`${h.applicationNo ?? "app"}-${i}`}>
                  <Td>{h.applicationNo ?? "—"}</Td>
                  <Td className="mono">{new Date(h.createdAt).toLocaleDateString()}</Td>
                  <Td num className="mono">{pct(h.interestRate)}/mo</Td>
                  <Td num className="mono">{pct(h.pfRate)}</Td>
                  <Td num className="mono">{h.adminRate ? pct(h.adminRate) : "—"}</Td>
                  <Td num className="mono">{h.chattelRate ? pct(h.chattelRate) : "—"}</Td>
                  <Td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => useRateHistoryRow(h)}
                    >
                      Use
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {filteredRateHistory.length > RATE_HISTORY_PAGE_SIZE ? (
          <Pagination
            className="mt-3"
            page={rateHistoryPageSafe + 1}
            pageCount={rateHistoryPageCount}
            onPageChange={(p) => setRateHistoryPage(p - 1)}
            summary={`Page ${rateHistoryPageSafe + 1} of ${rateHistoryPageCount}`}
          />
        ) : null}
      </Modal>
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
          {coverageMessage ? (
            <div className="mb-4">
              <Alert variant="warning">{coverageMessage}</Alert>
            </div>
          ) : null}
          {otherObligationsMessage ? (
            <div className="mb-4">
              <Alert variant="warning">{otherObligationsMessage}</Alert>
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                How this was computed
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => openComputationBreakdown(computation, segment)}
              >
                🛠 Dev tool — Full breakdown
              </Button>
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
          {computation.chattelFee ? (
            <div className="row2">
              <span>Chattel mortgage fee (CMF)</span>
              <b>{formatMoney(computation.chattelFee)}</b>
            </div>
          ) : null}
          {computation.firstPaymentDate ? (
            <div className="row2" style={{ borderTop: "1px dashed rgba(255,255,255,.2)" }}>
              <span>First payment date</span>
              <b>{new Date(computation.firstPaymentDate).toLocaleDateString()}</b>
            </div>
          ) : null}
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
              {computation.signedAt
                ? computation.witnessedBy
                  ? "Signed in-branch (witnessed by staff)"
                  : "Signed by borrower"
                : "Awaiting signature"}
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
      {coverageMessage ? (
        <div className="mb-4">
          <Alert variant="warning">{coverageMessage}</Alert>
        </div>
      ) : null}
      {otherObligationsMessage ? (
        <div className="mb-4">
          <Alert variant="warning">{otherObligationsMessage}</Alert>
        </div>
      ) : null}
      {editable ? form : <p className="text-sm text-ink-500">Nothing to show.</p>}
    </Card>
  );
}
