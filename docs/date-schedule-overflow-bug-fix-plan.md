# Month-Overflow Date Bugs — Audit + Phase-by-Phase Fix Plan

Two real, reproducible bugs in how monthly-cadence schedule dates get
generated, found 2026-08-30 while manually testing the payment-schedule
unification work. Neither is related to today's earlier changes — both
predate this session's work and affect the AR ledger, the discount preview,
and the LRA post-dated-check (PDC) ledger.

---

## Part 1: Audit

### Bug #1 — installments 2+ drift past month-end instead of clamping

**Root cause**: `date.setMonth(date.getMonth() + i)` in JavaScript doesn't
clamp — if the date object's day-of-month is higher than the target
month's real length, it silently overflows into the *next* month. E.g. a
schedule anchored on the 30th, when it reaches February (28/29 days),
doesn't land on Feb 28 — it rolls forward to **March 2**.

**Reproduced live**: SME/Clean/Regular loan, release **2026-08-30** → first
payment **2026-09-30** (correct — this part clamps properly). Its 6th
monthly installment, opened in the Origination Discount modal, showed **due
2027-03-02** instead of the correct **2027-02-28**.

**Three independent copies of the same unclamped logic** — found via a
targeted grep for `setMonth(`, each one a separate hand-written loop that
never calls a shared "add N months" helper:

| # | File:line | Used by |
|---|---|---|
| 1a | `src/lib/ar/schedule.ts:140` (`generateAmortizationSchedule`, plain-monthly branch) | **The real AR amortization schedule** — every Regular/MPL/Auto-REM/Seafarer monthly loan's actual collections ledger |
| 1b | `src/lib/computation/discount-units.ts:77` (`flatMonthlyUnits`) | The Origination Discount modal preview (where this was first spotted) |
| 1c | `src/lib/computation/release-date.ts:139` (`addScheduleMonths`) | LRA's PDC schedule — both the on-screen draft (`src/app/lra/applications/[id]/page.tsx:163`) and the actual persisted checks (`src/lib/lra/release-service.ts:410`, inside `savePdcChecks`) |

A 4th copy, `src/lib/lra/blri-data.ts:118`, doesn't call `addScheduleMonths`
at all — it's a *fourth*, separately hand-written version of the same
unclamped loop, used as a fallback PDC projection on the BLRI document when
no checks have been recorded yet.

**Confirmed correct and NOT in scope**: `computeFirstPaymentDate`,
`computeSmeFirstPaymentDate`, `computeSalaryFirstPaymentDate` (all three
already clamp properly via `Math.min(day, lastDayOfMonth)` — this bug only
ever affects installments *after* the first one).

### Bug #2 — Quarterly/Two-Monthly can skip an entire month

**Root cause**: `generateInterestPrincipalSplitSchedule` in
`src/lib/ar/schedule.ts:258-262` does this, in this order:

```js
const dueDate = new Date(release);                          // keeps release's own day (e.g. 31)
dueDate.setMonth(dueDate.getMonth() + monthOffset);          // ← can overflow HERE, using the wrong day
dueDate.setDate(dueDay);                                     // day only gets fixed AFTER the overflow already happened
```

Because the day-of-month isn't reset to `dueDay` until *after* `setMonth`
runs, a release date late in the month (29th–31st) can push the intermediate
`setMonth` call past the target month's real length, silently landing the
**whole due date one month later than intended** — not just a few days off,
the entire quarter/period shifts.

**Worked example**: release **2026-08-31**, Quarterly, first due date should
be **2026-11-10** (3 months later, day forced to the Due Day, default 10).
Actual result: `setMonth` tries "Nov 31" → November only has 30 days →
overflows to **Dec 1** → then `setDate(10)` lands on **2026-12-10**, a full
month late.

**Used by**: `generateQuarterlySchedule`/`generateTwoMonthlySchedule`,
called from three places — the AR masterlist's real schedule
(`src/lib/ar/masterlist.ts`), the LRA PDC builder
(`src/lib/lra/release-service.ts`'s `buildExpectedPdcSchedule`, and the
matching on-screen draft in `src/app/lra/applications/[id]/page.tsx`).

**Confirmed correct and NOT in scope**: Bi-Monthly (`generateBiMonthlySchedule`
counts by real days, `+15` each time — no month arithmetic at all, immune to
both bugs by construction), Salary/semi-monthly (`advanceSemiMonthly` already
computes the real last-day-of-month correctly), Invoice and Daily (both pure
day-counting, no month math).

### Database audit (live, via Supabase MCP, 2026-08-30)

