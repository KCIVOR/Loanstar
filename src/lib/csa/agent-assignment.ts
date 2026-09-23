import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Eligible-agent lookup and assignment validation for
 * `loan_applications.agent_user_id`.
 *
 * `profiles`, `user_roles`, and `roles` RLS only lets a session read rows
 * other than its own when it holds `auth_admin:view` or is a super admin
 * (see `profiles_select_own`, `user_roles_select`, `roles_select` policies —
 * confirmed live 2026-09-23). An ordinary `intake:edit` staff session cannot
 * list agents through the authenticated client, so these functions expect a
 * service-role client from the caller — the same justified pattern already
 * used by `getRoleUserIds` in `src/lib/notifications/workflow-recipients.ts`.
 * Callers MUST gate access with `requireModulePermission('intake', 'view' |
 * 'edit')` (or equivalent) before calling anything here; this module does no
 * authorization of its own.
 */

export type EligibleAgent = { id: string; fullName: string };

/** User ids holding the active `agent` role, regardless of profile status. */
async function listActiveAgentRoleUserIds(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, roles!inner ( slug, is_active )")
    .eq("roles.slug", "agent")
    .eq("roles.is_active", true);

  if (error) {
    throw new Error(`Failed to load agent role holders: ${error.message}`);
  }

  return [...new Set((data ?? []).map((row) => row.user_id as string))];
}

/**
 * `{ id, fullName }` for every active profile holding the active `agent`
 * role — safe to send to a staff-facing dropdown (no email, no role id, no
 * Auth metadata, no inactive accounts).
 */
export async function listEligibleAgents(
  supabase: SupabaseClient,
): Promise<EligibleAgent[]> {
  const agentUserIds = await listActiveAgentRoleUserIds(supabase);
  if (agentUserIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", agentUserIds)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load eligible agents: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? "",
  }));
}

/**
 * Re-checks one candidate id against the same eligibility query the dropdown
 * uses, so a stale/forged client value can never assign an inactive profile
 * or a non-agent. This is the check that matters — the Phase 2A DB trigger
 * is a backstop against bypassing this route, not a substitute for it.
 */
export async function isEligibleAgent(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<boolean> {
  const agents = await listEligibleAgents(supabase);
  return agents.some((agent) => agent.id === candidateId);
}

/**
 * Resolve a stored `agent_user_id` to a safe display name for
 * document/form rendering. Returns null for no assignment, an inactive
 * profile, or a profile that no longer exists — callers fall back to the
 * legacy `businessInfo.salesAgent` field in that case (see
 * `application-form-context.ts`).
 */
export async function resolveAssignedAgentName(
  supabase: SupabaseClient,
  agentUserId: string | null | undefined,
): Promise<string | null> {
  if (!agentUserId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, is_active")
    .eq("id", agentUserId)
    .maybeSingle();

  if (error || !data || data.is_active !== true) return null;
  return (data.full_name as string | null) ?? null;
}
