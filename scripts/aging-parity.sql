-- Phase 7 parity smoke: run after aging_refresh_cron migration.
-- Asserts public.half_up matches TS halfUp fixtures used in aging-parity.test.mts.
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
