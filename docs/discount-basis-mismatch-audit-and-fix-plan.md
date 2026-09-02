# Discount-Basis Mismatch — Audit & Fix

**Status:** ✅ Implemented and verified 2026-08-31.
**Trigger:** AN300434's AR ledger showed Outstanding Balance ₱0.00 (correct)
but "Installments paid 3/4 (75%)" — the last open installment was stuck at
`"partial"` despite the account being genuinely settled in aggregate.

## Root cause

`persistComputation` (src/lib/csa/computation.ts) computes a **gross**
total_interest, then subtracts any origination discount to get the
**net** figure it actually persists to `computations.total_interest`. The
gross figure was never stored anywhere — it existed only as a local
variable and was discarded once the net value was written.

`initializeArAccount` (src/lib/ar/masterlist.ts) later needs the *gross*
figure to correctly split real interest per payment row via
`buildDiscountUnits` (e.g. "installment 3 of 6 carries ₱2,835.50 of
interest"). Having no way to recover it, it read `computation.totalInterest`
— the already-net value — as if it were gross. Two compounding effects:

1. **Every row's blended payment amount** (`generateAmortizationSchedule`,
   which also took `computation.totalLoan`/`monthlyAmortization` — both
   already net) came out diluted by 1/terms of the *entire* discount, not
   just on the CSA-selected installments.
2. **The per-row `discount_amount`** computed from `buildDiscountUnits` was
   itself based on the wrong (net) baseline, understating it — on
   AN300434, by exactly half (3 of 6 units were 100%-discounted, so
   net = gross × ½, and dividing net by 6 gives exactly half the true
   per-unit share).

Verified precisely on AN300434: true gross interest (₱113,420 × 6mo × 2.5%)
= ₱17,013.00, true per-unit share ₱2,835.50 — but the stored
`discount_amount` was ₱1,417.75, exactly half.

Invoice (Weekly) loans are unaffected — that schedule computes its own real
interest independently via `computeInvoiceLoan` and never reads
`computation.totalInterest` for unit-splitting.

## Fix

1. **New column** `computations.gross_total_interest` — persisted by
   `persistComputation` immediately after `resolveGrossTotals` runs, before
   any discount subtraction.
2. **`mapComputationRow`** reads it back (`grossTotalInterest`), falling
   back to `total_interest` for pre-migration rows (safe: an undiscounted
   computation's gross and net are identical by definition).
3. **`initializeArAccount`** now builds both `schedule`
   (`generateAmortizationSchedule`) and `discountUnits`
   (`buildDiscountUnits`) from the same gross baseline
   (`grossTotalInterest`, `grossTotalLoan = principal + grossTotalInterest`,
   `grossMonthlyAmortization = grossTotalLoan / terms`) — so undiscounted
   rows show their full payment and discounted rows are reduced exactly
   once, never twice.
4. **Backfill migration** — every existing computation's
   `gross_total_interest` computed from the same flat formula
   `computeSmeLoan`/`computeSfLoan` use (`principal × rate × (terms +
   addon_months)`), so accounts not yet released will build correctly the
   first time.
5. **Data repair, AN300434 only** — the one account with a live,
   user-visible symptom. Its own authoritative `total_loan` already
   confirmed the account was fully settled in aggregate; the reconciling
   `discount_amount` for installment 6 (₱1,825.36) was derived so the sum
   of every row's net exactly equals that total_loan (verified:
   ₱124,762.00). Installment 6 flipped to `"paid"`.

   The other 5 accounts sharing the same computation-level bug
   (AN300349, AN300424, AN300426, AN300432, AN300433) were individually
   checked and needed **no data repair**: two aren't released yet (will
   build correctly under the fixed code), one is fully paid and
   self-consistent (AN300424 — collected exactly what it disclosed, just
   via the old diluted-per-row method), one has all discounts already
   reverted to zero (AN300432), and one's still-open rows carry no discount
   at all (AN300433 — only its already-`paid`/closed rows were affected,
   left untouched as historical record, not rewritten).

## Verification

- Pure simulation script matching AN300434's exact inputs: sum of every
  row's (amount_due − discount_amount) = ₱121,926.50, exactly matching
  `effectiveTotalLoan` — before the reversion-fix's post-release additions.
- New regression test (`masterlist-discount-basis.test.mts`) encodes the
  same invariant permanently.
- Live, on the real account: Outstanding Balance still ₱0.00, **Installments
  paid now correctly shows 4/4 (100%)**, ledger's Target/Discount columns
  for installment 6 updated to the true reconciling values.
- Full suite: 1447/1447 passing.
