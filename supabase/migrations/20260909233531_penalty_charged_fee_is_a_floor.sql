-- Principal-first payments — a charged late fee is a balance in its own right
-- (Phase 1 of principal-first-fee-stays-plan.md).
--
-- Before: recompute_account_penalties rebuilt the fee from the current unpaid
-- PRINCIPAL balance. Paying off the principal drove the base to 0, so the fee
-- recomputed to 0 and the row flipped to 'paid' — the fee vanished. That
-- contradicts the client's accepted model ("balance pa rin yun eh… tama yun",
-- transcript 2026-09-09 ~52:36): once charged, a late fee is owed until paid or
-- explicitly waived.
--
-- Change: the recompute may RAISE the fee (monthly compounding) but never lower
-- it below (a) what has been collected against it, or (b) what is currently
-- charged net of any waiver. And a row whose principal is fully covered but whose
-- fee is still owed reads 'partial', not 'overdue'.
--
-- Surgical scope: two edits in the late-payment (ELSE) branch / status CASE of
-- recompute_account_penalties. Rule 4a on-time zeroing, the status='paid'
-- CONTINUE, the amount_paid − v_fee_paid carve-out, the penalties reversal +
-- compensating-row insert are all verbatim.

CREATE OR REPLACE FUNCTION public.recompute_account_penalties(p_masterlist_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_segment text;
  v_rate numeric;
  v_now timestamptz := now();
  v_asof date := current_date;
  v_row RECORD;
  v_target_periods int;
  v_ontime_paid numeric;
  v_fee_paid numeric;
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

    -- Fee money already collected against this installment (Phase 4a auto split
    -- + Phase 4b collector override both land in postings.penalty_amount). It
    -- must NOT count as paying down principal, and it is a floor the recomputed
    -- fee cannot drop below.
    SELECT COALESCE(SUM(po.penalty_amount), 0)
    INTO v_fee_paid
    FROM public.postings po
    WHERE po.amortization_schedule_id = v_row.id;

    v_net_due := GREATEST(0, v_row.amount_due - v_row.discount_amount);

    IF v_ontime_paid >= v_net_due - 0.005 THEN
      v_target := 0;
      v_target_periods := 0;
    ELSIF v_row.status = 'paid' THEN
      CONTINUE;
    ELSE
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
          - GREATEST(0, v_row.amount_paid - v_fee_paid)
          + v_running
        );
        v_add := public.half_up(v_bal * v_rate);
        EXIT WHEN v_add <= 0;
        v_running := v_running + v_add;
      END LOOP;
      v_target := v_running;
      -- A charged late fee is a balance in its own right: paying down principal
      -- never erases it. The recompute may raise it (compounding) but never
      -- lower it below what has been collected against it, nor below what is
      -- currently charged net of any waiver (decision 2026-09-10).
      v_target := GREATEST(
        v_target,
        v_fee_paid,
        GREATEST(0, v_row.penalty_amount - v_row.penalty_discount_amount)
      );
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
                 WHEN v_target > 0 AND v_row.amount_paid >= v_net_due - 0.005 THEN 'partial'
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
