-- Migration: Un-roll existing 'rolled' rows (AUTO cohort only)
--
-- Part of docs/revision-plans/penalty-remove-rollforward-plan.md (v2.2), Phase 1c.
-- Reverses the 30-day roll-forward for accounts where it can be reversed exactly, so each
-- missed installment becomes its own independently payable line again.
--
-- QUARANTINED (left untouched — 9 rows / 4 accounts):
--   * rollover destination since paid/partial: AN300018, AN300421, AN300434
--   * recorded roll_amount no longer reconciles with the row's current fields: AN300450
--     (and AN300434 #2, already quarantined by the paid-destination rule)
-- These need a per-account manual decision (plan Phase 1b, Option Q1 = leave quarantined).
--
-- Ordering is LIFO (rolled_at DESC, installment_no DESC). Rollovers chain (#1 -> #2 -> #3 ...),
-- each rolled row's amount_due already contains everything folded in from upstream, and many
-- chains share the same rolled_at second (the installment_no DESC tiebreaker is load-bearing).
-- Unwinding oldest-first would subtract amounts already carried further up the chain.
--
-- Every destination subtraction is validated before it runs; a shortfall aborts the whole
-- migration rather than flooring a money value to zero. Each un-rolled row's
-- penalty_periods_applied is seeded to whole-months-overdue so the next aging run resumes the
-- fee forward-only, not retroactively (plan Fact 7).
--
-- Must run BEFORE 20260909105000_reconcile_unrolled_account_balances.sql and
-- 20260909110000_remove_rollover_from_refresh_aging.sql.

DO $$
DECLARE
  v_rolled           RECORD;
  v_penalty          RECORD;
  v_dest             RECORD;
  v_roll_amount      numeric;
  v_penalty_portion  numeric;
  v_interest_portion numeric;
  v_expected         numeric;
  v_unrolled         int := 0;
  v_quarantined      int := 0;
BEGIN
  -- Quarantined accounts, skipped wholesale:
  --  (a) a rollover destination has been settled (paid/partial), OR
  --  (b) a rolled row's recorded roll_amount no longer reconciles with its current fields.
  CREATE TEMP TABLE _quarantined_masterlists ON COMMIT DROP AS
  SELECT DISTINCT s.masterlist_id
  FROM public.amortization_schedules s
  JOIN public.amortization_schedules d
    ON d.masterlist_id  = s.masterlist_id
   AND d.installment_no = s.rolled_into_installment_no
  WHERE s.status = 'rolled'
    AND d.status IN ('paid', 'partial')
  UNION
  SELECT DISTINCT s.masterlist_id
  FROM public.amortization_schedules s
  JOIN public.penalties pe
    ON pe.amortization_schedule_id = s.id
   AND pe.notes LIKE '30-day rollover:%'
   AND pe.reversed_at IS NULL
  WHERE s.status = 'rolled'
    AND abs(
          pe.amount
          - public.half_up(GREATEST(0,
              COALESCE(s.amount_due, 0) - COALESCE(s.discount_amount, 0)
            - COALESCE(s.amount_paid, 0) + COALESCE(s.penalty_amount, 0)
            - COALESCE(s.penalty_discount_amount, 0)))
        ) > 0.01;

  SELECT count(*) INTO v_quarantined
  FROM public.amortization_schedules s
  WHERE s.status = 'rolled'
    AND s.masterlist_id IN (SELECT masterlist_id FROM _quarantined_masterlists);

  RAISE NOTICE 'Quarantined % rolled row(s) across % account(s) - left untouched by design.',
    v_quarantined, (SELECT count(*) FROM _quarantined_masterlists);

  FOR v_rolled IN
    SELECT s.id, s.masterlist_id, s.installment_no, s.due_date, s.amount_due, s.penalty_amount,
           s.discount_amount, s.amount_paid, s.penalty_discount_amount,
           s.rolled_at, s.rolled_into_installment_no
    FROM public.amortization_schedules s
    WHERE s.status = 'rolled'
      AND s.masterlist_id NOT IN (SELECT masterlist_id FROM _quarantined_masterlists)
    ORDER BY s.rolled_at DESC, s.installment_no DESC   -- LIFO: unwind the chain from its tip
  LOOP
    ----------------------------------------------------------------------
    -- 1. Locate the rollover penalty. Exactly one must exist.
    ----------------------------------------------------------------------
    SELECT pe.id, pe.amount INTO v_penalty
    FROM public.penalties pe
    WHERE pe.amortization_schedule_id = v_rolled.id
      AND pe.notes LIKE '30-day rollover:%'
      AND pe.reversed_at IS NULL
    ORDER BY pe.calculated_at DESC          -- NB: calculated_at, NOT created_at
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Un-roll aborted: no rollover penalty for schedule % (installment #%, masterlist %). '
        'Cannot determine the amount to reverse.',
        v_rolled.id, v_rolled.installment_no, v_rolled.masterlist_id;
    END IF;

    v_roll_amount := v_penalty.amount;

    ----------------------------------------------------------------------
    -- 2. Rebuild the interest/penalty split exactly as the rollover computed it.
    ----------------------------------------------------------------------
    v_penalty_portion := GREATEST(0, public.half_up(
      COALESCE(v_rolled.penalty_amount, 0) - COALESCE(v_rolled.penalty_discount_amount, 0)));
    v_interest_portion := public.half_up(v_roll_amount - v_penalty_portion);

    -- Reconciliation: the recorded roll_amount must match the source row's current net due.
    -- (Non-reconciling accounts are already quarantined above; this is belt-and-braces.)
    v_expected := public.half_up(GREATEST(0,
        COALESCE(v_rolled.amount_due, 0)
      - COALESCE(v_rolled.discount_amount, 0)
      - COALESCE(v_rolled.amount_paid, 0)
      + COALESCE(v_rolled.penalty_amount, 0)
      - COALESCE(v_rolled.penalty_discount_amount, 0)));

    IF abs(v_expected - v_roll_amount) > 0.01 THEN
      RAISE EXCEPTION
        'Un-roll aborted: reconciliation failed for schedule % (installment #%, masterlist %). '
        'Recorded roll_amount = %, recomputed = %, difference = %. The row changed after it '
        'was rolled; reversing it automatically is unsafe.',
        v_rolled.id, v_rolled.installment_no, v_rolled.masterlist_id,
        v_roll_amount, v_expected, (v_expected - v_roll_amount);
    END IF;

    IF v_interest_portion < 0 THEN
      RAISE EXCEPTION
        'Un-roll aborted: negative interest portion (%) for schedule %. '
        'penalty_portion (%) exceeds roll_amount (%).',
        v_interest_portion, v_rolled.id, v_penalty_portion, v_roll_amount;
    END IF;

    ----------------------------------------------------------------------
    -- 3. Locate the destination row.
    ----------------------------------------------------------------------
    SELECT d.id, d.installment_no, d.status, d.amount_due, d.penalty_amount
    INTO v_dest
    FROM public.amortization_schedules d
    WHERE d.masterlist_id  = v_rolled.masterlist_id
      AND d.installment_no = v_rolled.rolled_into_installment_no
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% not found for schedule % (masterlist %). '
        'Refusing to leave the chain half-unwound.',
        v_rolled.rolled_into_installment_no, v_rolled.id, v_rolled.masterlist_id;
    END IF;

    ----------------------------------------------------------------------
    -- 4. Validate the subtraction BEFORE performing it. Assert, never floor.
    ----------------------------------------------------------------------
    IF COALESCE(v_dest.amount_due, 0) < v_interest_portion - 0.01 THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% (%) holds amount_due = % but the reversal '
        'requires subtracting % (shortfall %). The destination was modified after the rollover.',
        v_dest.installment_no, v_dest.id, v_dest.amount_due, v_interest_portion,
        (v_interest_portion - COALESCE(v_dest.amount_due, 0));
    END IF;

    IF COALESCE(v_dest.penalty_amount, 0) < v_penalty_portion - 0.01 THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% (%) holds penalty_amount = % but the reversal '
        'requires subtracting % (shortfall %). The penalty was waived or paid after the rollover.',
        v_dest.installment_no, v_dest.id, v_dest.penalty_amount, v_penalty_portion,
        (v_penalty_portion - COALESCE(v_dest.penalty_amount, 0));
    END IF;

    ----------------------------------------------------------------------
    -- 5. Mutate: destination first, then the source row, then the penalty.
    ----------------------------------------------------------------------
    UPDATE public.amortization_schedules
    SET amount_due     = public.half_up(COALESCE(amount_due, 0)     - v_interest_portion),
        penalty_amount = public.half_up(COALESCE(penalty_amount, 0) - v_penalty_portion)
    WHERE id = v_dest.id;

    UPDATE public.amortization_schedules
    SET status                     = 'overdue',
        rolled_at                  = NULL,
        rolled_into_installment_no  = NULL,
        carried_interest_amount     = 0,      -- verified no-op (plan Fact 2); kept for hygiene
        carried_penalty_amount      = 0,
        carried_from_installment_no  = NULL,
        -- plan Fact 7: seed the compounding counter to whole-months-overdue so the next aging
        -- run resumes the fee FORWARD-ONLY instead of retroactively compounding 1-3 rounds.
        penalty_periods_applied = GREATEST(0, (
          date_part('year',  age(CURRENT_DATE, v_rolled.due_date)) * 12
        + date_part('month', age(CURRENT_DATE, v_rolled.due_date))
        )::int)
    WHERE id = v_rolled.id;

    UPDATE public.penalties
    SET reversed_at     = now(),
        reversal_reason = 'Un-rolled: 30-day roll-forward removed from delinquency path '
                          '(penalty-remove-rollforward-plan.md Phase 1c)'
    WHERE id = v_penalty.id;

    v_unrolled := v_unrolled + 1;

    RAISE NOTICE
      'Un-rolled installment #% -> removed % (interest %, penalty %) from installment #%',
      v_rolled.installment_no, v_roll_amount, v_interest_portion, v_penalty_portion,
      v_dest.installment_no;
  END LOOP;

  RAISE NOTICE 'Un-rolled % row(s). Quarantined % row(s).', v_unrolled, v_quarantined;

  IF v_unrolled <> 15 THEN
    RAISE EXCEPTION
      'Un-roll aborted: expected to un-roll exactly 15 rows, actually un-rolled %. '
      'The data differs from the plan baseline - re-run Phase 1a and re-plan.', v_unrolled;
  END IF;
END $$;

-- Post-condition: only the quarantined rows may remain rolled.
DO $$
DECLARE v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.amortization_schedules WHERE status = 'rolled';

  IF v_remaining <> 9 THEN
    RAISE EXCEPTION 'Post-condition failed: expected 9 quarantined rolled rows, found %.',
      v_remaining;
  END IF;

  RAISE NOTICE 'Post-condition OK: % quarantined rolled row(s) remain, by design.', v_remaining;
END $$;
