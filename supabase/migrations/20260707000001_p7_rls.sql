-- Phase 7: RLS for AR, collection, remedial tables

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masterlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amortization_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remedial_turnovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_contacts ENABLE ROW LEVEL SECURITY;

-- portfolios
CREATE POLICY portfolios_select ON public.portfolios
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
  );

CREATE POLICY portfolios_write ON public.portfolios
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

-- masterlist
CREATE POLICY masterlist_ar_select ON public.masterlist
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = id
        AND a.collector_user_id = auth.uid()
        AND remedial_flag = false
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = id
        AND a.remedial_user_id = auth.uid()
        AND remedial_flag = true
    )
  );

CREATE POLICY masterlist_ar_write ON public.masterlist
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

-- assignments
CREATE POLICY assignments_select ON public.assignments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR collector_user_id = auth.uid()
    OR remedial_user_id = auth.uid()
  );

CREATE POLICY assignments_write ON public.assignments
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

-- amortization_schedules
CREATE POLICY amortization_select ON public.amortization_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
    OR EXISTS (
      SELECT 1 FROM public.masterlist m
      JOIN public.borrowers b ON b.id = m.borrower_id
      WHERE m.id = masterlist_id AND b.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = amortization_schedules.masterlist_id
        AND (a.collector_user_id = auth.uid() OR a.remedial_user_id = auth.uid())
    )
  );

CREATE POLICY amortization_ar_write ON public.amortization_schedules
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

-- payments
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = payments.masterlist_id
        AND (a.collector_user_id = auth.uid() OR a.remedial_user_id = auth.uid())
    )
  );

CREATE POLICY payments_borrower_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY payments_collector_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'edit')
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'edit')
    OR public.has_module_permission('accounting_ar', 'edit')
  );

-- dcr
CREATE POLICY dcr_select ON public.dcr
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR collector_user_id = auth.uid()
  );

CREATE POLICY dcr_collector_write ON public.dcr
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('collection', 'edit')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('collection', 'edit')
    )
  );

CREATE POLICY dcr_ar_reconcile ON public.dcr
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'execute_trigger')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'execute_trigger')
  );

-- dcr_items
CREATE POLICY dcr_items_select ON public.dcr_items
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR EXISTS (
      SELECT 1 FROM public.dcr d
      WHERE d.id = dcr_id AND d.collector_user_id = auth.uid()
    )
  );

CREATE POLICY dcr_items_write ON public.dcr_items
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.dcr d
      WHERE d.id = dcr_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('collection', 'edit')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.dcr d
      WHERE d.id = dcr_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('collection', 'edit')
    )
  );

-- postings
CREATE POLICY postings_select ON public.postings
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR EXISTS (
      SELECT 1 FROM public.masterlist m
      JOIN public.borrowers b ON b.id = m.borrower_id
      WHERE m.id = masterlist_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY postings_insert ON public.postings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'execute_trigger')
  );

-- penalties, remedial_turnovers, collector_contacts
CREATE POLICY penalties_select ON public.penalties
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
  );

CREATE POLICY penalties_write ON public.penalties
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );

CREATE POLICY remedial_turnovers_select ON public.remedial_turnovers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('remedial', 'view')
  );

CREATE POLICY remedial_turnovers_write ON public.remedial_turnovers
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'execute_trigger')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'execute_trigger')
  );

CREATE POLICY collector_contacts_select ON public.collector_contacts
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR collector_user_id = auth.uid()
    OR public.has_module_permission('remedial', 'view')
  );

CREATE POLICY collector_contacts_write ON public.collector_contacts
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND (
        public.has_module_permission('collection', 'edit')
        OR public.has_module_permission('remedial', 'edit')
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND (
        public.has_module_permission('collection', 'edit')
        OR public.has_module_permission('remedial', 'edit')
      )
    )
  );

-- ar_queue update for AR processing
CREATE POLICY ar_queue_update ON public.ar_queue
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'edit')
  );
