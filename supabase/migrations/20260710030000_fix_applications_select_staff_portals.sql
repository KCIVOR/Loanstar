-- Staff portals that already see queue rows must also SELECT loan_applications.
-- Without this, embedded joins return null ("Unknown") and detail APIs 404.
DROP POLICY IF EXISTS applications_select ON public.loan_applications;

CREATE POLICY applications_select ON public.loan_applications
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR agent_user_id = auth.uid()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('leads', 'view')
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
    OR public.has_module_permission('reports', 'view')
  );
