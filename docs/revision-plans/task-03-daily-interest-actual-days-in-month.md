> **SUPERSEDED 2026-09-07** by [task-03-daily-interest-FINAL-plan.md](task-03-daily-interest-FINAL-plan.md), written from the verified `Calculator SME.xlsm` formulas. Kept for history only.

# Task 3 — Daily interest should use the real number of days in the month

**Source:** [../../../docs/Development-Tracker-Sept-04.md](../../../docs/Development-Tracker-Sept-04.md) → Task 3
**Type:** fix to already-built behaviour (Daily Interest schedule type, shipped 2026-08-28)
**Workflow:** Claude wrote this plan → Cursor implements → summary validated. Do not implement directly.

---

## Part A — Audit / diagnosis

### A.1 What "Daily Interest" is in this system

`daily` is one of the payment-schedule / payment-frequency values (added
`20260828160000_add_daily_payment_frequency.sql`). A Daily Interest loan is a
**single manually-dated payment** of `principal + interest`, never a recurring
amortization schedule. Interest accrues per **actual calendar day elapsed**
between the release date and the CSA-entered payment date.

### A.2 Where the daily interest number is computed — SINGLE SOURCE OF TRUTH

There is exactly **one** place in the whole codebase that turns a monthly rate
into a daily interest figure:

| File | Line | Code |
| :- | :- | :- |
| `src/lib/computation/daily.ts` | 52 | `const dailyRate = input.monthlyRate / 30;` |
| `src/lib/computation/daily.ts` | 53 | `const interest = halfUp(input.principal * dailyRate * days);` |

`days` is whole calendar days between `releaseDate` and `paymentDate`
(`daysBetween`, lines 28–32 — uses local calendar fields, DST-safe, already
correct; **not** part of this change).

**This is the only line that hard-codes 30.** Grep for `/ 30`, `/30`,
`monthlyRate`, `dailyRate`, `daily_interest`, `days_in_month` across `src/` and
both `supabase/migrations` folders confirms no second implementation — not in
SQL, not in a Postgres function, not client-side.

### A.3 Call graph — everything funnels through one function

```
computeDailyInterestLoan()               ← daily.ts (the /30 lives here)
        ▲
        │ called once
persistComputation()                     ← src/lib/csa/computation.ts:569-577
        ▲                                  (isDaily branch: sets effectiveTotalInterest
        │                                   = daily.interest, effectiveTotalLoan =
        │                                   daily.totalDue, effectiveMonthlyAmortization
        │                                   = daily.totalDue, then INSERTs into
        │                                   public.computations)
        ├───────────────┬──────────────────────────┐
   CSA compute      Committee override         Borrower reloan
   route            (negotiation/service.ts    (api/borrower/applications/
   api/csa/.../     :482 persistComputation)   reloan/route.ts — builds an
   computation/                                 application; compute still runs
   route.ts:419                                 later through the CSA route)
```

All three entry points call `persistComputation`, which calls
`computeDailyInterestLoan` exactly once. **Fixing `daily.ts` fixes every path.**

### A.4 Downstream consumers — READ-ONLY, no recompute

Once `persistComputation` stores `total_interest` / `total_loan` /
`monthly_amortization` on the `computations` row, nothing downstream recomputes
daily interest. They copy the stored number:

| File | What it does for `daily` |
| :- | :- |
| `src/lib/ar/masterlist.ts:256-268` | Emits **one** amortization row: `amountDue = computation.totalLoan`, `dueDate = firstPaymentDate`. No math. |
| `src/lib/lra/release-service.ts:254-262` | `buildExpectedPdcSchedule`: one PDC check for `computation.totalLoan` on `firstPaymentDate`. No math. |
| `src/lib/computation/discount-units.ts` | `maxDiscountUnits('daily') === 0` — Daily has no discountable units. Untouched. |

Conclusion: **no downstream file needs to change.** The fix is confined to the
computation layer + its display string + its tests.

### A.5 Display surface

| File | Line | Current text |
| :- | :- | :- |
| `src/components/csa/ComputationPanel.tsx` | 256 | ``` `₱${...} × (${pct(c.interestRate)} ÷ 30 per day) × actual days to payment date` ``` |

This is a hard-coded **"÷ 30"** label in the "Total interest" formula row shown
to CSA. It is display-only (the value beside it, `c.totalInterest`, comes from
the DB), but it will now be factually wrong and must be updated to name the real
divisor.

