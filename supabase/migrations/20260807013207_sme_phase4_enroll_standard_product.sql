-- Phase 4: enroll one active SME loan product + make PF floor segment-aware.
-- G2 / DB 6.5% floor is Seafarer-only (Calculator SME extraction: real SME PF 0–11%).
-- One product only — ~58 per-account rate architecture deferred to client decision.
-- Leaves inactive 'SME - SPECTRUM' untouched (stale seed; rates disagree with workbook).

ALTER TABLE public.loan_types
  DROP CONSTRAINT IF EXISTS loan_types_pf_rate_g2;

ALTER TABLE public.loan_types
  ADD CONSTRAINT loan_types_pf_rate_g2
  CHECK (
    NOT is_active
    OR segment = 'sme'
    OR pf_rate >= 0.065
  );

-- Expected: 1 new active row. Name unique among active SME products for this unblock.
INSERT INTO public.loan_types (
  name,
  interest_rate,
  pf_rate,
  segment,
  is_active,
  effective_from
)
SELECT
  'SME - Standard',
  0.03,
  0.08,
  'sme',
  true,
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.loan_types
  WHERE name = 'SME - Standard'
    AND is_active = true
);
