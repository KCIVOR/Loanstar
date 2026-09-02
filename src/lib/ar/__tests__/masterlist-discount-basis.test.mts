import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDiscountUnits } from "../../computation/discount-units";
import { halfUp } from "../../computation/money";
import { generateAmortizationSchedule } from "../schedule";

/**
 * Regression coverage for the discount-basis-mismatch bug found live on
 * AN300434 (2026-08-31, see docs/discount-basis-mismatch-audit-and-fix-plan.md):
 * masterlist.ts's initializeArAccount used to build both the real schedule
 * (`generateAmortizationSchedule`) and the discount units
 * (`buildDiscountUnits`) from the ALREADY-NET computation.totalLoan/
 * totalInterest, which (a) silently diluted the discount across every
 * installment via the blended payment amount instead of concentrating it on
 * the CSA-selected ones, and (b) then subtracted a *second*, independently
 * wrong (halved) discount_amount on top. Both call sites must share the
 * same GROSS baseline so nothing gets discounted twice and undiscounted
 * rows show their full payment.
 *
 * The one invariant that must always hold: sum of every row's
 * (amountDue - discountAmount) equals the computation's own net total_loan
 * exactly — that's the account's authoritative, disclosed obligation.
 */
describe("masterlist schedule + discount units share one gross baseline", () => {
  it("undiscounted rows show the full gross payment, discounted rows show the true net — sum matches net total_loan exactly", () => {
    const principal = 113420;
    const terms = 6;
    const releaseDate = new Date("2026-08-31");
    const grossTotalInterest = 17013; // principal * terms * 0.025
    const grossTotalLoan = halfUp(principal + grossTotalInterest);
    const netTotalLoan = 121926.5; // after 3 units (2,4,6) discounted 100% each

    const grossMonthlyAmortization = halfUp(grossTotalLoan / terms);
    const schedule = generateAmortizationSchedule({
      terms,
      monthlyAmortization: grossMonthlyAmortization,
      releaseDate,
      addonMonths: 0,
      dueDay: 10,
      totalLoan: grossTotalLoan,
      totalInterest: grossTotalInterest,
      firstPaymentDate: "2026-04-28",
      paymentFrequency: "monthly",
    });

    const units = buildDiscountUnits({
      paymentFrequency: "monthly",
      terms,
      principal,
      totalInterest: grossTotalInterest,
      totalLoan: grossTotalLoan,
      releaseDate,
      firstPaymentDate: "2026-04-28",
    });
    const unitByNo = new Map(units.map((u) => [u.unitNo, u]));
    const discounted = new Set([2, 4, 6]);

    let sumNet = 0;
    for (const row of schedule) {
      const unit = unitByNo.get(row.installmentNo)!;
      const discountAmount = discounted.has(row.installmentNo) ? unit.interestAmount : 0;
      // Undiscounted rows keep their full gross blended payment.
      if (!discounted.has(row.installmentNo)) {
        assert.equal(row.amountDue, 21738.83);
      }
      sumNet = halfUp(sumNet + (row.amountDue - discountAmount));
    }

    assert.equal(sumNet, netTotalLoan);
  });
});
