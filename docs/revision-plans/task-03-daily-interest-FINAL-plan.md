# Task 3 (final, consolidated) — Daily interest to match the SME calculator

**Supersedes:** `task-03-daily-interest-actual-days-in-month.md` and
`task-03b-daily-interest-release-date-anchor.md`. Read those only for history.

**Why this doc exists:** the two earlier plans were written before we read the
client's own spreadsheet. We have now traced the daily-interest formulas in
`loanstar/docs/Calculator SME.xlsm` (sheet **SME**) and they are the
authoritative spec. This plan makes the app match that sheet, and fixes the
release-date anchoring the earlier work exposed.

**Workflow:** Claude plans → Cursor implements → summary validated. Do not
implement directly unless told otherwise.

---

## Part A — The spec (verified from `Calculator SME.xlsm`, sheet SME)

For a plain (non-reloan) **daily** loan (`I31="daily"`):

| Concept | Excel cell | Formula | Meaning |
| :- | :- | :- | :- |
| Release date | `F19` | manual entry (raw date) | encoder types it; **never `TODAY()`** |
| Payment date | `F20` | manual entry (raw date) | maturity / single-payment date |
| Monthly rate | `F4` | `VLOOKUP(loan type)` | e.g. 0.03 |
| Principal | `X23` / `V25` | | net loan amount |
| Days in release month | `K38` | `DAY(EOMONTH(F19,0))` | **single** number 28–31, from the release month only |
| Day count | `K39` | `DAYS(F20,F19)` | `paymentDate − releaseDate`, plain subtraction, **no +1** |
| Daily rate | `L38` | `F4 / K38` | monthly rate ÷ days-in-release-month |
| Interest (raw) | `W26` / `L39` | `principal × rate ÷ K38 × K39` | not rounded at this cell |
| Interest (shown) | output | `ROUND(BM12, 2)` | 2 dp, half-up |
| Total (shown) | output | `ROUND(BM11, 2)` where `BM11 = principal + rawInterest` | **principal + un-rounded interest, rounded once** |

Derived rules:

1. **One divisor for the whole loan** = number of days in the **release
   month**. A loan whose days run into the next month is *still* divided by the
   release month's length (e.g. released 25 Feb, paid 5 Mar → all 23 days ÷ 28).
2. **Anchored on the entered release date and payment date.** No "today", no
   compute-date. Both are values a person types.
3. **No re-pricing if the actual release slips.** If the release date changes,
   the encoder re-enters it and the sheet recalculates. There is no
   accrue-to-actual-disbursement mechanism.
4. **Leap-year February → 29** (falls out of `EOMONTH`; no special case).
5. **Round once, at the end.** Interest shown = `round(raw, 2)`. Total shown =
   `round(principal + raw, 2)` — the interest is **not** pre-rounded before
   being added to principal.
6. **"Additional Int/Day" / "Orig Released Date" / `F5×H5` do not apply to a
   fresh daily loan** — they are gated behind reloan / offset / stretch /
   compounded entry types. Out of scope here.

---

## Part B — Where the app stands vs the spec

| Spec point | App today | Gap |
| :- | :- | :- |
| Single divisor = days in release month | App accrues **per day**, each day ÷ its own month (the Task 3 "Option B" rework) | **Revert to single divisor** |
| Anchored on entered release date | `persistComputation` uses `input.releaseDate ? … : new Date()`; nothing sends `input.releaseDate`, so it is the compute-click date | **Add a release-date input; validate; plumb through** |
| Day count `payment − release`, no +1 | `daysBetween(release, payment)` — correct once the release side is the real date | OK after anchor fix |
| Round once at the end | `interest = halfUp(raw)`, then `totalDue = halfUp(principal + halfUp(raw))` — double-rounds | **Total from raw interest** (≤ ₱0.01 today, but make it exact) |
| Leap Feb = 29 | Already 29 | OK |
| No re-price on slippage | LRA `recordRelease` overwrites `computations.release_date` with the actual date (does **not** recompute) | **Skip that overwrite for daily** so the signed basis stays put |
| "Additional int/day" not for fresh daily | App has no such concept for fresh daily | OK |

