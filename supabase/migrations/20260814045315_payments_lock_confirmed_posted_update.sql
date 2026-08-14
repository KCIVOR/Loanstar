-- Lock confirmed/posted payment rows from Collector edits, and lock posted from AR edits.
-- Super Admin retains full update access.
--
-- USING (old row):
--   collection:edit  → only pending_verification / rejected (not confirmed/posted)
--   accounting_ar:edit → pending_verification / confirmed / rejected (not posted),
--                        so DCR reconcile can still move confirmed → posted
-- WITH CHECK (new row):
--   permission only — status must not be gated here or DCR submit
--   (pending → confirmed) and AR post (confirmed → posted) fail.

DROP POLICY IF EXISTS payments_collector_update ON public.payments;

CREATE POLICY payments_collector_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('collection', 'edit')
      AND status NOT IN ('confirmed', 'posted')
    )
    OR (
      public.has_module_permission('accounting_ar', 'edit')
      AND status IS DISTINCT FROM 'posted'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'edit')
    OR public.has_module_permission('accounting_ar', 'edit')
  );
