-- All writes roll back. Explicit borrower numbers avoid sequence changes.
begin;
do $test$
declare actor uuid; payload jsonb; result jsonb; m uuid; a uuid; segment text; state text; rejected boolean;
begin
  select ur.user_id into actor from public.user_roles ur join public.roles r on r.id=ur.role_id
    where r.slug='super_admin' and r.is_active limit 1;
  if actor is null then raise exception 'No super-admin test actor'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  foreach segment in array array['seafarer','sme','individual'] loop
    foreach state in array array['paid','active'] loop
      payload:=jsonb_build_object('rowNumber',2,'values',jsonb_build_object(
        'legacy_loan_no','MCP-PAID-SOURCE-'||segment||'-'||state,
        'legacy_borrower_no','MCP-PAID-B-'||segment||'-'||state,
        'first_name','Source','last_name','Test','email','mcp-paid-'||segment||'-'||state||'@example.invalid',
        'segment',segment,'entity_type',case when segment='sme' then 'individual' else null end,
        'individual_loan_type',case when segment='individual' then 'mpl' else null end,
        'account_status',state,'closed_at',case when state='paid' then current_date-1 else null end,
        'balance_as_of',current_date,'outstanding_balance',case when state='paid' then 0 else 1200 end,
        'input_amount',1000,'principal',1000,'total_loan',1200,'total_interest',200,'net_released',970,
        'monthly_amortization',600,'processing_fee',30,'notary_fee',0,'security_fee',0,'admin_cost',0,
        'doc_stamp',0,'total_deductions',30,'interest_rate',0.2,'pf_rate',0.03,'terms',2,
        'schedule_type','monthly','payment_schedule','monthly','payment_frequency','monthly'),
        'settledSource',jsonb_build_object('count',2,'originalAmount',1200),
        'installments',case when state='paid' then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object('installment_no',1,'due_date',current_date+30,'amount_due',1200,'penalty_amount',0,'line_type','standard')) end);
      execute 'set local role authenticated';
      if state='paid' then
        rejected:=false;
        begin
          perform public.import_legacy_active_account(jsonb_set(payload,'{settledSource,originalAmount}','600'),'incomplete.xlsx','[]');
        exception when raise_exception then rejected:=true;
        end;
        if not rejected then raise exception 'Incomplete settled source was accepted'; end if;
      end if;
      result:=public.import_legacy_active_account(payload,'paid-source-test.xlsx','[]');
      execute 'reset role';
      m:=(result->>'masterlistId')::uuid;
      select loan_application_id into a from public.masterlist where id=m;
      if not (select is_legacy_import from public.masterlist where id=m) then raise exception 'Missing source marker'; end if;
      if exists(select 1 from public.payments where masterlist_id=m) then raise exception 'Invented historical receipt'; end if;
      if state='paid' then
        if (select account_status from public.masterlist where id=m)<>'paid'
          or (select status from public.loan_applications where id=a)<>'paid_off'
          or (select (closed_at at time zone 'Asia/Manila')::date from public.masterlist where id=m)<>current_date-1
          or exists(select 1 from public.amortization_schedules where masterlist_id=m)
          or public.recompute_outstanding_balance(m)<>0 then raise exception 'Invalid paid import'; end if;
      else
        if public.recompute_outstanding_balance(m)<>1200 then raise exception 'Invalid unpaid import'; end if;
      end if;
      begin
        execute 'set local role authenticated';
        perform public.import_legacy_active_account(payload,'duplicate.xlsx','[]');
        raise exception 'Duplicate accepted';
      exception when unique_violation then null;
      end;
      execute 'reset role';
    end loop;
  end loop;
end;
$test$;
rollback;
select 'Paid and unpaid imports across all 3 segments passed; fixture writes rolled back' result;
