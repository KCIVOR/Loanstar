import type { BusinessInfo } from "@/lib/borrowers/business-info";
import type { BorrowerProfile } from "@/lib/borrowers/types";

import type { BlriData } from "./blri-data";
import { formatMoney } from "@/lib/documents/format";
import type { ReleasePath } from "./constants";

/** Additive scope — omit or pass seafarer to keep Seafarer merge context unchanged. */
export type ReleaseTemplateScope = {
  segment?: "seafarer" | "sme" | "individual" | null;
};

function smeBusinessSlots(businessInfo: BusinessInfo | undefined): {
  companyName: string;
  natureOfBusiness: string;
  businessAddress: string;
} {
  const biz = businessInfo ?? {};
  return {
    companyName: (biz.companyName ?? "").trim(),
    natureOfBusiness: (biz.natureOfBusiness ?? "").trim(),
    businessAddress: (biz.officeAddress ?? biz.companyAddress ?? "").trim(),
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function chunkToWords(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

/** Non-negative integer in words, e.g. 121997 → "One Hundred Twenty One Thousand". */
function wholeToWords(whole: number): string {
  if (whole === 0) return "Zero";
  const groups: number[] = [];
  let remaining = whole;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (groups[i] === 0) continue;
    words.push(`${chunkToWords(groups[i])}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return words.join(" ");
}

/** Whole-peso amount in words, e.g. 90000 → "Ninety Thousand Pesos". */
export function pesosInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  if (whole === 0) return "Zero Pesos";
  return `${wholeToWords(whole)} Pesos`;
}

/**
 * Peso amount in words including centavos, matching the LSLGC legal-document
 * house style: "One Hundred Fifteen Thousand ... Pesos & Fifty Seven Cents",
 * or just "... Pesos" when the amount is whole.
 */
export function pesosAndCentavosInWords(amount: number): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100);
  const base = `${wholeToWords(whole)} Pesos`;
  return cents > 0 ? `${base} & ${wholeToWords(cents)} Cents` : base;
}

/** Small count in the "Six (6)" house style. Returns "" for null/invalid. */
export function countInWords(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  const int = Math.floor(n);
  return `${wholeToWords(int)} (${int})`;
}

/**
 * Monthly interest rate in the LSLGC house style:
 * 0.025 → "Two and Fifty hundredths percent (2.50%)", 0.03 → "Three percent (3.00%)".
 */
export function pctInWords(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "";
  const asPercent = rate * 100;
  const intPart = Math.floor(asPercent);
  const frac = Math.round((asPercent - intPart) * 100);
  const figure = `${asPercent.toFixed(2)}%`;
  const head = wholeToWords(intPart);
  return frac > 0
    ? `${head} and ${wholeToWords(frac)} hundredths percent (${figure})`
    : `${head} percent (${figure})`;
}

function joinAddress(a: BorrowerProfile["presentAddress"]): string {
  return [a.street, a.barangay, a.city, a.province, a.zipCode]
    .filter(Boolean)
    .join(", ");
}

export type ReleaseComputation = {
  netReleased: number;
  releaseDate: string | null;
  addonMonths?: number | null;
  interestRate?: number | null;
  loanTypeName?: string | null;
  processingFee?: number | null;
  securityFee?: number | null;
  docStamp?: number | null;
  adminCost?: number | null;
  notaryFee?: number | null;
  /**
   * Display names (already resolved from `computations.computed_by` /
   * `.signed_by` by the caller — this function stays synchronous/pure, so it
   * cannot itself look up a profile). Audit fix: `{{preparedBy}}`/
   * `{{approvedBy}}` were referenced by templates but never populated.
   * "Checked By" has no third actor tracked anywhere in the system yet —
   * stays a blank signature line, same convention as the notary Doc/Page/
   * Book No. fields below.
   */
  preparedByName?: string | null;
  approvedByName?: string | null;
};

function pct(rate: number | null | undefined): string {
  return rate == null ? "" : `${(rate * 100).toFixed(2)}%`;
}

function money(value: number | null | undefined): string {
  return value == null ? "" : formatMoney(value);
}

type AccountingEntry = {
  description: string;
  accountCode: string;
  debit: string;
  credit: string;
};

/**
 * Flatten the release data into the merge context consumed by document
 * templates (keys match `src/lib/documents/templates/fields.ts`). Path-aware:
 * `with_pdc` disburses by check (Bank account), `without_pdc` by cash.
 *
 * Fields the system does not yet capture (e.g. the disbursement check number)
 * resolve to empty strings — templates render them blank until that data is
 * plumbed, rather than blocking migration.
 */
export function buildReleaseTemplateContext(
  blri: BlriData,
  computation: ReleaseComputation,
  borrower: BorrowerProfile,
  releasePath: ReleasePath,
  scope?: ReleaseTemplateScope,
): Record<string, unknown> {
  const isCheck = releasePath === "with_pdc";
  const disbursementCode = isCheck ? "1100115" : "1100110";
  const disbursementLabel = isCheck ? "Bank" : "CASH";
  const isSme = scope?.segment === "sme";
  const isIndividual = scope?.segment === "individual";
  const sme = isSme ? smeBusinessSlots(borrower.businessInfo) : null;

  // Existing release templates bind manningAgency / principalShip — for SME,
  // fill those slots from business_info so published templates do not blank
  // (Phase 8.3: one template + segment-conditional merge values). Individual
  // has neither a business nor a manning agency/vessel — resolve both slots to
  // empty strings (the file's own established convention for uncaptured
  // fields) rather than guess placeholder content; Phase 10.3 needs the
  // client's confirmation of what, if anything, these slots should show for
  // a personal loan before this is filled in for real.
  const manningAgency = isSme
    ? (sme?.companyName ?? "")
    : isIndividual
      ? ""
      : (borrower.manningAgency?.name ?? "");
  const principalShip = isSme
    ? (sme?.natureOfBusiness || sme?.businessAddress || "")
    : isIndividual
      ? ""
      : (borrower.picWork?.vessel ?? "");
  const loanReceivableDescription = isSme
    ? "Loans Receivable - SME Loan"
    : isIndividual
      ? "Loans Receivable - Individual Loan"
      : "Loans Receivable - Seafarer Loan";

  const accountingEntries: AccountingEntry[] = [
    {
      description: loanReceivableDescription,
      accountCode: "1100001",
      debit: formatMoney(blri.principal),
      credit: "",
    },
    {
      description: disbursementLabel,
      accountCode: disbursementCode,
      debit: "",
      credit: formatMoney(computation.netReleased),
    },
    ...blri.particulars.map((p) => ({
      description: p.label,
      accountCode: p.accountCode,
      debit: "",
      credit: formatMoney(p.amount),
    })),
  ];

  const base: Record<string, unknown> = {
    companyName: "Loan Star Lending Group Corp.",
    borrowerName: blri.borrowerName,
    borrowerNo: borrower.borrowerNo,
    address: joinAddress(borrower.presentAddress),
    manningAgency,
    principalShip,

    loanAccountNo: blri.loanAccountNo,
    loanType: computation.loanTypeName ?? "",
    principal: formatMoney(blri.principal),
    principalInWords: pesosInWords(blri.principal),
    loanAmount: formatMoney(blri.principal),
    totalInterest: formatMoney(blri.totalInterest),
    totalLoan: formatMoney(blri.totalLoan),
    totalLoanInWords: pesosInWords(blri.totalLoan),
    monthlyAmortization: formatMoney(blri.monthlyAmortization),
    monthlyAmortizationInWords: pesosInWords(blri.monthlyAmortization),
    terms: String(blri.terms),
    addonMonths: computation.addonMonths != null ? String(computation.addonMonths) : "",
    interestRate: pct(computation.interestRate),
    firstPaymentDate: blri.firstPaymentDate,
    paymentEnds: blri.pdcSchedule.at(-1)?.checkDate ?? "",
    netLoanAmount: formatMoney(computation.netReleased),
    amountInWords: pesosInWords(computation.netReleased),
    dateReleased: computation.releaseDate ?? "",
    todayDate: computation.releaseDate ?? "",

    processingFee: money(computation.processingFee),
    securityFee: money(computation.securityFee),
    docStamp: money(computation.docStamp),
    adminCost: money(computation.adminCost),
    notaryFee: money(computation.notaryFee),

    bankName: borrower.financial?.bankName ?? "",
    bankAccountNo: borrower.financial?.accountNumber ?? "",
    checkAmount: formatMoney(computation.netReleased),
    // Audit fix: the BLRI "CHEQUE INFORMATION" block's own check number/date
    // (the disbursement check itself, distinct from the borrower's security
    // PDCs in `pdcSchedule`) has no source anywhere in the system — no table
    // tracks a disbursement check separately. Left blank rather than guessed.
    checkNumber: "",
    checkDate: "",
    // Calculator SME.xlsm's own samples show this as the loan account number
    // with its "LA" prefix swapped for "CV" (e.g. LA201270 -> CV201270) — a
    // display label derived from data already on hand, not invented. Loan
    // account numbers without that prefix fall back to blank.
    checkVoucherNo: blri.loanAccountNo.replace(/^LA/i, "CV") === blri.loanAccountNo
      ? ""
      : blri.loanAccountNo.replace(/^LA/i, "CV"),

    // Audit fix: referenced by blri / check_voucher / cash_voucher /
    // final_computation_sheet / the 3 ar_*_voucher templates, never
    // populated — always blank. `computedBy`/`signedBy` (real actor ids on
    // `computations`) are resolved to names by the caller and passed in as
    // `preparedByName`/`approvedByName`. No third "checked by" actor is
    // tracked anywhere yet, so that slot stays a blank signature line.
    preparedBy: computation.preparedByName ?? "",
    checkedBy: "",
    approvedBy: computation.approvedByName ?? "",

    // --- LSLGC legal-document merge keys (loan_agreement / disclosure_statement
    //     / promissory_note v2). Uncaptured fields resolve to "" per this file's
    //     established convention; helpers above produce the house-style wording. ---
    principalAndCentavosInWords: pesosAndCentavosInWords(blri.principal),
    totalLoanAndCentavosInWords: pesosAndCentavosInWords(blri.totalLoan),
    monthlyAmortizationAndCentavosInWords: pesosAndCentavosInWords(
      blri.monthlyAmortization,
    ),
    netLoanAndCentavosInWords: pesosAndCentavosInWords(computation.netReleased),
    termsInWords: countInWords(blri.terms),
    interestRateInWords: pctInWords(computation.interestRate),
    preTerminationRate: pct(computation.interestRate),
    preTerminationRateInWords: pctInWords(computation.interestRate),

    numberOfPdcs: String(blri.pdcSchedule.length),
    numberOfPdcsInWords: countInWords(blri.pdcSchedule.length),
    perCheckAmount: formatMoney(blri.pdcSchedule[0]?.amount ?? 0),
    perCheckAmountInWords: pesosAndCentavosInWords(
      blri.pdcSchedule[0]?.amount ?? 0,
    ),

    loanStartDate: blri.firstPaymentDate,
    loanMaturityDate: blri.pdcSchedule.at(-1)?.checkDate ?? "",
    executionDate: computation.releaseDate ?? "",
    executionPlace: "Makati City",

    lenderAddress:
      "4th Floor Carson Building, Orense Corner Del Carmen St., Guadalupe Nuevo, Makati City",
    lenderTin: "008-890-767-000",
    lenderRepresentative: "Kristoffer John C. Dela Cruz",
    lenderRepresentativeTin: "942-356-927-000",
    lenderRepresentativeTitle: "President",
    authorizedSignatory: "Reden G. Mayor",

    borrowerRepresentative: isSme
      ? (borrower.businessInfo?.companyOfficers?.[0]?.name ?? "")
      : "",
    borrowerRepresentativeTitle: isSme
      ? (borrower.businessInfo?.companyOfficers?.[0]?.position ??
        borrower.businessInfo?.position ??
        "")
      : "",
    boardResolutionNo: "",
    corporateSecretary: "",
    borrowerTin: isSme ? (borrower.businessInfo?.tin ?? "") : "",

    notaryDocNo: "",
    notaryPageNo: "",
    notaryBookNo: "",
    notarySeries: "",

    // --- LSLGC servicing documents, now selectable in the LRA release modal as
    //     optional picks (cancellation of chattel / REM mortgage, voluntary
    //     surrender + deed of sale, SPA for cancellation, agreement for
    //     replacement of checks, agreement for consolidation). Party / amount /
    //     date slots are filled from the loan; slots describing events that have
    //     not happened at release time (mortgage registration nos., surrender
    //     amount, redemption period, the new replacement checks, the borrower's
    //     other loans) stay "" / [] for the notary/officer to complete. ---
    isCorpOrDti: isSme,
    witnessOne: "",
    witnessTwo: "",

    // Agreement for Replacement of Checks — the underlying chattel loan is this loan.
    chattelReleaseDate: computation.releaseDate ?? "",
    totalObligation: formatMoney(blri.totalLoan),
    totalObligationInWords: pesosAndCentavosInWords(blri.totalLoan),
    amortStartDate: blri.firstPaymentDate,
    amortMaturityDate: blri.pdcSchedule.at(-1)?.checkDate ?? "",
    checkReplacementDate: "",
    lenderDepositBank: "",
    lenderDepositAccountName: "",
    lenderDepositAccountNo: "",
    replacementChecks: [] as unknown[],

    // Agreement for Consolidation — "additional loan" = this loan; the totals
    // across the borrower's other active loans are not resolved here.
    additionalLoanAmount: formatMoney(blri.principal),
    additionalLoanAmountInWords: pesosAndCentavosInWords(blri.principal),
    additionalLoanTermMonths: String(blri.terms),
    additionalLoanInterestRate: pct(computation.interestRate),
    additionalLoanTotal: formatMoney(blri.totalLoan),
    additionalLoanTotalInWords: pesosAndCentavosInWords(blri.totalLoan),
    priorLoans: [] as unknown[],
    priorLoansCount: "",
    allLoansTotal: "",
    allLoansTotalInWords: "",

    // Cancellation of Chattel / Real Estate Mortgage — the mortgage being
    // cancelled is this loan's own security; only its secured amount + execution
    // date are known before it is notarised and registered.
    priorMortgageAmount: formatMoney(blri.totalLoan),
    priorMortgageAmountInWords: pesosAndCentavosInWords(blri.totalLoan),
    priorMortgageExecutedOn: computation.releaseDate ?? "",
    priorMortgageDocNo: "",
    priorMortgagePageNo: "",
    priorMortgageBookNo: "",
    priorMortgageSeries: "",
    priorMortgageNotary: "",
    priorMortgageNotaryPlace: "",
    priorMortgageRegistryOfDeeds: "",
    cancellationPageCount: "",

    // Voluntary Surrender + Deed of Absolute Sale — surrender occurs on default,
    // long after release; the outstanding amount + redemption period are unknown.
    surrenderDebtAmount: "",
    surrenderDebtAmountInWords: "",
    redemptionPeriod: "",

    // Collateral line-item detail (make / plate / engine / chassis / TCT / area
    // / technical description) is not captured anywhere in the system yet — these
    // repeats render header-only until a collateral-detail model exists.
    vehicles: [] as unknown[],
    properties: [] as unknown[],

    // Amount / date / count slots the Disclosure Statement form fills in.
    amountFinanced: formatMoney(blri.principal),
    financeChargeInterest: formatMoney(blri.totalInterest),
    totalInstallmentPayments: formatMoney(blri.totalLoan),
    installmentCount: String(blri.terms),
    disclosureFromDate: blri.firstPaymentDate,
    disclosureToDate: blri.pdcSchedule.at(-1)?.checkDate ?? "",

    // Loan Agreement structural flags. Default: a Seafarer/Individual loan is a
    // standard monthly PDC loan; an SME loan is treated as corporate. The
    // bi-monthly / per-day / invoice product variants and DTI sole-prop are not
    // inferable from release data yet — they stay false until captured.
    isCorporateBorrower: isSme,
    isDtiBorrower: false,
    isIndividualBorrower: isIndividual,
    hasSecurityCheck: true,
    isBiMonthly: false,
    isPerDayInterest: false,
    hasInvoiceAnnex: false,
    isNonPdc: !isCheck,
    invoices: [] as unknown[],

    isCheck,
    isCash: !isCheck,

    particulars: blri.particulars.map((p) => ({
      label: p.label,
      amount: formatMoney(p.amount),
      accountCode: p.accountCode,
    })),
    pdcSchedule: blri.pdcSchedule.map((r) => ({
      checkDate: r.checkDate,
      checkNumber: r.checkNumber ?? "",
      amount: formatMoney(r.amount),
      bankName: r.bankName,
      refAccount: "",
    })),
    accountingEntries,
  };

  // Additive SME-only keys — Seafarer context stays key-identical to pre-Phase 8.
  if (isSme && sme) {
    base.isSme = true;
    base.isSeafarer = false;
    base.businessCompanyName = sme.companyName;
    base.businessNature = sme.natureOfBusiness;
    base.businessAddress = sme.businessAddress;
  }

  return base;
}
