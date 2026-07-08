-- Phase 6 completion: LRA document uploads + borrower briefing sign-off

CREATE POLICY documents_lra_select ON public.documents
  FOR SELECT TO authenticated
  USING (public.has_module_permission('release_lra', 'view'));

CREATE POLICY documents_lra_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('release_lra', 'edit'));

CREATE POLICY documents_lra_update ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_module_permission('release_lra', 'edit'))
  WITH CHECK (public.has_module_permission('release_lra', 'edit'));

CREATE POLICY briefings_borrower_select ON public.briefings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.release_files rf
      JOIN public.loan_applications la ON la.id = rf.loan_application_id
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE rf.id = release_file_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY briefings_borrower_sign ON public.briefings
  FOR UPDATE TO authenticated
  USING (
    acknowledged_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.release_files rf
      JOIN public.loan_applications la ON la.id = rf.loan_application_id
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE rf.id = release_file_id
        AND b.user_id = auth.uid()
        AND rf.status = 'awaiting_briefing'
    )
  )
  WITH CHECK (acknowledged_at IS NOT NULL);
