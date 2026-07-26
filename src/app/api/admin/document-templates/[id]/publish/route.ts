import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { publishVersion } from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const publishSchema = z.object({
  versionId: z.string().uuid(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const { id } = await context.params;
    const { versionId } = publishSchema.parse(await request.json());
    const supabase = await createClient();

    const version = await publishVersion(supabase, id, versionId, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "document_template_version",
      entityId: version.id,
      afterData: {
        templateId: id,
        versionNo: version.versionNo,
        status: version.status,
        publishedAt: version.publishedAt,
      },
    });

    return jsonOk({ version });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
