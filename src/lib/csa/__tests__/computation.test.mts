import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapComputationRow,
  resolveComputationEngine,
  validateFrequencyTerms,
  validateOriginationDiscounts,
  validateSeafarerDueDay,
} from "../computation";

describe("resolveComputationEngine — P1 Auto/REM net-method routing", () => {
  it("routes clean SME to the gross-up (sme) engine", () => {
    assert.equal(resolveComputationEngine("sme", "none"), "sme");
  });

  it("routes clean Individual to the gross-up (sme) engine", () => {
    assert.equal(resolveComputationEngine("individual", "none"), "sme");
  });

  it("routes Auto-collateral SME to the net-method (sf) engine — the P1 fix", () => {
    assert.equal(resolveComputationEngine("sme", "car_refinancing"), "sf");
  });

  it("routes REM-collateral SME to the net-method (sf) engine — the P1 fix", () => {
    assert.equal(resolveComputationEngine("sme", "real_estate"), "sf");
  });

  it("routes Auto-collateral Individual to the net-method (sf) engine — the P1 fix", () => {
    assert.equal(resolveComputationEngine("individual", "car_refinancing"), "sf");
  });

  it("regression guard: Seafarer always uses the net-method (sf) engine, collateral or not", () => {
    assert.equal(resolveComputationEngine("seafarer", "none"), "sf");
  });

  it("treats a missing/null collateralType as no collateral (backward compatible)", () => {
    assert.equal(resolveComputationEngine("sme", undefined), "sme");
    assert.equal(resolveComputationEngine("sme", null), "sme");
  });
});

describe("validateFrequencyTerms — P4 Quarterly/2-Month divisibility", () => {
  it("accepts quarterly terms divisible by 3", () => {
    assert.equal(validateFrequencyTerms("quarterly", 6), null);
    assert.equal(validateFrequencyTerms("quarterly", 9), null);
    assert.equal(validateFrequencyTerms("quarterly", 12), null);
  });

  it("rejects quarterly terms not divisible by 3", () => {
    assert.match(
      validateFrequencyTerms("quarterly", 7) ?? "",
      /divisible by 3/,
    );
  });

  it("accepts two-monthly terms divisible by 2", () => {
    assert.equal(validateFrequencyTerms("two_monthly", 4), null);
    assert.equal(validateFrequencyTerms("two_monthly", 6), null);
    assert.equal(validateFrequencyTerms("two_monthly", 10), null);
  });

  it("rejects two-monthly terms not divisible by 2", () => {
    assert.match(
      validateFrequencyTerms("two_monthly", 5) ?? "",
      /divisible by 2/,
    );
  });

  it("regression guard: does not restrict monthly/semi_monthly/weekly/bi_monthly/daily", () => {
    assert.equal(validateFrequencyTerms("monthly", 7), null);
    assert.equal(validateFrequencyTerms("semi_monthly", 7), null);
    assert.equal(validateFrequencyTerms("weekly", 7), null);
    assert.equal(validateFrequencyTerms("bi_monthly", 7), null);
    assert.equal(validateFrequencyTerms("daily", 7), null);
    assert.equal(validateFrequencyTerms(undefined, 7), null);
  });
});

describe("validateSeafarerDueDay", () => {
  it("rejects a missing due date for Seafarer", () => {
    assert.equal(
      validateSeafarerDueDay("seafarer", undefined),
      "Due date must be 5, 15, or 25 for Seafarer loans",
    );
  });

  it("rejects the old silent default of 10 for Seafarer", () => {
    assert.equal(
      validateSeafarerDueDay("seafarer", 10),
      "Due date must be 5, 15, or 25 for Seafarer loans",
    );
  });

  it("accepts 5, 15, and 25 for Seafarer", () => {
    assert.equal(validateSeafarerDueDay("seafarer", 5), null);
    assert.equal(validateSeafarerDueDay("seafarer", 15), null);
    assert.equal(validateSeafarerDueDay("seafarer", 25), null);
  });

  it("regression guard: SME with no due date is untouched by this rule", () => {
    assert.equal(validateSeafarerDueDay("sme", undefined), null);
  });

  it("regression guard: Individual with a currently-legal arbitrary due date (20) is untouched", () => {
    assert.equal(validateSeafarerDueDay("individual", 20), null);
  });

  it("regression guard: SME/Individual are not restricted to 5/15/25 either", () => {
    assert.equal(validateSeafarerDueDay("sme", 10), null);
    assert.equal(validateSeafarerDueDay("individual", 1), null);
  });
});

