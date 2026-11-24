-- Classification belongs to the versioned computation, not the loan segment.
-- No default/backfill: legacy classifications have not been established.
ALTER TABLE public.computations
  ADD COLUMN seafarer_borrower_type text
  CONSTRAINT computations_seafarer_borrower_type_check
  CHECK (seafarer_borrower_type IN ('SEAFARER', 'ALLOTTEE'));

COMMENT ON COLUMN public.computations.seafarer_borrower_type IS
  'Explicit Seafarer/Allottee borrower classification; null means not recorded. Does not affect financial calculations.';
