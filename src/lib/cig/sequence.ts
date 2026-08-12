import {
  assessFieldVisitRequired,
  assessSmeReloanRequired,
} from "./field-visit";
import {
  isBorrowerReviewComplete,
  isCiReferencesComplete,
  isCrewingManagerComplete,
  isFindingRecorded,
  type VerificationRecord,
  type VerificationScope,
} from "./verification";

/** Thrown when a write targets a locked CIG sequence stage — map to HTTP 400. */
export class CigSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CigSequenceError";
  }
}

export type CigSequenceStage =
  | "borrower_review"
  | "external_checks"
  | "ci_references"
  | "crewing_manager"
  | "finding"
  | "forward";

export type CigSequenceState = {
  current: CigSequenceStage;
  completed: Record<CigSequenceStage, boolean>;
  unlocked: Record<CigSequenceStage, boolean>;
};

/** Patch-like object (avoids importing forward.ts and circular deps). */
export type SequenceVerificationPatch = Record<string, unknown>;

export {
  isBorrowerReviewComplete,
  isCiReferencesComplete,
  isCrewingManagerComplete,
  isFindingRecorded,
};

const STAGE_ORDER: CigSequenceStage[] = [
  "borrower_review",
  "external_checks",
  "ci_references",
  "crewing_manager",
  "finding",
  "forward",
];

const BORROWER_REVIEW_KEYS: ReadonlySet<string> = new Set([
  "fieldCompletenessOk",
  "fieldCompletenessNotes",
  "biIdentityConfirmed",
  "biPurposeConfirmed",
  "biDetailsConfirmed",
  "biNotes",
]);

const CI_REFERENCES_KEYS: ReadonlySet<string> = new Set([
  "picAllotmentAwareness",
  "picPaymentReliability",
  "picInterviewNotes",
  "characterReferencesNotes",
  "charRefOtherLenders",
  "picVerification",
  "referenceVerifications",
  "verificationChecklist",
  "picPaymentPreference",
  "picDemeanor",
  "picRating",
  "picRatingReason",
  "cifVerifiedBy",
  "cifVerifiedDate",
  // SME Field Visit occupies the same sequence slot as CI & Refs (6.0.a replace).
  "fieldVisit",
  "smeReloanVerification",
]);

const CREWING_MANAGER_KEYS: ReadonlySet<string> = new Set([
  "cmDepartureDate",
  "cmSalary",
  "cmPosition",
  "cmContractStatus",
  "cmFitToWork",
  "cmNotes",
]);

const FINDING_KEYS: ReadonlySet<string> = new Set([
  "finding",
  "findingNotes",
]);

const STAGE_LABEL: Record<CigSequenceStage, string> = {
  borrower_review: "Borrower review",
  external_checks: "External checks",
  ci_references: "CI & References Form",
  crewing_manager: "Crewing manager",
  finding: "Finding",
  forward: "Submit CI report",
};

function isSmeFieldStageComplete(
  verification: VerificationRecord,
  scope: VerificationScope,
): boolean {
  if (scope.isReloan) {
    return assessSmeReloanRequired(verification.smeReloanVerification).complete;
  }
  return assessFieldVisitRequired(verification.fieldVisit).complete;
}

export function getCigSequenceState(
  verification: VerificationRecord,
  checksComplete: boolean,
  scope: VerificationScope = {},
): CigSequenceState {
  const segment = scope.segment === "sme" ? "sme" : "seafarer";
  const s1 = isBorrowerReviewComplete(verification);
  const s2 = s1 && checksComplete;

  let s3: boolean;
  let s4: boolean;
  if (segment === "sme") {
    // Field Visit replaces PIC + Crewing (6.0.a). Crewing slot auto-completes.
    s3 = s2 && isSmeFieldStageComplete(verification, scope);
    s4 = s3;
  } else {
    s3 = s2 && isCiReferencesComplete(verification);
    s4 = s3 && isCrewingManagerComplete(verification);
  }

  const s5 = s4 && isFindingRecorded(verification);

  const completed: Record<CigSequenceStage, boolean> = {
    borrower_review: s1,
    external_checks: s2,
    ci_references: s3,
    crewing_manager: s4,
    finding: s5,
    forward: s5,
  };

  const unlocked: Record<CigSequenceStage, boolean> = {
    borrower_review: true,
    external_checks: s1,
    ci_references: s2,
    crewing_manager: s3,
    finding: s4,
    forward: s5,
  };

  let current: CigSequenceStage = "borrower_review";
  for (const stage of STAGE_ORDER) {
    if (!completed[stage]) {
      current = stage;
      break;
    }
    current = "forward";
  }

  return { current, completed, unlocked };
}

function patchTouches(
  patch: SequenceVerificationPatch,
  keys: ReadonlySet<string>,
): boolean {
  for (const key of keys) {
    if (patch[key] !== undefined) return true;
  }
  return false;
}

function prerequisiteFor(stage: CigSequenceStage): string {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx <= 0) return STAGE_LABEL.borrower_review;
  return STAGE_LABEL[STAGE_ORDER[idx - 1]];
}

/**
 * Rejects verification field writes that belong to a locked sequence stage.
 * Within-stage partial saves are allowed. Empty patches are allowed.
 */
export function assertVerificationPatchAllowed(
  patch: SequenceVerificationPatch,
  state: CigSequenceState,
): void {
  const checks: Array<{
    stage: CigSequenceStage;
    keys: ReadonlySet<string>;
  }> = [
    { stage: "borrower_review", keys: BORROWER_REVIEW_KEYS },
    { stage: "ci_references", keys: CI_REFERENCES_KEYS },
    { stage: "crewing_manager", keys: CREWING_MANAGER_KEYS },
    { stage: "finding", keys: FINDING_KEYS },
  ];

  for (const { stage, keys } of checks) {
    if (!patchTouches(patch, keys)) continue;
    if (state.unlocked[stage]) continue;
    throw new CigSequenceError(
      `${STAGE_LABEL[stage]} locked until ${prerequisiteFor(stage)} is complete`,
    );
  }
}

/**
 * External checks (S2) may be recorded only after borrower review (S1) is complete.
 */
export function assertChecksRecordingAllowed(state: CigSequenceState): void {
  if (state.unlocked.external_checks) return;
  throw new CigSequenceError(
    "External checks locked until Borrower review (field completeness + interview) is complete",
  );
}

export function cigSequenceStageLabel(
  stage: CigSequenceStage,
  segment?: "seafarer" | "sme" | null,
): string {
  if (segment === "sme") {
    if (stage === "ci_references") return "Field Visit";
    if (stage === "crewing_manager") return "Field Visit (complete)";
  }
  return STAGE_LABEL[stage];
}
