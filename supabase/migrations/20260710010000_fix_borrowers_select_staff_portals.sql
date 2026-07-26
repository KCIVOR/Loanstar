-- Staff portals can SELECT borrower identity for queue labels.
-- applications_select already grants them loan_applications rows;
-- without matching borrowers SELECT, embedded joins return null
-- and UIs fall back to "Unknown".
DROP POLICY IF EXISTS borrowers_select ON public.borrowers;

CREATE POLICY borrowers_select ON public.borrowers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('leads', 'view')
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
  );
