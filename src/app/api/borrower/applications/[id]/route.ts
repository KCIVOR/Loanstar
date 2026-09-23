import { NextResponse } from "next/server";
import { z } from "zod";

import {
  formatStatusLabel,
  type StatusHistoryEntry,
} from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  isEligibleAgent,
  listEligibleAgents,
  resolveAssignedAgentName,
} from "@/lib/csa/agent-assignment";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Statuses the borrower can edit their own application in. Two separate RLS
 * policies grant this, and both must be mirrored here:
 * `applications_borrower_draft_submit` (status = 'draft' — the status a
 * brand-new, not-yet-submitted application actually sits in) and
 * `applications_update`'s borrower branch (`is_csa_editable_status`, the
 * staff/CSA-facing function — registered/documents_pending/submitted/
 * on_hold/for_revision). Kept in sync manually; the DB is the actual source
 * of truth and will reject a write this list wrongly allowed through.
 */
const BORROWER_EDITABLE_STATUSES = new Set([
  "draft",
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
]);

const agentPatchSchema = z.object({
  agentUserId: z.string().uuid().nullable().optional(),
});

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
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
      created_at,
      updated_at,
      segment,
      entity_type,
      agent_user_id,
      borrower_id,
      borrowers!inner ( user_id )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  return data;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const application = await assertOwnApplication(user.id, id);

    const timeline = ((application.status_history ?? []) as StatusHistoryEntry[]).map(
      (entry) => ({
        ...entry,
        label: formatStatusLabel(entry.status),
      }),
    );

    // Borrower-safe: listEligibleAgents/resolveAssignedAgentName return only
    // { id, fullName } for active agents — no email, role id, or Auth
    // metadata, matching the constraint in docs/uat-agent-field-
    // implementation-plan.md. Service client needed because `profiles` RLS
    // blocks reading another user's row from an ordinary session.
    const serviceClient = createServiceClient();
    const agentEditable = BORROWER_EDITABLE_STATUSES.has(application.status);
    const [assignedAgentName, eligibleAgents] = await Promise.all([
      resolveAssignedAgentName(
        serviceClient,
        application.agent_user_id as string | null,
      ),
      agentEditable ? listEligibleAgents(serviceClient) : Promise.resolve([]),
    ]);

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        statusHistory: application.status_history,
        timeline,
        blocker: application.blocker,
        isReloan: application.is_reloan,
        parentApplicationId: application.parent_application_id,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        segment:
          application.segment === "sme" || application.segment === "individual"
            ? application.segment
            : "seafarer",
        entityType:
          application.entity_type === "individual" ||
          application.entity_type === "corporate"
            ? application.entity_type
            : null,
        agentUserId: (application.agent_user_id as string | null) ?? null,
        assignedAgentName,
        agentEditable,
      },
      eligibleAgents,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Borrower sets/changes/clears their own application's assigned agent.
 * Client requested 2026-09-23: borrowers can self-assign, mirroring the
 * staff flow in `/api/csa/applications/[id]`. Authorization is enforced at
 * three layers: this route's own eligibility check (400 on a stale/forged
 * id), RLS's `applications_update` borrower branch (only the owning
 * borrower, only while `is_csa_editable_status` holds), and the
 * `guard_application_agent_column` trigger (backstop against any write path
 * that bypasses this route).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const body = agentPatchSchema.parse(await request.json());
    const supabase = await createClient();
    const application = await assertOwnApplication(user.id, id);

    if (body.agentUserId === undefined) {
      return jsonOk({ id, agentUserId: application.agent_user_id ?? null });
    }

    if (!BORROWER_EDITABLE_STATUSES.has(application.status)) {
      return NextResponse.json(
        { error: "Application is not editable in its current status" },
        { status: 400 },
      );
    }

    if (
      body.agentUserId !== null &&
      !(await isEligibleAgent(createServiceClient(), body.agentUserId))
    ) {
      return NextResponse.json(
        { error: "Selected agent is not an active agent" },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("loan_applications")
      .update({ agent_user_id: body.agentUserId })
      .eq("id", id)
      .select("id, agent_user_id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      // RLS silently returns zero rows rather than an error when a write is
      // disallowed — treat that the same as the explicit status check above.
      return NextResponse.json(
        { error: "Application is not editable in its current status" },
        { status: 400 },
      );
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "update",
      entityType: "application",
      entityId: id,
      beforeData: { agentUserId: application.agent_user_id ?? null },
      afterData: { agentUserId: body.agentUserId },
    });

    return jsonOk({ id, agentUserId: updated.agent_user_id });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Borrower deletes their own draft application. Child rows cascade at the DB. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const supabase = await createClient();
    const application = await assertOwnApplication(user.id, id);

    if (application.status !== "draft") {
      return NextResponse.json(
        { error: "Only a draft application can be deleted" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("loan_applications")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "delete",
      entityType: "loan_application",
      entityId: id,
      beforeData: { status: "draft" },
    });

    return jsonOk({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
