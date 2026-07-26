import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { saveDraft } from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const draftSchema = z.object({
  body: z.string().max(200_000),
  mergeFields: z.unknown().optional(),
});

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const { id } = await context.params;
    const input = draftSchema.parse(await request.json());
    const supabase = await createClient();

    const version = await saveDraft(
      supabase,
      id,
      { body: input.body, mergeFields: input.mergeFields },
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "document_template_version",
      entityId: version.id,
      afterData: { templateId: id, versionNo: version.versionNo, status: version.status },
    });

    return jsonOk({ version });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
