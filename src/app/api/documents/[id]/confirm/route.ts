import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const confirmSchema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = confirmSchema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();

    const { data: before, error: fetchError } = await supabase
      .from("documents")
      .select(
        "id, status, loan_application_id, document_type_id, stage, file_name",
      )
      .eq("id", id)
      .single();

    if (fetchError || !before) {
      throw new ForbiddenError("Document not found");
    }

    if (before.status !== "uploaded") {
      throw new ForbiddenError("Only uploaded documents can be confirmed");
    }

    const confirmedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({
        status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: confirmedAt,
      })
      .eq("id", id)
      .select(
        "id, status, loan_application_id, document_type_id, stage, file_name, confirmed_by, confirmed_at",
      )
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Failed to confirm document");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "document",
      entityId: id,
      beforeData: before,
      afterData: { ...updated, note: body.note ?? null },
    });

    return jsonOk({
      document: {
        id: updated.id,
        status: updated.status,
        applicationId: updated.loan_application_id,
        documentTypeId: updated.document_type_id,
        stage: updated.stage,
        fileName: updated.file_name,
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
