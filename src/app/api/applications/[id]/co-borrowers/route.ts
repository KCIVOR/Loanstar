import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError, handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCanEditCoBorrowers,
  normalizeCoBorrowers,
} from "@/lib/applications/co-borrower";
import { writeAuditEvent } from "@/lib/audit/writer";
import { getApplicationForStaff } from "@/lib/csa/application";
import {
  ForbiddenError,
  hasModulePermission,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  coBorrowers: z
    .array(
      z.object({
        fullName: z.string().min(1, "Co-borrower name is required"),
        address: z.string().min(1, "Co-borrower address is required"),
      }),
    )
    .max(10, "At most 10 co-borrowers"),
});

/**
 * Co-Borrower feature (Phase 4). Dedicated write path so CSA / Committee can
 * fill co-borrower name + address on an application flagged
 * `co_borrower_required`, both before and after approval, without an RLS
 * policy change and without touching the CSA PATCH hot path.
 *
 * The `intake` role has no `loan_applications` UPDATE grant past
 * `is_csa_editable_status`, so the write goes through the service client
 * after an explicit permission + visibility check — the same discipline
 * `queueForLra` / `completeRevision` already use. It never touches `blocker`.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const [canIntake, canCommittee] = await Promise.all([
      hasModulePermission("intake", "edit", user.id),
      hasModulePermission("committee", "execute_trigger", user.id),
    ]);
    if (!canIntake && !canCommittee) {
      throw new ForbiddenError(
        "Missing permission to edit co-borrower details",
      );
    }

    const body = patchSchema.parse(await request.json());
    const coBorrowers = normalizeCoBorrowers(body.coBorrowers);

    // Visibility / ownership check (throws ForbiddenError if the caller can't
    // see this application) and the fields we gate on.
    const supabase = await createClient();
    const application = await getApplicationForStaff(supabase, id);

    const gate = assertCanEditCoBorrowers({
      segment: (application.segment as string | null) ?? null,
      coBorrowerRequired: application.co_borrower_required === true,
      status: application.status as string,
    });
    if (!gate.ok) {
      throw new ValidationError(gate.reason);
    }

    const before = normalizeCoBorrowers(application.co_borrowers);
    const previousCompletedAt =
      (application.co_borrower_completed_at as string | null) ?? null;

    // Service role: see the file header for why RLS blocks the caller's role
    // here at post-approval statuses.
    const admin = createServiceClient();
    const { data: updated, error } = await admin
      .from("loan_applications")
      .update({
        co_borrowers: coBorrowers,
        // Stamp once, the first time the list becomes non-empty. Never
        // cleared afterwards, even if the list is later emptied.
        co_borrower_completed_at:
          coBorrowers.length > 0 && !previousCompletedAt
            ? new Date().toISOString()
            : previousCompletedAt,
      })
      .eq("id", id)
      .select("id, co_borrowers, co_borrower_completed_at")
      .single();

    if (error || !updated) {
      throw new Error(error?.message ?? "Failed to update co-borrowers");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "update",
      entityType: "loan_application",
      entityId: id,
      beforeData: { coBorrowers: before },
      afterData: { coBorrowers },
    });

    return jsonOk({
      coBorrowers: normalizeCoBorrowers(updated.co_borrowers),
      coBorrowerCompletedAt:
        (updated.co_borrower_completed_at as string | null) ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
