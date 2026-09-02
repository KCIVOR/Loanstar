-- Phase 6 (F8, see docs/ledger-balance-consistency-fix-implementation-plan.md):
-- post_single_dcr_item's account_status assignment now also requires
-- public.is_account_fully_settled — a 0 derived balance alone doesn't mean
-- the account is done; a row can net to 0 while still sitting open. Only
-- the account_status line changes; everything else is unchanged from the
-- Phase 5 version.
create or replace function public.post_single_dcr_item(
  p_dcr_id uuid,
  p_payment_id uuid,
  p_allocations jsonb,
  p_actor_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment record;
  v_masterlist_id uuid;
  v_alloc jsonb;
  v_schedule_id uuid;
  v_amount numeric;
  v_schedule record;
  v_total_due numeric;
  v_new_paid numeric;
  v_paid boolean;
  v_new_balance numeric;
  v_fully_settled boolean;
begin
  select * into v_payment
  from payments
  where id = p_payment_id
  for update;

  if not found or v_payment.status = 'posted' then
    return jsonb_build_object('skipped', true);
  end if;

  v_masterlist_id := v_payment.masterlist_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_schedule_id := nullif(v_alloc ->> 'amortizationScheduleId', '')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;

    insert into postings (
      dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at
    ) values (
      p_dcr_id, p_payment_id, v_masterlist_id, v_schedule_id, v_amount, p_actor_id, p_now
    );

    if v_schedule_id is not null then
      select id, amount_due, amount_paid, penalty_amount, discount_amount, status
      into v_schedule
      from amortization_schedules
      where id = v_schedule_id
      for update;

      if found then
        v_total_due := greatest(0, public.half_up(
          coalesce(v_schedule.amount_due, 0)
          - coalesce(v_schedule.discount_amount, 0)
          + coalesce(v_schedule.penalty_amount, 0)
        ));
        v_new_paid := coalesce(v_schedule.amount_paid, 0) + v_amount;
        v_paid := v_new_paid >= v_total_due;

        update amortization_schedules
        set amount_paid = v_new_paid,
            status = case when v_paid then 'paid' else 'partial' end,
            paid_at = case when v_paid then p_now else null end
        where id = v_schedule_id;
      end if;
    end if;
  end loop;

  update payments
  set status = 'posted',
      reviewed_by = p_actor_id,
      reviewed_at = p_now,
      flagged_reason = null,
      flagged_at = null
  where id = p_payment_id;

  v_new_balance := public.recompute_outstanding_balance(v_masterlist_id);
  v_fully_settled := public.is_account_fully_settled(v_masterlist_id);

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 and v_fully_settled then 'paid' else 'active' end
  where id = v_masterlist_id;

  return jsonb_build_object('skipped', false, 'newBalance', v_new_balance);
end;
$function$;
