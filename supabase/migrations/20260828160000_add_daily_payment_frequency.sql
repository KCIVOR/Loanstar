-- Add 'daily' payment frequency (P5)
-- Daily = one payment per day (30 per month × terms)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text,
    'quarterly'::text,
    'two_monthly'::text,
    'daily'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly, weekly, bi_monthly, quarterly, two_monthly, daily (30/month × terms)';
