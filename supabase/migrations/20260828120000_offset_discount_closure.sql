-- Phase 6 of the loan discounts feature — Offset early-settlement discount
-- takes effect atomically at the moment `post_internal_transfer` posts, never
-- at transfer creation: a rejected transfer must never leave a stray
-- discount sitting on the target loan's installments.
--
-- See docs/revision-plans/feature-loan-discounts-implementation-plan.md,
-- Phase 6 (rewritten during validation after reading the live RPC — it does
-- not compute a payoff figure, it walks unpaid installments oldest-first
-- against a fixed `amount`, so the discount has to be reflected in what each
-- row *needs* to close, not just in the total handed to the function).

-- Two new columns carry the discount detail from the computation's
-- otherLoans[] entry (Phase 5) through to the transfer row. Both default to
-- "no discount" so every existing/ordinary transfer is unaffected.
alter table public.internal_transfers
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists discounted_installment_nos integer[] not null default '{}';

-- Rebuilt from the live definition (confirmed via pg_get_functiondef
-- immediately before writing this, not hand-reconstructed from an older
-- migration file) — same care as the Fix #9 aging-function migration and
-- Phase 3's reversion migration.
CREATE OR REPLACE FUNCTION public.post_internal_transfer(p_transfer_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer record;
  v_ml record;
  v_now timestamptz := now();
  v_remaining numeric;
  v_new_balance numeric;
  v_inst record;
  v_total_due numeric;
  v_new_paid numeric;
  v_applied numeric;
  v_discount_nos integer[];
  v_n int;
  v_per_row numeric;
  v_idx int;
  v_installment_no int;
begin
  select * into v_transfer
  from internal_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.status <> 'pending' then
    raise exception 'Transfer is already % — cannot post again', v_transfer.status;
  end if;

  select * into v_ml
  from masterlist
  where id = v_transfer.target_masterlist_id
  for update;

  if not found then
    raise exception 'Target account not found';
  end if;

  if v_ml.outstanding_balance <= 0 then
    raise exception 'Target account already has no outstanding balance — posting this transfer would have no effect. Reject it instead.';
  end if;

  if v_transfer.amount > v_ml.outstanding_balance then
    raise exception 'Transfer amount % exceeds the target account current balance of % — reject this transfer and ask for a recomputed amount', v_transfer.amount, v_ml.outstanding_balance;
  end if;

  -- Early-settlement discount (Phase 5/6). Sorted ascending so the "oldest
  -- selected row absorbs the one-month termination fee, the rest split the
  -- net discount evenly" reconstruction below lines up with Rule 3 exactly
  -- — valid because every future installment of one loan carries identical
  -- interest (Phase 4's even-split convention), so the aggregate net figure
  -- already stored on the transfer divides back out exactly with no
  -- rounding drift.
  select array_agg(x order by x) into v_discount_nos
  from unnest(coalesce(v_transfer.discounted_installment_nos, '{}')) as x;
  v_n := coalesce(array_length(v_discount_nos, 1), 0);

  if v_n > 0 then
    -- Rule 7: any origination discount on these same rows is voided first —
    -- the two discounts must never be summed on one installment.
    update amortization_schedules
    set discount_amount = 0
    where masterlist_id = v_transfer.target_masterlist_id
      and installment_no = any(v_discount_nos);

    if v_n > 1 then
      v_per_row := round(v_transfer.discount_amount / (v_n - 1), 2);
      v_idx := 0;
      foreach v_installment_no in array v_discount_nos
      loop
        v_idx := v_idx + 1;
        if v_idx = 1 then
          continue; -- fee-absorbing row: stays at the 0 just set above
        end if;
        update amortization_schedules
        set discount_amount = v_per_row
        where masterlist_id = v_transfer.target_masterlist_id
          and installment_no = v_installment_no;
      end loop;
    end if;
  end if;

  v_remaining := v_transfer.amount;

  for v_inst in
    select id, amount_due, penalty_amount, amount_paid, coalesce(discount_amount, 0) as discount_amount
    from amortization_schedules
    where masterlist_id = v_transfer.target_masterlist_id
      and status in ('pending', 'partial', 'overdue')
    order by installment_no
  loop
    exit when v_remaining <= 0;

    v_total_due := round(v_inst.amount_due + coalesce(v_inst.penalty_amount, 0) - v_inst.discount_amount, 2);
    v_applied := least(v_remaining, round(v_total_due - v_inst.amount_paid, 2));
    if v_applied <= 0 then
      continue;
    end if;

    v_new_paid := round(v_inst.amount_paid + v_applied, 2);

    update amortization_schedules
    set amount_paid = v_new_paid,
        status = case when v_new_paid >= v_total_due then 'paid' else 'partial' end,
        paid_at = case when v_new_paid >= v_total_due then v_now else null end
    where id = v_inst.id;

    insert into internal_transfer_allocations (internal_transfer_id, amortization_schedule_id, amount)
    values (p_transfer_id, v_inst.id, v_applied);

    v_remaining := round(v_remaining - v_applied, 2);
  end loop;

  v_new_balance := greatest(0, round(v_ml.outstanding_balance - v_transfer.amount, 2));

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 then 'paid' else 'active' end
  where id = v_transfer.target_masterlist_id;

  update internal_transfers
  set status = 'posted',
      reviewed_by = p_actor_id,
      reviewed_at = v_now
  where id = p_transfer_id;

  return jsonb_build_object('newBalance', v_new_balance, 'postedAt', v_now);
end;
$function$;
