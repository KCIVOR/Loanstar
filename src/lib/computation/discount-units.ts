import {
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateTwoMonthlySchedule,
} from "../ar/schedule";
import { computeInvoiceLoan } from "./invoice";
import { halfUp } from "./money";

export type ScheduleType =
  | "monthly"
  | "semi_monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily"
  | null
  | undefined;

export type DiscountUnit = {
  /** What CSA picks and what `origination_discounts[].installmentNo` means
   * for this loan — "Month N" for most frequencies, but "Quarter N" /
   * "Payment N" for Quarterly/Two-monthly, since those don't have `terms`
   * real due dates. */
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
 * `terms` (a 12-month Quarterly loan has 4, not 12); every other frequency's
 * unit count equals `terms`; Daily has none — it's a single, already-fixed
 * payment, nothing left to discount.
 */
export function maxDiscountUnits(paymentFrequency: ScheduleType, terms: number): number {
  if (paymentFrequency === "daily") return 0;
  if (paymentFrequency === "quarterly") return Math.floor(terms / 3);
  if (paymentFrequency === "two_monthly") return Math.floor(terms / 2);
  return terms;
}

function unitLabel(paymentFrequency: ScheduleType, unitNo: number): string {
  if (paymentFrequency === "quarterly") return `Quarter ${unitNo}`;
  if (paymentFrequency === "two_monthly") return `Payment ${unitNo}`;
  return `Month ${unitNo}`;
}

function flatMonthlyUnits(input: {
  paymentFrequency: ScheduleType;
  terms: number;
  totalInterest: number;
  firstPaymentDate?: string | Date | null;
  rowsPerMonth: 1 | 2;
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
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + i);
      dueDate = d.toISOString().slice(0, 10);
    }
    const installmentNos =
      input.rowsPerMonth === 2 ? [2 * i + 1, 2 * i + 2] : [unitNo];
    return {
      unitNo,
      label: unitLabel(input.paymentFrequency, unitNo),
      dueDate,
      interestAmount: interestPerMonth,
      installmentNos,
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
    if (!input.releaseDate) return [];
    const result = computeInvoiceLoan({
      principal: input.principal,
      terms,
      releaseDate:
        input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate),
    });
    const units: DiscountUnit[] = [];
    for (let month = 1; month <= terms; month += 1) {
      const weeks = result.weeklySchedule.filter((w) => w.month === month);
      if (weeks.length === 0) continue;
      units.push({
        unitNo: month,
        label: `Month ${month}`,
        dueDate: weeks[0].dueDate,
        interestAmount: halfUp(weeks.reduce((sum, w) => sum + w.amountDue, 0)),
        installmentNos: weeks.map((w) => w.weekNo),
      });
    }
    return units;
  }

  if (input.paymentFrequency === "quarterly" || input.paymentFrequency === "two_monthly") {
    if (!input.releaseDate) return [];
    const releaseDate =
      input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
    const rows =
      input.paymentFrequency === "quarterly"
        ? generateQuarterlySchedule({
            terms,
            totalLoan: input.totalLoan,
            totalInterest: input.totalInterest,
            releaseDate,
            dueDay: input.dueDay ?? 10,
          })
        : generateTwoMonthlySchedule({
            terms,
            totalLoan: input.totalLoan,
            totalInterest: input.totalInterest,
            releaseDate,
            dueDay: input.dueDay ?? 10,
          });
    // Generator always emits (interest, principal) pairs in that order —
    // see generateInterestPrincipalSplitSchedule in ar/schedule.ts.
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

  if (input.paymentFrequency === "bi_monthly" || input.paymentFrequency === "semi_monthly") {
    // 2 real rows per calendar month, flat interest split evenly across
    // `terms` months — same total-interest-over-term model as a regular
    // monthly loan (neither product has Invoice's escalating-rate
    // structure, so a flat per-month share is accurate, not an
    // approximation).
    return flatMonthlyUnits({ ...input, rowsPerMonth: 2 });
  }

  // Monthly (SME/MPL/Seafarer, the default) — 1 real row per month.
  return flatMonthlyUnits({ ...input, rowsPerMonth: 1 });
}
