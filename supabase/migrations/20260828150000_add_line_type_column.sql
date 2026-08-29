-- Add line_type column for dual-line payment structures (P4)
-- Quarterly and Two-Monthly loans split each payment into interest + principal rows

-- Add column (nullable for backward compatibility)
ALTER TABLE amortization_schedules 
  ADD COLUMN line_type text DEFAULT 'standard';

-- Add constraint
ALTER TABLE amortization_schedules
  ADD CONSTRAINT amortization_schedules_line_type_check
  CHECK (line_type = ANY (ARRAY['standard'::text, 'interest'::text, 'principal'::text]));

-- Add index for queries that filter by line_type
CREATE INDEX idx_amortization_schedules_line_type 
  ON amortization_schedules(line_type);

-- Update existing rows
UPDATE amortization_schedules SET line_type = 'standard' WHERE line_type IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE amortization_schedules ALTER COLUMN line_type SET NOT NULL;

COMMENT ON COLUMN amortization_schedules.line_type IS
  'Payment line type: standard (single row), interest (dual-line interest), principal (dual-line principal)';
