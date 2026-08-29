-- Add 'weekly' payment frequency for Invoice Financing (P2 Phase 3)
-- Invoice Financing is a weekly interest-only loan product for 1-3 month terms
-- Transcription.md lines 901-920, timestamp 2:32:43

-- Drop existing constraint
ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

-- Add constraint with 'weekly' included
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly'::text, 'semi_monthly'::text, 'weekly'::text]));

-- Comment for documentation
COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly (standard), semi_monthly (Salary loans), weekly (Invoice Financing 1-3 month terms)';
