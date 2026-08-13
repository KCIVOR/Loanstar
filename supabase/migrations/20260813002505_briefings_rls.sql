-- Collection Head (briefings module) needs RLS access parallel to the old
-- collection-module policies. Additive only: keep *_collector_* policies.

CREATE POLICY release_files_briefings_select ON public.release_files
  FOR SELECT TO authenticated
  USING (public.has_module_permission('briefings', 'view'));

CREATE POLICY briefings_head_select ON public.briefings
  FOR SELECT TO authenticated
  USING (public.has_module_permission('briefings', 'view'));

CREATE POLICY briefings_head_ack ON public.briefings
  FOR UPDATE TO authenticated
  USING (public.has_module_permission('briefings', 'execute_trigger'))
  WITH CHECK (public.has_module_permission('briefings', 'execute_trigger'));

-- Nested loan_applications embeds in the briefings list also need SELECT.
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
    OR public.has_module_permission('briefings', 'view')
  );
