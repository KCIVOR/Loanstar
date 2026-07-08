import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";
import { ForbiddenError } from "@/lib/permissions/server";

import { isCsaEditableStatus } from "./status";

export { isCsaEditableStatus, CSA_EDITABLE_STATUSES } from "./status";

export async function getApplicationForStaff(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      status_history,
      blocker,
      is_reloan,
      parent_application_id,
      endorsed_at,
      endorsed_by,
      created_at,
      updated_at,
      borrower_id,
      borrowers (
        id,
        user_id,
        borrower_no,
        email,
        first_name,
        middle_name,
        last_name,
        suffix,
        date_of_birth,
        place_of_birth,
        citizenship,
        civil_status,
        gender,
        mobile_phone,
        landline,
        present_address,
        permanent_address,
        manning_agency,
        financial,
        allottee,
        pic_work,
        dependents,
        references_data,
        profile_data
      )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  return data;
}

export async function assertCsaCanEdit(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const application = await getApplicationForStaff(supabase, applicationId);
  if (!isCsaEditableStatus(application.status)) {
    throw new ForbiddenError(
      "Application is no longer editable after endorsement",
    );
  }
  return application;
}

export type EndorseReadiness = {
  ready: boolean;
  checklistComplete: boolean;
  nclRecorded: boolean;
  signedComputation: boolean;
  missing: string[];
};

export async function getEndorseReadiness(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<EndorseReadiness> {
  const checklist = await getStageChecklist(supabase, "intake", applicationId);
  const summary = getCompletionSummary(checklist);
  const checklistComplete =
    summary.required > 0 && summary.complete === summary.required;

  const { data: nclType } = await supabase
    .from("check_types")
    .select("id")
    .eq("slug", "ncl")
    .single();

  let nclRecorded = false;
  if (nclType?.id) {
    const { data: nclCheck } = await supabase
      .from("checks_recorded")
      .select("result")
      .eq("loan_application_id", applicationId)
      .eq("check_type_id", nclType.id)
      .maybeSingle();
    nclRecorded =
      nclCheck?.result === "pass" || nclCheck?.result === "fail";
  }

  const { data: signedComputation } = await supabase
    .from("computations")
    .select("id")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .not("signed_at", "is", null)
    .maybeSingle();

  const signedComputationPresent = Boolean(signedComputation);

  const missing: string[] = [];
  if (!checklistComplete) {
    missing.push("Intake checklist incomplete");
  }
  if (!nclRecorded) {
    missing.push("NCL check not recorded");
  }
  if (!signedComputationPresent) {
    missing.push("Signed computation required");
  }

  return {
    ready: checklistComplete && nclRecorded && signedComputationPresent,
    checklistComplete,
    nclRecorded,
    signedComputation: signedComputationPresent,
    missing,
  };
}
