-- One-time backfill for applications created before the Phase 1 generator
-- existed. Oldest-first via created_at, so existing applications receive
-- application_no values in the same order they actually happened — not
-- table scan/insertion order, which is unspecified.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.loan_applications
    WHERE application_no IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.loan_applications
    SET application_no = public.generate_application_no()
    WHERE id = rec.id;
  END LOOP;
END $$;
