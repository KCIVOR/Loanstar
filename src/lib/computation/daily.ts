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
  /** Daily rate = `monthlyRate ÷ daysInReleaseMonth` (the single divisor used
   * for the whole loan — see the JSDoc on `computeDailyInterestLoan`). */
  dailyRate: number;
  /** Calendar length (28–31) of the release month — the divisor. */
  daysInReleaseMonth: number;
  releaseDate: string;
  paymentDate: string;
  /** Whole calendar days from releaseDate to paymentDate. */
  days: number;
  /** Interest, half-up to 2 dp. */
  interest: number;
  /** principal + un-rounded interest, half-up to 2 dp (rounded once). */
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

/** Calendar days in the month of `d` (28–31), using local calendar fields —
 * same last-day-of-month idiom as `release-date.ts`
 * (`new Date(y, m + 1, 0).getDate()`). Leap-year February returns 29
 * (matches the SME calculator's `DAY(EOMONTH(F19,0))`). */
export function daysInMonthOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Parse a plain `YYYY-MM-DD` string to a local-midnight `Date` — so the day
 * the user typed is the day `computeDailyInterestLoan` counts, regardless of
 * server timezone. `new Date("2026-03-01")` is UTC midnight and, read with the
 * local getters this module uses, becomes Feb on a behind-UTC host. Falls back
 * to the native parser for anything that isn't a bare date. */
export function parseLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return new Date(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Daily Interest computation — short-term, single-payment loans. Produces
 * exactly one payment (principal + interest), never a recurring schedule.
 *
 * This mirrors the daily-loan formulas in `docs/Calculator SME.xlsm`
 * (sheet SME):
 *
 *   daysInReleaseMonth = DAY(EOMONTH(releaseDate, 0))      // K38, one value 28–31
 *   days               = paymentDate − releaseDate         // K39 = DAYS(F20,F19)
 *   dailyRate          = monthlyRate / daysInReleaseMonth  // L38 = F4/K38
 *   rawInterest        = principal × dailyRate × days       // W26 = V25*V6/K38*K39
 *   interest           = round(rawInterest, 2)              // ROUND(BM12,2)
 *   totalDue           = round(principal + rawInterest, 2)  // ROUND(BM11,2)
 *
 * Notes that follow from matching the sheet:
 *  - **One divisor for the whole loan** = the number of days in the *release*
 *    month. A loan whose days run into the next month is still divided by the
 *    release month's length (released 25 Feb, paid 5 Mar → all 23 days ÷ 28).
 *  - Anchored purely on the two dates passed in — no "today" / compute date.
 *    Callers are responsible for passing the real release date (the CSA compute
 *    path takes it as an explicit input).
 *  - Leap-year February divides by 29 (from `EOMONTH`, no special case).
 *  - Round once, at the end: the interest is *not* pre-rounded before being
 *    added to the principal for `totalDue`.
 *
 * Worked examples (₱100,000 principal, 3% monthly):
 *  - 5 days, released in a 30-day month → 5 × (3000 ÷ 30) = ₱500.00.
 *  - 5 days, released in July (31)      → 5 × (3000 ÷ 31) = ₱483.87.
 *  - 10 days, released in Feb 2026 (28) → 10 × (3000 ÷ 28) = ₱1,071.43.
 *  - released 10 Feb 2026, paid 5 Mar 2026 → 23 days ÷ 28 = ₱2,464.29.
 */
export function computeDailyInterestLoan(
  input: DailyInterestInput,
): DailyInterestResult {
  const days = daysBetween(input.releaseDate, input.paymentDate);
  if (days < 1) {
    throw new Error("Payment date must be after release date");
  }

  const daysInReleaseMonth = daysInMonthOf(input.releaseDate);
  const dailyRate = input.monthlyRate / daysInReleaseMonth;
  const rawInterest = input.principal * dailyRate * days;

  return {
    principal: input.principal,
    monthlyRate: input.monthlyRate,
    dailyRate,
    daysInReleaseMonth,
    releaseDate: formatDateLocal(input.releaseDate),
    paymentDate: formatDateLocal(input.paymentDate),
    days,
    interest: halfUp(rawInterest),
    totalDue: halfUp(input.principal + rawInterest),
  };
}
