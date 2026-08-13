import { formatStatusLabel } from "@/lib/applications/status";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { parseBusinessInfo } from "@/lib/borrowers/business-info";
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
import { getNegotiation } from "@/lib/negotiation/service";
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

    const myVote = votes.find((v) => v.voterId === user.id)?.vote ?? null;

    const tatDays = computeTatDays(
      verification?.forwarded_at ?? null,
      latestAction?.actedAt ?? null,
    );

    // Vote/action rows only store actor UUIDs — resolve to names for display.
    const actorIds = Array.from(
      new Set(
        [...votes.map((v) => v.voterId), latestAction?.actedBy].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string) || (p.email as string));
      }
    }

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
      borrower: borrower
        ? {
            id: borrower.id,
            borrowerNo: borrower.borrower_no,
            firstName: borrower.first_name,
            lastName: borrower.last_name,
            email: borrower.email,
            businessInfo: borrower.business_info
              ? parseBusinessInfo(borrower.business_info)
              : null,
          }
        : null,
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
      tatDays,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
