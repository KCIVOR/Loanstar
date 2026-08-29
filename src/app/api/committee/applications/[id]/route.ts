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
import {
  mapCommitteeCollateralInspections,
  resolveCommitteeCollateralType,
} from "@/lib/committee/ci-report";
import { getApplicationForStaff } from "@/lib/csa/application";
import { getActiveComputation, getSmeRateHistory } from "@/lib/csa/computation";
import { csaScreeningCheckSlug } from "@/lib/csa/sme-duplication";
import {
  getNegotiation,
  listNegotiationMessages,
  withAuthorNames,
} from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatDateLocal } from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";

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
        cm_departure_date, cm_salary, cm_basic_salary, cm_position, cm_contract_status, cm_fit_to_work, cm_notes,
        cm_manager_name, cm_manager_position, cm_manager_contact, cm_manning_agency_name, cm_joining_port,
        pic_verification, reference_verifications, verification_checklist,
        pic_payment_preference, pic_demeanor, pic_rating, pic_rating_reason,
        cif_verified_by, cif_verified_date,
        field_visit, sme_reloan_verification,
        cm_inspection, rem_inspection
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
    const rateHistory = await getSmeRateHistory(supabase, id);
    const admin = createServiceClient();

    // masterlist RLS only grants SELECT to super_admin, accounting_ar, the
    // borrower, or the assigned collector — Committee has none of those, so
    // this must read via service role or it silently sees zero rows (same
    // gap already fixed for CSA's computation route).
    let activeLoans: Array<{
      loanApplicationId: string;
      loanAccountNo: string;
      outstandingBalance: number;
      monthlyAmortization: number;
      accountStatus: string;
      remainingInstallments: number;
      /** Not-yet-due installments only — feeds the Offset early-settlement
       * discount picker; see docs/revision-plans/feature-early-settlement-discount.md.
       * Mirrors the identical enrichment in the CSA computation route's GET
       * handler — this route fetches activeLoans independently, so both must
       * carry it for the shared ComputationPanel modal to work under Committee too. */
      futureInstallments: Array<{
        installmentNo: number;
        dueDate: string;
        interestPortion: number;
      }>;
    }> = [];
    if (borrower?.id) {
      const { data: masterlistRows } = await admin
        .from("masterlist")
        .select(
          "id, loan_application_id, loan_account_no, outstanding_balance, monthly_amortization, account_status, computation_id",
        )
        .eq("borrower_id", borrower.id)
        .eq("account_status", "active");

      // One batched query for every active account's open-installment count
      // (not N+1) — the same set AR actually allocates against when an
      // Offset transfer posts, so "N months" in the offset picker matches
      // reality instead of an outstanding_balance ÷ monthly approximation.
      // Also the source for futureInstallments below — one fetch serves both.
      const masterlistIds = (masterlistRows ?? []).map((row) => row.id as string);
      const remainingByMasterlistId = new Map<string, number>();
      const futureRowsByMasterlistId = new Map<
        string,
        Array<{ installmentNo: number; dueDate: string }>
      >();
      const today = formatDateLocal(new Date());
      if (masterlistIds.length > 0) {
        const { data: scheduleRows } = await admin
          .from("amortization_schedules")
          .select("masterlist_id, installment_no, due_date, status")
          .in("masterlist_id", masterlistIds)
          .in("status", ["pending", "partial", "overdue"]);
        for (const row of scheduleRows ?? []) {
          const mid = row.masterlist_id as string;
          remainingByMasterlistId.set(mid, (remainingByMasterlistId.get(mid) ?? 0) + 1);
          const dueDate = row.due_date as string;
          if (dueDate > today) {
            const list = futureRowsByMasterlistId.get(mid) ?? [];
            list.push({ installmentNo: row.installment_no as number, dueDate });
            futureRowsByMasterlistId.set(mid, list);
          }
        }
      }

      const computationIds = Array.from(
        new Set(
          (masterlistRows ?? [])
            .map((row) => row.computation_id as string | null)
            .filter((cid): cid is string => Boolean(cid)),
        ),
      );
      const interestPerRowByComputationId = new Map<string, number>();
      if (computationIds.length > 0) {
        const { data: computationRows } = await admin
          .from("computations")
          .select("id, total_interest, terms, payment_frequency")
          .in("id", computationIds);
        for (const row of computationRows ?? []) {
          const terms = Number(row.terms) || 1;
          const interestPerMonth = halfUp(Number(row.total_interest) / terms);
          const isSemiMonthly = row.payment_frequency === "semi_monthly";
          interestPerRowByComputationId.set(
            row.id as string,
            isSemiMonthly ? halfUp(interestPerMonth / 2) : interestPerMonth,
          );
        }
      }

      activeLoans = (masterlistRows ?? []).map((row) => {
        const mid = row.id as string;
        const interestPortion =
          interestPerRowByComputationId.get(row.computation_id as string) ?? 0;
        return {
          loanApplicationId: (row.loan_application_id as string | null) ?? "",
          loanAccountNo: (row.loan_account_no as string | null) ?? "Active Account",
          outstandingBalance: Number(row.outstanding_balance ?? 0),
          monthlyAmortization: Number(row.monthly_amortization ?? 0),
          accountStatus: (row.account_status as string | null) ?? "active",
          remainingInstallments: remainingByMasterlistId.get(mid) ?? 0,
          futureInstallments: (futureRowsByMasterlistId.get(mid) ?? [])
            .sort((a, b) => a.installmentNo - b.installmentNo)
            .map((inst) => ({ ...inst, interestPortion })),
        };
      });
    }

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
        segment:
          application.segment === "sme" || application.segment === "individual"
            ? application.segment
            : "seafarer",
        entityType:
          application.entity_type === "individual" ||
          application.entity_type === "corporate"
            ? application.entity_type
            : null,
        collateralType: resolveCommitteeCollateralType(
          application.collateral_type as string | null,
        ),
        paymentSchedule:
          application.payment_schedule === "mpl" ||
          application.payment_schedule === "salary" ||
          application.payment_schedule === "weekly" ||
          application.payment_schedule === "bi_monthly" ||
          application.payment_schedule === "quarterly" ||
          application.payment_schedule === "two_monthly" ||
          application.payment_schedule === "daily"
            ? application.payment_schedule
            : "monthly",
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
            cmBasicSalary: verification.cm_basic_salary,
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
            ...mapCommitteeCollateralInspections(verification),
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
            releaseDate: computation.releaseDate ?? null,
            firstPaymentDate: computation.firstPaymentDate,
            dueDay: computation.dueDay ?? null,
            lineItems: computation.lineItems,
            signedAt: computation.signedAt,
            witnessedBy: computation.witnessedBy,
            loanTypeId: computation.loanTypeId ?? null,
            loanTypeName: computation.loanTypeName,
            terms: computation.terms,
            addonMonths: computation.addonMonths,
            pfRate: computation.pfRate,
            interestRate: computation.interestRate,
            securityFeeRate: computation.securityFeeRate,
            processingFee: computation.processingFee,
            adminCost: computation.adminCost,
            docStamp: computation.docStamp,
            notaryFee: computation.notaryFee,
            securityFee: computation.securityFee,
            totalDeductions: computation.totalDeductions,
            totalInterest: computation.totalInterest,
            coverageRatio: computation.coverageRatio,
            coverageWarning: computation.coverageWarning,
            adminRate: computation.adminRate,
            chattelRate: computation.chattelRate,
            chattelFee: computation.chattelFee,
            originationDiscounts: computation.originationDiscounts ?? null,
            otherDeductions: computation.otherDeductions ?? null,
            otherDeductionsTotal: computation.otherDeductionsTotal,
          }
        : null,
      activeLoans,
      rateHistory,
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
