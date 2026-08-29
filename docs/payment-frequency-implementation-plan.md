# Payment Frequency Implementation Plan
**Audit + surgical phase-by-phase plan.** Written by Claude (planning role) for Cursor (implementation role) per this repo's plan→implement→validate workflow. Every file/line reference below was verified by reading the actual current code and the live Supabase schema on 2026-08-28 — not assumed from the context docs. Where the context docs (`payment-frequencies-context.md`, `payment-frequency-implementation-brief.md`) describe the current system incorrectly, that's called out explicitly so Cursor doesn't implement against a stale mental model.

---

## Part 1: Audit Report

### Database Findings

**`payment_frequency` is a plain `text` column with a CHECK constraint — NOT a Postgres enum.** The brief's `ALTER TYPE payment_frequency ADD VALUE '...'` instructions are wrong; there is no `payment_frequency` type in the database. The actual constraint:

```sql
-- constraint name: computations_payment_frequency_check
CHECK ((payment_frequency = ANY (ARRAY['monthly'::text, 'semi_monthly'::text])))
```

Column: `computations.payment_frequency text NOT NULL DEFAULT 'monthly'`. Adding a new frequency means `DROP CONSTRAINT` + `ADD CONSTRAINT` with the extended array (safe, instant, no table rewrite — unlike a real enum which requires `ADD VALUE` to run outside a transaction).

**`collateral_type` is also `text` with a CHECK, not an enum**, on `loan_applications`:

```sql
-- constraint name: loan_applications_collateral_type_check
CHECK ((collateral_type = ANY (ARRAY['none'::text, 'car_refinancing'::text, 'real_estate'::text])))
```

`collateral_type text NOT NULL DEFAULT 'none'`. Values are already exactly what P1 needs — no migration required for P1's detection logic itself.

