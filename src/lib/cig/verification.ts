import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assessFieldVisitRequired,
  assessSmeReloanRequired,
  type FieldVisit,
  type SmeReloanVerification,
} from "./field-visit";

// CI & References Form types (loanstar/docs/cig-references-form-plan.md, Phase 2).
// Field names/order follow CI AND REFERENCES FORM 1.xlsx, Sheet1.
export type PicAddress = {
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  zipCode?: string;
  ownership?: "owned" | "rented" | null;
  yearsOfStay?: string;
};

export type PicSibling = {
  name?: string;
  age?: string;
  occupation?: string;
};

/** One past/other financing/bank loan the PIC disclosed — repeatable, since a
 * borrower may have taken more than one over the last 4 years. */
export type PicOtherFinancingEntry = {
  company?: string;
  when?: string;
  loanAmount?: number;
  monthly?: number;
  startEnd?: string;
};

export type PicOtherFinancing = {
  hasOther?: boolean | null;
  entries?: PicOtherFinancingEntry[];
};

/** One loan under a housing/car loan flag — repeatable, since a borrower may
 * carry more than one (e.g. two vehicles, or a joint + personal mortgage). */
export type PicLoanFlagEntry = {
  loanAmount?: number;
  monthlyAmort?: number;
};

export type PicLoanFlag = {
  has?: boolean | null;
  entries?: PicLoanFlagEntry[];
};

export type PicOtherVerificationCalls = {
  status?: "yes" | "none" | null;
  company?: string;
  wasLending?: boolean;
  recalledLast3Months?: boolean;
};

// All fields optional: this is filled in incrementally over the course of a
// phone call and saved as a partial draft (see loanstar/docs/cig-references-form-plan.md).
export type PicVerification = {
  name?: string | null;
  birthday?: string | null;
  presentAddress?: PicAddress | null;
  provincialAddress?: PicAddress | null;
  contactNumber?: string | null;
  relationToClient?: string | null;
  otherNumber?: string | null;
  sinceWhen?: string | null;
  socialContact?: string | null;
  email?: string | null;
  companyName?: string | null;
  companyYearsOfStay?: string | null;
  companyPhone?: string | null;
  siblings?: PicSibling[];
  willAvailLoanAware?: boolean | null;
  otherFinancing?: PicOtherFinancing | null;
  housingLoan?: PicLoanFlag | null;
  carLoan?: PicLoanFlag | null;
  otherVerificationCalls?: PicOtherVerificationCalls | null;
};

export type ReferenceOtherVerificationCalls = {
  status?: "yes" | "no" | null;
  company?: string;
  recalledLast3Months?: boolean;
};

export type ReferenceVerification = {
  name?: string | null;
  age?: string | null;
  work?: string | null;
  relationToClient?: string | null;
  howLongKnowClient?: string | null;
  contactNumber?: string | null;
  otherContactNumber?: string | null;
  facebookAccount?: string | null;
  firstTimeAsReference?: boolean | null;
  otherVerificationCalls?: ReferenceOtherVerificationCalls | null;
  remarks?: string | null;
};

export type VerificationChecklist = {
  validateBorrowerInfo: boolean;
  validatePicInfo: boolean;
  presidePicObligationSpill: boolean;
  verifiedCharacterReferences: boolean;
};

export type PicPaymentPreference = {
  method:
    | "BDO"
    | "PBB"
    | "EASTWEST"
    | "UCPB"
    | "PERSONAL_CHECK"
    | "BANK"
    | "OTHERS"
    | null;
  bankSpecify?: string;
  othersSpecify?: string;
  remarks?: string;
};

export type PicDemeanorTag =
  | "cooperative"
  | "arrogant"
  | "hard_to_understand"
  | "inconsistent";

