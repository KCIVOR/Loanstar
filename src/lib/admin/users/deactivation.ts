import { ForbiddenError } from "@/lib/permissions/server";

/**
 * Long enough to be effectively permanent (~100 years). GoTrue's
 * ban_duration takes a duration string, not "forever", so we use a value
 * far past any realistic session lifetime. Cleared back to "none" on
 * reactivation — see clearBanDuration().
 */
export const PERMANENT_BAN_DURATION = "876000h";
export const NO_BAN_DURATION = "none";

/** Which ban_duration to pass to auth.admin.updateUserById for this transition. */
export function resolveBanDuration(requestedIsActive: boolean): string {
  return requestedIsActive ? NO_BAN_DURATION : PERMANENT_BAN_DURATION;
}

export type LastActiveSuperAdminGuardInput = {
  actorUserId: string;
  targetUserId: string;
  /** The is_active value being requested for the target. */
  requestedIsActive: boolean;
  /** Whether the target currently holds the super_admin role. */
  targetHasSuperAdminRole: boolean;
  /**
   * Count of OTHER users (excluding the target) who are both active
   * (profiles.is_active = true) and hold the super_admin role.
   */
  otherActiveSuperAdminCount: number;
};

/**
 * Mirrors the existing "cannot remove the last Super Admin's role" guard in
 * the same route, extended to the is_active:false path (which previously had
 * no equivalent protection at all). Also blocks a sole active super admin
 * from deactivating themselves, since that has the same effect as removing
 * the last super admin's access.
 *
 * Pure decision function — no I/O — so it is unit-testable without mocking
 * Supabase.
 */
export function assertDeactivationAllowed(
  input: LastActiveSuperAdminGuardInput,
): void {
  if (input.requestedIsActive) return; // reactivation never needs this guard
  if (!input.targetHasSuperAdminRole) return; // guard is scoped to super admins

  if (input.otherActiveSuperAdminCount > 0) return;

  if (input.actorUserId === input.targetUserId) {
    throw new ForbiddenError(
      "Cannot deactivate yourself: you are the last active Super Admin.",
    );
  }

  throw new ForbiddenError(
    "Cannot deactivate the last active Super Admin.",
  );
}
