import {
  advanceSemiMonthly,
  computeFirstPaymentDate,
} from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";

function formatDateLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type AmortizationInstallment = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
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
   * cadence (the default) is completely unchanged by this parameter. */
  paymentFrequency?: "monthly" | "semi_monthly";
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
    const due = new Date(firstPayment);
    due.setMonth(due.getMonth() + i);
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
