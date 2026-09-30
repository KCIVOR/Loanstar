import { ForbiddenError, isSuperAdmin, requireAuth } from "@/lib/permissions/server";

/**
 * Explicit super-admin gate (fail-closed: isSuperAdmin throws on RPC error,
 * and anything but `true` is Forbidden). Used by every legacy-import route.
 */
export async function requireSuperAdmin() {
  const user = await requireAuth();
  if ((await isSuperAdmin(user.id)) !== true) {
    throw new ForbiddenError("Super admin only");
  }
  return user;
}
