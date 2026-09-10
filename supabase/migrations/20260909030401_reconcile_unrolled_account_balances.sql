-- Migration: Reconcile outstanding_balance for the 6 un-rolled AUTO accounts.
--
-- Part of docs/revision-plans/penalty-remove-rollforward-plan.md (v2.2), Phase 1d.
-- The stored value was understated by the 30-day rollover's compounding penalties
-- (refresh_one_masterlist_aging only rewrites outstanding_balance on a discount revert).
-- After Phase 1c the un-rolled rows surface that penalty; this sets the stored value to
-- the derived value. ID-scoped — never a table-wide recompute. Quarantined accounts
-- (c91f8a2d, e74fff24, e0296c9a, 3638a07f) are intentionally excluded.
--
-- Must run AFTER 20260909100000_unroll_existing_rolled_rows.sql.

DO $$
DECLARE
  v_id      uuid;
  v_before  numeric;
  v_after   numeric;
  v_n       int := 0;
  v_ids     uuid[] := ARRAY[
    '30ebc0a2-ca92-49c7-b400-10c66754b6e0',
    '9c6f0048-50ca-4481-b738-a13c097beed5',
    '9488b31e-95fa-4fbe-b77c-affedf43af42',
    '9776dcab-88d0-49b2-954d-416888bd4262',
    'd383bea5-d1e2-4472-89d8-4e936888677a',
    '5b3d85b8-4de1-452f-a5fb-beb86148a52c'
  ]::uuid[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.amortization_schedules
    WHERE masterlist_id = ANY(v_ids) AND status = 'rolled'
  ) THEN
    RAISE EXCEPTION
      'Reconcile aborted: an AUTO account still has status=rolled rows. Run '
      '20260909100000_unroll_existing_rolled_rows.sql first.';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT outstanding_balance INTO v_before FROM public.masterlist WHERE id = v_id;
    v_after := public.recompute_outstanding_balance(v_id);

    IF v_after < v_before - 0.01 THEN
      RAISE EXCEPTION
        'Reconcile aborted: account % derived balance (%) is LOWER than stored (%). '
        'Unexpected - investigate before writing.', v_id, v_after, v_before;
    END IF;

    UPDATE public.masterlist SET outstanding_balance = v_after WHERE id = v_id;
    v_n := v_n + 1;
    RAISE NOTICE 'Reconciled % : % -> % (delta +%)', v_id, v_before, v_after, (v_after - v_before);
  END LOOP;

  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Reconcile aborted: expected 6 accounts, updated %.', v_n;
  END IF;
END $$;
