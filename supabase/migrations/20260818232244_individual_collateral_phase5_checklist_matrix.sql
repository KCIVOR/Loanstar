-- Phase 5.1: add collateral_type as a third scoping dimension on stage_checklists,
-- same nullable-means-universal semantics as entity_type. NULL rows (the existing
-- 20 SME rows + any future universal Individual rows) apply regardless of
-- collateral choice — correct, since SME's collateral extras are purely additive
-- on top of the existing clean-loan checklist, never a replacement.
ALTER TABLE public.stage_checklists
  ADD COLUMN collateral_type text;

ALTER TABLE public.stage_checklists
  DROP CONSTRAINT stage_checklists_stage_document_type_id_segment_entity_key;

ALTER TABLE public.stage_checklists
  ADD CONSTRAINT stage_checklists_stage_document_type_id_segment_entity_key
  UNIQUE (stage, document_type_id, segment, entity_type, collateral_type);

-- Phase 5.3a: SME collateral extras — additive on top of the existing 20-row
-- base checklist (entity_type NULL = applies to both Sole Prop and Corporate).
INSERT INTO stage_checklists (stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type, collateral_type)
SELECT 'intake', dt.id, false, true, 30, 'sme', NULL, v.collateral_type
FROM document_types dt
JOIN (VALUES
  ('or_cr_vehicle', 'car_refinancing'),
  ('tax_declaration', 'real_estate'),
  ('title_proof_ownership', 'real_estate')
) AS v(slug, collateral_type) ON dt.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM stage_checklists sc2
  WHERE sc2.stage = 'intake' AND sc2.document_type_id = dt.id
    AND sc2.segment = 'sme' AND sc2.entity_type IS NULL
    AND sc2.collateral_type = v.collateral_type
);

-- Phase 5.3b: Individual segment intake checklist — no prior rows exist for this
-- segment at all. Universal items (appear on all three of Individual's clean /
-- car-refi / real-estate lists) get collateral_type NULL. Items that apply to
-- clean + car-refi but NOT real-estate (confirmed a fully distinct list, not
-- additive) get two explicit rows instead of a NULL wildcard, since NULL would
-- incorrectly also apply them to real_estate.
INSERT INTO stage_checklists (stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type, collateral_type)
SELECT 'intake', dt.id, false, true, v.sort_order, 'individual', NULL, v.collateral_type
FROM document_types dt
JOIN (VALUES
  -- Universal across none/car_refinancing/real_estate
  ('valid_ids', NULL::text, 10),
  ('application_form', NULL::text, 90),
  -- Clean + Car Refinancing only (two rows each, not real_estate)
  ('payslip_coe', 'none', 20),
  ('payslip_coe', 'car_refinancing', 20),
  ('business_registration', 'none', 30),
  ('business_registration', 'car_refinancing', 30),
  ('proof_of_billing', 'none', 40),
  ('proof_of_billing', 'car_refinancing', 40),
  ('bank_statement_3mo', 'none', 50),
  ('bank_statement_3mo', 'car_refinancing', 50),
  -- Car Refinancing extra
  ('or_cr_vehicle', 'car_refinancing', 60),
  -- Real Estate — fully distinct list
  ('title_proof_ownership', 'real_estate', 20),
  ('property_picture', 'real_estate', 30),
  ('tax_declaration', 'real_estate', 40),
  ('proof_of_income', 'real_estate', 50),
  ('location_sketch', 'real_estate', 60)
) AS v(slug, collateral_type, sort_order) ON dt.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM stage_checklists sc2
  WHERE sc2.stage = 'intake' AND sc2.document_type_id = dt.id
    AND sc2.segment = 'individual' AND sc2.entity_type IS NULL
    AND ((sc2.collateral_type IS NULL AND v.collateral_type IS NULL)
         OR sc2.collateral_type = v.collateral_type)
);
