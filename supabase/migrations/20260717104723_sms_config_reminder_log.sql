-- Phase 12: SMS config seeds + reminder_log (once per installment/channel).

INSERT INTO public.config_settings (key, value, description) VALUES
  ('sms_enabled', 'false'::jsonb, 'Enable Twilio SMS sending'),
  ('twilio_account_sid', '""'::jsonb, 'Twilio Account SID'),
  ('twilio_auth_token', '""'::jsonb, 'Twilio Auth Token (masked on GET)'),
  ('twilio_from_number', '""'::jsonb, 'Twilio from number (E.164)'),
  ('app_base_url', '""'::jsonb, 'Public app URL for reminder cron webhooks'),
  ('cron_secret', '""'::jsonb, 'Shared secret for /api/cron/* (must match CRON_SECRET env)')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  installment_no integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  is_resend boolean NOT NULL DEFAULT false,
  UNIQUE (masterlist_id, installment_no, channel)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_masterlist
  ON public.reminder_log (masterlist_id);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- Collectors see logs for accounts assigned to them
CREATE POLICY reminder_log_collector_select ON public.reminder_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = reminder_log.masterlist_id
        AND a.collector_user_id = auth.uid()
    )
  );

-- AR + system_config can view all
CREATE POLICY reminder_log_staff_select ON public.reminder_log
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('ar', 'view')
    OR public.has_module_permission('system_config', 'view')
  );

-- Writers: collectors (own assignments) + service role bypasses RLS
CREATE POLICY reminder_log_collector_insert ON public.reminder_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = reminder_log.masterlist_id
        AND a.collector_user_id = auth.uid()
    )
    OR public.has_module_permission('system_config', 'edit')
  );

CREATE POLICY reminder_log_collector_update ON public.reminder_log
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = reminder_log.masterlist_id
        AND a.collector_user_id = auth.uid()
    )
    OR public.has_module_permission('system_config', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = reminder_log.masterlist_id
        AND a.collector_user_id = auth.uid()
    )
    OR public.has_module_permission('system_config', 'edit')
  );
