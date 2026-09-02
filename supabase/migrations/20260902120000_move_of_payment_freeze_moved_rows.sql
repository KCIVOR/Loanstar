-- Move of Payment — Fixes Plan, Phase 1 (Issues 1 + 8).
-- See docs/revision-plans/move-of-payment-fixes-plan.md.
--
-- Root cause of both issues: a 'moved' amortization_schedules row is treated
-- as an ordinary open installment by every balance/aging status filter that
-- lists only 'paid' and 'rolled' as "skip these". A 'moved' row must be
-- frozen exactly the way a 'rolled' row is:
--   * Issue 1 — recompute_outstanding_balance counts the moved row AND the
--     appended extension row (deferred_from_move_of_payment_batch_id),
--     double-counting one installment.
--   * Issue 8 — refresh_one_masterlist_aging picks a moved row whose original
--     due date has passed as "the overdue installment" and penalises it
--     before its move deadline, leaving it stuck (status no longer 'moved',
--     so the deadline-revert can never clean it up).
--
-- This migration:
--   1. adds 'moved' to the status exclusion in recompute_outstanding_balance
--   2. adds 'moved' to the three "<> 'paid' AND <> 'rolled'" filters in
--      refresh_one_masterlist_aging (overdue detection, 30-day-rollover
--      "next" pick, discount-reversion select + update) — nothing else in
--      that function changes
--   3. reverts the 8 existing test moves to a clean baseline (user decision
--      2026-09-02: "fully revert all 8")
--
-- Both function bodies below are the CURRENT LIVE definitions, re-fetched via
-- pg_get_functiondef on 2026-09-02 immediately before writing this file. The
-- ONLY edits are the added `and ... <> 'moved'` predicates, marked with
-- `-- Phase 1:` comments.

-- ---------------------------------------------------------------------------
-- 1. recompute_outstanding_balance — freeze 'moved' rows
-- ---------------------------------------------------------------------------
create or replace function public.recompute_outstanding_balance(p_masterlist_id uuid)
 returns numeric
 language sql
 stable
as $function$
  select coalesce(sum(
    greatest(
      0,
      public.half_up(
        coalesce(amount_due, 0)
        - coalesce(discount_amount, 0)
        + coalesce(penalty_amount, 0)
        - coalesce(amount_paid, 0)
      )
    )
  ), 0)
  from public.amortization_schedules
  where masterlist_id = p_masterlist_id
    and status not in ('paid', 'rolled', 'moved');  -- Phase 1: 'moved' added
$function$;

-- ---------------------------------------------------------------------------
-- 2. refresh_one_masterlist_aging — freeze 'moved' rows in every aging filter
-- ---------------------------------------------------------------------------
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
  v_now timestamptz := now();
  v_reverted_discount_total numeric := 0;
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

  -- Move of Payment extension revert (Addendum 2, Gap 1) — unchanged. Runs
  -- before the status revert UPDATE below so lapsed batches are still
  -- identifiable by move_of_payment_batch_id. Never deletes a row that
  -- carries a payment.
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
    s.rolled_at
  INTO v_overdue
  FROM public.amortization_schedules s
  WHERE s.masterlist_id = p_masterlist_id
    AND s.status <> 'paid'
    AND s.status <> 'rolled'
    AND s.status <> 'moved'   -- Phase 1: a moved row is frozen, never "the overdue one"
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

  IF v_has_overdue AND v_dpd >= 1 THEN
    v_existing_penalty := COALESCE(v_overdue.penalty_amount, 0);
    v_outstanding := GREATEST(
      0,
      COALESCE(v_overdue.amount_due, 0)
      - COALESCE(v_overdue.discount_amount, 0)
      - COALESCE(v_overdue.amount_paid, 0)
    );
    v_penalty := public.half_up(v_outstanding * v_penalty_rate);

    IF v_penalty > v_existing_penalty THEN
      UPDATE public.amortization_schedules
      SET
        penalty_amount = v_penalty,
        status = 'overdue'
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
        public.half_up(v_penalty - v_existing_penalty),
        v_penalty_rate,
        'Missed payment penalty'
      );

      v_final_penalty := v_penalty;
    END IF;

    IF v_dpd >= v_t30 AND v_overdue.rolled_at IS NULL THEN
      SELECT
        s.id,
        s.installment_no,
        s.amount_due
      INTO v_next
      FROM public.amortization_schedules s
      WHERE s.masterlist_id = p_masterlist_id
        AND s.status <> 'paid'
        AND s.status <> 'rolled'
        AND s.status <> 'moved'   -- Phase 1: never roll an overdue balance into a moved row
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
          )
        );

        UPDATE public.amortization_schedules
        SET amount_due = COALESCE(amount_due, 0) + v_roll_amount
        WHERE id = v_next.id;

        UPDATE public.amortization_schedules
        SET
          status = 'rolled',
          rolled_at = v_now,
          rolled_into_installment_no = v_next.installment_no
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
  END IF;

  SELECT COALESCE(SUM(discount_amount), 0) INTO v_reverted_discount_total
  FROM public.amortization_schedules
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
    AND status <> 'moved'   -- Phase 1: don't revert a moved row's discount while it's frozen
    AND discount_amount > 0
    AND (p_as_of - due_date) >= 0;

  UPDATE public.amortization_schedules
  SET discount_amount = 0
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
    AND status <> 'moved'   -- Phase 1: (paired with the select above)
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

