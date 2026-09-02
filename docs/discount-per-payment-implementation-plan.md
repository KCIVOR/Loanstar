# Origination Discount: Per-Payment (not Per-Term) — Audit + Implementation Plan

**Goal, confirmed 2026-08-31**: for Salary and Bi-Monthly loans, CSA should be
able to tick and discount **any individual real payment** (e.g. just the
last 2 of 6), not just a whole calendar month at a time (which currently
bundles 2 real payments together into one choice). Every other schedule
type (Regular/MPL, Quarterly, Two-Monthly, Invoice) already works this way
— Salary/Bi-Monthly are the only two where the "discount unit" doesn't map
1:1 to a real payment. This plan makes them consistent with the rest.

---

## Part 1: Audit (done 2026-08-31)

### Where the current "2 payments per unit" behavior lives

Exactly one function: `flatMonthlyUnits()` in
`src/lib/computation/discount-units.ts`, called with `rowsPerMonth: 2` only
for `bi_monthly`/`semi_monthly` (Salary). Three small pieces need to change:

1. **`maxDiscountUnits(paymentFrequency, terms)`** — currently returns
   `terms` (i.e. number of *months*) for these two; needs to return
   `terms * 2` (number of *real payments*).
2. **`unitLabel(paymentFrequency, unitNo)`** — currently returns `"Month N"`
   for these two; needs to return `"Payment N"` (matching Two-Monthly's
   existing convention), since a unit no longer spans a whole month.
3. **`buildDiscountUnits(...)`** — currently calls
   `flatMonthlyUnits({ ...input, rowsPerMonth: 2 })`, which fabricates one
   approximate "due date" per month and bundles 2 real installment numbers
   into it. Needs to instead generate the **real** per-payment schedule and
   map each row 1:1 to its own unit — exactly the pattern already used for
   Quarterly/Two-Monthly (`generateQuarterlySchedule`/
   `generateTwoMonthlySchedule`, called directly, one unit per real row).

### Every consumer, checked — confirmed already generic, needs zero changes

- **`src/lib/ar/masterlist.ts`** (the function that actually applies a
  discount to real installments at loan release) already computes
  `unit.interestAmount / unit.installmentNos.length` per unit — this
  divides by however many real rows a unit covers. Once units cover exactly
  1 row each, this becomes a no-op division (`/1`). **No logic change
  needed** — only its explanatory comment (lines 244-247, "Monthly/Salary/
  Bi-Monthly split a unit's interest evenly across however many raw rows it
  covers (1 for Monthly, 2 for Salary/Bi-Monthly)") goes stale and should be
  updated to say all frequencies are 1:1 now except none.
- **`ComputationPanel.tsx`'s "Origination discount" modal** (the actual UI
  CSA/Committee use) already renders `inst.label` dynamically from whatever
  `discount-units.ts` returns (`` `${inst.label} — due ${inst.dueDate}` ``)
  — never hardcodes "Month." **No UI change needed** — once the label
  becomes "Payment N" and the unit count becomes `terms * 2`, this modal
  automatically shows 6 real, individually-tickable payments for a 3-term
  Salary loan.
  - Two **other**, unrelated modals in the same file hardcode the word
    "Month" — the Offset "how many months to cover" picker (a different
    other-loan payoff feature) and the separate "Early-settlement discount"
    modal (discounts an *existing, already-active* loan's future
    installments, sourced directly from real `amortization_schedules` rows
    — already 1:1 regardless of frequency). **Neither is in scope; do not
    touch either.**
- **`validateOriginationDiscounts`** (`src/lib/csa/computation.ts`, the
  request-body validator used by both the CSA compute route and Committee's
  override route) already calls `maxDiscountUnits` generically. **No
  change needed** — it will automatically accept installment numbers 1–6
  instead of 1–3 once `maxDiscountUnits` is fixed.
- **Document generators** (`src/lib/documents/**`) — confirmed zero
  references to origination-discount structure anywhere. Not affected.

### Real data — checked live via Supabase MCP, 2026-08-31

```sql
select payment_frequency, count(*) as loans_with_discounts
from computations
where origination_discounts is not null and jsonb_array_length(origination_discounts) > 0
group by 1;
-- result: monthly | 7   (only Monthly has ever used this feature)
```

