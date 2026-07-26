import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertChecksRecordingAllowed,
  assertVerificationPatchAllowed,
  CigSequenceError,
  getCigSequenceState,
  isBorrowerReviewComplete,
  isCiReferencesComplete,
  isCrewingManagerComplete,
  type CigSequenceStage,
} from "../sequence";
import type {
  PicVerification,
  ReferenceVerification,
  VerificationChecklist,
  VerificationRecord,
} from "../verification";
import {
  assessCiReferencesRequired,
  assessVerificationCompleteness,
} from "../verification";

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
    finding: null,
    findingNotes: null,
    isComplete: false,
    completedAt: null,
    forwardedAt: null,
    ...overrides,
  };
}

function s1Complete(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return emptyVerification({
    fieldCompletenessOk: true,
    biIdentityConfirmed: true,
    biPurposeConfirmed: true,
    biDetailsConfirmed: true,
    ...overrides,
  });
}

function completePic(): PicVerification {
  return {
    name: "Maria Santos",
    contactNumber: "09171234567",
    relationToClient: "Spouse",
  };
}

function completeRefs(): ReferenceVerification[] {
  return [
    {
      name: "Ref One",
      contactNumber: "09170000001",
      relationToClient: "Friend",
    },
    {
      name: "Ref Two",
      contactNumber: "09170000002",
      relationToClient: "Coworker",
    },
  ];
}

function completeChecklist(): VerificationChecklist {
  return {
    validateBorrowerInfo: true,
    validatePicInfo: true,
    presidePicObligationSpill: true,
    verifiedCharacterReferences: true,
  };
}

function s3Complete(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return s1Complete({
    picVerification: completePic(),
    referenceVerifications: completeRefs(),
    verificationChecklist: completeChecklist(),
    picRating: 4,
    ...overrides,
  });
}

function s4Complete(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return s3Complete({
    cmPosition: "Able Seaman",
    cmContractStatus: "Active",
    cmDepartureDate: "2026-08-01",
    cmFitToWork: true,
    ...overrides,
  });
}

function s5Complete(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return s4Complete({
    finding: "positive",
    ...overrides,
  });
}

function assertLocked(
  unlocked: Record<CigSequenceStage, boolean>,
  stages: CigSequenceStage[],
) {
  for (const stage of stages) {
    assert.equal(unlocked[stage], false, `expected ${stage} locked`);
  }
}

describe("section complete predicates", () => {
  it("isBorrowerReviewComplete requires field + three interview confirms", () => {
    assert.equal(isBorrowerReviewComplete(emptyVerification()), false);
    assert.equal(
      isBorrowerReviewComplete(
        emptyVerification({
          fieldCompletenessOk: true,
          biIdentityConfirmed: true,
          biPurposeConfirmed: true,
        }),
      ),
      false,
    );
    assert.equal(isBorrowerReviewComplete(s1Complete()), true);
    // Yes/No both count as answered
    assert.equal(
      isBorrowerReviewComplete(
        s1Complete({ fieldCompletenessOk: false, biIdentityConfirmed: false }),
      ),
      true,
    );
  });

  it("isCiReferencesComplete matches submit subset", () => {
    assert.equal(isCiReferencesComplete(s1Complete()), false);
    assert.equal(isCiReferencesComplete(s3Complete()), true);
    assert.equal(
      isCiReferencesComplete(s3Complete({ picRating: null })),
      false,
    );
  });

  it("assessCiReferencesRequired lists gaps for incomplete draft", () => {
    const assessed = assessCiReferencesRequired({
      pic: { name: "A" },
      references: [],
      checklist: null,
      picRating: null,
    });
    assert.equal(assessed.complete, false);
    assert.ok(assessed.missing.some((m) => /PIC contact/i.test(m)));
    assert.ok(assessed.missing.some((m) => /1 complete reference/i.test(m)));
    assert.ok(assessed.missing.some((m) => /PIC rating/i.test(m)));
  });

  it("isCrewingManagerComplete requires CM fields", () => {
    assert.equal(isCrewingManagerComplete(s3Complete()), false);
    assert.equal(isCrewingManagerComplete(s4Complete()), true);
  });
});

