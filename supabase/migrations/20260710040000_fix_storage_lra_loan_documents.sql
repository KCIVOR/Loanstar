-- LRA uploads release checklist files client-side into loan-documents.
-- Existing storage policies only cover borrower / intake / leads.
CREATE POLICY storage_lra_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('release_lra', 'view')
  );

CREATE POLICY storage_lra_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('release_lra', 'edit')
  );

CREATE POLICY storage_lra_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('release_lra', 'edit')
  )
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('release_lra', 'edit')
  );
