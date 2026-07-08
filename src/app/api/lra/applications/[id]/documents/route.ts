import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { STAGES } from "@/lib/constants";
import { buildStoragePath } from "@/lib/documents/storage";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const uploadMetadataSchema = z.object({
  documentTypeId: z.string().uuid(),
  stage: z.enum(STAGES),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive().max(10_485_760),
  storagePath: z.string().min(1).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const body = uploadMetadataSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: app, error: appError } = await supabase
      .from("loan_applications")
      .select("id, borrower_id")
      .eq("id", id)
      .single();

    if (appError || !app?.borrower_id) {
      throw new Error("Application not found");
    }

    const { data: existingDoc, error: fetchError } = await supabase
      .from("documents")
      .select("id, status")
      .eq("loan_application_id", app.id)
      .eq("document_type_id", body.documentTypeId)
      .eq("stage", body.stage)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    let documentId = existingDoc?.id as string | undefined;

    if (!documentId) {
      const { data: created, error: createError } = await supabase
        .from("documents")
        .insert({
          borrower_id: app.borrower_id,
          loan_application_id: app.id,
          document_type_id: body.documentTypeId,
          stage: body.stage,
          status: "pending",
        })
        .select("id")
        .single();

      if (createError || !created) {
        throw new Error(createError?.message ?? "Failed to create document slot");
      }
      documentId = created.id;
    }

    if (!documentId) {
      throw new Error("Failed to resolve document slot");
    }

    const storagePath =
      body.storagePath ??
      buildStoragePath(app.borrower_id as string, documentId, body.fileName);

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({
        storage_path: storagePath,
        file_name: body.fileName,
        mime_type: body.mimeType,
        file_size: body.fileSize,
        status: "uploaded",
        uploaded_by: user.id,
      })
      .eq("id", documentId)
      .select("id, document_type_id, stage, status, file_name")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Failed to update document metadata");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "update",
      entityType: "document",
      entityId: updated.id,
      afterData: {
        applicationId: app.id,
        documentTypeId: body.documentTypeId,
        stage: body.stage,
        fileName: body.fileName,
        status: "uploaded",
      },
    });

    return jsonOk({ document: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