**Zero** Salary or Bi-Monthly loans have ever had an origination discount
recorded. **No data migration or backfill needed** — this is a pure code
change with nothing to repair.

### The one real implementation wrinkle: Salary has no standalone "generate the real schedule" function

Bi-Monthly already has `generateBiMonthlySchedule(...)`, callable directly
with just `releaseDate` — no wrinkle there. Salary's real per-payment date
logic (`advanceSemiMonthly`, alternating 15th/end-of-month) lives *inline*
inside `generateAmortizationSchedule`'s `semi_monthly` branch
(`src/lib/ar/schedule.ts`), not as its own exported function. The clean fix
is to call `generateAmortizationSchedule` directly with
`paymentFrequency: "semi_monthly"` from `buildDiscountUnits` — it's already
exported and already handles this exact case; no duplication needed.

One honest limitation to flag, not hide: `generateAmortizationSchedule`
needs a real `firstPaymentDate` to anchor the correct 15th/end-of-month
phase; when one isn't available yet (the live on-screen preview *before*
CSA has clicked "Compute" for the first time), it falls back to
`computeFirstPaymentDate` — the Seafarer-cutoff rule, which isn't
Salary-aware. This fallback already exists today for every other frequency
in the same situation and is not something this plan needs to fix — it
self-corrects the moment a real computation exists (which is the only time
a discount actually gets persisted/applied for real money anyway).

---

## Part 2: Implementation Plan

### Phase 1 — `maxDiscountUnits`

```ts
export function maxDiscountUnits(paymentFrequency: ScheduleType, terms: number): number {
  if (paymentFrequency === "daily") return 0;
  if (paymentFrequency === "quarterly") return Math.floor(terms / 3);
  if (paymentFrequency === "two_monthly") return Math.floor(terms / 2);
  if (paymentFrequency === "bi_monthly" || paymentFrequency === "semi_monthly") return terms * 2;
  return terms;
}
```

**Testing**: update `maxDiscountUnits` tests in `discount-units.test.ts` —
`maxDiscountUnits("bi_monthly", 6)` → `12` (was `6`);
`maxDiscountUnits("semi_monthly", 3)` → `6` (was `3`).

### Phase 2 — `unitLabel`

```ts
function unitLabel(paymentFrequency: ScheduleType, unitNo: number): string {
  if (paymentFrequency === "quarterly") return `Quarter ${unitNo}`;
  if (paymentFrequency === "two_monthly" || paymentFrequency === "bi_monthly" || paymentFrequency === "semi_monthly") {
    return `Payment ${unitNo}`;
  }
  return `Month ${unitNo}`;
}
```

### Phase 3 — `buildDiscountUnits`'s bi_monthly/semi_monthly branch

Replace:
```ts
if (input.paymentFrequency === "bi_monthly" || input.paymentFrequency === "semi_monthly") {
  return flatMonthlyUnits({ ...input, rowsPerMonth: 2 });
}
```
with real per-payment generation, mirroring the existing Quarterly/
Two-Monthly branch's shape:
```ts
if (input.paymentFrequency === "bi_monthly" || input.paymentFrequency === "semi_monthly") {
  if (!input.releaseDate) return [];
  const releaseDate =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const monthlyAmortization = halfUp(input.totalLoan / terms);
  const rows =
    input.paymentFrequency === "bi_monthly"
      ? generateBiMonthlySchedule({ terms, monthlyAmortization, releaseDate, totalLoan: input.totalLoan })
      : generateAmortizationSchedule({
          terms,
          monthlyAmortization,
          releaseDate,
          addonMonths: input.addonMonths ?? 0,
          firstPaymentDate: input.firstPaymentDate,
          totalLoan: input.totalLoan,
          paymentFrequency: "semi_monthly",
        });
  const interestPerPayment = halfUp(input.totalInterest / rows.length);
  return rows.map((row) => ({
    unitNo: row.installmentNo,
    label: unitLabel(input.paymentFrequency, row.installmentNo),
    dueDate: row.dueDate,
    interestAmount: interestPerPayment,
    installmentNos: [row.installmentNo],
  }));
}
```
Import `generateAmortizationSchedule` alongside the other three generators
already imported from `../ar/schedule`.

### Phase 4 — Widen `buildDiscountUnits`'s input type

