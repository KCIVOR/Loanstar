import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatStatusLabel,
  type StatusHistoryEntry,
} from "@/lib/applications/status";
import {
  mapBorrowerRow,
  type BorrowerProfile,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { COLLECTOR_QUEUE_ACCOUNT_STATUS } from "@/lib/collector/queue";
import { csaScreeningCheckSlug } from "@/lib/csa/sme-duplication";
import {
  getCompletionSummary,
  getStageChecklist,
  loadChecklistScope,
} from "@/lib/documents/checklist";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/server";

/**
 * Read-only origination evidence for Collector / Remedial desks.
 *
 * Collection and Remedial roles have no RLS grant on `documents` or
 * `verifications`, so every loader here is service-role and must only run
 * *after* one of the assignment asserts below has proved the caller owns the
 * account. The packet mirrors Committee's evidence slices (attachments, CSA
 * intake summary, CIG report) and deliberately carries no votes, tally,
 * assessment, or negotiation data.
 */

/** Verification columns Committee selects for the CI report (evidence only). */
const VERIFICATION_SELECT = `
  finding, finding_notes, forwarded_at, completed_at,
  field_completeness_ok, field_completeness_notes,
  bi_identity_confirmed, bi_purpose_confirmed, bi_details_confirmed, bi_notes,
  cm_departure_date, cm_salary, cm_position, cm_contract_status, cm_fit_to_work, cm_notes,
  cm_manager_name, cm_manager_position, cm_manager_contact, cm_manning_agency_name, cm_joining_port,
  pic_verification, reference_verifications, verification_checklist,
  pic_payment_preference, pic_demeanor, pic_rating, pic_rating_reason,
  cif_verified_by, cif_verified_date,
  field_visit, sme_reloan_verification
`;

const BORROWER_PROFILE_SELECT = `
  id, user_id, borrower_no, email,
  first_name, middle_name, last_name, suffix,
  date_of_birth, place_of_birth, citizenship, civil_status, gender,
  mobile_phone, landline,
  present_address, permanent_address, manning_agency, financial, allottee,
  pic_work, business_info, dependents, references_data, profile_data,
  created_at, updated_at
`;

export type PacketVerificationRow = {
  finding: string | null;
  finding_notes: string | null;
  forwarded_at: string | null;
  completed_at: string | null;
  field_completeness_ok: boolean | null;
  field_completeness_notes: string | null;
  bi_identity_confirmed: boolean | null;
  bi_purpose_confirmed: boolean | null;
  bi_details_confirmed: boolean | null;
  bi_notes: string | null;
  cm_departure_date: string | null;
  cm_salary: number | null;
  cm_position: string | null;
  cm_contract_status: string | null;
  cm_fit_to_work: boolean | null;
  cm_notes: string | null;
  cm_manager_name: string | null;
  cm_manager_position: string | null;
  cm_manager_contact: string | null;
  cm_manning_agency_name: string | null;
  cm_joining_port: string | null;
  pic_verification: unknown;
  reference_verifications: unknown;
  verification_checklist: unknown;
  pic_payment_preference: unknown;
  pic_demeanor: unknown;
  pic_rating: number | null;
  pic_rating_reason: string | null;
  cif_verified_by: string | null;
  cif_verified_date: string | null;
  field_visit: unknown;
  sme_reloan_verification: unknown;
};

export type PacketVerification = {
  finding: string | null;
  findingNotes: string | null;
  forwardedAt: string | null;
  completedAt: string | null;
  fieldCompletenessOk: boolean | null;
  fieldCompletenessNotes: string | null;
  biIdentityConfirmed: boolean | null;
  biPurposeConfirmed: boolean | null;
  biDetailsConfirmed: boolean | null;
  biNotes: string | null;
  cmDepartureDate: string | null;
  cmSalary: number | null;
  cmPosition: string | null;
  cmContractStatus: string | null;
  cmFitToWork: boolean | null;
  cmNotes: string | null;
  cmManagerName: string | null;
  cmManagerPosition: string | null;
  cmManagerContact: string | null;
  cmManningAgencyName: string | null;
  cmJoiningPort: string | null;
  picVerification: unknown;
  referenceVerifications: unknown;
  verificationChecklist: unknown;
  picPaymentPreference: unknown;
  picDemeanor: unknown;
  picRating: number | null;
  picRatingReason: string | null;
  cifVerifiedBy: string | null;
  cifVerifiedDate: string | null;
  fieldVisit: unknown;
  smeReloanVerification: unknown;
};

/**
 * Packet-scoped mapper. Distinct from `mapVerificationRow` in
 * `@/lib/cig/verification`, which returns the CIG working record (`id`,
 * `isComplete`, interview scratch fields). This one returns exactly the
 * evidence projection Committee's application GET exposes.
 */
export function mapPacketVerificationRow(
  row: PacketVerificationRow | null,
): PacketVerification | null {
  if (!row) return null;
  return {
    finding: row.finding,
    findingNotes: row.finding_notes,
    forwardedAt: row.forwarded_at,
    completedAt: row.completed_at,
    fieldCompletenessOk: row.field_completeness_ok,
    fieldCompletenessNotes: row.field_completeness_notes,
    biIdentityConfirmed: row.bi_identity_confirmed,
    biPurposeConfirmed: row.bi_purpose_confirmed,
    biDetailsConfirmed: row.bi_details_confirmed,
    biNotes: row.bi_notes,
    cmDepartureDate: row.cm_departure_date,
    cmSalary: row.cm_salary,
    cmPosition: row.cm_position,
    cmContractStatus: row.cm_contract_status,
    cmFitToWork: row.cm_fit_to_work,
    cmNotes: row.cm_notes,
    cmManagerName: row.cm_manager_name,
    cmManagerPosition: row.cm_manager_position,
    cmManagerContact: row.cm_manager_contact,
    cmManningAgencyName: row.cm_manning_agency_name,
    cmJoiningPort: row.cm_joining_port,
    picVerification: row.pic_verification,
    referenceVerifications: row.reference_verifications,
    verificationChecklist: row.verification_checklist,
    picPaymentPreference: row.pic_payment_preference,
    picDemeanor: row.pic_demeanor,
    picRating: row.pic_rating,
    picRatingReason: row.pic_rating_reason,
    cifVerifiedBy: row.cif_verified_by,
    cifVerifiedDate: row.cif_verified_date,
    fieldVisit: row.field_visit,
    smeReloanVerification: row.sme_reloan_verification,
  };
}

export function documentBelongsToApplication(
  document: { loan_application_id: string | null },
  loanApplicationId: string,
): boolean {
  return (
    Boolean(document.loan_application_id) &&
    document.loan_application_id === loanApplicationId
  );
}

export type MasterlistCaseContext = {
  masterlistId: string;
  loanApplicationId: string;
  borrowerId: string | null;
  borrowerName: string | null;
  segment: "seafarer" | "sme";
};

type MasterlistCaseRow = {
  id: string;
  loan_application_id: string | null;
  borrower_id: string | null;
  borrower_name: string | null;
  segment: string | null;
};

function toCaseContext(row: MasterlistCaseRow): MasterlistCaseContext {
  return {
    masterlistId: row.id,
    loanApplicationId: row.loan_application_id as string,
    borrowerId: row.borrower_id ?? null,
    borrowerName: row.borrower_name ?? null,
    segment: row.segment === "sme" ? "sme" : "seafarer",
  };
}

/**
 * Fail closed unless the caller is the assigned collector *and* the account
 * is still on the collector desk (active, not remitted). Matches
 * GET /api/collector/accounts: collector_user_id, remedial_user_id IS NULL,
 * remedial_flag=false, account_status=COLLECTOR_QUEUE_ACCOUNT_STATUS.
 */
export async function assertCollectorAssignment(
  supabase: SupabaseClient,
  userId: string,
  masterlistId: string,
): Promise<MasterlistCaseContext> {
  const { data, error } = await supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_application_id,
      borrower_id,
      borrower_name,
      segment,
      assignments!inner ( collector_user_id, remedial_user_id )
    `,
    )
    .eq("id", masterlistId)
    .eq("assignments.collector_user_id", userId)
    .is("assignments.remedial_user_id", null)
    .eq("remedial_flag", false)
    .eq("account_status", COLLECTOR_QUEUE_ACCOUNT_STATUS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new ForbiddenError("Account not found");
  }
  if (!data.loan_application_id) {
    throw new NotFoundError("Origination packet unavailable for this account.");
  }

  return toCaseContext(data as MasterlistCaseRow);
}

/** Fail closed unless the caller is the remedial assignee and the account is flagged. */
export async function assertRemedialAssignment(
  supabase: SupabaseClient,
  userId: string,
  masterlistId: string,
): Promise<MasterlistCaseContext> {
  const { data, error } = await supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_application_id,
      borrower_id,
      borrower_name,
      segment,
      remedial_flag,
      assignments!inner ( remedial_user_id )
    `,
    )
    .eq("id", masterlistId)
    .eq("remedial_flag", true)
    .eq("assignments.remedial_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new ForbiddenError("Account not found");
  }
  if (!data.loan_application_id) {
    throw new NotFoundError("Origination packet unavailable for this account.");
  }

  return toCaseContext(data as MasterlistCaseRow);
}

