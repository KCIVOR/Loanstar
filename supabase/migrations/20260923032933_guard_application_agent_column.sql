-- Phase 2A of docs/uat-agent-field-implementation-plan.md.
-- Live RLS audit (2026-09-23) showed applications_update,
-- applications_borrower_draft_submit, and applications_insert have no
-- column-level restriction: any borrower who owns an editable/draft
-- application can write agent_user_id directly via the Supabase client,
-- bypassing the staff-only PATCH route entirely. This trigger closes that
-- gap at the database, reusing the same helper functions the existing
-- loan_applications RLS policies already call.

create or replace function public.guard_application_agent_column()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and new.agent_user_id is not null)
     or (tg_op = 'UPDATE' and new.agent_user_id is distinct from old.agent_user_id)
  then
    if not (public.is_super_admin() or public.has_module_permission('intake', 'edit')) then
      raise exception 'Only staff with intake:edit (or a super admin) may set agent_user_id'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_application_agent_column on public.loan_applications;

create trigger guard_application_agent_column
before insert or update on public.loan_applications
for each row execute function public.guard_application_agent_column();
