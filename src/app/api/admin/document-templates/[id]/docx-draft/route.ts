import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { DocxTemplateMergeError, mergeDocxTemplate } from "@/lib/documents/render/docx-merge";
import {
  buildTemplateAssetPath,
  DOCX_TEMPLATE_MAX_BYTES,
  DOCX_TEMPLATE_MIME_TYPE,
  uploadTemplateAssetBytes,
} from "@/lib/documents/template-storage";
import { buildSampleContext } from "@/lib/documents/templates/fields";
import {
  getTemplateWithVersions,
  saveDocxDraft,
} from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

// docxtemplater/pizzip need Node Buffer/zlib — never Edge (matches the
// existing docx export route's same constraint).
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Upload a new docx-format draft — the "Upload a Word file as template"
 * counterpart to the HTML draft route (PUT .../draft). Validates the file is
 * a real, tag-resolvable .docx (via a test merge against sample data, the
 * same sample context the HTML preview route uses) BEFORE storing it, so a
 * broken template is rejected at upload time with a specific tag error, not
 * discovered later at real document generation.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const { id: templateId } = await context.params;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.type && file.type !== DOCX_TEMPLATE_MIME_TYPE) {
      return NextResponse.json(
        { error: "File must be a .docx (Word document)" },
        { status: 400 },
      );
    }
    if (file.size > DOCX_TEMPLATE_MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be 10MB or smaller" },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    try {
      mergeDocxTemplate(bytes, buildSampleContext());
    } catch (error) {
      const message =
        error instanceof DocxTemplateMergeError
          ? error.message
          : "Uploaded file could not be read as a Word document template";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const supabase = await createClient();

    const existing = await getTemplateWithVersions(supabase, templateId);
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    const existingDraft = existing.versions.find((v) => v.status === "draft");
    const targetVersionId = existingDraft?.id ?? crypto.randomUUID();
    const storagePath = buildTemplateAssetPath(templateId, targetVersionId);

    await uploadTemplateAssetBytes(supabase, storagePath, bytes);

    const version = await saveDocxDraft(
      supabase,
      templateId,
      {
        docxStoragePath: storagePath,
        ...(existingDraft ? {} : { newVersionId: targetVersionId }),
      },
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "document_template_version",
      entityId: version.id,
      afterData: {
        templateId,
        versionNo: version.versionNo,
        status: version.status,
        format: "docx",
      },
    });

    return jsonOk({ version });
  } catch (error) {
    return handleApiError(error);
  }
}
