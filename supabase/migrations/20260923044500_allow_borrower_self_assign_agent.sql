-- Allow the owning borrower to write their own loan_applications.agent_user_id,
-- alongside staff with intake:edit and super admins. Requested by the client
-- 2026-09-23: borrowers should be able to pick/change their own assigned
-- agent themselves (see docs/uat-agent-field-implementation-plan.md).
--
-- The 2026-09-23 guard trigger (guard_application_agent_column, from
-- supabase/migrations/20260923032933_guard_application_agent_column.sql)
-- otherwise rejects any agent_user_id write not made by intake:edit staff or
-- a super admin. RLS (applications_update / applications_borrower_draft_submit)
-- already restricts which UPDATEs on this table reach the trigger at all for
-- a borrower actor: only the application's own borrower, only while
-- is_csa_editable_status(status) holds. This migration only widens the
-- trigger's own permission check to also accept that already-RLS-gated case,
-- not the write path itself.
create or replace function public.guard_application_agent_column()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and new.agent_user_id is not null)
     or (tg_op = 'UPDATE' and new.agent_user_id is distinct from old.agent_user_id)
  then
    if not (
      public.is_super_admin()
      or public.has_module_permission('intake', 'edit')
      or exists (
        select 1
        from public.borrowers b
        where b.id = new.borrower_id
          and b.user_id = auth.uid()
      )
    ) then
      raise exception 'Only staff with intake:edit, a super admin, or the application''s own borrower may set agent_user_id'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$function$;
