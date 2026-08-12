import type { BusinessInfo } from "@/lib/borrowers/business-info";
import type { BorrowerProfile } from "@/lib/borrowers/types";

import type { BlriData } from "./blri-data";
import { formatMoney } from "@/lib/documents/format";
import type { ReleasePath } from "./constants";

/** Additive scope — omit or pass seafarer to keep Seafarer merge context unchanged. */
export type ReleaseTemplateScope = {
  segment?: "seafarer" | "sme" | null;
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

/** Whole-peso amount in words, e.g. 90000 → "Ninety Thousand Pesos". */
export function pesosInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  if (whole === 0) return "Zero Pesos";
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
  return `${words.join(" ")} Pesos`;
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
  const sme = isSme ? smeBusinessSlots(borrower.businessInfo) : null;

  // Existing release templates bind manningAgency / principalShip — for SME,
  // fill those slots from business_info so published templates do not blank
  // (Phase 8.3: one template + segment-conditional merge values).
  const manningAgency = isSme
    ? (sme?.companyName ?? "")
    : (borrower.manningAgency?.name ?? "");
  const principalShip = isSme
    ? (sme?.natureOfBusiness || sme?.businessAddress || "")
    : (borrower.picWork?.vessel ?? "");
  const loanReceivableDescription = isSme
    ? "Loans Receivable - SME Loan"
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
