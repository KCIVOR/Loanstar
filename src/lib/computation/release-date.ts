/**
 * Release-month cutoff (§8): 22nd–21st window.
 * First payment = release month + addon months on due_day.
 */
export function computeFirstPaymentDate(
  releaseDate: Date,
  addonMonths: number,
  dueDay = 10,
): Date {
  const year = releaseDate.getFullYear();
  const month = releaseDate.getMonth();
  const day = releaseDate.getDate();

  let baseMonth = month;
  let baseYear = year;

  if (day >= 22) {
    baseMonth += 1;
    if (baseMonth > 11) {
      baseMonth = 0;
      baseYear += 1;
    }
  }

  const targetMonth = baseMonth + addonMonths;
  const targetYear = baseYear + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const paymentDay = Math.min(dueDay, lastDay);

  return new Date(targetYear, normalizedMonth, paymentDay);
}

/**
 * SME and Individual (`payment_schedule` anything other than "salary")
 * first-payment rule, updated 2026-08-29 (see
 * docs/payment-schedule-unification-plan.md): one month after release plus
 * `addonMonths`, same day-of-month — no 22nd-cutoff, no fixed due-day,
 * unlike `computeFirstPaymentDate`. Short target months clamp to their last
 * day (e.g. Jan 31 release → Feb 28/29), same technique as
 * `computeFirstPaymentDate`. MPL reuses this function verbatim — confirmed
 * no separate function is needed for it (Salary/MPL plan, Audit #7). Only
 * Seafarer keeps `computeFirstPaymentDate`.
 */
export function computeSmeFirstPaymentDate(
  releaseDate: Date,
  addonMonths = 0,
): Date {
  const year = releaseDate.getFullYear();
  const month = releaseDate.getMonth();
  const day = releaseDate.getDate();

  const targetMonth = month + 1 + addonMonths;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const paymentDay = Math.min(day, lastDay);

  return new Date(targetYear, normalizedMonth, paymentDay);
}

/**
 * Salary (`payment_schedule === "salary"`, SME or Individual) first-payment
 * rule, updated 2026-08-29 (see docs/payment-schedule-unification-plan.md):
 * the next occurrence of {15th,
 * end-of-month} on or after the release date, plus `addonMonths` full months
 * — release day ≤ 15 → that month's 15th; else → that month's last day; then
 * shifted forward by `addonMonths` while keeping the same 15th/end-of-month
 * phase (mirrors `computeFirstPaymentDate` / `computeSmeFirstPaymentDate`).
 * This is only the *starting* point; the full semi-monthly cadence for every
 * subsequent payment is `advanceSemiMonthly`, below.
 */
export function computeSalaryFirstPaymentDate(
  releaseDate: Date,
  addonMonths = 0,
): Date {
  const year = releaseDate.getFullYear();
  const month = releaseDate.getMonth();
  const day = releaseDate.getDate();
  const isFifteenth = day <= 15;

  const targetMonth = month + addonMonths;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  if (isFifteenth) {
    return new Date(targetYear, normalizedMonth, 15);
  }
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, lastDay);
}

/**
 * Advances a semi-monthly (Salary) "YYYY-MM-DD" anchor date by `index` steps
 * through the alternating 15th / end-of-month sequence — e.g. from an
 * end-of-month anchor: same month's end (index 0) → next month's 15th (1) →
 * that month's end (2) → the following month's 15th (3) → … Shared by the
 * LRA PDC builder, `savePdcChecks`, and the AR schedule generator, exactly
 * the way `addScheduleMonths` is already shared for the monthly case — so
 * none of them can disagree about a semi-monthly loan's schedule either.
 * Not for any monthly-cadence loan (Seafarer/SME/MPL) — those keep using
 * `addScheduleMonths`.
 */
export function advanceSemiMonthly(anchorDate: string, index: number): string {
  const parsed = new Date(anchorDate);
  let year = parsed.getFullYear();
  let month = parsed.getMonth();
  // phase 0 = the month's 15th; phase 1 = the month's last day.
  let phase: 0 | 1 = parsed.getDate() === 15 ? 0 : 1;

  for (let i = 0; i < index; i += 1) {
    if (phase === 0) {
      phase = 1;
    } else {
      phase = 0;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  const day = phase === 0 ? 15 : new Date(year, month + 1, 0).getDate();
  return formatDateLocal(new Date(year, month, day));
}

/**
 * Advances a "YYYY-MM-DD" date string by `index` months — used to build a
 * PDC schedule's per-check dates from its first check date. Shared by the
 * LRA page (building the on-screen draft) and `savePdcChecks` (validating
 * what gets submitted), so the two can never disagree with each other.
 *
 * Deliberately reproduces `Date.setMonth`'s plain overflow behavior exactly
 * as-is (e.g. Jan 31 + 1 month rolls into March, not clamped to Feb 28) —
 * this is a straight extraction of existing behavior, not a correctness
 * fix. Changing that behavior is a separate decision.
 */
export function addScheduleMonths(anchorDate: string, index: number): string {
  const date = new Date(anchorDate);
  date.setMonth(date.getMonth() + index);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a `Date` as "YYYY-MM-DD" using its *local* calendar fields
 * (getFullYear/getMonth/getDate), never `.toISOString()`. Use this for any
 * `Date` built via the numeric constructor (`new Date(year, month, day)`,
 * as `computeFirstPaymentDate` does) — `.toISOString()` converts to UTC
 * first, which silently rolls local midnight back to the previous calendar
 * day in any timezone ahead of UTC (confirmed: this is exactly how
 * `computations.first_payment_date` ended up saved one day early).
 */
export function formatDateLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
