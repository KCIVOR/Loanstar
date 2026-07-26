import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import {
  ForbiddenError,
  hasModulePermission,
  isSuperAdmin,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Modules whose RLS already allows SELECT on `documents` / loan-documents. */
const STAFF_DOCUMENT_VIEW_MODULES = ["intake", "release_lra", "committee"] as const;

async function requireStaffDocumentView(userId: string) {
  if (await isSuperAdmin(userId)) return;

  for (const moduleSlug of STAFF_DOCUMENT_VIEW_MODULES) {
    if (await hasModulePermission(moduleSlug, "view", userId)) {
      return;
    }
  }

  throw new ForbiddenError(
    "Missing document view permission (intake or release_lra)",
  );
}

/**
 * Staff signed-URL download for borrower attachments.
 * Borrower self-service continues to use /api/borrower/documents/[id]/download.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    await requireStaffDocumentView(user.id);

    const { id } = await params;
    const supabase = await createClient();

    const { data: document, error } = await supabase
      .from("documents")
      .select("id, storage_path, file_name, mime_type, status")
      .eq("id", id)
      .single();

    if (error || !document) {
      throw new ForbiddenError("Document not found");
    }

    if (!document.storage_path || document.status === "pending") {
      throw new ForbiddenError("Document has not been uploaded yet");
    }

    const signedUrl = await createSignedDownloadUrl(
      supabase,
      document.storage_path as string,
    );

    return jsonOk({
      documentId: document.id,
      fileName: document.file_name,
      mimeType: document.mime_type,
      signedUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
