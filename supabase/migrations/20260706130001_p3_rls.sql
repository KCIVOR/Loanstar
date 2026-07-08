-- Phase 3: RLS for CSA tables

ALTER TABLE public.application_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checks_recorded ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY application_details_select ON public.application_details
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('verification', 'view')
    OR EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY application_details_write ON public.application_details
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  );

CREATE POLICY checks_recorded_select ON public.checks_recorded
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('verification', 'view')
  );

CREATE POLICY checks_recorded_write ON public.checks_recorded
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  );

CREATE POLICY computations_select ON public.computations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('computation', 'view')
    OR public.has_module_permission('verification', 'view')
    OR EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY computations_insert ON public.computations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('computation', 'create')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  );

CREATE POLICY computations_update ON public.computations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('computation', 'edit')
      AND signed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.loan_applications la
        JOIN public.borrowers b ON b.id = la.borrower_id
        WHERE la.id = loan_application_id
          AND b.user_id = auth.uid()
      )
      AND signed_at IS NULL
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR signed_by IS NOT NULL
    OR (
      public.has_module_permission('computation', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
  );

CREATE POLICY file_holds_select ON public.file_holds
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'view')
  );

CREATE POLICY file_holds_insert ON public.file_holds
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('intake', 'edit')
  );

-- CSA/computation roles can read active loan types for intake
CREATE POLICY loan_types_intake_select ON public.loan_types
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('intake', 'view')
    OR public.has_module_permission('computation', 'view')
  );