### A.6 Test surface

**Test-runner reality (verified):** `npm test` is
`node --import tsx --test "src/lib/**/__tests__/*.mts"` — it runs **only
`.mts`** files, on `node:test` + `node:assert/strict` (163 files). The repo also
has **4 orphaned `.test.ts` files** that `import { … } from "vitest"`
(`daily.test.ts`, `discount-units.test.ts`, `invoice.test.ts`,
`ar/__tests__/schedule.test.ts`) — but **vitest is not a dependency** (absent
from `package-lock.json` and `node_modules`), there is no `vitest`/`vite`
config, and no npm script runs them. They are effectively dead: not executed by
`npm test`, `npm run test:ci`, or any CI path. `daily.test.ts` was last touched
by the original P1–P5 commit and never since.

| File | Impact |
| :- | :- |
| `src/lib/computation/__tests__/daily.test.ts` | Its worked examples (`3% monthly, 5 days → ₱500`, `7 days → ₱700`, dates in **August = 31 days**) become wrong under the new rule (`0.03/31 × 5 × 100000 = ₱483.87`). **But this file is not run by anything.** Treat it as stale documentation: either update its numbers for consistency, or delete it — real coverage must go in a **new `.mts` file** (Phase 4). |
| `src/lib/computation/__tests__/daily.test.mts` | **Does not exist yet — create it.** This is the file that will actually run under `npm test`. |
| `src/lib/csa/__tests__/computation.test.mts:33-34` | Safe. Uses a dummy `500` literal, not the `/30` formula. Runs today, stays green. |
| `src/lib/computation/__tests__/discount-units.test.ts` (daily cases) | Safe *and* not run (vitest). Only assert `maxDiscountUnits('daily') === 0`, which is unchanged. |

### A.7 Database audit

- `public.computations` stores the **result** (`total_interest`, `total_loan`,
  `monthly_amortization`, `interest_rate`, `payment_frequency`,
  `first_payment_date`, `release_date`). It does **not** store `dailyRate` or a
  divisor — nothing schema-level encodes "30".
- No Postgres function / trigger / view computes daily interest (grep of both
  migration folders).
- `20260828160000_add_daily_payment_frequency.sql` set a misleading
  `COMMENT ON CONSTRAINT computations_payment_frequency_check` ending
  `"... daily (30/month × terms)"`. **That comment is already gone from the live
  DB** — `20260904010000_add_special_payment_schedule.sql` does
  `DROP CONSTRAINT computations_payment_frequency_check` + `ADD CONSTRAINT ...`
  (to add `quarterly_special` / `two_monthly_special`) and never re-adds a
  comment, so the current constraint carries none. **Nothing to clean up, no
  migration.** Do not edit either already-applied migration file.
- Existing `daily` computation rows already in the DB were computed at `/30`.
  They are historical / possibly signed. **Do not backfill or recompute them**
  (see constraints). They re-derive naturally if CSA/Committee recompute the
  loan.

### A.8 `interestRate` convention (for the implementer)

`computeDailyInterestLoan` receives `monthlyRate` as a **raw decimal**
(`0.03` = 3%), same as `computations.interest_rate` and `sf.ts` / `sme.ts`.
`persistComputation` passes `input.interestRate` straight through
(`computation.ts:571`). Not affected by this change — noted so the divisor swap
isn't mistaken for a units problem.

### A.9 Open questions the code cannot answer (must go to the client — see tracker)

1. **Which month's length is the divisor** when the release→payment span crosses
   a month boundary (e.g. released Aug 25, payable Oct 3 — 28/30/31?). Rovick
   said both "the month it falls in" and "the month it was released" in the call.
   The current code has a single `days` count and no month concept, so this is a
   genuine design choice, not a bug.
2. **Actual-days vs fixed 30 ("30/30")** — Rovick explicitly still wants this
   confirmed before finalising.
3. **Leap-year February** — 28 or 29 for Feb 2028, etc. Not discussed.

This plan implements **Option A (single divisor, anchored on the release
month)** as the default because it is the literal "quick fix" both Rovick and
the client described ("in February divide by 28"), and documents **Option B
(per-day divisor)** as the fallback to raise in the meeting. The divisor anchor
is isolated in one helper so switching A↔B, or release-month↔payment-month, is a
one-line change.

