import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveGrossTotals } from "../computation";

describe("resolveGrossTotals — Weekly (Invoice) real-total fix (2026-08-31)", () => {
  it("non-weekly schedules pass the flat estimate through unchanged", () => {
    const result = resolveGrossTotals("monthly", 110_000, 6, 19_800, new Date("2026-08-30"));
    assert.equal(result.totalInterest, 19_800);
    assert.equal(result.totalLoan, 129_800);
  });

  it("Weekly ignores the flat estimate and uses the real escalating total", () => {
    // Principal 108,000, terms 3 — matches the documented complete-ledger
    // example scaled to AN300431's principal. Real total: 4x1,080 + 4x2,160
    // + 4x2,700 = 23,760, NOT the flat 108,000*3*0.035=11,340 estimate.
    const result = resolveGrossTotals("weekly", 108_000, 3, 11_340, new Date("2026-08-31"));
    assert.equal(result.totalInterest, 23_760);
    assert.equal(result.totalLoan, 131_760);
  });

  it("repro: AN300431's exact discount basis no longer requires a flat baseline smaller than the real discount", () => {
    // The bug: subtracting the real discount (14,580, weeks 1,2,5,6,9,10,12)
    // from the flat 11,340 estimate went negative (11,340 - 14,580 = -3,240).
    // With the real total (23,760) as the baseline, 23,760 - 14,580 = 9,180 —
    // positive, and the discount can never exceed the total it was derived from.
    const result = resolveGrossTotals("weekly", 108_000, 3, 11_340, new Date("2026-08-31"));
    const totalDiscount = 14_580;
    assert.ok(result.totalInterest >= totalDiscount); // real total is enough to cover the real discount
    assert.equal(result.totalInterest - totalDiscount, 9_180);
  });

  it("Daily is untouched by this override (handled separately in persistComputation)", () => {
    const result = resolveGrossTotals("daily", 100_000, 1, 500, new Date("2026-08-20"));
    assert.equal(result.totalInterest, 500);
  });
});
