import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { MODULE_SLUGS } from "@/lib/constants";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  FieldRule,
  ModulePermission,
  ModuleSlug,
  PermissionAction,
  UserPermissions,
} from "@/lib/permissions/types";
export { checkModulePermission } from "@/lib/permissions/check";

export class AuthError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function toJsonError(error: unknown, status: number) {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError();
  }

  return user;
}

export async function isSuperAdmin(userId?: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_super_admin", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to check super admin status: ${error.message}`);
  }

  return Boolean(data);
}

export async function getUserPermissions(
  userId?: string,
): Promise<UserPermissions> {
  const resolvedUserId = userId ?? (await requireAuth()).id;
  const superAdmin = await isSuperAdmin(resolvedUserId);

  if (superAdmin) {
    return {
      userId: resolvedUserId,
      isSuperAdmin: true,
      modules: MODULE_SLUGS.map((slug) => ({
        moduleSlug: slug,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExecuteTrigger: true,
      })),
      fieldRules: {},
    };
  }

  // RLS only lets users with auth_admin view read roles/role_module_permissions,
  // so reading a regular user's own permission set requires the service client.
  // Safe: identity comes from requireAuth above and the query is scoped to
  // resolvedUserId, so callers can only ever read their own (or an explicitly
  // requested) user's permission rows.
  const service = createServiceClient();
  const { data: roleRows, error: roleError } = await service
    .from("user_roles")
    .select(
      `
      role_id,
      roles!inner (
        id,
        is_active,
        role_module_permissions (
          can_view,
          can_create,
          can_edit,
          can_delete,
          can_execute_trigger,
          modules!inner ( slug )
        ),
        role_field_rules (
          field_rules,
          modules!inner ( slug )
        )
      )
    `,
    )
    .eq("user_id", resolvedUserId);

  if (roleError) {
    throw new Error(`Failed to load user permissions: ${roleError.message}`);
  }

  const moduleMap = new Map<ModuleSlug, ModulePermission>();
  const fieldRules: Partial<Record<ModuleSlug, FieldRule>> = {};

  for (const slug of MODULE_SLUGS) {
    moduleMap.set(slug, {
      moduleSlug: slug,
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canExecuteTrigger: false,
    });
  }

  for (const row of roleRows ?? []) {
    const rolesRaw = row.roles;
    const role = (Array.isArray(rolesRaw) ? rolesRaw[0] : rolesRaw) as
      | {
          is_active: boolean;
          role_module_permissions: Array<{
            can_view: boolean;
            can_create: boolean;
            can_edit: boolean;
            can_delete: boolean;
            can_execute_trigger: boolean;
            modules: { slug: string } | { slug: string }[];
          }>;
          role_field_rules: Array<{
            field_rules: FieldRule;
            modules: { slug: string } | { slug: string }[];
          }>;
        }
      | null
      | undefined;

    if (!role?.is_active) continue;

    for (const perm of role.role_module_permissions ?? []) {
      const moduleRef = Array.isArray(perm.modules)
        ? perm.modules[0]
        : perm.modules;
      const slug = moduleRef?.slug as ModuleSlug;
      const existing = moduleMap.get(slug);
      if (!existing) continue;

      existing.canView ||= perm.can_view;
      existing.canCreate ||= perm.can_create;
      existing.canEdit ||= perm.can_edit;
      existing.canDelete ||= perm.can_delete;
      existing.canExecuteTrigger ||= perm.can_execute_trigger;
    }

    for (const rule of role.role_field_rules ?? []) {
      const moduleRef = Array.isArray(rule.modules)
        ? rule.modules[0]
        : rule.modules;
      const slug = moduleRef?.slug as ModuleSlug;
      const merged = { ...(fieldRules[slug] ?? {}), ...rule.field_rules };
      fieldRules[slug] = merged;
    }
  }

  return {
    userId: resolvedUserId,
    isSuperAdmin: false,
    modules: Array.from(moduleMap.values()),
    fieldRules,
  };
}

export async function requireModulePermission(
  moduleSlug: ModuleSlug,
  action: PermissionAction,
): Promise<User> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("has_module_permission", {
    p_module_slug: moduleSlug,
    p_permission: action,
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(`Permission check failed: ${error.message}`);
  }

  if (!data) {
    throw new ForbiddenError(
      `Missing '${action}' permission on module '${moduleSlug}'`,
    );
  }

  return user;
}

export async function getRequestIp(): Promise<string | null> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return headerStore.get("x-real-ip");
}

/** Returns true when the user has the requested permission on the module. */
export async function hasModulePermission(
  moduleSlug: ModuleSlug,
  action: PermissionAction,
  userId?: string,
): Promise<boolean> {
  const supabase = await createClient();
  const resolvedUserId = userId ?? (await requireAuth()).id;

  const { data, error } = await supabase.rpc("has_module_permission", {
    p_module_slug: moduleSlug,
    p_permission: action,
    p_user_id: resolvedUserId,
  });

  if (error) {
    throw new Error(`Permission check failed: ${error.message}`);
  }

  return Boolean(data);
}

