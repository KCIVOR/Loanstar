import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createTemplate, listTemplates } from "@/lib/documents/templates/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();
    const templates = await listTemplates(supabase);
    return jsonOk({ templates });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Slug must be lowercase letters, numbers, underscores"),
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "create");
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();

    const template = await createTemplate(supabase, body);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "create",
      entityType: "document_template",
      entityId: template.id,
      afterData: template as unknown as Record<string, unknown>,
    });

    return jsonOk({ template }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
