-- ROLLBACK for 20260925120000_document_template_docx_format.sql +
-- 20260925121500_document_template_assets_bucket.sql (the "Upload a Word
-- file as template" feature's schema + storage bucket).
--
-- NOT applied automatically, NOT part of the normal forward-migration
-- sequence (deliberately prefixed ROLLBACK_ so Supabase won't pick it up
-- as a numbered migration to run in order) — apply this by hand, and only
-- while it's still safe to do so.
--
-- SAFE WINDOW: only before any document_template_versions row actually has
-- format='docx' (i.e. before anyone has uploaded and saved a docx-format
-- draft through the new Admin UI). Once a real docx draft/published version
-- exists, the two DROP COLUMN statements below would destroy that data —
-- check first:
--
--   SELECT count(*) FROM public.document_template_versions WHERE format = 'docx';
--
-- If that's not zero, do not run this file as-is — decide what to do with
-- those rows/files first (the "document-template-assets" bucket delete at
-- the bottom will also fail while it still holds uploaded files).

-- ---------------------------------------------------------------------------
-- Reverse 20260925121500_document_template_assets_bucket.sql
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS storage_document_template_assets_select ON storage.objects;
DROP POLICY IF EXISTS storage_document_template_assets_insert ON storage.objects;
DROP POLICY IF EXISTS storage_document_template_assets_update ON storage.objects;
DROP POLICY IF EXISTS storage_document_template_assets_delete ON storage.objects;

-- Only succeeds while the bucket is empty.
DELETE FROM storage.buckets WHERE id = 'document-template-assets';

-- ---------------------------------------------------------------------------
-- Reverse 20260925120000_document_template_docx_format.sql
-- ---------------------------------------------------------------------------

-- Restore guard_template_version_immutability to its exact pre-feature body
-- (from 20260713193306_p8_document_templates.sql) — drops the
-- format/docx_storage_path checks this feature added.
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
       OR NEW.template_id IS DISTINCT FROM OLD.template_id THEN
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

ALTER TABLE public.document_template_versions
  DROP CONSTRAINT IF EXISTS document_template_versions_format_payload_chk;

-- Re-adding NOT NULL only succeeds if every row's body is non-null, i.e. no
-- docx-format row exists — see the SAFE WINDOW check above.
ALTER TABLE public.document_template_versions
  ALTER COLUMN body SET NOT NULL,
  DROP COLUMN IF EXISTS format,
  DROP COLUMN IF EXISTS docx_storage_path;
