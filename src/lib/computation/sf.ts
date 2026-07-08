import {
  fromCentavos,
  halfUp,
  rateOf,
  sumHalfUp,
  toCentavos,
} from "./money";
import type {
  InputMode,
  OtherDeductions,
  PfComponents,
  SfComputeInput,
  SfComputeResult,
} from "./types";

const PROCESSING_NUM = 6;
const PROCESSING_DEN = 100;
const DOC_STAMP_NUM = 75;
const DOC_STAMP_DEN = 10_000;
const NOTARY_NUM = 1;
const NOTARY_DEN = 1_000;

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

function otherDeductionsTotal(other: Required<OtherDeductions>): number {
  return sumHalfUp(
    other.otherLoan,
    other.offset,
    other.advancePayment,
    other.previousLoanBalance,
    other.accountOpening,
  );
}

function pfRateParts(pfRate: number): { num: number; den: number } {
  const den = 10_000;
  const num = Math.round(pfRate * den);
  return { num, den };
}

/** PF bundle line items per SF spec §5 — admin is residual. */
export function computePfComponents(
  principal: number,
  pfRate: number,
): PfComponents {
  const pC = toCentavos(principal);
  const { num: pfNum, den: pfDen } = pfRateParts(pfRate);
  const pfTotalC = rateOf(pC, pfNum, pfDen + pfNum);
  const processingC = rateOf(pC, PROCESSING_NUM, PROCESSING_DEN);
  const docStampC = rateOf(pC, DOC_STAMP_NUM, DOC_STAMP_DEN);
  const notaryC = rateOf(pC, NOTARY_NUM, NOTARY_DEN);
  const adminC = pfTotalC - processingC - docStampC - notaryC;
  const pfBundleC = processingC + docStampC + notaryC + adminC;

  return {
    pfTotal: fromCentavos(pfTotalC),
    processingFee: fromCentavos(processingC),
    docStamp: fromCentavos(docStampC),
    notaryFee: fromCentavos(notaryC),
    adminCost: fromCentavos(adminC),
    pfBundle: fromCentavos(pfBundleC),
  };
}

function computeFromPrincipal(
  principal: number,
  input: Required<
    Pick<
      SfComputeInput,
      | "inputMode"
      | "terms"
      | "addonMonths"
      | "pfRate"
      | "interestRate"
      | "securityFeeRate"
    >
  > & { inputAmount: number; other: Required<OtherDeductions> },
): SfComputeResult {
  const pf = computePfComponents(principal, input.pfRate);
  const pC = toCentavos(principal);
  const { num: secNum, den: secDen } = pfRateParts(input.securityFeeRate);
  const securityC = rateOf(pC, secNum, secDen);
  const otherTotal = otherDeductionsTotal(input.other);
  const otherC = toCentavos(otherTotal);
  const pfBundleC = toCentavos(pf.pfBundle);
  const totalDeductionsC = pfBundleC + securityC + otherC;
  const netReleased =
    input.inputMode === "NET_LESS_SECURITY"
      ? fromCentavos(pC - pfBundleC - securityC - otherC)
      : fromCentavos(pC - totalDeductionsC);

  const { num: intNum, den: intDen } = pfRateParts(input.interestRate);
  const periods = input.terms + input.addonMonths;
  const interestC = rateOf(pC * periods, intNum, intDen);
  const totalLoanC = pC + interestC;
  const monthlyC = Math.round(totalLoanC / input.terms);

  return {
    inputMode: input.inputMode,
    inputAmount: input.inputAmount,
    terms: input.terms,
    addonMonths: input.addonMonths,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    securityFeeRate: input.securityFeeRate,
    otherDeductions: input.other,
    otherDeductionsTotal: otherTotal,
    principal: fromCentavos(pC),
    ...pf,
    securityFee: fromCentavos(securityC),
    totalDeductions: fromCentavos(totalDeductionsC),
    netReleased,
    totalInterest: fromCentavos(interestC),
    totalLoan: fromCentavos(totalLoanC),
    monthlyAmortization: fromCentavos(monthlyC),
  };
}

function solvePrincipal(
  inputMode: InputMode,
  amount: number,
  pfRate: number,
  securityFeeRate: number,
  otherTotal: number,
): number {
  if (inputMode === "PRINCIPAL") {
    return amount;
  }

  const targetC = toCentavos(amount);
  const otherC = toCentavos(otherTotal);
  const { num: secNum, den: secDen } = pfRateParts(securityFeeRate);

  let lo = targetC;
  let hi = targetC * 3;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const P = fromCentavos(mid);
    const { pfBundle } = computePfComponents(P, pfRate);
    const pfBundleC = toCentavos(pfBundle);
    const securityC = rateOf(mid, secNum, secDen);

    if (inputMode === "NET_SARADO") {
      const netC = mid - pfBundleC - securityC - otherC;
      if (netC > targetC) {
        hi = mid - 1;
      } else {
        lo = mid;
      }
    } else {
      const grossC = mid - pfBundleC - otherC;
      if (grossC > targetC) {
        hi = mid - 1;
      } else {
        lo = mid;
      }
    }
  }

  return fromCentavos(lo);
}

/**
 * SF computation engine — implements LoanStar_SF_Computation_Specification.
 * HALF-UP at each labeled step; centavo integers internally (G3).
 */
export function computeSfLoan(input: SfComputeInput): SfComputeResult {
  const addonMonths = input.addonMonths ?? 2;
  if (addonMonths < 1) {
    throw new Error("addonMonths must be at least 1 (G1)");
  }

  const other = normalizeOtherDeductions(input.otherDeductions);
  const otherTotal = otherDeductionsTotal(other);
  const principal = solvePrincipal(
    input.inputMode,
    input.amount,
    input.pfRate,
    input.securityFeeRate,
    otherTotal,
  );

  return computeFromPrincipal(principal, {
    inputMode: input.inputMode,
    inputAmount: input.amount,
    terms: input.terms,
    addonMonths,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    securityFeeRate: input.securityFeeRate,
    other,
  });
}
