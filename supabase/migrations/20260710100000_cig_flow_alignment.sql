-- CIG flow alignment with the client's original CI process:
-- 1. Borrower direct-interview section on the verification form
-- 2. Crewing manager "Fit to Work" and character-reference other-lender fields
-- 3. denial_notices: Committee denials route back to CIG for the borrower call
--    (no reason column on purpose — CIG must not see why the loan was denied)
-- 4. CIG may return an incomplete file to CSA (for_verification → submitted)

ALTER TABLE public.verifications
  ADD COLUMN bi_identity_confirmed boolean,
  ADD COLUMN bi_purpose_confirmed boolean,
  ADD COLUMN bi_details_confirmed boolean,
  ADD COLUMN bi_notes text,
  ADD COLUMN cm_fit_to_work boolean,
  ADD COLUMN char_ref_other_lenders boolean;

CREATE TABLE public.denial_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  committee_action_id uuid REFERENCES public.committee_actions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  informed_at timestamptz,
  informed_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_denial_notices_pending ON public.denial_notices(created_at)
  WHERE informed_at IS NULL;

ALTER TABLE public.denial_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY denial_notices_select ON public.denial_notices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
  );

CREATE POLICY denial_notices_insert ON public.denial_notices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'execute_trigger')
  );

-- verification edit: CIG marks the call done; committee execute_trigger:
-- re-denial after a revisit upserts over the existing notice row.
CREATE POLICY denial_notices_update ON public.denial_notices
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'edit')
    OR public.has_module_permission('committee', 'execute_trigger')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'edit')
    OR public.has_module_permission('committee', 'execute_trigger')
  );

-- CIG return-to-CSA on a failed receipt check. Permissive UPDATE policies are
-- OR'd with applications_cig_forward, so CIG can move a for_verification file
-- to either for_approval (forward) or submitted (return).
CREATE POLICY applications_cig_return ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'execute_trigger')
      AND status = 'for_verification'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'submitted'
  );
