import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { forwardToCommittee } from "@/lib/cig/forward";
import { assertCigVerificationStage } from "@/lib/cig/queue-guards";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Explicit "Submit CI report to Committee" trigger. */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "verification",
      "execute_trigger",
    );
    const { id } = await params;
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);

    const result = await forwardToCommittee(supabase, id, user.id);

    if (!result.forwarded) {
      return NextResponse.json(
        {
          error: "CI report is not ready to submit",
          missing: result.missing,
        },
        { status: 400 },
      );
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: { trigger: "submit_ci_report", status: "for_approval" },
    });

    return jsonOk({ success: true, status: "for_approval" });
  } catch (error) {
    return handleApiError(error);
  }
}
