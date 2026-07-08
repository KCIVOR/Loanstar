-- Phase 4: RLS for verifications and callbacks

ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callbacks ENABLE ROW LEVEL SECURITY;

-- Verifications: CIG + committee only — never borrower/agent
CREATE POLICY verifications_select ON public.verifications
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
  );

CREATE POLICY verifications_write ON public.verifications
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id AND la.status = 'for_verification'
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id AND la.status = 'for_verification'
      )
    )
  );

CREATE POLICY callbacks_select ON public.callbacks
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'view')
  );

CREATE POLICY callbacks_insert ON public.callbacks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'edit')
  );

CREATE POLICY callbacks_update ON public.callbacks
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('verification', 'edit')
  );

-- CIG check recording during verification stage
CREATE POLICY checks_recorded_cig_write ON public.checks_recorded
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'edit')
      AND stage = 'cig'
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id AND la.status = 'for_verification'
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'edit')
      AND stage = 'cig'
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id AND la.status = 'for_verification'
      )
    )
  );

-- CIG may update borrowers during verification
CREATE POLICY borrowers_cig_update ON public.borrowers
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.borrower_id = borrowers.id AND la.status = 'for_verification'
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.borrower_id = borrowers.id AND la.status = 'for_verification'
      )
    )
  );
