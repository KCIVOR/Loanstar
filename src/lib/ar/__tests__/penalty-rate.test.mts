import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  penaltyRateConfigKey,
  resolvePenaltyRate,
} from "../penalty-rate";

describe("penaltyRateConfigKey (Phase 5.1)", () => {
  it("maps seafarer → penalty_rate", () => {
    assert.equal(penaltyRateConfigKey("seafarer"), "penalty_rate");
  });

  it("maps sme → penalty_rate_sme", () => {
    assert.equal(penaltyRateConfigKey("sme"), "penalty_rate_sme");
  });

  it("refuses NULL/unknown — must not silently mean Seafarer", () => {
    assert.throws(() => penaltyRateConfigKey(null), /missing or unknown/);
    assert.throws(() => penaltyRateConfigKey(undefined), /missing or unknown/);
    assert.throws(() => penaltyRateConfigKey(""), /missing or unknown/);
    assert.throws(() => penaltyRateConfigKey("other"), /missing or unknown/);
  });
});

describe("resolvePenaltyRate", () => {
  const rates = { seafarer: 0.15, sme: 0.05 };

  it("returns segment-specific rates", () => {
    assert.equal(resolvePenaltyRate("seafarer", rates), 0.15);
    assert.equal(resolvePenaltyRate("sme", rates), 0.05);
  });
});
