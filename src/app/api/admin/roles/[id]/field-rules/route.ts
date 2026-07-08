import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import type { FieldAccess } from "@/lib/permissions/types";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const fieldAccessSchema = z.enum(["edit", "read_only", "deny"]);

const putFieldRulesSchema = z.object({
  rules: z.array(
    z.object({
      moduleId: z.string().uuid(),
      fieldRules: z.record(z.string(), fieldAccessSchema),
    }),
  ),
});

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("auth_admin", "edit");
    const { id: roleId } = await context.params;
    const body = putFieldRulesSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("role_field_rules")
      .select("module_id, field_rules")
      .eq("role_id", roleId);

    for (const rule of body.rules) {
      const fieldRules = rule.fieldRules as Record<string, FieldAccess>;
      if (Object.keys(fieldRules).length === 0) {
        await supabase
          .from("role_field_rules")
          .delete()
          .eq("role_id", roleId)
          .eq("module_id", rule.moduleId);
        continue;
      }

      const { error } = await supabase.from("role_field_rules").upsert(
        {
          role_id: roleId,
          module_id: rule.moduleId,
          field_rules: fieldRules,
        },
        { onConflict: "role_id,module_id" },
      );
      if (error) throw new Error(error.message);
    }

    const { data: after } = await supabase
      .from("role_field_rules")
      .select("module_id, field_rules")
      .eq("role_id", roleId);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "update",
      entityType: "role_field_rules",
      entityId: roleId,
      beforeData: { rules: before },
      afterData: { rules: after },
    });

    return jsonOk({ rules: after ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
