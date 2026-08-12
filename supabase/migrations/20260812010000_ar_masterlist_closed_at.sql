-- AR Posting History Phase 1: stamp masterlist.closed_at on paid transitions.
-- postings SELECT already grants accounting_ar:view (20260707000001_p7_rls.sql) — no RLS change.

ALTER TABLE public.masterlist
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_masterlist_closed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_status = 'paid' AND OLD.account_status IS DISTINCT FROM 'paid' THEN
    NEW.closed_at := now();
  ELSIF NEW.account_status <> 'paid' AND OLD.account_status = 'paid' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS masterlist_stamp_closed_at ON public.masterlist;

CREATE TRIGGER masterlist_stamp_closed_at
  BEFORE UPDATE ON public.masterlist
  FOR EACH ROW
  WHEN (NEW.account_status IS DISTINCT FROM OLD.account_status)
  EXECUTE FUNCTION public.stamp_masterlist_closed_at();
