-- Records exactly which installment(s) a confirmed internal transfer covered,
-- and how much of each — child table of internal_transfers. Needed because
-- the Account Ledger's running balance is computed entirely from a `payments`
-- list matched to installments, not from masterlist.outstanding_balance, so
-- confirming a transfer without this leaves the ledger looking untouched.

create table public.internal_transfer_allocations (
  id uuid primary key default gen_random_uuid(),
  internal_transfer_id uuid not null references public.internal_transfers(id),
  amortization_schedule_id uuid not null references public.amortization_schedules(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index internal_transfer_allocations_transfer_idx
  on public.internal_transfer_allocations (internal_transfer_id);
create index internal_transfer_allocations_schedule_idx
  on public.internal_transfer_allocations (amortization_schedule_id);

alter table public.internal_transfer_allocations enable row level security;

-- No INSERT/UPDATE policy for staff — written only via service role from
-- postInternalTransfer. No borrower SELECT policy either — the borrower
-- route reads this via service role too (ownership already verified earlier
-- in that handler), unlike `postings` which has a bespoke borrower-ownership
-- clause baked into its own policy.

create policy internal_transfer_allocations_ar_select
  on public.internal_transfer_allocations
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_module_permission('accounting_ar', 'view')
  );
