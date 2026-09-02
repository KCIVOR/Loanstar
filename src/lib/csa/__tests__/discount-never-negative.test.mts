import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveGrossTotals } from "../computation";
import { buildDiscountUnits, maxDiscountUnits, type ScheduleType } from "../../computation/discount-units";
import { halfUp } from "../../computation/money";

/**
 * Regression coverage for the Invoice(Weekly) negative-interest bug
 * (docs/invoice-weekly-interest-corruption-audit-and-fix-plan.md, fixed
 * 2026-08-31). Mirrors persistComputation's own gross-total + discount-
 * subtraction sequence for every discountable schedule type, at the worst
 * case (100% off every real unit), and asserts the result can never go
 * negative. Cheap insurance against the next schedule type introducing the
 * same "real per-payment total diverges from the stored gross total" gap
 * Weekly had.
 */
const SCHEDULES: { type: Exclude<ScheduleType, null | undefined | "daily">; terms: number }[] = [
  { type: "monthly", terms: 6 },
  { type: "semi_monthly", terms: 3 },
  { type: "bi_monthly", terms: 6 },
  { type: "weekly", terms: 3 },
  { type: "quarterly", terms: 6 },
  { type: "two_monthly", terms: 4 },
];

describe("discount can never exceed gross interest, across every schedule type", () => {
  for (const { type, terms } of SCHEDULES) {
    it(`${type} (terms ${terms}): 100% discount on every unit never produces negative interest`, () => {
      const principal = 110_000;
      const releaseDate = new Date("2026-09-01");
      const flatEstimate = halfUp(principal * terms * 0.035); // what computeSmeLoan would produce

      const gross = resolveGrossTotals(type, principal, terms, flatEstimate, releaseDate);
      const units = buildDiscountUnits({
        paymentFrequency: type,
        terms,
        principal,
        totalInterest: gross.totalInterest,
        totalLoan: gross.totalLoan,
        releaseDate,
        firstPaymentDate: type === "semi_monthly" ? "2026-09-15" : releaseDate,
        dueDay: 10,
      });

      const maxUnits = maxDiscountUnits(type, terms);
      assert.equal(units.length, maxUnits, `${type}: buildDiscountUnits count must match maxDiscountUnits`);

      let totalDiscountPeso = 0;
      for (const unit of units) {
        totalDiscountPeso += halfUp(unit.interestAmount);
      }
      totalDiscountPeso = halfUp(totalDiscountPeso);

      const effectiveTotalInterest = halfUp(gross.totalInterest - totalDiscountPeso);
      assert.ok(
        effectiveTotalInterest >= 0,
        `${type}: 100% discount produced negative interest (${effectiveTotalInterest})`,
      );
      assert.ok(
        halfUp(principal + effectiveTotalInterest) >= principal,
        `${type}: total loan fell below principal`,
      );
    });
  }
});
