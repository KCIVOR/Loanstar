import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { generateApplicationForm } from "@/lib/documents/generators/application-form";
import {
  getRenderedDocumentDownloadUrl,
  listRenderedDocuments,
} from "@/lib/documents/render-store";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const result = await generateApplicationForm(supabase, {
      applicationId,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "rendered_document",
      entityId: result.documentId,
      afterData: { trigger: "generate_application_form", applicationId },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const docs = await listRenderedDocuments(supabase, applicationId, {
      slug: "application_form",
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
