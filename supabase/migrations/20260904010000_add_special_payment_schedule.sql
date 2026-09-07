ALTER TABLE public.loan_applications
  DROP CONSTRAINT loan_applications_payment_schedule_check;
ALTER TABLE public.loan_applications
  ADD CONSTRAINT loan_applications_payment_schedule_check
  CHECK (payment_schedule = ANY (ARRAY[
    'mpl','salary','monthly','weekly','bi_monthly','quarterly',
    'two_monthly','daily','quarterly_special','two_monthly_special'
  ]::text[]));

ALTER TABLE public.computations
  DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE public.computations
  ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly','semi_monthly','weekly','bi_monthly','quarterly',
    'two_monthly','daily','quarterly_special','two_monthly_special'
  ]::text[]));