export type VerificationRecord = {
  id: string;
  loanApplicationId: string;
  fieldCompletenessOk: boolean | null;
  fieldCompletenessNotes: string | null;
  biIdentityConfirmed: boolean | null;
  biPurposeConfirmed: boolean | null;
  biDetailsConfirmed: boolean | null;
  biNotes: string | null;
  picAllotmentAwareness: string | null;
  picPaymentReliability: string | null;
  picInterviewNotes: string | null;
  cmDepartureDate: string | null;
  cmSalary: number | null;
  cmPosition: string | null;
  cmContractStatus: string | null;
  cmFitToWork: boolean | null;
  cmNotes: string | null;
  /** The crewing manager as a person — distinct from the cm* fields above,
   * which describe the crew member's own contract terms. */
  cmManagerName: string | null;
  cmManagerPosition: string | null;
  cmManagerContact: string | null;
  cmManningAgencyName: string | null;
  cmJoiningPort: string | null;
  characterReferencesNotes: string | null;
  charRefOtherLenders: boolean | null;
  picVerification: PicVerification | null;
  referenceVerifications: ReferenceVerification[] | null;
  verificationChecklist: VerificationChecklist | null;
  picPaymentPreference: PicPaymentPreference | null;
  picDemeanor: PicDemeanorTag[] | null;
  picRating: number | null;
  picRatingReason: string | null;
  cifVerifiedBy: string | null;
  cifVerifiedDate: string | null;
  /** SME Field Visit (Residence / Business / Recommendation). */
  fieldVisit: FieldVisit | null;
  /** SME re-loan lighter re-verification form. */
  smeReloanVerification: SmeReloanVerification | null;
  finding: "positive" | "negative" | null;
  findingNotes: string | null;
  isComplete: boolean;
  completedAt: string | null;
  forwardedAt: string | null;
};

export type VerificationScope = {
  segment?: "seafarer" | "sme" | null;
  isReloan?: boolean | null;
};

export type VerificationCompleteness = {
  complete: boolean;
  missing: string[];
};

export function mapVerificationRow(row: Record<string, unknown>): VerificationRecord {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    fieldCompletenessOk:
      row.field_completeness_ok != null
        ? Boolean(row.field_completeness_ok)
        : null,
    fieldCompletenessNotes: (row.field_completeness_notes as string) ?? null,
    biIdentityConfirmed:
      row.bi_identity_confirmed != null
        ? Boolean(row.bi_identity_confirmed)
        : null,
    biPurposeConfirmed:
      row.bi_purpose_confirmed != null
        ? Boolean(row.bi_purpose_confirmed)
        : null,
    biDetailsConfirmed:
      row.bi_details_confirmed != null
        ? Boolean(row.bi_details_confirmed)
        : null,
    biNotes: (row.bi_notes as string) ?? null,
    picAllotmentAwareness: (row.pic_allotment_awareness as string) ?? null,
    picPaymentReliability: (row.pic_payment_reliability as string) ?? null,
    picInterviewNotes: (row.pic_interview_notes as string) ?? null,
    cmDepartureDate: (row.cm_departure_date as string) ?? null,
    cmSalary: row.cm_salary != null ? Number(row.cm_salary) : null,
    cmPosition: (row.cm_position as string) ?? null,
    cmContractStatus: (row.cm_contract_status as string) ?? null,
    cmFitToWork:
      row.cm_fit_to_work != null ? Boolean(row.cm_fit_to_work) : null,
    cmNotes: (row.cm_notes as string) ?? null,
    cmManagerName: (row.cm_manager_name as string) ?? null,
    cmManagerPosition: (row.cm_manager_position as string) ?? null,
    cmManagerContact: (row.cm_manager_contact as string) ?? null,
    cmManningAgencyName: (row.cm_manning_agency_name as string) ?? null,
    cmJoiningPort: (row.cm_joining_port as string) ?? null,
    characterReferencesNotes: (row.character_references_notes as string) ?? null,
    charRefOtherLenders:
      row.char_ref_other_lenders != null
        ? Boolean(row.char_ref_other_lenders)
        : null,
    picVerification: (row.pic_verification as PicVerification) ?? null,
    referenceVerifications:
      (row.reference_verifications as ReferenceVerification[]) ?? null,
    verificationChecklist:
      (row.verification_checklist as VerificationChecklist) ?? null,
    picPaymentPreference:
      (row.pic_payment_preference as PicPaymentPreference) ?? null,
    picDemeanor: (row.pic_demeanor as PicDemeanorTag[]) ?? null,
    picRating: row.pic_rating != null ? Number(row.pic_rating) : null,
    picRatingReason: (row.pic_rating_reason as string) ?? null,
    cifVerifiedBy: (row.cif_verified_by as string) ?? null,
    cifVerifiedDate: (row.cif_verified_date as string) ?? null,
    fieldVisit: (row.field_visit as FieldVisit) ?? null,
    smeReloanVerification:
      (row.sme_reloan_verification as SmeReloanVerification) ?? null,
    finding: (row.finding as VerificationRecord["finding"]) ?? null,
    findingNotes: (row.finding_notes as string) ?? null,
    isComplete: Boolean(row.is_complete),
    completedAt: (row.completed_at as string) ?? null,
    forwardedAt: (row.forwarded_at as string) ?? null,
  };
}

