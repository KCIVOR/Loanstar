import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { generateAcknowledgementReceipt } from "@/lib/documents/generators/acknowledgement-receipt";
import {
  getRenderedDocumentDownloadUrl,
  listRenderedDocuments,
} from "@/lib/documents/render-store";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function resolveReleaseFileId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("release_files")
    .select("id")
    .eq("loan_application_id", applicationId)
    .single();
  if (error || !data) {
    throw new Error("Release file not found");
  }
  return data.id as string;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const releaseFileId = await resolveReleaseFileId(supabase, applicationId);
    const result = await generateAcknowledgementReceipt(supabase, {
      releaseFileId,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "rendered_document",
      entityId: result.documentId,
      afterData: { trigger: "generate_acknowledgement_receipt", releaseFileId },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const docs = await listRenderedDocuments(supabase, applicationId, {
      slug: "acknowledgement_receipt",
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        downloadUrl: await getRenderedDocumentDownloadUrl(supabase, doc.id),
      })),
    );

    return jsonOk({ documents: withUrls });
  } catch (error) {
    return handleApiError(error);
  }
}
