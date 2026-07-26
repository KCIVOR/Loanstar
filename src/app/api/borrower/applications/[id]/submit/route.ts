import { NextResponse } from "next/server";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getCompletionSummary, getStageChecklist } from "@/lib/documents/checklist";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      status,
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

  return {
    id: data.id as string,
    status: data.status as string,
    borrowerId: data.borrower_id as string,
  };
}

/** Borrower submits their draft — flips it to documents_pending, the first
 * status CSA's queue picks up. Gated on required intake documents being
 * uploaded (not CSA-confirmed — that's CSA's job after submission). */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const supabase = await createClient();
    const application = await assertOwnApplication(user.id, id);

    if (application.status !== "draft") {
      return NextResponse.json(
        { error: "This application has already been submitted." },
        { status: 400 },
      );
    }

    const items = await getStageChecklist(supabase, "intake", application.id);
    const summary = getCompletionSummary(items);

    if (summary.uploaded < summary.required) {
      return NextResponse.json(
        {
          error: `Upload all required documents before submitting (${summary.uploaded} of ${summary.required}).`,
          summary,
        },
        { status: 400 },
      );
    }

    await appendStatusHistory(supabase, application.id, "documents_pending", {
      actorId: user.id,
      note: "Submitted by borrower",
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "update",
      entityType: "loan_application",
      entityId: application.id,
      beforeData: { status: "draft" },
      afterData: { status: "documents_pending" },
    });

    return jsonOk({ id: application.id, status: "documents_pending" });
  } catch (error) {
    return handleApiError(error);
  }
}
