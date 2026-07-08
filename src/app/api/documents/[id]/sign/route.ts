import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { hashDocument } from "@/lib/documents/hash";
import { downloadDocumentBytes } from "@/lib/documents/storage";
import {
  ForbiddenError,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const signSchema = z.object({
  confirm: z.literal(true),
});

async function getSignableDocument(documentId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      storage_path,
      status,
      file_name,
      loan_application_id,
      borrowers ( user_id )
    `,
    )
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Document not found");
  }

  if (data.status !== "uploaded") {
    throw new ForbiddenError("Document must be uploaded before signing");
  }

  if (!data.storage_path) {
    throw new ForbiddenError("Document has no stored file");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;
  const isOwner = borrower?.user_id === userId;

  if (!isOwner) {
    throw new ForbiddenError("You may only sign your own documents");
  }

  return data;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    signSchema.parse(await request.json());
    const supabase = await createClient();
    const document = await getSignableDocument(id, user.id);

    const fileBuffer = await downloadDocumentBytes(
      supabase,
      document.storage_path as string,
    );
    const documentHash = hashDocument(fileBuffer);

    const { data: signature, error: signError } = await supabase
      .from("signatures")
      .insert({
        document_id: document.id,
        signer_id: user.id,
        document_hash: documentHash,
      })
      .select("id, document_id, signer_id, signed_at, document_hash")
      .single();

    if (signError) {
      throw new Error(signError.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "execute_trigger",
      entityType: "signature",
      entityId: signature.id,
      afterData: {
        documentId: document.id,
        documentHash,
        applicationId: document.loan_application_id,
      },
    });

    return jsonOk({
      signature: {
        id: signature.id,
        documentId: signature.document_id,
        signerId: signature.signer_id,
        signedAt: signature.signed_at,
        documentHash: signature.document_hash,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
