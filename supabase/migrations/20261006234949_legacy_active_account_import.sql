-- Import-only opening snapshots. Ordinary schedules have NULL baselines.
alter table public.amortization_schedules
  add column legacy_balance_as_of date,
  add column legacy_penalty_baseline numeric(14,2)
    check (legacy_penalty_baseline >= 0);
alter table public.legacy_import_runs add column results jsonb not null default '[]'::jsonb;
alter table public.legacy_import_runs drop constraint legacy_import_runs_segment_check;
alter table public.legacy_import_runs add constraint legacy_import_runs_segment_check
  check (segment in ('seafarer','sme','individual'));
alter table public.legacy_import_mappings drop constraint legacy_import_mappings_segment_check;
alter table public.legacy_import_mappings add constraint legacy_import_mappings_segment_check
  check (segment in ('seafarer','sme','individual'));

-- Guard every replacement: abort rather than overwrite an unexpectedly changed
-- accounting function. All ordinary-loan branches retain their existing logic.
do $migration$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.recompute_account_penalties(uuid)'::regprocedure);
  revised := replace(original,
    'COALESCE(s.penalty_periods_applied, 0) AS periods_applied',
    'COALESCE(s.penalty_periods_applied, 0) AS periods_applied,
      s.legacy_balance_as_of,
      COALESCE(s.legacy_penalty_baseline, 0) AS legacy_penalty_baseline');
  if revised = original then raise exception 'Penalty function select has changed; audit required'; end if;
  original := revised;
  revised := replace(original, 'IF v_ontime_paid >= v_net_due - 0.005 THEN',
    'IF v_row.legacy_balance_as_of IS NULL AND v_ontime_paid >= v_net_due - 0.005 THEN');
  if revised = original then raise exception 'Penalty on-time branch has changed; audit required'; end if;
  original := revised;
  revised := replace(original, 'v_running := 0;', 'v_running := v_row.legacy_penalty_baseline;');
  if revised = original then raise exception 'Penalty baseline branch has changed; audit required'; end if;
  original := revised;
  revised := replace(original, 'FOR v_p IN 1 .. v_target_periods LOOP',
    'FOR v_p IN (CASE WHEN v_row.legacy_balance_as_of IS NULL THEN 1 ELSE
       GREATEST(0, (date_part(''year'', age(v_row.legacy_balance_as_of, v_row.due_date)) * 12
         + date_part(''month'', age(v_row.legacy_balance_as_of, v_row.due_date)))::int) + 1 END)
       .. v_target_periods LOOP');
  if revised = original then raise exception 'Penalty accrual loop has changed; audit required'; end if;
  execute revised;
end;
$migration$;

-- One call = one transaction. No elevated role, login creation, release file,
-- receipt, historical posting, or payment is fabricated by this function.
-- audit_events intentionally has no authenticated INSERT policy. Keep that
-- policy intact; this restricted helper can log only a caller-owned import run.
create function public.audit_legacy_import(p_run_id uuid, p_master_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $audit$
declare r public.legacy_import_runs%rowtype;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then
    raise exception 'Super admin only' using errcode='42501';
  end if;
  select * into r from public.legacy_import_runs where id=p_run_id and created_by=auth.uid()
    and status='imported' and results @> jsonb_build_array(jsonb_build_object('masterlistId',p_master_id));
  if not found then raise exception 'Import provenance does not match audit target'; end if;
  insert into public.audit_events (actor_id,module_slug,action,entity_type,entity_id,after_data)
  values (auth.uid(),'legacy-import','import','masterlist',p_master_id::text,
    jsonb_build_object('runId',r.id,'fileName',r.file_name,'results',r.results));
end;
$audit$;
revoke all on function public.audit_legacy_import(uuid,uuid) from public,anon;
grant execute on function public.audit_legacy_import(uuid,uuid) to authenticated;

create function public.import_legacy_active_account(p_account jsonb, p_file_name text, p_mapping jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare
  v jsonb := p_account->'values';
  schedules jsonb := p_account->'installments';
  b public.borrowers%rowtype;
  app_id uuid; computation_id uuid; master_id uuid; run_id uuid;
  loan_no text := nullif(btrim(v->>'legacy_loan_no'),'');
  snapshot date := (v->>'balance_as_of')::date;
  opening numeric := (v->>'outstanding_balance')::numeric;
  total numeric; line jsonb; amount numeric; fee numeric; due date; periods integer;
  key text;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then
    raise exception 'Super admin only' using errcode='42501';
  end if;
  if loan_no is null or snapshot is null or snapshot > (now() at time zone 'Asia/Manila')::date
    or opening is null or opening <= 0 or v->>'segment' not in ('seafarer','sme','individual')
    or coalesce(v->>'account_status','active') <> 'active'
    or nullif(btrim(v->>'first_name'),'') is null
    or nullif(btrim(v->>'last_name'),'') is null
    or nullif(btrim(v->>'email'),'') is null then
    raise exception 'Invalid active-account identity or opening snapshot';
  end if;
  if jsonb_typeof(schedules) <> 'array' or jsonb_array_length(schedules) not between 1 and 1000 then
    raise exception 'Supply 1 to 1000 unpaid installments';
  end if;
  foreach key in array array['input_amount','principal','total_loan','total_interest','net_released',
    'monthly_amortization','processing_fee','notary_fee','security_fee','admin_cost','doc_stamp',
    'total_deductions','interest_rate','pf_rate'] loop
    if v->>key is null or (v->>key)::numeric < 0 then raise exception 'Missing or negative %', key; end if;
  end loop;
  if (v->>'principal')::numeric <= 0 or (v->>'total_loan')::numeric <= 0
    or (v->>'monthly_amortization')::numeric <= 0 or (v->>'terms')::integer < 1 then
    raise exception 'Invalid original loan amounts or terms';
  end if;
  -- Serializes retries/parallel submissions for this legacy key. Existing
  -- account records are never updated or attached based on a guessed match.
  perform pg_advisory_xact_lock(hashtextextended(loan_no, 0));
  if exists(select 1 from public.loan_applications where application_no=loan_no)
    or exists(select 1 from public.masterlist where loan_account_no=loan_no) then
    raise exception 'Legacy loan number already exists' using errcode='23505';
  end if;
  total := 0;
  for line in select value from jsonb_array_elements(schedules) loop
    amount := (line->>'amount_due')::numeric;
    fee := (line->>'penalty_amount')::numeric;
    due := (line->>'due_date')::date;
    if amount is null or fee is null or amount < 0 or fee < 0 or amount+fee <= 0
      or amount <> round(amount,2) or fee <> round(fee,2) or due is null
      or (line->>'installment_no')::integer < 1 or line->>'installment_no' is null
      or line->>'line_type' is null or line->>'line_type' not in ('standard','interest','principal') then
      raise exception 'Invalid unpaid installment';
    end if;
    total := total+amount+fee;
  end loop;
  if total <> opening then raise exception 'Opening balance does not match unpaid installments'; end if;
  insert into public.borrowers (borrower_no,email,first_name,middle_name,last_name,suffix,date_of_birth,
    mobile_phone,present_address,manning_agency,pic_work,business_info,profile_data)
  values (coalesce(nullif(v->>'legacy_borrower_no',''),public.generate_borrower_no()),v->>'email',
    v->>'first_name',v->>'middle_name',v->>'last_name',v->>'suffix',(v->>'date_of_birth')::date,
    v->>'mobile_phone',jsonb_build_object('street',v->>'address'),
    jsonb_build_object('name',v->>'manning_agency'),jsonb_build_object('vessel',v->>'vessel_name'),
    jsonb_build_object('companyName',v->>'business_name'),
    jsonb_build_object('legacyImport',jsonb_build_object('fileName',p_file_name,'snapshot',snapshot,
      'sourceRow',p_account->'rowNumber','sourceValues',v,'unpaidInstallments',schedules)))
  returning * into b;
  insert into public.loan_applications (borrower_id,application_no,status,segment,entity_type,
    individual_loan_type,schedule_type,payment_schedule,status_history)
  values (b.id,loan_no,'loan_active',v->>'segment',v->>'entity_type',v->>'individual_loan_type',
    v->>'schedule_type',v->>'payment_schedule',jsonb_build_array(jsonb_build_object(
      'status','loan_active','at',now(),'actorId',auth.uid(),'note','Legacy opening balance import')))
  returning id into app_id;
  insert into public.computations (loan_application_id,input_mode,input_amount,terms,pf_rate,interest_rate,
    security_fee_rate,principal,processing_fee,admin_cost,doc_stamp,notary_fee,security_fee,
    other_deductions_total,total_deductions,net_released,total_interest,gross_total_interest,total_loan,
    monthly_amortization,release_date,first_payment_date,due_day,loan_type_name,payment_frequency,computed_by)
  values (app_id,'PRINCIPAL',(v->>'input_amount')::numeric,(v->>'terms')::integer,(v->>'pf_rate')::numeric,
    (v->>'interest_rate')::numeric,coalesce((v->>'security_fee_rate')::numeric,0),
    (v->>'principal')::numeric,(v->>'processing_fee')::numeric,(v->>'admin_cost')::numeric,
    (v->>'doc_stamp')::numeric,(v->>'notary_fee')::numeric,(v->>'security_fee')::numeric,
    coalesce((v->>'other_deductions_total')::numeric,0),(v->>'total_deductions')::numeric,
    (v->>'net_released')::numeric,(v->>'total_interest')::numeric,(v->>'total_interest')::numeric,
    (v->>'total_loan')::numeric,(v->>'monthly_amortization')::numeric,(v->>'release_date')::date,
    (v->>'first_payment_date')::date,coalesce((v->>'due_day')::integer,10),v->>'loan_type_name',
    v->>'payment_frequency',auth.uid()) returning id into computation_id;
  insert into public.masterlist (loan_application_id,borrower_id,computation_id,loan_account_no,
    borrower_no,borrower_name,loan_amount,principal,total_loan,net_released,monthly_amortization,terms,
    release_date,first_payment_date,loan_type_name,manning_agency,vessel_name,outstanding_balance,segment)
  values (app_id,b.id,computation_id,loan_no,b.borrower_no,
    concat_ws(' ',b.first_name,b.middle_name,b.last_name,b.suffix),(v->>'principal')::numeric,
    (v->>'principal')::numeric,(v->>'total_loan')::numeric,(v->>'net_released')::numeric,
    (v->>'monthly_amortization')::numeric,(v->>'terms')::integer,(v->>'release_date')::date,
    (v->>'first_payment_date')::date,v->>'loan_type_name',v->>'manning_agency',v->>'vessel_name',
    opening,v->>'segment') returning id into master_id;
  for line in select value from jsonb_array_elements(schedules) loop
    due := (line->>'due_date')::date;
    periods := greatest(0,(date_part('year',age(snapshot,due))*12+date_part('month',age(snapshot,due)))::integer);
    insert into public.amortization_schedules (masterlist_id,installment_no,due_date,amount_due,
      penalty_amount,amount_paid,status,line_type,penalty_periods_applied,legacy_balance_as_of,legacy_penalty_baseline)
    values (master_id,(line->>'installment_no')::integer,due,(line->>'amount_due')::numeric,
      (line->>'penalty_amount')::numeric,0,case when due<snapshot then 'overdue' else 'pending' end,
      line->>'line_type',periods,snapshot,(line->>'penalty_amount')::numeric);
  end loop;
  insert into public.legacy_import_runs (file_name,segment,mapping,total_rows,valid_rows,status,results)
  values (p_file_name,v->>'segment',p_mapping,1,1,'imported',jsonb_build_array(jsonb_build_object(
    'rowNumber',p_account->'rowNumber','loanNo',loan_no,'masterlistId',master_id,'borrowerId',b.id)))
  returning id into run_id;
  perform public.audit_legacy_import(run_id,master_id);
  return jsonb_build_object('masterlistId',master_id,'borrowerId',b.id,'runId',run_id);
end;
$function$;
revoke all on function public.import_legacy_active_account(jsonb,text,jsonb) from public,anon;
grant execute on function public.import_legacy_active_account(jsonb,text,jsonb) to authenticated;
