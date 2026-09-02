import {
  addCalendarMonths,
  advanceSemiMonthly,
  computeFirstPaymentDate,
} from "../computation/release-date";
import { halfUp } from "../computation/money";

function formatDateLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type AmortizationInstallment = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  lineType?: "standard" | "interest" | "principal";
};

export function generateAmortizationSchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  addonMonths: number;
  dueDay?: number;
  totalLoan?: number;
  /**
   * The computation's own already-computed first payment date (e.g.
   * `computation.firstPaymentDate`) — pass this whenever it's available.
   * Segment-specific rules (SME's release+1-month, vs. Seafarer's 22nd
   * cutoff) are only applied once, in `persistComputation`; this function
   * used to *independently recompute* the date with the Seafarer rule
   * regardless of segment, silently diverging from the stored value and
   * from the LRA PDC schedule for every non-Seafarer loan. When omitted
   * (legacy callers / rows with no stored date), falls back to the old
   * recompute-from-releaseDate behavior for backward compatibility.
   */
  firstPaymentDate?: string | Date | null;
  /**
   * Salary loans only — semi-monthly (15th + end-of-month) cadence, twice
   * the installment count at half the monthly amount each. Assumes
   * `firstPaymentDate` is always supplied and already a genuine 15th/
   * end-of-month date (guaranteed by `persistComputation`, which only ever
   * sets `payment_frequency: "semi_monthly"` alongside a `first_payment_date`
   * computed by `computeSalaryFirstPaymentDate`) — the recompute-from-
   * releaseDate fallback above is not semi-monthly-aware and was never meant
   * to produce one. Every other
   * cadences (the default) are completely unchanged by this parameter.
   */
  paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily";
  totalInterest?: number;
}): AmortizationInstallment[] {
  const firstPayment = input.firstPaymentDate
    ? input.firstPaymentDate instanceof Date
      ? input.firstPaymentDate
      : new Date(input.firstPaymentDate)
    : computeFirstPaymentDate(
        input.releaseDate instanceof Date
          ? input.releaseDate
          : new Date(input.releaseDate),
        input.addonMonths,
        input.dueDay ?? 10,
      );

  if (input.paymentFrequency === "weekly" || input.paymentFrequency === "daily") {
    // Both are built directly by masterlist.ts's initializeArAccount, which
    // branches before ever calling this function — weekly needs
    // computeInvoiceLoan's escalating-rate engine, and daily is a single
    // manually-dated payment, neither of which fits this function's
    // "N installments spaced from firstPayment" shape. Throwing here (rather
    // than silently falling through to the monthly branch below) turns a
    // caller that reaches this by mistake into a loud failure instead of a
    // wrong schedule.
    throw new Error(
      `generateAmortizationSchedule does not handle "${input.paymentFrequency}" — build this schedule directly instead (see initializeArAccount)`,
    );
  }

  if (input.paymentFrequency === "quarterly") {
    if (!input.totalLoan || !input.totalInterest) {
      throw new Error("Quarterly loans require totalLoan and totalInterest");
    }
    return generateQuarterlySchedule({
      terms: input.terms,
      totalLoan: input.totalLoan,
      totalInterest: input.totalInterest,
      releaseDate: input.releaseDate,
      dueDay: input.dueDay,
    });
  }

  if (input.paymentFrequency === "two_monthly") {
    if (!input.totalLoan || !input.totalInterest) {
      throw new Error("Two-monthly loans require totalLoan and totalInterest");
    }
    return generateTwoMonthlySchedule({
      terms: input.terms,
      totalLoan: input.totalLoan,
      totalInterest: input.totalInterest,
      releaseDate: input.releaseDate,
      dueDay: input.dueDay,
    });
  }

  if (input.paymentFrequency === "bi_monthly") {
    return generateBiMonthlySchedule({
      terms: input.terms,
      monthlyAmortization: input.monthlyAmortization,
      releaseDate: input.releaseDate,
      totalLoan: input.totalLoan,
    });
  }

  if (input.paymentFrequency === "semi_monthly") {
    const anchor = formatDateLocal(firstPayment);
    const count = input.terms * 2;
    const half = halfUp(input.monthlyAmortization / 2);
    const semiMonthlyInstallments: AmortizationInstallment[] = [];
    for (let i = 0; i < count; i += 1) {
      let amountDue = half;
      if (i === count - 1 && input.totalLoan != null) {
        const prior = halfUp(half * (count - 1));
        const last = halfUp(input.totalLoan - prior);
        if (last > 0) amountDue = last;
      }
      semiMonthlyInstallments.push({
        installmentNo: i + 1,
        dueDate: advanceSemiMonthly(anchor, i),
        amountDue,
      });
    }
    return semiMonthlyInstallments;
  }

  const monthly = halfUp(input.monthlyAmortization);
  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < input.terms; i += 1) {
    const due = addCalendarMonths(firstPayment, i);
    let amountDue = monthly;
    if (i === input.terms - 1 && input.totalLoan != null) {
      const prior = halfUp(monthly * (input.terms - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(due),
      amountDue,
    });
  }

  return installments;
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "91+";

export type AgingThresholds = { t30: number; t60: number; t90: number };

export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  t30: 30,
  t60: 60,
  t90: 90,
};

