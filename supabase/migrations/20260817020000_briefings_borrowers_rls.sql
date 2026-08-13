-- Collection Head nested borrower embeds need SELECT via briefings:view.
-- Preserve every existing borrowers_select OR-branch; append briefings only.

DROP POLICY IF EXISTS borrowers_select ON public.borrowers;

CREATE POLICY borrowers_select ON public.borrowers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (user_id = auth.uid())
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
    OR public.has_module_permission('briefings', 'view')
  );
