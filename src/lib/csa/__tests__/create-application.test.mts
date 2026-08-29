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
      paymentSchedule: "mpl",
    });
    assert.equal(parsed.segment, "individual");
    assert.equal(parsed.entityType, undefined);
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

describe("createApplicationSchema paymentSchedule (payment-schedule unification)", () => {
  it("defaults paymentSchedule to monthly", () => {
    const parsed = createApplicationSchema.parse(base);
    assert.equal(parsed.paymentSchedule, "monthly");
  });

  it("accepts every one of the 8 schedule values for sme", () => {
    for (const paymentSchedule of [
      "mpl",
      "salary",
      "monthly",
      "weekly",
      "bi_monthly",
      "quarterly",
      "two_monthly",
      "daily",
    ] as const) {
      const parsed = createApplicationSchema.parse({
        ...base,
        segment: "sme",
        entityType: "corporate",
        paymentSchedule,
      });
      assert.equal(parsed.paymentSchedule, paymentSchedule);
    }
  });

  it("accepts every one of the 8 schedule values for individual (cross-segment access)", () => {
    for (const paymentSchedule of [
      "mpl",
      "salary",
      "monthly",
      "weekly",
      "bi_monthly",
      "quarterly",
      "two_monthly",
      "daily",
    ] as const) {
      const parsed = createApplicationSchema.parse({
        ...base,
        segment: "individual",
        paymentSchedule,
      });
      assert.equal(parsed.paymentSchedule, paymentSchedule);
    }
  });

  it("individual + quarterly succeeds (previously meaningless under the old two-field design)", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "individual",
      paymentSchedule: "quarterly",
    });
    assert.equal(parsed.paymentSchedule, "quarterly");
  });

  it("sme + mpl succeeds (previously an individual-only value)", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "sme",
      entityType: "corporate",
      paymentSchedule: "mpl",
    });
    assert.equal(parsed.paymentSchedule, "mpl");
  });

  it("rejects a non-monthly paymentSchedule for seafarer", () => {
    const result = createApplicationSchema.safeParse({
      ...base,
      segment: "seafarer",
      paymentSchedule: "weekly",
    });
    assert.equal(result.success, false);
  });

  it("accepts sme with a collateral type and a non-monthly paymentSchedule together (orthogonal facts)", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "sme",
      entityType: "corporate",
      collateralType: "car_refinancing",
      paymentSchedule: "quarterly",
    });
    assert.equal(parsed.collateralType, "car_refinancing");
    assert.equal(parsed.paymentSchedule, "quarterly");
  });

  it("does not require paymentSchedule for seafarer", () => {
    const parsed = createApplicationSchema.parse({
      ...base,
      segment: "seafarer",
    });
    assert.equal(parsed.paymentSchedule, "monthly");
  });
});