```sql
select count(*) filter (where payment_frequency='monthly') as monthly_count,
       count(*) filter (where payment_frequency='quarterly') as quarterly_count,
       count(*) filter (where payment_frequency='two_monthly') as two_monthly_count,
       count(*) filter (where payment_frequency in ('monthly','quarterly','two_monthly')
                         and extract(day from first_payment_date) >= 29) as day29plus_count
from computations where is_active = true;
```
Result: `monthly_count: 73, quarterly_count: 0, two_monthly_count: 0, day29plus_count: 1`.

- **Quarterly and Two-Monthly have never been used in real data** — both are
  brand-new schedule types added earlier this session, zero rows exist.
  Bug #2 has zero real-world exposure yet.
- **Only 1 of 73 monthly computations** has a first-payment day ≥29 (the
  test loan created during today's manual QA pass), and it has **no**
  `masterlist`/`amortization_schedules` rows yet — it was never released.
- Cross-checked every released `masterlist` account for a monthly-cadence
  first-payment day ≥29: **zero matches**.
- Spot-checked `pdc_checks` rows with a day-of-month between 1–3 (the
  overflow's typical signature): the 5 matching rows all belong to a loan
  whose `first_payment_date` is the 9th, with every check landing on a flat
  "day 1" pattern unrelated to Bug #1/#2's signature — confirmed unrelated
  (looks like manually-entered test data, not machine-generated).
- Also ruled out: a separate set of wildly out-of-order schedule gaps found
  on 2 restructured/reloan accounts (`AN300418`, `AN300018`) — both are
  `remedial`/`paid` accounts whose schedules were legitimately rewritten by
  restructuring logic, not this bug. Excluded from scope.

**Conclusion: no data repair or backfill migration needed.** This is a
forward-looking code-correctness fix — no released loan has ever actually
been corrupted by either bug, but any release from today onward with a
late-month release date would be, until fixed.

---

## Part 2: The fix technique

Both bugs share the same cure: **build the target date in one atomic step**
instead of mutating a date object through separate `setMonth`/`setDate`
calls that can carry a stale day-of-month across the mutation boundary.

```js
// Correct, single-step construction — day is clamped to the target
// month's real length, and never carries a stale value into setMonth.
function addCalendarMonths(anchor: Date, months: number, day?: number): Date {
  const targetMonth = anchor.getMonth() + months;
  const targetYear = anchor.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const wantedDay = day ?? anchor.getDate();
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(wantedDay, lastDayOfTargetMonth));
}
```

This is the exact same technique `computeSmeFirstPaymentDate` already uses
correctly (`Math.min(day, lastDay)`) — Part 3 below just extends that proven
pattern to the installments-after-the-first case (Bug #1) and reorders
Quarterly/Two-Monthly's construction to never carry a stale day across a
month change (Bug #2), instead of introducing a new technique.

---

## Part 3: Implementation Plan

### Phase 1 — Add one shared, tested helper (`release-date.ts`)

Add `addCalendarMonths(anchor: Date, months: number, day?: number): Date`
(the function above) to `src/lib/computation/release-date.ts`, next to
`computeSmeFirstPaymentDate`/`computeSalaryFirstPaymentDate`. Pure function,
no side effects, exported.

**Testing**: `release-date.ts` currently has no dedicated test file (checked
via `src/lib/computation/__tests__/` — confirmed empty for this module).
Create `src/lib/computation/__tests__/release-date.test.mts` covering:
- Day 30 anchor advancing into February (non-leap year) → clamps to Feb 28
- Day 30 anchor advancing into February (leap year) → clamps to Feb 29
- Day 31 anchor advancing into a 30-day month (Apr/Jun/Sep/Nov) → clamps correctly
- Day 15 anchor (ordinary case) → unaffected, same as today
- `day` override parameter (needed for Phase 3) behaves the same way

### Phase 2 — Fix Bug #1's three call sites

Swap each of the three independent unclamped loops to call
`addCalendarMonths` instead of their own `setMonth`/`setDate` mutation:

1. **`src/lib/ar/schedule.ts:135-155`** (`generateAmortizationSchedule`'s
   plain-monthly fallback branch) — replace the per-iteration
   `due.setMonth(due.getMonth() + i)` with
   `addCalendarMonths(firstPayment, i)`.
2. **`src/lib/computation/discount-units.ts:59-79`** (`flatMonthlyUnits`) —
   same swap for its `d.setMonth(d.getMonth() + i)` line.
3. **`src/lib/computation/release-date.ts:139-143`** (`addScheduleMonths`
   itself) — reimplement its body as a call to `addCalendarMonths`, keeping
   its existing exported signature (`(anchorDate: string, index: number) => string`)
   so every caller (`src/app/lra/applications/[id]/page.tsx`,
   `src/lib/lra/release-service.ts`) is fixed automatically with zero
   changes needed at those call sites. **Remove the doc comment claiming
   this "deliberately reproduces Date.setMonth's plain overflow behavior"**
   — that was true before this fix, not after.

**Testing**: update/add cases in `src/lib/ar/__tests__/schedule.test.ts`,
`src/lib/computation/__tests__/discount-units.test.ts`, and wherever
`addScheduleMonths` already has coverage (`src/lib/lra/__tests__/release-service.test.mts`
uses it directly per the earlier grep) — each gets a day-30/31-crossing-
February case asserting the clamped date, replacing any test that
previously asserted the old overflow behavior as correct.

### Phase 3 — Fix Bug #2 (Quarterly/Two-Monthly)

In `src/lib/ar/schedule.ts`'s `generateInterestPrincipalSplitSchedule`
(shared by `generateQuarterlySchedule`/`generateTwoMonthlySchedule`),
replace:

```js
const dueDate = new Date(release);
dueDate.setMonth(dueDate.getMonth() + monthOffset);
dueDate.setDate(dueDay);
```

with a single atomic construction using the Phase 1 helper:

```js
const dueDate = addCalendarMonths(release, monthOffset, dueDay);
```

This passes `dueDay` directly into the `day` parameter, so the target day
is baked into the same atomic month/day resolution — there's no
intermediate state where the release's own day-of-month can overflow the
month before `dueDay` gets applied.

**Testing**: extend `src/lib/ar/__tests__/schedule.test.ts`'s
`generateQuarterlySchedule`/`generateTwoMonthlySchedule` suites with a
release date of the 31st crossing a 30-day intermediate month (the exact
repro from Part 1) and assert the due date lands in the *correct* month,
not one month late.

### Phase 4 — Fix `blri-data.ts`'s separate duplicate

`src/lib/lra/blri-data.ts:110-119`'s fallback PDC-projection loop
(`cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())`)
doesn't call any shared function today — replace the loop with
`addCalendarMonths(cursor, 1)` per iteration (or simplify to
`addCalendarMonths(firstPayment, i)` directly in the existing `for` loop,
whichever reads cleaner in context — check the surrounding code before
choosing).

**Testing**: check whether `blri-data.ts` has existing test coverage; if
not, this is a good time to add a minimal test for this fallback branch
specifically (a day-30/31 anchor crossing February), since it was
previously completely unverified.

### Phase 5 — Full regression pass

1. `npx tsc --noEmit -p .` — clean.
2. `npm test` — full suite, expect no regressions beyond the new cases
   added in Phases 1–4 (currently 1430 passing).
3. `npx vitest run src/lib/ar/__tests__/schedule.test.ts src/lib/computation/__tests__/discount-units.test.ts` —
   clean.
4. Re-run the live database audit query from Part 1 — should still show
   `day29plus_count: 1` (the one pre-existing un-released test loan is
   untouched by this fix; it'll simply compute correctly the next time its
   schedule is generated).

### Phase 6 — Manual re-verification of both original repro cases

1. Recreate the exact loan from Part 1's Bug #1 repro (SME/Clean/Regular,
   release 2026-08-30) and open the Origination Discount modal — Month 6
   should now show **due 2027-02-28**, not 2027-03-02.
2. Create a fresh SME/Clean/Quarterly loan with release date **2026-08-31**,
   Terms 6 — the first due date should now be **2026-11-10**, not
   2026-12-10.

---

## Part 4: Explicit Constraints — What NOT to Touch

- **`computeFirstPaymentDate`, `computeSmeFirstPaymentDate`,
  `computeSalaryFirstPaymentDate`** — all three already clamp correctly.
  Do not modify; Phase 1's new helper is additive, not a replacement for
  these.
- **`generateBiMonthlySchedule`, `advanceSemiMonthly`,
  `computeInvoiceLoan`, `computeDailyInterestLoan`** — confirmed correct in
  Part 1's audit (day-based arithmetic, no month-overflow exposure). Do not
  touch.
- **No database migration or data backfill** — Part 1's audit confirmed
  zero released loans have been corrupted by either bug. This is a pure
  code fix.
- **No changes to interest/amount formulas** — both bugs are purely about
  *which date* a payment lands on, never about *how much* is due. Every
  number in `docs/payment-schedule-manual-test-guide.md` and
  `docs/payment-schedule-easy-checklist.md` stays correct; only the due
  dates for Regular/MPL/Quarterly/Two-Monthly installments after the first
  one should change (and only for anchors on the 29th–31st).
- **Payment-schedule unification work from earlier today** (the
  `payment_schedule` field, the collateral-lock rule, `paymentSchedule`
  props/types) — completely unrelated, do not touch.
- **`addScheduleMonths`'s exported signature** — keep it exactly as-is
  (`(anchorDate: string, index: number) => string`); only its internal
  implementation changes, so every existing caller needs zero changes.
