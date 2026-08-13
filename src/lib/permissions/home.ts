import type { ModuleSlug } from "@/lib/constants";
import type { UserPermissions } from "@/lib/permissions/types";

/** Portal route each module's work happens in. */
export const MODULE_HOME_PATHS: Record<ModuleSlug, string> = {
  auth_admin: "/admin",
  borrower_portal: "/borrower",
  leads: "/agent",
  intake: "/csa",
  computation: "/csa",
  verification: "/cig",
  committee: "/committee",
  negotiation: "/committee",
  release_lra: "/lra",
  accounting_ar: "/ar",
  collection: "/collector",
  briefings: "/collector/briefings",
  remedial: "/remedial",
  reports: "/reports",
  system_config: "/admin/config",
  audit_log: "/admin/audit",
};

/** Returns the portal a user should land on after signing in.
 *
 * Everyone with staff module permissions lands on the dashboard hub — it's a
 * real per-module overview now, not just a permission grid. The one
 * exception is Borrower: their portal isn't part of the module-permission
 * system and already has its own richer home page (application status
 * timeline), so they skip the hub entirely.
 */
export function resolveHomePath(
  permissions?: Pick<UserPermissions, "isSuperAdmin" | "modules"> | null,
): string {
  if (!permissions || permissions.isSuperAdmin) return "/dashboard";

  const viewable = permissions.modules.filter((m) => m.canView);
  if (viewable.length === 1 && viewable[0].moduleSlug === "borrower_portal") {
    return "/borrower";
  }
  return "/dashboard";
}
