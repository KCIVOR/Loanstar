import type { SupabaseClient } from "@supabase/supabase-js";

export const AVATAR_UPLOAD_WINDOW_MS = 10 * 60 * 1000;
export const AVATAR_UPLOAD_MAX_PER_WINDOW = 5;

/** Pure check used by tests and the avatar API. */
export function isAvatarUploadRateLimited(recentCount: number): boolean {
  return recentCount >= AVATAR_UPLOAD_MAX_PER_WINDOW;
}

/**
 * Count recent avatar_upload audit rows for this actor within the window.
 * Fail-open (allow) if the count query fails.
 */
export async function countRecentAvatarUploads(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - AVATAR_UPLOAD_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("module_slug", "account_settings")
    .eq("action", "avatar_upload")
    .gte("created_at", since);

  if (error) return 0;
  return count ?? 0;
}
