import type { UserPermissions } from "@/lib/permissions/types";

import type { DashboardScope } from "./types";

/**
 * The one audited rule for who gets an agent-scoped dashboard vs. the
 * staff/super-admin aggregate view:
 *
 *   - Super admin → aggregate (never narrowed, regardless of role slugs).
 *   - Active `agent` role slug (and not super admin) → agent scope, scoped
 *     to that user's own id. This holds even if the user also holds another
 *     role — an agent role is never silently widened away.
 *   - Anything else → aggregate.
 *
 * Pure and dependency-free: takes only the already-computed
 * `UserPermissions`, so identity always traces back to `requireAuth` /
 * `getUserPermissions` and never to request input.
 */
export function resolveDashboardScope(permissions: UserPermissions): DashboardScope {
  if (permissions.isSuperAdmin) {
    return { kind: "aggregate" };
  }

  if (permissions.roleSlugs.includes("agent")) {
    return { kind: "agent", userId: permissions.userId };
  }

  return { kind: "aggregate" };
}
