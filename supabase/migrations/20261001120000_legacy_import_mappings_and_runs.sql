-- Legacy data import (dry-run only): saved column mappings + validation audit log.
-- Super-admin-only on every operation. No borrower/loan data is written by this feature.

CREATE TABLE IF NOT EXISTS public.legacy_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  segment text NOT NULL CHECK (segment IN ('seafarer', 'sme')),
  header_row integer NOT NULL DEFAULT 1 CHECK (header_row >= 1),
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legacy_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  segment text NOT NULL CHECK (segment IN ('seafarer', 'sme')),
  mapping_id uuid REFERENCES public.legacy_import_mappings(id) ON DELETE SET NULL,
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  warning_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'validated',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legacy_import_runs_created_at_idx
  ON public.legacy_import_runs (created_at DESC);

ALTER TABLE public.legacy_import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legacy_import_mappings_super_admin_all ON public.legacy_import_mappings;
CREATE POLICY legacy_import_mappings_super_admin_all ON public.legacy_import_mappings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS legacy_import_runs_super_admin_all ON public.legacy_import_runs;
CREATE POLICY legacy_import_runs_super_admin_all ON public.legacy_import_runs
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