export function isFilled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/** S1 — field completeness answered + borrower interview 3× confirmed (Yes or No). */
export function isBorrowerReviewComplete(
  verification: VerificationRecord,
): boolean {
  return (
    verification.fieldCompletenessOk != null &&
    verification.biIdentityConfirmed != null &&
    verification.biPurposeConfirmed != null &&
    verification.biDetailsConfirmed != null
  );
}

/** Required subset for CI & References (unlocks Crewing / Submit gate). */
export function assessCiReferencesRequired(input: {
  pic: PicVerification | null | undefined;
  references: ReferenceVerification[] | null | undefined;
  checklist: VerificationChecklist | null | undefined;
  picRating: number | null | undefined;
}): VerificationCompleteness {
  const missing: string[] = [];
  const pic = input.pic;

  if (!isFilled(pic?.name)) missing.push("PIC name");
  if (!isFilled(pic?.contactNumber)) missing.push("PIC contact number");
  if (!isFilled(pic?.relationToClient)) missing.push("PIC relation to client");

  const refs = input.references ?? [];
  const completeRefCount = refs.filter(
    (ref) =>
      isFilled(ref?.name) &&
      isFilled(ref?.contactNumber) &&
      isFilled(ref?.relationToClient),
  ).length;
  if (completeRefCount < 1) {
    missing.push(
      `At least 1 complete reference (name, contact, relation) — ${completeRefCount} of 1`,
    );
  }

  const checklist = input.checklist;
  if (!checklist?.validateBorrowerInfo) {
    missing.push("Checklist: Validate Borrower's Information");
  }
  if (!checklist?.validatePicInfo) {
    missing.push("Checklist: Validate PIC Information");
  }
  if (!checklist?.presidePicObligationSpill) {
    missing.push("Checklist: Preside PIC Obligation / Spill");
  }
  if (!checklist?.verifiedCharacterReferences) {
    missing.push("Checklist: Verified Character References");
  }

  if (input.picRating == null) {
    missing.push("PIC rating (1–5)");
  }

  return { complete: missing.length === 0, missing };
}

/** S3 — same required subset as Submit (`assessVerificationCompleteness`). */
export function isCiReferencesComplete(
  verification: VerificationRecord,
): boolean {
  return assessCiReferencesRequired({
    pic: verification.picVerification,
    references: verification.referenceVerifications,
    checklist: verification.verificationChecklist,
    picRating: verification.picRating,
  }).complete;
}

/** S4 — crewing manager required fields. */
export function isCrewingManagerComplete(
  verification: VerificationRecord,
): boolean {
  return (
    isFilled(verification.cmPosition) &&
    isFilled(verification.cmContractStatus) &&
    Boolean(verification.cmDepartureDate) &&
    verification.cmFitToWork != null
  );
}

/** S5 — finding recorded. */
export function isFindingRecorded(verification: VerificationRecord): boolean {
  return verification.finding === "positive" || verification.finding === "negative";
}

export async function getCigChecksComplete(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ complete: boolean; missing: string[] }> {
  const { data: app } = await supabase
    .from("loan_applications")
    .select("segment")
    .eq("id", applicationId)
    .maybeSingle();
  const segment = app?.segment === "sme" ? "sme" : "seafarer";

  // Phase 7.1 provisional: CIG mappings are Seafarer-only until client confirms
  // which of nfis/mf/lslg_denied_cancelled apply to SME. SME therefore has an
  // empty CIG check list (complete=true) — not a silent reuse of POEA/Marina.
  const { data: mappings, error: mapError } = await supabase
    .from("stage_check_mapping")
    .select("check_type_id, check_types ( id, slug, name )")
    .eq("stage", "cig")
    .eq("segment", segment);

  if (mapError) {
    throw new Error(mapError.message);
  }

  const { data: recorded, error: recError } = await supabase
    .from("checks_recorded")
    .select("check_type_id, result")
    .eq("loan_application_id", applicationId)
    .eq("stage", "cig");

  if (recError) {
    throw new Error(recError.message);
  }

  const recordedResults = new Map(
    (recorded ?? []).map((row) => [row.check_type_id as string, row.result as string]),
  );

  const missing: string[] = [];
  for (const row of mappings ?? []) {
    const checkType = Array.isArray(row.check_types)
      ? row.check_types[0]
      : row.check_types;
    if (!checkType) continue;
    const result = recordedResults.get(
      (checkType.id ?? row.check_type_id) as string,
    );
    if (result !== "pass" && result !== "fail") {
      missing.push(`${checkType.name as string} check not recorded`);
    }
  }

  return { complete: missing.length === 0, missing };
}

