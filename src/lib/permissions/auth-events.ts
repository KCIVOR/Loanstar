/**
 * Decides whether PermissionsProvider should refetch /api/permissions/me.
 *
 * Supabase Auth recovers the session on tab focus (visibilitychange) and can
 * emit SIGNED_IN / TOKEN_REFRESHED even when the user did not change. Reloading
 * permissions on those events flips loading=true and remounts portal UI
 * (modals disappear, sidebar skeletons flash).
 */
export function shouldReloadPermissions(input: {
  event: string;
  nextUserId: string | null;
  currentUserId: string | null;
}): boolean {
  const { event, nextUserId, currentUserId } = input;

  if (event === "SIGNED_OUT") return true;
  if (event === "USER_UPDATED") return true;
  if (event === "INITIAL_SESSION") return true;

  // Same authenticated user — ignore focus recovery / token refresh noise.
  if (
    (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
    nextUserId != null &&
    nextUserId === currentUserId
  ) {
    return false;
  }

  // Real sign-in, user switch, or first session after logout.
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    return nextUserId !== currentUserId;
  }

  // Unknown events: only reload when the user identity actually changed.
  return nextUserId !== currentUserId;
}
