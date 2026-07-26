-- Same gap as borrowers_insert (see 20260715000000): CSA creating a new
-- application only holds `intake` permissions, not `leads`/`borrower_portal`,
-- so applications_insert's WITH CHECK never had a branch for it — CSA intake
-- failed with "new row violates row-level security policy for table
-- loan_applications" immediately after the borrowers fix took effect.
DROP POLICY IF EXISTS applications_insert ON public.loan_applications;

CREATE POLICY applications_insert ON public.loan_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('leads', 'create')
    OR public.has_module_permission('borrower_portal', 'create')
    OR public.has_module_permission('intake', 'create')
  );
