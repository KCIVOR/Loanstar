-- CSA initial interview (workflow §2.5 notes + confirm).
-- Clearance Form upload is optional and separate from this record.

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS initial_interview_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_interview_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS initial_interview_notes text;

COMMENT ON COLUMN public.loan_applications.initial_interview_at IS
  'When CSA confirmed the initial interview with the client.';
COMMENT ON COLUMN public.loan_applications.initial_interview_by IS
  'CSA user who confirmed the initial interview.';
COMMENT ON COLUMN public.loan_applications.initial_interview_notes IS
  'Required notes from the CSA initial interview (Clearance notes).';

-- Optional Clearance Form checklist slot (does not affect required count).
INSERT INTO public.document_types (slug, name)
VALUES ('clearance_form', 'Clearance Form (Interview Notes)')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.stage_checklists (
  stage,
  document_type_id,
  is_required,
  is_optional_flag,
  sort_order
)
SELECT
  'intake',
  dt.id,
  false,
  true,
  0
FROM public.document_types dt
WHERE dt.slug = 'clearance_form'
ON CONFLICT (stage, document_type_id) DO UPDATE
SET
  is_required = false,
  is_optional_flag = true,
  sort_order = 0;
