-- ===========================================================================
-- Phase 1 — Document Template System: schema (additive, dormant)
--
-- See docs/document-template-system-plan.md §4 "Phase 1".
--
-- Introduces superadmin-editable document templates with immutable, versioned
-- bodies. NOTHING reads these tables yet — this migration is purely additive and
-- changes no existing behavior. The `generated_documents.template_version_id`
-- column is nullable (null = produced by the legacy hardcoded renderer).
--
-- Design references from this repo (matched intentionally):
--   * RLS gating via public.is_super_admin() / public.has_module_permission()
--   * `email_templates` table (system_config-gated) as the closest precedent
--   * public.set_updated_at() BEFORE UPDATE trigger convention
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- document_templates — one row per document type (slug is the join key that
-- release/other generators will resolve against, e.g. 'blri', 'demand_letter').
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_templates IS
  'Superadmin-editable document types. One row per document (blri, promissory_note, demand_letter, ...). Bodies live in document_template_versions.';

CREATE TRIGGER document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- document_template_versions — immutable, numbered versions of a template body.
-- Publishing a new version supersedes the prior published one (app archives the
-- old version in the same transaction; the partial unique index below enforces
-- at most one 'published' version per template at the DB level).
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  body text NOT NULL,
  merge_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no)
);

COMMENT ON TABLE public.document_template_versions IS
  'Immutable versioned bodies (HTML) for a document_template. Once published, body/merge_fields are frozen by the guard_template_version_immutability trigger.';

CREATE INDEX idx_document_template_versions_template
  ON public.document_template_versions(template_id);

-- At most one published version per template (superseding is: archive old, publish new).
CREATE UNIQUE INDEX idx_document_template_versions_one_published
  ON public.document_template_versions(template_id)
  WHERE status = 'published';

CREATE TRIGGER document_template_versions_updated_at
  BEFORE UPDATE ON public.document_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutability guard: once a version leaves 'draft', its content is frozen and
-- the only allowed status move is published -> archived (supersede). Draft rows
-- remain freely editable so the editor can iterate before publishing.
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

CREATE TRIGGER document_template_versions_immutability
  BEFORE UPDATE ON public.document_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_template_version_immutability();

-- ---------------------------------------------------------------------------
-- generated_documents.template_version_id — version pinning for audit.
-- Nullable: null means the row was produced by the legacy hardcoded renderer.
-- ON DELETE SET NULL so purging a template version never destroys the audit row
-- of an already-generated document (the PDF bytes are frozen in storage anyway).
-- ---------------------------------------------------------------------------
ALTER TABLE public.generated_documents
  ADD COLUMN template_version_id uuid
    REFERENCES public.document_template_versions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RLS — matches the loan_types / email_templates pattern (system_config module).
-- Reads: authenticated staff may read ACTIVE templates and PUBLISHED versions
--        (generation will need this in Phase 4, whichever client it runs under);
--        drafts / inactive rows are visible only to system_config viewers.
-- Writes: system_config 'edit' (or superadmin) only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_templates_select ON public.document_templates
  FOR SELECT TO authenticated
  USING (
    is_active
    OR public.is_super_admin()
    OR public.has_module_permission('system_config', 'view')
  );

CREATE POLICY document_templates_write ON public.document_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

CREATE POLICY document_template_versions_select ON public.document_template_versions
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.is_super_admin()
    OR public.has_module_permission('system_config', 'view')
  );

CREATE POLICY document_template_versions_write ON public.document_template_versions
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));
