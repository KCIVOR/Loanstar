-- Guards post_internal_transfer against posting a transfer for more than
-- the target account actually owes. Nowhere upstream (the CSA/Committee
-- computation screen, the save routes, or LRA release) ever checked a
-- deduction amount against the target's real balance — the screen could
-- construct an inflated number (see the "Which months to cover" popup's
-- Math.max(3, ...) floor bug, and the freely-editable "Other Loan" amount
-- field), and even a correct number at save-time could go stale by the time
-- AR actually confirms it, since the target's balance can drop in between
-- (a real payment, another transfer). Without this check,
-- post_internal_transfer would silently floor the target's balance at zero
-- and post successfully, quietly discarding the excess from the source
-- borrower's proceeds with no error and no audit trail.
--
-- The fix is one more early-exit raise exception, placed right after the
-- existing no-op guard (target already has no balance) and before the
-- allocation loop — same pattern as that guard. Only fires when the amount
-- strictly exceeds the balance; paying less than or equal to what's owed
-- (the normal case, including an exact full payoff) is unaffected.
--
-- Everything else in the function is unchanged from
-- 20260823170215_internal_transfer_stale_noop_guard.sql.

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

  if v_transfer.amount > v_ml.outstanding_balance then
    raise exception 'Transfer amount % exceeds the target account current balance of % — reject this transfer and ask for a recomputed amount', v_transfer.amount, v_ml.outstanding_balance;
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
