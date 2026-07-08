import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulePermission("auth_admin", "view");
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: role, error } = await supabase
      .from("roles")
      .select(
        `
        id, slug, name, description, is_system, is_active, created_at, updated_at,
        role_module_permissions (
          id, can_view, can_create, can_edit, can_delete, can_execute_trigger,
          modules ( id, slug, name )
        ),
        role_field_rules (
          id, field_rules,
          modules ( id, slug, name )
        )
      `,
      )
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return jsonOk({ role });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("auth_admin", "edit");
    const { id } = await context.params;
    const body = patchRoleSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("roles")
      .select("id, slug, name, description, is_system, is_active")
      .eq("id", id)
      .single();

    if (!before) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const { data: role, error } = await supabase
      .from("roles")
      .update({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      })
      .eq("id", id)
      .select(
        "id, slug, name, description, is_system, is_active, created_at, updated_at",
      )
      .single();

    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "update",
      entityType: "role",
      entityId: id,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: role as unknown as Record<string, unknown>,
    });

    return jsonOk({ role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("auth_admin", "delete");
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: role } = await supabase
      .from("roles")
      .select("id, slug, name, is_system")
      .eq("id", id)
      .single();

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.is_system) {
      return NextResponse.json(
        { error: "System roles cannot be deleted" },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "delete",
      entityType: "role",
      entityId: id,
      beforeData: role as unknown as Record<string, unknown>,
    });

    return jsonOk({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
