-- Application Form is now a fillable digital form (borrowers table fields,
-- via ApplicantProfileFields on both the borrower portal and CSA intake
-- page) instead of a scanned-file upload. Drop it from the intake checklist
-- so it no longer shows as an upload requirement; getCompletionSummary is
-- generic over stage_checklists so the required-doc count adjusts on its
-- own, no code changes needed. document_types row is kept (harmless, no
-- code references the slug for anything else) in case any already-uploaded
-- documents rows still point at it.
DELETE FROM public.stage_checklists
WHERE stage = 'intake'
  AND document_type_id = (
    SELECT id FROM public.document_types WHERE slug = 'application_form'
  );
