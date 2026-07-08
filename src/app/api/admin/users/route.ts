import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("auth_admin", "view");
    const supabase = await createClient();

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_active, created_at, updated_at")
      .order("email");

    if (profilesError) throw new Error(profilesError.message);

    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role_id, roles ( id, slug, name )");

    if (rolesError) throw new Error(rolesError.message);

    const rolesByUser = new Map<
      string,
      Array<{ id: string; slug: string; name: string }>
    >();

    for (const ur of userRoles ?? []) {
      const rolesRaw = ur.roles;
      const role = Array.isArray(rolesRaw) ? rolesRaw[0] : rolesRaw;
      if (!role) continue;
      const list = rolesByUser.get(ur.user_id) ?? [];
      list.push(role);
      rolesByUser.set(ur.user_id, list);
    }

    const users = (profiles ?? []).map((p) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
    }));

    return jsonOk({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(200).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireModulePermission("auth_admin", "create");
    const body = createUserSchema.parse(await request.json());
    const service = createServiceClient();

    const { data: authData, error: authError } =
      await service.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.fullName ?? "" },
      });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Failed to create user");
    }

    const userId = authData.user.id;

    if (body.roleIds?.length) {
      const { error: roleError } = await service.from("user_roles").insert(
        body.roleIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: actor.id,
        })),
      );
      if (roleError) throw new Error(roleError.message);
    }

    const { data: profile } = await service
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", userId)
      .single();

    await writeAuditEvent({
      actorId: actor.id,
      moduleSlug: "auth_admin",
      action: "create",
      entityType: "user",
      entityId: userId,
      afterData: {
        email: body.email,
        fullName: body.fullName,
        roleIds: body.roleIds,
      },
    });

    return jsonOk({ user: profile }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
