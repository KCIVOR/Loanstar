-- SME-only "schedule type" — the loan's payment product (Regular/Invoice/
-- Bi-monthly/Quarterly/Two-monthly/Daily), decided at intake alongside
-- segment and collateral_type, not as a separate free choice at compute
-- time. See docs/loan-schedule-type-redesign-plan.md.
ALTER TABLE loan_applications ADD COLUMN schedule_type text NOT NULL DEFAULT 'monthly';
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_schedule_type_check
  CHECK (schedule_type = ANY (ARRAY['monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily']::text[]));
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_schedule_type_sme_only
  CHECK (segment = 'sme' OR schedule_type = 'monthly');
