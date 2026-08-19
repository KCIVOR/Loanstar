import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessCmInspectionRequired,
  assessRemInspectionRequired,
  type CmInspection,
  type RemInspection,
} from "../collateral-inspection";
import { assessVerificationCompleteness, type VerificationRecord } from "../verification";

describe("assessCmInspectionRequired (Phase 8.2)", () => {
  it("is incomplete for a blank form", () => {
    const result = assessCmInspectionRequired(null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "CM Inspection: account name",
      "CM Inspection: plate number",
      "CM Inspection: verified by",
    ]);
  });

  it("is complete when account name, plate number, and verified by are filled", () => {
    const cm: CmInspection = {
      account: { accountName: "Juan Dela Cruz" },
      orCrDetails: { plateNumber: "ABC 1234" },
      verifiedBy: "Field Investigator Name",
    };
    const result = assessCmInspectionRequired(cm);
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("lists only the remaining gaps for a partial form", () => {
    const cm: CmInspection = { account: { accountName: "Juan Dela Cruz" } };
    const result = assessCmInspectionRequired(cm);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "CM Inspection: plate number",
      "CM Inspection: verified by",
    ]);
  });
});

describe("assessRemInspectionRequired (Phase 8.2)", () => {
  it("is incomplete for a blank form", () => {
    const result = assessRemInspectionRequired(null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "REM Inspection: account name",
      "REM Inspection: registered owner at the title",
      "REM Inspection: verified by",
    ]);
  });

  it("is complete when account name, registered owner, and verified by are filled", () => {
    const rem: RemInspection = {
      account: { accountName: "Juan Dela Cruz" },
      titleDetails: { registeredOwnerAtTitle: "Juan Dela Cruz" },
      verifiedBy: "Field Investigator Name",
    };
    const result = assessRemInspectionRequired(rem);
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });
});

function baseVerification(): VerificationRecord {
  return {
    id: "v1",
    loanApplicationId: "app1",
    fieldCompletenessOk: true,
    fieldCompletenessNotes: null,
    biIdentityConfirmed: true,
    biPurposeConfirmed: true,
    biDetailsConfirmed: true,
    biNotes: null,
    picAllotmentAwareness: null,
    picPaymentReliability: null,
    picInterviewNotes: null,
    cmDepartureDate: null,
    cmSalary: null,
    cmBasicSalary: null,
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
    picVerification: {
      name: "Ref Name",
      contactNumber: "0917",
      relationToClient: "Sibling",
    },
    referenceVerifications: [
      { name: "R1", contactNumber: "0918", relationToClient: "Friend" },
    ],
    verificationChecklist: {
      validateBorrowerInfo: true,
      validatePicInfo: true,
      presidePicObligationSpill: true,
      verifiedCharacterReferences: true,
    },
    picPaymentPreference: null,
    picDemeanor: null,
    picRating: 5,
    picRatingReason: null,
    cifVerifiedBy: null,
    cifVerifiedDate: null,
    fieldVisit: null,
    smeReloanVerification: null,
    cmInspection: null,
    remInspection: null,
    finding: "positive",
    findingNotes: null,
    isComplete: false,
    completedAt: null,
    forwardedAt: null,
  };
}

describe("assessVerificationCompleteness collateral dimension (Phase 8.3)", () => {
  it("requires nothing extra when collateralType is none", () => {
    const result = assessVerificationCompleteness(baseVerification(), true, [], {
      segment: "individual",
      collateralType: "none",
    });
    assert.equal(
      result.missing.some((m) => m.startsWith("CM Inspection")),
      false,
    );
    assert.equal(
      result.missing.some((m) => m.startsWith("REM Inspection")),
      false,
    );
  });

  it("requires CM Inspection when collateralType is car_refinancing", () => {
    const result = assessVerificationCompleteness(baseVerification(), true, [], {
      segment: "sme",
      collateralType: "car_refinancing",
    });
    assert.ok(result.missing.some((m) => m.startsWith("CM Inspection")));
    assert.equal(result.complete, false);
  });

  it("is complete once CM Inspection's own required fields are filled", () => {
    const verification = {
      ...baseVerification(),
      cmInspection: {
        account: { accountName: "Acct" },
        orCrDetails: { plateNumber: "ABC 123" },
        verifiedBy: "Investigator",
      },
    };
    const result = assessVerificationCompleteness(verification, true, [], {
      segment: "sme",
      collateralType: "car_refinancing",
    });
    assert.equal(
      result.missing.some((m) => m.startsWith("CM Inspection")),
      false,
    );
  });

  it("requires REM Inspection when collateralType is real_estate", () => {
    const result = assessVerificationCompleteness(baseVerification(), true, [], {
      segment: "individual",
      collateralType: "real_estate",
    });
    assert.ok(result.missing.some((m) => m.startsWith("REM Inspection")));
    assert.equal(result.complete, false);
  });
});
