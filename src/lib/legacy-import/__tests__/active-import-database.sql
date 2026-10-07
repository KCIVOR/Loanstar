-- Run via MCP execute_sql. All fixture writes roll back; no real users created.
begin;
do $test$
declare actor uuid; target uuid; payload jsonb; result jsonb; m uuid; a uuid; b uuid;
  s uuid; p uuid; d uuid; linked record; segment text; before_count bigint; expected numeric;
begin
  select ur.user_id into actor from public.user_roles ur join public.roles r on r.id=ur.role_id
    where r.slug='super_admin' and r.is_active limit 1;
  if actor is null then raise exception 'No super-admin test actor'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  foreach segment in array array['seafarer','sme','individual'] loop
    payload:=jsonb_build_object('rowNumber',2,'values',jsonb_build_object(
      'legacy_loan_no','MCP-E2E-20261007-'||segment,'legacy_borrower_no','MCP-E2E-B-'||segment,
      'first_name','Migration','last_name','Test','email','mcp-e2e-'||segment||'@example.invalid',
      'segment',segment,'entity_type',case when segment='sme' then 'individual' else null end,
      'business_name',case when segment='sme' then 'Test Business' else null end,
      'individual_loan_type',case when segment='individual' then 'mpl' else null end,
      'balance_as_of',current_date,'outstanding_balance',850,'input_amount',1000,'principal',1000,
      'total_loan',1200,'total_interest',200,'net_released',970,'monthly_amortization',600,
      'processing_fee',30,'notary_fee',0,'security_fee',0,'admin_cost',0,'doc_stamp',0,
      'total_deductions',30,'interest_rate',0.2,'pf_rate',0.03,'terms',2,'schedule_type','monthly',
      'payment_schedule','monthly','payment_frequency','monthly'), 'installments',jsonb_build_array(
      jsonb_build_object('installment_no',1,'due_date',current_date-40,'amount_due',200,'penalty_amount',50,'line_type','standard'),
      jsonb_build_object('installment_no',2,'due_date',current_date+30,'amount_due',600,'penalty_amount',0,'line_type','standard')));
    execute 'set local role authenticated';
    result:=public.import_legacy_active_account(payload,'mcp-e2e-rollback.xlsx','[]');
    execute 'reset role';
    m:=(result->>'masterlistId')::uuid; b:=(result->>'borrowerId')::uuid;
    select loan_application_id into a from public.masterlist where id=m;
    if (select user_id from public.borrowers where id=b) is not null then raise exception 'Unexpected login'; end if;
    if exists(select 1 from public.payments where masterlist_id=m) then raise exception 'Historical receipt fabricated'; end if;
    perform public.recompute_account_penalties(m);
    perform public.refresh_one_masterlist_aging(m,current_date);
    if public.recompute_outstanding_balance(m)<>850 then raise exception 'Baseline changed for %',segment; end if;
    -- Verify a failure halfway through the transaction leaves no new borrower.
    select count(*) into before_count from public.borrowers;
    begin
      execute 'set local role authenticated';
      perform public.import_legacy_active_account(jsonb_set(jsonb_set(jsonb_set(payload,
        '{values,legacy_loan_no}',to_jsonb('MCP-E2E-BAD-'||segment)),
        '{values,legacy_borrower_no}',to_jsonb('MCP-E2E-BAD-B-'||segment)),
        '{installments,1,installment_no}','1'), 'invalid.xlsx','[]');
      raise exception 'Duplicate installment was accepted';
    exception when unique_violation then null;
    end;
    execute 'reset role';
    if (select count(*) from public.borrowers)<>before_count then raise exception 'Partial borrower persisted'; end if;
    -- Real payment-posting function, followed by repeat posting (idempotent).
    select id into s from public.amortization_schedules where masterlist_id=m and installment_no=1;
    insert into public.dcr(collector_user_id) values(actor) returning id into d;
    insert into public.payments(masterlist_id,loan_application_id,borrower_id,payment_date,amount,channel,uploaded_by)
      values(m,a,b,current_date,100,'bank_deposit',actor) returning id into p;
    insert into public.dcr_items(dcr_id,payment_id,amount) values(d,p,100);
    result:=public.post_single_dcr_item(d,p,jsonb_build_array(jsonb_build_object('amortizationScheduleId',s,'amount',100)),actor,now());
    if (result->>'newBalance')::numeric<>750 then raise exception 'Payment did not reduce balance for %: %',segment,result; end if;
    perform public.post_single_dcr_item(d,p,jsonb_build_array(jsonb_build_object('amortizationScheduleId',s,'amount',100)),actor,now());
    if (select outstanding_balance from public.masterlist where id=m)<>750 then raise exception 'Payment posted twice'; end if;
    -- Connect only the temporary loan to a linked borrower; target is read-only.
    select id into target from public.borrowers where user_id is not null limit 1;
    if target is null then raise exception 'No portal-linked borrower available for rollback connection test'; end if;
    select * into linked from public.connect_application_to_borrower_account(a,target,actor);
    if (select borrower_id from public.masterlist where id=m)<>target
      or (select borrower_id from public.payments where id=p)<>target then raise exception 'Connection did not propagate'; end if;
    -- NULL baselines: normal schedule still accrues the existing monthly rate.
    insert into public.amortization_schedules(masterlist_id,installment_no,due_date,amount_due,penalty_periods_applied)
      values(m,99,current_date-40,1000,1) returning id into s;
    perform public.recompute_account_penalties(m);
    expected:=public.half_up(1000*public.penalty_rate_for_segment(segment));
    if (select penalty_amount from public.amortization_schedules where id=s)<>expected then raise exception 'Ordinary penalty regression'; end if;
  end loop;
end;
$test$;
rollback;
select 'All 3 segments: import, rollback, payments, retry, linking, baseline and ordinary penalties passed' result;