describe("validateOriginationDiscounts", () => {
  it("accepts an empty or undefined list", () => {
    assert.equal(validateOriginationDiscounts(6, undefined), null);
    assert.equal(validateOriginationDiscounts(6, []), null);
  });

  it("accepts every installment number from 1..terms with a valid percent", () => {
    const discounts = [
      { installmentNo: 1, percent: 0 },
      { installmentNo: 6, percent: 100 },
      { installmentNo: 3, percent: 12.5 },
    ];
    assert.equal(validateOriginationDiscounts(6, discounts), null);
  });

  it("rejects an installment number below 1", () => {
    const err = validateOriginationDiscounts(6, [{ installmentNo: 0, percent: 10 }]);
    assert.match(err ?? "", /not a valid unit/);
  });

  it("rejects an installment number beyond terms", () => {
    const err = validateOriginationDiscounts(6, [{ installmentNo: 7, percent: 10 }]);
    assert.match(err ?? "", /not a valid unit for this 6-unit schedule/);
  });

  it("rejects a non-integer installment number", () => {
    const err = validateOriginationDiscounts(6, [{ installmentNo: 2.5, percent: 10 }]);
    assert.match(err ?? "", /not a valid unit/);
  });

  it("rejects a negative percent", () => {
    const err = validateOriginationDiscounts(6, [{ installmentNo: 1, percent: -1 }]);
    assert.match(err ?? "", /must be between 0 and 100/);
  });

  it("rejects a percent over 100", () => {
    const err = validateOriginationDiscounts(6, [{ installmentNo: 1, percent: 101 }]);
    assert.match(err ?? "", /must be between 0 and 100/);
  });

  it("reports the first invalid entry, not the last", () => {
    const err = validateOriginationDiscounts(6, [
      { installmentNo: 1, percent: 10 },
      { installmentNo: 99, percent: 10 },
      { installmentNo: 2, percent: 999 },
    ]);
    assert.match(err ?? "", /installment number 99/);
  });
});

describe("mapComputationRow — originationDiscounts round-trip", () => {
  const baseRow: Record<string, unknown> = {
    id: "c1",
    loan_application_id: "a1",
    version: 1,
    input_mode: "NET_SARADO",
    input_amount: 10000,
    terms: 6,
    addon_months: 2,
    pf_rate: 0.1,
    interest_rate: 0.02,
    security_fee_rate: 0.02,
    other_deductions: null,
    principal: 10000,
    processing_fee: 0,
    admin_cost: 0,
    doc_stamp: 0,
    notary_fee: 0,
    security_fee: 0,
    other_deductions_total: 0,
    total_deductions: 0,
    net_released: 10000,
    total_interest: 1200,
    total_loan: 11200,
    monthly_amortization: 1866.67,
    release_date: "2026-01-01",
    first_payment_date: "2026-02-01",
    due_day: 10,
    line_items: [],
    coverage_ratio: null,
    coverage_warning: false,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("round-trips a saved discount list unchanged", () => {
    const saved = [
      { installmentNo: 3, percent: 25 },
      { installmentNo: 5, percent: 50 },
    ];
    const mapped = mapComputationRow({ ...baseRow, origination_discounts: saved });
    assert.deepEqual(mapped.originationDiscounts, saved);
  });

  it("maps a null column to null, not an empty array", () => {
    const mapped = mapComputationRow({ ...baseRow, origination_discounts: null });
    assert.equal(mapped.originationDiscounts, null);
  });

  it("maps a missing column to null (defensive default)", () => {
    const mapped = mapComputationRow({ ...baseRow });
    assert.equal(mapped.originationDiscounts, null);
  });
});
