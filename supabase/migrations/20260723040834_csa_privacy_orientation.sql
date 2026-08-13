-- CSA Data Privacy Act orientation record (workflow §2.2).
-- Separate from intake checklist document `data_privacy_consent`.

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS privacy_orientation_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_orientation_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.loan_applications.privacy_orientation_at IS
  'When CSA recorded that Data Privacy Act orientation was given to the client.';
COMMENT ON COLUMN public.loan_applications.privacy_orientation_by IS
  'CSA user who recorded Data Privacy Act orientation.';
