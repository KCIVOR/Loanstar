-- Phase 5 (see docs/ledger-balance-consistency-fix-implementation-plan.md,
-- F6 non-balance half): postSingleDcrItem performed, sequentially, with no
-- transaction: insert posting(s) -> update schedule(s) -> update payment
-- status -> recompute+update masterlist balance. A crash partway left a
-- durable inconsistent state, and the idempotency guard
-- (`payment.status === "posted"`) only became true on the LAST step, so a
-- retry after a mid-sequence failure re-ran everything from the top —
-- including re-inserting the posting row(s) and double-crediting the
-- (now-derived) balance.
--
-- This function wraps the entire write sequence in one Postgres function —
-- a single function body is one transaction by default, so a failure at any
-- point rolls back everything. The idempotency check is the FIRST statement
-- (locked via `for update`), so a retry after any failure — including one
-- that already completed writes but crashed before the caller saw success —
-- is a guaranteed no-op.
--
-- Allocation determination (reading stored allocations, or computing
-- computeAutoAllocation) stays in TypeScript — it's a pure/read-only step,
-- untouched by this migration. Only the write sequence moves here, and the
-- balance math is unchanged: it delegates to
-- public.recompute_outstanding_balance, the same function Phase 4 wired
-- into every other posting path.
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
        -- Same formula as netInstallmentDue (TS) — amount_due - discount +
        -- penalty, floored at 0. amount_paid is intentionally NOT part of
        -- this total (matches postSingleDcrItem's original totalDue call,
        -- which omits amountPaid); v_new_paid is compared against it below.
        v_total_due := greatest(0, public.half_up(
          coalesce(v_schedule.amount_due, 0)
          - coalesce(v_schedule.discount_amount, 0)
          + coalesce(v_schedule.penalty_amount, 0)
        ));
        -- Deliberately unrounded, matching the original TS
        -- (`Number(schedule.amount_paid) + Number(line.amount)`) exactly —
        -- this migration relocates the logic, it does not re-derive it.
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

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 then 'paid' else 'active' end
  where id = v_masterlist_id;

  return jsonb_build_object('skipped', false, 'newBalance', v_new_balance);
end;
$function$;
