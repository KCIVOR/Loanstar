import { fromCentavos, rateOf, toCentavos } from "./money";

/** Actual calendar days, excluding the release day, as Excel DAYS(end,start).
 * UTC day numbers avoid DST/hour offsets while preserving local date inputs.
 */
export function documentaryStampTermDays(release: Date, maturity: Date): number {
  const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  const days = dayNumber(maturity) - dayNumber(release);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("Documentary stamp requires a maturity date on or after the release date");
  }
  return days;
}

/** Client SF workbook rule: 0.75% of principal, prorated below 365 days.
 * Round once at the final centavo, not at an intermediate annual tax/rate.
 */
export function computeDocumentaryStamp(principal: number, termDays: number): number {
  if (!Number.isInteger(termDays) || termDays < 0) {
    throw new Error("Documentary stamp term must be a non-negative whole number of days");
  }
  return fromCentavos(rateOf(toCentavos(principal), 75 * Math.min(termDays, 365), 10_000 * 365));
}
