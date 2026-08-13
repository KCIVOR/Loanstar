CREATE POLICY payments_collector_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('collection', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.masterlist_id = payments.masterlist_id
          AND a.collector_user_id = auth.uid()
      )
    )
  );

CREATE POLICY storage_collector_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('collection', 'edit')
  );
