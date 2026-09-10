import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getTemplateWithVersions,
  updateTemplateMeta,
} from "@/lib/documents/templates/service";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulePermission("system_config", "view");
    const { id } = await context.params;
    const supabase = await createClient();

    const result = await getTemplateWithVersions(supabase, id);
    if (!result) {
      throw new ForbiddenError("Template not found");
    }
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

const eligibility = z.enum(["always", "optional", "hidden"]);
const patchSchema = z
  .object({
    seafarerGeneration: eligibility.optional(),
    smeGeneration: eligibility.optional(),
  })
  .refine(
    (v) =>
      v.seafarerGeneration !== undefined || v.smeGeneration !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();

    const template = await updateTemplateMeta(supabase, id, body);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "document_template",
      entityId: id,
      afterData: {
        seafarerGeneration: template.seafarerGeneration,
        smeGeneration: template.smeGeneration,
      },
    });

    return jsonOk({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
