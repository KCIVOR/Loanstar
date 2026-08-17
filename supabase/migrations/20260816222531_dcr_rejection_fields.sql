-- AR rejecting a DCRR — dcr.status already allowed 'rejected' and RLS/
-- re-batch-eligibility logic already treated it as "released back to the
-- collector," but nothing ever set it. Adds the missing who/when columns;
-- the rejection reason itself reuses the existing (previously unused) notes
-- column.
alter table public.dcr
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists rejected_at timestamptz;
