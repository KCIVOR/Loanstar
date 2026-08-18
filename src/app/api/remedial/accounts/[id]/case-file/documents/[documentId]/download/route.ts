import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import {
  assertRemedialAssignment,
  authorizeCaseFileDocumentDownload,
} from "@/lib/collection/origination-packet";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = {
  params: Promise<{ id: string; documentId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("remedial", "view");
    const { id, documentId } = await params;
    const supabase = await createClient();
    const context = await assertRemedialAssignment(supabase, user.id, id);

    const admin = createServiceClient();
    const document = await authorizeCaseFileDocumentDownload(
      admin,
      context.loanApplicationId,
      documentId,
    );
    const signedUrl = await createSignedDownloadUrl(
      admin,
      document.storagePath,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "remedial",
      action: "case_file.download",
      entityType: "document",
      entityId: document.documentId,
      afterData: {
        masterlistId: context.masterlistId,
        loanApplicationId: context.loanApplicationId,
        desk: "remedial",
      },
    });

    return jsonOk({
      documentId: document.documentId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      signedUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