---

## Part B — Implementation plan (phased, surgical)

### Guiding constraint

Every phase touches **only** `src/lib/computation/daily.ts`, its test file, and
the one display string in `ComputationPanel.tsx`. Nothing else. If a change
seems to require editing `persistComputation`, `masterlist.ts`,
`release-service.ts`, a route, or a migration — **stop**, it's out of scope,
re-check against this plan.

---

### Phase 1 — Add a month-length helper (pure, isolated)

**File:** `src/lib/computation/daily.ts` only.

Add a small pure helper near `daysBetween`:

```ts
/** Calendar days in the month of `d` (28–31), local fields. Same
 * last-day-of-month idiom as release-date.ts
 * (`new Date(y, m + 1, 0).getDate()`). Leap-year February returns 29 —
 * flag for client confirmation (Task 3 open question 3). */
function daysInMonthOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
```

No behaviour change yet. Helper is unexported (module-private) unless a test
needs it — if so, export it and add a focused unit test rather than reaching
into internals.

**Timezone note (pre-existing, do not "fix" here):** `daysInMonthOf` reads
local `Date` getters on a value that `persistComputation` parses from a
`"YYYY-MM-DD"` string (UTC midnight). `daysBetween` (line 28) and
`computeFirstPaymentDate` (`release-date.ts`) already do exactly this on the
same value, so the divisor-month derivation inherits their existing assumption
that the server runs in PH time (or UTC) — it is **not** a new risk. The only
consequence for this task: **tests must use mid-month dates** (see Phase 4), not
the 1st/last of a month, or a behind-UTC CI box can roll `getMonth()` into the
adjacent month and assert the wrong divisor.

**Done when:** file compiles, `daysInMonthOf(new Date("2026-02-10"))` → 28,
`...("2028-02-10")` → 29, `...("2026-07-10")` → 31. No other file changed.

---

### Phase 2 — Swap the divisor (the actual fix)

**File:** `src/lib/computation/daily.ts` only.

Replace line 52:

```ts
// BEFORE
const dailyRate = input.monthlyRate / 30;

// AFTER (Option A — single divisor, anchored on the RELEASE month)
const divisorDate = input.releaseDate;               // anchor — see Part A.9 Q1
const daysInDivisorMonth = daysInMonthOf(divisorDate);
const dailyRate = input.monthlyRate / daysInDivisorMonth;
```

- Keep `interest = halfUp(input.principal * dailyRate * days)` exactly as-is
  (`days` and `halfUp` are unchanged).
- `daysInDivisorMonth` on `DailyInterestResult` is **optional** — only add it if
  a test asserts on the divisor directly. It is additive and safe (the type is
  consumed only in `computation.ts:575-577`, which reads `.interest` /
  `.totalDue`), but the minimal diff is one logic line + JSDoc.
- Update the JSDoc block (lines 34–43): replace "monthly rate ÷ 30" and the
  "Formula:" / "Worked example:" lines with the actual-days formula and a
  recomputed example (e.g. `₱100,000, 3% monthly, released July (31d), 5 days →
  100000 × 0.03/31 × 5 = ₱483.87`).

**Surgical notes:**
- Do **not** change the function signature — `releaseDate` / `paymentDate` are
  already parameters.
- Do **not** touch `daysBetween`.
- Do **not** add a `paymentDate`-month branch or a per-day loop in this phase —
  that's Option B, gated on the client answer (Phase 4).

**Done when:** `computeDailyInterestLoan` divides by the release month's real
length; `persistComputation` still calls it with the same 4 args and stores
`daily.interest` / `daily.totalDue` unchanged in shape.

---

### Phase 3 — Fix the display string

**File:** `src/components/csa/ComputationPanel.tsx`, line 256 only.

```tsx
// BEFORE
? `₱${formatMoney(c.principal)} × (${pct(c.interestRate)} ÷ 30 per day) × actual days to payment date`

// AFTER
? `₱${formatMoney(c.principal)} × (${pct(c.interestRate)} ÷ days in release month) × actual days to payment date`
```

- No logic change — this row's `value` is still `c.totalInterest` from the DB.
- Do not add a new computed field to the panel; the exact divisor number is not
  currently shown and adding it is scope creep. If the client asks to see the
  literal divisor at the meeting, that's a follow-up.

