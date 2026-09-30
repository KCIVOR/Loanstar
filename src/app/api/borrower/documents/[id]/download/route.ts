import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function getOwnDocument(userId: string, documentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      storage_path,
      file_name,
      mime_type,
      status,
      borrowers!inner ( user_id )
    `,
    )
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Document not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Document not found");
  }

  if (!data.storage_path) {
    throw new ForbiddenError("Document has not been uploaded yet");
  }

  if (data.status === "pending") {
    throw new ForbiddenError("Document has not been uploaded yet");
  }

  return data;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const document = await getOwnDocument(user.id, id);

    // Ownership is already enforced above (RLS read + explicit user_id match).
    // Sign with the service client: files uploaded before the application was
    // connected/moved to this borrower live under the previous borrower's
    // storage folder, which storage RLS would otherwise refuse.
    const signedUrl = await createSignedDownloadUrl(
      createServiceClient(),
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
