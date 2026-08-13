-- Phase 7: SME company/owner duplication check at CSA stage.
-- 7.1: CSA-only this phase (CIG nfis/mf/lslg SME applicability deferred).
-- ncl mapping already segment=seafarer from Phase 2.1 backfill.

INSERT INTO public.check_types (slug, name, description)
SELECT
  'sme_duplication',
  'SME Duplication Check',
  'Company name / owner duplication screen for SME applications (CSA)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.check_types WHERE slug = 'sme_duplication'
);

INSERT INTO public.stage_check_mapping (stage, check_type_id, sort_order, segment)
SELECT
  'csa',
  ct.id,
  1,
  'sme'
FROM public.check_types ct
WHERE ct.slug = 'sme_duplication'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stage_check_mapping scm
    WHERE scm.stage = 'csa'
      AND scm.check_type_id = ct.id
      AND scm.segment = 'sme'
  );

-- Ensure NCL remains Seafarer-only at CSA (idempotent).
UPDATE public.stage_check_mapping scm
SET segment = 'seafarer'
FROM public.check_types ct
WHERE scm.check_type_id = ct.id
  AND ct.slug = 'ncl'
  AND scm.stage = 'csa'
  AND (scm.segment IS DISTINCT FROM 'seafarer');
