# Quarterly / Bi-Monthly "Special" Schedule Implementation Plan

**Audit + surgical phase-by-phase plan.** Written by Claude (planning role) for Cursor (implementation role) per this repo's plan→implement→validate workflow. Every file/line reference below was verified by reading the actual current code on 2026-09-04, not assumed.

**Source of the request**: 2026-09-01 client meeting (`docs/transcription_2.txt`, ~33:33–34:56 and ~1:21:31–1:21:58). One large client wants Quarterly and Bi-Monthly loans that pay **interest only on every regular due date, with the entire principal paid in one lump sum on the final due date** — instead of today's behavior, which splits interest *and* principal evenly across every due date. This is a special arrangement for that client, not a change to the default Quarterly/Bi-Monthly behavior. The client used no specific product name for it ("interest, interest, interest... then at the end, the principal") — internally we're calling it **"Special"** (`quarterly_special`, `bi_monthly_special`), not "balloon."

---

## Part 1: Audit Summary

### What exists today
- `loan_applications.payment_schedule` — plain `text` + CHECK constraint (not a real Postgres enum), 8 values: `mpl, salary, monthly, weekly, bi_monthly, quarterly, two_monthly, daily`. Defined in `supabase/migrations/20260829004236_add_loan_applications_payment_schedule.sql`.
- `computations.payment_frequency` — plain `text` + CHECK constraint, 7 values (`monthly, semi_monthly, weekly, bi_monthly, quarterly, two_monthly` in `20260828150001_add_quarterly_two_monthly_frequencies.sql`; `daily` added in a later migration). `payment_schedule` is translated into `payment_frequency` in `src/lib/csa/computation.ts:463-479` (`mpl`→`monthly`, `salary`→`semi_monthly`, everything else passes through unchanged).
- **`generateInterestPrincipalSplitSchedule`** in `src/lib/ar/schedule.ts:237-291` is the shared engine behind today's Quarterly and Bi-Monthly-style dual-line schedules (well, Quarterly/Two-Monthly specifically — Bi-Monthly itself uses a separate `generateBiMonthlySchedule`, see below). It emits, for every payment date, an `"interest"` row followed by a `"principal"` row, with principal split evenly across all payments (`schedule.ts:276-280`).
- `generateQuarterlySchedule` (`schedule.ts:299-310`) and `generateTwoMonthlySchedule` (`schedule.ts:317-328`) are thin wrappers around the shared function with `frequencyMonths: 3` and `2` respectively, each with a `terms % frequencyMonths !== 0` guard.
- `generateBiMonthlySchedule` (`schedule.ts:195-226`) is a **separate**, single-line-per-payment function (every-15-days cadence, no interest/principal split at all — it emits one combined `amountDue` per row, no `lineType`). This is what the transcript's "Bi-Monthly" refers to. **Resolved naming question**: the transcript's dual-line example was demoed on **Quarterly** (12 months ÷ 4, ~32:29–34:56). Rovick then tested **Two-Monthly** and the client explicitly confirmed the same special arrangement applies to it too (~36:43-36:50: "yan din yung normal, kama yan, normal computation yan. Tapos yung isa... on special arrangement, interest, interest, principal" — "that [due-date pattern] is also the normal computation. Then the other one [the special arrangement] is interest, interest, principal"). **Bi-Monthly** (the separate every-15-days schedule, `generateBiMonthlySchedule`) was only ever shown with its regular due dates in the transcript (~30:51-31:16) — no interest/principal split, no special-arrangement request was tied to it. **Decision: this plan builds `quarterly_special` and `two_monthly_special` only — Bi-Monthly is out of scope.**
- `src/lib/computation/sf.ts` / `sme.ts` — confirmed zero references to `paymentFrequency` or schedule shape; they only compute `totalInterest`/`totalLoan`/`monthlyAmortization` totals. **No changes needed here** — the special variant only rearranges how those totals are laid out into rows.
- `src/lib/ledger/build-account-ledger-rows.ts` — confirmed schedule-agnostic; operates generically on persisted `amortization_schedules` rows via `line_type`/`installment_no`/`amount_due`. **No changes needed.**

