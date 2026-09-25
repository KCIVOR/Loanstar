-- Fix: any authenticated user could always read a document_template_versions
-- row once status = 'published' (see 20260713193306's document_template_versions_select
-- policy comment: "generation will need this ... whichever client it runs
-- under") — but the document-template-assets bucket's own SELECT policy never
-- got the same carve-out, only is_super_admin()/system_config. A non-admin
-- role generating a release document (e.g. LRA officer) has no reason to hold
-- system_config permission, so real generation against a docx-format template
-- was silently blocked by storage RLS (Storage reports that as "not found",
-- not "forbidden") — confirmed live on promissory_note's docx upload.

DROP POLICY IF EXISTS storage_document_template_assets_select ON storage.objects;

CREATE POLICY storage_document_template_assets_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-template-assets'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('system_config', 'view')
      OR EXISTS (
        SELECT 1
        FROM public.document_template_versions v
        WHERE v.docx_storage_path = storage.objects.name
          AND v.status = 'published'
      )
    )
  );
