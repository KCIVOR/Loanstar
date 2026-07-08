-- Phase 5: RLS for committee and negotiation tables

ALTER TABLE public.committee_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisit_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY committee_votes_select ON public.committee_votes
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'view')
  );

CREATE POLICY committee_votes_insert ON public.committee_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('committee', 'edit')
      AND voter_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id AND la.status = 'for_approval'
      )
    )
  );

CREATE POLICY committee_actions_select ON public.committee_actions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'view')
  );

CREATE POLICY committee_actions_insert ON public.committee_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'execute_trigger')
  );

CREATE POLICY revisit_notices_select ON public.revisit_notices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'view')
    OR (
      route_to = 'csa' AND public.has_module_permission('intake', 'view')
    )
    OR (
      route_to = 'cig' AND public.has_module_permission('verification', 'view')
    )
  );

CREATE POLICY revisit_notices_write ON public.revisit_notices
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'execute_trigger')
    OR (
      route_to = 'csa'
      AND public.has_module_permission('intake', 'edit')
    )
    OR (
      route_to = 'cig'
      AND public.has_module_permission('verification', 'edit')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'execute_trigger')
    OR (
      route_to = 'csa'
      AND public.has_module_permission('intake', 'edit')
    )
    OR (
      route_to = 'cig'
      AND public.has_module_permission('verification', 'edit')
    )
  );

CREATE POLICY negotiations_select ON public.negotiations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('negotiation', 'view')
    OR public.has_module_permission('committee', 'view')
    OR EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY negotiations_write ON public.negotiations
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('negotiation', 'edit')
    OR public.has_module_permission('committee', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('negotiation', 'edit')
    OR public.has_module_permission('committee', 'edit')
  );

CREATE POLICY release_queue_select ON public.release_queue
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('negotiation', 'view')
  );

CREATE POLICY release_queue_insert ON public.release_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('borrower_portal', 'edit')
    OR public.has_module_permission('negotiation', 'execute_trigger')
  );

-- Borrower cannot read committee votes/actions (no policy = denied)
