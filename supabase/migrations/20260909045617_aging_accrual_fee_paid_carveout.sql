-- Penalty — "a paid late fee sticks" (Phase 2 of penalty-fee-paid-protection-plan.md)
--
-- The nightly accrual loop in refresh_one_masterlist_aging compounds each new
-- monthly fee round on `amount_due - discounts - amount_paid + running_penalty`.
-- `amount_paid` includes the fee money the borrower paid (postings.penalty_amount),
-- so a late partial payment that covers the fee also shrinks the base every new
-- round compounds on. Carve the fee-paid portion back out — same rule Phase 1
-- applied to recompute_account_penalties.
--
-- No floor needed here: this loop only ADDS periods (periods_applied guard) and
-- starts from the existing penalty_amount, which Phase 1 already protects.
--
-- Surgical scope: two edits, both inside the `-- PENALTY ACCRUAL` FOR loop:
--   1. select fee_paid = SUM(postings.penalty_amount) for the row
--   2. subtract GREATEST(0, amount_paid - fee_paid) instead of amount_paid
-- Move-of-payment reverts, aging-bucket ladder, discount reversion, the final
-- masterlist UPDATE, pdc_checks handling — all verbatim.

CREATE OR REPLACE FUNCTION public.refresh_one_masterlist_aging(p_masterlist_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_segment text;
  v_penalty_rate numeric := 0.05;
  v_t30 int := 30;
  v_t60 int := 60;
  v_t90 int := 90;
  v_cfg jsonb;
  v_overdue RECORD;
  v_has_overdue boolean := false;
  v_dpd int := 0;
  v_aging_bucket text := 'current';
  v_reverted_discount_total numeric := 0;
  v_row RECORD;
  v_target_periods int;
  v_running_penalty numeric;
  v_bal numeric;
  v_add numeric;
  v_p int;
BEGIN
  SELECT segment INTO v_segment
  FROM public.masterlist
  WHERE id = p_masterlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Masterlist % not found', p_masterlist_id;
  END IF;

  v_penalty_rate := public.penalty_rate_for_segment(v_segment);

  SELECT value INTO v_cfg
  FROM public.config_settings
  WHERE key = 'aging_thresholds';
  IF v_cfg IS NOT NULL AND jsonb_typeof(v_cfg) = 'object' THEN
    v_t30 := COALESCE((v_cfg ->> '30')::int, 30);
    v_t60 := COALESCE((v_cfg ->> '60')::int, 60);
    v_t90 := COALESCE((v_cfg ->> '90')::int, 90);
  END IF;

  DELETE FROM public.amortization_schedules
  WHERE masterlist_id = p_masterlist_id
    AND COALESCE(amount_paid, 0) = 0
    AND deferred_from_move_of_payment_batch_id IN (
      SELECT move_of_payment_batch_id
      FROM public.amortization_schedules
      WHERE masterlist_id = p_masterlist_id
        AND status = 'moved'
        AND move_of_payment_deadline < p_as_of
        AND move_of_payment_batch_id IS NOT NULL
    );

  UPDATE public.pdc_checks pc
  SET status = 'active',
      move_of_payment_batch_id = NULL,
      replaced_by_check_id = NULL
  FROM public.release_files rf
  WHERE rf.id = pc.release_file_id
    AND rf.loan_application_id = (SELECT loan_application_id FROM public.masterlist WHERE id = p_masterlist_id)
    AND pc.status IN ('held', 'replaced')
    AND pc.move_of_payment_batch_id IN (
      SELECT move_of_payment_batch_id
      FROM public.amortization_schedules
      WHERE masterlist_id = p_masterlist_id
        AND status = 'moved'
        AND move_of_payment_deadline < p_as_of
        AND move_of_payment_batch_id IS NOT NULL
    );

  DELETE FROM public.pdc_checks pc
  USING public.release_files rf
  WHERE rf.id = pc.release_file_id
    AND rf.loan_application_id = (SELECT loan_application_id FROM public.masterlist WHERE id = p_masterlist_id)
    AND pc.status = 'active'
    AND pc.move_of_payment_batch_id IN (
      SELECT move_of_payment_batch_id
      FROM public.amortization_schedules
      WHERE masterlist_id = p_masterlist_id
        AND status = 'moved'
        AND move_of_payment_deadline < p_as_of
        AND move_of_payment_batch_id IS NOT NULL
    );

  UPDATE public.amortization_schedules
  SET
    status = 'pending',
    moved_at = null,
    moved_to_installment_no = null,
    move_surcharge_amount = null,
    move_of_payment_deadline = null,
    move_of_payment_batch_id = null
  WHERE masterlist_id = p_masterlist_id
    AND status = 'moved'
    AND move_of_payment_deadline < p_as_of;

  SELECT s.id, s.due_date
  INTO v_overdue
  FROM public.amortization_schedules s
  WHERE s.masterlist_id = p_masterlist_id
    AND s.status <> 'paid'
    AND s.status <> 'rolled'
    AND s.status <> 'moved'
    AND (p_as_of - s.due_date) > 0
  ORDER BY s.due_date ASC, s.installment_no ASC
  LIMIT 1;

  v_has_overdue := FOUND;

  IF v_has_overdue THEN
    v_dpd := p_as_of - v_overdue.due_date;
    IF v_dpd <= 0 THEN
      v_aging_bucket := 'current';
    ELSIF v_dpd <= v_t30 THEN
      v_aging_bucket := '1-30';
    ELSIF v_dpd <= v_t60 THEN
      v_aging_bucket := '31-60';
    ELSIF v_dpd < v_t90 THEN
      v_aging_bucket := '61-90';
    ELSE
      v_aging_bucket := '91+';
    END IF;
  END IF;

  -- PENALTY ACCRUAL — monthly compounding on EVERY overdue installment.
  -- Target (amount_due) is never changed; the installment stays 'overdue' and
  -- independently payable. penalty_periods_applied makes same-day re-runs no-ops.
  IF v_has_overdue THEN
    FOR v_row IN
      SELECT
        s.id,
        s.installment_no,
        s.due_date,
        COALESCE(s.amount_due, 0) AS amount_due,
        COALESCE(s.discount_amount, 0) AS discount_amount,
        COALESCE(s.penalty_discount_amount, 0) AS penalty_discount_amount,
        COALESCE(s.amount_paid, 0) AS amount_paid,
        COALESCE(s.penalty_amount, 0) AS penalty_amount,
        COALESCE(s.penalty_periods_applied, 0) AS periods_applied,
        COALESCE((
          SELECT SUM(po.penalty_amount)
          FROM public.postings po
          WHERE po.amortization_schedule_id = s.id
        ), 0) AS fee_paid
      FROM public.amortization_schedules s
      WHERE s.masterlist_id = p_masterlist_id
        AND s.status <> 'paid'
        AND s.status <> 'rolled'
        AND s.status <> 'moved'
        AND (p_as_of - s.due_date) > 0
      ORDER BY s.due_date ASC, s.installment_no ASC
    LOOP
      v_target_periods :=
          (date_part('year',  age(p_as_of, v_row.due_date)) * 12
         + date_part('month', age(p_as_of, v_row.due_date)))::int;

      IF v_target_periods <= v_row.periods_applied THEN
        CONTINUE;
      END IF;

      v_running_penalty := v_row.penalty_amount;
      FOR v_p IN (v_row.periods_applied + 1) .. v_target_periods LOOP
        v_bal := GREATEST(
          0,
          v_row.amount_due
          - v_row.discount_amount
          - v_row.penalty_discount_amount
          - GREATEST(0, v_row.amount_paid - v_row.fee_paid)
          + v_running_penalty
        );
        v_add := public.half_up(v_bal * v_penalty_rate);
        EXIT WHEN v_add <= 0;
        v_running_penalty := v_running_penalty + v_add;

        INSERT INTO public.penalties (
          masterlist_id,
          amortization_schedule_id,
          amount,
          rate_applied,
          notes
        ) VALUES (
          p_masterlist_id,
          v_row.id,
          v_add,
          v_penalty_rate,
          format('Monthly late fee — month %s overdue', v_p)
        );
      END LOOP;

      UPDATE public.amortization_schedules
      SET
        penalty_amount = v_running_penalty,
        penalty_periods_applied = v_target_periods,
        status = 'overdue'
      WHERE id = v_row.id;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(discount_amount), 0) INTO v_reverted_discount_total
  FROM public.amortization_schedules
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
    AND status <> 'moved'
    AND discount_amount > 0
    AND (p_as_of - due_date) >= 0;

  UPDATE public.amortization_schedules
  SET discount_amount = 0
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
    AND status <> 'moved'
    AND discount_amount > 0
    AND (p_as_of - due_date) >= 0;

  UPDATE public.masterlist
  SET
    aging_bucket = v_aging_bucket,
    remedial_flag = (v_aging_bucket = '91+'),
    account_status = CASE
      WHEN v_aging_bucket = '91+' THEN 'remedial'
      ELSE account_status
    END,
    total_loan = total_loan + v_reverted_discount_total,
    outstanding_balance = CASE
      WHEN v_reverted_discount_total > 0
        THEN public.recompute_outstanding_balance(p_masterlist_id)
      ELSE outstanding_balance
    END
  WHERE id = p_masterlist_id;
END;
$function$;
