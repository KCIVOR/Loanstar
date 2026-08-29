-- Add 'bi_monthly' payment frequency (P3)
-- Bi-monthly = every 15 days (2 payments per calendar month)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly (Salary), weekly (Invoice 1-3mo), bi_monthly (every 15 days)';
