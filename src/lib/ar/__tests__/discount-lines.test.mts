import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDiscountLines,
  discountedRemainingDue,
  fillAllocationAmounts,
  grossRemainingDue,
  resolveDiscountLines,
} from "../discount-lines";
import { computeCollectorDiscount } from "../../computation/collector-discount";

describe("buildDiscountLines", () => {
  it("keeps each installment's own percent (no averaging)", () => {
    const base = [
      { installmentNo: 4, amount: 2597.93 },
      { installmentNo: 5, amount: 2597.93 },
    ];
    const pct = new Map([
      [4, 100],
      [5, 50],
    ]);
    const lines = buildDiscountLines(base, pct);
    assert.deepEqual(lines, [
      { installmentNo: 4, amount: 2597.93 },
      { installmentNo: 5, amount: 1298.97 },
    ]);
    const total = computeCollectorDiscount(base, pct).discountAmount;
    assert.equal(
      lines.reduce((s, l) => s + l.amount, 0).toFixed(2),
      total.toFixed(2),
    );
  });

  it("waives each row's own fee for unequal penalties", () => {
    const lines = buildDiscountLines(
      [
        { installmentNo: 4, amount: 100 },
        { installmentNo: 5, amount: 900 },
      ],
      new Map([
        [4, 100],
        [5, 100],
      ]),
    );
    assert.deepEqual(lines, [
      { installmentNo: 4, amount: 100 },
      { installmentNo: 5, amount: 900 },
    ]);
  });
});

describe("resolveDiscountLines", () => {
  it("rejects a breakdown that does not sum to the total", () => {
    assert.throws(
      () =>
        resolveDiscountLines("Penalty", 1000, [4, 5], [
          { installmentNo: 4, amount: 100 },
          { installmentNo: 5, amount: 800 },
        ]),
      /does not match its total/,
    );
  });

  it("rejects duplicate installments and non-positive amounts", () => {
    assert.throws(
      () =>
        resolveDiscountLines("Interest", 200, [4], [
          { installmentNo: 4, amount: 100 },
          { installmentNo: 4, amount: 100 },
        ]),
      /more than once/,
    );
    assert.throws(
      () =>
        resolveDiscountLines("Interest", 100, [4, 5], [
          { installmentNo: 4, amount: 100 },
          { installmentNo: 5, amount: 0 },
        ]),
      /greater than zero/,
    );
  });

  it("rejects lines whose installments differ from the selected list", () => {
    assert.throws(
      () =>
        resolveDiscountLines("Interest", 100, [4], [
          { installmentNo: 5, amount: 100 },
        ]),
      /selected installments/,
    );
  });

  it("derives the legacy even split when no lines are sent", () => {
    assert.deepEqual(resolveDiscountLines("Interest", 5195.86, [4, 5], undefined), [
      { installmentNo: 4, amount: 2597.93 },
      { installmentNo: 5, amount: 2597.93 },
    ]);
  });

  it("preserves every cent when a legacy total cannot split evenly", () => {
    const lines = resolveDiscountLines("Penalty", 1, [4, 5, 6], undefined);
    assert.deepEqual(lines, [
      { installmentNo: 4, amount: 0.33 },
      { installmentNo: 5, amount: 0.33 },
      { installmentNo: 6, amount: 0.34 },
    ]);
    assert.equal(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2), "1.00");
  });

  it("returns nothing for a zero total", () => {
    assert.deepEqual(resolveDiscountLines("Penalty", 0, [], undefined), []);
  });
});

describe("remaining-due thresholds", () => {
  const row = { amountDue: 21154.6, penaltyAmount: 0, amountPaid: 0 };

  it("gross = Pass A threshold, discounted = Pass B threshold", () => {
    assert.equal(grossRemainingDue(row), 21154.6);
    assert.equal(discountedRemainingDue(row, 2597.93, 0), 18556.67);
  });

  it("a collector interest discount replaces (never stacks on) an origination discount", () => {
    const withOrigination = { ...row, discountAmount: 1000 };
    assert.equal(grossRemainingDue(withOrigination), 20154.6);
    assert.equal(discountedRemainingDue(withOrigination, 2597.93, 0), 18556.67);
    assert.equal(discountedRemainingDue(withOrigination, 0, 0), 20154.6);
  });

  it("a penalty waiver only comes off that row's fee", () => {
    const late = { amountDue: 21154.6, penaltyAmount: 100, amountPaid: 0 };
    assert.equal(discountedRemainingDue(late, 0, 100), 21154.6);
  });
});

describe("fillAllocationAmounts", () => {
  it("re-fills two discounted rows net of discount (the reproduced bug case)", () => {
    assert.deepEqual(fillAllocationAmounts(37113.34, [18556.67, 18556.67, 21154.6]), [
      18556.67, 18556.67, 0,
    ]);
  });

  it("spills the remainder to the next row and caps every row at capacity", () => {
    assert.deepEqual(fillAllocationAmounts(30000, [18556.67, 21154.6]), [
      18556.67, 11443.33,
    ]);
    assert.deepEqual(fillAllocationAmounts(40000, [18556.67, 21154.6]), [
      18556.67, 21154.6,
    ]);
  });
});
