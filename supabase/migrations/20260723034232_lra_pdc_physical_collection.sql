-- Physical PDC collection after signing (separate from encode-before-generate).
-- Prefer columns on release_files over expanding status enum.

ALTER TABLE public.release_files
  ADD COLUMN IF NOT EXISTS pdc_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdc_collected_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.release_files.pdc_collected_at IS
  'When LRA confirmed physical PDCs were collected from the borrower (post-sign; separate from pdc_checks encode).';
COMMENT ON COLUMN public.release_files.pdc_collected_by IS
  'User who confirmed physical PDC collection.';
