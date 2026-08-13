-- Item 10 Phase 4: persistent log for LRA combined signing uploads
-- (one row per combined-upload event; remarks/uploader/timestamp live here,
-- not on documents.revision_remarks which is reserved for CSA revision flow).

CREATE TABLE lra_combined_signing_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  remarks text,
  document_ids uuid[] NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lra_combined_signing_uploads_app_idx
  ON lra_combined_signing_uploads (loan_application_id, uploaded_at DESC);

ALTER TABLE lra_combined_signing_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY lra_combined_signing_uploads_insert ON lra_combined_signing_uploads
  FOR INSERT TO authenticated
  WITH CHECK (has_module_permission('release_lra', 'edit'));

CREATE POLICY lra_combined_signing_uploads_select ON lra_combined_signing_uploads
  FOR SELECT TO authenticated
  USING (has_module_permission('release_lra', 'view'));
