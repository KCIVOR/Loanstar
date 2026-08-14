ALTER TABLE public.masterlist ADD COLUMN IF NOT EXISTS bir_status_code text;
CREATE INDEX IF NOT EXISTS idx_masterlist_bir_status_code ON public.masterlist(bir_status_code);
