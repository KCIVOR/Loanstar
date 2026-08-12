import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { createLoanTypeSchema } from "../create-loan-type";

describe("createLoanTypeSchema (Phase 4.3 / 4.6)", () => {
  test("defaults segment to seafarer", () => {
    const parsed = createLoanTypeSchema.parse({
      name: "REGULAR",
      interestRate: 0.021,
      pfRate: 0.1134,
      effectiveFrom: "2026-08-07",
    });
    assert.equal(parsed.segment, "seafarer");
    assert.equal(parsed.deactivatePrevious, true);
  });

  test("accepts segment sme", () => {
    const parsed = createLoanTypeSchema.parse({
      name: "SME - Standard",
      interestRate: 0.03,
      pfRate: 0.08,
      effectiveFrom: "2026-08-07",
      segment: "sme",
    });
    assert.equal(parsed.segment, "sme");
  });
});
