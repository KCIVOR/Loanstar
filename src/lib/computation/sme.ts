import { fromCentavos, rateOf, sumHalfUp, toCentavos } from "./money";
import type { OtherDeductions } from "./types";

/** Doc stamp = ₱1.50 per ₱200 of principal = 0.75%. */
const DOC_STAMP_NUM = 75;
const DOC_STAMP_DEN = 10_000;
/** SME notary = 0.09% (SF uses 0.1%). */
const NOTARY_NUM = 9;
const NOTARY_DEN = 10_000;

export type SmeComputeInput = {
  /** Amount in Loan Desired mode (extraction §4). */
  loanDesired: number;
  terms: number;
  /** Workbook default observed: 0 (unlike SF G1 which requires ≥ 1). */
  addonMonths?: number;
  pfRate: number;
  interestRate: number;
  /** Outside the PF bundle: loan_desired × admin_rate. */
  adminRate: number;
  /**
   * Per-account flag (`With DS & Notary` / `No DS & Notary`).
   * When false, doc stamp and notary are 0 and processing fee = full PF bundle.
   */
  withDsAndNotary?: boolean;
  /**
   * Workbook `ProrateDS` toggle. Default off (full-year DS).
   * Day-proration not implemented until a product needs it.
   */
  prorateDocStamp?: boolean;
  /** Chattel mortgage rate; unused in typical SME path (default 0). */
  chattelRate?: number;
  otherDeductions?: OtherDeductions;
};

export type SmeComputeResult = {
  loanDesired: number;
  terms: number;
  addonMonths: number;
  pfRate: number;
  interestRate: number;
  adminRate: number;
  withDsAndNotary: boolean;
  otherDeductions: Required<OtherDeductions>;
  otherDeductionsTotal: number;
  /** loan_desired × pf_rate */
  pfBundle: number;
  processingFee: number;
  docStamp: number;
  notaryFee: number;
  adminCost: number;
  /** Unused in SME flow — always 0. */
  securityFee: number;
  chattelFee: number;
  principal: number;
  totalDeductions: number;
  netReleased: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
};

function normalizeOtherDeductions(
  other?: OtherDeductions,
): Required<OtherDeductions> {
  return {
    otherLoan: other?.otherLoan ?? 0,
    offset: other?.offset ?? 0,
    advancePayment: other?.advancePayment ?? 0,
    previousLoanBalance: other?.previousLoanBalance ?? 0,
    accountOpening: other?.accountOpening ?? 0,
  };
}

function rateParts(rate: number): { num: number; den: number } {
  const den = 10_000;
  const num = Math.round(rate * den);
  return { num, den };
}

/**
 * SME computation engine — Loan Desired mode from Calculator SME.xlsm (§4).
 * Centavos HALF-UP at each labeled step (same convention as `computeSfLoan`).
 * Do not reuse or modify `sf.ts` — residual fee logic is inverted.
 */
export function computeSmeLoan(input: SmeComputeInput): SmeComputeResult {
  const addonMonths = input.addonMonths ?? 0;
  if (addonMonths < 0) {
    throw new Error("addonMonths must be ≥ 0 for SME");
  }

  const withDsAndNotary = input.withDsAndNotary ?? true;
  const other = normalizeOtherDeductions(input.otherDeductions);
  const otherLines = sumHalfUp(
    other.otherLoan,
    other.offset,
    other.advancePayment,
    other.previousLoanBalance,
    other.accountOpening,
  );

  const desiredC = toCentavos(input.loanDesired);
  const { num: pfNum, den: pfDen } = rateParts(input.pfRate);
  const pfBundleC = rateOf(desiredC, pfNum, pfDen);
  const principalC = desiredC + pfBundleC;

  // Interest: principal × monthly_rate × (terms + addon). Multiply in centavos
  // with the raw rate so repeating decimals (e.g. 1.666…%) stay accurate —
  // packing the rate into 1/10000 parts would distort rates like 1/60.
  const periods = input.terms + addonMonths;
  const interestC = Math.round(principalC * input.interestRate * periods);
  const totalLoanC = principalC + interestC;
  const monthlyC = Math.round(totalLoanC / input.terms);

  const { num: adminNum, den: adminDen } = rateParts(input.adminRate);
  const adminC = rateOf(desiredC, adminNum, adminDen);

  // ProrateDS default OFF → full-year doc stamp (extraction §4.1).
  // Day-proration left unimplemented until credit policy needs it.
  void input.prorateDocStamp;
  let docStampC = 0;
  let notaryC = 0;
  if (withDsAndNotary) {
    docStampC = rateOf(principalC, DOC_STAMP_NUM, DOC_STAMP_DEN);
    notaryC = rateOf(principalC, NOTARY_NUM, NOTARY_DEN);
  }

  // Processing fee is the residual plug inside the PF bundle.
  const processingC = pfBundleC - docStampC - notaryC;

  const { num: chattelNum, den: chattelDen } = rateParts(input.chattelRate ?? 0);
  const chattelC = rateOf(principalC, chattelNum, chattelDen);

  // Security fee label exists in the workbook but is unused in the SME flow.
  const securityC = 0;

  const otherC = toCentavos(otherLines);
  const totalDeductionsC =
    adminC +
    otherC +
    docStampC +
    processingC +
    securityC +
    notaryC +
    chattelC;

  return {
    loanDesired: fromCentavos(desiredC),
    terms: input.terms,
    addonMonths,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    adminRate: input.adminRate,
    withDsAndNotary,
    otherDeductions: other,
    otherDeductionsTotal: otherLines,
    pfBundle: fromCentavos(pfBundleC),
    processingFee: fromCentavos(processingC),
    docStamp: fromCentavos(docStampC),
    notaryFee: fromCentavos(notaryC),
    adminCost: fromCentavos(adminC),
    securityFee: fromCentavos(securityC),
    chattelFee: fromCentavos(chattelC),
    principal: fromCentavos(principalC),
    totalDeductions: fromCentavos(totalDeductionsC),
    netReleased: fromCentavos(principalC - totalDeductionsC),
    totalInterest: fromCentavos(interestC),
    totalLoan: fromCentavos(totalLoanC),
    monthlyAmortization: fromCentavos(monthlyC),
  };
}
