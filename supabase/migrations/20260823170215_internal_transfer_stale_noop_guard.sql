-- Guards post_internal_transfer against confirming a transfer whose target
-- account has already been fully settled through another channel (a real
-- payment, a write-off, or a different internal transfer) while this one
-- sat pending. Without this check the function would still "succeed" —
-- returning newBalance: 0 and flipping the transfer to posted — while doing
-- nothing: the open-installments loop finds zero rows, so zero allocation
-- rows get created and the balance write is a no-op (already 0). AR would
-- see "posted ✓" with no sign it accomplished nothing.
--
-- The fix is a single early-exit raise exception, placed right after the
-- target masterlist row is locked and before any work happens — same
-- pattern as the existing "already posted"/"already rejected" guards. A
-- stale transfer caught by this now has to be resolved via Reject (with a
-- reason) instead, which is the same flow AR already uses.
--
-- Everything else in the function is unchanged from
-- 20260821080000_internal_transfer_atomic_functions.sql.

create or replace function public.post_internal_transfer(
  p_transfer_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  v_remaining := v_transfer.amount;

  for v_inst in
    select id, amount_due, penalty_amount, amount_paid
    from amortization_schedules
    where masterlist_id = v_transfer.target_masterlist_id
      and status in ('pending', 'partial', 'overdue')
    order by installment_no
  loop
    exit when v_remaining <= 0;

    v_total_due := round(v_inst.amount_due + coalesce(v_inst.penalty_amount, 0), 2);
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
$$;

revoke execute on function public.post_internal_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_internal_transfer(uuid, uuid) to service_role;
