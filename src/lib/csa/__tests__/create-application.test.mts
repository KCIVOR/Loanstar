import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApplicationSchema } from "../create-application";

const base = {
  email: "borrower@example.com",
  firstName: "Ana",
  lastName: "Santos",
};

describe("createApplicationSchema (SME Phase 1)", () => {
  it("defaults segment to seafarer when omitted", () => {
    const parsed = createApplicationSchema.parse(base);
    assert.equal(parsed.segment, "seafarer");
    assert.equal(parsed.entityType, undefined);
  });

  it("accepts seafarer without entityType", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "seafarer",
    });
    assert.equal(parsed.segment, "seafarer");
    assert.equal(parsed.entityType, undefined);
  });

  it("rejects sme without entityType", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "sme",
    });
    assert.equal(result.success, false);
  });

  it("accepts sme with individual entityType", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "sme",
      entityType: "individual",
    });
    assert.equal(parsed.segment, "sme");
    assert.equal(parsed.entityType, "individual");
  });

  it("accepts sme with corporate entityType", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "sme",
      entityType: "corporate",
    });
    assert.equal(parsed.segment, "sme");
    assert.equal(parsed.entityType, "corporate");
  });
});
