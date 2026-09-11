import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessCmInspectionRequired,
  assessRemInspectionRequired,
  normalizeCmInspection,
  normalizeRemInspection,
  type CmInspection,
  type RemInspection,
} from "../collateral-inspection";
import { assessVerificationCompleteness, type VerificationRecord } from "../verification";

describe("assessCmInspectionRequired (Phase 8.2, redesigned for repeatable vehicles)", () => {
  it("is incomplete for a blank form", () => {
    const result = assessCmInspectionRequired(null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "CM Inspection: account name",
      "CM Inspection: plate number",
      "CM Inspection: verified by",
    ]);
  });

  it("is complete when account name, at least one vehicle's plate number, and verified by are filled", () => {
    const cm: CmInspection = {
      account: { accountName: "Juan Dela Cruz" },
      vehicles: [{ orCrDetails: { plateNumber: "ABC 1234" } }],
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

  it("an empty vehicles array is the same as no plate number", () => {
    const cm: CmInspection = {
      account: { accountName: "Juan Dela Cruz" },
      vehicles: [],
      verifiedBy: "Investigator",
    };
    assert.equal(assessCmInspectionRequired(cm).complete, false);
  });

  it("is complete when the SECOND vehicle (not the first) has the plate number", () => {
    const cm: CmInspection = {
      account: { accountName: "Juan Dela Cruz" },
      vehicles: [{ orCrDetails: {} }, { orCrDetails: { plateNumber: "XYZ 999" } }],
      verifiedBy: "Investigator",
    };
    assert.equal(assessCmInspectionRequired(cm).complete, true);
  });
});

describe("assessRemInspectionRequired (Phase 8.2, redesigned for repeatable properties)", () => {
  it("is incomplete for a blank form", () => {
    const result = assessRemInspectionRequired(null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [
      "REM Inspection: account name",
      "REM Inspection: registered owner at the title",
      "REM Inspection: verified by",
    ]);
  });

  it("is complete when account name, at least one property's registered owner, and verified by are filled", () => {
    const rem: RemInspection = {
      account: { accountName: "Juan Dela Cruz" },
      properties: [{ titleDetails: { registeredOwnerAtTitle: "Juan Dela Cruz" } }],
      verifiedBy: "Field Investigator Name",
    };
    const result = assessRemInspectionRequired(rem);
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });

  it("an empty properties array is the same as no registered owner", () => {
    const rem: RemInspection = {
      account: { accountName: "Juan Dela Cruz" },
      properties: [],
      verifiedBy: "Investigator",
    };
    assert.equal(assessRemInspectionRequired(rem).complete, false);
  });
});

describe("normalizeCmInspection — legacy single-vehicle rows upgrade without losing data", () => {
  it("wraps a legacy (pre-redesign) single-vehicle object into a 1-entry array", () => {
    const legacy = {
      account: { accountName: "Acct", address: "Addr" },
      orCrDetails: { plateNumber: "ABC 1234", engineNo: "ENG1", chasisNo: "CHS1" },
      registration: { registeredOwner: "Owner" },
      insurance: { insurer: "Insurer Co" },
      odometerDuringInspection: 12345,
      vehiclesChecklist: { wipers: { working: true } },
      others: { keys: { remote: { yes: true } } },
      vehiclesCondition: { engine: { good: true } },
      verifiedBy: "Investigator",
    };
    const normalized = normalizeCmInspection(legacy);
    assert.equal(normalized.account?.accountName, "Acct");
    assert.equal(normalized.verifiedBy, "Investigator");
    assert.equal(normalized.vehicles?.length, 1);
    const v = normalized.vehicles![0];
    assert.equal(v.orCrDetails?.plateNumber, "ABC 1234");
    assert.equal(v.orCrDetails?.engineNo, "ENG1");
    assert.equal(v.registration?.registeredOwner, "Owner");
    assert.equal(v.insurance?.insurer, "Insurer Co");
    assert.equal(v.odometerDuringInspection, 12345);
    assert.equal(v.vehiclesChecklist?.wipers?.working, true);
    assert.equal(v.others?.keys?.remote?.yes, true);
    assert.equal(v.vehiclesCondition?.engine?.good, true);
  });

  it("passes an already-new-shape row through unchanged", () => {
    const current: CmInspection = {
      account: { accountName: "Acct" },
      vehicles: [
        { orCrDetails: { plateNumber: "AAA 111" } },
        { orCrDetails: { plateNumber: "BBB 222" } },
      ],
      verifiedBy: "Investigator",
    };
    const normalized = normalizeCmInspection(current);
    assert.deepEqual(normalized, current);
  });

  it("null / non-object input never throws — returns an empty-vehicles shell", () => {
    assert.deepEqual(normalizeCmInspection(null), {
      account: {},
      vehicles: [],
      verifiedBy: null,
    });
    assert.deepEqual(normalizeCmInspection(undefined), {
      account: {},
      vehicles: [],
      verifiedBy: null,
    });
  });

  it("account-only legacy row (no vehicle fields at all) normalizes to zero vehicles, not one empty vehicle", () => {
    const normalized = normalizeCmInspection({ account: { accountName: "Acct" } });
    assert.deepEqual(normalized.vehicles, []);
  });
});

describe("normalizeRemInspection — legacy single-property rows upgrade without losing data", () => {
  it("wraps a legacy (pre-redesign) single-property object into a 1-entry array", () => {
    const legacy = {
      account: { accountName: "Acct" },
      titleDetails: { registeredOwnerAtTitle: "Owner", yearRegister: "2020" },
      insurance: { insurer: "Insurer Co" },
      checklist: { paint: { working: true } },
      others: ["note 1", "note 2"],
      verifiedBy: "Investigator",
    };
    const normalized = normalizeRemInspection(legacy);
    assert.equal(normalized.account?.accountName, "Acct");
    assert.equal(normalized.verifiedBy, "Investigator");
    assert.deepEqual(normalized.others, ["note 1", "note 2"]);
    assert.equal(normalized.properties?.length, 1);
    const p = normalized.properties![0];
    assert.equal(p.titleDetails?.registeredOwnerAtTitle, "Owner");
    assert.equal(p.insurance?.insurer, "Insurer Co");
    assert.equal(p.checklist?.paint?.working, true);
  });

  it("passes an already-new-shape row through unchanged", () => {
    const current: RemInspection = {
      account: { accountName: "Acct" },
      properties: [
        { titleDetails: { registeredOwnerAtTitle: "Owner 1" } },
        { titleDetails: { registeredOwnerAtTitle: "Owner 2" } },
      ],
      others: [],
      verifiedBy: "Investigator",
    };
    const normalized = normalizeRemInspection(current);
    assert.deepEqual(normalized, current);
  });

  it("null / non-object input never throws", () => {
    assert.deepEqual(normalizeRemInspection(null), {
      account: {},
      properties: [],
      others: [],
      verifiedBy: null,
    });
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
        vehicles: [{ orCrDetails: { plateNumber: "ABC 123" } }],
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
