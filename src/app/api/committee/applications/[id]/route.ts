import {
  formatStatusLabel,
  type StatusHistoryEntry,
} from "@/lib/applications/status";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import {
  getLatestCommitteeAction,
  getCommitteeVotes,
} from "@/lib/committee/actions";
import { getCommitteeDecisionEmailStatus } from "@/lib/committee/decision-email-status";
import { getCommitteeSize } from "@/lib/committee/committee-size";
import { computeTatDays, computeVoteTally } from "@/lib/committee/votes";
import { getCommitteeAssessment } from "@/lib/committee/assessment";
import { getCommitteeCompleteness } from "@/lib/committee/completeness";
import { getApplicationForStaff } from "@/lib/csa/application";
import { getActiveComputation } from "@/lib/csa/computation";
import { csaScreeningCheckSlug } from "@/lib/csa/sme-duplication";
import {
  getNegotiation,
  listNegotiationMessages,
  withAuthorNames,
} from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "view");
    const { id } = await params;
    const supabase = await createClient();

    const application = await getApplicationForStaff(supabase, id);
    const committeeSize = await getCommitteeSize(
      application.segment as string | null,
    );
    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

    const { data: verification } = await supabase
      .from("verifications")
      .select(
        `
        finding, finding_notes, forwarded_at, completed_at, is_complete,
        field_completeness_ok, field_completeness_notes,
        bi_identity_confirmed, bi_purpose_confirmed, bi_details_confirmed, bi_notes,
        cm_departure_date, cm_salary, cm_position, cm_contract_status, cm_fit_to_work, cm_notes,
        cm_manager_name, cm_manager_position, cm_manager_contact, cm_manning_agency_name, cm_joining_port,
        pic_verification, reference_verifications, verification_checklist,
        pic_payment_preference, pic_demeanor, pic_rating, pic_rating_reason,
        cif_verified_by, cif_verified_date,
        field_visit, sme_reloan_verification
      `,
      )
      .eq("loan_application_id", id)
      .maybeSingle();

    const completeness = await getCommitteeCompleteness(
      supabase,
      id,
      borrower
        ? {
            firstName: borrower.first_name,
            lastName: borrower.last_name,
            mobilePhone: borrower.mobile_phone,
          }
        : null,
      verification
        ? {
            isComplete: Boolean(verification.is_complete),
            forwardedAt: verification.forwarded_at,
          }
        : null,
    );

    const assessment = await getCommitteeAssessment(supabase, id);

    const votes = await getCommitteeVotes(supabase, id);
    const tally = computeVoteTally(votes, committeeSize);
    const latestAction = await getLatestCommitteeAction(supabase, id);
    const decisionEmail =
      latestAction != null
        ? await getCommitteeDecisionEmailStatus({
            applicationId: id,
            action: latestAction.action,
            borrowerEmail: (borrower?.email as string | null) ?? null,
          })
        : null;
    const computation = await getActiveComputation(supabase, id);
    const negotiation = await getNegotiation(supabase, id);
    const negotiationMessages = await withAuthorNames(
      await listNegotiationMessages(supabase, id),
    );

    const myVote = votes.find((v) => v.voterId === user.id)?.vote ?? null;

    const tatDays = computeTatDays(
      verification?.forwarded_at ?? null,
      latestAction?.actedAt ?? null,
    );

    // Vote/action/CSA-recorded rows only store actor UUIDs — resolve to names
    // for display. `profiles` RLS only allows reading your own row, so Committee
    // can't otherwise see who on CSA recorded these (same gap fixed on CIG's page).
    const actorIds = Array.from(
      new Set(
        [
          ...votes.map((v) => v.voterId),
          latestAction?.actedBy,
          application.privacy_orientation_by as string | null,
          application.initial_interview_by as string | null,
          application.endorsed_by as string | null,
        ].filter((v): v is string => Boolean(v)),
      ),
    );
    const admin = createServiceClient();
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) || (p.email as string));
      }
    }

    // CSA intake summary — everything CSA recorded before endorsing, same
    // read-only summary already surfaced on CIG's page.
    const screeningSlug = csaScreeningCheckSlug(application.segment as string | null);
    const { data: screeningType } = await admin
      .from("check_types")
      .select("id, name")
      .eq("slug", screeningSlug)
      .maybeSingle();
    let csaScreening: {
      slug: string;
      name: string | null;
      result: string;
      notes: string | null;
      checkedAt: string | null;
    } = { slug: screeningSlug, name: null, result: "pending", notes: null, checkedAt: null };
    if (screeningType?.id) {
      const { data: screeningCheck } = await admin
        .from("checks_recorded")
        .select("result, notes, checked_at")
        .eq("loan_application_id", id)
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
    ).map((entry) => ({
      ...entry,
      label: formatStatusLabel(entry.status),
    }));

    const csaSummary = {
      blocker: application.blocker as string | null,
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
    };

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        blocker: application.blocker,
        isReloan: application.is_reloan,
        segment: application.segment === "sme" ? "sme" : "seafarer",
        entityType:
          application.entity_type === "individual" ||
          application.entity_type === "corporate"
            ? application.entity_type
            : null,
        statusHistory: application.status_history,
        canDecide:
          (application.status === "for_approval" ||
            application.status === "committee_hold") &&
          votes.length >= committeeSize,
        votesNeeded: Math.max(0, committeeSize - votes.length),
        committeeSize,
        canOverride: application.status === "negotiating_terms",
        canAdjustPreDecision: application.status === "for_approval",
      },
      borrower: borrower ? mapBorrowerRow(borrower as BorrowerRow) : null,
      verification: verification
        ? {
            finding: verification.finding,
            findingNotes: verification.finding_notes,
            forwardedAt: verification.forwarded_at,
            completedAt: verification.completed_at,
            fieldCompletenessOk: verification.field_completeness_ok,
            fieldCompletenessNotes: verification.field_completeness_notes,
            biIdentityConfirmed: verification.bi_identity_confirmed,
            biPurposeConfirmed: verification.bi_purpose_confirmed,
            biDetailsConfirmed: verification.bi_details_confirmed,
            biNotes: verification.bi_notes,
            cmDepartureDate: verification.cm_departure_date,
            cmSalary: verification.cm_salary,
            cmPosition: verification.cm_position,
            cmContractStatus: verification.cm_contract_status,
            cmFitToWork: verification.cm_fit_to_work,
            cmNotes: verification.cm_notes,
            cmManagerName: verification.cm_manager_name,
            cmManagerPosition: verification.cm_manager_position,
            cmManagerContact: verification.cm_manager_contact,
            cmManningAgencyName: verification.cm_manning_agency_name,
            cmJoiningPort: verification.cm_joining_port,
            picVerification: verification.pic_verification,
            referenceVerifications: verification.reference_verifications,
            verificationChecklist: verification.verification_checklist,
            picPaymentPreference: verification.pic_payment_preference,
            picDemeanor: verification.pic_demeanor,
            picRating: verification.pic_rating,
            picRatingReason: verification.pic_rating_reason,
            cifVerifiedBy: verification.cif_verified_by,
            cifVerifiedDate: verification.cif_verified_date,
            fieldVisit: verification.field_visit,
            smeReloanVerification: verification.sme_reloan_verification,
          }
        : null,
      completeness,
      assessment,
      computation: computation
        ? {
            id: computation.id,
            inputMode: computation.inputMode,
            inputAmount: computation.inputAmount,
            principal: computation.principal,
            netReleased: computation.netReleased,
            totalLoan: computation.totalLoan,
            monthlyAmortization: computation.monthlyAmortization,
            lineItems: computation.lineItems,
            signedAt: computation.signedAt,
            loanTypeName: computation.loanTypeName,
            terms: computation.terms,
            addonMonths: computation.addonMonths,
            coverageRatio: computation.coverageRatio,
            coverageWarning: computation.coverageWarning,
          }
        : null,
      votes: votes.map((v) => ({ ...v, voterName: nameById.get(v.voterId) ?? null })),
      tally,
      myVote,
      latestAction: latestAction
        ? {
            ...latestAction,
            actedByName: nameById.get(latestAction.actedBy) ?? null,
          }
        : null,
      decisionEmail,
      negotiation,
      negotiationMessages,
      csaSummary,
      csaScreening,
      tatDays,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
