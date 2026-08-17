import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessFieldVisitRequired,
  assessSmeReloanRequired,
  computeReloanTotalNetIncome,
  RESIDENCE_TYPES,
  sumHouseExpenses,
  sumReloanBusinessExpenses,
  sumReloanHouseholdExpenses,
} from "../field-visit";
import {
  assessVerificationCompleteness,
  type VerificationRecord,
} from "../verification";
import { getCigSequenceState } from "../sequence";

describe("RESIDENCE_TYPES (6.0.d.5)", () => {
  it("exposes exactly 8 types from one shared list", () => {
    assert.equal(RESIDENCE_TYPES.length, 8);
    assert.ok(RESIDENCE_TYPES.some((t) => t.id === "apartment"));
  });
});

describe("computed totals (Phase 6.3.b / extraction §6)", () => {
  it("sums 8 house-expense lines", () => {
    assert.equal(
      sumHouseExpenses({
        rental: 1,
        salary: 2,
        electricity: 3,
        school: 4,
        water: 5,
        internet: 6,
        foods: 7,
        others: 8,
      }),
      36,
    );
  });

  it("sums 7 reloan household expenses", () => {
    assert.equal(
      sumReloanHouseholdExpenses({
        electricity: 10,
        water: 20,
        internet: 30,
        subdivisionDues: 40,
        school: 50,
        helpersSalary: 60,
        monthlyAmortization: 70,
      }),
      280,
    );
  });

  it("sums 6 business expenses and excludes F42 extraLine (6.0.e.2)", () => {
    assert.equal(
      sumReloanBusinessExpenses({
        employeeSalary: 100,
        water: 10,
        electricity: 20,
        internet: 30,
        rental: 40,
        operationalExpenses: 50,
        extraLine: 9999,
      }),
      250,
    );
  });

  it("keeps M50 negative-sign convention (6.0.e.1)", () => {
    // -M49 - L23
    assert.equal(computeReloanTotalNetIncome(1000, 200), -1200);
  });
});

function emptyVerification(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return {
    id: "ver-1",
    loanApplicationId: "app-1",
    fieldCompletenessOk: null,
    fieldCompletenessNotes: null,
    biIdentityConfirmed: null,
    biPurposeConfirmed: null,
    biDetailsConfirmed: null,
    biNotes: null,
    picAllotmentAwareness: null,
    picPaymentReliability: null,
    picInterviewNotes: null,
    cmDepartureDate: null,
    cmSalary: null,
    cmPosition: null,
    cmContractStatus: null,
    cmFitToWork: null,
    cmNotes: null,
    cmManagerName: null,
    cmManagerPosition: null,
    cmManagerContact: null,
    cmManningAgencyName: null,
    cmJoiningPort: null,
    characterReferencesNotes: null,
    charRefOtherLenders: null,
    picVerification: null,
    referenceVerifications: null,
    verificationChecklist: null,
    picPaymentPreference: null,
    picDemeanor: null,
    picRating: null,
    picRatingReason: null,
    cifVerifiedBy: null,
    cifVerifiedDate: null,
    fieldVisit: null,
    smeReloanVerification: null,
    finding: null,
    findingNotes: null,
    isComplete: false,
    completedAt: null,
    forwardedAt: null,
    ...overrides,
  };
}

describe("SME completeness replaces PIC/CM (6.0.a / 6.7)", () => {
  it("does not require PIC/crewing for SME", () => {
    const verification = emptyVerification({
      fieldCompletenessOk: true,
      biIdentityConfirmed: true,
      biPurposeConfirmed: true,
      biDetailsConfirmed: true,
      fieldVisit: {
        header: {
          dateVisited: "2026-08-01",
          visitedBy: "CIG User",
          clientName: "Acme",
        },
        residence: { residenceType: "bungalow" },
        recommendation: {
          creditRealizationRisk: "low",
          recommendation: "for_approval",
          preparedBy: "CIG User",
        },
      },
      finding: "positive",
    });

    const assessed = assessVerificationCompleteness(verification, true, [], {
      segment: "sme",
      isReloan: false,
    });
    assert.equal(assessed.complete, true);
    assert.ok(!assessed.missing.some((m) => /PIC|Crewing/i.test(m)));
  });

  it("Seafarer path still requires PIC (regression)", () => {
    const verification = emptyVerification({
      fieldCompletenessOk: true,
      biIdentityConfirmed: true,
      biPurposeConfirmed: true,
      biDetailsConfirmed: true,
      finding: "positive",
    });
    const assessed = assessVerificationCompleteness(verification, true, []);
    assert.equal(assessed.complete, false);
    assert.ok(assessed.missing.some((m) => /PIC name/i.test(m)));
  });

  it("assessFieldVisitRequired lists gating fields", () => {
    const r = assessFieldVisitRequired({});
    assert.equal(r.complete, false);
    assert.ok(r.missing.length >= 5);
  });

  it("assessSmeReloanRequired lists gating fields", () => {
    const r = assessSmeReloanRequired({});
    assert.equal(r.complete, false);
    assert.ok(r.missing.some((m) => /verified by/i.test(m)));
  });

  it("SME sequence skips crewing slot after field visit", () => {
    const verification = emptyVerification({
      fieldCompletenessOk: true,
      biIdentityConfirmed: true,
      biPurposeConfirmed: true,
      biDetailsConfirmed: true,
      fieldVisit: {
        header: {
          dateVisited: "2026-08-01",
          visitedBy: "CIG",
          clientName: "Acme",
        },
        residence: { residenceType: "town_house" },
        recommendation: {
          creditRealizationRisk: "medium",
          recommendation: "for_approval",
          preparedBy: "CIG",
        },
      },
    });
    const state = getCigSequenceState(verification, true, {
      segment: "sme",
      isReloan: false,
    });
    assert.equal(state.completed.ci_references, true);
    assert.equal(state.completed.crewing_manager, true);
    assert.equal(state.unlocked.finding, true);
  });
});