**Done when:** the CSA "Total interest" formula row no longer says "÷ 30".

---

### Phase 4 — Tests (new `.mts` file that actually runs)

**Primary file:** `src/lib/computation/__tests__/daily.test.mts` — **new**.
Mirror the runnable convention exactly (see `computation.test.mts`):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDailyInterestLoan } from "../daily";
```

Cover:
- **28-day month** — release `2026-02-10`, payment `2026-02-20` (10 days), 3%
  monthly, ₱100,000 → `dailyRate = 0.03/28`, interest `halfUp(100000 * 0.03/28 *
  10)` = ₱1,071.43. Assert `result.days === 10` and the interest/`totalDue`.
- **31-day month** — release `2026-07-10`, payment `2026-07-15` (5 days) →
  `dailyRate = 0.03/31`, interest ₱483.87, `totalDue` ₱100,483.87.
- **30-day month** — release `2026-09-10`, payment `2026-09-15` → divisor 30,
  interest ₱500 (proves the old worked example still holds *only* for 30-day
  months).
- **Leap-year February** — release `2028-02-10`, payment `2028-02-20` → divisor
  **29**. Comment it as pending client confirmation (A.9 Q3); if the client says
  "always 28", this expectation flips and `daysInMonthOf` gets a leap guard.
- **Rejects payment date on/before release** — port the existing guard test
  (unchanged behaviour, `days < 1` throws `"Payment date must be after release
  date"`).
- If `daysInDivisorMonth` is added to the result, assert it directly in the
  28/31/30 cases — that is the client's actual acceptance criterion.

**Use mid-month dates only** (never the 1st/last) — see the Phase 1 timezone
note.

**Secondary file:** `src/lib/computation/__tests__/daily.test.ts` (the orphaned
vitest one). Options, pick one and state it in the PR:
- **Preferred:** delete it — its coverage is now in the `.mts` file and it never
  runs, so leaving stale wrong numbers is worse than removing it.
- Or: update its literals to match, purely so a reader who opens it isn't
  misled. Do **not** invest in it beyond that.

**Done when:** `npm test` runs `daily.test.mts` and it passes; the 28/31/30-day
cases each assert the divisor (or the interest that only balances at that
divisor).

---

### Phase 5 — Full regression check (no code)

- `npm test` — the full `.mts` suite (163 files). The new `daily.test.mts` must
  pass; every pre-existing suite must stay green and unchanged. Note the current
  baseline count first (`npm test` before any change) and confirm it goes up by
  exactly the number of new `daily.test.mts` cases, nothing regressed.
- `src/lib/csa/__tests__/computation.test.mts` — the `resolveGrossTotals('daily',
  …)` case uses a `500` literal, unaffected; must still pass.
- `npx tsc --noEmit` — the added `DailyInterestResult` field (if any) must not
  break `computation.ts:575-577` or any other consumer.
- `npm run build` — Next build type-check clean (per `AGENTS.md`, this is a
  modified Next; a plain `tsc` is not the whole story).
- `npm run lint` (`eslint`) — clean on the 2–3 touched files.
- Not applicable: `discount-units.test.ts` / `daily.test.ts` (vitest, not run).

**Done when:** `npm test` green with the higher count, `tsc --noEmit` clean,
`npm run build` clean, `eslint` clean.

---

### Phase 6 — Client review (at Wednesday's meeting, before "Done")

Demonstrate in the CSA calculator:
- one Daily Interest loan released + payable inside a **28-day month** → divisor
  28 in the interest figure;
- one released + payable inside a **31-day month** → divisor 31;
- and explicitly ask the three open questions (A.9). Capture the answers back
  into the tracker.

If the client picks **Option B (per-day divisor)** or **payment-month anchor**:
- Option B: replace Phase 2's single `dailyRate` with a loop over each day from
  `releaseDate` (exclusive) to `paymentDate` (inclusive), summing
  `monthlyRate / daysInMonthOf(thatDay)`; `interest = halfUp(principal × Σ)`.
  Still only `daily.ts` + tests change. ~6 lines.
- Payment-month anchor: change `const divisorDate = input.releaseDate;` to
  `input.paymentDate`. One line + test dates.

---

## Part C — Constraints

### C.1 Files that MUST be changed (allowlist — nothing outside this)

