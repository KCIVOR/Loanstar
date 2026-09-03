-- Phase 0 of the Collector Discount in DCRR feature. See
-- docs/revision-plans/feature-collector-discount-implementation-plan.md.
--
-- All columns are purely additive: default to "no discount" so no existing
-- row or code path changes behavior. amount_due is never touched by this or
-- any later phase — it stays the true, original, contractual amount forever.
--
-- Five columns on dcr_items, not four — an earlier draft of this plan used
-- a single discount_type flag ('interest' | 'penalty'), but that would make
-- the two discount types mutually exclusive on one payment, which
-- contradicts this feature's own confirmed rule: a full-settlement payment
-- may waive both the remaining interest and an already-accrued penalty in
-- the same transaction. Two independent amount/installment-list pairs,
-- plus one shared reason field, express that correctly.

alter table public.dcr_items
  add column interest_discount_amount numeric not null default 0,
  add column interest_discounted_installment_nos integer[] not null default '{}',
  add column penalty_discount_amount numeric not null default 0,
  add column penalty_discounted_installment_nos integer[] not null default '{}',
  add column discount_reason text null;

-- discount_source disambiguates the *existing* amortization_schedules.
-- discount_amount column (interest-side) — today, Origination and Offset
-- discounts both write to it with no way to tell them apart in the AR
-- ledger. Only tags going forward; existing rows stay null (a null source
-- on a nonzero discount_amount predates this column, meaning Origination
-- or Offset). penalty_discount_amount is a brand-new, second column — it
-- must never share discount_amount, since that column's subtraction is
-- hard-wired everywhere in this codebase (post_single_dcr_item,
-- recompute_outstanding_balance, netInstallmentDue, the 30-day rollover)
-- to the interest side, never the penalty side. No source tag is needed on
-- penalty_discount_amount — it is exclusively written by this feature, so
-- its mere presence already identifies it unambiguously.

alter table public.amortization_schedules
  add column discount_source text null
    constraint amortization_schedules_discount_source_check
    check (discount_source in ('origination', 'offset', 'collector')),
  add column penalty_discount_amount numeric not null default 0;
