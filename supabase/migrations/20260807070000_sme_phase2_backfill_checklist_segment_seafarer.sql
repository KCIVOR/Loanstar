-- Phase 2.1: tag existing checklist/mapping rows as seafarer (expected: 32 + 6 rows).
-- Authorised Seafarer-row write per SME segment plan.

UPDATE public.stage_checklists
SET segment = 'seafarer'
WHERE segment IS NULL;

UPDATE public.stage_check_mapping
SET segment = 'seafarer'
WHERE segment IS NULL;
