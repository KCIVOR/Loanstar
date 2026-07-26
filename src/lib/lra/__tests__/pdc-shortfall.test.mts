import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPdcShortfallAcknowledged,
  isPdcShortfallError,
} from "../pdc-shortfall";

describe("PDC count shortfall warning (Phase 8)", () => {
  it("throws without acknowledge when encoded checks are fewer than terms", () => {
    assert.throws(
      () => assertPdcShortfallAcknowledged(5, 7, false),
      /Only 5 of 7 amortization checks encoded — confirm to continue/,
    );
    assert.throws(
      () => assertPdcShortfallAcknowledged(5, 7),
      /Only 5 of 7 amortization checks encoded — confirm to continue/,
    );
  });

  it("passes when shortfall is acknowledged", () => {
    assert.doesNotThrow(() =>
      assertPdcShortfallAcknowledged(5, 7, true),
    );
  });

  it("passes silently when check count equals terms", () => {
    assert.doesNotThrow(() => assertPdcShortfallAcknowledged(7, 7));
    assert.doesNotThrow(() => assertPdcShortfallAcknowledged(7, 7, false));
  });

  it("passes when more checks than terms are encoded", () => {
    assert.doesNotThrow(() => assertPdcShortfallAcknowledged(8, 7));
  });

  it("detects shortfall error messages for the confirm-retry UI", () => {
    assert.equal(
      isPdcShortfallError(
        "Only 3 of 12 amortization checks encoded — confirm to continue",
      ),
      true,
    );
    assert.equal(isPdcShortfallError("PDC encoding only applies to With PDC path"), false);
  });
});
