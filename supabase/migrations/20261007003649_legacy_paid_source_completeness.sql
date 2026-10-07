-- Require complete original-loan coverage for paid settlement snapshots.
do $migration$
declare definition text;
  old_text text := $old$or coalesce((p_account->'settledSource'->>'originalAmount')::numeric,0)<=0$old$;
  new_text text := $new$or coalesce((p_account->'settledSource'->>'originalAmount')::numeric,0)<=0
    or (p_account->'settledSource'->>'originalAmount')::numeric<>(v->>'total_loan')::numeric$new$;
begin
  definition:=pg_get_functiondef('public.import_legacy_active_account(jsonb,text,jsonb)'::regprocedure);
  if position(old_text in definition)=0 then raise exception 'Paid import function differs from expected source'; end if;
  execute replace(definition,old_text,new_text);
end;
$migration$;
