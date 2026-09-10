import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { removeGeneratedDocument } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id, docId } = await params;
    const supabase = await createClient();

    const { data: doc } = await supabase
      .from("generated_documents")
      .select("id, release_files!inner ( id, loan_application_id )")
      .eq("id", docId)
      .single();

    const rfRaw = doc?.release_files;
    const rf = Array.isArray(rfRaw) ? rfRaw[0] : rfRaw;

    if (!doc || rf?.loan_application_id !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const result = await removeGeneratedDocument(
      supabase,
      rf.id as string,
      docId,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "delete",
      entityType: "generated_document",
      entityId: docId,
      afterData: { trigger: "remove_generated_document", ...result },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
