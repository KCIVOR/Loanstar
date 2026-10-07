-- Immutable source marker survives borrower-account linking. Only confirmed
-- imported masterlist IDs are backfilled; ordinary loans remain unchanged.
alter table public.masterlist add column is_legacy_import boolean not null default false;
update public.masterlist m set is_legacy_import=true
where exists (
  select 1 from public.legacy_import_runs r,
    lateral jsonb_array_elements(r.results) result
  where r.status='imported' and result->>'masterlistId'=m.id::text
);

-- Preserve the audited transaction, authorization, locking and other inserts.
-- Abort if the deployed function differs from the expected source.
do $migration$
declare original text; revised text; change record;
begin
  original := pg_get_functiondef('public.import_legacy_active_account(jsonb,text,jsonb)'::regprocedure);
  revised := original;
  for change in select * from (values
    ($old$  key text;$old$, $new$  key text;
  paid_account boolean := coalesce(v->>'account_status','active')='paid';
  closing date := (v->>'closed_at')::date;$new$),
    ($old$or opening is null or opening <= 0$old$, $new$or opening is null or opening < 0 or (paid_account and opening<>0) or (not paid_account and opening<=0)$new$),
    ($old$or coalesce(v->>'account_status','active') <> 'active'$old$, $new$or coalesce(v->>'account_status','active') not in ('active','paid')$new$),
    ($old$  if jsonb_typeof(schedules) <> 'array' or jsonb_array_length(schedules) not between 1 and 1000 then$old$,
     $new$  if paid_account and (closing is null or closing>snapshot
    or closing<(v->>'release_date')::date
    or coalesce((p_account->'settledSource'->>'count')::integer,0)<1
    or coalesce((p_account->'settledSource'->>'originalAmount')::numeric,0)<=0) then
    raise exception 'Paid import requires closing date and settled source installments';
  end if;
  if not paid_account and closing is not null then raise exception 'Active loan cannot be closed'; end if;
  if schedules is null or jsonb_typeof(schedules) <> 'array'
    or (paid_account and jsonb_array_length(schedules)<>0)
    or (not paid_account and jsonb_array_length(schedules) not between 1 and 1000) then$new$),
    ($old$'loan_active'$old$, $new$(case when paid_account then 'paid_off' else 'loan_active' end)$new$),
    ($old$vessel_name,outstanding_balance,segment)$old$, $new$vessel_name,outstanding_balance,segment,account_status,closed_at,is_legacy_import)$new$),
    ($old$opening,v->>'segment') returning id into master_id;$old$,
     $new$opening,v->>'segment',case when paid_account then 'paid' else 'active' end,
    closing::timestamp at time zone 'Asia/Manila',true) returning id into master_id;$new$)
  ) as replacements(old_text,new_text) loop
    if position(change.old_text in revised)=0 then raise exception 'Import function differs: %',change.old_text; end if;
    revised := replace(revised,change.old_text,change.new_text);
  end loop;
  execute revised;
end;
$migration$;
