-- Phase 2 fix, caught during real browser testing of the Collector Discount
-- feature (feature-collector-discount-implementation-plan.md). The
-- allocation-preview route's new interestPortion lookup (Phase 2) reads
-- computations.total_interest/terms/payment_frequency for the Collector's
-- own account — but the "collection"/"remedial" modules were never granted
-- SELECT on `computations` before, since no Collector-facing page has ever
-- needed to read it directly until now. The query was silently returning
-- zero rows under RLS (no error surfaces client-side for an RLS-blocked
-- select), so every "Interest" figure in the new discount UI showed ₱0.00
-- against real, populated data — confirmed live against AN300007
-- (total_interest=49500, terms=3, semi_monthly -> expected 8,250.00/row).
--
-- This is the same class of silent-RLS-block bug this project has already
-- been bitten by once in the Collection flow (see project memory). Fix:
-- extend the existing computations_select policy with the same
-- has_module_permission(...) OR-clause shape it already uses for every
-- other legitimate consumer (intake, computation, verification, committee,
-- release_lra) — additive only, nothing existing narrows.

drop policy if exists computations_select on public.computations;

create policy computations_select on public.computations
for select
using (
  is_super_admin()
  or has_module_permission('intake', 'view')
  or has_module_permission('computation', 'view')
  or has_module_permission('verification', 'view')
  or has_module_permission('committee', 'view')
  or has_module_permission('release_lra', 'view')
  or has_module_permission('collection', 'view')
  or has_module_permission('remedial', 'view')
  or exists (
    select 1
    from loan_applications la
    join borrowers b on b.id = la.borrower_id
    where la.id = computations.loan_application_id
      and b.user_id = auth.uid()
  )
);
