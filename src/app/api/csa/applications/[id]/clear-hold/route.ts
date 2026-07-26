import { NextResponse } from "next/server";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { resolveStatusAfterClearHold } from "@/lib/csa/clear-hold";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const supabase = await createClient();
    const application = await assertCsaCanEdit(supabase, id);

    if (application.status !== "on_hold") {
      return NextResponse.json(
        { error: "Application is not on hold" },
        { status: 400 },
      );
    }

    const restoredStatus = resolveStatusAfterClearHold(
      application.status_history as
        | { status: string; at: string }[]
        | null
        | undefined,
    );

    await appendStatusHistory(supabase, id, restoredStatus, {
      actorId: user.id,
      note: "Hold cleared",
    });

    const { error: blockerError } = await supabase
      .from("loan_applications")
      .update({ blocker: null })
      .eq("id", id);

    if (blockerError) {
      throw new Error(blockerError.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        trigger: "clear_hold",
        status: restoredStatus,
        blocker: null,
      },
    });

    return jsonOk({ success: true, status: restoredStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
