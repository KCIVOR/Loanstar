alter table public.payments
  add column if not exists flagged_reason text,
  add column if not exists flagged_at timestamptz;
