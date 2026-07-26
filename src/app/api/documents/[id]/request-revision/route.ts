import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { recordApplicationHold } from "@/lib/csa/record-hold";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const revisionSchema = z.object({
  remarks: z.string().min(3),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = revisionSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: before, error: fetchError } = await supabase
      .from("documents")
      .select(
        "id, status, loan_application_id, document_type_id, stage, file_name, storage_path, revision_remarks, confirmed_by, confirmed_at",
      )
      .eq("id", id)
      .single();

    if (fetchError || !before) {
      throw new ForbiddenError("Document not found");
    }

    await assertCsaCanEdit(supabase, before.loan_application_id as string);

    const status = before.status as string;
    if (
      status !== "uploaded" &&
      status !== "confirmed" &&
      status !== "needs_revision"
    ) {
      throw new ForbiddenError(
        "Only uploaded, confirmed, or needs-revision documents can be sent for revision",
      );
    }

    if (!before.file_name && !before.storage_path) {
      throw new ForbiddenError("Document has no file to revise");
    }

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({
        status: "needs_revision",
        revision_remarks: body.remarks,
        confirmed_by: null,
        confirmed_at: null,
      })
      .eq("id", id)
      .select(
        "id, status, loan_application_id, document_type_id, stage, file_name, revision_remarks, confirmed_by, confirmed_at",
      )
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Failed to request revision");
    }

    const { holdId } = await recordApplicationHold(supabase, {
      applicationId: before.loan_application_id as string,
      reason: body.remarks,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "document",
      entityId: id,
      beforeData: before,
      afterData: {
        ...updated,
        holdId,
        remarks: body.remarks,
      },
    });

    return jsonOk({
      document: {
        id: updated.id,
        status: updated.status,
        applicationId: updated.loan_application_id,
        documentTypeId: updated.document_type_id,
        stage: updated.stage,
        fileName: updated.file_name,
        revisionRemarks: updated.revision_remarks,
        confirmedBy: updated.confirmed_by,
        confirmedAt: updated.confirmed_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