Everything else about daily (single payment, no schedule, downstream reads the
stored total) already matches and must not change.

---

## Part C — Phased plan

### Guiding constraint

Touch only: `daily.ts` + its test; the Daily branch of `persistComputation`;
the Daily branch of `ComputationPanel.tsx` + the CSA compute route's validation;
the Daily guard in `recordRelease`; and the Committee-override plumbing
(`override` route + `negotiation/service.ts`). **Non-daily behaviour must be
byte-identical.** No migration. No Supabase MCP. No backfill.

---

### Phase 1 — Engine: single release-month divisor + round-once

**File:** `src/lib/computation/daily.ts` (+ `__tests__/daily.test.mts`).

- Keep `daysInMonthOf(d)` (already added).
- Replace the per-day loop with the spec formula:
  ```ts
  const monthDays = daysInMonthOf(input.releaseDate);      // release month only
  const days      = daysBetween(input.releaseDate, input.paymentDate);
  if (days < 1) throw new Error("Payment date must be after release date");
  const rawInterest = (input.principal * input.monthlyRate / monthDays) * days;
  const interest    = halfUp(rawInterest);                  // shown interest
  const totalDue    = halfUp(input.principal + rawInterest); // NOT principal + interest
  ```
- `DailyInterestResult`: drop `segments`; keep a single
  `daysInReleaseMonth: number`; `dailyRate = input.monthlyRate / monthDays`
  (exact, not blended).
- Rewrite the JSDoc to state the spec (Part A) and cite `Calculator SME.xlsm`.
- Rewrite `daily.test.mts`:
  - same-month: 30/31/28 day months, assert `daysInReleaseMonth` + interest +
    total.
  - **cross-month uses the release month**: released 10 Feb 2026, paid 5 Mar
    2026 → divisor 28, `days` 23, `interest = halfUp(100000*0.03/28*23)` =
    **₱2,464.29**, `totalDue = halfUp(102464.2857…)` = **₱102,464.29**. This is
    the case that pins the single-divisor behaviour (per-day accrual would give
    a different number here).
  - leap Feb 2028 → divisor 29.
  - **round-once**: a case where `halfUp(principal + halfUp(raw))` would differ
    from `halfUp(principal + raw)`; assert the latter.
  - guard: payment ≤ release throws.
  - determinism: two identical calls → identical result.

**Done when:** the engine reproduces the SME-sheet formula for a given
`releaseDate` / `paymentDate`, with a single divisor and one final rounding.

---

### Phase 2 — Engine: parse the Daily dates as local calendar dates

**File:** `src/lib/csa/computation.ts` (Daily branch — the `isDaily` block that
calls `computeDailyInterestLoan`, currently `~line 569`).

- **Verified layout:** line 470 `const releaseDate = input.releaseDate ? new
  Date(input.releaseDate) : new Date()` (shared with non-daily); line 509
  `firstPayment = new Date(input.manualPaymentDate!)` (daily only); line 569 the
  `computeDailyInterestLoan({...})` call.
- Inside the `isDaily` block only, **re-derive** the two dates from the raw
  source strings (`input.releaseDate`, `input.manualPaymentDate`) with an
  explicit `YYYY-MM-DD` split → `new Date(y, m-1, d)`, and pass those locals to
  `computeDailyInterestLoan`. Do **not** mutate the line-470 `releaseDate`
  variable or the line-509 `firstPayment` variable — non-daily code paths and
  the stored `first_payment_date` still use them as-is.
- If `input.releaseDate` is absent (should not happen once Phase 4 lands), keep
  the current `new Date()` fallback so nothing throws.

**Done when:** `.getDate()` / `.getMonth()` of the engine inputs equal the
digits the user typed, regardless of server zone.

---

### Phase 3 — CSA UI: a Release date input for Daily

**File:** `src/components/csa/ComputationPanel.tsx` (Daily branch only).

