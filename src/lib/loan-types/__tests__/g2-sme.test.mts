import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { MIN_PF_RATE, validatePfRate } from "../g2";

describe("G2 PF floor — segment-aware (Phase 4.2)", () => {
  test("rejects Seafarer rates below MIN_PF_RATE", () => {
    const r = validatePfRate(0.06, { segment: "seafarer" });
    assert.equal(r.valid, false);
  });

  test("default (no segment) keeps Seafarer G2 behavior", () => {
    const r = validatePfRate(0.06);
    assert.equal(r.valid, false);
  });

  test("allows SME rates below G2 floor (real released loans use 0–11%)", () => {
    assert.equal(validatePfRate(0.05, { segment: "sme" }).valid, true);
    assert.equal(validatePfRate(0.03, { segment: "sme" }).valid, true);
    assert.equal(validatePfRate(0, { segment: "sme" }).valid, true);
  });

  test("Seafarer still accepts rates at or above floor", () => {
    assert.equal(validatePfRate(MIN_PF_RATE, { segment: "seafarer" }).valid, true);
  });
});
