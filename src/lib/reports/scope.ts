import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account-level scoping for a caller viewing /reports.
 *
 * Returns `null` when the caller should see the whole portfolio (no
 * per-user account assignment concept applies to their role) — never an
 * empty array, which would silently zero out every panel.
 *
 * Wired to `assignments.collector_user_id` / `remedial_user_id` today,
 * ready for a role that needs it. As of this writing, `reports:view` is
 * granted only to `super_admin`, `ar`, and `committee` — none of which are
 * individually account-scoped (AR sees the whole book, Committee reviews
 * every application) — so no caller of this dashboard is scoped by it yet.
 * If a scoped role (e.g. Collector, Collection Head) is later granted
 * `reports:view`, call this from the dashboard route and pass the result
 * into each `compute*Metrics` function's masterlist/application queries as
 * an explicit `.in("id", scopedIds)` filter — never by reverting to the
 * caller's own Supabase token, which reintroduces the silent-RLS-zero bug
 * this module's service-role read was built to avoid.
 */
export async function scopedMasterlistIdsForCaller(
  supabase: SupabaseClient,
  userId: string,
  role: "collector" | "remedial" | "unscoped",
): Promise<string[] | null> {
  if (role === "unscoped") return null;

  const column = role === "collector" ? "collector_user_id" : "remedial_user_id";
  const { data, error } = await supabase.from("assignments").select("masterlist_id").eq(column, userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.masterlist_id as string);
}