| File | Phase | Why |
| :- | :- | :- |
| `src/lib/computation/daily.ts` | 1, 2 | the `/30`, the new `daysInMonthOf` helper, JSDoc |
| `src/lib/computation/__tests__/daily.test.mts` | 4 | **new** — the only test file that actually runs under `npm test` |
| `src/lib/computation/__tests__/daily.test.ts` | 4 | orphaned vitest file — delete it, or fix its literals; do not invest further |
| `src/components/csa/ComputationPanel.tsx` (line 256 string only) | 3 | "÷ 30" label |

### C.2 Files that MUST NOT be changed

- `src/lib/csa/computation.ts` (`persistComputation`) — it calls the function
  with the right args already; the `isDaily` branch shape (`daily.interest` /
  `daily.totalDue`) stays identical.
- `src/lib/ar/masterlist.ts`, `src/lib/lra/release-service.ts` — read the stored
  total only, no daily math.
- `src/lib/computation/discount-units.ts` — Daily has 0 discount units,
  unrelated.
- `src/app/api/csa/applications/[id]/computation/route.ts`,
  `src/app/api/committee/applications/[id]/override/route.ts`,
  `src/lib/negotiation/service.ts`,
  `src/app/api/borrower/applications/reloan/route.ts` — entry points; they pass
  `paymentDate` through and don't compute interest.
- `src/lib/computation/release-date.ts` — reuse its month-length **idiom**, do
  not import from it or edit it.
- Any other schedule engine (`sf.ts`, `sme.ts`, `invoice.ts`, `coverage.ts`,
  `offset-discount.ts`, `collector-discount.ts`, the Quarterly/Two-Monthly
  generators) — a different formula, out of scope. The `/ 30` you may see in
  `cig/field-visit.ts:162` is an unrelated comment ("82% / 30% formulas").

### C.3 Database / migration constraints

- **No migration.** No schema change, no Postgres function, no data backfill.
- **Do not recompute or backfill existing `public.computations` rows** with
  `payment_frequency = 'daily'`. They may be signed / released. They correct
  themselves only through a normal CSA/Committee recompute.
- The misleading `"30/month × terms"` constraint comment from the 0828
  migration **no longer exists in the live DB** (dropped by the 0904 special-
  schedule migration, see A.7) — there is nothing to fix. Do not add a
  `COMMENT ON` migration, and do not edit either already-applied migration file.

### C.4 MCP / tooling constraints

- **Do not use the Supabase MCP** (`apply_migration`, `execute_sql`,
  `deploy_edge_function`, branch tools) for this task. It is pure application
  code — no DB round-trip is needed or wanted.
- If a migration is ever added under this task, it follows the project's
  **two-folder** convention (`loanstar/supabase/migrations` **and**
  `supabase/migrations`) — but see C.3, the default is no migration.
- No new npm dependency (month length is one line of stdlib `Date`).

### C.5 Behavioural guardrails

- `days` (elapsed calendar days) semantics and the `days < 1` guard are
  unchanged.
- `halfUp` rounding stays the only rounding; do not round `dailyRate` itself.
- The result stays a **single payment** — no phase may introduce a schedule
  array for Daily.
- Keep the change reviewable as one small diff; if the client hasn't confirmed
  actual-days vs 30/30 (A.9 Q2), this is still safe to ship behind the
  Wednesday demo since Daily Interest is a low-volume, freshly-added schedule
  type — but do not mark the tracker item **Done** until the verbal
  confirmation is recorded.

---

## Part D — Progress log

- 2026-09-07 — Audit complete, plan written (Claude). Awaiting Cursor
  implementation of Phases 1–5; Phase 6 at the Wednesday client meeting.
- 2026-09-07 — Plan validated against the codebase (Claude). Confirmed: file
  paths, line numbers, `daily.ts:52` `/30`, the 3 `persistComputation` entry
  points, read-only downstream (`ar/masterlist.ts`, `lra/release-service.ts`),
  `ComputationPanel.tsx:256` string, table `computations` + column names,
  `halfUp` 2-dp rounding, worked-example arithmetic. **Corrections applied:**
  (1) the vitest `.test.ts` files are orphaned (vitest not installed, nothing
  runs them) — Phase 4 now creates a runnable `daily.test.mts`; (2) the
  misleading `"30/month × terms"` constraint comment was already dropped by the
  0904 migration — no cleanup needed.
