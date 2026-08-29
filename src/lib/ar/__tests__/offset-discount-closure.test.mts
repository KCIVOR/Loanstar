import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure JS mirror of the discount-application block inside the
 * `post_internal_transfer` SQL function (see
 * supabase/migrations/20260828120000_offset_discount_closure.sql) — same
 * "shadow the SQL in a testable pure function" approach as
 * aging-parity.test.mts's simulateAgingStep, used here to lock in Rule 7
 * (origination discount voided before the Offset discount is applied, never
 * summed on the same installment) and the fee-absorbing row split.
 */
function simulateOffsetDiscountRowSplit(input: {
  rows: Array<{ installmentNo: number; discountAmount: number }>;
  discountedInstallmentNos: number[];
  netDiscount: number;
}): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of input.rows) result.set(row.installmentNo, row.discountAmount);

  const sorted = [...input.discountedInstallmentNos].sort((a, b) => a - b);
  if (sorted.length === 0) return result;

  // Rule 7: any origination discount on these rows is voided first,
  // unconditionally — before the Offset discount is computed below.
  for (const no of sorted) result.set(no, 0);

  if (sorted.length > 1) {
    const perRow =
      Math.round((input.netDiscount / (sorted.length - 1) + Number.EPSILON) * 100) / 100;
    sorted.forEach((no, idx) => {
      if (idx === 0) return; // oldest selected row absorbs the termination fee, stays 0
      result.set(no, perRow);
    });
  }

  return result;
}

describe("Offset discount closure — Rule 7 (void origination discount, never sum)", () => {
  it("clears a pre-existing origination discount on a selected row instead of summing it", () => {
    const rows = [
      { installmentNo: 2, discountAmount: 0 },
      { installmentNo: 3, discountAmount: 999 }, // pre-existing origination discount
      { installmentNo: 4, discountAmount: 0 },
    ];
    const result = simulateOffsetDiscountRowSplit({
      rows,
      discountedInstallmentNos: [2, 3, 4],
      netDiscount: 300,
    });
    // Never 999 + anything — the origination discount is gone, replaced by
    // the Offset discount's own even split.
    assert.equal(result.get(2), 0); // oldest selected — fee-absorbing row
    assert.equal(result.get(3), 150);
    assert.equal(result.get(4), 150);
  });

  it("leaves a non-selected row's origination discount untouched", () => {
    const rows = [
      { installmentNo: 2, discountAmount: 0 },
      { installmentNo: 3, discountAmount: 0 },
      { installmentNo: 6, discountAmount: 777 }, // a different, unrelated origination discount
    ];
    const result = simulateOffsetDiscountRowSplit({
      rows,
      discountedInstallmentNos: [2, 3],
      netDiscount: 0,
    });
    assert.equal(result.get(6), 777);
  });

  it("a single selected installment nets to zero and its own discount is fully cleared", () => {
    const rows = [{ installmentNo: 5, discountAmount: 500 }];
    const result = simulateOffsetDiscountRowSplit({
      rows,
      discountedInstallmentNos: [5],
      netDiscount: 0,
    });
    assert.equal(result.get(5), 0);
  });

  it("no installments selected — every row's discount is left exactly as-is", () => {
    const rows = [
      { installmentNo: 2, discountAmount: 100 },
      { installmentNo: 3, discountAmount: 0 },
    ];
    const result = simulateOffsetDiscountRowSplit({
      rows,
      discountedInstallmentNos: [],
      netDiscount: 0,
    });
    assert.equal(result.get(2), 100);
    assert.equal(result.get(3), 0);
  });

  it("the per-row split sums back to exactly the net discount — no rounding drift", () => {
    const rows = [2, 3, 4, 5].map((installmentNo) => ({ installmentNo, discountAmount: 0 }));
    const result = simulateOffsetDiscountRowSplit({
      rows,
      discountedInstallmentNos: [2, 3, 4, 5],
      netDiscount: 638.64, // the transcript's own worked example (3 × 212.88)
    });
    const total = [2, 3, 4, 5].reduce((sum, no) => sum + (result.get(no) ?? 0), 0);
    assert.equal(total, 638.64);
    assert.equal(result.get(2), 0);
    assert.equal(result.get(3), 212.88);
    assert.equal(result.get(4), 212.88);
    assert.equal(result.get(5), 212.88);
  });
});
