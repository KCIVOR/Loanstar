-- Task 2 (Sept-04 sprint) — a full offset must close the target loan.
-- See docs/revision-plans/task-02-offset-full-settlement-plan.md, Phase 1.
--
-- Root cause (live-verified on AN300442): for a full-settlement offset
-- (transfer_type = 'other_loan') the previous version split the
-- early-settlement discount EVENLY across the ticked installments
-- (v_per_row = discount_amount / (v_n - 1)). On a weekly / Special / balloon
-- schedule the ticked rows are wildly unequal — many small interest rows plus
-- one large principal row — so the even split dumped far more discount on the
-- small rows than they owed (a row floors at 0, so the excess evaporated) and
-- starved the balloon row. The cash amount, computed as (balance - netDiscount),
-- then came up short by the wasted discount and the loan stayed 'active'.
--
-- This version, for transfer_type = 'other_loan' only:
--   1. Distributes the discount GREEDILY, capped at each row's own remaining
--      owed, carrying the unused remainder to the next row — nothing wasted,
--      the balloon row absorbs what the small rows cannot. Principal rows
--      (line_type = 'principal') are never discounted; the earliest ticked
--      not-yet-due row is left at full charge as the one-month termination fee
--      (Aug-25 meeting rule).
--   2. Re-trues the cash against the LIVE balance at posting time, not the
--      frozen CSA figure: required_cash = live_balance - discount_applied.
--   3. BLOCKS (raises) when the offset cannot cover required_cash — AR rejects
--      and asks CSA for a recomputed amount (client decision 2026-09-08).
--   4. Force-marks every fully-covered row 'paid' so is_account_fully_settled
--      passes (a row whose discount already covers it never enters the
--      waterfall), and absorbs any sub-peso rounding residue so the loan lands
--      on exactly 0.
--
-- The transfer_type = 'offset' (partial payment) path is preserved
-- byte-for-byte: same amount-exceeds-balance guard, same even-split block
-- (a no-op there since partial offsets carry no discount), same waterfall,
-- same close logic. recompute_outstanding_balance and is_account_fully_settled
-- are untouched.