export type OriginationPacket = {
  masterlistId: string;
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    segment: "seafarer" | "sme";
    entityType: "individual" | "corporate" | null;
    isReloan: boolean;
    blocker: string | null;
  };
  borrower: {
    id: string | null;
    name: string | null;
    profile: BorrowerProfile | null;
  };
  csaSummary: {
    blocker: string | null;
    endorsedAt: string | null;
    endorsedByName: string | null;
    privacyOrientationAt: string | null;
    privacyOrientationByName: string | null;
    initialInterviewAt: string | null;
    initialInterviewNotes: string | null;
    initialInterviewByName: string | null;
    timeline: Array<StatusHistoryEntry & { label: string }>;
  };
  csaScreening: {
    slug: string;
    name: string | null;
    result: string;
    notes: string | null;
    checkedAt: string | null;
  };
  verification: PacketVerification | null;
};

/** Service-role loader — call only after an assignment assert. */
export async function loadOriginationPacket(
  admin: SupabaseClient,
  ctx: MasterlistCaseContext,
): Promise<OriginationPacket> {
  const { data: application, error: appError } = await admin
    .from("loan_applications")
    .select(
      `
      id, application_no, status, segment, blocker,
      entity_type, is_reloan,
      privacy_orientation_at, privacy_orientation_by,
      initial_interview_at, initial_interview_notes, initial_interview_by,
      endorsed_at, endorsed_by, status_history
    `,
    )
    .eq("id", ctx.loanApplicationId)
    .maybeSingle();

  if (appError) throw new Error(appError.message);
  if (!application) throw new NotFoundError("Application not found");

  let borrowerProfile: BorrowerProfile | null = null;
  if (ctx.borrowerId) {
    const { data: borrower, error: borrowerError } = await admin
      .from("borrowers")
      .select(BORROWER_PROFILE_SELECT)
      .eq("id", ctx.borrowerId)
      .maybeSingle();
    if (borrowerError) throw new Error(borrowerError.message);
    borrowerProfile = borrower
      ? mapBorrowerRow(borrower as BorrowerRow)
      : null;
  }

  const { data: verification, error: verificationError } = await admin
    .from("verifications")
    .select(VERIFICATION_SELECT)
    .eq("loan_application_id", ctx.loanApplicationId)
    .maybeSingle();

  if (verificationError) throw new Error(verificationError.message);

  // `profiles` RLS only exposes your own row, so CSA actor names need the
  // service client here the same way Committee's application GET resolves them.
  const actorIds = Array.from(
    new Set(
      [
        application.privacy_orientation_by as string | null,
        application.initial_interview_by as string | null,
        application.endorsed_by as string | null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const profile of profiles ?? []) {
      nameById.set(
        profile.id as string,
        (profile.full_name as string) || (profile.email as string),
      );
    }
  }

  const screeningSlug = csaScreeningCheckSlug(
    application.segment as string | null,
  );
  const { data: screeningType } = await admin
    .from("check_types")
    .select("id, name")
    .eq("slug", screeningSlug)
    .maybeSingle();

  let csaScreening: OriginationPacket["csaScreening"] = {
    slug: screeningSlug,
    name: null,
    result: "pending",
    notes: null,
    checkedAt: null,
  };
  if (screeningType?.id) {
    const { data: screeningCheck } = await admin
      .from("checks_recorded")
      .select("result, notes, checked_at")
      .eq("loan_application_id", ctx.loanApplicationId)
      .eq("check_type_id", screeningType.id)
      .maybeSingle();
    csaScreening = {
      slug: screeningSlug,
      name: (screeningType.name as string | null) ?? null,
      result: (screeningCheck?.result as string | undefined) ?? "pending",
      notes: (screeningCheck?.notes as string | null | undefined) ?? null,
      checkedAt:
        (screeningCheck?.checked_at as string | null | undefined) ?? null,
    };
  }

  const timeline = (
    (application.status_history ?? []) as StatusHistoryEntry[]
  ).map((entry) => ({ ...entry, label: formatStatusLabel(entry.status) }));

  return {
    masterlistId: ctx.masterlistId,
    application: {
      id: application.id as string,
      applicationNo: (application.application_no as string | null) ?? null,
      status: application.status as string,
      statusLabel: formatStatusLabel(String(application.status)),
      segment: application.segment === "sme" ? "sme" : "seafarer",
      entityType:
        application.entity_type === "individual" ||
        application.entity_type === "corporate"
          ? application.entity_type
          : null,
      isReloan: Boolean(application.is_reloan),
      blocker: (application.blocker as string | null) ?? null,
    },
    borrower: {
      id: ctx.borrowerId,
      name: ctx.borrowerName,
      profile: borrowerProfile,
    },
    csaSummary: {
      blocker: (application.blocker as string | null) ?? null,
      endorsedAt: (application.endorsed_at as string | null) ?? null,
      endorsedByName: application.endorsed_by
        ? (nameById.get(application.endorsed_by as string) ?? null)
        : null,
      privacyOrientationAt:
        (application.privacy_orientation_at as string | null) ?? null,
      privacyOrientationByName: application.privacy_orientation_by
        ? (nameById.get(application.privacy_orientation_by as string) ?? null)
        : null,
      initialInterviewAt:
        (application.initial_interview_at as string | null) ?? null,
      initialInterviewNotes:
        (application.initial_interview_notes as string | null) ?? null,
      initialInterviewByName: application.initial_interview_by
        ? (nameById.get(application.initial_interview_by as string) ?? null)
        : null,
      timeline,
    },
    csaScreening,
    verification: mapPacketVerificationRow(
      (verification as PacketVerificationRow | null) ?? null,
    ),
  };
}

/** Service-role intake checklist — call only after an assignment assert. */
export async function loadIntakeChecklistForApplication(
  admin: SupabaseClient,
  loanApplicationId: string,
) {
  const scope = await loadChecklistScope(admin, loanApplicationId);
  const items = await getStageChecklist(
    admin,
    "intake",
    loanApplicationId,
    scope,
  );
  return { stage: "intake" as const, items, summary: getCompletionSummary(items) };
}

export type CaseFileDocumentDownload = {
  documentId: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
};

/**
 * Confirms a document belongs to the assigned account's application before any
 * signed URL is minted. Errors stay generic so a foreign document id cannot be
 * probed for existence.
 */
export async function authorizeCaseFileDocumentDownload(
  admin: SupabaseClient,
  loanApplicationId: string,
  documentId: string,
): Promise<CaseFileDocumentDownload> {
  const { data: document, error } = await admin
    .from("documents")
    .select("id, loan_application_id, storage_path, file_name, mime_type, status")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!document) throw new ForbiddenError("Document not found");

  if (
    !documentBelongsToApplication(
      { loan_application_id: (document.loan_application_id as string | null) ?? null },
      loanApplicationId,
    )
  ) {
    throw new ForbiddenError("Document not found");
  }

  if (!document.storage_path || document.status === "pending") {
    throw new ForbiddenError("Document has not been uploaded yet");
  }

  return {
    documentId: document.id as string,
    storagePath: document.storage_path as string,
    fileName: (document.file_name as string | null) ?? null,
    mimeType: (document.mime_type as string | null) ?? null,
  };
}
