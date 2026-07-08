import type { UserPermissions } from "@/lib/permissions/types";

/** Returns the portal a user should land on after signing in. */
export function resolveHomePath(
  _permissions?: Pick<UserPermissions, "isSuperAdmin" | "modules">,
): string {
  return "/dashboard";
}
