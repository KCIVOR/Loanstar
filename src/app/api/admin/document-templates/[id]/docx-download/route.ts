import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedTemplateAssetDownloadUrl } from "@/lib/documents/template-storage";
import { getTemplateWithVersions } from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * A signed download URL for a docx-format version's stored file — lets the
 * editor offer "download the current .docx" the same way the HTML editor's
 * toolbar offers "Download .docx" (an export), except this is the actual
 * uploaded source file itself, not a generated copy. `?versionId=` selects
 * which version; defaults to the current draft, then the published version.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireModulePermission("system_config", "view");
    const { id: templateId } = await context.params;
    const requestedVersionId = new URL(request.url).searchParams.get("versionId");
    const supabase = await createClient();

    const existing = await getTemplateWithVersions(supabase, templateId);
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    const version = requestedVersionId
      ? existing.versions.find((v) => v.id === requestedVersionId)
      : (existing.versions.find((v) => v.status === "draft") ??
        existing.versions.find((v) => v.status === "published"));
    if (!version || version.format !== "docx" || !version.docxStoragePath) {
      return NextResponse.json({ error: "No docx file for this version" }, { status: 404 });
    }

    const signedUrl = await createSignedTemplateAssetDownloadUrl(
      supabase,
      version.docxStoragePath,
    );

    return jsonOk({ signedUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
