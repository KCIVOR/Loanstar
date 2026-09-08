-- Penalty breakdown — Phase 3: auto-reverse wrong late fees and recompute on
-- payment (Rules 4a & 4b).
--
-- 4a — borrower paid on time but the receipt arrived late: the nightly job
--      already added a fee. When the payment posts with its real (on/before due)
--      date, the fee is removed.
-- 4b — borrower paid late and only partially: the fee is recomputed from scratch
--      on what is still unpaid, for every whole month elapsed since the due date.
--
-- Mechanism: a new SECURITY DEFINER function recompute_account_penalties(uuid),
-- called as the last schedule-touching step of post_single_dcr_item (the single
-- choke point for applying a payment to the schedule — there is no un-post
-- path). A reduction is recorded as a negative row in `penalties`; a full
-- reversal also stamps `reversed_at` / `reversal_reason` on the original
-- monthly-fee rows. `penalties` is never physically deleted from.
--
-- Surgical scope: adds two nullable columns to `penalties`; adds one new
-- function; inserts ONE `perform` line into post_single_dcr_item. The posting
-- function's allocation loop, discount handling, Pass A / Pass B settlement
-- thresholds, balance recompute and masterlist update are otherwise byte-for-
-- byte unchanged. refresh_one_masterlist_aging, refresh_all_aging,
-- post_internal_transfer, recompute_outstanding_balance, is_account_fully_settled
-- are untouched.

alter table public.penalties
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

comment on column public.penalties.reversed_at is
  'Set when this late-fee row was undone by recompute_account_penalties (Phase 3) '
  'because the installment was actually paid on/before its due date. The undo '
  'amount is booked as a separate negative `penalties` row; this column is audit '
  'metadata only.';

