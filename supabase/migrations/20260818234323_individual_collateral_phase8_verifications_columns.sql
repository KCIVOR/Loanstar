-- Phase 8.2: CM Inspection / REM Inspection data, following the exact
-- field_visit / sme_reloan_verification jsonb precedent on this same table.
ALTER TABLE public.verifications
  ADD COLUMN cm_inspection jsonb,
  ADD COLUMN rem_inspection jsonb;
