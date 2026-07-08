import { createClient } from "@/lib/supabase/server";
import type { FieldAccess, ModuleSlug } from "@/lib/permissions/types";
import { isSuperAdmin } from "@/lib/permissions/server";

export type FieldEditResult =
  | { allowed: true; access: FieldAccess }
  | { allowed: false; access: FieldAccess; reason: string };

const ACCESS_PRIORITY: Record<FieldAccess, number> = {
  deny: 0,
  read_only: 1,
  edit: 2,
};

function mergeFieldAccess(current: FieldAccess, next: FieldAccess): FieldAccess {
  return ACCESS_PRIORITY[next] < ACCESS_PRIORITY[current] ? next : current;
}

/**
 * Validates whether a user may edit a specific field within a module.
 * Uses the `get_field_rule` RPC (most restrictive rule wins across roles).
 */
export async function validateFieldEdit(
  module: ModuleSlug,
  field: string,
  userId: string,
): Promise<FieldEditResult> {
  if (await isSuperAdmin(userId)) {
    return { allowed: true, access: "edit" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_field_rule", {
    p_module_slug: module,
    p_field_key: field,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Field rule lookup failed: ${error.message}`);
  }

  const access = (data ?? "edit") as FieldAccess;

  if (access === "deny") {
    return {
      allowed: false,
      access,
      reason: `Field '${field}' is denied on module '${module}'`,
    };
  }

  if (access === "read_only") {
    return {
      allowed: false,
      access,
      reason: `Field '${field}' is read-only on module '${module}'`,
    };
  }

  return { allowed: true, access };
}

/**
 * Resolves the effective field access for a user across all assigned roles.
 * Useful when building PATCH validators that need the full rule set.
 */
export async function getFieldAccess(
  module: ModuleSlug,
  field: string,
  userId: string,
): Promise<FieldAccess> {
  const result = await validateFieldEdit(module, field, userId);
  return result.access;
}

/** Merges multiple field rule objects; most restrictive access wins per field. */
export function mergeFieldRules(
  ...rules: Array<Record<string, FieldAccess>>
): Record<string, FieldAccess> {
  const merged: Record<string, FieldAccess> = {};

  for (const rule of rules) {
    for (const [field, access] of Object.entries(rule)) {
      merged[field] = merged[field]
        ? mergeFieldAccess(merged[field], access)
        : access;
    }
  }

  return merged;
}

/** Throws when the user cannot edit the given field. */
export async function assertFieldEditable(
  module: ModuleSlug,
  field: string,
  userId: string,
): Promise<void> {
  const result = await validateFieldEdit(module, field, userId);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}
