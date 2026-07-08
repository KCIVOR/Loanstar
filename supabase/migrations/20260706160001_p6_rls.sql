-- Phase 6: RLS for LRA tables + immutability on finalized generated docs

ALTER TABLE public.release_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdc_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_queue ENABLE ROW LEVEL SECURITY;

-- release_files
CREATE POLICY release_files_select ON public.release_files
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'view')
    OR EXISTS (
      SELECT 1 FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY release_files_write ON public.release_files
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  );

-- pdc_checks
CREATE POLICY pdc_checks_select ON public.pdc_checks
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'view')
    OR EXISTS (
      SELECT 1 FROM public.release_files rf
      JOIN public.loan_applications la ON la.id = rf.loan_application_id
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE rf.id = release_file_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY pdc_checks_write ON public.pdc_checks
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  );

-- generated_documents: CSA/Committee blocked when finalized (no policy = denied)
CREATE POLICY generated_documents_lra_select ON public.generated_documents
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('release_lra', 'view')
    OR EXISTS (
      SELECT 1 FROM public.release_files rf
      JOIN public.loan_applications la ON la.id = rf.loan_application_id
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE rf.id = release_file_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY generated_documents_lra_insert ON public.generated_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  );

CREATE POLICY generated_documents_lra_update ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    is_finalized = false
    AND (
      public.is_super_admin()
      OR public.has_module_permission('release_lra', 'edit')
      OR EXISTS (
        SELECT 1 FROM public.release_files rf
        JOIN public.loan_applications la ON la.id = rf.loan_application_id
        JOIN public.borrowers b ON b.id = la.borrower_id
        WHERE rf.id = release_file_id
          AND b.user_id = auth.uid()
          AND signed_at IS NULL
      )
    )
  )
  WITH CHECK (is_finalized = false);

CREATE POLICY generated_documents_borrower_sign ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    is_finalized = false
    AND signed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.release_files rf
      JOIN public.loan_applications la ON la.id = rf.loan_application_id
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE rf.id = release_file_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (is_finalized = false);

-- briefings
CREATE POLICY briefings_select ON public.briefings
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'view')
  );

CREATE POLICY briefings_write ON public.briefings
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'edit')
    OR public.has_module_permission('release_lra', 'execute_trigger')
  );

-- release_events
CREATE POLICY release_events_select ON public.release_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
  );

CREATE POLICY release_events_insert ON public.release_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'execute_trigger')
  );

-- ar_queue (P7 handoff stub)
CREATE POLICY ar_queue_select ON public.ar_queue
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('release_lra', 'view')
  );

CREATE POLICY ar_queue_insert ON public.ar_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('release_lra', 'execute_trigger')
  );

-- Prevent mutation of finalized generated documents (even super admin via API layer;
-- DB update policy already blocks is_finalized = true rows)

CREATE OR REPLACE FUNCTION public.prevent_finalized_generated_doc_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_finalized = true THEN
    RAISE EXCEPTION 'Finalized release documents cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generated_documents_immutable_when_finalized
  BEFORE UPDATE OR DELETE ON public.generated_documents
  FOR EACH ROW
  WHEN (OLD.is_finalized = true)
  EXECUTE FUNCTION public.prevent_finalized_generated_doc_mutation();
