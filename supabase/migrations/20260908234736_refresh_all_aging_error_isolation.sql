-- Penalty breakdown — Phase 7: per-account error isolation in the nightly
-- aging/penalty cron.
--
-- refresh_all_aging loops every active/remedial masterlist and calls
-- refresh_one_masterlist_aging with no error handling — one raised exception
-- (e.g. penalty_rate_for_segment raises when masterlist.segment is null or
-- unknown) aborts the whole nightly run, so every account after the bad one is
-- silently not refreshed that night.
--
-- Fix: wrap the per-account call in a BEGIN ... EXCEPTION block (its own
-- savepoint) so a failure rolls back only that account and the loop continues.
-- A WARNING per failure plus a summary line lands in the Postgres log. The
-- return type stays `integer` (successful count) — the cron command
-- `SELECT public.refresh_all_aging()` is unchanged.
--
-- Surgical scope: only refresh_all_aging's loop body. refresh_one_masterlist_aging
-- and every other function are untouched.

create or replace function public.refresh_all_aging()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r RECORD;
  v_count int := 0;
  v_failed int := 0;
BEGIN
  FOR r IN SELECT id FROM public.masterlist WHERE account_status IN ('active', 'remedial')
  LOOP
    BEGIN
      PERFORM public.refresh_one_masterlist_aging(r.id, CURRENT_DATE);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'refresh_all_aging: masterlist % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE WARNING 'refresh_all_aging: % refreshed, % failed (of % active/remedial)',
      v_count, v_failed, v_count + v_failed;
  END IF;

  RETURN v_count;
END;
$function$;
