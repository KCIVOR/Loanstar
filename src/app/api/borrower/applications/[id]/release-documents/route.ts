import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("id, status, blocker, borrowers!inner ( user_id )")
      .eq("id", id)
      .single();

    if (!app) {
      throw new ForbiddenError("Application not found");
    }

    const borrowerRaw = app.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    if (borrower?.user_id !== user.id) {
      throw new ForbiddenError("Application not found");
    }

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id, status, release_paths")
      .eq("loan_application_id", id)
      .maybeSingle();

    if (!releaseFile) {
      return jsonOk({ releaseFile: null, documents: [] });
    }

    const { data: docs } = await supabase
      .from("generated_documents")
      .select("id, document_slug, signed_at, is_finalized, storage_path")
      .eq("release_file_id", releaseFile.id)
      .order("document_slug");

    const documents = await Promise.all(
      (docs ?? []).map(async (doc) => ({
        id: doc.id,
        document_slug: doc.document_slug,
        signed_at: doc.signed_at,
        is_finalized: doc.is_finalized,
        downloadUrl: doc.storage_path
          ? await createSignedDownloadUrl(
              supabase,
              doc.storage_path as string,
            ).catch(() => null)
          : null,
      })),
    );

    return jsonOk({
      releaseFile: {
        id: releaseFile.id,
        status: releaseFile.status,
        releasePaths: Array.isArray(releaseFile.release_paths)
          ? releaseFile.release_paths
          : [],
      },
      blocker: app.blocker,
      documents,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
