import test from "node:test";
import assert from "node:assert/strict";

import { generateAmortizationSchedule } from "../schedule";
import { halfUp } from "../../computation/money";

test("F2 amortization schedule — 7 × 17,428.20 starting 2026-08-10", () => {
  const schedule = generateAmortizationSchedule({
    terms: 7,
    monthlyAmortization: 17_428.2,
    releaseDate: "2026-06-10",
    addonMonths: 2,
    dueDay: 10,
  });

  assert.equal(schedule.length, 7);
  assert.equal(schedule[0]!.dueDate, "2026-08-10");
  assert.equal(schedule[6]!.dueDate, "2027-02-10");

  for (const row of schedule) {
    assert.equal(row.amountDue, 17_428.2);
  }
});

test("last installment absorbs the total-loan rounding centavo", () => {
  const schedule = generateAmortizationSchedule({
    terms: 3,
    monthlyAmortization: 18_547.76,
    releaseDate: "2026-09-10",
    addonMonths: 0,
    dueDay: 10,
    totalLoan: 55_643.29,
  });

  assert.equal(schedule.length, 3);
  assert.equal(schedule[0]!.amountDue, 18_547.76);
  assert.equal(schedule[1]!.amountDue, 18_547.76);
  assert.equal(schedule[2]!.amountDue, 18_547.77);
  assert.equal(
    schedule.reduce((sum, row) => halfUp(sum + row.amountDue), 0),
    55_643.29,
  );
});

test("semi-monthly (Salary): 12 installments alternating 15th/end-of-month, half amounts, last absorbs rounding", () => {
  const schedule = generateAmortizationSchedule({
    terms: 6,
    monthlyAmortization: 21_578.33,
    releaseDate: "2026-08-24",
    addonMonths: 1,
    firstPaymentDate: "2026-08-31",
    totalLoan: 129_470,
    paymentFrequency: "semi_monthly",
  });

  assert.equal(schedule.length, 12);
  assert.deepEqual(
    schedule.map((row) => row.dueDate),
    [
      "2026-08-31",
      "2026-09-15",
      "2026-09-30",
      "2026-10-15",
      "2026-10-31",
      "2026-11-15",
      "2026-11-30",
      "2026-12-15",
      "2026-12-31",
      "2027-01-15",
      "2027-01-31",
      "2027-02-15",
    ],
  );
  for (const row of schedule.slice(0, 11)) {
    assert.equal(row.amountDue, 10_789.17);
  }
  assert.equal(
    schedule.reduce((sum, row) => halfUp(sum + row.amountDue), 0),
    129_470,
  );
});
