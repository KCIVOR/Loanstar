-- Unifies loan_applications.individual_loan_type (MPL/Salary) and
-- schedule_type (Regular/Invoice/Bi-monthly/Quarterly/Two-monthly/Daily)
-- into one field, with full 8-option access for BOTH SME and Individual
-- (not just their historical subset — confirmed 2026-08-29). See
-- docs/payment-schedule-unification-plan.md.
--
-- individual_loan_type and schedule_type are NOT dropped here — they stay
-- as an unused rollback safety net until a later, separate cleanup
-- migration (Phase 9 of the plan) once this is verified stable.
ALTER TABLE loan_applications ADD COLUMN payment_schedule text NOT NULL DEFAULT 'monthly';

ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_payment_schedule_check
  CHECK (payment_schedule = ANY (ARRAY[
    'mpl', 'salary',
    'monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily'
  ]::text[]));

-- SME or Individual may use any of the 8 values (already restricted to the
-- valid set by the check above); only Seafarer is locked to 'monthly'.
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_payment_schedule_scope
  CHECK (
    (segment IN ('sme', 'individual'))
    OR (segment = 'seafarer' AND payment_schedule = 'monthly')
  );

-- Backfill every existing row. Safe because individual_loan_type and
-- schedule_type are confirmed mutually exclusive in 100% of current data
-- (verified via Supabase MCP before this migration was written).
UPDATE loan_applications SET payment_schedule = individual_loan_type WHERE individual_loan_type IS NOT NULL;
UPDATE loan_applications SET payment_schedule = schedule_type WHERE schedule_type <> 'monthly';
