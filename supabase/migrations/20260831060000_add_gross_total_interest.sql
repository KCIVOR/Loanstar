-- Fixes a real discount-mismatch bug found on AN300434 (2026-08-31): the
-- gross (pre-discount) total_interest computed inside persistComputation
-- was never persisted anywhere — only the net (post-discount) figure is
-- stored in `total_interest`. masterlist.ts's initializeArAccount later
-- calls buildDiscountUnits(totalInterest: computation.totalInterest) to
-- split that figure per real payment row, using the ALREADY-NET value as
-- if it were gross — understating each row's real discount_amount whenever
-- any discount was actually applied (confirmed on AN300434: true per-unit
-- interest ₱2,835.50, stored discount_amount 1,417.75 — exactly half).
--
-- Invoice/Weekly loans are unaffected — that schedule computes its own real
-- interest independently via computeInvoiceLoan and never reads this field
-- for per-unit splitting.
--
-- This column stores the gross figure going forward so masterlist.ts can
-- read the real baseline instead of reconstructing/guessing it.
alter table public.computations
  add column gross_total_interest numeric;

comment on column public.computations.gross_total_interest is
  'Total interest before any origination discount was subtracted — the baseline buildDiscountUnits needs to correctly split each real payment''s interest share. total_interest (no prefix) is net of discount, kept for backward compatibility with every existing reader. NULL on rows created before 2026-08-31 (see docs/discount-basis-mismatch-audit-and-fix-plan.md) — readers must fall back to total_interest for those.';
