# Hide the Terms / Addon-months fields when Loan schedule = "Daily"

**Type:** Surgical UI change. One file. No API, no DB, no migration.
**File:** `src/components/csa/ComputationPanel.tsx`
**Applies to:** both CSA mode and Committee mode (same component).

---

## Why

For a Daily Interest loan the `terms` value is **inert** — verified across the whole
code path:

- `computeDailyInterestLoan` (`src/lib/computation/daily.ts`) uses only
  `principal`, `monthlyRate`, `releaseDate`, `paymentDate`. Interest =
  `principal × (monthlyRate / 30) × daysBetween(release, paymentDate)`.
- `persistComputation` (`src/lib/csa/computation.ts`): the `isDaily` branch
  overrides `effectiveTotalInterest / effectiveTotalLoan /
  effectiveMonthlyAmortization` with the daily result; `firstPayment` is the
  CSA-entered payment date, not terms-derived.
- `initializeArAccount` (`src/lib/ar/masterlist.ts`): the `"daily"` branch
  hard-codes a single row `{ installmentNo: 1, dueDate: firstPaymentDate,
  amountDue: totalLoan }`.
- `generateAmortizationSchedule` (`src/lib/ar/schedule.ts`): throws if reached
  with `"daily"`.
- `buildDiscountUnits` (`src/lib/computation/discount-units.ts`): returns `[]`
  for `"daily"` before `terms` is read.
- `validateFrequencyTerms` (`src/lib/csa/computation.ts`): no `"daily"` rule.
- LRA PDC (`src/lib/lra/release-service.ts`): `buildExpectedPdcSchedule`
  returns exactly one check for `"daily"`; `expectedCount` is 1, never
  `computation.terms`.
- Move of Payment (`src/lib/ar/move-of-payment.ts`): not available for daily.

So the field only confuses the operator. The minimum the DB / API accept is
`1` (`CHECK (terms >= 1)`, `z.number().int().min(1)`), so the panel must still
**send** `terms: 1` — it just must not **show** the field.

---

## Change 1 — force `terms: 1`, `addonMonths: 0` in the request body for Daily

**Location:** the `fetch(...)` body object inside `handleCompute`, around
**line 1381–1395**.

Current:

```ts
        body: JSON.stringify({
            inputMode,
            amount: Number(amount),
            terms: Number(terms),
            addonMonths: Number(addonMonths),
            loanTypeId: selectedLoanTypeId || loanTypeId,
            ...(isSeafarer ? { dueDay: Number(dueDay) } : {}),
            ...(segment === "sme" || segment === "individual"
              ? { paymentSchedule: selectedScheduleType }
              : {}),
            ...(selectedScheduleType === "daily" ? { paymentDate } : {}),
```

Replace the `terms` / `addonMonths` lines so Daily always submits a fixed,
valid value regardless of the (now-hidden) state:

```ts
        body: JSON.stringify({
            inputMode,
            amount: Number(amount),
            // Daily Interest ignores terms entirely (single manually-dated
            // payment). The field is hidden for Daily, so submit a fixed,
            // DB/API-valid value (CHECK (terms >= 1)) instead of the stale
            // state default.
            terms: selectedScheduleType === "daily" ? 1 : Number(terms),
            addonMonths: selectedScheduleType === "daily" ? 0 : Number(addonMonths),
            loanTypeId: selectedLoanTypeId || loanTypeId,
            ...(isSeafarer ? { dueDay: Number(dueDay) } : {}),
            ...(segment === "sme" || segment === "individual"
              ? { paymentSchedule: selectedScheduleType }
              : {}),
            ...(selectedScheduleType === "daily" ? { paymentDate } : {}),
```

Do **not** change any other key in this object.

---

## Change 2 — hide the Terms and Addon-months fields for Daily

**Location:** the two sibling `<div>` blocks around **line 1713–1748** — the
`id="terms"` field and the `id="addonMonths"` field, in that order.

Wrap **both** blocks in a single `{selectedScheduleType !== "daily" && ( ... )}`
guard. Use a fragment so the grid layout is unchanged for every non-Daily type:

```tsx
      {selectedScheduleType !== "daily" && (
        <>
          <div>
            <Label htmlFor="terms" required>
              Terms
            </Label>
            <div className="affix">
              <Input
                id="terms"
                type="number"
                min="1"
                required
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                mono
                className="lead"
              />
              <span className="add">mo</span>
            </div>
          </div>
          <div>
            <Label htmlFor="addonMonths" required>
              Addon months
            </Label>
            <div className="affix">
              <Input
                id="addonMonths"
                type="number"
                min={0}
                required
                value={addonMonths}
                onChange={(e) => setAddonMonths(e.target.value)}
                mono
                className="lead"
              />
              <span className="add">mo</span>
            </div>
          </div>
        </>
      )}
```

