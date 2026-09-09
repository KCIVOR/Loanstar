-- Penalty breakdown — Phase 5b: record what a rolled-in installment's balance
-- is made of (Rule 10).
--
-- When the 30-day rollover folds a missed installment into a later one, today
-- the later row's `amount_due` and `penalty_amount` just grow — the reader
-- cannot tell how much of the row is its own original amount vs. carried over.
-- These three columns capture the carried portions (in ADDITION to the existing
-- bump, which every downstream balance calc still relies on) so the ledger can
-- show "incl. ₱X carried from installment #N".
--
-- Surgical scope: three additive nullable-with-default columns; the rollover
-- UPDATE in refresh_one_masterlist_aging gains three assignments. Its
-- arithmetic, the penalty-accrual loop, move-of-payment revert, discount
-- reversion and the masterlist update are byte-for-byte unchanged.

alter table public.amortization_schedules
  add column if not exists carried_interest_amount numeric not null default 0,
  add column if not exists carried_penalty_amount numeric not null default 0,
  add column if not exists carried_from_installment_no smallint;

comment on column public.amortization_schedules.carried_interest_amount is
  'Phase 5b: sum of amount-due folded into this installment by 30-day '
  'rollovers. Display-only breakdown metadata — the amount is already inside '
  'amount_due.';
comment on column public.amortization_schedules.carried_penalty_amount is
  'Phase 5b: sum of late-fee folded into this installment by 30-day rollovers. '
  'Already inside penalty_amount.';
comment on column public.amortization_schedules.carried_from_installment_no is
  'Phase 5b: the installment number whose balance most recently rolled into '
  'this row.';

create or replace function public.refresh_one_masterlist_aging(p_masterlist_id uuid, p_as_of date default current_date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_segment text;
  v_penalty_rate numeric := 0.05;
  v_t30 int := 30;
  v_t60 int := 60;
  v_t90 int := 90;
  v_cfg jsonb;
  v_overdue RECORD;
  v_next RECORD;
  v_has_overdue boolean := false;
  v_has_next boolean := false;
  v_dpd int := 0;
  v_aging_bucket text := 'current';
  v_outstanding numeric;
  v_penalty numeric;
  v_existing_penalty numeric;
  v_final_penalty numeric := 0;
  v_roll_amount numeric;
  v_penalty_portion numeric;
  v_interest_portion numeric;
  v_now timestamptz := now();
  v_reverted_discount_total numeric := 0;
  -- Phase 2 — monthly compounding loop
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

  SELECT
    s.id,
    s.installment_no,
    s.due_date,
    s.status,
    s.amount_due,
    s.amount_paid,
    COALESCE(s.penalty_amount, 0) AS penalty_amount,
    COALESCE(s.discount_amount, 0) AS discount_amount,
    COALESCE(s.penalty_discount_amount, 0) AS penalty_discount_amount,
    s.rolled_at
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

    v_final_penalty := COALESCE(v_overdue.penalty_amount, 0);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PENALTY ACCRUAL — Phase 2 (monthly compounding on EVERY overdue installment)
  -- ─────────────────────────────────────────────────────────────────────────
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
        COALESCE(s.penalty_periods_applied, 0) AS periods_applied
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
        IF v_row.id = v_overdue.id THEN
          v_final_penalty := v_row.penalty_amount;
        END IF;
        CONTINUE;
      END IF;

      v_running_penalty := v_row.penalty_amount;
      FOR v_p IN (v_row.periods_applied + 1) .. v_target_periods LOOP
        v_bal := GREATEST(
          0,
          v_row.amount_due
          - v_row.discount_amount
          - v_row.penalty_discount_amount
          - v_row.amount_paid
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

      IF v_row.id = v_overdue.id THEN
        v_final_penalty := v_running_penalty;
      END IF;
    END LOOP;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 30-DAY ROLLOVER — arithmetic unchanged. Phase 5b: also record the carried
  -- interest / penalty portions and the source installment on the destination
  -- row, in addition to the existing amount_due / penalty_amount bump.
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_has_overdue AND v_dpd >= v_t30 AND v_overdue.rolled_at IS NULL THEN
    SELECT
      s.id,
      s.installment_no,
      s.amount_due,
      COALESCE(s.penalty_amount, 0) AS penalty_amount
    INTO v_next
    FROM public.amortization_schedules s
    WHERE s.masterlist_id = p_masterlist_id
      AND s.status <> 'paid'
      AND s.status <> 'rolled'
      AND s.status <> 'moved'
      AND s.id <> v_overdue.id
    ORDER BY s.installment_no ASC
    LIMIT 1;

    v_has_next := FOUND;

    IF v_has_next THEN
      v_roll_amount := public.half_up(
        GREATEST(
          0,
          COALESCE(v_overdue.amount_due, 0)
          - COALESCE(v_overdue.discount_amount, 0)
          - COALESCE(v_overdue.amount_paid, 0)
          + v_final_penalty
          - COALESCE(v_overdue.penalty_discount_amount, 0)
        )
      );

      v_penalty_portion := GREATEST(
        0,
        public.half_up(v_final_penalty - COALESCE(v_overdue.penalty_discount_amount, 0))
      );
      v_interest_portion := public.half_up(v_roll_amount - v_penalty_portion);

      UPDATE public.amortization_schedules
      SET
        amount_due = COALESCE(amount_due, 0) + v_interest_portion,
        penalty_amount = COALESCE(penalty_amount, 0) + v_penalty_portion,
        carried_interest_amount = COALESCE(carried_interest_amount, 0) + v_interest_portion,
        carried_penalty_amount = COALESCE(carried_penalty_amount, 0) + v_penalty_portion,
        carried_from_installment_no = v_overdue.installment_no
      WHERE id = v_next.id;

      UPDATE public.amortization_schedules
      SET
        status = 'rolled',
        rolled_at = v_now,
        rolled_into_installment_no = v_next.installment_no,
        penalty_discount_amount = 0
      WHERE id = v_overdue.id;

      INSERT INTO public.penalties (
        masterlist_id,
        amortization_schedule_id,
        amount,
        rate_applied,
        notes
      ) VALUES (
        p_masterlist_id,
        v_overdue.id,
        v_roll_amount,
        v_penalty_rate,
        format(
          '30-day rollover: %s rolled into installment #%s',
          to_char(v_roll_amount, 'FM999999990.00'),
          v_next.installment_no
        )
      );
    END IF;
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
