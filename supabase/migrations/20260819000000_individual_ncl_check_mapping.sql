-- Fix: Individual segment was never given a stage_check_mapping row for the
-- CSA 'ncl' check. csaScreeningCheckSlug() has always returned 'ncl' for
-- Individual (deliberate reuse of the Seafarer screening path, confirmed in
-- docs/individual-collateral-expansion-plan.md), but the Phase 7 SME
-- duplication-check migration (20260807015533) pinned the 'ncl' mapping to
-- segment='seafarer' only, before the Individual segment existed. Nobody
-- widened it when Individual shipped (20260818222546), so CSA/checks POST
-- 400s with "Check 'ncl' is not mapped for CSA/individual" for every
-- Individual application. Seafarer and SME are unaffected.

INSERT INTO public.stage_check_mapping (stage, check_type_id, sort_order, segment)
SELECT
  'csa',
  ct.id,
  1,
  'individual'
FROM public.check_types ct
WHERE ct.slug = 'ncl'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stage_check_mapping scm
    WHERE scm.stage = 'csa'
      AND scm.check_type_id = ct.id
      AND scm.segment = 'individual'
  );
