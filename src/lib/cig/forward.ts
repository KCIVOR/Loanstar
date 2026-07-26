import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { notifyBorrowerForApplication } from "@/lib/notifications/write";

import {
  assessVerificationCompleteness,
  getCigChecksComplete,
  getOrCreateVerification,
  mapVerificationRow,
  type PicDemeanorTag,
  type PicPaymentPreference,
  type PicVerification,
  type ReferenceVerification,
  type VerificationChecklist,
  type VerificationRecord,
} from "./verification";

/**
 * Explicit "Submit CI report" trigger — replaces the old silent auto-forward.
 * Validates completeness (checks + form + finding) and returns the missing
 * list instead of forwarding when the report is not ready.
 *
 * Write order matters: verifications and blocker are updated while status is
 * still for_verification (their RLS write policies require it), and the
 * status transition to for_approval happens last.
 */
export async function forwardToCommittee(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
): Promise<{ forwarded: boolean; missing: string[] }> {
  const verification = await getOrCreateVerification(supabase, applicationId);

  if (verification.forwardedAt) {
    return { forwarded: false, missing: ["CI report already submitted"] };
  }

  const checks = await getCigChecksComplete(supabase, applicationId);
  const completeness = assessVerificationCompleteness(
    verification,
    checks.complete,
    checks.missing,
  );

  if (!completeness.complete) {
    return { forwarded: false, missing: completeness.missing };
  }

  const now = new Date().toISOString();

  const { data: verRows, error: verError } = await supabase
    .from("verifications")
    .update({
      is_complete: true,
      completed_at: now,
      completed_by: actorId,
      forwarded_at: now,
      updated_at: now,
    })
    .eq("loan_application_id", applicationId)
    .select("id");

  if (verError) {
    throw new Error(verError.message);
  }
  if (!verRows?.length) {
    throw new Error("Failed to mark verification complete (no row updated)");
  }

  const { error: appError } = await supabase
    .from("loan_applications")
    .update({ blocker: null })
    .eq("id", applicationId);

  if (appError) {
    throw new Error(appError.message);
  }

  await appendStatusHistory(supabase, applicationId, "for_approval", {
    actorId,
    note: "CI report submitted — forwarded to Committee",
  });

  void notifyBorrowerForApplication(applicationId, {
    title: "Application under committee review",
    body: "Verification is complete. Your file is now with the Approving Committee.",
    link: "/borrower",
    kind: "application_for_approval",
    entityType: "loan_application",
    entityId: applicationId,
  });

  return { forwarded: true, missing: [] };
}

export type VerificationPatch = Partial<{
  fieldCompletenessOk: boolean;
  fieldCompletenessNotes: string | null;
  biIdentityConfirmed: boolean;
  biPurposeConfirmed: boolean;
  biDetailsConfirmed: boolean;
  biNotes: string | null;
  picAllotmentAwareness: string;
  picPaymentReliability: string;
  picInterviewNotes: string | null;
  cmDepartureDate: string;
  cmSalary: number | null;
  cmPosition: string;
  cmContractStatus: string;
  cmFitToWork: boolean;
  cmNotes: string | null;
  characterReferencesNotes: string;
  charRefOtherLenders: boolean;
  picVerification: PicVerification;
  referenceVerifications: ReferenceVerification[];
  verificationChecklist: VerificationChecklist;
  picPaymentPreference: PicPaymentPreference;
  picDemeanor: PicDemeanorTag[];
  picRating: number | null;
  picRatingReason: string | null;
  cifVerifiedBy: string | null;
  cifVerifiedDate: string | null;
  finding: "positive" | "negative";
  findingNotes: string | null;
}>;

export function patchToRow(patch: VerificationPatch): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.fieldCompletenessOk !== undefined) {
    row.field_completeness_ok = patch.fieldCompletenessOk;
  }
  if (patch.fieldCompletenessNotes !== undefined) {
    row.field_completeness_notes = patch.fieldCompletenessNotes;
  }
  if (patch.biIdentityConfirmed !== undefined) {
    row.bi_identity_confirmed = patch.biIdentityConfirmed;
  }
  if (patch.biPurposeConfirmed !== undefined) {
    row.bi_purpose_confirmed = patch.biPurposeConfirmed;
  }
  if (patch.biDetailsConfirmed !== undefined) {
    row.bi_details_confirmed = patch.biDetailsConfirmed;
  }
  if (patch.biNotes !== undefined) {
    row.bi_notes = patch.biNotes;
  }
  if (patch.picAllotmentAwareness !== undefined) {
    row.pic_allotment_awareness = patch.picAllotmentAwareness;
  }
  if (patch.picPaymentReliability !== undefined) {
    row.pic_payment_reliability = patch.picPaymentReliability;
  }
  if (patch.picInterviewNotes !== undefined) {
    row.pic_interview_notes = patch.picInterviewNotes;
  }
  if (patch.cmDepartureDate !== undefined) {
    row.cm_departure_date = patch.cmDepartureDate;
  }
  if (patch.cmSalary !== undefined) {
    row.cm_salary = patch.cmSalary;
  }
  if (patch.cmPosition !== undefined) {
    row.cm_position = patch.cmPosition;
  }
  if (patch.cmContractStatus !== undefined) {
    row.cm_contract_status = patch.cmContractStatus;
  }
  if (patch.cmFitToWork !== undefined) {
    row.cm_fit_to_work = patch.cmFitToWork;
  }
  if (patch.cmNotes !== undefined) {
    row.cm_notes = patch.cmNotes;
  }
  if (patch.characterReferencesNotes !== undefined) {
    row.character_references_notes = patch.characterReferencesNotes;
  }
  if (patch.charRefOtherLenders !== undefined) {
    row.char_ref_other_lenders = patch.charRefOtherLenders;
  }
  if (patch.picVerification !== undefined) {
    row.pic_verification = patch.picVerification;
  }
  if (patch.referenceVerifications !== undefined) {
    row.reference_verifications = patch.referenceVerifications;
  }
  if (patch.verificationChecklist !== undefined) {
    row.verification_checklist = patch.verificationChecklist;
  }
  if (patch.picPaymentPreference !== undefined) {
    row.pic_payment_preference = patch.picPaymentPreference;
  }
  if (patch.picDemeanor !== undefined) {
    row.pic_demeanor = patch.picDemeanor;
  }
  if (patch.picRating !== undefined) {
    row.pic_rating = patch.picRating;
  }
  if (patch.picRatingReason !== undefined) {
    row.pic_rating_reason = patch.picRatingReason;
  }
  if (patch.cifVerifiedBy !== undefined) {
    row.cif_verified_by = patch.cifVerifiedBy;
  }
  if (patch.cifVerifiedDate !== undefined) {
    row.cif_verified_date = patch.cifVerifiedDate;
  }
  if (patch.finding !== undefined) {
    row.finding = patch.finding;
  }
  if (patch.findingNotes !== undefined) {
    row.finding_notes = patch.findingNotes;
  }
  return row;
}

export async function saveVerificationPatch(
  supabase: SupabaseClient,
  applicationId: string,
  patch: VerificationPatch,
): Promise<VerificationRecord> {
  await getOrCreateVerification(supabase, applicationId);

  const { data, error } = await supabase
    .from("verifications")
    .update(patchToRow(patch))
    .eq("loan_application_id", applicationId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save verification: ${error.message}`);
  }

  return mapVerificationRow(data);
}
