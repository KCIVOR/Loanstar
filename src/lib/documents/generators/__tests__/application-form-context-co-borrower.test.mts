import test from "node:test";
import assert from "node:assert/strict";

import type { BorrowerProfile } from "@/lib/borrowers/types";

import { buildApplicationFormContext } from "../application-form-context";

function baseProfile(overrides: Partial<BorrowerProfile> = {}): BorrowerProfile {
  return {
    id: "b1",
    userId: "u1",
    borrowerNo: "BN100",
    email: "a@example.com",
    firstName: "Juan",
    middleName: "C",
    lastName: "Dela Cruz",
    suffix: null,
    dateOfBirth: "1985-05-14",
    placeOfBirth: "Baliwag",
    citizenship: "Filipino",
    civilStatus: "Married",
    gender: "Male",
    mobilePhone: "09171234567",
    landline: "0281230000",
    presentAddress: { street: "1 Main St", city: "Baliwag", province: "Bulacan" },
    permanentAddress: { city: "Baliwag", province: "Bulacan" },
    manningAgency: {},
    financial: {},
    allottee: {},
    picWork: {},
    businessInfo: {},
    dependents: [],
    references: [],
    profileData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("co-borrower context: absent → blank name/address, hasCoBorrower false (unchanged output)", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    profile: baseProfile(),
  });
  assert.equal(ctx.coBorrowerName, "");
  assert.equal(ctx.coBorrowerAddress, "");
  assert.equal(ctx.hasCoBorrower, false);
});

test("co-borrower context: one row → name + address populated, hasCoBorrower true", () => {
  const ctx = buildApplicationFormContext({
    segment: "individual",
    profile: baseProfile(),
    coBorrowers: [{ fullName: "Ana Reyes", address: "12 Mabini St, Baliwag" }],
  });
  assert.equal(ctx.coBorrowerName, "Ana Reyes");
  assert.equal(ctx.coBorrowerAddress, "12 Mabini St, Baliwag");
  assert.equal(ctx.hasCoBorrower, true);
});

test("co-borrower context: multiple rows → semicolon-joined", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    profile: baseProfile(),
    coBorrowers: [
      { fullName: "Ana Reyes", address: "12 Mabini St" },
      { fullName: "Bo Tan", address: "9 Rizal Ave" },
    ],
  });
  assert.equal(ctx.coBorrowerName, "Ana Reyes; Bo Tan");
  assert.equal(ctx.coBorrowerAddress, "12 Mabini St; 9 Rizal Ave");
  assert.equal(ctx.hasCoBorrower, true);
});

test("co-borrower context: a row missing its address does not set hasCoBorrower", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    profile: baseProfile(),
    coBorrowers: [{ fullName: "Ana Reyes", address: "" }],
  });
  assert.equal(ctx.hasCoBorrower, false);
  // The name still surfaces for display, but the conditional flag stays false.
  assert.equal(ctx.coBorrowerName, "Ana Reyes");
  assert.equal(ctx.coBorrowerAddress, "");
});