create or replace function public.recompute_account_penalties(p_masterlist_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_segment text;
  v_rate numeric;
  v_now timestamptz := now();
  v_asof date := current_date;
  v_row RECORD;
  v_target_periods int;
  v_ontime_paid numeric;
  v_net_due numeric;
  v_target numeric;
  v_running numeric;
  v_bal numeric;
  v_add numeric;
  v_p int;
  v_delta numeric;
BEGIN
  SELECT segment INTO v_segment FROM public.masterlist WHERE id = p_masterlist_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_rate := public.penalty_rate_for_segment(v_segment);

  FOR v_row IN
    SELECT
      s.id,
      s.installment_no,
      s.due_date,
      s.status,
      COALESCE(s.amount_due, 0) AS amount_due,
      COALESCE(s.discount_amount, 0) AS discount_amount,
      COALESCE(s.penalty_discount_amount, 0) AS penalty_discount_amount,
      COALESCE(s.amount_paid, 0) AS amount_paid,
      COALESCE(s.penalty_amount, 0) AS penalty_amount,
      COALESCE(s.penalty_periods_applied, 0) AS periods_applied
    FROM public.amortization_schedules s
    WHERE s.masterlist_id = p_masterlist_id
      AND s.status <> 'rolled'
      AND s.status <> 'moved'
      AND (v_asof - s.due_date) > 0
      -- only rows the accrual engine has already touched — a pristine past-due
      -- row with no fee yet is left for the nightly cron.
      AND (COALESCE(s.penalty_amount, 0) > 0 OR COALESCE(s.penalty_periods_applied, 0) > 0)
  LOOP
    -- Money applied to this installment by payments dated on/before its due date.
    SELECT COALESCE(SUM(po.amount), 0)
    INTO v_ontime_paid
    FROM public.postings po
    JOIN public.payments pmt ON pmt.id = po.payment_id
    WHERE po.amortization_schedule_id = v_row.id
      AND pmt.payment_date <= v_row.due_date;

    v_net_due := GREATEST(0, v_row.amount_due - v_row.discount_amount);

    IF v_ontime_paid >= v_net_due - 0.005 THEN
      -- Rule 4a — covered on time; the late fee should not exist.
      v_target := 0;
      v_target_periods := 0;
    ELSE
      -- Rule 4b — recompute the compounded fee from scratch on what is STILL
      -- unpaid, one round per whole month elapsed since the due date.
      v_target_periods :=
          (date_part('year',  age(v_asof, v_row.due_date)) * 12
         + date_part('month', age(v_asof, v_row.due_date)))::int;
      v_running := 0;
      FOR v_p IN 1 .. v_target_periods LOOP
        v_bal := GREATEST(
          0,
          v_row.amount_due
          - v_row.discount_amount
          - v_row.penalty_discount_amount
          - v_row.amount_paid
          + v_running
        );
        v_add := public.half_up(v_bal * v_rate);
        EXIT WHEN v_add <= 0;
        v_running := v_running + v_add;
      END LOOP;
      v_target := v_running;
    END IF;

    v_delta := public.half_up(v_target - v_row.penalty_amount);

    IF v_delta = 0 AND v_target_periods = v_row.periods_applied THEN
      CONTINUE;
    END IF;

    UPDATE public.amortization_schedules
    SET
      penalty_amount = v_target,
      penalty_periods_applied = v_target_periods,
      status = CASE
                 WHEN v_row.status = 'paid' THEN 'paid'
                 WHEN v_target > 0 THEN 'overdue'
                 ELSE v_row.status
               END
    WHERE id = v_row.id;

    IF v_delta <> 0 THEN
      IF v_target = 0 THEN
        UPDATE public.penalties
        SET reversed_at = v_now,
            reversal_reason = 'paid on or before due date'
        WHERE amortization_schedule_id = v_row.id
          AND reversed_at IS NULL
          AND notes LIKE 'Monthly late fee%';
      END IF;

      INSERT INTO public.penalties (
        masterlist_id,
        amortization_schedule_id,
        amount,
        rate_applied,
        notes
      ) VALUES (
        p_masterlist_id,
        v_row.id,
        v_delta,
        v_rate,
        CASE
          WHEN v_delta < 0 THEN 'Late fee reduced after payment recompute'
          ELSE 'Late fee increased after payment recompute'
        END
      );
    END IF;
  END LOOP;
END;
$function$;

comment on function public.recompute_account_penalties(uuid) is
  'Phase 3: after a payment posts, re-derive each open past-due installment''s '
  'late fee — zero it if an on-time payment covered the installment (Rule 4a), '
  'otherwise recompute the compounded fee from scratch on the still-unpaid '
  'balance for every whole month elapsed (Rule 4b). Adjustments are booked as '
  'signed `penalties` rows; full reversals also stamp reversed_at.';

-- ── post_single_dcr_item: add ONE line (the recompute call) before the balance
--    recompute tail. Everything else is the live definition verbatim.
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

    insert into postings (
      dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at
    ) values (
      p_dcr_id, p_payment_id, v_masterlist_id, v_schedule_id, v_amount, p_actor_id, p_now
    );

    if v_schedule_id is not null then
      select id, installment_no, amount_due, amount_paid, penalty_amount, discount_amount, status
      into v_schedule
      from amortization_schedules
      where id = v_schedule_id
      for update;

      if found then
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
          -- Already settles without any help from a Collector discount —
          -- existing behavior, untouched. Any discount entered for this
          -- row simply never applies; nothing to reconcile later.
          update amortization_schedules
          set amount_paid = v_new_paid,
              status = 'paid',
              paid_at = p_now
          where id = v_schedule_id;
        else
          -- Pass B — only reached because Pass A fell short.
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
            -- The discount is exactly what earned this row's closure.
            update amortization_schedules
            set amount_paid = v_new_paid,
                status = 'paid',
                paid_at = p_now,
                discount_amount = case when v_interest_share > 0 then v_interest_share else discount_amount end,
                discount_source = case when v_interest_share > 0 then 'collector' else discount_source end,
                penalty_discount_amount = case when v_penalty_share > 0 then v_penalty_share else penalty_discount_amount end
            where id = v_schedule_id;
          else
            -- Option B: falls short even with the discount. The discount
            -- does not apply at all — row proceeds exactly as it would
            -- have if no discount had ever been entered.
            update amortization_schedules
            set amount_paid = v_new_paid,
                status = 'partial'
            where id = v_schedule_id;
          end if;
        end if;
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

  -- Phase 3 — re-derive late fees now that this payment has landed: zero any
  -- fee an on-time payment covered (Rule 4a), recompute the compounded fee on
  -- the still-unpaid balance otherwise (Rule 4b). Runs before the balance
  -- recompute below so Outstanding Balance reflects the adjusted fees.
  perform public.recompute_account_penalties(v_masterlist_id);

  v_new_balance := public.recompute_outstanding_balance(v_masterlist_id);
  -- F8 (Phase 6) — a 0 derived balance alone doesn't mean the account is
  -- done; every row must genuinely be paid/rolled too.
  v_fully_settled := public.is_account_fully_settled(v_masterlist_id);

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 and v_fully_settled then 'paid' else 'active' end
  where id = v_masterlist_id;

  return jsonb_build_object('skipped', false, 'newBalance', v_new_balance);
end;
$function$;
