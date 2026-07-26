-- Phase 3: committee_hold is distinct from CSA on_hold (which is CSA-editable).
-- Widen committee UPDATE RLS so members can move for_approval → committee_hold → resolve.

DROP POLICY IF EXISTS applications_committee_action ON public.loan_applications;

CREATE POLICY applications_committee_action ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('committee', 'execute_trigger')
      AND status IN ('for_approval', 'negotiating_terms', 'committee_hold')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status IN (
      'approved',
      'denied',
      'for_revision',
      'on_hold',
      'committee_hold',
      'for_approval',
      'negotiating_terms',
      'awaiting_confirmation',
      'lra_pending'
    )
  );
