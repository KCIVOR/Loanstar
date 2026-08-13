-- Mirrors borrower_no_seq / generate_borrower_no() exactly (see
-- 20260706120000_p2_borrower_agent_documents.sql) — application_no was
-- declared with no default and never assigned by any app code, so every
-- existing application has NULL here. This phase only adds the missing
-- generator so new inserts get a number; backfilling the 15 existing NULL
-- rows is Phase 2, deliberately separate so this can be verified alone.

CREATE SEQUENCE public.application_no_seq START WITH 300001;

CREATE OR REPLACE FUNCTION public.generate_application_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'AN' || lpad(nextval('public.application_no_seq')::text, 6, '0');
$$;

ALTER TABLE public.loan_applications
  ALTER COLUMN application_no SET DEFAULT public.generate_application_no();
