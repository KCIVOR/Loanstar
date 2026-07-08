import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

export async function GET() {
  try {
    await requireModulePermission("auth_admin", "view");
    const supabase = await createClient();

    const { data: roles, error } = await supabase
      .from("roles")
      .select(
        "id, slug, name, description, is_system, is_active, created_at, updated_at",
      )
      .order("name");

    if (error) throw new Error(error.message);

    return jsonOk({ roles: roles ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("auth_admin", "create");
    const body = createRoleSchema.parse(await request.json());
    const supabase = await createClient();

    let slug = slugify(body.name);
    const { data: existing } = await supabase
      .from("roles")
      .select("slug")
      .like("slug", `${slug}%`);

    if (existing && existing.length > 0) {
      slug = `${slug}_${Date.now().toString(36)}`;
    }

    const { data: role, error } = await supabase
      .from("roles")
      .insert({
        slug,
        name: body.name,
        description: body.description ?? null,
        is_system: false,
        is_active: true,
      })
      .select(
        "id, slug, name, description, is_system, is_active, created_at, updated_at",
      )
      .single();

    if (error) throw new Error(error.message);

    const { data: modules } = await supabase.from("modules").select("id");
    if (modules?.length) {
      await supabase.from("role_module_permissions").insert(
        modules.map((m) => ({
          role_id: role.id,
          module_id: m.id,
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_execute_trigger: false,
        })),
      );
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "create",
      entityType: "role",
      entityId: role.id,
      afterData: role as unknown as Record<string, unknown>,
    });

    return jsonOk({ role }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
