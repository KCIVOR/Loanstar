CREATE TABLE public.rounding_writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX idx_rounding_writeoffs_masterlist ON public.rounding_writeoffs(masterlist_id);
CREATE INDEX idx_rounding_writeoffs_schedule ON public.rounding_writeoffs(amortization_schedule_id);

ALTER TABLE public.rounding_writeoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rounding_writeoffs_select ON public.rounding_writeoffs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
  );

CREATE POLICY rounding_writeoffs_write ON public.rounding_writeoffs
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

INSERT INTO public.config_settings (key, value, description) VALUES
  ('rounding_writeoff_threshold', '1.00'::jsonb, 'Maximum remaining balance (₱) AR can write off as a rounding difference instead of posting a normal payment.')
ON CONFLICT (key) DO NOTHING;