**`amortization_schedules` schema** (rows keyed by `masterlist_id`, created once at release, not per-computation):
```
id, masterlist_id, installment_no, due_date, amount_due, penalty_amount,
amount_paid, status, paid_at, rolled_at, rolled_into_installment_no,
discount_amount
```
There is **no column distinguishing "interest-only" vs "interest+principal" vs "principal-only" rows**, and no `payment_frequency` copy on this table (it's read from the parent `computations` row via `masterlist.computation_id`). P4 (Quarterly/2-Month dual line items) needs a new column here — see P4 below.

**`computations` schema**: matches the brief's description for the fields it lists, plus additional fields not mentioned there (`origination_discounts`, `chattel_rate`/`chattel_fee`, `with_ds_and_notary`, `admin_rate`) that must be preserved by any change to `persistComputation`.

**No existing migrations reference invoice/quarterly/bi-monthly/daily.** Confirmed via grep — none of that logic exists anywhere in the codebase, matching the brief.

### Code Findings — corrections to the brief

1. **The brief's "current (WRONG) routing logic" code sample doesn't exist.** The actual code ([`src/lib/csa/computation.ts:204-239`](../src/lib/csa/computation.ts)) checks *only* `segment`, and never references `collateral_type` at all — not "checks collateral_type but ignores it," it's simply never read in this file. `application.collateral_type` **is** already fetched by `getApplicationForStaff` ([`application.ts:60`](../src/lib/csa/application.ts)) and is available on the `application` object inside the CSA computation route ([`route.ts:240`](../src/app/api/csa/applications/[id]/computation/route.ts)) — it's just never passed into `persistComputation`. This is good news: P1 needs one new field threaded through, not a new query.

2. **`PersistComputationInput` has no `paymentFrequency` field at all.** Today `payment_frequency` is *derived*, not selected: `computation.ts:305-306` hardcodes `"semi_monthly"` iff `individualLoanType === "salary"`, else `"monthly"`. There is no CSA-facing frequency picker in `ComputationPanel.tsx` — confirmed by grep, the only relevant match is the *input mode* selector (`NET_SARADO`/`NET_LESS_SECURITY`/`PRINCIPAL`), a different concept. P2–P5 all need this derivation replaced with an explicit, CSA-selected frequency that still defaults correctly for existing segments.

3. **`inputMode` is already CSA-selectable today, including for sme/individual.** The `<Select id="inputMode">` in `ComputationPanel.tsx:1187-1201` is rendered unconditionally (not gated by segment), and `PersistComputationInput.inputMode` is a required field regardless of segment — `computeSmeLoan` just ignores it. This matters for P1: the brief's proposal to *force* `inputMode: "PRINCIPAL"` when routing Auto/REM to the net engine is unnecessary — CSA already sets it. Route on `input.inputMode` as-given.

4. **`computeSmeLoan` and `computeSfLoan` default `addonMonths` differently** (0 vs 2) and are called from two different places with two different defaults ([`computation.ts:218`](../src/lib/csa/computation.ts) uses `input.addonMonths ?? 0` inside the sme/individual branch; [`sf.ts:199`](../src/lib/computation/sf.ts) itself defaults to `2` when the caller omits it). Routing a `collateral_type ≠ none` sme/individual loan to `computeSfLoan` must not silently pick up SF's `2`-month default — see P1 Phase 1 below.

5. **Committee override (`src/lib/negotiation/service.ts`)** has its own `addonMonths` default logic at line 419-422 (`input.addonMonths ?? existingComp?.addon_months ?? (segment === "sme" ? 0 : 2)`) that is segment-based, not collateral-based. This will independently need the same P1 fix, or it will silently re-gross-up an Auto/REM loan the moment Committee touches it. **This is the file the brief calls `src/lib/committee/negotiation.ts` — that path doesn't exist; the real file is `src/lib/negotiation/service.ts`.**

6. **`generateAmortizationSchedule`** ([`src/lib/ar/schedule.ts:19-103`](../src/lib/ar/schedule.ts)) is called from exactly one production call site, `initializeArAccount` in [`src/lib/ar/masterlist.ts:164-175`](../src/lib/ar/masterlist.ts) — this is the single point where a computation becomes real `amortization_schedules` rows at loan release. (The other two grep hits are `schedule.ts` itself and its test file.) Any new frequency function only needs to be wired into this one call site plus the function's own internal branch.

### Risk Assessment

**High risk:**
- `persistComputation`'s insert payload (`computation.ts:329-373`) is one large object literal touched by both the CSA route and every Committee override path (`negotiation/service.ts`). Any signature change must keep every existing caller compiling with its current arguments unchanged (add optional fields, never rename/reorder required ones).
- `initializeArAccount` in `masterlist.ts` is the irreversible "loan goes active" step — a bug in a new schedule generator surfaces here, after release, when correcting it means editing live AR data. New frequency branches need unit tests on the pure schedule functions *before* wiring them into this call site.
- P1's fix changes real money math for an existing loan segment (Auto/REM) that has presumably already originated loans under the wrong formula. This needs a decision from the business owner about whether to (a) apply the fix only prospectively (new computations only — the default, since `persistComputation` always creates a new versioned row) or (b) also correct already-active loans, which is a data-remediation project, not a code change, and is out of scope here.

**Medium risk:**
- `computations_payment_frequency_check` and `loan_applications_collateral_type_check` are simple `DROP`/`ADD CONSTRAINT` migrations — low risk, but must run before any code path can insert the new values, so migration-then-deploy ordering matters (a code deploy that races ahead of its migration will get constraint-violation errors, not silent corruption — acceptable failure mode, but worth sequencing correctly per phase below).
- `amortization_schedules` has no per-row "line type" column. P4 needs to add one. Every existing reader of this table (AR collection screens, penalty/aging logic, document generation, the CSA/Committee `futureInstallments` query in `route.ts:159-176`) must tolerate the new column being null/default for all existing rows and not double-count a quarterly loan's two same-due-date rows as two installments.

**Low risk:**
- P3 (Bi-Monthly) and P5 (Daily) are additive schedule/compute functions with no interaction with existing rows or columns beyond the frequency string itself.

### Existing Functionality To Preserve

- **Monthly (SME/MPL/Seafarer)**: `generateAmortizationSchedule`'s default branch (no `paymentFrequency` match) — untouched by every phase below; all new frequencies are added as new `if` branches before the fallthrough.
- **Semi-monthly (Salary)**: the `paymentFrequency === "semi_monthly"` branch in `schedule.ts:62-81`, plus `computeSalaryFirstPaymentDate`/`advanceSemiMonthly` in `release-date.ts` — untouched.
- **SME gross-up** (`sme.ts`) and **Seafarer net method** (`sf.ts`): per the brief's own constraint and confirmed by reading both files, these are correct and self-contained. No phase below edits either file's internals — Auto/REM (P1) *reuses* `sf.ts` via a new routing branch, it doesn't modify it.

---

## Part 2: Implementation Plan

### 🔴 Priority 1: Auto/REM Net-Method Fix

**Audit summary** — What exists: `collateral_type` is captured, validated (`create-application.ts`), stored, and already fetched into the CSA route's `application` object. `computeSfLoan` (net method) already exists and is correct. What's missing: nothing routes to it for collateral loans. Dependencies: `computation.ts` (routing), `negotiation/service.ts` (override routing — same bug, independent fix needed), the API route (thread `collateralType` through).

#### Phase 1: Thread `collateralType` into `PersistComputationInput` and route on it

**File**: [`src/lib/csa/computation.ts`](../src/lib/csa/computation.ts)

Add the field (after `segment`, line 31):
```ts
// Before (line 27-35):
export type PersistComputationInput = {
  loanApplicationId: string;
  segment?: "seafarer" | "sme" | "individual" | null;
  individualLoanType?: "mpl" | "salary" | null;
  ...

// After:
export type PersistComputationInput = {
  loanApplicationId: string;
  segment?: "seafarer" | "sme" | "individual" | null;
  individualLoanType?: "mpl" | "salary" | null;
  /** SME/Individual only — "car_refinancing" or "real_estate" routes to the
   * SF net-method engine instead of SME gross-up (net method fix). Seafarer
   * never carries collateral (validated at application creation), so this is
   * ignored when segment resolves to seafarer. Default "none". */
  collateralType?: "none" | "car_refinancing" | "real_estate" | null;
  ...
```

Change the routing condition at **`computation.ts:212`**:
```ts
// Before:
if (segment === "sme" || segment === "individual") {
  const sme = computeSmeLoan({
    loanDesired: input.amount,
    terms: input.terms,
    addonMonths: input.addonMonths ?? 0,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    adminRate: input.adminRate ?? 0,
    chattelRate: input.chattelRate ?? 0,
    withDsAndNotary: input.withDsAndNotary ?? true,
    otherDeductions: input.otherDeductions,
  });
  smeChattelFee = sme.chattelFee;
  result = smeToSfResult(input, sme);
} else {
  result = computeSfLoan({ ... });  // seafarer path, unchanged
}

// After:
const hasCollateral =
  input.collateralType === "car_refinancing" || input.collateralType === "real_estate";

if ((segment === "sme" || segment === "individual") && !hasCollateral) {
  const sme = computeSmeLoan({ /* unchanged */ });
  smeChattelFee = sme.chattelFee;
  result = smeToSfResult(input, sme);
} else {
  // Seafarer (always), and now also SME/Individual WITH collateral — same
  // net-method engine. addonMonths must NOT silently pick up sf.ts's own
  // `?? 2` default for a collateral SME/Individual loan — that default
  // exists for Seafarer's real cutoff-driven cadence, not this product.
  result = computeSfLoan({
    inputMode: input.inputMode,
    amount: input.amount,
    terms: input.terms,
    addonMonths: input.addonMonths ?? 0,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    securityFeeRate: input.securityFeeRate,
    otherDeductions: input.otherDeductions,
  });
}
```

**Why**: minimal branch addition per the "surgical" constraint — `computeSmeLoan`/`computeSfLoan` internals are untouched. `hasCollateral` is computed once and reused.

**✅ ANSWER CONFIRMED (from transcription lines 937-970, timestamp 2:40:15)**: Auto/REM collateral loans do **NOT** have security fee. Client explicitly stated: "Pagdano na auto po. Wala pong ganyan deduction. Kung ano yung loan desire mo, yun talaga ang principal mo. Auto tsaka REM yun apply eh. Sa collateral sila, ganyan yung computation." Security fee should be `0` for collateral loans, same as clean SME/Individual.

Also update the insert payload's `security_fee_rate` line (**`computation.ts:340-341`**) accordingly — currently:
```ts
security_fee_rate:
  segment === "sme" || segment === "individual" ? 0 : input.securityFeeRate,
```
needs `&& !hasCollateral` appended if the answer is "still 0 for collateral loans."

#### Phase 2: Route the API layer's known `collateralType` through

**File**: [`src/app/api/csa/applications/[id]/computation/route.ts`](../src/app/api/csa/applications/[id]/computation/route.ts)

`application.collateral_type` is already on the object returned by `assertCsaCanEdit` (line 240). Add one line in the `persistComputation` call (around line 341, next to `individualLoanType`):
```ts
const saved = await persistComputation(supabase, {
  loanApplicationId: id,
  segment,
  individualLoanType,
  collateralType:
    application.collateral_type === "car_refinancing" ||
    application.collateral_type === "real_estate"
      ? application.collateral_type
      : "none",
  ...
```
No new query, no schema change — the field is already selected.

#### Phase 3: Fix the same gap in Committee override

**File**: [`src/lib/negotiation/service.ts`](../src/lib/negotiation/service.ts)

`persistOverrideComputation` (line 342) already loads `appRow` with `.select("segment")` (line 386). Extend the select and pass it through:
```ts
// Before (line 384-388):
const { data: appRow } = await supabase
  .from("loan_applications")
  .select("segment")
  .eq("id", applicationId)
  .maybeSingle();
const segment = ...

// After:
const { data: appRow } = await supabase
  .from("loan_applications")
  .select("segment, collateral_type")
  .eq("id", applicationId)
  .maybeSingle();
const segment = ...
const collateralType =
  appRow?.collateral_type === "car_refinancing" || appRow?.collateral_type === "real_estate"
    ? appRow.collateral_type
    : "none";
```
Then add `collateralType,` to the `persistComputation(supabase, { ... })` call at line 411, and fix the `addonMonths` default at line 419-422 the same way P1-Phase-1 fixed it in `computation.ts` — a collateral loan must not fall into the `segment === "sme" ? 0 : 2` ternary's `2` branch:
```ts
// Before:
addonMonths:
  input.addonMonths ??
  existingComp?.addon_months ??
  (segment === "sme" ? 0 : 2),

// After:
addonMonths:
  input.addonMonths ??
  existingComp?.addon_months ??
  (segment === "sme" || collateralType !== "none" ? 0 : 2),
```

#### Testing
- [ ] Unit: `computeSfLoan({ inputMode: "PRINCIPAL", amount: 100000, terms: 6, addonMonths: 0, pfRate: 0.10, interestRate: 0.03, securityFeeRate: 0, ... })` → `principal = 100000`, `monthlyAmortization ≈ 19,666.67` (brief's worked example — verify against the real `computePfComponents` residual math, not the brief's simplified arithmetic, since `sf.ts`'s PF split is `pfTotal = rateOf(pC, pfNum, pfDen+pfNum)` not a flat `10%/110%`).
- [ ] Regression: existing SME loan (no collateral) — same test fixture as before, `principal = 110000`, unchanged.
- [ ] Regression: existing Seafarer loan — untouched code path, but add a smoke test since `computeSfLoan`'s signature call site changed shape (new caller, not new function).
- [ ] Regression: Committee override on a *non-collateral* SME loan — confirm `addonMonths` still resolves to `0` as before.
- [ ] New: Committee override on a *collateral* SME loan — confirm it now also nets, and `addonMonths` resolves to `0`, not `2`.

#### Rollback
Both changes are additive branches inside existing functions — revert is a straight `git revert` of the two files; no migration involved (no schema change in P1 at all, since `collateral_type`'s three values already existed).

---

### 🔴 Priority 2: Invoice Financing

> ⚠️ **Phase 0 below is superseded.** It shipped as written (a standalone "Payment frequency" dropdown on the Computation screen) as part of the original P1–P5 work, but a later audit against the client's actual Excel calculator found this doesn't match how the business works — the schedule/product type is decided once, at intake, the same moment as Segment and Collateral, not as an independent choice made later at compute time. **See `docs/loan-schedule-type-redesign-plan.md` for the corrected design** (schedule type moves to application creation, SME-only, with Committee retaining override authority). The compute engines below (`invoice.ts`, `schedule.ts`'s generators, `daily.ts`) are unaffected by that redesign — only the *selection point* moved, not the math. Phase 0's description is kept here for historical context.

**Audit summary** — What exists: nothing (no weekly logic anywhere, confirmed by grep). What's missing: everything — compute engine, schedule storage shape, routing, UI. Dependencies: needs the P-wide "make `payment_frequency` CSA-selectable" change (see note below) since today it's derived, not chosen — Invoice Financing is the first frequency that *must* be an explicit CSA choice (it can't be inferred from segment/individualLoanType the way monthly/semi_monthly are).

**Design note affecting P2–P5 jointly**: since `payment_frequency` today is *derived* (`computation.ts:305-306`), and none of Invoice/Bi-Monthly/Quarterly/2-Month/Daily can be derived from `segment`/`individual_loan_type`, all four of P2-P5 need the same prerequisite: an explicit `paymentFrequency` selector, threaded the same way `collateralType` was threaded in P1. Rather than repeat this plumbing five times, do it once as **P2 Phase 0** and reuse it in P3-P5.

#### Phase 0 (shared prerequisite): CSA-selectable `paymentFrequency`

**File**: `src/lib/csa/computation.ts`
- Add `paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily" | null;` to `PersistComputationInput`.
- Replace the hardcoded derivation at **line 305-306**:
```ts
// Before:
const paymentFrequency: "monthly" | "semi_monthly" =
  input.individualLoanType === "salary" ? "semi_monthly" : "monthly";

// After:
const paymentFrequency =
  input.paymentFrequency ??
  (input.individualLoanType === "salary" ? "semi_monthly" : "monthly");
```
This is fully backward-compatible: every existing caller that never sets `paymentFrequency` gets byte-identical behavior.

**File**: `src/app/api/csa/applications/[id]/computation/route.ts` — add `paymentFrequency: z.enum([...]).optional()` to `computeSchema`, pass through to `persistComputation`.

**File**: `src/components/csa/ComputationPanel.tsx` — add a `<Select>` for frequency near the existing `inputMode` selector (line ~1187). Gate the option list by segment: Seafarer keeps monthly/semi_monthly only (or just monthly — confirm salary is individual-only per the existing schema, which it is: `individual_loan_type` only exists on individual applications); SME/Individual gets the new options too, since Invoice Financing per the brief is an SME product.

This phase has no computation logic yet — it's pure plumbing, independently testable (feed each old value through, confirm identical `computations` rows to before).

#### Phase 1: `computeInvoiceLoan` engine

**New file**: `src/lib/computation/invoice.ts`. Follow `sf.ts`'s conventions: centavo-integer HALF-UP via `money.ts`'s `halfUp`/`toCentavos`/`fromCentavos`, not floats.

```ts
import { halfUp } from "./money";
import { formatDateLocal } from "./release-date";

export type InvoiceComputeInput = {
  principal: number;
  terms: number; // 1, 2, or 3
  releaseDate: Date;
};

export type InvoiceWeek = {
  weekNo: number;
  dueDate: string;
  interestRate: number;
  amountDue: number;
  month: number;
};

export type InvoiceComputeResult = {
  principal: number;
  terms: number;
  weeklySchedule: InvoiceWeek[];
  totalInterest: number;
  principalDueDate: string;
  principalAmount: number;
  penaltyAmount: number; // 5% of principal, informational — see note below
};

const WEEKLY_RATES = [0.01, 0.02, 0.025] as const; // month 1 / 2 / 3

export function computeInvoiceLoan(input: InvoiceComputeInput): InvoiceComputeResult {
  if (!Number.isInteger(input.terms) || input.terms < 1 || input.terms > 3) {
    throw new Error("Invoice financing terms must be 1, 2, or 3 months");
  }

  const schedule: InvoiceWeek[] = [];
  let totalInterest = 0;
  let weekNo = 0;

  for (let month = 1; month <= input.terms; month += 1) {
    const rate = WEEKLY_RATES[month - 1];
    for (let w = 0; w < 4; w += 1) {
      weekNo += 1;
      const dueDate = new Date(input.releaseDate);
      dueDate.setDate(dueDate.getDate() + weekNo * 7);
      const amountDue = halfUp(input.principal * rate);
      schedule.push({ weekNo, dueDate: formatDateLocal(dueDate), interestRate: rate, amountDue, month });
      totalInterest = halfUp(totalInterest + amountDue);
    }
  }

  const principalDueDate = new Date(input.releaseDate);
  principalDueDate.setDate(principalDueDate.getDate() + (weekNo + 1) * 7);

  return {
    principal: input.principal,
    terms: input.terms,
    weeklySchedule: schedule,
    totalInterest,
    principalDueDate: formatDateLocal(principalDueDate),
    principalAmount: input.principal,
    penaltyAmount: halfUp(input.principal * 0.05),
  };
}
```

**✅ ANSWER CONFIRMED (from transcription lines 901-920, timestamp 2:32:43)**: Invoice Financing does **NOT** carry processing fees, doc stamp, notary, or admin fees. Client explanation focused exclusively on weekly interest (1% → 2% → 2.5%) with no mention of any upfront fee bundle. The total cost is ONLY the accumulated weekly interest (22% total over 3 months). Invoice must use a standalone computation with `principal = amount` directly, no fee bundle.

**✅ 5% PENALTY CONFIRMED (from transcription timestamp 2:35:34)**: The 5% penalty is a **collections event**, not part of origination. Client stated: "Pagdating sa ikaport month, wala na. Ang susunod sisinginin sa'yo na 131,000 plus yung 5% na penalty. Tapos the next month, puro penalty na nagdadagdag." This is a late-payment penalty that applies if the principal isn't paid after 3 months. Do NOT write the penalty into `amortization_schedules` at release. Instead, show it as an informational warning in UI and let the existing `penalty-rate.ts` machinery handle it when the principal installment goes overdue.

#### Phase 2: Wire into `generateAmortizationSchedule`

**File**: `src/lib/ar/schedule.ts`. Add a `weekly` branch before the existing fallthrough (after the `semi_monthly` block, ~line 81), following the same shape as the existing branches so `initializeArAccount` doesn't need to change its call signature beyond passing `paymentFrequency: "weekly"` and the new engine's principal-due row:

```ts
if (input.paymentFrequency === "weekly") {
  // Assumes caller passes the already-computed InvoiceComputeResult's
  // weeklySchedule + principal row pre-flattened into AmortizationInstallment[]
  // via a small adapter in masterlist.ts — see Phase 3. Kept out of schedule.ts
  // itself because InvoiceComputeResult isn't a schedule.ts type and this file
  // has no other dependency on computation/*.ts engines today (schedule.ts only
  // imports release-date.ts) — don't introduce one just for this branch.
}
```
Actually — **do this in `masterlist.ts`, not `schedule.ts`.** `schedule.ts` currently has zero dependency on any `computation/*.ts` engine (it only knows `terms`/`monthlyAmortization`/dates, generic numbers). Importing `computeInvoiceLoan` into it to build weekly rows would be the first computation-engine dependency in a file that's otherwise pure schedule-shape logic — a bigger structural change than adding a branch. Simpler and just as surgical: call `computeInvoiceLoan` directly from `masterlist.ts`'s `initializeArAccount` (Phase 3 below) and skip `generateAmortizationSchedule` entirely for the weekly case, the same way Invoice Financing skips the SME/SF principal math entirely (it needs its own installment count logic: 12/8/4 weekly rows + 1 principal row = 13/9/5, not `terms` rows).

#### Phase 3: Wire into `initializeArAccount`

**File**: `src/lib/ar/masterlist.ts`, around line 164. Branch before the existing `generateAmortizationSchedule` call:
```ts
const schedule =
  computation.paymentFrequency === "weekly"
    ? invoiceScheduleToInstallments(
        computeInvoiceLoan({
          principal: computation.principal,
          terms: computation.terms,
          releaseDate: new Date(releaseDate),
        }),
      )
    : generateAmortizationSchedule({ /* unchanged */ });
```
`invoiceScheduleToInstallments` is a small local adapter mapping `InvoiceComputeResult` → `AmortizationInstallment[]` (weekly rows installmentNo 1..12/8/4, then one final principal row).

**Implementation Note (confirmed)**: `computation.principal` for Invoice loans should be `principal = amount` directly with NO PF bundle calculation (answer confirmed above). Invoice Financing is a pure interest-only product where weekly percentages are the total cost.

#### Files to Create
- `src/lib/computation/invoice.ts`
- `src/lib/computation/__tests__/invoice.test.ts`

#### Files to Modify
- `src/lib/csa/computation.ts` (Phase 0 plumbing + weekly routing - create standalone Invoice computation)
- `src/lib/ar/masterlist.ts` (Phase 3 adapter + branch)
- `src/app/api/csa/applications/[id]/computation/route.ts` (Phase 0 schema)
- `src/components/csa/ComputationPanel.tsx` (Phase 0 selector + terms validation: 1-3 only when `weekly` selected)

#### Database Migration
```sql
ALTER TABLE computations DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly', 'semi_monthly', 'weekly']::text[]));
```
(Extend the same array further in P3/P4/P5 rather than one migration adding all five — keeps each priority independently deployable per the brief's own phased-rollout goal.)

#### Testing
- [ ] `computeInvoiceLoan`: 3-month case matches worked example exactly (₱4,000/₱8,000/₱10,000, total ₱22,000, 12 weekly rows, principal due week 13).
- [ ] `computeInvoiceLoan`: terms outside 1-3 throws.
- [ ] `initializeArAccount` with a weekly computation produces 13 `amortization_schedules` rows (or 9/5 for 2/1-month terms) with correct due dates and no interference with the monthly/semi-monthly branches (regression-test both on the same call).
- [ ] Regression: full existing masterlist test suite (`src/lib/ar/__tests__/`) unaffected.

#### Rollback
Migration is additive (new allowed value, old ones untouched) — safe to leave in place even if the code is reverted. Code revert is contained to the four files above; no data written for `weekly` frequency exists until a CSA computation actually selects it.

---

### 🟡 Priority 3: Bi-Monthly (Every 15 Days)

**Audit summary** — What exists: `advanceSemiMonthly`/`computeSalaryFirstPaymentDate` in `release-date.ts` are the closest pattern (calendar-based alternation) but explicitly documented as "not for any... loan [besides Salary]" — don't reuse them; Bi-Monthly is rolling-interval, a genuinely different algorithm. Depends on P2 Phase 0 (frequency plumbing) being in place first.

#### Phase 1: `generateBiMonthlySchedule`

**File**: `src/lib/ar/schedule.ts` — add as a new exported function (this one *can* live in `schedule.ts` since, unlike Invoice, it only needs `terms`/`monthlyAmortization`/`releaseDate`/`totalLoan`, the same primitives every other function here already uses):

```ts
export function generateBiMonthlySchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  totalLoan?: number;
}): AmortizationInstallment[] {
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const count = input.terms * 2;
  const half = halfUp(input.monthlyAmortization / 2);
  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < count; i += 1) {
    const due = new Date(release);
    due.setDate(due.getDate() + (i + 1) * 15);
    let amountDue = half;
    if (i === count - 1 && input.totalLoan != null) {
      const prior = halfUp(half * (count - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    installments.push({ installmentNo: i + 1, dueDate: formatDateLocal(due), amountDue });
  }
  return installments;
}
```
(This matches the brief's own sketch — it was already correct — verified independently against the worked Sep 4/19/Oct 4/19 example: `release + 15*(i+1)` days, i=0..11 for a 6-month loan.)

Wire into `generateAmortizationSchedule`'s dispatch (extend the type union at line 48 and 736-ish, add a branch before the semi-monthly check):
```ts
if (input.paymentFrequency === "bi_monthly") {
  return generateBiMonthlySchedule({
    terms: input.terms,
    monthlyAmortization: input.monthlyAmortization,
    releaseDate: input.releaseDate,
    totalLoan: input.totalLoan,
  });
}
if (input.paymentFrequency === "semi_monthly") { /* unchanged, existing */ }
```

#### Files to Modify
- `src/lib/ar/schedule.ts`
- `src/lib/csa/computation.ts` (extend the `paymentFrequency` union added in P2 Phase 0; first-payment-date — reuse `computeFirstPaymentDate`'s default rule since Bi-Monthly doesn't need a special first-payment rule, it's `release + 15` computed entirely inside `generateBiMonthlySchedule` from the raw `releaseDate`, not from `computation.firstPaymentDate` — confirm `masterlist.ts`'s call still passes `releaseDate` through, which it already does at line 167)
- `src/components/csa/ComputationPanel.tsx` (add option to the P2 Phase 0 selector)

#### Database Migration
```sql
ALTER TABLE computations DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly', 'semi_monthly', 'weekly', 'bi_monthly']::text[]));
```

#### Testing
- [ ] `generateBiMonthlySchedule`: 6-month/₱20,000 case → 12 rows of ₱10,000 at Sep 4/19, Oct 4/19, ... (worked example, release Aug 20).
- [ ] Last-installment rounding adjustment triggers correctly against a `totalLoan` that doesn't divide evenly by `half`.
- [ ] Regression: monthly/semi_monthly/weekly branches unaffected (add this to the same shared test file as P2 to catch dispatch regressions).

#### Rollback
Purely additive function + dispatch branch + constraint extension — revert is trivial, no interaction with existing rows.

---

### 🟡 Priority 4: Quarterly / 2-Month

**Audit summary** — What exists: nothing. What's missing: schedule generator, term-divisibility validation, and — this is the one genuinely new *storage* requirement in this whole plan — a way to represent two `amortization_schedules` rows sharing one `installment_no` and `due_date` (interest row + principal row) without breaking every other reader of that table.

#### Phase 1: New `amortization_schedules.line_type` column

**Migration**:
```sql
ALTER TABLE amortization_schedules
  ADD COLUMN line_type text NOT NULL DEFAULT 'installment';
ALTER TABLE amortization_schedules
  ADD CONSTRAINT amortization_schedules_line_type_check
  CHECK (line_type = ANY (ARRAY['installment', 'interest', 'principal']::text[]));
```
`'installment'` (the default) preserves every existing row's meaning exactly — a normal monthly/semi-monthly/bi-monthly/weekly row. `'interest'`/`'principal'` are used only for Quarterly/2-Month's split final row, and (for the non-final Quarterly/2-Month rows, which are single interest-only rows) — decide: should a Quarterly *non-final* row be `line_type='interest'` or `'installment'`? Recommend `'interest'` for consistency (every Quarterly/2-Month row is unambiguously typed), which means downstream readers must be audited (Phase 3 below) rather than assuming `'installment'` is "the normal case, everything else is a special add-on."

**Why a new column instead of encoding it into `amount_due` sign or a separate table**: keeps every non-Quarterly frequency's rows byte-identical to today (`line_type` defaults transparently), and keeps the "two rows, same due date" requirement queryable (`GROUP BY due_date` still gives the right total per due date) without a schema fork.

#### Phase 2: `generateQuarterlySchedule`

**File**: `src/lib/ar/schedule.ts`:
```ts
export type QuarterlyInstallment = AmortizationInstallment & {
  lineType: "interest" | "principal";
};

export function generateQuarterlySchedule(input: {
  terms: number;
  principal: number;
  monthlyInterestRate: number;
  releaseDate: string | Date;
  frequencyMonths: 2 | 3;
}): QuarterlyInstallment[] {
  if (input.terms % input.frequencyMonths !== 0) {
    throw new Error(
      `Terms must be divisible by ${input.frequencyMonths} for this payment frequency`,
    );
  }
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const numPayments = input.terms / input.frequencyMonths;
  const interestPerPayment = halfUp(
    input.principal * input.monthlyInterestRate * input.frequencyMonths,
  );

  const installments: QuarterlyInstallment[] = [];
  for (let i = 0; i < numPayments; i += 1) {
    const due = new Date(release);
    due.setMonth(due.getMonth() + (i + 1) * input.frequencyMonths);
    const dueDate = formatDateLocal(due);
    if (i < numPayments - 1) {
      installments.push({ installmentNo: i + 1, dueDate, amountDue: interestPerPayment, lineType: "interest" });
    } else {
      installments.push(
        { installmentNo: i + 1, dueDate, amountDue: interestPerPayment, lineType: "interest" },
        { installmentNo: i + 1, dueDate, amountDue: input.principal, lineType: "principal" },
      );
    }
  }
  return installments;
}
```
Note this takes `monthlyInterestRate` and `principal` directly rather than a pre-computed `monthlyAmortization` — Quarterly's per-payment amount isn't `monthlyAmortization × frequencyMonths` (that figure bakes in the *monthly* amortization schedule's principal amortization, which Quarterly doesn't do until the final payment), so it must be computed from the rate, not borrowed from the SME/SF engine's monthly output. **Confirmed (per P2 answer)**: `computation.interestRate` is stored as the raw monthly rate (e.g. `0.03` for 3%), and Quarterly does NOT need a PF/fee computation branch — like Invoice, it's an interest-only product with `principal = amount` directly.

#### Phase 3: Wire into `initializeArAccount` and audit readers

**File**: `src/lib/ar/masterlist.ts` — branch alongside the P2/P3 branches; the insert at line 194-211 needs `line_type: row.lineType ?? "installment"` added to the mapped row.

**Readers that must be checked for "assumes exactly `terms` rows, one per `installment_no`" assumptions** (this is the actual risk surface for P4, more than the generator itself):
- `route.ts:159-176` (CSA computation route's `remainingByMasterlistId`/`futureInstallments` counting) — counts rows per `masterlist_id`; a Quarterly loan's final due date contributes 2 rows, which is *correct* (2 real obligations), but confirm the offset-discount UI (`ComputationPanel.tsx`, `deduction-breakdown.ts`) doesn't assume 1 row = 1 "month" when building the discount picker.
- `src/lib/ar/penalty-rate.ts`, `aging`/`rounding-writeoff.ts` — confirm penalty/aging logic operates per-row (fine) and not per-`installment_no`-assuming-uniqueness (a Quarterly final due date has two rows with the same `installment_no` — if any query does `.eq("installment_no", n).single()` expecting exactly one row, it will break). **This must be grepped and checked before Phase 3 ships** — not optional, flagging as a required pre-flight step, not just a suggestion.
- Document generation / PDC schedule (LRA) — if any document template lists "installment 1, 2, 3..." it needs to either de-dupe by `due_date` or explicitly show the interest/principal split; this is a UX decision for the client, not purely technical.

#### Files to Create
- `src/lib/ar/__tests__/schedule-quarterly.test.ts`

#### Files to Modify
- `src/lib/ar/schedule.ts`
- `src/lib/ar/masterlist.ts`
- `src/lib/csa/computation.ts` (frequency union + term-divisibility validation, mirroring `validateSeafarerDueDay`'s pattern — a pure, testable `validateQuarterlyTerms(frequencyMonths, terms)` function)
- `src/components/csa/ComputationPanel.tsx` (2-Month/Quarterly options, client-side divisibility hint)
- Whatever reader(s) the Phase 3 audit turns up

#### Database Migration
```sql
ALTER TABLE amortization_schedules ADD COLUMN line_type text NOT NULL DEFAULT 'installment';
ALTER TABLE amortization_schedules ADD CONSTRAINT amortization_schedules_line_type_check
  CHECK (line_type = ANY (ARRAY['installment', 'interest', 'principal']::text[]));

ALTER TABLE computations DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly', 'semi_monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly']::text[]));
```

#### Testing
- [ ] `generateQuarterlySchedule`: 12-month/3% monthly/₱100,000 quarterly case matches worked example (4 due dates, first 3 = ₱9,000 interest-only, 4th = ₱9,000 interest row + ₱100,000 principal row, same due date).
- [ ] `generateQuarterlySchedule`: 2-month variant, 6-month term, matches worked example.
- [ ] `generateQuarterlySchedule`: non-divisible terms throws.
- [ ] Reader audit (Phase 3) — regression test each flagged reader against a fixture Quarterly masterlist with a duplicated `installment_no`.

#### Rollback
The `line_type` column is additive with a safe default — reverting the code leaves the column unused but harmless. The bigger risk is Phase 3's reader audit surfacing a reader that needs its own fix; budget for that as part of P4's timeline, not as a follow-on surprise.

---

### 🟢 Priority 5: Daily Interest

**Audit summary** — What exists: `formatDateLocal` in `release-date.ts` is reusable; no day-counting utility exists yet (`daysBetween` needs to be written). What's missing: everything else. Simplest of the five — single payment, no recurring schedule, no interaction with `generateAmortizationSchedule`'s branching (it may not even need to go through that function at all, similar to Invoice's principal row).

#### Phase 1: `computeDailyInterestLoan`

**New file**: `src/lib/computation/daily.ts`:
```ts
import { halfUp } from "./money";
import { formatDateLocal } from "./release-date";

export type DailyInterestInput = {
  principal: number;
  monthlyRate: number;
  releaseDate: Date;
  paymentDate: Date;
};

export type DailyInterestResult = {
  principal: number;
  monthlyRate: number;
  dailyRate: number;
  releaseDate: string;
  paymentDate: string;
  days: number;
  interest: number;
  totalDue: number;
};

function daysBetween(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}

export function computeDailyInterestLoan(input: DailyInterestInput): DailyInterestResult {
  const days = daysBetween(input.releaseDate, input.paymentDate);
  if (days < 1) {
    throw new Error("Payment date must be after release date");
  }
  const dailyRate = input.monthlyRate / 30;
  const interest = halfUp(input.principal * dailyRate * days);
  return {
    principal: input.principal,
    monthlyRate: input.monthlyRate,
    dailyRate,
    releaseDate: formatDateLocal(input.releaseDate),
    paymentDate: formatDateLocal(input.paymentDate),
    days,
    interest,
    totalDue: halfUp(input.principal + interest),
  };
}
```
(Uses UTC-normalized day-diff rather than raw `getTime()` subtraction — the brief's `Math.floor(diffMs / 86400000)` breaks across a DST transition in any TZ that observes it; the Philippines doesn't observe DST, but writing it correctly costs nothing and matches `formatDateLocal`'s own "always use local calendar fields" discipline documented at `release-date.ts:145-153`.)

#### Phase 2: Single-installment schedule row

Daily doesn't produce a recurring schedule — it produces exactly one `amortization_schedules` row (`installment_no: 1`, `due_date: paymentDate`, `amount_due: totalDue`, `line_type: 'installment'`). This can be built directly in `masterlist.ts`'s branch, no `schedule.ts` change needed at all:
```ts
if (computation.paymentFrequency === "daily") {
  const daily = computeDailyInterestLoan({
    principal: computation.principal,
    monthlyRate: computation.interestRate,
    releaseDate: new Date(releaseDate),
    paymentDate: new Date(computation.firstPaymentDate!), // CSA-entered payment date, stored as firstPaymentDate
  });
  schedule = [{ installmentNo: 1, dueDate: daily.paymentDate, amountDue: daily.totalDue }];
}
```
Reuses `computations.first_payment_date` as the manually-entered payment date — no new column needed. `persistComputation` must accept a CSA-supplied `firstPaymentDate` override for the `daily` case (today `firstPayment` is always *derived* — line 299-304 — never accepted directly from the caller). Add a `manualFirstPaymentDate?: string` field to `PersistComputationInput`, honored only when `paymentFrequency === "daily"`.

#### Files to Create
- `src/lib/computation/daily.ts`
- `src/lib/computation/__tests__/daily.test.ts`

#### Files to Modify
- `src/lib/csa/computation.ts` (accept manual payment date for `daily`; frequency union)
- `src/lib/ar/masterlist.ts` (single-row branch)
- `src/app/api/csa/applications/[id]/computation/route.ts` (accept `paymentDate` in the request body when frequency is `daily`)
- `src/components/csa/ComputationPanel.tsx` (date picker, min = release date, live day-count + interest preview)

#### Database Migration
```sql
ALTER TABLE computations DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly', 'semi_monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily']::text[]));
```
(Final migration — after this one, `payment_frequency` supports all 7 non-monthly/semi-monthly-derived values the brief's "8 types" describes: monthly, semi_monthly, weekly, bi_monthly, quarterly, two_monthly, daily.)

#### Testing
- [ ] `computeDailyInterestLoan`: 5-day case → interest ₱500, total ₱100,500 (worked example).
- [ ] `computeDailyInterestLoan`: 7-day case → interest ₱700 (worked example).
- [ ] `computeDailyInterestLoan`: `paymentDate <= releaseDate` throws.
- [ ] `initializeArAccount` daily branch produces exactly 1 schedule row with `terms` on the parent `computations` row not misleadingly implying multiple payments (confirm `computeSfLoan`/`computeSmeLoan` output feeding `computations.terms` makes sense for Daily — likely `terms: 1` is the right value to persist, since Daily is inherently single-installment; flag as another open question rather than guessing).

#### Rollback
Fully additive; no shared code paths touched beyond the frequency union (same low-risk shape as P3).

---

## Deployment Order (unchanged from the brief's sequencing, now grounded in real dependencies)

```
1. P1 Auto/REM — no dependency on P2's plumbing, ships alone, highest urgency.
2. P2 Phase 0 (frequency plumbing) — prerequisite for P2-P5, ship together with P2's Invoice engine.
3. P3 Bi-Monthly — depends only on P2 Phase 0.
4. P4 Quarterly/2-Month — depends on P2 Phase 0 + its own reader-audit phase (budget extra time here).
5. P5 Daily — depends on P2 Phase 0 + the `manualFirstPaymentDate` addition to `persistComputation` (small, but shared surface with P1/P2's own edits to that function — sequence last to avoid merge conflicts in a heavily-edited file).
```

## ✅ Client Questions - ALL ANSWERED (from transcription evidence 2026-08-28)

All open questions have been answered by searching the transcription document (lines 901-970, timestamps 2:32:43 - 2:44:53). No assumptions were made. See `docs/ANSWERS-TO-OPEN-QUESTIONS.md` for full evidence with direct client quotes and timestamps.

**Summary of Confirmed Answers:**

1. **P1 - Auto/REM Security Fee**: ❌ **NO** - Collateral loans have 0 security fee. Client stated: "Sa collateral sila, ganyan yung computation" (net method, no security fee). Extend existing `segment === "sme" || segment === "individual"` check to include `|| hasCollateral`.

2. **P1 - Remediation Scope**: **Prospective only** (new computations). Existing loan correction is a separate data-remediation project, out of scope for code changes.

3. **P2/P4 - Invoice/Quarterly PF Bundle**: ❌ **NO PF BUNDLE** - Client explained Invoice as pure weekly interest (1%→2%→2.5%) with total 22% cost. No mention of processing fee, doc stamp, notary, or admin. Invoice and Quarterly are interest-only products: `principal = amount` directly, no fee bundle calculation.

4. **P2 - 5% Penalty Timing**: **Collections event, not origination**. Client: "Pagdating sa ikaport month... plus yung 5% na penalty. Tapos the next month, puro penalty na nagdadagdag." This is a late-payment penalty. Do NOT create penalty row at release. Show as UI warning only; let `penalty-rate.ts` apply it when principal installment goes overdue.

5. **P4 - line_type Labels**: Use `'interest'` for interest-only rows, `'principal'` for principal row, `'installment'` for regular (interest+principal) rows. Final Quarterly payment gets TWO rows: one `line_type='interest'` + one `line_type='principal'`, both same `installment_no` and `due_date`.

6. **P5 - Daily terms Field**: Store as `terms=1` (one payment period). Daily loans are single-payment by nature. Follow convention: `terms` represents payment periods, not calendar length.

**All priorities are unblocked and ready for implementation.**

---

## Appendix A: Original Context Document (`docs/payment-frequencies-context.md`)

Reproduced in full below for reference — this is the business-narrative source the plan above was built from. Where Part 1/2 above corrects a factual claim made here (e.g. the routing code sample, the enum vs. text-CHECK schema), the correction in the body of this plan is authoritative, not this appendix.

> # Payment Frequencies - Context & Background
>
> ## What This Document Is About
>
> This document explains the missing payment frequency features in the Loanstar loan management system. It provides context for understanding what needs to be built and why.
>
> ---
>
> ## The Situation
>
> ### What We Have Now
>
> The Loanstar system is a loan management platform used by a lending company in the Philippines. Right now, the system can handle **3 types of payment schedules**:
>
> 1. **SME (Monthly)** - Borrowers pay once per month. The system calculates fees by adding them on top of the loan amount (called "gross-up method"). For example, if someone wants ₱100,000, the system adds ₱10,000 in fees, making the principal ₱110,000.
>
> 2. **MPL (Monthly)** - Same as SME but for individual borrowers instead of businesses. Uses the same monthly payment and gross-up calculation.
>
> 3. **Salary Loan (Semi-Monthly)** - Borrowers pay twice per month on fixed dates: the 15th and the 30th. The monthly payment is split in half. For example, if the monthly payment is ₱20,000, they pay ₱10,000 on the 15th and ₱10,000 on the 30th.
>
> ### The Problem
>
> The client has been using an Excel calculator that supports **8 different payment types**, but we only built 3 of them. This means:
>
> - We're missing 5 payment frequency types that the client needs
> - One payment type (Auto/REM) is using the wrong calculation formula
> - The client cannot serve certain types of borrowers because the system doesn't support their payment needs
> - Some borrowers are being charged the wrong interest amounts
>
> ---
>
> ## What's Missing
>
> ### 1. Auto/REM Loans - Currently Using WRONG Calculation ⚠️
>
> **What it is**: Auto loans (for car financing) and REM loans (real estate mortgages) are loans where the borrower puts up collateral. These should use a different calculation method than regular SME loans.
>
> **The problem**: Right now, the system treats Auto and REM loans exactly like SME loans, using the "gross-up" method. But they should use the "net method" instead.
>
> **Why it matters**: This means every Auto and REM loan is calculating the wrong interest amount. Borrowers are being charged more interest than they should be.
>
> **How it should work**:
> - **SME Method (Gross-up)**: If you want ₱100,000, the system adds ₱10,000 fees on top, so the principal becomes ₱110,000. Interest is calculated on ₱110,000.
> - **Auto/REM Method (Net)**: If you want ₱100,000, the principal stays at ₱100,000. Fees are subtracted from what you receive. Interest is calculated on ₱100,000 (not ₱110,000).
>
> **The difference**: For a ₱100,000 loan at 3% monthly for 6 months:
> - SME: Monthly payment = ₱21,633 (interest on ₱110,000)
> - Auto/REM: Monthly payment = ₱19,667 (interest on ₱100,000)
> - **Difference: ₱1,966 per month** (9% more than it should be!)
>
> **Where the code is**: The system currently routes all SME and Individual loans through the same calculation in `src/lib/computation/sme.ts`. We need to detect when the loan has collateral (Auto or REM) and route it to a different calculation in `src/lib/computation/sf.ts` instead.
>
> ---
>
> ### 2. Invoice Financing - Completely Missing ❌
>
> **What it is**: A special loan product for businesses that sell to customers (like government) who take a long time to pay. The business needs cash NOW, so they borrow against their unpaid invoice.
>
> **Why it's different**:
> - Payments are **weekly** (not monthly)
> - Interest rate **increases each month** if not paid
> - Maximum **3 months** of interest payments allowed
> - After 3 months, the full principal becomes due immediately
>
> **How it works**:
> - **Month 1**: Interest is 1% per week
> - **Month 2**: Interest increases to 2% per week
> - **Month 3**: Interest increases to 2.5% per week
> - **After 3 months**: Must pay back the full ₱100,000 principal + 5% penalty
>
> **Example timeline**:
> ```
> Release: Aug 20, ₱100,000
>
> Week 1 (Aug 27): Pay ₱1,000 (1%)
> Week 2 (Sep 3):  Pay ₱1,000 (1%)
> Week 3 (Sep 10): Pay ₱1,000 (1%)
> Week 4 (Sep 17): Pay ₱1,000 (1%)
> Total Month 1: ₱4,000
>
> Week 5 (Sep 24): Pay ₱2,000 (2% - rate went up!)
> Week 6 (Oct 1):  Pay ₱2,000 (2%)
> Week 7 (Oct 8):  Pay ₱2,000 (2%)
> Week 8 (Oct 15): Pay ₱2,000 (2%)
> Total Month 2: ₱8,000
>
> Week 9 (Oct 22):  Pay ₱2,500 (2.5% - rate went up again!)
> Week 10 (Oct 29): Pay ₱2,500 (2.5%)
> Week 11 (Nov 5):  Pay ₱2,500 (2.5%)
> Week 12 (Nov 12): Pay ₱2,500 (2.5%)
> Total Month 3: ₱10,000
>
> After Nov 19: Must pay ₱100,000 principal + ₱5,000 penalty = ₱105,000
> ```
>
> **Why it matters**: This is a complete product line that brings in revenue. Without it, the company cannot serve businesses that need working capital. These businesses will go to competitors instead.
>
> **What needs to be built**: A new computation engine that generates weekly payment schedules with escalating interest rates. This doesn't exist anywhere in the codebase right now.
>
> ---
>
> ### 3. Bi-Monthly (Every 15 Days) - Completely Missing ❌
>
> **What it is**: A payment schedule where the borrower pays every 15 days, counting from the release date. This is different from Salary loans.
>
> **The confusion**: People think this is the same as Salary loans (15th/30th), but it's NOT:
> - **Salary Loan**: Always pays on the 15th and 30th of each month (calendar-based)
> - **Bi-Monthly**: Pays every 15 days from release date (rolling dates)
>
> **Example to show the difference**:
> ```
> Release: Aug 20
> Monthly Payment: ₱20,000
>
> SALARY LOAN (calendar-based):
> - Aug 30 = ₱10,000 (end of month)
> - Sep 15 = ₱10,000 (15th)
> - Sep 30 = ₱10,000 (end of month)
> - Oct 15 = ₱10,000 (15th)
>
> BI-MONTHLY (rolling 15 days):
> - Sep 4  = ₱10,000 (20 + 15 days)
> - Sep 19 = ₱10,000 (20 + 30 days)
> - Oct 4  = ₱10,000 (20 + 45 days)
> - Oct 19 = ₱10,000 (20 + 60 days)
> ```
>
> **How it works**: Take the release date and keep adding 15 days for each payment. The monthly payment amount is split in half.
>
> **Why it matters**: Some businesses have cash flow that comes in every 2 weeks but not on fixed calendar dates. They need a rolling schedule that matches their actual cash flow pattern.
>
> **What needs to be built**: A schedule generator that creates payments every 15 days from the release date (not calendar-based like Salary loans).
>
> ---
>
> ### 4. Quarterly/2-Month - Completely Missing ❌
>
> **What it is**: Payment schedules where the borrower pays every 2 or 3 months, but with a special twist: they only pay interest for most payments, then pay all the principal at the end.
>
> **Two variants**:
>
> #### **2-Month Frequency**
> Pay every 2 months. Terms must be divisible by 2 (like 4, 6, 8, 10, 12 months).
>
> **Example (6-month loan, ₱100,000 at 3% monthly)**:
> ```
> Payment 1 (Oct 20): ₱6,000 (interest only for 2 months)
> Payment 2 (Dec 20): ₱6,000 (interest only for 2 months)
> Payment 3 (Feb 20): ₱6,000 (interest) + ₱100,000 (principal)
> ```
>
> #### **Quarterly (3-Month) Frequency**
> Pay every 3 months. Terms must be divisible by 3 (like 6, 9, 12 months).
>
> **Example (12-month loan, ₱100,000 at 3% monthly)**:
> ```
> Payment 1 (Nov 20): ₱9,000 (interest only for 3 months)
> Payment 2 (Feb 20): ₱9,000 (interest only for 3 months)
> Payment 3 (May 20): ₱9,000 (interest only for 3 months)
> Payment 4 (Aug 20): ₱9,000 (interest) + ₱100,000 (principal)
> ```
>
> **The special part**: On the last payment, the system generates **2 separate line items** with the same due date:
> - One line for interest (₱9,000)
> - One line for principal (₱100,000)
>
> This is for accounting purposes so the company can track interest income separately from principal repayment.
>
> **Why it matters**: Large loans (like ₱500,000+) are hard to pay monthly. Businesses prefer to pay quarterly to match their business cycles (like seasonal businesses). This gives them flexibility and makes larger loans possible.
>
> **What needs to be built**: A schedule generator that creates quarterly or bi-monthly payments, calculates interest-only amounts, and generates dual line items for the final payment.
>
> ---
>
> ### 5. Daily Interest - Completely Missing ❌
>
> **What it is**: Very short-term loans (usually 7-30 days) where interest is calculated per actual day instead of per month.
>
> **How it works**:
> - Convert monthly interest rate to daily rate: Monthly rate ÷ 30 = Daily rate
> - Count actual days between release and payment
> - Interest = Principal × Daily rate × Actual days
>
> **Example**:
> ```
> Principal: ₱100,000
> Monthly Rate: 3%
> Daily Rate: 3% ÷ 30 = 0.1% per day
>
> Release: Aug 20
> Payment: Aug 25 (5 days later)
>
> Interest = ₱100,000 × 0.1% × 5 = ₱500
> Total Payment = ₱100,500
> ```
>
> **Different from monthly**:
> - Monthly: Would charge ₱3,000 for any time in August (full month)
> - Daily: Only charges ₱500 for 5 days (fair for short-term)
>
> **Why it matters**: Short-term loans (like check discounting or bridge loans) shouldn't charge a full month's interest if the borrower only needs money for a few days. Daily interest makes short-term loans fair and attractive.
>
> **What needs to be built**: A calculator that takes a manual payment date, counts actual days, and generates a single payment (not a recurring schedule like monthly loans).
>
> ---
>
> ## Why This Matters
>
> ### Business Impact
>
> **Right now**:
> - ❌ Auto and REM borrowers are being overcharged (wrong formula)
> - ❌ Cannot offer Invoice Financing (losing SME clients to competitors)
> - ❌ Cannot offer flexible payment terms (Bi-Monthly, Quarterly)
> - ❌ Cannot offer fair short-term loans (Daily interest)
>
> **After fixing**:
> - ✅ Auto and REM loans calculate correctly
> - ✅ Can serve businesses needing working capital (Invoice Financing)
> - ✅ Can offer flexible terms to attract larger loans (Quarterly)
> - ✅ Can offer fair short-term loans (Daily interest)
> - ✅ More competitive in the lending market
>
> ### Financial Impact
>
> **Auto/REM wrong calculation**:
> - If 100 Auto loans at ₱100k each are overcharged by ₱1,966/month for 6 months
> - Overcharge = ₱1,179,600 (₱1.18 million)
> - This is a compliance risk and reputation damage
>
> **Missing Invoice Financing**:
> - If the company could serve 20 SMEs per month at ₱100k each
> - Potential monthly interest income = ₱440,000
> - Lost annual revenue = ₱5.28 million
>
> ---
>
> ## How the System Works (Current Architecture)
>
> ### The Flow
>
> 1. **Borrower applies** → Chooses loan type (Seafarer, SME, Individual)
> 2. **CSA computes** → Enters loan amount, terms, rates
> 3. **System calculates** → Routes to correct formula based on loan type
> 4. **Schedule generates** → Creates payment due dates and amounts
> 5. **Loan released** → Borrower receives funds
> 6. **Payments tracked** → System tracks what's paid and what's owed
>
> ### The Code Structure
>
> **Computation engines** (the math):
> - `src/lib/computation/sme.ts` - SME gross-up formula (Loan + Fees = Principal)
> - `src/lib/computation/sf.ts` - Seafarer net formula (Loan = Principal, Fees subtracted)
>
> **Schedule generators** (the payment dates):
> - `src/lib/ar/schedule.ts` - Creates payment schedule with due dates
>
> **Routing logic** (which formula to use):
> - `src/lib/csa/computation.ts` - Decides: "Is this SME? Is this Seafarer? Which formula should I use?"
>
> **Database**:
> - `computations` table - Stores the calculated amounts
> - `amortization_schedules` table - Stores each payment due date and amount
> - `payment_frequency` enum - Lists available payment types (currently only "monthly" and "semi_monthly")
>
> ### The Problem in the Code
>
> Right now, the routing logic in `src/lib/csa/computation.ts` only checks the **segment** (Seafarer, SME, Individual):
>
> ```typescript
> if (segment === "sme" || segment === "individual") {
>   // Use SME formula for EVERYTHING
>   computeSmeLoan()  // ← This is used for ALL SME/Individual loans
> }
> ```
>
> But it should ALSO check the **collateral type**:
>
> ```typescript
> if (collateralType === "car_refinancing" || collateralType === "real_estate") {
>   // Use NET method for Auto/REM
>   computeSfLoan()  // ← Use this for collateral loans
> } else if (segment === "sme" || segment === "individual") {
>   // Use GROSS-UP method for clean loans
>   computeSmeLoan()  // ← Use this for clean loans
> }
> ```
>
> ---
>
> ## What Needs to Happen
>
> ### Priority 1: Fix Auto/REM (2-3 days) 🔴
>
> **The task**: Change the routing logic to detect collateral and use the correct formula.
>
> **Why urgent**: Production issue - wrong amounts being charged right now.
>
> **What to modify**: Just the routing logic in `src/lib/csa/computation.ts`. Don't touch the actual computation formulas - they're correct. Just route Auto/REM to the right one.
>
> ---
>
> ### Priority 2: Invoice Financing (5-7 days) 🔴
>
> **The task**: Build a new computation engine and schedule generator for weekly payments with escalating rates.
>
> **Why urgent**: Complete product line missing, can't serve a whole market segment.
>
> **What to build**:
> - New file: `src/lib/computation/invoice.ts` (the weekly math)
> - Update: `src/lib/ar/schedule.ts` (generate weekly schedule)
> - Update: `src/lib/csa/computation.ts` (route to invoice when selected)
> - Update: UI to let CSA select "Invoice Financing" payment type
> - Update: Database to support "weekly" payment frequency
>
> ---
>
> ### Priority 3: Bi-Monthly (3 days) 🟡
>
> **The task**: Add a schedule generator for rolling 15-day payments.
>
> **Why important**: Some businesses need it, but not as critical as Invoice Financing.
>
> **What to build**:
> - New function in `src/lib/ar/schedule.ts`: `generateBiMonthlySchedule()`
> - Update: Routing to use it when "bi_monthly" is selected
> - Update: Database to support "bi_monthly" payment frequency
>
> ---
>
> ### Priority 4: Quarterly/2-Month (4 days) 🟡
>
> **The task**: Add schedule generators for quarterly and 2-month frequencies with interest-only payments.
>
> **Why important**: Needed for larger loans, but lower volume than weekly/monthly.
>
> **What to build**:
> - New function in `src/lib/ar/schedule.ts`: `generateQuarterlySchedule()`
> - Logic to validate terms (must be divisible by 2 or 3)
> - Logic to generate dual line items for final payment
> - Update: Database to support "quarterly" and "two_monthly" frequencies
>
> ---
>
> ### Priority 5: Daily Interest (2 days) 🟢
>
> **The task**: Build a calculator for short-term loans with daily interest.
>
> **Why low priority**: Niche use case, not many borrowers need it.
>
> **What to build**:
> - New file: `src/lib/computation/daily.ts` (daily rate calculator)
> - UI to let CSA enter manual payment date
> - Logic to count actual days and calculate interest
> - Update: Database to support "daily" payment frequency
>
> ---
>
> ## Success Criteria
>
> After all implementations are done:
>
> ✅ Auto/REM loans calculate interest on the correct amount (net method)
> ✅ CSA can select "Invoice Financing" and system generates weekly schedule with escalating rates
> ✅ CSA can select "Bi-Monthly" and system generates rolling 15-day schedule
> ✅ CSA can select "Quarterly" and system generates interest-only + principal schedule
> ✅ CSA can select "Daily Interest" and system calculates per actual day
> ✅ All existing monthly and salary loans still work (nothing broken)
> ✅ All calculations match the Excel calculator output exactly
> ✅ Database stores all new payment frequency types
> ✅ Documents generate correctly for all payment types
>
> ---
>
> ## Testing Requirements
>
> Each new payment type must be tested against real examples from the Excel calculator:
>
> **Auto/REM Test**:
> - Input: ₱100,000, 10% PF, 3% interest, 6 months
> - Expected: Principal = ₱100,000, Monthly = ₱19,667
> - Verify: Interest calculated on ₱100k (not ₱110k)
>
> **Invoice Test**:
> - Input: ₱100,000, 3 months
> - Expected: Week 1-4 at 1%, Week 5-8 at 2%, Week 9-12 at 2.5%
> - Verify: Total interest = ₱22,000
>
> **Bi-Monthly Test**:
> - Input: Release Aug 20, ₱20,000 monthly
> - Expected: Payments Sep 4, Sep 19, Oct 4, Oct 19 (15-day intervals)
> - Verify: Each payment = ₱10,000
>
> **Quarterly Test**:
> - Input: ₱100,000 at 3% monthly, 12 months, quarterly
> - Expected: 3 payments of ₱9,000 interest + final ₱9,000 interest + ₱100,000 principal
> - Verify: 4 payment dates, 3 months apart
>
> **Daily Test**:
> - Input: ₱100,000, 3% monthly, 5 days
> - Expected: Interest = ₱500, Total = ₱100,500
> - Verify: Daily rate = 0.1%, Interest = Principal × 0.1% × 5
>
> ---
>
> ## Source Documents
>
> All business rules came from:
>
> 1. **Excel Calculator**: `Calculator SME.xlsm` - The client's actual working calculator
> 2. **Excel Extraction**: `sme-calculator-extraction.md` - Technical analysis of Excel formulas
> 3. **Client Transcription**: `transcription.md` (lines 900-1100) - Client explaining each payment type
> 4. **Implementation Brief**: `payment-frequency-implementation-brief.md` - Complete technical details
>
> ---
>
> **This context document explains WHAT needs to be built and WHY. The implementation brief explains HOW to build it.**
