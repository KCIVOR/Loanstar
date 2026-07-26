import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BorrowerProfile } from "@/lib/borrowers/types";

import {
  assessApplicationFormCompleteness,
} from "../application-form-completeness";

function emptyProfile(): BorrowerProfile {
  return {
    id: "b1",
    userId: null,
    borrowerNo: "B-1",
    email: "",
    firstName: "",
    middleName: null,
    lastName: "",
    suffix: null,
    dateOfBirth: null,
    placeOfBirth: null,
    citizenship: null,
    civilStatus: null,
    gender: null,
    mobilePhone: null,
    landline: null,
    presentAddress: {},
    permanentAddress: {},
    manningAgency: {},
    financial: {},
    allottee: {},
    picWork: {},
    dependents: [],
    references: [],
    profileData: {},
    createdAt: "2026-07-23T00:00:00Z",
    updatedAt: "2026-07-23T00:00:00Z",
  };
}

function completeProfile(): BorrowerProfile {
  return {
    ...emptyProfile(),
    email: "borrower@example.com",
    firstName: "Juan",
    lastName: "Dela Cruz",
    mobilePhone: "09171234567",
    presentAddress: { street: "123 Main St" },
    manningAgency: { name: "Marlow Navigation" },
    picWork: { rank: "AB", vessel: "MV Example" },
    profileData: {
      loanDesired: "150000",
      requestedTerms: "12",
      purposeOfLoan: "Home renovation",
    },
  };
}

describe("application form completeness for endorse", () => {
  it("lists all frozen required gaps for an empty profile", () => {
    const result = assessApplicationFormCompleteness(emptyProfile());
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "Application form: first name",
      "Application form: last name",
      "Application form: mobile phone",
      "Application form: email",
      "Application form: manning agency name",
      "Application form: rank",
      "Application form: vessel",
      "Application form: loan desired",
      "Application form: requested terms",
      "Application form: purpose of loan",
      "Application form: present address",
    ]);
  });

  it("lists only the remaining gaps for a partial profile", () => {
    const partial = {
      ...completeProfile(),
      mobilePhone: "   ",
      manningAgency: {},
      profileData: {
        loanDesired: "150000",
        requestedTerms: "",
        purposeOfLoan: "Home renovation",
      },
    };
    const result = assessApplicationFormCompleteness(partial);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "Application form: mobile phone",
      "Application form: manning agency name",
      "Application form: requested terms",
    ]);
  });

  it("is complete when every frozen required field is filled", () => {
    const result = assessApplicationFormCompleteness(completeProfile());
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("does not require dependents, references, allottee, or permanent address", () => {
    const result = assessApplicationFormCompleteness({
      ...completeProfile(),
      dependents: [],
      references: [],
      allottee: {},
      permanentAddress: {},
      middleName: null,
      landline: null,
      financial: {},
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("treats whitespace-only strings as empty", () => {
    const result = assessApplicationFormCompleteness({
      ...completeProfile(),
      firstName: "  \t  ",
      presentAddress: { street: "   " },
    });
    assert.equal(result.complete, false);
    assert.ok(result.missing.includes("Application form: first name"));
    assert.ok(result.missing.includes("Application form: present address"));
  });
});
