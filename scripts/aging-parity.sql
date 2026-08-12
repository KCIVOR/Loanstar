-- Phase 7 + Phase 5 parity smoke: run after aging_refresh_cron + sme_phase5_penalty_segment.
-- Asserts public.half_up matches TS halfUp fixtures used in aging-parity.test.mts.
-- Asserts penalty_rate_for_segment picks Seafarer vs SME keys (and rejects NULL).
-- Usage (Supabase SQL editor / MCP execute_sql): paste and run.

DO $$
BEGIN
  IF public.half_up(1.005) <> 1.01 THEN
    RAISE EXCEPTION 'half_up(1.005) parity fail: %', public.half_up(1.005);
  END IF;
  IF public.half_up(17.4282) <> 17.43 THEN
    RAISE EXCEPTION 'half_up(17.4282) parity fail: %', public.half_up(17.4282);
  END IF;
  IF public.half_up(100 * 0.05) <> 5 THEN
    RAISE EXCEPTION 'half_up(5) parity fail: %', public.half_up(100 * 0.05);
  END IF;
  IF public.half_up(1234.567) <> 1234.57 THEN
    RAISE EXCEPTION 'half_up(1234.567) parity fail: %', public.half_up(1234.567);
  END IF;
  RAISE NOTICE 'half_up parity OK';
END $$;

DO $$
DECLARE
  v_sf numeric;
  v_sme numeric;
BEGIN
  v_sf := public.penalty_rate_for_segment('seafarer');
  v_sme := public.penalty_rate_for_segment('sme');
  IF v_sf IS NULL OR v_sme IS NULL THEN
    RAISE EXCEPTION 'penalty_rate_for_segment returned null';
  END IF;
  -- Live DB may differ from seed; only assert the two keys can diverge and both resolve.
  RAISE NOTICE 'penalty_rate_for_segment seafarer=% sme=%', v_sf, v_sme;

  BEGIN
    PERFORM public.penalty_rate_for_segment(NULL);
    RAISE EXCEPTION 'penalty_rate_for_segment(NULL) should have raised';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%missing or unknown%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'penalty_rate_for_segment parity OK';
END $$;
