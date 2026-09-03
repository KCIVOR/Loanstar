import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCollectorDiscount } from "../collector-discount";

describe("computeCollectorDiscount", () => {
  describe("interest discount on a future (not-yet-due) installment", () => {
    // Phase 2 already filtered these to daysPastDue <= 0 before this
    // function ever sees them — this function itself is agnostic to
    // eligibility, it only does the percentage/selection math.
    const futureInstallments = [
      { installmentNo: 4, amount: 212.88 },
      { installmentNo: 5, amount: 212.88 },
      { installmentNo: 6, amount: 212.88 },
    ];

    it("discounts a single selected installment at 100%", () => {
      const out = computeCollectorDiscount(futureInstallments, [4]);
      assert.equal(out.discountAmount, 212.88);
    });

    it("discounts multiple selected installments at a custom percentage", () => {
      const out = computeCollectorDiscount(
        futureInstallments,
        new Map([
          [4, 50],
          [5, 100],
        ]),
      );
      // 106.44 + 212.88 = 319.32
      assert.equal(out.discountAmount, 319.32);
    });

    it("no installments ticked — zero, no throw", () => {
      const out = computeCollectorDiscount(futureInstallments, []);
      assert.equal(out.discountAmount, 0);
    });
  });

  describe("penalty discount on an overdue installment", () => {
    // Phase 2 filtered these the opposite way: daysPastDue > 0 AND
    // penaltyAmount > 0. Same function, different base figure.
    const overdueInstallments = [
      { installmentNo: 1, amount: 10000 },
      { installmentNo: 2, amount: 5000 },
    ];

    it("discounts an overdue installment's penalty by a custom percentage", () => {
      const out = computeCollectorDiscount(
        overdueInstallments,
        new Map([[1, 60]]),
      );
      assert.equal(out.discountAmount, 6000);
    });

    it("discounts across multiple overdue installments", () => {
      const out = computeCollectorDiscount(overdueInstallments, [1, 2]);
      assert.equal(out.discountAmount, 15000);
    });
  });

  it("a 100% discount never goes negative, even on a single row", () => {
    const out = computeCollectorDiscount([{ installmentNo: 1, amount: 850 }], [1]);
    assert.equal(out.discountAmount, 850);
    assert.ok(out.discountAmount >= 0);
  });

  it("clamps percent to 0-100", () => {
    const out = computeCollectorDiscount(
      [
        { installmentNo: 1, amount: 1000 },
        { installmentNo: 2, amount: 1000 },
      ],
      new Map([
        [1, 150], // clamped to 100% -> 1000
        [2, -10], // <= 0 -> ignored
      ]),
    );
    assert.equal(out.discountAmount, 1000);
    assert.ok(out.discountAmount >= 0);
  });

  it("mixed selection across both types produces two independent totals, never summed", () => {
    // This is the Rule 1 case: a single settlement waiving both remaining
    // interest and accrued penalty. The function is called once per type —
    // it never accepts or returns a single combined figure.
    const interestInstallments = [{ installmentNo: 4, amount: 212.88 }];
    const penaltyInstallments = [{ installmentNo: 1, amount: 5000 }];

    const interestResult = computeCollectorDiscount(interestInstallments, [4]);
    const penaltyResult = computeCollectorDiscount(penaltyInstallments, [1]);

    assert.equal(interestResult.discountAmount, 212.88);
    assert.equal(penaltyResult.discountAmount, 5000);
    assert.notEqual(interestResult.discountAmount, penaltyResult.discountAmount);
    // Confirms the two are genuinely separate values a caller must store
    // separately (Phase 0's two column pairs), not add together.
    assert.notEqual(
      interestResult.discountAmount + penaltyResult.discountAmount,
      interestResult.discountAmount,
    );
  });

  it("ignores an installment number not present in the eligible list", () => {
    const out = computeCollectorDiscount(
      [{ installmentNo: 4, amount: 212.88 }],
      [4, 999],
    );
    assert.equal(out.discountAmount, 212.88);
  });

  it("accepts a Set as well as a plain array of installment numbers", () => {
    const installments = [
      { installmentNo: 4, amount: 100 },
      { installmentNo: 5, amount: 100 },
    ];
    const arr = computeCollectorDiscount(installments, [4, 5]);
    const set = computeCollectorDiscount(installments, new Set([4, 5]));
    assert.deepEqual(set, arr);
  });

  it("accepts custom percentages using an array of objects", () => {
    const out = computeCollectorDiscount(
      [{ installmentNo: 4, amount: 1000 }],
      [{ installmentNo: 4, percent: 25 }],
    );
    assert.equal(out.discountAmount, 250);
  });

  it("empty eligible-installments list — zero, no throw", () => {
    const out = computeCollectorDiscount([], [1, 2]);
    assert.deepEqual(out, { discountAmount: 0 });
  });
});