The immediately-following `{isSeafarer ? ( ...dueDay... ) : null}` block stays
exactly as-is and outside this guard (Seafarer is never Daily, so it renders
`false` for Daily anyway).

Because the inputs are unmounted for Daily, their `required` attributes no
longer participate in the browser's native form validation on submit — which
is the intended behaviour. `amount` and `paymentDate` keep their own
`required` guards.

---

## Change 3 — drop the misleading captions in `buildComputationSteps` for Daily

**Location:** `buildComputationSteps(c: Computation)`, around **line 252–266**.

The "Total interest" and "Monthly amortization" rows print formula text that
describes a monthly-amortized loan (`× (N + M addon mo) × rate`,
`Total loan ÷ N months`). The **values** are already the correct Daily numbers
(overridden in `persistComputation`); only the caption text is wrong.

Replace the two affected entries with Daily-aware formula strings. Keep the
`value` expressions untouched:

```ts
    {
      label: "Total interest",
      formula:
        c.paymentFrequency === "daily"
          ? `₱${formatMoney(c.principal)} × (${pct(c.interestRate)} ÷ 30 per day) × actual days to payment date`
          : `₱${formatMoney(c.principal)} × (${c.terms} + ${c.addonMonths} addon mo) × ${pct(c.interestRate)}`,
      value: c.totalInterest,
    },
    {
      label: "Total loan",
      formula: "Principal + Total interest",
      value: c.totalLoan,
    },
    {
      label: c.paymentFrequency === "daily" ? "Amount due (one-time)" : "Monthly amortization",
      formula:
        c.paymentFrequency === "daily"
          ? "Principal + Total interest — single payment on the payment date"
          : `Total loan ÷ ${c.terms} months`,
      value: c.monthlyAmortization,
    },
```

The `originationDiscounts` block further down in the same function is already
dead for Daily (`c.originationDiscounts` is always empty — the panel blocks the
discount picker) — leave it unchanged.

---

## Out of scope — do NOT touch

- `src/app/api/csa/applications/[id]/computation/route.ts` — `terms:
  z.number().int().min(1)` already accepts `1`.
- `src/app/api/committee/applications/[id]/override/route.ts` — `terms:
  z.number().int().positive()` already accepts `1`.
- Any DB migration — `computations_terms_check CHECK (terms >= 1)` already
  accepts `1`.
- Existing Daily computations saved with `terms: 12` — the value is inert;
  no data fix.
- The `terms` / `addonMonths` `useState` defaults (`"6"` / `"2"`) — harmless;
  Change 1 makes the submitted value deterministic for Daily.

---

## Manual test

1. CSA → Application → Computation. Segment = Individual or SME.
2. Loan type `Individual - Standard`, Interest `3`, Processing fee `5`,
   Input mode `Principal`, Amount `54000`.
3. Loan schedule → **Daily**.
   - **Expect:** the Terms and Addon-months fields disappear. Payment date
     field appears.
4. Payment date = today + 10 days. Click **Recalculate**.
   - **Expect:** Principal ₱56,700.00, Net released ₱54,000.00,
     Total interest ₱567.00, Total loan / amount due ₱57,267.00.
   - **Expect:** "How this was computed" shows the Daily formula text
     ("… ÷ 30 per day …", "Amount due (one-time) …"), not "÷ N months".
5. Scroll to the schedule — **exactly one row**, due on the payment date,
   ₱57,267.00.
6. Switch Loan schedule back to **Regular (Monthly)**.
   - **Expect:** Terms and Addon-months fields reappear with their previous
     values; recalculation works as before.
7. Repeat step 3–5 in **Committee** mode (override panel) for an application
   in `negotiating_terms` — same hide/show behaviour, override saves.
8. Run the Daily unit tests: `npx vitest run src/lib/computation/__tests__/daily.test.ts`
   — still 4 passing (no engine change, sanity only).

---

## Acceptance

- [ ] Terms + Addon-months hidden whenever Loan schedule = Daily (CSA & Committee).
- [ ] They reappear for every other schedule type with prior values intact.
- [ ] A Daily computation saves with `terms = 1`, `addon_months = 0`.
- [ ] Daily computation output unchanged from before (₱567.00 / ₱57,267.00 for the test case).
- [ ] Schedule still renders one row.
- [ ] "How this was computed" no longer says "÷ N months" for Daily.
- [ ] No changes outside `src/components/csa/ComputationPanel.tsx`.