### The key simplification found during this audit
The original feasibility audit assumed the discount-unit pairing logic (`discount-units.ts:188`, `for (let i = 0, unitNo = 1; i < rows.length; i += 2, unitNo += 1)`) would need a redesign because "interest-only periods" would have no principal row to pair with. **This is not necessary.** The simplest, lowest-risk implementation keeps every payment's `(interest, principal)` row pair — for the special variant, every period except the last just gets a **`principal` row with `amountDue: 0`** instead of omitting the row. This means:
- Row count stays exactly `2 × numPayments`, same as today.
- `discount-units.ts`'s `i += 2` stride works unchanged.
- `amortization_schedules.amount_due numeric(14,2) NOT NULL` already accepts 0 — no schema change needed there.
- Every downstream reader that assumes "quarterly/two-monthly = pairs of rows" (ledger builder, move-of-payment) keeps working without modification.

This turns "Medium" risk items in the original audit into "Low" risk. The only real new logic is inside the schedule generator itself.

### Risk assessment
- **Low risk to existing Quarterly/Two-Monthly loans** — this is purely additive (new enum values, new generator functions); the existing `generateQuarterlySchedule`/`generateTwoMonthlySchedule`/`generateInterestPrincipalSplitSchedule` code paths are not modified, only extended with a sibling function.
- **Medium risk, needs explicit care**: `move-of-payment.ts`'s `CHECK_ONE_TO_ONE_FREQUENCIES` set (`move-of-payment.ts:322-326`) and `nextScheduleExtensionDueDate` switch (`move-of-payment.ts:435-458`) are not adjacent to `schedule.ts` and are easy to forget. The special variants are dual-line like today's Quarterly/Two-Monthly, so they must be **excluded** from `CHECK_ONE_TO_ONE_FREQUENCIES` (already excluded by omission — just don't add them) and **added** to the `nextScheduleExtensionDueDate` switch with the same month-offset as their non-special counterpart.
- **Zero risk to interest/fee computation** — confirmed `sf.ts`/`sme.ts` don't branch on schedule shape.

---

## Part 2: Implementation Plan

### Phase 1 — Database migrations
Two new migration files (both tables' CHECK constraints need the new values; missing either one will let the UI save a value the other table's insert then rejects).

**`supabase/migrations/<timestamp>_add_special_payment_schedule.sql`**
```sql
ALTER TABLE public.loan_applications
  DROP CONSTRAINT loan_applications_payment_schedule_check;
ALTER TABLE public.loan_applications
  ADD CONSTRAINT loan_applications_payment_schedule_check
  CHECK (payment_schedule = ANY (ARRAY[
    'mpl','salary','monthly','weekly','bi_monthly','quarterly',
    'two_monthly','daily','quarterly_special','two_monthly_special'
  ]::text[]));

ALTER TABLE public.computations
  DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE public.computations
  ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly','semi_monthly','weekly','bi_monthly','quarterly',
    'two_monthly','daily','quarterly_special','two_monthly_special'
  ]::text[]));
```
Apply via Supabase MCP (`apply_migration`), per this repo's convention — not `supabase db push` (see `docs/document-template-system-plan.md` for the two-folder migration gotcha this repo has hit before).

Do not touch `loan_applications_payment_schedule_scope` or `loan_applications_payment_schedule_collateral_lock` — both gate on `<> 'monthly'`, not an enumerated list, so the new values are automatically covered correctly (Auto/REM collateral loans stay locked out of them, same as regular Quarterly/Two-Monthly).

### Phase 2 — Schedule generator (`src/lib/ar/schedule.ts`)
Add a `mode` parameter to the shared generator, defaulting to today's behavior:

```ts
function generateInterestPrincipalSplitSchedule(input: {
  terms: number;
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
  frequencyMonths: 2 | 3;
  mode?: "even" | "special"; // "special" = principal only on final row
}): AmortizationInstallment[] {
  // ...unchanged setup...
  for (let i = 1; i <= numPayments; i += 1) {
    // ...unchanged interest row push...

    let principalAmount: number;
    if (input.mode === "special") {
      if (i === numPayments) {
        // Interest rows are each halfUp()'d independently, so their sum can
        // be a few cents off `totalInterest` — absorb that drift here so the
        // full schedule (all interest rows + this row) still sums exactly to
        // `totalLoan`, same reasoning as the even path's last-row absorption
        // below, just measured against interest paid instead of principal
        // paid (there is no prior principal in special mode).
        const interestPaidSoFar = halfUp(interestPerPayment * numPayments);
        principalAmount = halfUp(input.totalLoan - interestPaidSoFar);
      } else {
        principalAmount = 0;
      }
    } else {
      // existing "even" logic, unchanged
      principalAmount = principalPerPayment;
      if (i === numPayments) {
        const priorPrincipal = halfUp(principalPerPayment * (numPayments - 1));
        principalAmount = halfUp(principal - priorPrincipal);
      }
    }

    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: principalAmount,
      lineType: "principal",
    });
  }
  return installments;
}
```

Add two new exported wrappers mirroring the existing ones:
```ts
export function generateQuarterlySpecialSchedule(input: {
  terms: number; totalLoan: number; totalInterest: number;
  releaseDate: string | Date; dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms % 3 !== 0) {
    throw new Error("Quarterly Special loans require terms divisible by 3 (e.g. 6, 9, or 12 months)");
  }
  return generateInterestPrincipalSplitSchedule({ ...input, frequencyMonths: 3, mode: "special" });
}

export function generateTwoMonthlySpecialSchedule(input: {
  terms: number; totalLoan: number; totalInterest: number;
  releaseDate: string | Date; dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms % 2 !== 0) {
    throw new Error("Two-Monthly Special loans require terms divisible by 2 (e.g. 4, 6, 8, 10, or 12 months)");
  }
  return generateInterestPrincipalSplitSchedule({ ...input, frequencyMonths: 2, mode: "special" });
}
```

Update `generateAmortizationSchedule`'s dispatch (`schedule.ts:80-104`) with two new `if` blocks mirroring the existing `quarterly`/`two_monthly` ones, calling the new functions. Also extend the `paymentFrequency` param's inline union type (`schedule.ts:51`) to include the two new values.

**Do not touch** `generateQuarterlySchedule`, `generateTwoMonthlySchedule`, or the "even" branch of `generateInterestPrincipalSplitSchedule` — existing loans must produce byte-identical output.

### Phase 3 — Type definitions (mechanical, do all in one pass)
Add `"quarterly_special" | "two_monthly_special"` to every union listed below. Grep for `"two_monthly"` repo-wide to catch any missed by this list — it's the narrowest, most reliable anchor string.

- `src/lib/computation/discount-units.ts:11-20` — `ScheduleType`
- `src/lib/csa/computation.ts:58-67` — `PersistComputationInput.paymentSchedule`; also the `payment_frequency` mapping logic around `:463-479` (pass-through case — special values are not `mpl`/`salary`, so they already fall into the "everything else passes through unchanged" branch; just confirm the union type there is widened)
- `src/lib/ar/schedule.ts:51` — `generateAmortizationSchedule`'s `paymentFrequency` param
- `src/lib/ar/move-of-payment.ts:258-265` — `paymentFrequency` cast union
- `src/components/csa/ComputationPanel.tsx:189-191, 559-561, 1577-1579`
- `src/app/csa/applications/new/page.tsx:28-30`
- `src/app/committee/applications/[id]/page.tsx:95-97`
- `src/app/api/csa/applications/[id]/computation/route.ts:114-116, 356-358`
- `src/app/api/committee/applications/[id]/override/route.ts:41-43`
- `src/app/api/borrower/applications/reloan/route.ts:78-80, 180-182, 192-194`
- `src/lib/negotiation/service.ts:349-351`
- `src/lib/dev/fake-data.ts:880-882` (dev seed data — low priority, keep it representative)

### Phase 4 — UI (`ComputationPanel.tsx`, `csa/applications/new/page.tsx`, Committee override page)
Add `<option value="quarterly_special">Quarterly (Special)</option>` and `<option value="two_monthly_special">Two-Monthly (Special)</option>` next to the existing Quarterly/Two-Monthly options (`ComputationPanel.tsx:1584-1593`). Reuse the existing terms-divisibility validation (`ComputationPanel.tsx:1277-1281`, mirrors `validateFrequencyTerms` in `computation.ts:132-161`) — extend it to also validate the two new values against the same `%3`/`%2` rule as their non-special counterparts. Consider extending the existing quarterly/two-monthly UI hint block (`ComputationPanel.tsx:1602/1607`) to note "interest-only until the final payment, which includes the full principal" for the special variants — client-facing clarity, not required for correctness.

### Phase 5 — Discount units (`src/lib/computation/discount-units.ts`)
Because every row pair is preserved (Phase 2's zero-amount principal rows for non-final periods), the existing Quarterly/Two-Monthly branch in `buildDiscountUnits` (`discount-units.ts:165-199`) works for the special variants with only:
1. `maxDiscountUnits` (`:54-67`) — add `paymentFrequency === "quarterly_special"` / `"two_monthly_special"` alongside the existing `quarterly`/`two_monthly` checks (same `Math.floor(terms / 3)` / `Math.floor(terms / 2)`).
2. `unitLabel` (`:69-80`) — add the two new values to the existing `quarterly`/`two_monthly` conditions (or give them their own label, e.g. `Quarter ${unitNo} (Special)`, CSA's call).
3. `buildDiscountUnits`'s quarterly/two_monthly branch condition (`:165`) — add the two new values, and call `generateQuarterlySpecialSchedule`/`generateTwoMonthlySpecialSchedule` instead of the non-special generators when the frequency is a special one.

No change needed to the `i += 2` pairing loop (`:188`) — confirmed row shape is unchanged.

### Phase 6 — LRA / PDC (`src/lib/lra/release-service.ts`)
`buildExpectedPdcSchedule` and `savePdcChecks` need new `if` branches calling the new generators, mirroring the existing quarterly/two_monthly branches exactly. Check `isNewScheduleType` boolean (wherever it enumerates schedule values) includes the two new ones.

### Phase 7 — Move of Payment (`src/lib/ar/move-of-payment.ts`)
1. **Do not add** `quarterly_special`/`two_monthly_special` to `CHECK_ONE_TO_ONE_FREQUENCIES` (`:322-326`) — like their non-special counterparts, they're dual-line, not 1:1.
2. **Add** two new `case` statements to `nextScheduleExtensionDueDate`'s switch (`:435-458`), copying the existing `quarterly`/`two_monthly` cases verbatim (same month-offset logic — the special variant's *cadence* is identical to the regular one, only the principal placement differs):
```ts
case "quarterly_special":
  return formatDateLocal(addCalendarMonths(last, 3));
case "two_monthly_special":
  return formatDateLocal(addCalendarMonths(last, 2));
```

### Phase 8 — `src/lib/ar/masterlist.ts`
Confirm no change needed: `initializeArAccount`'s dispatch (`:244-281`) calls `generateAmortizationSchedule(...)` generically for every frequency not explicitly branched to `weekly`/`daily` handling — since Phase 2 wires the new values into `generateAmortizationSchedule` itself, this file requires no edits. Verify this assumption holds once Phase 2 lands (read the current dispatch again before Phase 8 sign-off, in case another change has touched it since this plan was written).

---

## Testing checklist (mirror existing `schedule.test.ts` patterns)
1. `generateQuarterlySpecialSchedule` — 12-month term, verify: 4 interest rows of equal amount, 3 principal rows of `0`, 1 final principal row equal to full `totalLoan - totalInterest`. Sum of all `amountDue` across all rows equals `totalLoan`.
2. `generateTwoMonthlySpecialSchedule` — same shape check, `terms % 2 === 0`.
3. Both — non-divisible `terms` throws the same error message pattern as the existing non-special functions.
4. `buildDiscountUnits` with `quarterly_special`/`two_monthly_special` — unit count matches `maxDiscountUnits`, `interestAmount` matches the interest row (not the zero-amount principal row) for each unit.
5. `nextScheduleExtensionDueDate` — special variants extend by the correct month offset.
6. End-to-end: create a test application with `payment_schedule: "quarterly_special"`, confirm the CSA computation preview, LRA PDC schedule, and AR ledger (post-release) all show interest-only rows until the final due date, which shows the full principal.

## Rollback
Every change here is additive (new enum values, new functions, new UI options). If something goes wrong, the CHECK constraint migrations can be reverted independently of the code (existing values keep working), and the code changes have no effect on existing `quarterly`/`two_monthly`/`bi_monthly` loans since none of their code paths are modified — only extended with new sibling branches.
