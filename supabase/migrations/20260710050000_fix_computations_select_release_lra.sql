DROP POLICY IF EXISTS computations_select ON public.computations;

CREATE POLICY computations_select ON public.computations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('computation', 'view')
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('release_lra', 'view')
    OR EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id AND b.user_id = auth.uid()
    )
  );
