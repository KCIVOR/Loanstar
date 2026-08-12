import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { generateApplicationForm } from "@/lib/documents/generators/application-form";
import { resolveApplicationFormSlug } from "@/lib/documents/generators/application-form-context";
import {
  getRenderedDocumentDownloadUrl,
  listRenderedDocuments,
} from "@/lib/documents/render-store";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function loadApplicationScope(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("segment, entity_type")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new Error("Application not found");
  }

  return {
    segment: data.segment as string | null,
    entityType: data.entity_type as string | null,
  };
}

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
      afterData: {
        trigger: "generate_application_form",
        applicationId,
        documentSlug: result.documentSlug,
      },
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

    const scope = await loadApplicationScope(supabase, applicationId);
    const resolved = resolveApplicationFormSlug(scope);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const docs = await listRenderedDocuments(supabase, applicationId, {
      slug: resolved.slug,
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        downloadUrl: await getRenderedDocumentDownloadUrl(supabase, doc.id),
      })),
    );

    return jsonOk({ documents: withUrls, documentSlug: resolved.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
