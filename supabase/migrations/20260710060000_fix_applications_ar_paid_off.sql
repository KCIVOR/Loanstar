-- Allow AR to mark loan_active applications as paid_off.
CREATE POLICY applications_ar_paid_off ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('accounting_ar', 'execute_trigger')
      AND status = 'loan_active'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'paid_off'
  );
