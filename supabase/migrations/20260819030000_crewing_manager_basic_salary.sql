-- Crewing manager section: `cm_salary` is now labeled "Total Salary" in the
-- UI (unchanged column — it already held the crew member's full salary
-- figure). New `cm_basic_salary` captures the basic salary component
-- separately, alongside it. Seafarer-only field, same as the rest of the
-- Crewing manager section.
ALTER TABLE public.verifications
  ADD COLUMN cm_basic_salary numeric(14,2);
