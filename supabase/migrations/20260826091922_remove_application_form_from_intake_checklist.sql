-- "Application Form" is filled out in-system (auto-generated via the document
-- template system), not submitted as a borrower upload — remove it from the
-- intake document checklist. Only ever seeded for segment=individual, stage=intake.
delete from public.stage_checklists
where document_type_id = '31ab6298-d86a-426e-bec5-d629e6ed8701'
  and stage = 'intake'
  and segment = 'individual';