- Add `releaseDate` state next to `paymentDate` (`~line 592`).
- Render `<Label required>Release date</Label>` + `<Input type="date">` in the
  `selectedScheduleType === "daily"` block, above the Payment date field.
- Default to **today**; prefill from `computation.releaseDate` when editing an
  existing daily computation.
- Before submit (`~line 1338`): require `releaseDate` and require
  `releaseDate < paymentDate` — block with a clear message otherwise.
- In the POST body (`~line 1405`) add `releaseDate` **only** when
  `selectedScheduleType === "daily"`.
- The Committee calculator reuses this component (`mode === "committee"`), so
  the field appears there too — it must submit to the override endpoint with
  `releaseDate` (see Phase 6).

**Done when:** a Daily computation can only be submitted with a release date
strictly before the payment date; no other schedule type sends `releaseDate`.

---

### Phase 4 — CSA compute route: validate `releaseDate` for Daily

**File:** `src/app/api/csa/applications/[id]/computation/route.ts`.

- When the resolved schedule is `daily`: `releaseDate` is **required**, must
  parse as `YYYY-MM-DD`, and must be strictly before `body.paymentDate` → `400`
  with a specific message. **Verified:** the existing daily payment-date check
  to mirror is at **lines 412-415** (`if (paymentSchedule === "daily" &&
  !body.paymentDate) { ... "Payment date is required for Daily Interest loans"
  }`); the `releaseDate: z.string().optional()` schema field is line 91,
  forwarded at line 446 — both already present, no schema change needed, just
  the guard.
- Non-daily: ignore `releaseDate` exactly as today.
- No change to the `persistComputation({ …, releaseDate: body.releaseDate })`
  forwarding at line 446.

**Done when:** the route rejects a Daily compute with a missing / malformed /
not-before-payment release date and accepts a valid one.

---

### Phase 5 — LRA: don't overwrite `release_date` for Daily

**File:** `src/lib/lra/release-service.ts` (`recordRelease`, lines 1169-1172).

- Guard the `update({ release_date: <today> })` (line 1171) so it runs only when
  the computation's `payment_frequency !== 'daily'`. Add one
  `admin.from("computations").select("payment_frequency").eq("id",
  file.computationId).maybeSingle()` just above (use the **service client**
  `admin` already created at line 1168 — the request client cannot SELECT a
  signed computation row).
- Comment: for daily, the entered release date **is** the signed accrual basis
  (Part A rule 3); overwriting it would silently change the figure the borrower
  signed without recomputing it.
- **Side effect to accept:** with the overwrite skipped, a released daily loan's
  `computations.release_date` (and the `masterlist.release_date` copied from it
  in `initializeArAccount`) is the CSA-**entered** date, not the actual
  disbursement day. Reports that bucket by `release_date` (`dashboard/aggregates`,
  `reports/metrics/money`) therefore place a daily loan in its planned month. For
  the tiny daily population and short spans this is acceptable; storing the true
  disbursement date as well would need a new column + migration (out of scope —
  raise with the client only if reporting on the exact day matters).

**Done when:** releasing a Daily loan leaves `computations.release_date` equal to
the entered date; releasing any other type is unchanged.

---

### Phase 6 — Committee override / negotiation plumbing

**Files:** `src/app/api/committee/applications/[id]/override/route.ts`,
`src/lib/negotiation/service.ts`.

- Add `releaseDate: z.string().optional()` to the override route schema.
- Add `releaseDate?: string` to `OverrideInput` (`negotiation/service.ts:317`).
- Add `release_date` to the `existingComp` select (`~line 372`).
- In `persistOverrideComputation`, resolve it the same explicit-wins /
  omission-preserves-existing way `paymentDate` is resolved (`~line 477`):
  `input.releaseDate ?? existingComp?.release_date ?? undefined`, and pass it as
  `releaseDate` into the `persistComputation({…})` call (lines 482-544).
- Apply the same "required + before payment date for daily" validation as
  Phase 4.

**Done when:** a Committee override of a Daily loan computes interest over the
Committee-entered (or preserved) release→payment window.

