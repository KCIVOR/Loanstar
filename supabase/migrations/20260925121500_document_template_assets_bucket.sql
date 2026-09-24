-- Storage bucket for uploaded docx-format document templates (see
-- 20260925120000_document_template_docx_format.sql). Separate from
-- loan-documents: these are admin-authored template assets, not borrower PII,
-- so gating matches document_templates' own RLS (is_super_admin() or
-- system_config edit/view) rather than the borrower-folder pattern.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-template-assets',
  'document-template-assets',
  false,
  10485760,
  ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_document_template_assets_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-template-assets'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('system_config', 'view')
    )
  );

CREATE POLICY storage_document_template_assets_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-template-assets'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('system_config', 'edit')
    )
  );

CREATE POLICY storage_document_template_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'document-template-assets'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('system_config', 'edit')
    )
  );

CREATE POLICY storage_document_template_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-template-assets'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('system_config', 'edit')
    )
  );
