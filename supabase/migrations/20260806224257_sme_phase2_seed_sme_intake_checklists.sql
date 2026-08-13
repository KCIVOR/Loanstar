-- Phase 2.2: SME document types + intake checklists.
-- Entity-type split (corporate-only vs common) is an operator decision pending
-- final client sign-off before production — see Progress Log.
-- Also mirrors non-intake seafarer checklist rows onto segment='sme' so release /
-- signing / accounting / cig_endorsement are not empty for SME apps.

INSERT INTO public.document_types (slug, name) VALUES
  ('business_registration', 'Business Registration (DTI/SEC)'),
  ('lslgc_consent_form_2025', 'LSLGC Consent Form 2025'),
  ('owner_authorized_rep_id', 'Owner / Authorized Representative ID'),
  ('location_sketch', 'Location Sketch'),
  ('mayors_permit', 'Mayor''s Permit'),
  ('tin_ctc', 'TIN + Community Tax Certificate'),
  ('client_supplier_list', 'Client / Supplier List'),
  ('proof_of_transaction', 'Proof of Transaction'),
  ('board_resolution', 'Board Resolution'),
  ('secretary_certificate', 'Secretary Certificate')
ON CONFLICT (slug) DO NOTHING;

-- Common SME intake docs (entity_type NULL = both Individual and Corporate)
INSERT INTO public.stage_checklists (
  stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type
)
SELECT 'intake', dt.id, true, false, t.ord, 'sme', NULL
FROM public.document_types dt
JOIN (
  VALUES
    ('business_registration', 1),
    ('owner_authorized_rep_id', 2),
    ('valid_ids', 3),
    ('mayors_permit', 4),
    ('tin_ctc', 5),
    ('location_sketch', 6),
    ('bank_authorization', 7),
    ('lslgc_consent_form_2025', 8),
    ('bap_customer_consent', 9),
    ('client_supplier_list', 10),
    ('proof_of_transaction', 11)
) AS t(slug, ord) ON dt.slug = t.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stage_checklists sc
  WHERE sc.stage = 'intake'
    AND sc.document_type_id = dt.id
    AND sc.segment = 'sme'
    AND sc.entity_type IS NULL
);

-- Corporate-only SME intake docs
INSERT INTO public.stage_checklists (
  stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type
)
SELECT 'intake', dt.id, true, false, t.ord, 'sme', 'corporate'
FROM public.document_types dt
JOIN (
  VALUES
    ('board_resolution', 12),
    ('secretary_certificate', 13)
) AS t(slug, ord) ON dt.slug = t.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stage_checklists sc
  WHERE sc.stage = 'intake'
    AND sc.document_type_id = dt.id
    AND sc.segment = 'sme'
    AND sc.entity_type = 'corporate'
);

-- Pipeline continuity: copy non-intake seafarer checklists to SME (entity_type NULL).
INSERT INTO public.stage_checklists (
  stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type
)
SELECT
  sc.stage,
  sc.document_type_id,
  sc.is_required,
  sc.is_optional_flag,
  sc.sort_order,
  'sme',
  NULL
FROM public.stage_checklists sc
WHERE sc.segment = 'seafarer'
  AND sc.stage <> 'intake'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stage_checklists existing
    WHERE existing.stage = sc.stage
      AND existing.document_type_id = sc.document_type_id
      AND existing.segment = 'sme'
      AND existing.entity_type IS NULL
  );
