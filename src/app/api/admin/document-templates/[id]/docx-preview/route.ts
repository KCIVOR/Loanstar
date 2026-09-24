import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/handler";
import { renderDocxTemplateToPdf } from "@/lib/documents/render";
import { loadDocRenderConfig } from "@/lib/documents/render/engine-config";
import { downloadTemplateAssetBytes } from "@/lib/documents/template-storage";
import { buildSampleContext } from "@/lib/documents/templates/fields";
import { getTemplateWithVersions } from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

// docxtemplater/pizzip are Node-only; never Edge.
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Render the template's current docx draft (or published version, if there's
 * no draft) to a PDF using sample data — the docx-format sibling of the
 * HTML preview route. Unlike that route, there's no body to post: the file
 * already lives in Storage from the upload, so this just needs to know
 * which template.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    await requireModulePermission("system_config", "view");
    const { id: templateId } = await context.params;
    const supabase = await createClient();

    const existing = await getTemplateWithVersions(supabase, templateId);
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    const version =
      existing.versions.find((v) => v.status === "draft") ??
      existing.versions.find((v) => v.status === "published");
    if (!version || version.format !== "docx" || !version.docxStoragePath) {
      return NextResponse.json(
        { error: "No docx-format version to preview" },
        { status: 400 },
      );
    }

    const docxBytes = await downloadTemplateAssetBytes(supabase, version.docxStoragePath);
    const cfg = await loadDocRenderConfig();
    const pdf = await renderDocxTemplateToPdf(docxBytes, buildSampleContext(), {
      connection: cfg.connection,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=preview.pdf",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
