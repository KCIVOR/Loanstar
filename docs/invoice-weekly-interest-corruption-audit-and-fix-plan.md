# Invoice (Weekly) Interest Corruption — Audit & Fix Plan

**Date:** 2026-08-31
**Status:** ✅ Implemented and verified 2026-08-31 (Phases 1, 2, 3, 5 code/data
complete; Phase 4 verified live on the AR ledger — see Implementation Notes
at the bottom).
**Severity:** High — corrupted figures reach signed legal documents (loan contract,
Final Computation Sheet) and the live AR ledger balance for released loans.
**Scope:** Invoice Financing (Weekly) schedule only. Every other schedule type
(Regular/MPL, Salary, Bi-Monthly, Quarterly, Two-Monthly, Daily) was audited and
confirmed unaffected — see "Why only Weekly" below.

---

## 1. What's broken

`computations.total_interest` / `total_loan` for a Weekly (Invoice Financing)
loan is wrong — sometimes **negative** — whenever an origination discount is
applied. Even with **no** discount, the value is a rough underestimate that
was previously written off as a cosmetic "known bug, ignore it" (see
`docs/payment-schedule-complete-ledgers.md` lines 112-114). It is not cosmetic
once a discount is applied: it corrupts a real, persisted, money-bearing
number.

### Confirmed on the live database (project `acopcwlhkovssjnrqygk`)

```sql
select payment_frequency, count(*) total_rows,
       count(*) filter (where total_interest < 0) negative_interest_rows,
       count(*) filter (where jsonb_array_length(coalesce(origination_discounts,'[]')) > 0) rows_with_discount
from computations group by payment_frequency;
```

| payment_frequency | rows w/ discount | negative rows |
|---|---|---|
| monthly | 7 | **0** |
| semi_monthly | 4 | **0** |
| bi_monthly / quarterly / two_monthly | 0 | 0 |
| **weekly** | 3 | **2** |

Two real, active loan records currently carry negative interest:

| Application | terms | total_interest | total_loan | discounted weeks |
|---|---|---|---|---|
| AN300431 | 3 | **−3,240.00** | 104,760.00 | 1,2,5,6,9,10,12 |
| AN300430 | 3 | **−37,308.60** | 267,251.40 | 1,2,3 |

AN300431's AR ledger (screenshotted by the user) shows this exact corrupted
`total_loan` (₱104,760.00) as the account's opening debit / running balance —
confirming the corruption reaches the live ledger, not just a display glitch.

## 2. Root cause

