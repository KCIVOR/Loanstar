import { halfUp } from "./money";
import { formatDateLocal } from "./release-date";

export type DailyInterestInput = {
  principal: number;
  /** Raw monthly rate, e.g. 0.03 for 3% — same convention as
   * `computations.interest_rate` (sme.ts/sf.ts). */
  monthlyRate: number;
  releaseDate: Date;
  /** CSA-entered manual payment date — must be after releaseDate. */
  paymentDate: Date;
};

export type DailyInterestResult = {
  principal: number;
  monthlyRate: number;
  dailyRate: number;
  releaseDate: string;
  paymentDate: string;
  days: number;
  interest: number;
  totalDue: number;
};

/** Whole calendar days between two dates, using local calendar fields
 * (not raw millisecond subtraction, which drifts across a DST transition)
 * — same discipline as `formatDateLocal`'s own doc comment. */
function daysBetween(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}

/**
 * Daily Interest computation — short-term, single-payment loans. Interest
 * accrues per actual day elapsed (monthly rate ÷ 30), not per calendar
 * month. Produces exactly one payment (principal + interest), never a
 * recurring schedule.
 *
 * Formula: dailyRate = monthlyRate ÷ 30; interest = principal × dailyRate × days.
 * Worked example: ₱100,000 principal, 3% monthly, 5 days → ₱500 interest,
 * ₱100,500 total due.
 */
export function computeDailyInterestLoan(
  input: DailyInterestInput,
): DailyInterestResult {
  const days = daysBetween(input.releaseDate, input.paymentDate);
  if (days < 1) {
    throw new Error("Payment date must be after release date");
  }

  const dailyRate = input.monthlyRate / 30;
  const interest = halfUp(input.principal * dailyRate * days);

  return {
    principal: input.principal,
    monthlyRate: input.monthlyRate,
    dailyRate,
    releaseDate: formatDateLocal(input.releaseDate),
    paymentDate: formatDateLocal(input.paymentDate),
    days,
    interest,
    totalDue: halfUp(input.principal + interest),
  };
}
