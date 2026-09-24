import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveProfileRow = {
  id: string;
  is_active: boolean | null;
};

/**
 * Pure decision: is this profile row (or its absence) allowed to keep using
 * the app? No I/O, so it is unit-testable without a Supabase client.
 *
 * A missing row and an inactive row are both "not allowed" and must produce
 * the same caller-visible outcome — callers must not let an attacker
 * distinguish "deactivated" from "no such user" beyond existing auth
 * conventions.
 */
export function isActiveProfile(
  profile: ActiveProfileRow | null | undefined,
): boolean {
  return Boolean(profile) && profile!.is_active === true;
}

/**
 * Fetches only the columns needed to decide whether an authenticated
 * identity is still allowed to use the app. Accepts any Supabase client
 * (cookie-scoped in Server Components/Route Handlers, or the edge-scoped
 * client built inside middleware) so the same check runs everywhere without
 * duplicating the query or the decision logic.
 *
 * Intentionally uses the caller's own client (not the service client) so
 * this read stays subject to RLS — least-privileged read for ordinary
 * request authorization.
 */
export async function fetchActiveProfile(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<ActiveProfileRow | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  return (data as ActiveProfileRow | null) ?? null;
}
