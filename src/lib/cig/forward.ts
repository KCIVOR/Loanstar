import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";

import {
  assessVerificationCompleteness,
  getCigChecksComplete,
  getOrCreateVerification,
  mapVerificationRow,
  type VerificationRecord,
} from "./verification";

export async function tryAutoForwardToCommittee(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
): Promise<{ forwarded: boolean; missing: string[] }> {
  const verification = await getOrCreateVerification(supabase, applicationId);

  if (verification.forwardedAt) {
    return { forwarded: false, missing: [] };
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

  await appendStatusHistory(supabase, applicationId, "for_approval", {
    actorId,
    note: "CIG verification complete — auto-forwarded to Committee",
  });

  const { error: appError } = await supabase
    .from("loan_applications")
    .update({ blocker: null })
    .eq("id", applicationId);

  if (appError) {
    throw new Error(appError.message);
  }

  const { error: verError } = await supabase
    .from("verifications")
    .update({
      is_complete: true,
      completed_at: now,
      completed_by: actorId,
      forwarded_at: now,
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  if (verError) {
    throw new Error(verError.message);
  }

  return { forwarded: true, missing: [] };
}

export type VerificationPatch = Partial<{
  fieldCompletenessOk: boolean;
  fieldCompletenessNotes: string | null;
  picAllotmentAwareness: string;
  picPaymentReliability: string;
  picInterviewNotes: string | null;
  cmDepartureDate: string;
  cmSalary: number | null;
  cmPosition: string;
  cmContractStatus: string;
  cmNotes: string | null;
  characterReferencesNotes: string;
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
  if (patch.cmNotes !== undefined) {
    row.cm_notes = patch.cmNotes;
  }
  if (patch.characterReferencesNotes !== undefined) {
    row.character_references_notes = patch.characterReferencesNotes;
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
