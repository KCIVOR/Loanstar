-- Verification reads application intake attachments without granting CSA Intake.
CREATE POLICY documents_verification_intake_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    stage = 'intake'
    AND (SELECT public.has_module_permission('verification', 'view'))
    AND EXISTS (
      SELECT 1 FROM public.loan_applications a
      WHERE a.id = documents.loan_application_id
        AND a.borrower_id = documents.borrower_id
    )
  );

CREATE POLICY storage_verification_intake_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND (SELECT public.has_module_permission('verification', 'view'))
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = objects.name
        AND d.stage = 'intake'
        AND d.status <> 'pending'
        AND EXISTS (
          SELECT 1 FROM public.loan_applications a
          WHERE a.id = d.loan_application_id
            AND a.borrower_id = d.borrower_id
        )
    )
  );
