-- Phase 12: daily reminder cron via pg_net → POST /api/cron/reminders
-- 01:00 UTC ≈ 09:00 Manila (after aging at 17:00 UTC / 01:00 Manila).
-- Requires config_settings.app_base_url + cron_secret (must match CRON_SECRET env).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_reminder_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
  v_cfg jsonb;
BEGIN
  SELECT value INTO v_cfg FROM public.config_settings WHERE key = 'app_base_url';
  IF v_cfg IS NULL THEN
    RETURN NULL;
  END IF;
  v_url := nullif(trim(both FROM (v_cfg #>> '{}')), '');

  SELECT value INTO v_cfg FROM public.config_settings WHERE key = 'cron_secret';
  IF v_cfg IS NULL THEN
    RETURN NULL;
  END IF;
  v_secret := nullif(trim(both FROM (v_cfg #>> '{}')), '');

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'invoke_reminder_cron skipped: app_base_url or cron_secret not set';
    RETURN NULL;
  END IF;

  -- Strip trailing slash
  v_url := regexp_replace(v_url, '/+$', '');

  SELECT net.http_post(
    url := v_url || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_reminder_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_reminder_cron() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loanstar-reminders-daily') THEN
    PERFORM cron.unschedule('loanstar-reminders-daily');
  END IF;
  PERFORM cron.schedule(
    'loanstar-reminders-daily',
    '0 1 * * *',
    'SELECT public.invoke_reminder_cron()'
  );
END;
$$;