export function assessVerificationCompleteness(
  verification: VerificationRecord | null,
  checksComplete: boolean,
  checksMissing: string[],
  scope: VerificationScope = {},
): VerificationCompleteness {
  const missing: string[] = [...checksMissing];
  const segment = scope.segment === "sme" ? "sme" : "seafarer";
  const isReloan = Boolean(scope.isReloan);

  if (!verification) {
    missing.push("Verification form not started");
    return { complete: false, missing };
  }

  if (verification.fieldCompletenessOk == null) {
    missing.push("Field completeness review required");
  }

  if (verification.biIdentityConfirmed == null) {
    missing.push("Borrower interview: identity confirmation required");
  }
  if (verification.biPurposeConfirmed == null) {
    missing.push("Borrower interview: loan purpose confirmation required");
  }
  if (verification.biDetailsConfirmed == null) {
    missing.push("Borrower interview: application details confirmation required");
  }

  if (segment === "sme") {
    // Phase 6.0.a: Field Visit replaces PIC/CM entirely for SME.
    const smeForm = isReloan
      ? assessSmeReloanRequired(verification.smeReloanVerification)
      : assessFieldVisitRequired(verification.fieldVisit);
    missing.push(...smeForm.missing);
  } else {
    if (!isFilled(verification.cmPosition)) {
      missing.push("Crewing manager position required");
    }
    if (!isFilled(verification.cmContractStatus)) {
      missing.push("Crewing manager contract status required");
    }
    if (!verification.cmDepartureDate) {
      missing.push("Crewing manager departure date required");
    }
    if (verification.cmFitToWork == null) {
      missing.push("Crewing manager fit-to-work status required");
    }

    // CI & References Form (loanstar/docs/cig-references-form-plan.md, Phase 4) —
    // required subset only; the rest of Sheet1's fields are captured but not
    // gating, since a real call can legitimately leave some of them blank
    // (e.g. the PIC has no other financing to declare).
    const pic = verification.picVerification;
    if (!isFilled(pic?.name)) {
      missing.push("PIC name required");
    }
    if (!isFilled(pic?.contactNumber)) {
      missing.push("PIC contact number required");
    }
    if (!isFilled(pic?.relationToClient)) {
      missing.push("PIC relation to client required");
    }

    const refs = verification.referenceVerifications ?? [];
    const completeRefCount = refs.filter(
      (ref) =>
        isFilled(ref?.name) &&
        isFilled(ref?.contactNumber) &&
        isFilled(ref?.relationToClient),
    ).length;
    if (completeRefCount < 1) {
      missing.push(
        `At least 1 complete reference required (name, contact number, relation) — ${completeRefCount} of 1 so far`,
      );
    }

    const checklist = verification.verificationChecklist;
    if (
      !checklist ||
      !checklist.validateBorrowerInfo ||
      !checklist.validatePicInfo ||
      !checklist.presidePicObligationSpill ||
      !checklist.verifiedCharacterReferences
    ) {
      missing.push(
        "CI & References Form verification checklist must be fully checked",
      );
    }
    if (verification.picRating == null) {
      missing.push("PIC rating required");
    }
  }

  if (!verification.finding) {
    missing.push("Finding (positive/negative) required");
  }

  if (!checksComplete) {
    // checksMissing already added
  }

  // `complete` uses the same section predicates as hard sequence (S1–S5 + checks)
  // so Submit readiness cannot drift from getCigSequenceState unlock of forward.
  const smeFormOk =
    segment === "sme" &&
    (isReloan
      ? assessSmeReloanRequired(verification.smeReloanVerification).complete
      : assessFieldVisitRequired(verification.fieldVisit).complete);

  const complete =
    isBorrowerReviewComplete(verification) &&
    checksComplete &&
    (segment === "sme"
      ? smeFormOk
      : isCiReferencesComplete(verification) &&
        isCrewingManagerComplete(verification)) &&
    isFindingRecorded(verification);

  return { complete, missing };
}

export async function getOrCreateVerification(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<VerificationRecord> {
  const { data: existing } = await supabase
    .from("verifications")
    .select("*")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (existing) {
    return mapVerificationRow(existing);
  }

  const { data, error } = await supabase
    .from("verifications")
    .insert({ loan_application_id: applicationId })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create verification: ${error.message}`);
  }

  return mapVerificationRow(data);
}