export function computeAgingBucket(
  daysPastDue: number,
  thresholds: AgingThresholds = DEFAULT_AGING_THRESHOLDS,
): AgingBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= thresholds.t30) return "1-30";
  if (daysPastDue <= thresholds.t60) return "31-60";
  if (daysPastDue < thresholds.t90) return "61-90";
  return "91+";
}

export function daysPastDue(dueDate: string, asOf = new Date()): number {
  const due = new Date(dueDate);
  const diffMs = asOf.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function calculatePenaltyAmount(
  outstanding: number,
  penaltyRate: number,
): number {
  return halfUp(outstanding * penaltyRate);
}

/**
 * Bi-monthly schedule — payment every 15 days (not twice-monthly on specific dates).
 * Creates 2 installments per calendar month: terms × 2 total rows.
 */
export function generateBiMonthlySchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  totalLoan?: number;
}): AmortizationInstallment[] {
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const count = input.terms * 2;
  const half = halfUp(input.monthlyAmortization / 2);
  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < count; i += 1) {
    const due = new Date(release);
    due.setDate(due.getDate() + (i + 1) * 15);
    
    let amountDue = half;
    if (i === count - 1 && input.totalLoan != null) {
      const prior = halfUp(half * (count - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(due),
      amountDue,
    });
  }
  
  return installments;
}

/**
 * Shared by generateQuarterlySchedule/generateTwoMonthlySchedule — both are
 * "N interest-only payments then one final interest+principal payment"
 * schedules, differing only in the number of months between payments.
 * Dual-lines every payment (a due date has an "interest" row and a
 * "principal" row) rather than only the final one, so every row a reader
 * sees is unambiguously typed instead of mixing bare "installment" rows
 * with occasional split ones.
 */
function generateInterestPrincipalSplitSchedule(input: {
  terms: number;
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
  frequencyMonths: 2 | 3;
}): AmortizationInstallment[] {
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const dueDay = input.dueDay ?? 10;
  const principal = input.totalLoan - input.totalInterest;
  const numPayments = input.terms / input.frequencyMonths;

  const paymentAmount = halfUp(input.totalLoan / numPayments);
  const interestPerPayment = halfUp(input.totalInterest / numPayments);
  const principalPerPayment = halfUp(paymentAmount - interestPerPayment);

  const installments: AmortizationInstallment[] = [];
  let installmentNo = 1;

  for (let i = 1; i <= numPayments; i += 1) {
    const monthOffset = i * input.frequencyMonths;
    // Single atomic construction — dueDay is baked in from the start, so
    // the release date's own day-of-month (which can be 29-31) never gets
    // a chance to overflow the target month before dueDay is applied. The
    // old setMonth-then-setDate sequence could silently skip a whole month
    // this way; see docs/date-schedule-overflow-bug-fix-plan.md.
    const dueDate = addCalendarMonths(release, monthOffset, dueDay);

    const dueDateStr = formatDateLocal(dueDate);

    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: interestPerPayment,
      lineType: "interest",
    });

    let principalAmount = principalPerPayment;
    if (i === numPayments) {
      const priorPrincipal = halfUp(principalPerPayment * (numPayments - 1));
      principalAmount = halfUp(principal - priorPrincipal);
    }

    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: principalAmount,
      lineType: "principal",
    });
  }

  return installments;
}

/**
 * Quarterly schedule — interest-only payments every 3 months, dual-line
 * (interest + principal, split on the same due date) at every payment.
 * `terms` must be divisible by 3 (e.g. 6, 9, 12 months) — a non-divisible
 * term has no clean final quarter to land the principal on.
 */
export function generateQuarterlySchedule(input: {
  terms: number;
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms % 3 !== 0) {
    throw new Error("Quarterly loans require terms divisible by 3 (e.g. 6, 9, or 12 months)");
  }
  return generateInterestPrincipalSplitSchedule({ ...input, frequencyMonths: 3 });
}

/**
 * Two-monthly schedule — interest-only payments every 2 months, dual-line
 * (interest + principal, split on the same due date) at every payment.
 * `terms` must be divisible by 2 (e.g. 4, 6, 8, 10, 12 months).
 */
export function generateTwoMonthlySchedule(input: {
  terms: number;
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms % 2 !== 0) {
    throw new Error("Two-monthly loans require terms divisible by 2 (e.g. 4, 6, 8, 10, or 12 months)");
  }
  return generateInterestPrincipalSplitSchedule({ ...input, frequencyMonths: 2 });
}
