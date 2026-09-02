-- Fixes a real balance-integrity bug found on AN300432 (SME - Standard,
-- semi_monthly, 2026-08-31): masterlist.total_loan/outstanding_balance are
-- set once at release, assuming every origination discount will be honored.
-- The origination-discount reversion step (Rule 6, prior migration
-- 20260828110000) clears an unpaid installment's discount_amount once its
-- due date arrives, but never adjusted the account-level total/balance to
-- match — so the borrower now owes more (the reverted discount) than the
-- account showed, and the ledger's opening debit (from total_loan) silently
-- fell out of agreement with Outstanding Balance the moment any discount
-- reverted. Mirrors the same fix applied to refreshMasterlistAging() in
-- src/lib/ar/posting.ts — this SQL function is that logic's parity twin
-- (see its own header comment), so both must carry the same fix.

CREATE OR REPLACE FUNCTION public.refresh_one_masterlist_aging(
  p_masterlist_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  SELECT
    s.id,
    s.installment_no,
    s.due_date,
    s.status,
    s.amount_due,
    s.amount_paid,
    COALESCE(s.penalty_amount, 0) AS penalty_amount,
    s.rolled_at
  INTO v_overdue
  FROM public.amortization_schedules s
  WHERE s.masterlist_id = p_masterlist_id
    AND s.status <> 'paid'
    AND s.status <> 'rolled'
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
    -- Base unpaid balance only — accrued penalty deliberately excluded.
    v_outstanding :=
      COALESCE(v_overdue.amount_due, 0)
      - COALESCE(v_overdue.amount_paid, 0);
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
        AND s.id <> v_overdue.id
      ORDER BY s.installment_no ASC
      LIMIT 1;

      v_has_next := FOUND;

      IF v_has_next THEN
        v_roll_amount := public.half_up(
          COALESCE(v_overdue.amount_due, 0)
          - COALESCE(v_overdue.amount_paid, 0)
          + v_final_penalty
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

  -- Origination-discount reversion (Phase 3) — separate concern, not folded
  -- into the penalty/rollover logic above. Set-based, not per-row cursor
  -- work: every installment on this account whose due date has arrived
  -- loses its discount in one statement. Idempotent — rows already at 0 are
  -- unaffected by this UPDATE's WHERE clause. Capture the total being
  -- cleared BEFORE the UPDATE zeroes it, so it can be carried onto the
  -- account-level total/balance below (the fix this migration adds).
  SELECT COALESCE(SUM(discount_amount), 0) INTO v_reverted_discount_total
  FROM public.amortization_schedules
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
    AND discount_amount > 0
    AND (p_as_of - due_date) >= 0;

  UPDATE public.amortization_schedules
  SET discount_amount = 0
  WHERE masterlist_id = p_masterlist_id
    AND status <> 'paid'
    AND status <> 'rolled'
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
    -- The account's total/balance were set at release assuming every
    -- origination discount above would be honored. A reverted, unpaid
    -- discount means the borrower now owes that money after all — carry it
    -- onto both figures the same way a posted payment carries a reduction,
    -- so Outstanding Balance and the ledger's opening debit stay in
    -- agreement.
    total_loan = total_loan + v_reverted_discount_total,
    outstanding_balance = outstanding_balance + v_reverted_discount_total
  WHERE id = p_masterlist_id;
END;
$function$;
