import {
  generateAmortizationSchedule,
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateQuarterlySpecialSchedule,
  generateTwoMonthlySchedule,
  generateTwoMonthlySpecialSchedule,
} from "../ar/schedule";
import { computeInvoiceLoan } from "./invoice";
import { halfUp } from "./money";
import { addCalendarMonths, formatDateLocal } from "./release-date";

export type ScheduleType =
  | "monthly"
  | "semi_monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily"
  | "quarterly_special"
  | "two_monthly_special"
  | null
  | undefined;

export type DiscountUnit = {
  /** What CSA picks and what `origination_discounts[].installmentNo` means
   * for this loan — "Month N" for Monthly/MPL/Seafarer, "Week N" for
   * Invoice, "Quarter N" for Quarterly, "Payment N" for Two-monthly/
   * Bi-Monthly/Salary. Quarterly/Two-monthly have fewer units than `terms`
   * (grouped by real due date); Salary/Bi-Monthly have `terms * 2` and
   * Invoice has `terms * 4` (one per real payment, confirmed 2026-08-31 —
   * CSA discounts a specific payment, never a bundle of several). */
  unitNo: number;
  label: string;
  dueDate: string | null;
  /** Real interest this unit carries — the basis the discount percentage is
   * applied against. */
  interestAmount: number;
  /** Which real `amortization_schedules.installment_no` values this unit's
   * discount reaches. Never includes a principal-only row (Quarterly/
   * Two-monthly's dual-line principal, Invoice's final payment) — waiving
   * "interest" on a principal row makes no sense. */
  installmentNos: number[];
};

/**
 * How many discount units a loan of this frequency/terms has — money-
 * independent, safe to call before a computation exists (e.g. validating a
 * request body). Quarterly/Two-monthly have far fewer real due dates than
 * `terms` (a 12-month Quarterly loan has 4, not 12); Salary/Bi-Monthly have
 * `terms * 2` and Invoice has `terms * 4` (real payments per month —
 * confirmed 2026-08-31 the client discounts per real payment, never a
 * bundle of several, for every schedule type); every other frequency's
 * unit count equals `terms`; Daily has none — it's a single, already-fixed
 * payment, nothing left to discount.
 */
export function maxDiscountUnits(paymentFrequency: ScheduleType, terms: number): number {
  if (paymentFrequency === "daily") return 0;
  if (paymentFrequency === "quarterly" || paymentFrequency === "quarterly_special") {
    return Math.floor(terms / 3);
  }
  if (paymentFrequency === "two_monthly" || paymentFrequency === "two_monthly_special") {
    return Math.floor(terms / 2);
  }
  if (paymentFrequency === "bi_monthly" || paymentFrequency === "semi_monthly") {
    return terms * 2;
  }
  // Invoice: one unit per real weekly payment — 4 weeks per month, always
  // (confirmed 2026-08-31 — every schedule type discounts per real payment,
  // not per calendar bundle; Invoice was the one remaining exception,
  // grouping 4 real weeks into one "Month" choice).
  if (paymentFrequency === "weekly") return terms * 4;
  return terms;
}

function unitLabel(paymentFrequency: ScheduleType, unitNo: number): string {
  if (paymentFrequency === "quarterly") return `Quarter ${unitNo}`;
  if (paymentFrequency === "quarterly_special") return `Quarter ${unitNo} (Special)`;
  if (paymentFrequency === "two_monthly_special") return `Payment ${unitNo} (Special)`;
  if (
    paymentFrequency === "two_monthly" ||
    paymentFrequency === "bi_monthly" ||
    paymentFrequency === "semi_monthly"
  ) {
    return `Payment ${unitNo}`;
  }
  if (paymentFrequency === "weekly") return `Week ${unitNo}`;
  return `Month ${unitNo}`;
}

/** Monthly (SME/MPL/Seafarer) only — one real row per month, one unit per
 * row. Salary/Bi-Monthly used to share this with a 2-rows-per-unit mode;
 * confirmed 2026-08-31 the client wants per-real-payment discount
 * selection, so they now get their own real-schedule-based units below
 * instead (matching how Quarterly/Two-monthly/Invoice already work). */
function flatMonthlyUnits(input: {
  paymentFrequency: ScheduleType;
  terms: number;
  totalInterest: number;
  firstPaymentDate?: string | Date | null;
}): DiscountUnit[] {
  const interestPerMonth = halfUp(input.totalInterest / input.terms);
  const anchor = input.firstPaymentDate
    ? input.firstPaymentDate instanceof Date
      ? input.firstPaymentDate
      : new Date(input.firstPaymentDate)
    : null;
  return Array.from({ length: input.terms }, (_, i) => {
    const unitNo = i + 1;
    let dueDate: string | null = null;
    if (anchor) {
      dueDate = formatDateLocal(addCalendarMonths(anchor, i));
    }
    return {
      unitNo,
      label: unitLabel(input.paymentFrequency, unitNo),
      dueDate,
      interestAmount: interestPerMonth,
      installmentNos: [unitNo],
    };
  });
}