- 2026-09-07 — Phases 1–5 implemented directly (Claude, on Rovick's
  instruction — deviates from the usual Cursor handoff for this small change):
  - **P1** `daily.ts`: added `export function daysInMonthOf(d: Date)` (exported,
    not module-private, so P4 can unit-test it). No behaviour change.
  - **P2** `daily.ts`: `dailyRate = monthlyRate / 30` → `/ daysInMonthOf(input.releaseDate)`
    (release-month anchor); added `daysInDivisorMonth` to `DailyInterestResult`
    and the return; JSDoc rewritten.
  - **P3** `ComputationPanel.tsx:256`: `÷ 30 per day` → `÷ days in release month`
    (label only, `value` still `c.totalInterest`).
  - **P4** new `src/lib/computation/__tests__/daily.test.mts` (8 tests: 28/29/30/31-day,
    cross-month anchor, scaling, guard); deleted orphaned `daily.test.ts`.
  - **P5** regression: `npm test` 1569/1569 pass (1561 + 8 new); `npx tsc --noEmit`
    no errors in touched files (pre-existing unrelated errors only); `eslint`
    clean on `ComputationPanel.tsx` (pre-existing findings elsewhere);
    `npm run build` ✓ compiled successfully, 140/140 pages, exit 0.
  - Live sanity: 30-day→₱500, Jul/31→₱483.87, Feb/28→₱1,071.43, leap Feb/29→₱1,034.48.
  - Existing DB `daily` computation rows NOT backfilled (per C.3). No migration.
    Supabase MCP not used.
  - **Not done:** P6 — client demo + answers to A.9 open questions (which-month
    anchor, actual-days vs 30/30, leap-Feb). Do not mark the tracker item Done
    until confirmed on the Wednesday call.
- 2026-09-07 — **Post-implementation audit found the Option-A anchor was weak
  (Claude).** In every real code path `body.releaseDate` is never sent, so
  `persistComputation` used `new Date()` — the divisor was "days in the month
  CSA clicked Compute", not the release or payment month; and LRA release
  overwrites `computations.release_date` with the real date
  (`release-service.ts:1171`) without recomputing, so the stored figure and the
  "release month" label could disagree. **Reworked to Option B (per-day
  accrual):** each elapsed day is charged `principal × monthlyRate ÷ (length of
  that day's own calendar month)`. Same-month loans are unchanged from Option A
  ("February ÷ 28" still exact); cross-month loans no longer need a "which month
  wins" rule; the result no longer depends on the compute date, which also
  neutralises the LRA overwrite concern.
  - `daily.ts`: `computeDailyInterestLoan` now loops the elapsed days;
    `DailyInterestResult.daysInDivisorMonth` replaced with
    `segments: DailyInterestSegment[]` (`{month, days, monthLength}` per calendar
    month touched); `dailyRate` is now the blended effective rate. JSDoc
    rewritten.
  - `ComputationPanel.tsx:256`: label → `… accrued per day — each day ÷ that
    day's own month length (28–31)`.
  - `daily.test.mts`: rewritten, 10 tests (same-month 28/29/30/31, cross-month
    Feb→Mar and Feb→Apr with `segments` assertions, compute-date independence,
    scaling, guard).
  - Regression: `npm test` 1571/1571 pass; `tsc --noEmit` clean on touched
    files; `eslint` clean on `daily.ts` / `ComputationPanel.tsx` (pre-existing
    findings elsewhere); `npm run build` ✓ 140/140.
  - Live sanity (₱200k, 5%/mo, 10 days): Feb ₱3,571.43 · Jul ₱3,225.81 · Sep
    ₱3,333.33 · Jan-computed span into Feb ₱3,467.74 (3 days ÷31 + 7 days ÷28).
  - **Still out of scope (separate pre-existing bug, client did not raise it):**
    the elapsed-day *count* is measured from the CSA compute date, not the real
    release date — if CSA computes days before releasing, those extra days are
    charged. Option B fixes the divisor, not the day-count origin. Flag
    separately.
  - A.9 open questions still stand for the Wednesday demo — Option B answers #1
    (each month owns its own days) and #3 (leap Feb = 29) by construction, but
    both still need the client's explicit yes, along with #2 (actual-days vs
    30/30).
