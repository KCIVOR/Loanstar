-- Internal transfer settlements: when a new loan's Other Loan/Offset deduction
-- targets an existing account, this records that money movement separately
-- from real cash collections (payments/dcr/postings), since it never touches
-- a bank deposit and would otherwise break DCR's deposit-match reconciliation.
-- AR reviews and confirms each row; confirming reduces the target account's
-- outstanding_balance directly (this is a lump-sum payoff/write-down, not
-- per-installment allocation).

create table public.internal_transfers (
  id uuid primary key default gen_random_uuid(),
  source_loan_application_id uuid not null references public.loan_applications(id),
  source_masterlist_id uuid references public.masterlist(id),
  target_masterlist_id uuid not null references public.masterlist(id),
  transfer_type text not null check (transfer_type in ('other_loan', 'offset')),
  months integer,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'posted', 'rejected')),
  rejection_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

create index internal_transfers_target_idx on public.internal_transfers (target_masterlist_id);
create index internal_transfers_status_idx on public.internal_transfers (status);

alter table public.internal_transfers enable row level security;

-- No INSERT policy for staff roles — rows are only ever created via service
-- role from the LRA release flow (same privileged-write pattern the
-- masterlist enrollment already uses).

create policy internal_transfers_ar_select on public.internal_transfers
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_module_permission('accounting_ar', 'view')
  );

create policy internal_transfers_ar_update on public.internal_transfers
  for update to authenticated
  using (
    public.is_super_admin()
    or public.has_module_permission('accounting_ar', 'edit')
  )
  with check (
    public.is_super_admin()
    or public.has_module_permission('accounting_ar', 'edit')
  );
