import { NextResponse } from "next/server";
import { z } from "zod";

import { formatStatusLabel } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCsaCanEdit,
  getApplicationForStaff,
  getEndorseReadiness,
  isCsaEditableStatus,
} from "@/lib/csa/application";
import {
  isEligibleAgent,
  listEligibleAgents,
  resolveAssignedAgentName,
} from "@/lib/csa/agent-assignment";
import { getActiveComputation, getSmeRateHistory } from "@/lib/csa/computation";
import {
  borrowerProfileToRow,
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { getNegotiation } from "@/lib/negotiation/service";
import { getStageChecklist } from "@/lib/documents/checklist";
import {
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  borrower: z
    .object({
      firstName: z.string().optional(),
      middleName: z.string().nullable().optional(),
      lastName: z.string().optional(),
      suffix: z.string().nullable().optional(),
      dateOfBirth: z.string().nullable().optional(),
      placeOfBirth: z.string().nullable().optional(),
      citizenship: z.string().nullable().optional(),
      civilStatus: z.string().nullable().optional(),
      gender: z.string().nullable().optional(),
      mobilePhone: z.string().nullable().optional(),
      landline: z.string().nullable().optional(),
      presentAddress: z.record(z.string(), z.unknown()).optional(),
      permanentAddress: z.record(z.string(), z.unknown()).optional(),
      manningAgency: z.record(z.string(), z.unknown()).optional(),
      financial: z.record(z.string(), z.unknown()).optional(),
      allottee: z.record(z.string(), z.unknown()).optional(),
      picWork: z.record(z.string(), z.unknown()).optional(),
      businessInfo: z.record(z.string(), z.unknown()).optional(),
      dependents: z.array(z.record(z.string(), z.unknown())).optional(),
      references: z.array(z.record(z.string(), z.unknown())).optional(),
      profileData: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  details: z
    .object({
      loanTypeId: z.string().uuid().nullable().optional(),
      internalFlags: z.record(z.string(), z.unknown()).optional(),
      staffNotes: z.string().nullable().optional(),
    })
    .optional(),
  /** Omitted = unchanged; explicit null clears the assignment. Validated
   * against the live eligible-agent list before persisting — see
   * src/lib/csa/agent-assignment.ts. */
  agentUserId: z.string().uuid().nullable().optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id } = await params;
    const supabase = await createClient();
    const application = await getApplicationForStaff(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrowerRow = (
      Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
    ) as BorrowerRow | null;

    const { data: details } = await supabase
      .from("application_details")
      .select("*")
      .eq("loan_application_id", id)
      .maybeSingle();

    const checklist = await getStageChecklist(supabase, "intake", id, {
      segment:
        application.segment === "sme" || application.segment === "individual"
          ? application.segment
          : "seafarer",
      entityType:
        application.entity_type === "individual" ||
        application.entity_type === "corporate"
          ? application.entity_type
          : null,
    });
    const computation = await getActiveComputation(supabase, id);
    const rateHistory = await getSmeRateHistory(supabase, id);
    const endorseReadiness = await getEndorseReadiness(supabase, id);
    const negotiation = await getNegotiation(supabase, id);

    let privacyOrientationByName: string | null = null;
    if (application.privacy_orientation_by) {
      const { data: orientationProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", application.privacy_orientation_by as string)
        .maybeSingle();
      privacyOrientationByName =
        (orientationProfile?.full_name as string | null | undefined) ?? null;
    }

    let initialInterviewByName: string | null = null;
    if (application.initial_interview_by) {
      const { data: interviewProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", application.initial_interview_by as string)
        .maybeSingle();
      initialInterviewByName =
        (interviewProfile?.full_name as string | null | undefined) ?? null;
    }

    // profiles/user_roles/roles RLS only lets auth_admin/super_admin read
    // other users' rows, so the eligible-agent list and the assigned name
    // both require a service client — see src/lib/csa/agent-assignment.ts.
    // Read-only; the caller is already gated by requireModulePermission
    // above.
    const serviceClient = createServiceClient();
    const [eligibleAgents, assignedAgentName] = await Promise.all([
      listEligibleAgents(serviceClient),
      resolveAssignedAgentName(
        serviceClient,
        application.agent_user_id as string | null,
      ),
    ]);

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        statusHistory: application.status_history,
        blocker: application.blocker,
        coBorrowerRequired: application.co_borrower_required === true,
        coBorrowers: Array.isArray(application.co_borrowers)
          ? (application.co_borrowers as Array<{ fullName: string; address: string }>)
          : [],
        segment:
          application.segment === "sme" || application.segment === "individual"
            ? application.segment
            : "seafarer",
        entityType:
          application.entity_type === "individual" ||
          application.entity_type === "corporate"
            ? application.entity_type
            : null,
        collateralType:
          application.collateral_type === "car_refinancing" ||
          application.collateral_type === "real_estate"
            ? application.collateral_type
            : "none",
        paymentSchedule:
          application.payment_schedule === "mpl" ||
          application.payment_schedule === "salary" ||
          application.payment_schedule === "weekly" ||
          application.payment_schedule === "bi_monthly" ||
          application.payment_schedule === "quarterly" ||
          application.payment_schedule === "two_monthly" ||
          application.payment_schedule === "daily" ||
          application.payment_schedule === "quarterly_special" ||
          application.payment_schedule === "two_monthly_special"
            ? application.payment_schedule
            : "monthly",
        isReloan: application.is_reloan,
        agentUserId: (application.agent_user_id as string | null) ?? null,
        assignedAgentName,
        endorsedAt: application.endorsed_at,
        privacyOrientationAt:
          (application.privacy_orientation_at as string | null) ?? null,
        privacyOrientationBy:
          (application.privacy_orientation_by as string | null) ?? null,
        privacyOrientationByName,
        initialInterviewAt:
          (application.initial_interview_at as string | null) ?? null,
        initialInterviewBy:
          (application.initial_interview_by as string | null) ?? null,
        initialInterviewNotes:
          (application.initial_interview_notes as string | null) ?? null,
        initialInterviewByName,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        editable: isCsaEditableStatus(application.status),
      },
      borrower: borrowerRow ? mapBorrowerRow(borrowerRow) : null,
      details: details
        ? {
            loanTypeId: details.loan_type_id,
            internalFlags: details.internal_flags,
            staffNotes: details.staff_notes,
          }
        : null,
      eligibleAgents,
      checklist,
      computation,
      rateHistory,
      endorseReadiness,
      negotiation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();
    const application = await assertCsaCanEdit(supabase, id);

    if (body.borrower) {
      const row = borrowerProfileToRow({
        firstName: body.borrower.firstName,
        middleName: body.borrower.middleName ?? undefined,
        lastName: body.borrower.lastName,
        suffix: body.borrower.suffix ?? undefined,
        dateOfBirth: body.borrower.dateOfBirth ?? undefined,
        placeOfBirth: body.borrower.placeOfBirth ?? undefined,
        citizenship: body.borrower.citizenship ?? undefined,
        civilStatus: body.borrower.civilStatus ?? undefined,
        gender: body.borrower.gender ?? undefined,
        mobilePhone: body.borrower.mobilePhone ?? undefined,
        landline: body.borrower.landline ?? undefined,
        presentAddress: body.borrower.presentAddress as never,
        permanentAddress: body.borrower.permanentAddress as never,
        manningAgency: body.borrower.manningAgency as never,
        financial: body.borrower.financial as never,
        allottee: body.borrower.allottee as never,
        picWork: body.borrower.picWork as never,
        businessInfo: body.borrower.businessInfo as never,
        dependents: body.borrower.dependents as never,
        references: body.borrower.references,
        profileData: body.borrower.profileData,
      });

      const { error: borrowerError } = await supabase
        .from("borrowers")
        .update(row)
        .eq("id", application.borrower_id);

      if (borrowerError) {
        throw new Error(borrowerError.message);
      }
    }

    if (body.details) {
      const { error: detailsError } = await supabase
        .from("application_details")
        .upsert({
          loan_application_id: id,
          loan_type_id: body.details.loanTypeId ?? null,
          internal_flags: body.details.internalFlags ?? {},
          staff_notes: body.details.staffNotes ?? null,
          updated_at: new Date().toISOString(),
        });

      if (detailsError) {
        throw new Error(detailsError.message);
      }
    }

    const previousAgentUserId =
      (application.agent_user_id as string | null) ?? null;

    if (body.agentUserId !== undefined) {
      // A dropdown value is never authority: re-validate the candidate
      // against the live eligible-agent list right before writing. This is
      // the check that matters — the Phase 2A DB trigger is a backstop
      // against bypassing this route, not a substitute for it.
      if (body.agentUserId !== null) {
        const eligible = await isEligibleAgent(
          createServiceClient(),
          body.agentUserId,
        );
        if (!eligible) {
          return NextResponse.json(
            { error: "Selected agent is not an active agent" },
            { status: 400 },
          );
        }
      }

      // Goes through the normal authenticated client so the existing
      // applications_update RLS policy (status guard, intake:edit) still
      // applies — never bypassed with the service client here. The Phase 2A
      // trigger separately re-checks the actor for this specific column.
      const { error: agentError } = await supabase
        .from("loan_applications")
        .update({ agent_user_id: body.agentUserId })
        .eq("id", id);

      if (agentError) {
        throw new Error(agentError.message);
      }
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "update",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        ...body,
        ...(body.agentUserId !== undefined
          ? {
              agentAssignment: {
                before: previousAgentUserId,
                after: body.agentUserId,
              },
            }
          : {}),
      },
    });

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
