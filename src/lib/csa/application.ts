import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateCoverageForEndorse,
  getCoverageThreshold,
} from "@/lib/computation/coverage";
import {
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";
import {
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { ForbiddenError } from "@/lib/permissions/server";

import { assessApplicationFormCompleteness } from "./application-form-completeness";
import { getActiveComputation } from "./computation";
import { assessInitialInterview } from "./initial-interview";
import { assessPrivacyOrientation } from "./privacy-orientation";
import { isCsaEditableStatus } from "./status";

export { isCsaEditableStatus, CSA_EDITABLE_STATUSES } from "./status";
export {
  assessApplicationFormCompleteness,
  type ApplicationFormCompleteness,
} from "./application-form-completeness";
export {
  assessPrivacyOrientation,
  recordPrivacyOrientation,
  PRIVACY_ORIENTATION_MISSING,
} from "./privacy-orientation";
export {
  assessInitialInterview,
  recordInitialInterview,
  assertInterviewRecordedForComputation,
  INITIAL_INTERVIEW_MISSING,
  INITIAL_INTERVIEW_COMPUTATION_ERROR,
} from "./initial-interview";

export const ON_HOLD_ENDORSE_MISSING =
  "Application is on hold — clear hold before endorsing";

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
      privacy_orientation_at,
      privacy_orientation_by,
      initial_interview_at,
      initial_interview_by,
      initial_interview_notes,
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
  coverageOk: boolean;
  coverageThreshold: number;
  missing: string[];
  warnings: string[];
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

  const activeComputation = await getActiveComputation(supabase, applicationId);

  const signedComputationPresent = Boolean(activeComputation?.signedAt);
  const coverageRatio =
    activeComputation?.coverageRatio != null
      ? Number(activeComputation.coverageRatio)
      : null;

  const coverageThreshold = await getCoverageThreshold(supabase);
  const coverageEval = evaluateCoverageForEndorse(
    coverageRatio,
    coverageThreshold,
  );

  const application = await getApplicationForStaff(supabase, applicationId);
  const borrowerRaw = application.borrowers;
  const borrowerRow = (
    Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
  ) as BorrowerRow | null;
  const formCompleteness = assessApplicationFormCompleteness(
    borrowerRow ? mapBorrowerRow(borrowerRow) : null,
  );
  const orientation = assessPrivacyOrientation(
    application.privacy_orientation_at as string | null | undefined,
  );
  const interview = assessInitialInterview({
    at: application.initial_interview_at as string | null | undefined,
    notes: application.initial_interview_notes as string | null | undefined,
  });

  const missing: string[] = [];
  const onHold = application.status === "on_hold";
  if (onHold) {
    missing.push(ON_HOLD_ENDORSE_MISSING);
  }
  if (!checklistComplete) {
    missing.push("Intake checklist incomplete");
  }
  if (!nclRecorded) {
    missing.push("NCL check not recorded");
  }
  if (!signedComputationPresent) {
    missing.push("Signed computation required");
  }
  if (coverageEval.blocker) {
    missing.push(coverageEval.blocker);
  }
  missing.push(...formCompleteness.missing);
  missing.push(...orientation.missing);
  missing.push(...interview.missing);

  return {
    ready:
      !onHold &&
      checklistComplete &&
      nclRecorded &&
      signedComputationPresent &&
      coverageEval.coverageOk &&
      formCompleteness.complete &&
      orientation.complete &&
      interview.complete,
    checklistComplete,
    nclRecorded,
    signedComputation: signedComputationPresent,
    coverageOk: coverageEval.coverageOk,
    coverageThreshold,
    missing,
    warnings: coverageEval.warnings,
  };
}