---

### Phase 7 — Show the accrual window in the breakdown

**File:** `src/components/csa/ComputationPanel.tsx` (`buildComputationSteps`,
`~line 253`).

- For daily, set the interest-row formula to something like:
  `₱<principal> × <rate>/mo ÷ <N> days in <release month> × <D> days (<release date> → <payment date>)`.
- Add a row (or reuse the date block) that states the release date, payment
  date and day count used.
- Display only — no logic change.

**Done when:** the Daily "How this was computed" section states the release
date, payment date, divisor and day count.

---

### Phase 8 — Tests

- `daily.test.mts` — rewritten in Phase 1.
- New `.mts` coverage:
  - persist a Daily computation with an explicit `releaseDate` far from "now"
    and assert the stored interest equals the engine result for that window
    (i.e. independent of the current date).
  - `recordRelease`: daily → `release_date` unchanged; monthly → overwritten
    (regression guard). Follow `src/lib/lra/__tests__/release-service.test.mts`.
  - route validation: Daily without `releaseDate` → 400; with
    `releaseDate >= paymentDate` → 400.
- Add 1–2 **Excel-parity worked examples** as comments + assertions (numbers
  from Part A applied by hand).

**Done when:** `npm test` green; the parity and independence assertions pass.

---

### Phase 9 — Regression + finalise

- `npm test` (full), `npx tsc --noEmit`, `npm run build`, `eslint` on touched
  files — all green; count up only by the new cases.
- Update this doc's log and the Sept-04 tracker (Task 3 row).
- Confirm existing DB `daily` rows untouched (no backfill).

---

### Phase 10 — Client review

Demo: create a Daily loan, set a release date a few days out and a later payment
date; show the interest = `principal × rate ÷ (days in the release month) ×
(payment − release)`, matching the SME sheet. Change the release date and show
the figure move. Confirm the soft items:

- actual-days-per-month vs a flat 30/30 (the sheet uses actual days; Rovick
  wanted it confirmed);
- leap-year February = 29 (matches the sheet);
- Model 1 (no re-price if the actual disbursement date differs from the entered
  one) is acceptable.

Only then mark Task 3 **Done**.

---

## Part D — Constraints

### D.1 Files that MAY change

| File | Phase |
| :- | :- |
| `src/lib/computation/daily.ts` | 1 |
| `src/lib/computation/__tests__/daily.test.mts` + new `.mts` tests | 1, 8 |
| `src/lib/csa/computation.ts` (Daily branch date parse only) | 2 |
| `src/components/csa/ComputationPanel.tsx` (Daily branch + breakdown row) | 3, 7 |
| `src/app/api/csa/applications/[id]/computation/route.ts` (validation) | 4 |
| `src/lib/lra/release-service.ts` (`recordRelease` daily guard only) | 5 |
| `src/app/api/committee/applications/[id]/override/route.ts` (schema) | 6 |
| `src/lib/negotiation/service.ts` (`OverrideInput` + resolve/forward) | 6 |

### D.2 MUST NOT change

- Non-daily `releaseDate` parse (`csa/computation.ts:470`) and every non-daily
  schedule generator (`sf.ts`, `sme.ts`, `invoice.ts`, bi-monthly / quarterly /
  two-monthly generators, `ar/schedule.ts`, `discount-units.ts`).
- `initializeArAccount` / `buildExpectedPdcSchedule` — they keep reading the
  frozen totals; **no recompute is added** (that would be Model 2).
- The signing flow / `signature_hash`.
- `recordRelease`'s `release_date` overwrite for **non-daily**.
- Anything about reloan / offset / "additional int/day".

### D.3 Data / tooling

- **No migration**, **no Supabase MCP**, **no backfill** of existing `daily`
  rows (they pick up the new behaviour on the next recompute; released ones are
  done).
- Two-folder migration convention still applies *if* one is ever added.

---

## Part E — What this plan does NOT do

- **No per-diem re-pricing** if the actual disbursement date differs from the
  entered release date (Model 2). Matches the SME sheet. Revisit only on client
  request.
