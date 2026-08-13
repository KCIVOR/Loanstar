CREATE TABLE public.dcr_item_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcr_item_id uuid NOT NULL REFERENCES public.dcr_items(id) ON DELETE CASCADE,
  amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dcr_item_allocations_item ON public.dcr_item_allocations(dcr_item_id);
CREATE INDEX idx_dcr_item_allocations_schedule ON public.dcr_item_allocations(amortization_schedule_id);

ALTER TABLE public.dcr_item_allocations ENABLE ROW LEVEL SECURITY;

-- Mirror dcr_items RLS (from 20260707000001_p7_rls.sql lines 201-234):
-- SELECT: super_admin OR accounting_ar view OR collector owns parent dcr
-- WRITE (ALL): super_admin OR collector owns draft dcr with collection edit

CREATE POLICY dcr_item_allocations_select ON public.dcr_item_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR EXISTS (
      SELECT 1 FROM public.dcr_items di
      JOIN public.dcr d ON d.id = di.dcr_id
      WHERE di.id = dcr_item_id AND d.collector_user_id = auth.uid()
    )
  );

CREATE POLICY dcr_item_allocations_write ON public.dcr_item_allocations
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.dcr_items di
      JOIN public.dcr d ON d.id = di.dcr_id
      WHERE di.id = dcr_item_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('collection', 'edit')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.dcr_items di
      JOIN public.dcr d ON d.id = di.dcr_id
      WHERE di.id = dcr_item_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('collection', 'edit')
    )
  );
