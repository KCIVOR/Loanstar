import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkCoverageRatio,
  evaluateCoverageForEndorse,
  formatCoverageBlocker,
} from "../coverage";

describe("coverage endorse gate (Phase 9)", () => {
  const threshold = 0.35;

  it("null ratio is ok with non-blocking warning (income not declared)", () => {
    const result = evaluateCoverageForEndorse(null, threshold);
    assert.equal(result.coverageOk, true);
    assert.deepEqual(result.warnings, [
      "Coverage ratio unknown — monthly income not declared",
    ]);
    assert.equal(result.blocker, null);
  });

  it("0.34 is within 0.35 threshold", () => {
    const result = evaluateCoverageForEndorse(0.34, threshold);
    assert.equal(result.coverageOk, true);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.blocker, null);
  });

  it("0.35 equals threshold and is allowed", () => {
    const result = evaluateCoverageForEndorse(0.35, threshold);
    assert.equal(result.coverageOk, true);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.blocker, null);
  });

  it("0.36 exceeds 0.35 and becomes a blocking missing item", () => {
    const result = evaluateCoverageForEndorse(0.36, threshold);
    assert.equal(result.coverageOk, false);
    assert.deepEqual(result.warnings, []);
    assert.equal(
      result.blocker,
      "Monthly amortization exceeds 35% of declared income",
    );
  });

  it("honors a raised config threshold (0.40 admits 0.36)", () => {
    const result = evaluateCoverageForEndorse(0.36, 0.4);
    assert.equal(result.coverageOk, true);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.blocker, null);
  });

  it("formatCoverageBlocker uses whole-percent threshold", () => {
    assert.equal(
      formatCoverageBlocker(0.35),
      "Monthly amortization exceeds 35% of declared income",
    );
    assert.equal(
      formatCoverageBlocker(0.4),
      "Monthly amortization exceeds 40% of declared income",
    );
  });

  it("checkCoverageRatio uses a passed threshold for on-screen warning parity", () => {
    const atDefault = checkCoverageRatio(3600, 10000, 0.35);
    assert.equal(atDefault.warning, true);
    assert.equal(atDefault.ratio, 0.36);

    const raised = checkCoverageRatio(3600, 10000, 0.4);
    assert.equal(raised.warning, false);
    assert.equal(raised.ratio, 0.36);
  });
});
