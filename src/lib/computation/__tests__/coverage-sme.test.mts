import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCoverageForEndorse,
  skipCoverageForSegment,
} from "../coverage";

describe("SME coverage gate (Phase 3.5.4)", () => {
  test("skipCoverageForSegment is true only for sme", () => {
    assert.equal(skipCoverageForSegment("sme"), true);
    assert.equal(skipCoverageForSegment("seafarer"), false);
    assert.equal(skipCoverageForSegment(null), false);
    assert.equal(skipCoverageForSegment(undefined), false);
  });

  test("evaluateCoverageForEndorse skips SME — no 35% personal-income gate", () => {
    // Would block a Seafarer file; must not block SME.
    const result = evaluateCoverageForEndorse(0.9, 0.35, { segment: "sme" });
    assert.equal(result.coverageOk, true);
    assert.equal(result.blocker, null);
    assert.ok(
      result.warnings.some((w) => /no affordability check/i.test(w)),
      `expected affordability-gap warning, got ${JSON.stringify(result.warnings)}`,
    );
  });

  test("evaluateCoverageForEndorse still enforces threshold for Seafarer", () => {
    const result = evaluateCoverageForEndorse(0.9, 0.35, {
      segment: "seafarer",
    });
    assert.equal(result.coverageOk, false);
    assert.ok(result.blocker);
  });
});