Add an optional `addonMonths?: number` field (used only by the new Salary
branch's fallback path in Phase 3). Update the two real callers to pass it
through — both already have the value on hand:

- **`ComputationPanel.tsx`** (`~line 932`): pass `addonMonths: addonN` (the
  local var already derived from form state).
- **`src/lib/ar/masterlist.ts`** (`~line 249`): pass
  `addonMonths: computation.addonMonths`.

### Phase 5 — Update stale comments

- `src/lib/ar/masterlist.ts:244-247` — the comment describing "1 for
  Monthly, 2 for Salary/Bi-Monthly" no longer describes reality; update to
  say every frequency's units are 1:1 with real rows now (Invoice remains
  the one exception, still N-weeks-per-unit, unchanged by this plan).
- `discount-units.ts`'s `DiscountUnit.label` doc comment (currently says
  `"'Month N' for most frequencies, but 'Quarter N' / 'Payment N' for
  Quarterly/Two-monthly"`) — update to include Salary/Bi-Monthly under the
  `"Payment N"` case.

### Phase 6 — Tests

Replace the existing `discount-units.test.ts` describe block
`"buildDiscountUnits — Bi-Monthly / Salary"` (which currently asserts the
old 2-per-unit grouping — e.g. `installmentNos: [1, 2]`) with new
assertions proving the per-payment behavior:

- Bi-Monthly, 6 terms → **12 units**, each `installmentNos: [n]` (single
  element), real dates 15 days apart from release (reuse the same
  `generateBiMonthlySchedule` dates already verified in
  `schedule.test.ts`).
- Salary, 3 terms → **6 units**, each `installmentNos: [n]`, real
  alternating 15th/end-of-month dates (reuse the pattern already verified
  for Salary in `payment-schedule-manual-test-guide.md` §4).
- Interest per unit = `totalInterest / (terms * 2)` for both.

Also add a case confirming `maxDiscountUnits` and `buildDiscountUnits`
agree (same length) for both frequencies — a cheap guard against the two
ever drifting apart again.

### Phase 7 — Full regression pass

1. `npx tsc --noEmit -p .` — clean (same pre-existing baseline as before).
2. `npm test` — full suite, no regressions beyond the new/updated cases.
3. `npx vitest run src/lib/ar/__tests__/schedule.test.ts src/lib/computation/__tests__/discount-units.test.ts` — clean.

### Phase 8 — Manual re-verification

1. Open a Salary loan's Origination Discount modal (the same test loan
   used earlier) — confirm it now shows **6** rows labeled "Payment 1"
   through "Payment 6", each with its own real due date (not 3 "Month N"
   rows), and each independently tickable — tick only the last 2 and
   confirm the discount applies to just those two real installments after
   Compute.
2. Repeat for a Bi-Monthly loan with the same terms — confirm 12 individual
   "Payment N" rows.
3. Confirm Regular/MPL/Quarterly/Two-Monthly/Invoice/Daily are all
   byte-identical to before (regression check — this plan should touch
   nothing about them).

---

## Part 3: Explicit Constraints — What NOT to Touch

- **Quarterly, Two-Monthly, Invoice, Daily, Regular/MPL's** own branches in
  `buildDiscountUnits`/`maxDiscountUnits`/`unitLabel` — already 1:1 or
  intentionally different (Invoice's weekly-grouped-by-month), untouched.
- **The Offset "how many months to cover" picker** and the
  **"Early-settlement discount" modal** in `ComputationPanel.tsx` — both
  hardcode "Month" but are unrelated features (existing-loan payoff/early
  settlement, not origination discount on the loan being computed). Do not
  touch.
- **`src/lib/ar/masterlist.ts`'s discount-application logic** (the
  `perRow`/`discountByUnit`/`unitNoByInstallmentNo` block) — already
  generic and correct for any `installmentNos.length`. Only its comment
  changes (Phase 5), not its code.
- **No database migration** — confirmed zero existing Salary/Bi-Monthly
  discount data; nothing to backfill or repair.
- **`generateBiMonthlySchedule`, `generateAmortizationSchedule`,
  `advanceSemiMonthly`** themselves — reused as-is, not modified. This plan
  is purely about how `discount-units.ts` *counts and labels* units, not
  about the underlying date/amount generation (already correct, and
  already covered by the month-overflow bug fix from earlier today).
- **Everything from the payment-schedule-unification and
  date-schedule-overflow-bug-fix plans** — unrelated, already shipped,
  do not revisit.
