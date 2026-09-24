-- Immediate user deactivation: close the RLS gap that let an inactive user
-- keep reading/updating their own profiles row (and flip is_active back to
-- true) via direct PostgREST calls, bypassing the admin route entirely.
-- Confirmed live via pg_policies 2026-09-23: both profiles_select_own and
-- profiles_update allowed `id = auth.uid()` with no is_active condition.

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select
to authenticated
using (
  (id = auth.uid() and is_active = true)
  or is_super_admin()
  or has_module_permission('auth_admin', 'view')
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update
to authenticated
using (
  (id = auth.uid() and is_active = true)
  or is_super_admin()
  or has_module_permission('auth_admin', 'edit')
)
with check (
  (id = auth.uid() and is_active = true)
  or is_super_admin()
  or has_module_permission('auth_admin', 'edit')
);
