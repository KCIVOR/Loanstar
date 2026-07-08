import test from "node:test";
import assert from "node:assert/strict";

import { generateAmortizationSchedule } from "../schedule";

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
