-- Penalty breakdown — Phase 4a: record the late-fee portion of every posted
-- payment (Rules 5 & 6, data + report side).
--
-- Rule 6 asks "how much did we collect in late fees this period?" — unanswerable
-- today because a payment posts as one lump. This adds `postings.penalty_amount`
-- and has post_single_dcr_item fill it with a penalty-first split of each
-- allocation: of the amount landing on an installment, the part that covers the
-- fee that was actually owed (net of any waiver that ended up applied at
-- posting, net of what earlier postings already put toward it) is booked as fee
-- income; the rest is loan principal/interest.
--
-- This is the automatic split. The collector-typed override (Rule 5's "the
-- collector types how much") is Phase 4b, alongside the ledger UI pass.
--
-- Surgical scope: one new column on `postings`. Inside post_single_dcr_item the
-- per-allocation `insert into postings` moves to AFTER the Pass A / Pass B
-- schedule update (so the fee split can see the final waiver), and the split is
-- computed from the row's post-update state. `amount_paid`, the Pass A / Pass B
-- thresholds, discount handling, the Phase 3 recompute call, balance recompute
-- and the masterlist update are otherwise byte-for-byte unchanged. No schedule-
-- row column changes. refresh_one_masterlist_aging, recompute_account_penalties,
-- post_internal_transfer, recompute_outstanding_balance are untouched.

alter table public.postings
  add column if not exists penalty_amount numeric not null default 0;

comment on column public.postings.penalty_amount is
  'Phase 4a: the late-fee portion of this posting row''s `amount`, split '
  'penalty-first by post_single_dcr_item from the installment''s owed-fee state '
  'after posting. Sum over a period = late fees collected (metric '
  'money.penaltyIncome). Independent of amount_paid and of the schedule row''s '
  'own penalty_amount.';

create or replace function public.post_single_dcr_item(p_dcr_id uuid, p_payment_id uuid, p_allocations jsonb, p_actor_id uuid, p_now timestamp with time zone)
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
  v_sched_found boolean;
  v_pen_paid numeric;
  v_pen_already numeric;
  v_final_pen numeric;
  v_final_pdisc numeric;
  v_total_due_a numeric;
  v_total_due_b numeric;
  v_new_paid numeric;
  v_new_balance numeric;
  v_fully_settled boolean;
  v_dcr_item record;
  v_interest_count int;
  v_penalty_count int;
  v_interest_share numeric;
  v_penalty_share numeric;
  v_pass_b_interest_term numeric;
begin
  select * into v_payment
  from payments
  where id = p_payment_id
  for update;

  if not found or v_payment.status = 'posted' then
    return jsonb_build_object('skipped', true);
  end if;

  v_masterlist_id := v_payment.masterlist_id;

  select
    coalesce(interest_discount_amount, 0) as interest_discount_amount,
    coalesce(interest_discounted_installment_nos, '{}') as interest_discounted_installment_nos,
    coalesce(penalty_discount_amount, 0) as penalty_discount_amount,
    coalesce(penalty_discounted_installment_nos, '{}') as penalty_discounted_installment_nos
  into v_dcr_item
  from dcr_items
  where dcr_id = p_dcr_id and payment_id = p_payment_id;

  v_interest_count := coalesce(array_length(v_dcr_item.interest_discounted_installment_nos, 1), 0);
  v_penalty_count := coalesce(array_length(v_dcr_item.penalty_discounted_installment_nos, 1), 0);

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_schedule_id := nullif(v_alloc ->> 'amortizationScheduleId', '')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;
    v_sched_found := false;
    v_pen_paid := 0;

    if v_schedule_id is not null then
      select id, installment_no, due_date, amount_due, amount_paid, penalty_amount, discount_amount, status
      into v_schedule
      from amortization_schedules
      where id = v_schedule_id
      for update;
      v_sched_found := found;
    end if;

    if v_sched_found then
      v_interest_share := case
        when v_interest_count > 0
          and v_schedule.installment_no = any(v_dcr_item.interest_discounted_installment_nos)
        then public.half_up(v_dcr_item.interest_discount_amount / v_interest_count)
        else 0
      end;
      v_penalty_share := case
        when v_penalty_count > 0
          and v_schedule.installment_no = any(v_dcr_item.penalty_discounted_installment_nos)
        then public.half_up(v_dcr_item.penalty_discount_amount / v_penalty_count)
        else 0
      end;

      -- Pass A — unmodified from the pre-existing formula.
      v_total_due_a := greatest(0, public.half_up(
        coalesce(v_schedule.amount_due, 0)
        - coalesce(v_schedule.discount_amount, 0)
        + coalesce(v_schedule.penalty_amount, 0)
      ));

      v_new_paid := coalesce(v_schedule.amount_paid, 0) + v_amount;

      if v_new_paid >= v_total_due_a then
        update amortization_schedules
        set amount_paid = v_new_paid,
            status = 'paid',
            paid_at = p_now
        where id = v_schedule_id;
      else
        v_pass_b_interest_term := case
          when v_interest_share > 0 then v_interest_share
          else coalesce(v_schedule.discount_amount, 0)
        end;

        v_total_due_b := greatest(0, public.half_up(
          coalesce(v_schedule.amount_due, 0)
          - v_pass_b_interest_term
          + coalesce(v_schedule.penalty_amount, 0)
          - v_penalty_share
        ));

        if v_new_paid >= v_total_due_b then
          update amortization_schedules
          set amount_paid = v_new_paid,
              status = 'paid',
              paid_at = p_now,
              discount_amount = case when v_interest_share > 0 then v_interest_share else discount_amount end,
              discount_source = case when v_interest_share > 0 then 'collector' else discount_source end,
              penalty_discount_amount = case when v_penalty_share > 0 then v_penalty_share else penalty_discount_amount end
          where id = v_schedule_id;
        else
          update amortization_schedules
          set amount_paid = v_new_paid,
              status = 'partial'
          where id = v_schedule_id;
        end if;
      end if;

      -- Phase 4a — penalty-first split of this allocation. An on-time payment
      -- (on/before this installment's due date) never carries a fee portion —
      -- recompute_account_penalties will zero the fee itself right after this
      -- loop (Rule 4a); recording a fee here would leave a stale figure on the
      -- posting row. Otherwise: the fee still owed on the row (FINAL state,
      -- after any waiver applied above), net of what earlier postings already
      -- put toward this installment's fee.
      if v_payment.payment_date <= v_schedule.due_date then
        v_pen_paid := 0;
      else
        select coalesce(sum(penalty_amount), 0)
        into v_pen_already
        from postings
        where amortization_schedule_id = v_schedule_id;

        select coalesce(penalty_amount, 0), coalesce(penalty_discount_amount, 0)
        into v_final_pen, v_final_pdisc
        from amortization_schedules
        where id = v_schedule_id;

        v_pen_paid := least(
          v_amount,
          greatest(0, v_final_pen - v_final_pdisc - v_pen_already)
        );
      end if;
    end if;

    insert into postings (
      dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount,
      penalty_amount, posted_by, posted_at
    ) values (
      p_dcr_id, p_payment_id, v_masterlist_id, v_schedule_id, v_amount,
      v_pen_paid, p_actor_id, p_now
    );
  end loop;

  update payments
  set status = 'posted',
      reviewed_by = p_actor_id,
      reviewed_at = p_now,
      flagged_reason = null,
      flagged_at = null
  where id = p_payment_id;

  -- Phase 3 — re-derive late fees now that this payment has landed.
  perform public.recompute_account_penalties(v_masterlist_id);

  v_new_balance := public.recompute_outstanding_balance(v_masterlist_id);
  v_fully_settled := public.is_account_fully_settled(v_masterlist_id);

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 and v_fully_settled then 'paid' else 'active' end
  where id = v_masterlist_id;

  return jsonb_build_object('skipped', false, 'newBalance', v_new_balance);
end;
$function$;
