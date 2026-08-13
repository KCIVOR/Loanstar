-- Document checklist: needs_revision status + remarks for CSA request-revision flow
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending', 'uploaded', 'confirmed', 'needs_revision'));

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS revision_remarks text;

COMMENT ON COLUMN public.documents.revision_remarks IS
  'CSA remarks when status is needs_revision; cleared when borrower/staff replaces the file.';
