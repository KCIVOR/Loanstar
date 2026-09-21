-- Allow a Remedial officer to review (confirm/reject) payment proofs, but only
-- on accounts where assignments.remedial_user_id = auth.uid(), gated by
-- remedial:edit. Mirrors the additive INSERT branch added in
-- 20260813011700_remedial_payment_rls.sql.
--
-- The super-admin, collection:edit and accounting_ar:edit branches are
-- preserved verbatim from 20260814045315_payments_lock_confirmed_posted_update.sql.
-- USING (old row): remedial branch, like collection, cannot touch
--   confirmed/posted rows.
-- WITH CHECK (new row): assignment ownership only — status is not gated here
--   or the pending -> confirmed transition would fail.

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
    OR (
      public.has_module_permission('remedial', 'edit')
      AND status NOT IN ('confirmed', 'posted')
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.masterlist_id = payments.masterlist_id
          AND a.remedial_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'edit')
    OR public.has_module_permission('accounting_ar', 'edit')
    OR (
      public.has_module_permission('remedial', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.masterlist_id = payments.masterlist_id
          AND a.remedial_user_id = auth.uid()
      )
    )
  );
