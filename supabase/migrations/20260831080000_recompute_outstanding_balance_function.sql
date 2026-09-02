-- Foundation for the ledger-balance-consistency fix (Phase 3, see
-- docs/ledger-balance-consistency-fix-implementation-plan.md). SQL twin of
-- the TypeScript `recomputeOutstandingBalance` in src/lib/ar/posting.ts —
-- both compute the account's true outstanding balance fresh from the rows
-- (sum of net-still-owed across every installment not already 'paid' or
-- 'rolled'), rather than accumulating it via independent subtractions at
-- every posting site. This SQL twin exists because `post_internal_transfer`
-- (a Postgres function) cannot call into TypeScript.
--
-- Penalty IS included in this balance (the F7 decision, see Phase 3 of the
-- plan doc) — matches what the row ledger has always shown as "still owed".
--
-- Additive only: this migration creates the function but wires it into
-- nothing. No existing behavior changes until Phase 4 calls it.
create or replace function public.recompute_outstanding_balance(p_masterlist_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    greatest(
      0,
      public.half_up(
        coalesce(amount_due, 0)
        - coalesce(discount_amount, 0)
        + coalesce(penalty_amount, 0)
        - coalesce(amount_paid, 0)
      )
    )
  ), 0)
  from public.amortization_schedules
  where masterlist_id = p_masterlist_id
    and status not in ('paid', 'rolled');
$$;

comment on function public.recompute_outstanding_balance(uuid) is
  'True outstanding balance derived fresh from amortization_schedules rows (net of discount, plus penalty, minus amount_paid, floored at 0 per row) — never accumulated. SQL twin of recomputeOutstandingBalance in src/lib/ar/posting.ts. See docs/ledger-balance-consistency-fix-implementation-plan.md Phase 3.';