-- ---------------------------------------------------------------------------
-- 3. Repair the 8 existing test moves — full revert (user decision 2026-09-02)
-- ---------------------------------------------------------------------------
-- Affected accounts (all AN300xxx seed accounts, all test moves dated
-- 2026-09-01, all due dates still in the future, none carrying a penalty):
--   AN300002, AN300007, AN300374, AN300383, AN300394, AN300426, AN300433, AN300438
-- 3 of them (AN300007, AN300383, AN300426) also have an appended extension row.
-- Idempotent: re-running finds nothing to change.

-- 3a. Clear the once-per-loan lock on every affected account, while the
--     markers still exist to identify them.
UPDATE public.masterlist
SET move_of_payment_used_at = NULL
WHERE id IN (
  SELECT DISTINCT masterlist_id
  FROM public.amortization_schedules
  WHERE move_of_payment_batch_id IS NOT NULL
     OR deferred_from_move_of_payment_batch_id IS NOT NULL
);

-- 3b. Delete the appended extension rows.
DELETE FROM public.amortization_schedules
WHERE deferred_from_move_of_payment_batch_id IS NOT NULL;

-- 3c. Delete any "Missed payment penalty" rows wrongly added to a moved row
--     (Issue 8 broken state — currently zero, guard only).
DELETE FROM public.penalties
WHERE notes = 'Missed payment penalty'
  AND amortization_schedule_id IN (
    SELECT id FROM public.amortization_schedules
    WHERE move_of_payment_batch_id IS NOT NULL
  );

-- 3d. Revert every moved row (and any Issue-8 half-reverted row) back to a
--     plain pending installment.
UPDATE public.amortization_schedules
SET
  status = 'pending',
  moved_at = NULL,
  moved_to_installment_no = NULL,
  move_surcharge_amount = NULL,
  move_of_payment_deadline = NULL,
  move_of_payment_batch_id = NULL,
  penalty_amount = 0
WHERE move_of_payment_batch_id IS NOT NULL;

-- 3e. Delete the one orphan test surcharge payment on AN300383 (confirmed,
--     not on any DCR item, no postings — verified 2026-09-02).
DELETE FROM public.payments
WHERE id = '19afccf4-18d7-4fb7-9079-b0468dbbd4e6'
  AND status = 'confirmed';

-- 3f. Recompute the stored balance for the 8 named accounts so it reflects
--     the reverted schedule (back to the original installment set).
UPDATE public.masterlist m
SET outstanding_balance = public.recompute_outstanding_balance(m.id)
WHERE m.loan_account_no IN (
  'AN300002','AN300007','AN300374','AN300383','AN300394','AN300426','AN300433','AN300438'
);
