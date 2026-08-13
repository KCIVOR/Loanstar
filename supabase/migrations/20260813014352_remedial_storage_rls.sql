-- Fix: Remedial users get "new row violates row-level security policy" when
-- uploading a payment-proof file (Record payment modal). The RLS fix in
-- remedial_payment_rls (20260813011700) covered the payments/dcr tables, but
-- the proof file upload writes directly to storage.objects (bucket
-- loan-documents) client-side, and storage_collector_insert/select were
-- still hardcoded to the collection module only. Additive: existing
-- collector policies are untouched.

create policy storage_remedial_insert on storage.objects
  for insert
  with check (
    bucket_id = 'loan-documents'
    and has_module_permission('remedial', 'edit')
  );

create policy storage_remedial_select on storage.objects
  for select
  using (
    bucket_id = 'loan-documents'
    and has_module_permission('remedial', 'view')
  );