/**
 * Real, frequency-aware discount units — reuses the exact same generators
 * PDC/AR use (`computeInvoiceLoan`, `generateBiMonthlySchedule`,
 * `generateQuarterlySchedule`, `generateTwoMonthlySchedule`) so "how much
 * interest does Month/Quarter/Payment N actually carry" can never disagree
 * with what actually gets billed. Only interest-bearing rows are ever
 * discount targets — Invoice's final principal row and Quarterly/
 * Two-monthly's principal line are never included.
 *
 * Safe to call before release (schedule.ts's generators are pure, no
 * Supabase/server dependency) — used both as a compute-time preview
 * (ComputationPanel, computation.ts) and the real per-row basis at release
 * (ar/masterlist.ts).
 */
export function buildDiscountUnits(input: {
  paymentFrequency: ScheduleType;
  terms: number;
  principal: number;
  totalInterest: number;
  totalLoan: number;
  releaseDate: string | Date | null;
  firstPaymentDate?: string | Date | null;
  dueDay?: number | null;
}): DiscountUnit[] {
  const terms = input.terms;
  if (!Number.isFinite(terms) || terms < 1) return [];

  if (input.paymentFrequency === "daily") return [];

  if (input.paymentFrequency === "weekly") {
    // One unit per real weekly payment (confirmed 2026-08-31 — CSA
    // discounts a specific payment, not a whole calendar month; Invoice was
    // the last schedule type still bundling multiple real payments — 4
    // weeks — into a single "Month" choice).
    if (!input.releaseDate) return [];
    const result = computeInvoiceLoan({
      principal: input.principal,
      terms,
      releaseDate:
        input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate),
    });
    return result.weeklySchedule.map((week) => ({
      unitNo: week.weekNo,
      label: `Week ${week.weekNo}`,
      dueDate: week.dueDate,
      interestAmount: week.amountDue,
      installmentNos: [week.weekNo],
    }));
  }

  if (
    input.paymentFrequency === "quarterly" ||
    input.paymentFrequency === "two_monthly" ||
    input.paymentFrequency === "quarterly_special" ||
    input.paymentFrequency === "two_monthly_special"
  ) {
    if (!input.releaseDate) return [];
    const releaseDate =
      input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
    const scheduleArgs = {
      terms,
      totalLoan: input.totalLoan,
      totalInterest: input.totalInterest,
      releaseDate,
      dueDay: input.dueDay ?? 10,
    };
    const rows =
      input.paymentFrequency === "quarterly"
        ? generateQuarterlySchedule(scheduleArgs)
        : input.paymentFrequency === "quarterly_special"
          ? generateQuarterlySpecialSchedule(scheduleArgs)
          : input.paymentFrequency === "two_monthly_special"
            ? generateTwoMonthlySpecialSchedule(scheduleArgs)
            : generateTwoMonthlySchedule(scheduleArgs);
    // Generator always emits (interest, principal) pairs in that order —
    // see generateInterestPrincipalSplitSchedule in ar/schedule.ts. The
    // Special variants keep this same pair shape (principal is just 0 on
    // every row but the last), so the i += 2 stride still lines up.
    const units: DiscountUnit[] = [];
    for (let i = 0, unitNo = 1; i < rows.length; i += 2, unitNo += 1) {
      const interestRow = rows[i];
      units.push({
        unitNo,
        label: unitLabel(input.paymentFrequency, unitNo),
        dueDate: interestRow.dueDate,
        interestAmount: interestRow.amountDue,
        installmentNos: [interestRow.installmentNo],
      });
    }
    return units;
  }

  if (input.paymentFrequency === "bi_monthly") {
    // One unit per real payment (confirmed 2026-08-31 — CSA discounts a
    // specific payment, not a whole calendar month) — reuses the exact same
    // generator PDC/AR use, same pattern as Quarterly/Two-monthly above.
    if (!input.releaseDate) return [];
    const releaseDate =
      input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
    const monthlyAmortization = halfUp(input.totalLoan / terms);
    const rows = generateBiMonthlySchedule({
      terms,
      monthlyAmortization,
      releaseDate,
      totalLoan: input.totalLoan,
    });
    const interestPerRow = halfUp(input.totalInterest / rows.length);
    return rows.map((row) => ({
      unitNo: row.installmentNo,
      label: unitLabel("bi_monthly", row.installmentNo),
      dueDate: row.dueDate,
      interestAmount: interestPerRow,
      installmentNos: [row.installmentNo],
    }));
  }

  if (input.paymentFrequency === "semi_monthly") {
    // One unit per real payment, same reasoning as Bi-Monthly above. Needs
    // a real firstPaymentDate — Salary's date rule (advanceSemiMonthly)
    // only lives inside generateAmortizationSchedule, not a standalone
    // generator, so it's reused directly rather than duplicated here.
    if (!input.firstPaymentDate) return [];
    const monthlyAmortization = halfUp(input.totalLoan / terms);
    const rows = generateAmortizationSchedule({
      terms,
      monthlyAmortization,
      releaseDate: input.releaseDate ?? input.firstPaymentDate,
      addonMonths: 0,
      firstPaymentDate: input.firstPaymentDate,
      totalLoan: input.totalLoan,
      paymentFrequency: "semi_monthly",
    });
    const interestPerRow = halfUp(input.totalInterest / rows.length);
    return rows.map((row) => ({
      unitNo: row.installmentNo,
      label: unitLabel("semi_monthly", row.installmentNo),
      dueDate: row.dueDate,
      interestAmount: interestPerRow,
      installmentNos: [row.installmentNo],
    }));
  }

  // Monthly (SME/MPL/Seafarer, the default) — 1 real row per month.
  return flatMonthlyUnits(input);
}