create or replace function public.post_internal_transfer(p_transfer_id uuid, p_actor_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_transfer record;
  v_ml record;
  v_now timestamptz := now();
  v_remaining numeric;
  v_new_balance numeric;
  v_fully_settled boolean;
  v_inst record;
  v_total_due numeric;
  v_new_paid numeric;
  v_applied numeric;
  v_discount_nos integer[];
  v_n int;
  v_per_row numeric;
  v_idx int;
  v_installment_no int;
  -- Task 2 (full settlement) locals
  v_is_full_settlement boolean;
  v_discount_budget numeric;
  v_discount_applied numeric := 0;
  v_this_disc numeric;
  v_required_cash numeric;
  v_largest_row numeric;
  v_principal numeric;
  v_balloon_no int;
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

  v_is_full_settlement := (v_transfer.transfer_type = 'other_loan');

  select array_agg(x order by x) into v_discount_nos
  from unnest(coalesce(v_transfer.discounted_installment_nos, '{}')) as x;
  v_n := coalesce(array_length(v_discount_nos, 1), 0);

  --------------------------------------------------------------------
  -- Discount distribution
  --------------------------------------------------------------------
  if v_is_full_settlement and v_n > 0 then
    -- Task 2: greedy cap-and-carry (replaces the even split).
    update amortization_schedules
    set discount_amount = 0
    where masterlist_id = v_transfer.target_masterlist_id
      and installment_no = any(v_discount_nos);

    -- Budget = the CSA-computed discount, but never more than
    -- (live balance - the single largest unpaid installment). On a
    -- weekly/Special/balloon schedule the largest row IS the principal, so
    -- this keeps principal from ever being waived even if the modal (pre
    -- Phase 2) still let a principal/balloon row be ticked. On an ordinary
    -- equal-row schedule the cap is far above any real interest discount, so
    -- it never interferes.
    select coalesce(max(amount_due), 0)
    into v_largest_row
    from amortization_schedules
    where masterlist_id = v_transfer.target_masterlist_id
      and status in ('pending', 'partial', 'overdue');

    -- The principal-balloon row on a weekly/invoice schedule is line_type
    -- 'standard', so it can't be excluded structurally the way a dual-line
    -- 'principal' row can. Identify it here: the largest unpaid row when its
    -- amount is at/above the loan's principal. Never discounted.
    select c.principal into v_principal
    from computations c
    where c.id = v_ml.computation_id;

    if v_principal is not null and v_largest_row >= v_principal * 0.99 then
      select installment_no into v_balloon_no
      from amortization_schedules
      where masterlist_id = v_transfer.target_masterlist_id
        and status in ('pending', 'partial', 'overdue')
        and amount_due = v_largest_row
      order by installment_no desc
      limit 1;
    end if;

    v_discount_budget := least(
      coalesce(v_transfer.discount_amount, 0),
      greatest(0, round(v_ml.outstanding_balance - v_largest_row, 2))
    );
    v_idx := 0;
    for v_inst in
      select id, installment_no,
             round(amount_due + coalesce(penalty_amount, 0) - coalesce(amount_paid, 0), 2) as net_owed
      from amortization_schedules
      where masterlist_id = v_transfer.target_masterlist_id
        and installment_no = any(v_discount_nos)
        and status in ('pending', 'partial', 'overdue')
        and line_type <> 'principal'
        and (v_balloon_no is null or installment_no <> v_balloon_no)
      order by installment_no
    loop
      v_idx := v_idx + 1;
      -- earliest ticked not-yet-due row = one-month termination fee, never discounted
      if v_idx = 1 then
        continue;
      end if;
      exit when v_discount_budget - v_discount_applied <= 0;
      v_this_disc := least(v_discount_budget - v_discount_applied, greatest(0, v_inst.net_owed));
      if v_this_disc <= 0 then
        continue;
      end if;
      update amortization_schedules
      set discount_amount = v_this_disc
      where id = v_inst.id;
      v_discount_applied := round(v_discount_applied + v_this_disc, 2);
    end loop;

  elsif v_n > 0 then
    -- UNCHANGED legacy path (transfer_type = 'offset').
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
          continue;
        end if;
        update amortization_schedules
        set discount_amount = v_per_row
        where masterlist_id = v_transfer.target_masterlist_id
          and installment_no = v_installment_no;
      end loop;
    end if;
  end if;

  --------------------------------------------------------------------
  -- Cash amount
  --------------------------------------------------------------------
  if v_is_full_settlement then
    v_required_cash := round(v_ml.outstanding_balance - v_discount_applied, 2);
    if v_required_cash < 0 then
      v_required_cash := 0;
    end if;
    -- Client decision 2026-09-08: block a full settlement that cannot cover
    -- the live balance; AR rejects and asks CSA for a recomputed amount.
    if coalesce(v_transfer.amount, 0) < v_required_cash - 0.01 then
      raise exception
        'This offset provides % but the target loan needs % to close (live balance % less an applicable discount of %). Reject this transfer and ask CSA for a recomputed amount.',
        v_transfer.amount, v_required_cash, v_ml.outstanding_balance, v_discount_applied;
    end if;
    v_remaining := v_required_cash;
  else
    -- UNCHANGED guard + amount for partial offsets.
    if v_transfer.amount > v_ml.outstanding_balance then
      raise exception 'Transfer amount % exceeds the target account current balance of % — reject this transfer and ask for a recomputed amount', v_transfer.amount, v_ml.outstanding_balance;
    end if;
    v_remaining := v_transfer.amount;
  end if;

  --------------------------------------------------------------------
  -- Waterfall (unchanged mechanics)
  --------------------------------------------------------------------
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

  --------------------------------------------------------------------
  -- Task 2: on a full settlement, force every fully-covered row to 'paid'
  -- (a row whose discount already covers it never enters the waterfall),
  -- so is_account_fully_settled can pass.
  --------------------------------------------------------------------
  if v_is_full_settlement then
    update amortization_schedules
    set status = 'paid',
        paid_at = coalesce(paid_at, v_now)
    where masterlist_id = v_transfer.target_masterlist_id
      and status in ('pending', 'partial', 'overdue')
      and round(
            amount_due
            + coalesce(penalty_amount, 0)
            - coalesce(discount_amount, 0)
            - coalesce(penalty_discount_amount, 0)
            - coalesce(amount_paid, 0), 2) <= 0.01;
  end if;

  v_new_balance := public.recompute_outstanding_balance(v_transfer.target_masterlist_id);

  --------------------------------------------------------------------
  -- Task 2: absorb a sub-peso rounding residue so a full settlement lands
  -- on exactly 0 (never leaves a few centavos keeping the loan 'active').
  --------------------------------------------------------------------
  if v_is_full_settlement and v_new_balance > 0 and v_new_balance <= 1.00 then
    update amortization_schedules
    set discount_amount = round(coalesce(discount_amount, 0) + v_new_balance, 2),
        status = 'paid',
        paid_at = coalesce(paid_at, v_now)
    where id = (
      select id
      from amortization_schedules
      where masterlist_id = v_transfer.target_masterlist_id
        and status in ('pending', 'partial', 'overdue')
      order by installment_no desc
      limit 1
    );
    v_new_balance := public.recompute_outstanding_balance(v_transfer.target_masterlist_id);
  end if;

  -- Task 2 Phase 5: "₱0 == Closed" consistency. is_account_fully_settled
  -- (used by the partial path, unchanged) requires every row 'paid'/'rolled',
  -- while recompute_outstanding_balance ignores 'moved' rows too — so a target
  -- with a Move-of-Payment row could derive to 0 yet never flip to 'paid'. For
  -- a FULL settlement, a 'moved' row must not block closure: check the same
  -- exclusion set the balance uses. Team-confirmed default 2026-09-08.
  if v_is_full_settlement then
    v_fully_settled := not exists (
      select 1
      from amortization_schedules
      where masterlist_id = v_transfer.target_masterlist_id
        and status not in ('paid', 'rolled', 'moved')
    );
  else
    v_fully_settled := public.is_account_fully_settled(v_transfer.target_masterlist_id);
  end if;

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 and v_fully_settled then 'paid' else 'active' end
  where id = v_transfer.target_masterlist_id;

  update internal_transfers
  set status = 'posted',
      reviewed_by = p_actor_id,
      reviewed_at = v_now
  where id = p_transfer_id;

  return jsonb_build_object('newBalance', v_new_balance, 'postedAt', v_now);
end;
$function$;
