-- Penalty breakdown — Phase 3 fix: recompute_account_penalties must not claw
-- back a fee that was actually PAID.
--
-- Phase 3's 4b branch recomputes the fee on "what is still unpaid". For a row
-- the payment fully settled (status 'paid'), still-unpaid is 0, so the branch
-- drove penalty_amount to 0 and booked a negative `penalties` row — reading as
-- "fee cancelled" when the borrower had in fact paid that fee (late). Only a
-- genuinely on-time payment (Rule 4a) should zero a fee.
--
-- Fix: in the loop, a 'paid' row that was NOT covered on time is left exactly as
-- it is. And when Rule 4a zeroes a fee, if the installment's principal is now
-- covered the row is re-settled to 'paid' (an on-time payment that only covered
-- principal, not the phantom fee, otherwise sticks at 'partial'). Everything
-- else in the function is unchanged.

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
      AND (COALESCE(s.penalty_amount, 0) > 0 OR COALESCE(s.penalty_periods_applied, 0) > 0)
  LOOP
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
    ELSIF v_row.status = 'paid' THEN
      -- Late but fully settled: the fee was paid as part of that payment, not
      -- cancelled. Leave it — and its period counter — exactly as they are.
      CONTINUE;
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
                 WHEN v_target = 0 AND v_row.amount_paid >= v_net_due - 0.005 THEN 'paid'
                 WHEN v_target > 0 THEN 'overdue'
                 ELSE v_row.status
               END,
      paid_at = CASE
                  WHEN v_row.status <> 'paid'
                    AND v_target = 0
                    AND v_row.amount_paid >= v_net_due - 0.005
                  THEN v_now
                  ELSE paid_at
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
