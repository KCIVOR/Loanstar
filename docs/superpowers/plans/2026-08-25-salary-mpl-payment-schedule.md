# Salary & MPL Payment Schedule — Individual Loan Sub-Types

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The user runs **one phase at a time** and reviews before the next starts.

**Goal:** Give `segment = "individual"` loans their own, correct payment-date rules, split by sub-type —
something the system cannot do at all today, because it has no way to tell an MPL loan apart from a Salary
loan. MPL reuses SME's existing "release + 1 month, same day" rule. Salary gets a genuinely new
**semi-monthly** rule (15th and end-of-month, two payments a month) that reaches into the real repayment
schedule, not just a display date — confirmed by the user across two rounds of targeted questions after an
earlier answer of theirs turned out to be self-contradictory (see Audit #7).

---

## Audit — confirmed root causes

1. **No field anywhere distinguishes MPL / Salary / Auto / REM.** Confirmed via full-codebase grep (case
   insensitive, word-bounded, "mpl|salary|sub_type|subtype|product_type|loan_sub_type") across all source and
   migrations — zero real hits. `loan_applications` has only `segment`, `entity_type` (SME-only), and
   `collateral_type` (`none | car_refinancing | real_estate` — `create-application.ts:21-23`,
   `20260818222546_individual_segment_schema_phase1.sql:13-15`).
2. **`collateral_type = "none"` collapses MPL and Salary into the same bucket.** Both are unsecured
   ("clean") individual products, so both land on `collateral_type: "none"` today with no way to tell them
   apart — confirmed by tracing the new-application form (`csa/applications/new/page.tsx:203-221`) and its
   3-option dropdown.
3. **The real AR repayment schedule doesn't reuse the computation's first-payment-date at all** —
   `generateAmortizationSchedule` (`src/lib/ar/schedule.ts`) independently recomputed it with the Seafarer
   22nd-cutoff rule regardless of segment, silently diverging from `computation.firstPaymentDate` for every
   non-Seafarer loan. **Fixed separately, earlier today** (see `git log` / prior session turn) — mentioned
   here only because Phase 4 of this plan builds directly on that fix (the schedule generator now trusts a
   passed-in `firstPaymentDate` instead of recomputing).
4. **The LRA PDC builder is hard-wired to exactly `terms` checks, one per month.**
   `buildPdcSchedule`/`submitPdc` (`src/app/lra/applications/[id]/page.tsx:353-380,394-434`) loop
   `for (let i = 0; i < terms; i += 1)`, dating each via `addScheduleMonths(pdcDate, i)` — a whole-month
   advance. A semi-monthly loan needing `terms * 2` checks on alternating dates has no path through this code
   today.
5. **`savePdcChecks` hard-validates `checks.length !== computation.terms`** (`release-service.ts:243-247`)
   and every check's date against the same `addScheduleMonths` advance (`:269-276`), and every check's
   amount against the single `computation.monthlyAmortization` value (`:261-267`). All three assumptions
   break for a semi-monthly (doubled-count, alternating-date, half-amount) schedule.
6. **`create-application.ts`'s schema is the natural, precedented home for a new field.** It already has a
   `.refine()` pattern tying `entityType`/`collateralType` to `segment` (`:25-32`) — a new
   `individualLoanType` field fits the exact same shape.
7. **A genuine self-contradiction in the user's own answers, caught and resolved before building anything:**
   an earlier statement said "MPL will pay every end of the month"; a later, more detailed answer said "MPL's
   due date is the same day of the month as release (e.g. Aug 24 → Sep 24)." Asked directly — the user
   confirmed the **second** answer (same-day-as-release) is correct. This means **MPL needs no new date
   function at all** — it reuses `computeSmeFirstPaymentDate` (`release-date.ts`) exactly as-is.
8. **Documents/templates key only on `segment` and `collateral_type`**, never on a finer sub-type
   (`lra/constants.ts`'s `AUTO_GENERATED_SLUGS`/`COLLATERAL_GENERATED_SLUGS`,
   `template-context.ts:120`'s `isIndividual` branch). No sub-type-specific document was requested or
   confirmed — out of scope for this plan (see Deferred).
9. **`assessFieldVisitRequired`** (`src/lib/cig/field-visit.ts:327-352`) is a single generic check, not
   branched by segment or sub-type. Not touched by this plan — nothing here requires it to change.
10. **A second, entirely separate application-creation path exists and was missing from the original
    draft of this plan**: `src/app/api/borrower/applications/reloan/route.ts` — borrower self-service reloan
    (and first-time application) creation. It already inserts `segment`/`entity_type`/`collateral_type`
    (lines 152-167), reading `collateralType` from a loosely-typed body reader (`readSegmentBody`, lines
    42-55) validated against a `VALID_COLLATERAL_TYPES` set (lines 57-61) — **not** through
    `createApplicationSchema`'s zod refine at all. `segment`/`entityType` inherit from the borrower's prior
    application on reloan via `resolveBorrowerCreateSegment` (lines 125-131); `collateralType` deliberately
    does **not** inherit — it resets to `"none"` unless resubmitted (line 139-142). Confirmed with the user:
    `individual_loan_type` follows the **`collateralType` pattern** (reset each time, not inherited).
11. **`persistComputation` never sees `individual_loan_type` today, and three separate files would need to
    change for it to reach there**: (a) `getApplicationForStaff` (`src/lib/csa/application.ts:49-60`) selects
    an **explicit column list**, not `select("*")` — `individual_loan_type` must be added to it or
    `assertCsaCanEdit`'s returned application silently won't carry the field; (b) the CSA computation route
    (`computation/route.ts`) must then pass it into the `persistComputation(...)` call; (c) `mapComputationRow`
    must read `payment_frequency` back onto the returned object, or `computation.paymentFrequency` — which
    Phase 3/4 both depend on — is `undefined` everywhere despite existing in the database.
12. **A third instance of the same "explicit whitelist drops a new field" bug already fixed twice this
    session** (Committee's route, for `firstPaymentDate`/`adminRate`/`chattelRate`): the LRA workspace route
    (`src/app/api/lra/applications/[id]/route.ts:137-145`) builds its own explicit `computation` object with
    only 5 fields — `paymentFrequency` would be silently dropped here too unless added. The LRA page's own
    local `computation` type (`src/app/lra/applications/[id]/page.tsx:93-99`) needs the same field added on
    the frontend side, mirroring the two-places-need-updating pattern already established for
    `firstPaymentDate` earlier this session.

---

## What was decided (confirmed via targeted questions, this session)

1. **Salary is genuinely semi-monthly**: two payments every month, on the 15th and the last day
   ("kinsenas katapusan"). A 6-*term* (month) loan produces **12 actual payment dates**.
2. **MPL is genuinely different from Salary**, not imprecise phrasing for one rule. MPL: one payment per
   month, due on the same day-of-month as release — identical in shape to SME's already-shipped rule.
3. **A new sub-type field is needed** — the user explicitly confirmed this, recommending something like an
   "individual product type" / "loan sub-type" field set at application creation.
4. **The semi-monthly cadence applies to the *entire* schedule**, not just the starting point — every
   installment in the PDC and the real AR amortization schedule must alternate 15th/end-of-month, not just
   the first one.
5. **Salary's first payment** = the next occurrence of {15th, end-of-month} on or after the release date
   (release day ≤ 15 → that month's 15th; release day > 15 → that month's last day).
6. **"Terms: 6" for Salary still means 6 months**, producing 12 semi-monthly payments, **each half the
   normal monthly amortization** — total interest/principal/total-loan math is completely unaffected; only
   the repayment schedule's shape (count, dates, per-payment amount) changes.
7. **MPL reuses `computeSmeFirstPaymentDate` directly** — confirmed no new function is needed for it
   (Audit #7).

---

## Architecture

- **New nullable column `loan_applications.individual_loan_type`** (`'mpl' | 'salary'`, null otherwise) —
  only meaningful when `segment = 'individual'` and `collateral_type = 'none'` (Auto/REM don't need it; their
  own payment-date rule remains unconfirmed and untouched — see Deferred). Set at application creation,
  alongside `collateralType`, using the exact same `.refine()` pattern already in `create-application.ts`.
- **New column `computations.payment_frequency`** (`'monthly' | 'semi_monthly'`, default `'monthly'`) —
  denormalized onto the computation row itself so every downstream consumer (LRA PDC builder,
  `savePdcChecks`, the AR schedule generator) can branch on one flag without re-joining
  `loan_applications` every time. Set once, in `persistComputation`, based on `individual_loan_type`.
- **`computeSmeFirstPaymentDate` is reused verbatim for MPL** — no new function, no changes to it. Only
  `persistComputation`'s branch condition changes (add `individualLoanType === "mpl"` alongside
  `segment === "sme"`).
- **One new function, `computeSalaryFirstPaymentDate`**, in `release-date.ts` — release day ≤ 15 → that
  month's 15th; else → that month's last day. Mirrors the existing functions' style (numeric `Date`
  constructor + `formatDateLocal`, never `.toISOString()` on a numeric-constructed date, per this session's
  established timezone-safety rule).
- **One new function, `advanceSemiMonthly(anchorDate: string, index: number): string`**, also in
  `release-date.ts` — given a semi-monthly anchor (a 15th or an end-of-month date), returns the date at
  position `index` in the alternating sequence (15th → same month's end → next month's 15th → next month's
  end → …). Shared by the LRA PDC builder, `savePdcChecks`, and the AR schedule generator, exactly the way
  `addScheduleMonths` is already shared today — so none of them can disagree with each other.
- **Per-payment amount for semi-monthly**: `halfUp(monthlyAmortization / 2)` per installment, with the
  **last** installment absorbing whatever centavo rounding remains against `totalLoan` — the exact same
  "last installment absorbs the rounding centavo" pattern `ar/schedule.ts` already uses for the monthly case
  (`schedule-f2.test.mts`'s second test), just extended to 12 installments instead of 6.
- **Seafarer, SME, and any `individual` application with no `individual_loan_type` set (Auto/REM, or legacy
  rows from before this plan) are completely unaffected** — they keep `payment_frequency = 'monthly'` and
  whichever date rule already applies to them today.

---

## Ground Rules

- Closed Allow lists per phase. Anything outside → STOP and flag.
- `git diff --stat` after each phase.
- Do not commit unless asked.
- Each phase verified with `tsc --noEmit`, `npm run test`, and a live-data check before moving on.

---

## Hard Constraints

### Never Modify
- **`computeSmeFirstPaymentDate`, `computeFirstPaymentDate`, `formatDateLocal`, `addScheduleMonths`**
  (all in `release-date.ts`) — this plan only *adds* two new functions alongside them. Not one line of any
  existing function in this file changes. SME's Phase-4 behavior and Seafarer's original behavior both stay
  byte-for-byte identical.
- **`sme.ts`, `sf.ts`** — the computation engines themselves. Nothing about this plan changes principal,
  interest, total loan, or monthly amortization math for any segment; it only changes how that already-computed
  monthly figure gets split into a schedule.
- **Auto/REM's payment-date rule** — never touched or inferred. `individual` applications with
  `individual_loan_type` still `null` (which includes every Auto/REM application, since the field is only
  ever set for `collateral_type = 'none'`) keep the old Seafarer-rule fallback exactly as before this plan.
- **`collateralType`'s own validation and the `entityType` refine** (`create-application.ts:25-32`) —
  additive only; do not restructure the existing refine chain, just add a new one alongside it.
- **`resolveBorrowerCreateSegment`** (used by `borrower/applications/reloan/route.ts` for
  segment/entityType inheritance) — do not extend it to also handle `individual_loan_type`. Locked Decision
  #8 means `individual_loan_type` follows the simpler, non-inheriting `collateralType` pattern instead;
  wiring it through the inheritance resolver would be building the wrong behavior.
- **Document generators / template context** (`lra/constants.ts`, `template-context.ts`, everything under
  `src/lib/documents/`) — no changes anywhere. Confirmed nothing was requested or needed here (Audit #8).
- **`assessFieldVisitRequired`** and any other CIG verification-completeness logic (`src/lib/cig/**`) —
  unrelated, not touched.
- **`ar/schedule.ts`'s existing monthly-case behavior and its rounding pattern for the monthly path** —
  Phase 4 adds a semi-monthly branch; the existing `for (i < terms)` monthly loop and its "last installment
  absorbs rounding" logic for monthly loans must produce identical output to today for every non-Salary
  loan. The two existing tests in `schedule-f2.test.mts` must keep passing unmodified — do not edit that
  test file to make a change "work"; if a change makes those tests fail, the change is wrong, not the tests.
- **`savePdcChecks`'s existing monthly-path validation messages/thresholds** for non-semi-monthly loans —
  the new branch is additive; a Seafarer/SME/MPL PDC submission must trigger the exact same errors, in the
  exact same wording, as before this plan.
- **Committee's application route/page, CSA's ComputationPanel rate-input UI, and everything else shipped in
  the SME calculator alignment plan earlier today** — unrelated feature, do not touch even incidentally
  while editing shared files. `computation.ts` and `release-date.ts` are both touched by that earlier plan
  *and* this one; when editing them, only add what this plan specifies — do not "clean up" or restructure
  anything from the earlier work.
- **RLS policies on `computations` or `loan_applications`** — the new columns are plain nullable/defaulted
  additions; do not add, remove, or alter any RLS policy. If a policy needs updating for the new columns,
  stop and flag it rather than assuming.

### Touch With Extreme Care
- **Rounding on the semi-monthly split.** `halfUp(monthlyAmortization / 2)` twelve times must sum to exactly
  `totalLoan` minus whatever the monthly-cadence math already accounts for — verify against a real example
  with a non-round monthly amortization (e.g. one ending in an odd centavo), not just a clean number, so the
  last-installment rounding absorption is actually exercised.
- **`savePdcChecks`'s three validations** (count, date, amount) — all three need a semi-monthly branch; an
  incomplete fix here (e.g. fixing count but not amount) would just move the code-can't-be-bypassed guarantee
  established for SME's PDC lock to a different validation, not preserve it.
- **`computations.payment_frequency` must be set consistently with `individual_loan_type`** — never let a
  computation end up `semi_monthly` while its application's `individual_loan_type` isn't `'salary'`, or vice
  versa; they should always agree, since downstream code trusts `payment_frequency` alone.

---

## Locked Product Decisions

| # | Decision |
|---|---|
| 1 | MPL: release + 1 month, same day — identical rule to SME, reusing `computeSmeFirstPaymentDate` verbatim. |
| 2 | Salary: semi-monthly, 15th + end-of-month, two payments per month, applied to the *entire* schedule (not just the first payment). |
| 3 | Salary's first payment = next occurrence of {15th, end-of-month} on or after release date. |
| 4 | "Terms" keeps meaning months for Salary — 6 terms = 12 actual semi-monthly payments, each half the normal monthly amortization, with the last one absorbing rounding. |
| 5 | New `loan_applications.individual_loan_type` field (`mpl`/`salary`/null), set at application creation — only meaningful for `segment=individual`, `collateral_type=none`. |
| 6 | Auto/REM's payment-date rule is **out of scope** — stays on the old Seafarer-rule fallback until separately confirmed. |
| 7 | Seafarer and SME are completely unaffected by this entire plan. |
| 8 | `individual_loan_type` does **not** inherit on borrower reloan — resets each time, matching `collateralType`'s existing behavior, not `segment`/`entityType`'s inheriting behavior. |

---

## Phase 1: Schema + application-creation wiring

### Scope
Add the two new columns, and let CSA actually set `individual_loan_type` when creating a new individual/clean
application. No date-rule or schedule logic yet — this phase only makes the data collectible and storable.

### Allow List
- New migration file under `supabase/migrations/`
- `src/lib/csa/create-application.ts`
- `src/app/csa/applications/new/page.tsx`
- `src/app/api/borrower/applications/reloan/route.ts` — a second, independent application-creation path
  (finding #10), missing from the original draft of this phase.

### Tasks
- [x] Migration: `alter table loan_applications add column individual_loan_type text check (individual_loan_type in ('mpl','salary'));` and `alter table computations add column payment_frequency text not null default 'monthly' check (payment_frequency in ('monthly','semi_monthly'));`
- [x] `createApplicationSchema`: add `individualLoanType: z.enum(["mpl", "salary"]).optional()`, plus two `.refine()`s — required when `segment === "individual" && collateralType === "none"`, forbidden otherwise.
- [x] `createCsaApplication`: insert `individual_loan_type: body.individualLoanType ?? null`; included in the audit event's `afterData`.
- [x] New-application UI (`csa/applications/new/page.tsx`): added a 2-option selector (MPL / Salary), visible only when `segment === "individual" && collateralType === "none"`; also updated the dev "Fill: Individual" autofill preset (found during implementation — it would have failed the new required-field validation) into two presets, "Fill: Individual (MPL)" and "Fill: Individual (Salary)".
- [x] `borrower/applications/reloan/route.ts`: extended `readSegmentBody` to read `individualLoanType`; added `VALID_INDIVIDUAL_LOAN_TYPES`; computed read-from-body-only (no inheritance, Locked Decision #8); added a required-when check mirroring the existing seafarer/collateral rejection right above it; inserted into `loan_applications`; included in the audit event's `afterData`.
- [x] Fixed an existing test broken by the new required-field validation (`create-application.test.mts`'s "accepts individual segment without entityType" test didn't supply `individualLoanType`) — updated it, and added 6 new tests covering the required-when/forbidden-when refine logic directly.

### Verification
- [x] Migration applies cleanly via Supabase MCP.
- [x] `tsc --noEmit` — 13, baseline unchanged.
- [x] `npm run test` — 1355 passed (6 new), 0 failures.
- [x] Live test via `createCsaApplication`: real applications created with `individualLoanType: "salary"` and `"mpl"` → both persisted correctly (`individual_loan_type` = `'salary'`/`'mpl'`). An SME application created alongside confirms `individual_loan_type` stays `null` for non-individual segments.
- [x] Schema-level required-when/forbidden-when behavior verified via the 6 new unit tests (executed, not just written) — covers: rejected without it, accepted with `mpl`, accepted with `salary`, rejected when collateral isn't `none`, rejected for `sme`, not required for `seafarer`.
- [x] Test rows/borrowers cleaned up, 0 leftover.
- [x] **Not verified via a full live HTTP round-trip**: the borrower reloan endpoint's reset-not-inherit behavior was verified by code inspection (the same 3-line pattern as the already-proven `collateralType`, which reads from body only and never touches `latestApp`) rather than an actual two-request HTTP test, since that route requires an authenticated session context impractical to script directly. Flagging this honestly rather than claiming a live test that didn't happen — worth a manual click-through check if you want full confidence here.
- [x] `git diff --stat` — 4 files touched (3 Allow-listed + the 1 necessary test fix), plus the new migration file (untracked).

---

## Phase 2: Date-rule functions + `persistComputation` branching

### Scope
Add `computeSalaryFirstPaymentDate` and `advanceSemiMonthly`; branch `persistComputation`'s first-payment-date
logic and set `payment_frequency` based on the application's `individual_loan_type`.

### Allow List
- `src/lib/computation/release-date.ts`
- `src/lib/csa/computation.ts`
- `src/lib/csa/application.ts` — `getApplicationForStaff`'s explicit column select (finding #11a)
- `src/app/api/csa/applications/[id]/computation/route.ts` — threads `individualLoanType` through to
  `persistComputation` (finding #11b)

### Tasks
- [x] Added `computeSalaryFirstPaymentDate(releaseDate: Date): Date` — release day ≤ 15 → 15th of same month; else → last day of same month.
- [x] Added `advanceSemiMonthly(anchorDate: string, index: number): string` — phase-based (15th vs. end-of-month), walks `index` steps, advancing the month on each end-of-month → 15th transition.
- [x] `getApplicationForStaff`: added `individual_loan_type` to the explicit column select list.
- [x] `computation/route.ts`: derives `individualLoanType` from `application.individual_loan_type` and passes it into `persistComputation`.
- [x] `PersistComputationInput`: added `individualLoanType?: "mpl" | "salary" | null`.
- [x] `persistComputation`: first-payment-date now branches on `segment === "sme" || individualLoanType === "mpl"` → `computeSmeFirstPaymentDate`; `individualLoanType === "salary"` → `computeSalaryFirstPaymentDate`; else → `computeFirstPaymentDate` unchanged. `payment_frequency` set to `"semi_monthly"` only for Salary.
- [x] `mapComputationRow`: reads `payment_frequency` back as `paymentFrequency`.
- [x] Updated `computeSmeFirstPaymentDate`'s docstring, which was now factually stale (it said "do not use for individual" — MPL, which is `segment=individual`, now uses it deliberately).

### Verification
- [x] `tsc --noEmit` — 13, baseline unchanged.
- [x] `npm run test` — 1355 passed, 0 failures.
- [x] Live test: MPL computation, release Aug 24, 2026 → `firstPaymentDate: '2026-09-24'`, `paymentFrequency: 'monthly'`. Exact match.
- [x] Live test: Salary computation, release Aug 24, 2026 (day 24 > 15) → `firstPaymentDate: '2026-08-31'`, `paymentFrequency: 'semi_monthly'`. Exact match.
- [x] Live test: Salary computation, release Aug 10, 2026 (day 10 ≤ 15) → `firstPaymentDate: '2026-08-15'`. Exact match.
- [x] Live test: `advanceSemiMonthly` from an Aug 31 anchor, indices 0-3 → `['2026-08-31','2026-09-15','2026-09-30','2026-10-15']`. Exact match, confirms the 30-day-month transition works correctly.
- [x] Live test: SME (`2026-09-24`/monthly) and Seafarer (`2026-11-10`/monthly) both produced byte-for-byte identical results to their existing behavior.
- [x] Live test: an `individual` application with `individualLoanType: null` (no sub-type set) → `2026-11-10`/monthly — confirmed it correctly falls back to the old Seafarer-rule behavior, not silently reinterpreted as MPL or Salary.
- [x] All 7 test rows cleaned up, 0 leftover.
- [x] `git diff --stat` — exactly the 4 Allow-listed files touched.

---

## Phase 3: LRA PDC schedule — semi-monthly aware

### Scope
Make the PDC builder and its server-side validation produce `terms * 2` checks on alternating dates at half
amounts for `payment_frequency = 'semi_monthly'` loans, while every monthly-cadence loan keeps working
exactly as it does today.

### Allow List
- `src/app/lra/applications/[id]/page.tsx`
- `src/lib/lra/release-service.ts`
- `src/app/api/lra/applications/[id]/route.ts` — explicit computation whitelist (finding #12)

### Tasks
- [x] `src/app/api/lra/applications/[id]/route.ts`: added `paymentFrequency` (and `totalLoan`, discovered as also needed for rounding-absorption math, not in the original draft) to the explicit `computation` object.
- [x] LRA page's local `computation` type: added `paymentFrequency` and `totalLoan`.
- [x] Added two module-scope helpers, `pdcCheckCount`/`pdcCheckAt`, shared by `buildPdcSchedule` and `submitPdc` — semi-monthly branches to `terms * 2` checks via `advanceSemiMonthly` at half-amortization each (last one absorbing rounding against `totalLoan`); every other cadence unchanged (`addScheduleMonths`, flat `monthlyAmortization`).
- [x] `savePdcChecks`: branched all three validations (count, amount, date) on `computation.paymentFrequency`. **Caught and fixed my own Hard Constraint violation during implementation**: my first pass changed the monthly-path error message wording too ("Check amount must equal ₱X for PDC #N" instead of the original "Check amount must equal the monthly amortization (₱X)") — an existing test caught it immediately. Restored the exact original message/branch for the monthly path; the new wording is now used only for the semi-monthly path.
- [x] Extended the existing mocked-Supabase test harness (`release-service.test.mts`'s `makeSavePdcStub`) with `paymentFrequency`/`totalLoan` options, and added 5 new deterministic unit tests for the semi-monthly path (below-count, exceeds-count, wrong-amount, wrong-date, and a full 12-check success case asserting the exact date sequence and that all amounts sum to `totalLoan`) — without touching any existing test.

### Verification
- [x] `tsc --noEmit` — 13, baseline unchanged.
- [x] `npm run test` — 1360 passed (5 new), 0 failures. All pre-existing `release-service.test.mts` tests pass unmodified, confirming the monthly path is byte-for-byte unchanged (including exact error wording).
- [x] Live test (real DB, not mocked): created a real Salary computation + a real `release_files` row, called the real `savePdcChecks` → **12 real rows inserted into `pdc_checks`**, correct alternating dates (`2026-08-31` through `2027-02-15`), 11 checks at `10664.34`, last at `10664.26` (rounding correctly absorbed), sum exactly equals `totalLoan` (`127972`).
- [x] Live test: a wrong check count (10 instead of 12) → rejected with `"Number of checks must equal twice the loan term (12)"`.
- [x] Live test: a wrong date on check #4 → rejected with `"PDC #4 date must be 2026-10-15 (got 2099-01-01)..."`, naming the exact correct date.
- [x] Test rows cleaned up, 0 leftover.
- [x] `git diff --stat` — exactly the 3 Allow-listed files + the 1 necessary test file.

---

## Phase 4: AR amortization schedule — semi-monthly aware

### Scope
The real collection schedule (`amortization_schedules`) gets the same semi-monthly awareness as the PDC
schedule, building on today's earlier fix (passing `firstPaymentDate` instead of recomputing it).

### Allow List
- `src/lib/ar/schedule.ts`
- `src/lib/ar/masterlist.ts`

### Tasks
- [x] `generateAmortizationSchedule`: added `paymentFrequency?: "monthly" | "semi_monthly"`; semi-monthly branches (before the existing monthly loop, which is completely untouched) to generate `terms * 2` installments via `advanceSemiMonthly` at half-amount each, with the same last-installment rounding-absorption pattern. Documented explicitly in the code that this assumes `firstPaymentDate` is always supplied and already a genuine 15th/end-of-month date for the semi-monthly case (guaranteed by `persistComputation`'s Phase 2 wiring) — the recompute-from-releaseDate fallback is not semi-monthly-aware and isn't meant to feed it.
- [x] `initializeArAccount`: passes `paymentFrequency: computation.paymentFrequency`.
- [x] Added 1 new deterministic unit test to `schedule-f2.test.mts` (12-installment semi-monthly case, exact date sequence + rounding-sums-to-totalLoan) without touching either existing test.

### Verification
- [x] `tsc --noEmit` — 13, baseline unchanged.
- [x] `npm run test` — 1361 passed (1 new), 0 failures. Both pre-existing `schedule-f2.test.mts` tests pass unmodified.
- [x] Live test (real DB, real function — not mocked): built a full realistic fixture (borrower, application, Salary computation, release file) and called the **actual `initializeArAccount`** → a real masterlist row + **12 real `amortization_schedules` rows**.
- [x] **Dates matched Phase 3's live PDC-schedule test exactly**, row for row (`2026-08-31` through `2027-02-15`) — direct proof the two schedules no longer diverge, which is the exact bug class this entire plan exists to close.
- [x] Amounts: 11 rows at `10664.34`, last at `10664.26`, summing exactly to `totalLoan` (`127972`) — identical rounding behavior to the PDC schedule.
- [x] Test data cleaned up, 0 leftover.
- [x] `git diff --stat` — exactly the 2 Allow-listed files + the 1 necessary test file.

---

## Phase 5: Regression sweep

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged across all 4 phases.
- [x] `npm run test` — 1361 passed, 0 failures.
- [x] `git diff --stat` scoped to all 15 files touched across every phase (11 Allow-listed source files + 4 test files added along the way) — nothing outside this set touched anywhere in the plan. Confirmed via 2 new migration files (untracked) plus this list.
- [x] Live, end-to-end regression proof with a real MPL application (a genuinely different product from Salary, sharing SME's date rule): computation → PDC schedule → real AR `amortization_schedules` → **exactly 6 rows each** (not 12), same day-of-month (24th) every month, and the **PDC and AR schedules matched each other exactly**, row for row. Confirms the whole plan correctly discriminates Salary (new, semi-monthly) from everything else (unchanged, monthly) at every layer it touches.

**Post-implementation fix (found via real user testing, not caught during the original audit):** the borrower
portal's own "Apply for another loan" modal (`src/app/borrower/page.tsx`) is a **third** frontend entry point
calling the same `borrower/applications/reloan` endpoint Phase 1 fixed on the backend — but nobody had
updated *this* modal's UI to actually collect `individualLoanType`. The backend correctly started rejecting
individual/no-collateral applications without it, which meant borrowers using this modal got hard-blocked
with a raw API error and no way to proceed. Fixed by adding the same conditional MPL/Salary selector here,
matching the exact pattern already used in `csa/applications/new/page.tsx` (state, reset-on-segment/
collateral-change, required-when-eligible), and — per Locked Decision #8 — resetting to unset on every
reloan rather than inheriting. `tsc`/tests unchanged (13 baseline, 1361 passed) after the fix.

**All 5 phases complete.** MPL and Salary are now real, distinguishable products under `segment = "individual"`, each with the payment-date rule the client actually described — MPL reusing SME's rule verbatim, Salary getting a genuine semi-monthly schedule that reaches the PDC screen, its server-side lock, and the real AR collection schedule consistently. Two real bugs were found and fixed along the way that predate this plan entirely: the AR schedule's blind Seafarer-rule recompute, and three separate instances of an explicit-whitelist pattern silently dropping new computation fields.

---

## Deferred (not in this plan — confirm separately before scoping)

- **Auto/REM's own payment-date rule** — never addressed in either round of questions. They keep the old
  Seafarer-rule fallback. Needs its own confirmation pass, same rigor as MPL/Salary just got, before building
  anything for them.
- **Document/template variants by sub-type** — nothing confirmed requires this; if the client later wants a
  different promissory note or disclosure statement for Salary vs. MPL, that's a separate, unconfirmed ask.
- **Retroactive correction of existing individual applications** — this plan only affects new applications
  going forward (via the new required-at-creation field). Existing `individual`-segment applications have no
  `individual_loan_type` and will keep using the old Seafarer-rule fallback (Locked Decision #6's "legacy
  rows" case) unless someone decides to backfill them — a separate, unconfirmed decision.
