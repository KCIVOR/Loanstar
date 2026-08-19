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
    businessInfo: {},
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
    // Typed as BorrowerProfile (a superset of ApplicationFormProfile) so this
    // fixture can carry fields the completeness check never reads — the point
    // of the test is that they're irrelevant, not that they're absent from the type.
    const profile: BorrowerProfile = {
      ...completeProfile(),
      dependents: [],
      references: [],
      allottee: {},
      permanentAddress: {},
      middleName: null,
      landline: null,
      financial: {},
    };
    const result = assessApplicationFormCompleteness(profile);
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

describe("application form completeness SME Phase 3.6", () => {
  it("does not require manning/rank/vessel for SME individual", () => {
    const profile = {
      ...completeProfile(),
      manningAgency: {},
      picWork: {},
      businessInfo: {
        companyName: "Ana Trading",
        companyAddress: "123 Market St",
        yearsOfOperation: "5",
      },
    };
    const result = assessApplicationFormCompleteness(profile, {
      segment: "sme",
      entityType: "individual",
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("requires Individual business fields from the client PDF", () => {
    const result = assessApplicationFormCompleteness(
      {
        ...completeProfile(),
        manningAgency: {},
        picWork: {},
        businessInfo: {},
      },
      { segment: "sme", entityType: "individual" },
    );
    assert.equal(result.complete, false);
    assert.ok(!result.missing.includes("Application form: manning agency name"));
    assert.ok(!result.missing.includes("Application form: rank"));
    assert.ok(!result.missing.includes("Application form: vessel"));
    assert.deepEqual(
      result.missing.filter((m) => m.startsWith("Application form:")),
      [
        "Application form: company / employer name",
        "Application form: company address",
        "Application form: years of operation",
      ],
    );
  });

  it("requires Corporate business fields from the client PDF", () => {
    const result = assessApplicationFormCompleteness(
      {
        ...completeProfile(),
        manningAgency: {},
        picWork: {},
        businessInfo: { companyName: "RC Ramos" },
      },
      { segment: "sme", entityType: "corporate" },
    );
    assert.equal(result.complete, false);
    assert.ok(
      result.missing.includes("Application form: office address"),
    );
    assert.ok(
      result.missing.includes("Application form: nature of business"),
    );
    assert.ok(result.missing.includes("Application form: TIN"));
    assert.ok(
      result.missing.includes("Application form: date established"),
    );
  });

  it("is complete for SME corporate when PDF identity fields are filled", () => {
    const result = assessApplicationFormCompleteness(
      {
        ...completeProfile(),
        manningAgency: {},
        picWork: {},
        businessInfo: {
          companyName: "RC Ramos Construction",
          officeAddress: "Makati",
          natureOfBusiness: "Construction",
          tin: "123-456-789",
          dateEstablished: "2010-01-01",
        },
      },
      { segment: "sme", entityType: "corporate" },
    );
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("keeps Seafarer missing[] byte-identical when scope omitted", () => {
    const withDefault = assessApplicationFormCompleteness(emptyProfile());
    const withExplicit = assessApplicationFormCompleteness(emptyProfile(), {
      segment: "seafarer",
    });
    assert.deepEqual(withDefault.missing, withExplicit.missing);
  });
});

describe("application form completeness Individual (Phase 1.4)", () => {
  it("does not require manning/rank/vessel or any business field for Individual", () => {
    const profile = {
      ...completeProfile(),
      manningAgency: {},
      picWork: {},
      businessInfo: {},
    };
    const result = assessApplicationFormCompleteness(profile, {
      segment: "individual",
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("lists only the common identity + loan-intent fields for an empty Individual profile", () => {
    const result = assessApplicationFormCompleteness(emptyProfile(), {
      segment: "individual",
    });
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "Application form: first name",
      "Application form: last name",
      "Application form: mobile phone",
      "Application form: email",
      "Application form: loan desired",
      "Application form: requested terms",
      "Application form: purpose of loan",
      "Application form: present address",
    ]);
    assert.ok(!result.missing.includes("Application form: manning agency name"));
    assert.ok(!result.missing.includes("Application form: rank"));
    assert.ok(!result.missing.includes("Application form: vessel"));
  });

  it("null-profile branch matches the populated-profile branch's missing set", () => {
    const nullBranch = assessApplicationFormCompleteness(null, {
      segment: "individual",
    });
    const populatedBranch = assessApplicationFormCompleteness(
      emptyProfile(),
      { segment: "individual" },
    );
    assert.deepEqual(nullBranch.missing, populatedBranch.missing);
  });
});