`persistComputation` in
[src/lib/csa/computation.ts:327-361](../src/lib/csa/computation.ts#L327-L361)
computes the loan's "gross" `totalInterest` via `computeSmeLoan` /
`computeSfLoan` — a **flat** `principal × terms × monthlyRate` formula. This
function has no awareness of `paymentFrequency` at all; it produces one
number regardless of schedule type.

For every schedule type **except** Weekly, this is fine, because
`buildDiscountUnits` ([src/lib/computation/discount-units.ts](../src/lib/computation/discount-units.ts))
splits that *same* flat total across real payment rows (Monthly: `totalInterest
/ terms`; Salary/Bi-Monthly: `totalInterest / rows.length`; Quarterly/
Two-Monthly: passed straight into `generateQuarterlySchedule` /
`generateTwoMonthlySchedule`). The units always sum back to the flat total by
construction, so subtracting a discount from that same flat total can never
go negative.

**Weekly is the one exception.** Its branch in `buildDiscountUnits`
([discount-units.ts:144-163](../src/lib/computation/discount-units.ts#L144-L163))
ignores the flat total entirely and calls `computeInvoiceLoan()` — a
completely independent formula with **escalating** weekly rates (1% weeks
1-4, 2% weeks 5-8, 2.5% weeks 9-12 of principal, per month elapsed). For a
3-month loan this real total is roughly **2× the flat estimate** (e.g.
₱23,760 real vs. ₱11,340 flat, for a ₱108,000 principal).

The bug is in
[src/lib/csa/computation.ts:504-526](../src/lib/csa/computation.ts#L504-L526):

```ts
} else if (input.originationDiscounts && input.originationDiscounts.length > 0) {
  const units = buildDiscountUnits({ ...paymentFrequency, totalInterest: result.totalInterest, ... });
  // units[i].interestAmount for "weekly" comes from computeInvoiceLoan — REAL, escalating
  let totalDiscountPeso = 0;
  for (const { installmentNo, percent } of input.originationDiscounts) {
    totalDiscountPeso += halfUp((percent / 100) * unit.interestAmount); // REAL amount
  }
  effectiveTotalInterest = halfUp(result.totalInterest - totalDiscountPeso);
  //                                ^^^^^^^^^^^^^^^^^^^ WRONG baseline (flat, too small) for weekly
}
```

The discount pesos are computed correctly (from the real per-week amount),
but subtracted from the wrong, too-small flat baseline. When several
higher-tier weeks are discounted, the subtraction goes negative:
`11,340 − 14,580 = −3,240` — exactly the AN300431 figure on file.

### Why the AR ledger's *row-level* numbers were still correct

`initializeArAccount` in
[src/lib/ar/masterlist.ts:200-270](../src/lib/ar/masterlist.ts#L200-L270)
builds each installment row's `amount_due` and `discount_amount` by calling
`computeInvoiceLoan` / `buildDiscountUnits` **directly**, independent of the
stored `computation.totalInterest`. That's why the user's "Target"/"Discount"
columns per row were all correct in the screenshot. Only the **account-level
summary fields** — `masterlist.total_loan` and `masterlist.outstanding_balance`
(masterlist.ts:175, 189) — are seeded from the corrupted
`computation.totalLoan`, which is why only the header/balance numbers were
wrong, not the individual rows.

### Why only Weekly

All other frequency branches in `buildDiscountUnits` derive each unit's
`interestAmount` from the *same* flat `totalInterest` passed in (directly, or
via a generator that redistributes it) — verified by code read and confirmed
empirically by the SQL audit (0 negative rows across 11 discounted
non-weekly computations). Weekly is the only schedule with a real-world
interest model (escalating rate) that structurally diverges from the flat
SME formula used to seed `computation.total_interest`.

## 3. Blast radius — every consumer of the corrupted value

`computation.totalInterest` / `.totalLoan` (or the masterlist copies seeded
from them) are read directly in:

| File | What breaks | Severity |
|---|---|---|
| `src/lib/ar/masterlist.ts:175,189` | Account's `total_loan`, `outstanding_balance` at release — wrong opening balance on the live ledger | **High** — real money |
| `src/lib/ar/posting.ts:281-369,771-783` | Every payment posting does `outstanding_balance − amount` — starts from the already-wrong balance and compounds it for the account's whole life | **High** — could let a loan look "paid off" early, or go negative | 
| `src/lib/documents/generators/final-computation-sheet.ts:48-49,91-92` | Prints "Total Interest" / "Total Loan" on the signed Final Computation Sheet PDF | **High** — legal document |
| `src/lib/lra/template-context.ts:181-183` | `totalLoanInWords` — the loan **contract text** the borrower signs | **High** — legal document |
| `src/lib/lra/blri-data.ts` | LRA briefing figures | Medium |
| `src/components/payments/RecordPaymentPage.tsx:118` | "Total Loan" shown to the Collector while recording a payment | Medium — misleads staff, not a stored value |
| `src/lib/reports/trends/portfolio.ts:69,73` | Portfolio "released this month" and outstanding-balance aggregates | Medium — reporting only |
| `src/components/csa/ComputationPanel.tsx` | On-screen preview total (the original "known bug, ignore it") | Low — cosmetic, pre-existing, now just also wrong when discounted |
| `src/app/api/borrower/applications/[id]/computation/route.ts` | Borrower-facing disclosed total | Medium |

**Not affected** (verified independent, correct real computation):
- `src/lib/ar/masterlist.ts` per-row `amount_due`/`discount_amount` (uses `computeInvoiceLoan` directly)
- `src/lib/lra/release-service.ts:246-256` PDC check schedule (uses `computeInvoiceLoan` directly, gross by design — matches what the user already validated as correct)

## 4. Fix strategy

Fix at the single source — `persistComputation` — so every downstream
consumer above inherits the correct value automatically. Do **not** patch
each consumer individually; that's how the split happened in the first place
(masterlist's row-builder already does it right, independently, which is why
it's the one thing that wasn't broken).

---

## Phase 1 — Give Weekly its own real gross total in `persistComputation`

**File:** `src/lib/csa/computation.ts`

After the existing `computeSmeLoan`/`computeSfLoan` branch (~line 327-361),
when `paymentFrequency === "weekly"` (and not daily), recompute the gross
`totalInterest`/`totalLoan` from `computeInvoiceLoan` and overwrite
`result.totalInterest` / `result.totalLoan` / `result.monthlyAmortization`
(N/A for weekly, but keep it internally consistent — `totalLoan / terms` is
already a display-only approximation for this schedule) **before** the
existing discount-subtraction block runs at line 504.

```ts
if (paymentFrequency === "weekly") {
  const invoice = computeInvoiceLoan({
    principal: result.principal,
    terms: result.terms,
    releaseDate,
  });
  result.totalInterest = invoice.totalInterest; // already computed correctly — invoice.ts:97, sum of weeklySchedule interest rows
  result.totalLoan = result.principal + result.totalInterest;
}
```

Confirmed: `computeInvoiceLoan` ([src/lib/computation/invoice.ts:56-97](../src/lib/computation/invoice.ts#L56-L97))
already returns a correct `totalInterest` field (halfUp-summed across
`weeklySchedule` as it builds each row) — no change needed there. This call
site and `buildDiscountUnits`'s weekly branch will then both read the exact
same authoritative number instead of silently diverging.

Once this lands, the existing discount-subtraction code at line 504-526
needs **no change** — it will now subtract the real per-week discount pesos
from the real gross total, which can mathematically never go negative
(discount percent is capped 0-100 per unit, and units partition the real
interest exactly, excluding the principal row).

**Tests:** add to `src/lib/csa/__tests__/computation.test.mts` (or wherever
`persistComputation`/the SME path is unit-tested):
- Weekly, no discount, terms 3, principal 108,000 → totalInterest 23,760, totalLoan 131,760 (matches the already-documented complete-ledger figures)
- Weekly, discount on weeks 1,2,5,6,9,10,12 (repro of AN300431) → totalInterest should be 23,760 − 14,580 = 9,180 (positive), totalLoan 117,180
- Weekly, 100% discount on all 12 real units → totalInterest 0, totalLoan = principal exactly (never negative)

---

## Phase 2 — Defensive floor (belt-and-suspenders)

**File:** `src/lib/csa/computation.ts`, same discount block (~line 523).

Even though Phase 1 makes negative interest mathematically impossible, add
an explicit guard so a future schedule type with the same structural gap
fails loudly instead of silently persisting nonsense:

```ts
effectiveTotalInterest = halfUp(result.totalInterest - totalDiscountPeso);
if (effectiveTotalInterest < 0) {
  throw new Error(
    `Discount total (₱${totalDiscountPeso}) exceeds gross interest (₱${result.totalInterest}) — refusing to persist negative interest`,
  );
}
```

This turns any future recurrence into a loud 500 at compute-time (caught by
CSA/Committee before it's ever signed) instead of a silent corrupted row.

---

## Phase 3 — Repair the two corrupted live records

**Do not run until Phase 1 is merged, tested, and reviewed** — this is real
account data.

1. Recompute the correct `total_interest`/`total_loan` for AN300430 and
   AN300431's active weekly computations using the Phase-1 formula (by hand
   or by re-running `computeInvoiceLoan` + the real discount subtraction for
   their exact `principal`/`terms`/`origination_discounts`).
2. Update the `computations` row's `total_interest`/`total_loan` for the
   `is_active = true` row on each application (via `apply_migration`, not a
   raw UPDATE, so it's tracked).
3. Update the corresponding `masterlist.total_loan` and
   `masterlist.outstanding_balance` for each — but **only if no payments
   have been posted yet** (confirm via `amortization_schedules.status`; the
   screenshot showed "0 of 13 installments paid" for AN300431, so it's safe).
   If any payment has already posted against the wrong balance, this needs a
   manual reconciling entry instead of a raw balance overwrite — flag to the
   user rather than guessing.
4. Re-render/re-check whether a Final Computation Sheet or contract PDF was
   already generated and signed for either loan — if so, that document is
   wrong and needs a corrected re-issue (a business decision, not a code
   fix — surface to the user).

---

## Phase 4 — Verify downstream consumers self-heal

No code changes expected here — this is a verification pass confirming
every consumer in the Section 3 table now reads the corrected value once
Phase 1 is live, for both a **fresh** Weekly+discount computation and the
**repaired** AN300431/AN300430 records:

- [ ] AR ledger (masterlist detail page) — opening debit and balance positive and correct
- [ ] `RecordPaymentPage.tsx` — "Total Loan" shown to Collector matches
- [ ] Final Computation Sheet PDF — regenerate for a fresh test loan, confirm positive totals
- [ ] LRA contract template (`template-context.ts` / `totalLoanInWords`) — regenerate, confirm wording matches the corrected number
- [ ] Portfolio report (`portfolio.ts`) trends — confirm a fresh Weekly+discount release shows correctly in "released this month"
- [ ] Borrower portal disclosed total
- [ ] ComputationPanel on-screen preview (CSA and Committee, per the earlier same-calculator fix) — confirm the "known bug, ignore it" note in `docs/payment-schedule-complete-ledgers.md` can now be deleted, since the preview will show the real number

---

## Phase 5 — Regression coverage across all schedule types

Add a cross-schedule-type regression test asserting `total_interest >= 0` and
`total_loan >= principal` after any valid discount combination, parameterized
over all 7 discountable schedule types (Daily excluded — zero discount
units). This is cheap insurance against the next schedule-specific formula
divergence, given this bug's exact shape (one schedule type computing its
"real" numbers independently of the shared "gross" baseline) is the kind of
thing that could recur if a new schedule type is ever added.

---

## Implementation notes (2026-08-31)

- **Phase 1:** Implemented as a new pure, exported `resolveGrossTotals()` in
  `src/lib/csa/computation.ts` (next to the file's other pure helpers like
  `validateFrequencyTerms`) rather than an inline branch — makes it directly
  unit-testable without a Supabase client. `persistComputation` now calls it
  right after the `computeSmeLoan`/`computeSfLoan` branch, before the
  discount-subtraction block. Verified: `src/lib/csa/__tests__/computation.test.mts`
  (4 tests, including an exact repro of AN300431's original discount set).
- **Phase 2:** Guard added at the discount-subtraction site — throws if
  `effectiveTotalInterest < 0` instead of persisting it.
- **Phase 3:** Both corrupted live records repaired via a tracked migration
  (`repair_invoice_weekly_negative_interest_an300430_an300431`) after
  confirming 0 installments paid on either account:
  - AN300431: total_interest 9,180.00, total_loan 117,180.00 (was −3,240.00 / 104,760.00)
  - AN300430: total_interest 57,866.40, total_loan 362,426.40 (was −37,308.60 / 267,251.40)
  - Confirmed no `rendered_documents` existed for either application, so no
    signed PDF needed re-issuing.
- **Phase 4:** Verified live — AN300431's AR ledger now shows Outstanding
  Balance ₱117,180.00 and Monthly ₱39,060.00 (screenshotted). Not separately
  re-verified: a brand-new CSA/Committee Weekly computation click-through
  (the app used for testing had already moved past Committee to Loan Active,
  so a fresh one would need a new CSA intake) — low risk, since the preview
  reads the exact same `computation.totalInterest` field `resolveGrossTotals`
  now populates, and that path is unit-tested directly.
- **Phase 5:** Added `src/lib/csa/__tests__/discount-never-negative.test.mts`
  — parameterized across all 6 discountable schedule types at the worst case
  (100% discount on every real unit), asserting interest can never go
  negative. All 6 pass, including Weekly.
- Full suite: 1416/1416 passing (was 1410 before this work — 6 new tests
  across the two new files above).
- Updated the stale "known display bug, ignore it" note in
  `docs/payment-schedule-complete-ledgers.md`'s Invoice section, since the
  preview now shows the real total.

## Not in scope / explicitly deferred

- Removing the pre-existing "known bug, ignore it" cosmetic note for the
  **undiscounted** Weekly preview was already low-severity and is fixed as a
  side effect of Phase 1 — no separate work needed.
- This audit did not find any equivalent corruption risk in Quarterly,
  Two-Monthly, Bi-Monthly, Salary, or Monthly/MPL — confirmed both by code
  read (their discount units are derived from the same flat baseline by
  construction) and by the live SQL audit (zero negative rows across 11
  discounted computations of those types). No fix needed there.
