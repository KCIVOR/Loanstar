-- Atomic confirm/reject for internal transfers. postInternalTransfer was
-- previously a sequence of separate JS-side reads/writes with no transaction
-- and no row locking: a failure partway through left a `pending` transfer
-- with some installments already updated, and a retry would re-spend the
-- full amount (double-allocation). Two concurrent confirms on the same
-- account could also race on the balance read (lost update). Moving the
-- whole sequence into one plpgsql function makes it genuinely all-or-nothing
-- (any exception rolls back everything), and `for update` locks on both the
-- transfer and the target account row serialize concurrent calls instead of
-- racing. reject_internal_transfer gets the same lock-then-check-then-write
-- treatment, closing a sibling race where a reject could silently overwrite
-- an already-posted transfer.
--
-- Both are locked down to service_role only — unlike several existing
-- SECURITY DEFINER helpers in this project, these perform real financial
-- mutations, so anon/authenticated execute is explicitly revoked.

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

create or replace function public.reject_internal_transfer(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
  v_now timestamptz := now();
begin
  select * into v_transfer
  from internal_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.status <> 'pending' then
    raise exception 'Transfer is already % — cannot reject', v_transfer.status;
  end if;

  update internal_transfers
  set status = 'rejected',
      rejection_reason = p_reason,
      reviewed_by = p_actor_id,
      reviewed_at = v_now
  where id = p_transfer_id;

  return jsonb_build_object('rejectedAt', v_now);
end;
$$;

revoke execute on function public.reject_internal_transfer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_internal_transfer(uuid, uuid, text) to service_role;
