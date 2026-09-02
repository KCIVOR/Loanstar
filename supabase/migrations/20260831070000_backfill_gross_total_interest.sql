-- Backfills gross_total_interest on every existing computation row created
-- before the column existed (2026-08-31). Uses the same flat formula
-- computeSmeLoan/computeSfLoan use for every non-Invoice, non-Daily
-- schedule: principal × monthly_rate × (terms + addon_months) — see
-- src/lib/computation/sme.ts and sf.ts. For an undiscounted computation
-- this equals the stored (net) total_interest exactly, so backfilling is
-- safe even for rows that never had a discount.
--
-- Weekly (Invoice) and Daily are excluded from the formula — Weekly's real
-- interest is escalating-rate, not flat, and buildDiscountUnits never reads
-- this field for Weekly anyway (computes its own real total via
-- computeInvoiceLoan); Daily has zero discount units. Both just copy
-- total_interest across — harmless, since it's unused for those types.

update public.computations
set gross_total_interest = round(principal * interest_rate * (terms + addon_months), 2)
where payment_frequency not in ('weekly', 'daily')
  and gross_total_interest is null;

update public.computations
set gross_total_interest = total_interest
where payment_frequency in ('weekly', 'daily')
  and gross_total_interest is null;