- **No change to non-daily `first_payment_date` handling** (a separate
  pre-existing drift).
- **Reloan / offset daily loans** — the SME sheet's "additional int/day" path
  was not analysed; out of scope.

---

## Part F — Client items still open

1. Actual days per month vs flat 30/30 — the sheet uses actual days; confirm.
2. Leap-year February = 29 — matches the sheet; confirm.
3. Model 1 (no re-price on release-date slippage) — matches the sheet; confirm.
4. Live demo sign-off (Phase 10).

Everything else (single divisor, release-month anchor, entered dates, round
once) is now settled by the calculator and needs no decision.

---

## Part G — Progress log

- 2026-09-07 — Consolidated plan written from the verified `Calculator SME.xlsm`
  formulas (Claude). Replaces the divisor debate and the standalone 3b plan.
- 2026-09-07 — **Phases 1–9 implemented** (Claude, direct on Rovick's
  instruction):
  - **P1** `daily.ts` — reverted per-day accrual to the single release-month
    divisor (`daysInMonthOf(releaseDate)`), round-once
    (`totalDue = halfUp(principal + rawInterest)`), dropped `segments` /
    `DailyInterestSegment`, added `daysInReleaseMonth`, exact `dailyRate`.
    JSDoc now cites the SME sheet cells. `daily.test.mts` rewritten (13 tests:
    28/29/30/31, cross-month→release-month, round-once, determinism, guard,
    `parseLocalDate`).
  - **P2** `daily.ts` gained `parseLocalDate`; `csa/computation.ts` `isDaily`
    branch parses release + payment as local `Y-M-D` before calling the engine
    (line-470 `releaseDate` / line-509 `firstPayment` untouched).
  - **P3** `ComputationPanel.tsx` — `releaseDate` state (defaults today,
    prefilled from `computation.releaseDate` when editing daily), a required
    "Release date" `<input type=date>` in the daily block with `max`/`min`
    cross-bounds, submit-time validation (required + must be before payment
    date), `releaseDate` added to the POST body only for daily.
  - **P4** CSA route — daily now requires a valid `YYYY-MM-DD` `releaseDate`
    strictly before `paymentDate` → 400s (schema field + forward already
    existed).
  - **P5** `recordRelease` — the `computations.release_date` overwrite is now
    skipped when `payment_frequency === "daily"` (one extra service-role
    select). Comment records the reporting-on-planned-date side effect.
  - **P6** committee override route schema + `OverrideInput` + `existingComp`
    select gained `releaseDate` / `release_date`; `persistOverrideComputation`
    resolves it (explicit-wins → existing → **never `now`**), validates for
    daily, and forwards it **only for daily** (non-daily overrides keep
    `persistComputation`'s own `release_date = today`).
  - **P7** `ComputationPanel.tsx` — daily "Total interest" formula line now
    spells out `₱P × R/mo ÷ N days in <YYYY-MM> × D days (<release> → <payment>)`.
  - **P8/P9** — `npm test` 1574/1574; `npx tsc --noEmit` no errors in any
    touched file; `npm run build` ✓ 140/140; `eslint` on touched files clean
    (the 4 findings in `ComputationPanel.tsx` are pre-existing, elsewhere).
  - Live parity (₱200k, 5%/mo): Feb same-month ÷28 → ₱3,571.43; Jul ÷31 →
    ₱3,225.81; **Feb 25→Mar 10 ÷28 (release month) → ₱4,642.86**; leap Feb
    2028 ÷29 → matches.
  - **Not covered by automated tests** (repo has no DB-mock harness for these):
    the CSA/committee route 400s and the `recordRelease` daily-skip — verified
    by reading; confirm in the Phase 10 demo / QA.
  - No migration, no Supabase MCP, no backfill. Non-daily behaviour unchanged.
- **Outstanding:** Phase 10 (client demo + confirm actual-days vs flat 30,
  leap-Feb = 29, Model 1). Do not mark tracker Task 3 Done until then.
