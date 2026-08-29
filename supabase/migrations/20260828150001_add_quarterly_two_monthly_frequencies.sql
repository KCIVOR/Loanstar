-- Add 'quarterly' and 'two_monthly' payment frequencies (P4)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text,
    'quarterly'::text,
    'two_monthly'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly, weekly, bi_monthly, quarterly (4 payments/year), two_monthly (6 payments/year)';
