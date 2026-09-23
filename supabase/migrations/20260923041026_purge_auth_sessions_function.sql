-- Immediate user deactivation, Phase 2: supabase-js's admin API has no
-- "delete all sessions for a user id" call, and admin.signOut(jwt, scope)
-- needs the TARGET's own JWT (not available to a deactivating admin). This
-- SECURITY DEFINER function lets the service-role client purge a banned
-- user's auth.sessions rows directly so a still-valid access/refresh token
-- pair dies immediately instead of merely being blocked on next refresh.
-- Execute is restricted to service_role only; never exposed to
-- authenticated/anon clients.

create or replace function public.purge_auth_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.purge_auth_sessions(uuid) from public;
revoke all on function public.purge_auth_sessions(uuid) from anon;
revoke all on function public.purge_auth_sessions(uuid) from authenticated;
grant execute on function public.purge_auth_sessions(uuid) to service_role;
