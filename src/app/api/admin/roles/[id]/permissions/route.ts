import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const permissionSchema = z.object({
  moduleId: z.string().uuid(),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canExecuteTrigger: z.boolean(),
});

const putPermissionsSchema = z.object({
  permissions: z.array(permissionSchema),
});

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("auth_admin", "edit");
    const { id: roleId } = await context.params;
    const body = putPermissionsSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("role_module_permissions")
      .select(
        "module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger",
      )
      .eq("role_id", roleId);

    for (const perm of body.permissions) {
      const { error } = await supabase.from("role_module_permissions").upsert(
        {
          role_id: roleId,
          module_id: perm.moduleId,
          can_view: perm.canView,
          can_create: perm.canCreate,
          can_edit: perm.canEdit,
          can_delete: perm.canDelete,
          can_execute_trigger: perm.canExecuteTrigger,
        },
        { onConflict: "role_id,module_id" },
      );
      if (error) throw new Error(error.message);
    }

    const { data: after } = await supabase
      .from("role_module_permissions")
      .select(
        "module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger",
      )
      .eq("role_id", roleId);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "update",
      entityType: "role_module_permissions",
      entityId: roleId,
      beforeData: { permissions: before },
      afterData: { permissions: after },
    });

    return jsonOk({ permissions: after ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
