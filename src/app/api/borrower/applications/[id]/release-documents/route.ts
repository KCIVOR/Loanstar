import { handleApiError, jsonOk } from "@/lib/api/handler";
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
      .select("id, status, release_path")
      .eq("loan_application_id", id)
      .maybeSingle();

    if (!releaseFile) {
      return jsonOk({ releaseFile: null, documents: [] });
    }

    const { data: docs } = await supabase
      .from("generated_documents")
      .select("id, document_slug, signed_at, is_finalized")
      .eq("release_file_id", releaseFile.id)
      .order("document_slug");

    return jsonOk({
      releaseFile: {
        id: releaseFile.id,
        status: releaseFile.status,
        releasePath: releaseFile.release_path,
      },
      blocker: app.blocker,
      documents: docs ?? [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
