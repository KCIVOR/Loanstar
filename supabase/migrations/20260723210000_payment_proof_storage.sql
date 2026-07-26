-- Allow phone-camera HEIC/HEIF for payment receipts (product decision C).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]::text[]
WHERE id = 'loan-documents';

-- Collectors need SELECT to createSignedUrl for payment proofs.
CREATE POLICY storage_collector_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('collection', 'view')
  );
