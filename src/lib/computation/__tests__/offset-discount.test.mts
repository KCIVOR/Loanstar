import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeOffsetDiscount } from "../offset-discount";

describe("computeOffsetDiscount", () => {
  const loan = [
    { installmentNo: 2, interestPortion: 212.88 },
    { installmentNo: 3, interestPortion: 212.88 },
    { installmentNo: 4, interestPortion: 212.88 },
    { installmentNo: 5, interestPortion: 212.88 },
  ];

  it("matches the transcript's worked example exactly (4 months ticked)", () => {
    const out = computeOffsetDiscount(loan, [2, 3, 4, 5]);
    assert.equal(out.grossInterest, 851.52);
    assert.equal(out.terminationFee, 212.88);
    assert.equal(out.netDiscount, 638.64);
  });

  it("no months ticked — gross and net are both zero", () => {
    const out = computeOffsetDiscount(loan, []);
    assert.equal(out.grossInterest, 0);
    assert.equal(out.netDiscount, 0);
    // Termination fee is still a flat, loan-level figure even with nothing ticked.
    assert.equal(out.terminationFee, 212.88);
  });

  it("exactly one month ticked — zero-floor case (gross equals the fee itself)", () => {
    const out = computeOffsetDiscount(loan, [2]);
    assert.equal(out.grossInterest, 212.88);
    assert.equal(out.netDiscount, 0);
  });

  it("accepts a Set as well as a plain array of installment numbers", () => {
    const arr = computeOffsetDiscount(loan, [2, 3]);
    const set = computeOffsetDiscount(loan, new Set([2, 3]));
    assert.deepEqual(set, arr);
  });

  it("ignores an installment number that isn't part of this loan's future installments", () => {
    const out = computeOffsetDiscount(loan, [2, 999]);
    assert.equal(out.grossInterest, 212.88);
    assert.equal(out.netDiscount, 0);
  });

  it("calculates custom percentages per month using a Map", () => {
    // Month 2 at 50% (106.44), Month 3 at 100% (212.88), Month 4 at 100% (212.88)
    // Gross: 106.44 + 212.88 + 212.88 = 532.20
    // Less fee: 212.88 -> Net: 319.32
    const map = new Map<number, number>([
      [2, 50],
      [3, 100],
      [4, 100],
    ]);
    const out = computeOffsetDiscount(loan, map);
    assert.equal(out.grossInterest, 532.2);
    assert.equal(out.terminationFee, 212.88);
    assert.equal(out.netDiscount, 319.32);
  });

  it("calculates custom percentages using an array of objects", () => {
    const list = [
      { installmentNo: 2, percent: 50 },
      { installmentNo: 3, percent: 100 },
      { installmentNo: 4, percent: 100 },
    ];
    const out = computeOffsetDiscount(loan, list);
    assert.equal(out.grossInterest, 532.2);
    assert.equal(out.terminationFee, 212.88);
    assert.equal(out.netDiscount, 319.32);
  });

  it("clamps percent to 0-100", () => {
    const map = new Map<number, number>([
      [2, 150], // clamped to 100% -> 212.88
      [3, -10], // <= 0 -> ignored
    ]);
    const out = computeOffsetDiscount(loan, map);
    assert.equal(out.grossInterest, 212.88);
    assert.equal(out.netDiscount, 0); // gross equals fee
  });

  it("empty future-installments list — everything zero, no throw", () => {
    const out = computeOffsetDiscount([], [1, 2]);
    assert.deepEqual(out, { grossInterest: 0, terminationFee: 0, netDiscount: 0 });
  });
});
