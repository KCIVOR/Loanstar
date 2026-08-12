-- Items 3+4 Phase 1: make Passport required on seafarer intake checklist.
-- Flips both is_required and is_optional_flag together (admin UI convention).

UPDATE stage_checklists AS sc
SET is_required = true, is_optional_flag = false
FROM document_types AS dt
WHERE sc.id = '93644f27-60cd-4746-b489-4df10536c5a9'
  AND sc.document_type_id = dt.id
  AND sc.stage = 'intake'
  AND sc.segment = 'seafarer'
  AND dt.slug = 'passport'
  AND sc.is_required = false
  AND sc.is_optional_flag = true;
