import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const patchUserSchema = z.object({
  is_active: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
  full_name: z.string().max(200).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireModulePermission("auth_admin", "edit");
    const { id: userId } = await context.params;
    const body = patchUserSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", userId)
      .single();

    if (!before) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (body.is_active !== undefined || body.full_name !== undefined) {
      const { error } = await supabase
        .from("profiles")
        .update({
          ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
          ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    }

    if (body.roleIds !== undefined) {
      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("role_id")
        .eq("user_id", userId);

      const existingIds = new Set((existingRoles ?? []).map((r) => r.role_id));
      const newIds = new Set(body.roleIds);

      const { data: superAdminRole } = await supabase
        .from("roles")
        .select("id")
        .eq("slug", "super_admin")
        .single();

      if (
        superAdminRole &&
        existingIds.has(superAdminRole.id) &&
        !newIds.has(superAdminRole.id)
      ) {
        const { count, error: countError } = await supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role_id", superAdminRole.id)
          .neq("user_id", userId);

        if (countError) throw new Error(countError.message);
        if ((count ?? 0) === 0) {
          throw new ForbiddenError(
            "Cannot remove the last Super Admin from the system.",
          );
        }
      }

      const toRemove = [...existingIds].filter((id) => !newIds.has(id));
      const toAdd = [...newIds].filter((id) => !existingIds.has(id));

      if (toRemove.length) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role_id", toRemove);
        if (error) throw new Error(error.message);
      }

      if (toAdd.length) {
        const { error } = await supabase.from("user_roles").insert(
          toAdd.map((roleId) => ({
            user_id: userId,
            role_id: roleId,
            assigned_by: actor.id,
          })),
        );
        if (error) throw new Error(error.message);
      }
    }

    const { data: after } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", userId)
      .single();

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role_id, roles ( id, slug, name )")
      .eq("user_id", userId);

    await writeAuditEvent({
      actorId: actor.id,
      moduleSlug: "auth_admin",
      action: "update",
      entityType: "user",
      entityId: userId,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: {
        ...(after as unknown as Record<string, unknown>),
        roleIds: body.roleIds,
      },
    });

    return jsonOk({ user: after, roles: roles ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
