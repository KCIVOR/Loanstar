import type {
  ModuleSlug,
  PermissionAction,
  UserPermissions,
} from "@/lib/permissions/types";
import { PERMISSION_COLUMN } from "@/lib/permissions/types";

/** Checks a loaded permissions payload (client or server safe). */
export function checkModulePermission(
  permissions: UserPermissions,
  moduleSlug: ModuleSlug,
  action: PermissionAction,
): boolean {
  if (permissions.isSuperAdmin) return true;

  const column = PERMISSION_COLUMN[action];
  const modulePerm = permissions.modules.find(
    (m) => m.moduleSlug === moduleSlug,
  );
  return modulePerm?.[column] ?? false;
}
