import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { signGeneratedDocument } from "@/lib/lra/release-service";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

const signSchema = z.object({ confirm: z.literal(true) });

async function assertOwnReleaseDoc(
  userId: string,
  applicationId: string,
  docId: string,
) {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("loan_applications")
    .select("id, borrowers!inner ( user_id )")
    .eq("id", applicationId)
    .single();

  if (!app) {
    throw new ForbiddenError("Application not found");
  }

  const borrowerRaw = app.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  const { data: doc } = await supabase
    .from("generated_documents")
    .select("id, release_files!inner ( loan_application_id )")
    .eq("id", docId)
    .single();

  const rfRaw = doc?.release_files;
  const rf = Array.isArray(rfRaw) ? rfRaw[0] : rfRaw;

  if (!doc || rf?.loan_application_id !== applicationId) {
    throw new ForbiddenError("Document not found");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id, docId } = await params;
    signSchema.parse(await request.json());
    await assertOwnReleaseDoc(user.id, id, docId);
    const supabase = await createClient();

    const result = await signGeneratedDocument(supabase, docId, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "execute_trigger",
      entityType: "generated_document",
      entityId: docId,
      afterData: {
        applicationId: id,
        trigger: "borrower_sign_release_doc",
        ...result,
      },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
