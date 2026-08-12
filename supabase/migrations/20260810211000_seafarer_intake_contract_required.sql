-- Items 3+4 Phase 2: make Contract (loan contract) required on seafarer intake checklist.
-- Flips both is_required and is_optional_flag together (admin UI convention).
-- Does not touch passport (Phase 1) or any SME rows.

UPDATE stage_checklists AS sc
SET is_required = true, is_optional_flag = false
FROM document_types AS dt
WHERE sc.id = 'de5dbdb4-0203-425a-ac9d-d7ed00a785c3'
  AND sc.document_type_id = dt.id
  AND sc.stage = 'intake'
  AND sc.segment = 'seafarer'
  AND dt.slug = 'contract'
  AND sc.is_required = false
  AND sc.is_optional_flag = true;
