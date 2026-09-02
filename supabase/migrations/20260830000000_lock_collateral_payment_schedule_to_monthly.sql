-- Confirmed against the real Excel calculator (Calculator SME.xlsm) and the
-- paper application form: collateral (Auto/REM) and payment schedule
-- (Salary/Invoice/Quarterly/etc.) are never independent choices in either
-- source — a loan is Auto, REM, MPL, Salary, Invoice, Quarterly, etc., never
-- two of these combined. Collateral loans (car_refinancing/real_estate) are
-- always "monthly" cadence — every existing row already matches this.
--
-- This adds the missing guard: payment_schedule may only be non-monthly when
-- collateral_type is 'none'. Safe against current data — verified live
-- (2026-08-29 audit) that every car_refinancing/real_estate row already has
-- payment_schedule = 'monthly'.
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_payment_schedule_collateral_lock
  CHECK (
    collateral_type = 'none' OR payment_schedule = 'monthly'
  );
