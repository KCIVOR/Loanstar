-- Phase 0 of the loan discounts feature (Offset early-settlement discount +
-- new-loan origination discount). See
-- docs/revision-plans/feature-loan-discounts-implementation-plan.md.
--
-- Both columns are purely additive: default to "no discount" so no existing
-- row or code path changes behavior. amount_due is never touched by this or
-- any later phase — it stays the true, original, contractual amount forever.

-- Currently-active discount on a not-yet-paid installment. 0 = no discount.
-- Cleared back to 0 by the nightly aging job once the installment's due date
-- arrives (origination discount), or by the Offset closure flow once applied
-- to a payoff (see Phase 6).
alter table public.amortization_schedules
  add column discount_amount numeric not null default 0;

-- Staging area for a new loan's proposed per-installment discount
-- percentages, set by CSA/Committee at computation time — before the loan is
-- released and before any amortization_schedules rows exist for it. Applied
-- to the real schedule rows at release (Phase 2). Shape:
-- [{ "installmentNo": number, "percent": number }, ...]
alter table public.computations
  add column origination_discounts jsonb null;