describe("getCigSequenceState", () => {
  it("empty verification, checks incomplete → S1 current; S2–S5 locked", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.equal(state.current, "borrower_review");
    assert.equal(state.unlocked.borrower_review, true);
    assertLocked(state.unlocked, [
      "external_checks",
      "ci_references",
      "crewing_manager",
      "finding",
      "forward",
    ]);
    assert.equal(state.completed.borrower_review, false);
  });

  it("S1 complete only → S2 current; checks writable; CI not", () => {
    const state = getCigSequenceState(s1Complete(), false);
    assert.equal(state.current, "external_checks");
    assert.equal(state.completed.borrower_review, true);
    assert.equal(state.unlocked.external_checks, true);
    assert.equal(state.unlocked.ci_references, false);
  });

  it("S1+S2 complete → S3 current", () => {
    const state = getCigSequenceState(s1Complete(), true);
    assert.equal(state.current, "ci_references");
    assert.equal(state.unlocked.ci_references, true);
    assert.equal(state.unlocked.crewing_manager, false);
  });

  it("S1–S3 complete → S4 current", () => {
    const state = getCigSequenceState(s3Complete(), true);
    assert.equal(state.current, "crewing_manager");
    assert.equal(state.unlocked.crewing_manager, true);
    assert.equal(state.unlocked.finding, false);
  });

  it("S1–S4 complete → S5 current", () => {
    const state = getCigSequenceState(s4Complete(), true);
    assert.equal(state.current, "finding");
    assert.equal(state.unlocked.finding, true);
    assert.equal(state.unlocked.forward, false);
  });

  it("S1–S5 complete → S6 forward", () => {
    const state = getCigSequenceState(s5Complete(), true);
    assert.equal(state.current, "forward");
    assert.equal(state.unlocked.forward, true);
    assert.equal(state.completed.finding, true);
  });
});

describe("assertVerificationPatchAllowed", () => {
  it("rejects finding patch at S1", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.throws(
      () =>
        assertVerificationPatchAllowed({ finding: "positive" }, state),
      /finding/i,
    );
  });

  it("rejects crewing manager patch at S1", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.throws(
      () =>
        assertVerificationPatchAllowed({ cmPosition: "AB" }, state),
      /crewing/i,
    );
  });

  it("allows borrower interview fields at S1", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.doesNotThrow(() =>
      assertVerificationPatchAllowed(
        {
          fieldCompletenessOk: true,
          biIdentityConfirmed: true,
          biPurposeConfirmed: true,
          biDetailsConfirmed: true,
          biNotes: "Called OK",
        },
        state,
      ),
    );
  });

  it("rejects CI form fields while S2 incomplete", () => {
    const state = getCigSequenceState(s1Complete(), false);
    assert.throws(
      () =>
        assertVerificationPatchAllowed(
          { picVerification: completePic(), picRating: 3 },
          state,
        ),
      (err: unknown) =>
        err instanceof CigSequenceError &&
        /CI & References|references/i.test(err.message),
    );
  });

  it("allows empty patch", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.doesNotThrow(() => assertVerificationPatchAllowed({}, state));
  });
});

describe("assertChecksRecordingAllowed", () => {
  it("rejects checks while S1 incomplete", () => {
    const state = getCigSequenceState(emptyVerification(), false);
    assert.throws(
      () => assertChecksRecordingAllowed(state),
      (err: unknown) =>
        err instanceof CigSequenceError &&
        /borrower review|field completeness|interview/i.test(err.message),
    );
  });

  it("allows checks after S1 complete", () => {
    const state = getCigSequenceState(s1Complete(), false);
    assert.doesNotThrow(() => assertChecksRecordingAllowed(state));
  });
});

describe("sequence ↔ submit completeness parity", () => {
  it("S6 unlocked ⇒ assessVerificationCompleteness.complete (checks done)", () => {
    const verification = s5Complete();
    const state = getCigSequenceState(verification, true);
    assert.equal(state.current, "forward");
    assert.equal(state.unlocked.forward, true);

    const assessed = assessVerificationCompleteness(verification, true, []);
    assert.equal(assessed.complete, true);
    assert.equal(assessed.missing.length, 0);
  });

  it("incomplete sequence ⇒ submit not complete", () => {
    const verification = s4Complete(); // no finding yet
    const state = getCigSequenceState(verification, true);
    assert.equal(state.current, "finding");
    assert.equal(state.unlocked.forward, false);

    const assessed = assessVerificationCompleteness(verification, true, []);
    assert.equal(assessed.complete, false);
    assert.ok(assessed.missing.some((m) => /finding/i.test(m)));
  });

  it("checks incomplete keeps forward locked even if form full", () => {
    const verification = s5Complete();
    const state = getCigSequenceState(verification, false);
    assert.notEqual(state.current, "forward");
    assert.equal(state.unlocked.forward, false);

    const assessed = assessVerificationCompleteness(verification, false, [
      "NFIS check not recorded",
    ]);
    assert.equal(assessed.complete, false);
  });
});
