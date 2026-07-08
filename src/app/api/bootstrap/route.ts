import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireAuth } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * One-time bootstrap: assigns super_admin role to BOOTSTRAP_SUPER_ADMIN_EMAIL
 * when no super admin exists yet.
 */
export async function POST() {
  try {
    const user = await requireAuth();
    const bootstrapEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;

    if (!bootstrapEmail) {
      return NextResponse.json(
        { error: "BOOTSTRAP_SUPER_ADMIN_EMAIL is not configured" },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const service = createServiceClient();

    const { data: existingSuperAdmin } = await service
      .from("user_roles")
      .select("user_id, roles!inner ( slug )")
      .eq("roles.slug", "super_admin")
      .limit(1);

    if (existingSuperAdmin && existingSuperAdmin.length > 0) {
      return NextResponse.json(
        { error: "A super admin already exists" },
        { status: 409 },
      );
    }

    const { data: profile } = await service
      .from("profiles")
      .select("id, email")
      .eq("email", bootstrapEmail)
      .single();

    if (!profile) {
      return NextResponse.json(
        {
          error: `No user found with email ${bootstrapEmail}. Create the account first.`,
        },
        { status: 404 },
      );
    }

    if (profile.id !== user.id && user.email !== bootstrapEmail) {
      return NextResponse.json(
        { error: "Only the bootstrap email user may run this endpoint" },
        { status: 403 },
      );
    }

    const { data: superAdminRole } = await service
      .from("roles")
      .select("id")
      .eq("slug", "super_admin")
      .single();

    if (!superAdminRole) {
      return NextResponse.json(
        { error: "super_admin role not found in database" },
        { status: 500 },
      );
    }

    const { error: assignError } = await service.from("user_roles").insert({
      user_id: profile.id,
      role_id: superAdminRole.id,
      assigned_by: user.id,
    });

    if (assignError) throw new Error(assignError.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: "execute_trigger",
      entityType: "bootstrap",
      entityId: profile.id,
      afterData: { email: bootstrapEmail, role: "super_admin" },
    });

    return jsonOk({
      success: true,
      message: `Super admin role assigned to ${bootstrapEmail}`,
      userId: profile.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
