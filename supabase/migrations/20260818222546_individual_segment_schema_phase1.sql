-- Phase 1.1: widen loan_applications.segment CHECK to include 'individual'.
-- Only loan_applications has a real domain CHECK on segment (confirmed via pg_constraint,
-- Phase 0 audit 2026-08-19); loan_types/masterlist/stage_checklists/stage_check_mapping.segment
-- are unconstrained text columns and need no DDL change here.
ALTER TABLE public.loan_applications
  DROP CONSTRAINT loan_applications_segment_check;

ALTER TABLE public.loan_applications
  ADD CONSTRAINT loan_applications_segment_check
  CHECK (segment = ANY (ARRAY['seafarer'::text, 'sme'::text, 'individual'::text]));

-- Phase 1.2: collateral flag, additive, applies to SME and Individual only (Seafarer stays 'none').
ALTER TABLE public.loan_applications
  ADD COLUMN collateral_type text NOT NULL DEFAULT 'none'
  CHECK (collateral_type IN ('none', 'car_refinancing', 'real_estate'));

-- Phase 1.3: Individual config keys, same seeding pattern as the existing _sme keys.
-- Values confirmed by user 2026-08-19: same as SME (5% monthly penalty, 1 committee member).
INSERT INTO public.config_settings (key, value, description)
VALUES ('penalty_rate_individual', '0.05'::jsonb, 'Maximum penalty rate per month (5% - Individual)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.config_settings (key, value, description)
VALUES ('committee_size_individual', '1'::jsonb, 'Number of committee members required to cast a vote before a final decision can be made (Individual)')
ON CONFLICT (key) DO NOTHING;
