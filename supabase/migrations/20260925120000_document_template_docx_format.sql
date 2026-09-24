-- Upload-a-Word-file-as-template (see docs plan) — adds a second, parallel
-- template body format alongside the existing HTML/TipTap one. Additive only:
-- every existing row defaults to format='html' and behaves exactly as before.
--
-- A 'docx' version stores its filled-at-render-time source file in Storage
-- (bucket document-template-assets) rather than an HTML string in `body`;
-- `docx_storage_path` holds that path. Exactly one of body/docx_storage_path
-- is populated, matching `format` — enforced by the CHECK below, not just by
-- convention, so a half-populated row can never be published.

ALTER TABLE public.document_template_versions
  ADD COLUMN format text NOT NULL DEFAULT 'html' CHECK (format IN ('html', 'docx')),
  ADD COLUMN docx_storage_path text,
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.document_template_versions
  ADD CONSTRAINT document_template_versions_format_payload_chk
  CHECK (
    (format = 'html' AND body IS NOT NULL AND docx_storage_path IS NULL)
    OR
    (format = 'docx' AND docx_storage_path IS NOT NULL AND body IS NULL)
  );

COMMENT ON COLUMN public.document_template_versions.format IS
  'html: body is the merge-field HTML string (existing TipTap system). docx: docx_storage_path points at an uploaded .docx filled via docxtemplater and converted to PDF via Gotenberg''s LibreOffice route.';
COMMENT ON COLUMN public.document_template_versions.docx_storage_path IS
  'Storage path in the document-template-assets bucket, format templates/{templateId}/{versionId}.docx. Null for format=''html'' rows.';

-- Extend the existing immutability guard to also freeze format/docx_storage_path
-- once a version leaves 'draft' — same rule the trigger already applies to
-- body/merge_fields/version_no/template_id.
CREATE OR REPLACE FUNCTION public.guard_template_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') THEN
    IF NEW.body IS DISTINCT FROM OLD.body
       OR NEW.merge_fields IS DISTINCT FROM OLD.merge_fields
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.format IS DISTINCT FROM OLD.format
       OR NEW.docx_storage_path IS DISTINCT FROM OLD.docx_storage_path THEN
      RAISE EXCEPTION
        'Published/archived template versions are immutable (template %, version %).',
        OLD.template_id, OLD.version_no;
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
      RAISE EXCEPTION 'Archived template versions cannot change status.';
    END IF;

    IF OLD.status = 'published'
       AND NEW.status NOT IN ('published', 'archived') THEN
      RAISE EXCEPTION 'A published version may only be archived, not reverted.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
