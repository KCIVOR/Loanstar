-- AR flow alignment: explicit AR receive step, deposit-amount check on DCR
-- reconciliation, 3-day clearing tracking, and the accounting-stage checklist.

-- (B) Clearing period tracking: stamped when AR flips clearing status to
-- 'clearing'; UI flags accounts past 3 days.
ALTER TABLE public.masterlist
  ADD COLUMN clearing_started_at timestamptz;

-- (C) Deposit cross-check: the confirmed bank deposit amount recorded at
-- reconciliation. Must equal the DCR total (enforced in the service layer).
ALTER TABLE public.dcr
  ADD COLUMN deposit_amount numeric(14,2);

-- (D) Accounting-stage checklist: AR uploads documents client-side into
-- loan-documents, same pattern as LRA (20260710040000).
CREATE POLICY documents_ar_select ON public.documents
  FOR SELECT TO authenticated
  USING (public.has_module_permission('accounting_ar', 'view'));

CREATE POLICY documents_ar_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('accounting_ar', 'edit'));

CREATE POLICY documents_ar_update ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_module_permission('accounting_ar', 'edit'))
  WITH CHECK (public.has_module_permission('accounting_ar', 'edit'));

CREATE POLICY storage_ar_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('accounting_ar', 'view')
  );

CREATE POLICY storage_ar_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('accounting_ar', 'edit')
  );

CREATE POLICY storage_ar_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('accounting_ar', 'edit')
  )
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('accounting_ar', 'edit')
  );
