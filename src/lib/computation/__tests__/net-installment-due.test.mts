import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { netInstallmentDue } from "../money";

describe("netInstallmentDue (2026-08-31 — payment-flow discount fix)", () => {
  it("no discount, no penalty, nothing paid — just the amount due", () => {
    assert.equal(netInstallmentDue({ amountDue: 1080 }), 1080);
  });

  it("subtracts a partial discount", () => {
    assert.equal(
      netInstallmentDue({ amountDue: 2160, discountAmount: 1000 }),
      1160,
    );
  });

  it("a 100% discount nets to 0, not negative", () => {
    assert.equal(
      netInstallmentDue({ amountDue: 1080, discountAmount: 1080 }),
      0,
    );
  });

  it("floors at 0 even if discount somehow exceeds amount_due", () => {
    assert.equal(
      netInstallmentDue({ amountDue: 1080, discountAmount: 2000 }),
      0,
    );
  });

  it("adds accrued penalty on top", () => {
    assert.equal(
      netInstallmentDue({ amountDue: 10000, penaltyAmount: 500 }),
      10500,
    );
  });

  it("subtracts amount already paid", () => {
    assert.equal(
      netInstallmentDue({ amountDue: 10000, amountPaid: 4000 }),
      6000,
    );
  });

  it("combines discount, penalty, and partial payment correctly", () => {
    // 2700 due, 2700 discount (fully waived), no penalty yet, nothing paid.
    assert.equal(
      netInstallmentDue({
        amountDue: 2700,
        discountAmount: 2700,
        penaltyAmount: 0,
        amountPaid: 0,
      }),
      0,
    );
  });

  it("null/undefined optional fields behave as 0, not NaN", () => {
    assert.equal(
      netInstallmentDue({
        amountDue: 1000,
        discountAmount: null,
        penaltyAmount: undefined,
        amountPaid: null,
      }),
      1000,
    );
  });

  describe("penaltyDiscountAmount (feature-collector-discount-implementation-plan.md, Phase 5)", () => {
    it("subtracts a penalty waiver from the penalty side only, not amount_due", () => {
      assert.equal(
        netInstallmentDue({
          amountDue: 1000,
          penaltyAmount: 500,
          penaltyDiscountAmount: 300,
        }),
        1200, // 1000 - 0 + 500 - 300 - 0
      );
    });

    it("a full penalty waiver removes the penalty entirely", () => {
      assert.equal(
        netInstallmentDue({
          amountDue: 1000,
          penaltyAmount: 500,
          penaltyDiscountAmount: 500,
        }),
        1000,
      );
    });

    it("interest discount and penalty discount apply independently, in the same call", () => {
      assert.equal(
        netInstallmentDue({
          amountDue: 1000,
          discountAmount: 200,
          penaltyAmount: 500,
          penaltyDiscountAmount: 300,
        }),
        1000,
      );
    });

    it("floors at 0 even if the penalty discount exceeds amount_due + penalty", () => {
      assert.equal(
        netInstallmentDue({
          amountDue: 100,
          penaltyAmount: 50,
          penaltyDiscountAmount: 1000,
        }),
        0,
      );
    });

    it("omitting penaltyDiscountAmount computes byte-for-byte the same result as before this parameter existed", () => {
      const withoutParam = netInstallmentDue({
        amountDue: 2160,
        discountAmount: 1000,
        penaltyAmount: 500,
        amountPaid: 200,
      });
      const withNullParam = netInstallmentDue({
        amountDue: 2160,
        discountAmount: 1000,
        penaltyAmount: 500,
        penaltyDiscountAmount: null,
        amountPaid: 200,
      });
      assert.equal(withoutParam, withNullParam);
      assert.equal(withoutParam, 1460);
    });
  });
});
