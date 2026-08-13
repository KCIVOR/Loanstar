-- Phase 1: allow Remedial to INSERT payments and write DCR/DCR items on
-- accounts where assignments.remedial_user_id = auth.uid(), gated by
-- remedial:edit. Additive OR-branches only; existing collector/super-admin
-- branches preserved verbatim.
--
-- dcr_select / dcr_items_select: confirmed live already allow
-- collector_user_id = auth.uid() (and the equivalent EXISTS join) without a
-- collection module check. That is sufficient for Remedial-owned rows once
-- dcr.collector_user_id holds the Remedial user's id — left unchanged.

DROP POLICY IF EXISTS payments_collector_insert ON public.payments;

CREATE POLICY payments_collector_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('collection', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.masterlist_id = payments.masterlist_id
          AND a.collector_user_id = auth.uid()
      )
    )
    OR (
      public.has_module_permission('remedial', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.masterlist_id = payments.masterlist_id
          AND a.remedial_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS dcr_collector_write ON public.dcr;

CREATE POLICY dcr_collector_write ON public.dcr
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('collection', 'edit')
    )
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('remedial', 'edit')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('collection', 'edit')
    )
    OR (
      collector_user_id = auth.uid()
      AND public.has_module_permission('remedial', 'edit')
    )
  );

DROP POLICY IF EXISTS dcr_items_write ON public.dcr_items;

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
    OR EXISTS (
      SELECT 1 FROM public.dcr d
      WHERE d.id = dcr_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('remedial', 'edit')
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
    OR EXISTS (
      SELECT 1 FROM public.dcr d
      WHERE d.id = dcr_id
        AND d.collector_user_id = auth.uid()
        AND d.status = 'draft'
        AND public.has_module_permission('remedial', 'edit')
    )
  );
