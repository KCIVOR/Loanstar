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

  it("accepts individual segment without entityType", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "individual",
      individualLoanType: "mpl",
    });
    assert.equal(parsed.segment, "individual");
    assert.equal(parsed.entityType, undefined);
  });
});

describe("createApplicationSchema (Salary/MPL individual sub-type)", () => {
  it("rejects individual + no-collateral without individualLoanType", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "individual",
    });
    assert.equal(result.success, false);
  });

  it("accepts individual + no-collateral with individualLoanType mpl", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "individual",
      individualLoanType: "mpl",
    });
    assert.equal(parsed.individualLoanType, "mpl");
  });

  it("accepts individual + no-collateral with individualLoanType salary", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "individual",
      individualLoanType: "salary",
    });
    assert.equal(parsed.individualLoanType, "salary");
  });

  it("rejects individualLoanType when collateralType is not none", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "individual",
      collateralType: "car_refinancing",
      individualLoanType: "mpl",
    });
    assert.equal(result.success, false);
  });

  it("rejects individualLoanType for sme segment", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "sme",
      entityType: "individual",
      individualLoanType: "mpl",
    });
    assert.equal(result.success, false);
  });

  it("does not require individualLoanType for seafarer", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "seafarer",
    });
    assert.equal(parsed.individualLoanType, undefined);
  });
});

describe("createApplicationSchema collateralType (Phase 3)", () => {
  it("defaults collateralType to none", () => {
    const parsed = createApplicationSchema.parse(base);
    assert.equal(parsed.collateralType, "none");
  });

  it("accepts sme with car_refinancing collateral", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "sme",
      entityType: "individual",
      collateralType: "car_refinancing",
    });
    assert.equal(parsed.collateralType, "car_refinancing");
  });

  it("accepts individual with real_estate collateral", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "individual",
      collateralType: "real_estate",
    });
    assert.equal(parsed.collateralType, "real_estate");
  });

  it("rejects seafarer with any collateral type", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "seafarer",
      collateralType: "car_refinancing",
    });
    assert.equal(result.success, false);
  });

  it("accepts seafarer with explicit collateralType none", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "seafarer",
      collateralType: "none",
    });
    assert.equal(parsed.collateralType, "none");
  });
});
