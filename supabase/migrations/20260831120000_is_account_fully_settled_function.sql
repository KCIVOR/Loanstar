-- Phase 6 (F8, see docs/ledger-balance-consistency-fix-implementation-plan.md):
-- SQL twin of isAccountFullySettled (src/lib/ar/posting.ts). A derived
-- balance of 0 does not by itself mean the account is done — a row can net
-- to 0 while still sitting 'pending'/'partial'/'overdue'. account_status
-- must only become 'paid' when every row has genuinely reached
-- 'paid'/'rolled' too. Additive only — not yet wired into anything.
create or replace function public.is_account_fully_settled(p_masterlist_id uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.amortization_schedules
    where masterlist_id = p_masterlist_id
      and status not in ('paid', 'rolled')
  );
$$;

comment on function public.is_account_fully_settled(uuid) is
  'True only when every amortization_schedules row for this account is paid or rolled — the row-level half of "is this account actually done?" alongside recompute_outstanding_balance. See docs/ledger-balance-consistency-fix-implementation-plan.md Phase 6.';
