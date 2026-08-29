# Loan Schedule Type — Redesign Plan

**Status: IMPLEMENTED (2026-08-28).** All 8 phases below shipped — migration applied, `persistComputation`/routes/negotiation service updated, both intake UIs (CSA + borrower portal) updated, `ComputationPanel` split by mode, docs updated. Full test suite green (1417 unit tests, 32 vitest tests, zero new type errors). Kept as a design record — the "what" and "why" below are still accurate to the shipped code.

**Supersedes the "Payment frequency" design from `payment-frequency-implementation-plan.md` (P2 Phase 0).** That plan added an independent "Payment frequency" picker on the Computation screen. Audit (this document) confirms that design doesn't match how the business actually works — per the client's own Excel calculator, the schedule/product type (`SME`, `Invoice`, `MPL`, `Salary`, `Auto`, `Quarterly`, `Daily`, ...) is decided **once, at intake**, the same moment Segment and Collateral are decided — not as a second, independent choice made later at computation time. This plan moves it there.

**What does NOT change**: every P1–P5 computation engine (`sme.ts`, `sf.ts`, `invoice.ts`, `daily.ts`, `schedule.ts`'s generators) and the `computations.payment_frequency` / `amortization_schedules.line_type` columns from the prior work stay exactly as they are — they don't care *where* the frequency decision came from, only that it arrives correctly. This plan only moves the **decision point**, not the math.

---

## Part 1: Audit

### What the client's Excel actually does (confirmed against `Calculator SME.xlsm`)

The rate catalog's `Name` column (sheet `SME`, columns EJ/EN) is formatted `TYPE - WHO` — e.g. `SME - MERCATO`, `Invoice - SME`, `MPL - TEACHER`, `Salary - Sample`, `Auto - Sample`, `QUARTERLY - VIENOVO`, `DAILY - Vienovo`. The prefix is the payment schedule/product; the suffix is just a label for whose rate it is. Cross-checked against the loan register (`DataFilter` sheet): every `QUARTERLY -`/`DAILY -`/`Invoice -` entry traces back to an SME/business borrower (e.g. `VIENOVO PHILIPPINES, INC.`, segment `Business Loan`) — none trace to an individual/MPL/Salary borrower. **Confirms the user's scoping call**: these five new products are SME-only.

### What our system does today (as of the P1–P5 work)

`loan_applications` already has this exact pattern for two of the eight products:
- `segment` (`seafarer`/`sme`/`individual`) — decided at intake, immutable after (Committee never touches it)
- `collateral_type` (`none`/`car_refinancing`/`real_estate`) — decided at intake, immutable after
- `individual_loan_type` (`mpl`/`salary`) — decided at intake, immutable after, **only for `segment = individual` and `collateral_type = none`**

The P1–P5 work added a **ninth**, structurally different field: `payment_frequency`, chosen on the **Computation** screen (not intake), independently of the three fields above, and — this is the bug — override-able by Committee during negotiation, with no link back to intake at all. That's the piece being corrected here: fold it into the same intake-time, immutable pattern `individual_loan_type` already uses, scoped to SME instead of Individual.

### Every place the current (to-be-removed) design touches

Confirmed by reading each file — this is the actual blast radius:

| Layer | File | What's there today |
|---|---|---|
| DB | `computations.payment_frequency` (text+CHECK, 7 values) | **Stays** — still the final stored value, just sourced differently |
| DB | `amortization_schedules.line_type` | **Stays**, unrelated to this change |
| Compute engine | `src/lib/csa/computation.ts` | `PersistComputationInput.paymentFrequency` accepted as free CSA input; `validateFrequencyTerms`, `manualPaymentDate` |
| Compute route | `src/app/api/csa/applications/[id]/computation/route.ts` | `computeSchema.paymentFrequency`, term-divisibility check, `paymentDate` |
| Committee override | `src/lib/negotiation/service.ts` (`OverrideInput.paymentFrequency`), `src/app/api/committee/applications/[id]/override/route.ts` | Frequency changeable mid-negotiation — this is the part most at odds with segment/collateral's immutability |
| UI | `src/components/csa/ComputationPanel.tsx` | The standalone "Payment frequency" dropdown, its hints, its state, its payload field, the Daily payment-date field's visibility gate |
| Intake (CSA) | `src/lib/csa/create-application.ts` (`createApplicationSchema`), `src/app/csa/applications/new/page.tsx` | Where `individual_loan_type` already lives — the new field joins it here |
| Intake (borrower self-service) | `src/app/api/borrower/applications/reloan/route.ts` (the single shared endpoint for both first-time and reloan applications — confirmed no separate POST route exists), `src/app/borrower/page.tsx` | Independently re-implements the same segment/collateral/individualLoanType capture — **a second place the new field must be added**, easy to miss |
| Read path | `src/lib/csa/application.ts` (`getApplicationForStaff`), lead conversion (`src/app/api/csa/leads/[id]/convert/route.ts`, shares `createApplicationSchema`) | Needs the new column added to its `select()` list, same as `collateral_type` already is |

### Risk assessment

**High**: Committee override currently accepts `paymentFrequency` — removing it is a behavior change (Committee could previously "fix" a wrong frequency mid-negotiation; after this change they can't, matching segment/collateral). Confirm this is actually acceptable business-wise before removing — flagged as an open question below, not assumed.

**Medium**: Two independent intake UIs (CSA + borrower self-service) must both change together, or one produces SME applications with no schedule type. `create-application.ts`'s schema is shared by CSA-create and lead-conversion, so those two are covered by one change; the borrower route is entirely separate code and needs its own, parallel change.

**Low**: The compute-time math itself (`invoice.ts`, `schedule.ts`, `daily.ts`) is untouched — this is a wiring/UI relocation, not a formula change. Every test written for P1–P5 stays valid.

### Existing functionality to preserve

- Seafarer and Individual application creation: byte-identical, no new required field.
- Regular (monthly) SME: if the new field defaults to `monthly` and nothing else changes, an ordinary SME application computes identically to today.
- All P1–P5 math and schedule generation: untouched.

---

## Part 2: Implementation Plan

### Phase 1: Database

**New column** on `loan_applications`:
```sql
ALTER TABLE loan_applications ADD COLUMN schedule_type text NOT NULL DEFAULT 'monthly';
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_schedule_type_check
  CHECK (schedule_type = ANY (ARRAY['monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily']::text[]));
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_schedule_type_sme_only
  CHECK (segment = 'sme' OR schedule_type = 'monthly');
```
`NOT NULL DEFAULT 'monthly'` (not nullable) — every existing row, and every Seafarer/Individual row going forward, is simply `'monthly'` and the second CHECK keeps it that way outside SME. This means **no backfill migration is needed** for existing SME applications created before this change; they read as `'monthly'` (today's implicit default), which is correct for all of them since the five new products didn't exist in the system until now.

### Phase 2: `persistComputation` — stop accepting frequency as compute-time input

**File**: `src/lib/csa/computation.ts`

Remove `paymentFrequency` from `PersistComputationInput` as a free-form field; replace with a value the caller derives from the *application*, not from CSA's compute-time choice:
```ts
// Before:
paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily" | null;

// After:
/** Application-level schedule type — SME only, decided at intake
 * (loan_applications.schedule_type), immutable after (same as segment/
 * collateralType). Not a CSA-facing choice at compute time; the caller
 * (route/negotiation service) reads it off the application row and passes
 * it straight through. Ignored for Seafarer/Individual — always "monthly"
 * there, per the DB CHECK. */
scheduleType?: "monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily" | null;
```

Replace the derivation:
```ts
// Before:
const paymentFrequency =
  input.paymentFrequency ??
  (input.individualLoanType === "salary" ? "semi_monthly" : "monthly");

// After:
const paymentFrequency =
  segment === "sme"
    ? (input.scheduleType ?? "monthly")
    : input.individualLoanType === "salary"
      ? "semi_monthly"
      : "monthly";
```
Everything downstream of `paymentFrequency` (the `isDaily` check, `validateFrequencyTerms` call, the Daily-interest override block, the insert payload) is unchanged — they all just read this variable, not caring where it came from.

**Also fix**: `mapComputationRow`'s `paymentFrequency` cast stays as the full 7-value union from the prior fix — no change needed there.

### Phase 3: CSA compute route — read schedule type from the application, not the request body

**File**: `src/app/api/csa/applications/[id]/computation/route.ts`

Remove `paymentFrequency` from `computeSchema` entirely (CSA can no longer submit it at compute time). Keep `paymentDate` (still needed — Daily's *actual payment date* is genuinely a compute-time fact, since it depends on the specific loan amount/release date, unlike the *product type* which is decided at intake).

```ts
// Before:
const frequencyTermsError = validateFrequencyTerms(body.paymentFrequency, body.terms);
...
if (body.paymentFrequency === "daily" && !body.paymentDate) { ... }
...
paymentFrequency: body.paymentFrequency,

// After:
const scheduleType = application.schedule_type as
  | "monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily";

const frequencyTermsError = validateFrequencyTerms(scheduleType, body.terms);
...
if (scheduleType === "daily" && !body.paymentDate) { ... }
...
scheduleType,
```
`application.schedule_type` needs to be added to `getApplicationForStaff`'s `select()` list in `src/lib/csa/application.ts` (one line, same place `collateral_type` already is).

### Phase 4: Committee override — keep the existing override capability, just rename/re-source its default

**Resolved** (see Part 3 — confirmed with the client): Committee retains full authority to change an SME loan's schedule type during negotiation, the same way it already can change amount, rate, terms, and due day. Unlike collateral type (which even Committee cannot change — `hasCollateral` is derived purely from `appRow.collateral_type`, never accepted as override input), schedule type behaves more like a rate: CSA/borrower sets it at intake, and it flows through as the default, but Committee is the final authority and can override it. **So `OverrideInput.paymentFrequency` is *not* removed** — it's kept exactly as already built in the P1–P5 work, with one small change: its "preserve existing" fallback now also has a real intake-level default to fall back to (`loan_applications.schedule_type`), instead of implicitly defaulting to `monthly` for every non-Individual loan.

**File**: `src/lib/negotiation/service.ts`

`persistOverrideComputation` already fetches `appRow` with `segment, collateral_type` (from the P1 fix) — extend the select to include `schedule_type`:
```ts
.select("segment, collateral_type, schedule_type")
```
Rename `paymentFrequency` → `scheduleType` in `OverrideInput` for consistency with the intake field name (cosmetic, not a behavior change), and extend its existing explicit-wins/preserve-existing resolution to fall back through three levels instead of two:
```ts
// Before (P1–P5 work): explicit input wins, else the prior computation's own
// frequency, else undefined (→ persistComputation's own monthly/semi_monthly default).
const resolvedPaymentFrequency =
  input.paymentFrequency ??
  (existingComp?.payment_frequency as OverrideInput["paymentFrequency"] | undefined);

// After: explicit input wins, else the prior computation's own frequency
// (so an in-progress negotiation doesn't reset on an unrelated amount
// tweak), else the application's intake-level default — never silently
// falls all the way back to a bare "monthly" default for SME.
const resolvedScheduleType =
  input.scheduleType ??
  (existingComp?.payment_frequency as OverrideInput["scheduleType"] | undefined) ??
  (appRow?.schedule_type as OverrideInput["scheduleType"] | undefined);
```
Everything else about this resolution (the `validateFrequencyTerms` call, the `resolvedPaymentDate` handling for Daily) stays exactly as already built — only the variable name and the added third fallback level change.

**File**: `src/app/api/committee/applications/[id]/override/route.ts` — rename `paymentFrequency` → `scheduleType` in `overrideSchema` for consistency. No removal.

**File**: `src/components/csa/ComputationPanel.tsx`, committee mode (`mode === "committee"`) — this is the one place the standalone picker *does* stay, since Committee genuinely needs to be able to change it. CSA mode (`mode === "csa"`, the ordinary compute screen) loses the picker per Phase 7 below; committee mode keeps an equivalent control, pre-filled from the application's/current computation's schedule type, editable, submitted as `scheduleType` in the override payload.

### Phase 5: Intake — CSA-created applications

**File**: `src/lib/csa/create-application.ts`

Add to `createApplicationSchema`, alongside `individualLoanType`:
```ts
/** SME only — the loan's schedule/product type, decided at intake and
 * immutable after (same as collateralType). Not applicable to Seafarer/
 * Individual — regular monthly there, enforced by the DB CHECK. */
scheduleType: z
  .enum(["monthly", "weekly", "bi_monthly", "quarterly", "two_monthly", "daily"])
  .default("monthly"),
```
Add a `.refine()` mirroring the existing Seafarer/collateral one:
```ts
.refine((data) => data.segment === "sme" || data.scheduleType === "monthly", {
  message: "Schedule type only applies to SME applications",
  path: ["scheduleType"],
})
```
Insert `schedule_type: body.scheduleType` into the `loan_applications` insert (next to `collateral_type`).

**File**: `src/app/csa/applications/new/page.tsx` — add a "Loan schedule" `<Select>`, shown only when `segment === "sme"` (same conditional-render pattern already used for the Collateral/Individual-loan-type fields), defaulting to `monthly`:
```
Regular (Monthly)
Invoice Financing (Weekly)
Bi-monthly (every 15 days)
Quarterly
Two-monthly
Daily
```
Not marked `required` (unlike Collateral/Individual-loan-type) — defaults to the overwhelmingly common case (`monthly`) so an ordinary SME application needs zero extra clicks; CSA only has to touch it for the five less-common products.

### Phase 6: Intake — borrower self-service applications

**File**: `src/app/api/borrower/applications/reloan/route.ts` — the single shared endpoint for both first-time and reloan borrower applications (confirmed: no separate POST route exists for "first" applications). Add the same `scheduleType` capture as Phase 5, independently — this route builds its own insert object rather than reusing `createApplicationSchema`, so the validation and default need to be duplicated here, same as `collateralType`/`individualLoanType` already are duplicated across the two entry points today.

**File**: `src/app/borrower/page.tsx` — add the same "Loan schedule" select to the borrower-facing SME picker UI (`pickerSegment === "sme"` block, next to where Collateral is already conditionally rendered).

### Phase 7: Computation UI — CSA mode loses the picker, Committee mode keeps an editable one

**File**: `src/components/csa/ComputationPanel.tsx`

The panel already branches on `mode: "csa" | "committee"` for other things (which endpoint it posts to). This phase adds a second behavioral difference:

**CSA mode** (`mode === "csa"`): remove the `paymentFrequency` state, its `<Select>`, and the hydrate-from-`computation.paymentFrequency` effect block. Add a new prop, e.g. `scheduleType: "monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily"`, passed down from the parent page as **read-only, display-only** information (CSA cannot change it here — it was fixed at intake). Use it to:
- Show the same Weekly/Quarterly/Two-monthly/Daily hint text as before (driven by the prop now, not a dropdown's current selection)
- Show/require the Daily "Payment date" field when `scheduleType === "daily"`
- Run the same client-side term-divisibility check before submit
- Send nothing frequency-related in the POST payload — the backend derives it from the application (Phase 3)

**Committee mode** (`mode === "committee"`): keep an editable `<Select>` (same options), pre-filled from `scheduleType` (the current value — either the application's intake default or whatever a prior override already set), submitted as `scheduleType` in the override payload (Phase 4). Same hints/validation as CSA mode, just editable.

**Files providing the `scheduleType` prop**: `src/app/csa/applications/[id]/page.tsx` and `src/app/committee/applications/[id]/page.tsx` — both already fetch the application to pass `segment`/`entity_type`/etc. into `ComputationPanel`; add `schedule_type` to that query and pass it through. For Committee's page specifically, prefer the *active computation's* `payment_frequency` when one already exists (so a resumed negotiation shows the last-overridden value, not the original intake default) and fall back to the application's `schedule_type` only when there's no computation yet.

### Phase 8: Cleanup

- Delete the now-orphaned `validateFrequencyTerms`'s dependency on a free-form `paymentFrequency` string — it already takes a plain string, so no signature change needed, just confirm both call sites (Phase 3, Phase 4) pass the derived value.
- Update [`payment-frequency-manual-test-guide.md`](payment-frequency-manual-test-guide.md): every scenario currently says "select Payment frequency on the Computation screen" — rewrite to "select Loan schedule when creating the application," since the field moved.
- Update [`payment-frequency-implementation-plan.md`](payment-frequency-implementation-plan.md)'s Part 2/P2-Phase-0 section with a pointer to this document, so a future reader doesn't implement the superseded design from a stale doc.

### Testing

- [ ] Unit: `persistComputation` derives `monthly` for Seafarer/Individual regardless of any `scheduleType` passed in (defensive — DB CHECK should make this unreachable anyway, but the derivation logic itself shouldn't trust the caller).
- [ ] Unit: `persistComputation` uses `input.scheduleType` for SME, defaulting to `monthly` when omitted.
- [ ] Regression: every P1–P5 unit test from the prior work stays green unmodified (they call the schedule generators / `computeInvoiceLoan` / `computeDailyInterestLoan` directly, none of which changed).
- [ ] Integration: create an SME application with Schedule type = Quarterly, confirm `loan_applications.schedule_type = 'quarterly'`, then compute a 6-month loan and confirm the resulting `computations.payment_frequency = 'quarterly'` with no frequency picker involved at compute time.
- [ ] Integration: Committee override on that same application — confirm the override request has no way to change `payment_frequency` away from `quarterly`, and that it doesn't silently reset to `monthly` either (must read `schedule_type` off the application, not drop it).
- [ ] Regression: an ordinary SME application (Schedule type left on default `monthly`) computes identically to before this change.
- [ ] UI: Seafarer and Individual application-creation forms show no new field. SME's new field only appears for `segment === "sme"`, in both the CSA and borrower-portal creation forms.

### Rollback

Additive column with a safe default (`monthly`, matching today's implicit behavior) — reverting the code leaves the column unused and harmless. The riskier part to revert cleanly is Phase 4 (Committee override schema change) if it turns out Committee does need override capability — see the open question below; resolve that *before* Phase 4 ships, not after, since removing then re-adding an override capability means round-tripping the negotiation UI twice.

---

## Part 3: Open Question — Resolved

**Should Committee retain the ability to change an SME loan's schedule type during negotiation/override?**

**Yes — confirmed.** Committee always retains override authority, the same as it already has over amount, rate, terms, and due day. This is *not* the same guarantee segment/collateral get (those are immutable even to Committee — `hasCollateral` is derived purely from the application row, never accepted as override input); schedule type sits in the same tier as rates: CSA/borrower sets it at intake as the default, Committee can change it later. Phase 4 and Phase 7 above reflect this — the override endpoint and Committee's Computation-panel mode both keep an editable path; only CSA's own (non-Committee) compute screen loses free-choice, since intake is where CSA's input on this question belongs.
