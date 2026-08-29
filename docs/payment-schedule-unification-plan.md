# Payment Schedule Unification — Audit + Implementation Plan (Option B)

**Merges `loan_applications.individual_loan_type` (MPL/Salary) and `loan_applications.schedule_type` (Regular/Invoice/Bi-monthly/Quarterly/Two-monthly/Daily) into one field — and opens the full combined 8-option list to *both* SME and Individual, not just their historical subset.** Confirmed explicitly 2026-08-29: SME will be able to pick MPL/Salary, and Individual will be able to pick Invoice/Bi-monthly/Quarterly/Two-monthly/Daily — combinations the client's own Excel calculator never actually contained (traced earlier: MPL/Salary only ever appeared under individual borrowers, the five newer products only ever appeared under SME/business borrowers in the real data). That's a deliberate, confirmed product decision, not an oversight — flagged once during planning, and the answer was to proceed. This document plans for that scope.

**What does NOT change**: `segment` itself, `collateral_type`, every P1–P5 computation engine (`sme.ts`, `sf.ts`, `invoice.ts`, `daily.ts`, `schedule.ts`'s generators), and — critically — `computations.payment_frequency`'s existing 7-value vocabulary (`monthly`/`semi_monthly`/`weekly`/`bi_monthly`/`quarterly`/`two_monthly`/`daily`). See the guardrail in Part 3 about why that last one is load-bearing, not optional. **Seafarer is not part of this expansion** — the ask was specifically "let SME and Individual have access," so Seafarer stays locked to `monthly`/derived-`semi_monthly` exactly as today, no picker.

---

## Part 1: Audit

### Database — current state (verified live via Supabase MCP, 2026-08-29)

```
loan_applications
  individual_loan_type  text  NULLABLE,  no default
  schedule_type          text  NOT NULL, default 'monthly'

CHECK loan_applications_individual_loan_type_check:
  individual_loan_type = ANY (ARRAY['mpl','salary'])
CHECK loan_applications_schedule_type_check:
  schedule_type = ANY (ARRAY['monthly','weekly','bi_monthly','quarterly','two_monthly','daily'])
CHECK loan_applications_schedule_type_sme_only:
  segment = 'sme' OR schedule_type = 'monthly'
```

**Real production data** (89 rows total, grouped by segment/collateral/both fields):

| segment | collateral | individual_loan_type | schedule_type | count |
|---|---|---|---|---|
| individual | car_refinancing | null | monthly | 4 |
| individual | none | **salary** | monthly | 2 |
| individual | real_estate | null | monthly | 1 |
| seafarer | none | null | monthly | 55 |
| sme | car_refinancing | null | monthly | 5 |
| sme | none | null | monthly | 18 |
| sme | none | null | **weekly** | 1 |
| sme | real_estate | null | monthly | 3 |

Confirms the two fields are already mutually exclusive in every existing row (`COALESCE(individual_loan_type, schedule_type)` recovers every row's correct value with zero ambiguity) — this is what makes the backfill in Phase 1 safe regardless of the scope decision below. None of the 89 rows combine, e.g., `individual` + `weekly` — that combination is new territory this plan deliberately opens up, not something already lurking in the data.

### Code — every real consumer, both fields (grep across the whole `src/` tree, camelCase + snake_case)

Exactly **7 production files** touch either field:

| File | What it does today |
|---|---|
| [`src/lib/csa/computation.ts:391-421`](../src/lib/csa/computation.ts) | The core branch point — derives both `payment_frequency` (stored on `computations`) and the first-payment-date rule from `segment` + (`individualLoanType` **or** `scheduleType`) |
| [`src/app/api/csa/applications/[id]/computation/route.ts:326-329,379`](../src/app/api/csa/applications/%5Bid%5D/computation/route.ts) | Reads `application.individual_loan_type`, separately resolves `application.schedule_type` (with an optional CSA/Committee override), passes both into `persistComputation` |
| [`src/lib/negotiation/service.ts`](../src/lib/negotiation/service.ts) | Committee's override path — only handles `scheduleType` today; never touches `individual_loan_type` (confirmed zero matches) — Individual loans have no compute-time override capability today |
| [`src/lib/csa/create-application.ts:25,50-65,133,174`](../src/lib/csa/create-application.ts) | `createApplicationSchema`'s two separate zod fields + two separate `.refine()` blocks + two separate insert columns |
| [`src/app/api/borrower/applications/reloan/route.ts:46-62,176-192,226,266`](../src/app/api/borrower/applications/reloan/route.ts) | Borrower self-service's own independent re-implementation of the same validation |
| [`src/lib/csa/application.ts:61`](../src/lib/csa/application.ts) | `getApplicationForStaff`'s `select()` list |
| [`src/app/csa/applications/new/page.tsx`](../src/app/csa/applications/new/page.tsx) / [`src/app/borrower/page.tsx`](../src/app/borrower/page.tsx) | Two separately-rendered pickers per page, gated by segment |

`src/components/csa/ComputationPanel.tsx`: confirmed **zero** references to `individualLoanType` — only `scheduleType`, SME-gated. Confirms the "Individual has no compute-time schedule control at all today" starting point.

**Everywhere else** (document generation, CIG, Committee's assessment UI, reports, checklists): confirmed **no references** to either field. Nothing outside the 7 files above needs to change.

### The one non-obvious risk: `computations.payment_frequency` must NOT learn the words "mpl"/"salary"

`persistComputation` already translates `individualLoanType`/`scheduleType` into `computations.payment_frequency`, which only ever stores one of 7 values — never `mpl` or `salary`. That stored column is read by `discount-units.ts`, `ar/masterlist.ts`, `lra/release-service.ts`'s PDC logic, and the client-side `buildPdcRows` in the LRA page — none of which know what `"mpl"`/`"salary"` mean. **The merge must only touch `loan_applications`'s vocabulary (8 values), never `computations.payment_frequency`'s (stays at 7).** `persistComputation` remains the sole translation boundary — unchanged principle from before, just now applied across a wider set of segment/value combinations (see Phase 2).

### What actually changes because of the (b) decision, vs. a pure structural merge

| | Pure merge (same access per segment, one field instead of two) | This plan (full 8-option access, both segments) |
|---|---|---|
| DB scope check | `segment` picks which subset is legal | Any of 8 values legal for `sme` or `individual`; only `seafarer` is restricted |
| `computation.ts` derivation | Same two-branch logic, renamed inputs | New logic: `mpl`→`monthly`, `salary`→`semi_monthly`, the other 6 pass through **regardless of segment** (SME already did this; Individual gains it) |
| First-payment-date rule | Unchanged per segment | Individual picking anything other than `salary` now needs the **same** date rule SME already uses (`computeSmeFirstPaymentDate`) — previously Individual's fallback (no `individualLoanType`) used the Seafarer-style 22nd-cutoff rule; that fallback only remains for Seafarer now |
| UI | Two pickers → one picker, option list still segment-conditional | Two pickers → **one single dropdown showing all 8 options**, for both SME and Individual |
| Risk profile | Low — close to a rename | Medium — new segment/value combinations that have never been computed before (e.g. Individual+Quarterly) need real testing, not just a refactor check |

### Risk assessment

**Low**: the DB backfill and the file-consolidation mechanics (Phases 1, 5, 6, 7) — same low risk as a pure merge, since existing data doesn't change shape.

**Medium**: `computation.ts`'s derivation logic (Phase 2) is now genuine new logic, not a rename — Individual+Quarterly, Individual+Weekly, etc. are code paths that have never run against real data. Needs explicit new test cases per combination, not just "assert output matches today's behavior" (there is no "today's behavior" for these combinations).

**Medium**: SME+MPL and SME+Salary are new too — worth asking whether SME picking "MPL" should behave identically to Individual picking "MPL" (same gross-up math, same monthly date rule, same `payment_frequency: "monthly"`) or whether "MPL" as a label only makes sense for individuals and SME should just use "Regular (Monthly)" to mean the same thing. **Flagged as an open question below** — the plan as written treats `mpl` as fully equivalent to `monthly` in effect (same derivation output) regardless of segment, so this is really a UI/labeling question, not a math one.

**Low**: no other module in the codebase reads either field, confirmed by repo-wide grep.

---

## Part 2: Implementation Plan

### Phase 1 — Database (additive, safe to deploy independently, ahead of code)

```sql
ALTER TABLE loan_applications ADD COLUMN payment_schedule text NOT NULL DEFAULT 'monthly';

ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_payment_schedule_check
  CHECK (payment_schedule = ANY (ARRAY[
    'mpl', 'salary',
    'monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily'
  ]::text[]));

-- Full 8-value access for BOTH sme and individual (any collateral status —
-- not restricted to collateral_type = 'none', since that restriction was
-- specific to the old individual_loan_type field's own history, not a
-- mathematical requirement; the net-method/gross-up engine choice already
-- comes from collateral_type independently — see resolveComputationEngine
-- in computation.ts, untouched by this plan). Seafarer is the only segment
-- still restricted to 'monthly'.
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_payment_schedule_scope
  CHECK (
    (segment IN ('sme', 'individual'))
    OR (segment = 'seafarer' AND payment_schedule = 'monthly')
  );

-- Backfill every existing row — safe because the two source fields are
-- confirmed mutually exclusive in 100% of current data (Part 1 audit).
UPDATE loan_applications SET payment_schedule = individual_loan_type WHERE individual_loan_type IS NOT NULL;
UPDATE loan_applications SET payment_schedule = schedule_type WHERE schedule_type <> 'monthly';
```

**Do NOT drop `individual_loan_type`/`schedule_type` in this phase** — Phase 9, separate, later, after the rest of this plan is stable in production.

**Testing**: re-run the grouped `SELECT` from the audit above post-backfill, confirm every row's `payment_schedule` matches `COALESCE(individual_loan_type, schedule_type)`.

---

### Phase 2 — `src/lib/csa/computation.ts` (the core derivation point — real logic change, not a rename)

`PersistComputationInput`:
```ts
/** Unified schedule/product choice. Valid for SME or Individual — any of
 * the 8 values, either segment (confirmed 2026-08-29: SME may pick MPL/
 * Salary, Individual may pick Invoice/Bi-monthly/Quarterly/Two-monthly/
 * Daily — a deliberate product decision, not a restriction inherited from
 * the old two-field design). Ignored for Seafarer (always "monthly").
 * Never leaks past this file as a literal "mpl"/"salary" string —
 * persistComputation translates it into computations.payment_frequency's
 * own, unrelated, 7-value vocabulary. */
paymentSchedule?:
  | "mpl" | "salary"
  | "monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily"
  | null;
```

Replace the derivation block (currently `computation.ts:398-421`):
```ts
// Before:
const paymentFrequency =
  segment === "sme"
    ? (input.scheduleType ?? "monthly")
    : input.individualLoanType === "salary"
      ? "semi_monthly"
      : "monthly";
...
const firstPayment = isDaily
  ? new Date(input.manualPaymentDate!)
  : segment === "sme" || input.individualLoanType === "mpl"
    ? computeSmeFirstPaymentDate(releaseDate, result.addonMonths)
    : input.individualLoanType === "salary"
      ? computeSalaryFirstPaymentDate(releaseDate, result.addonMonths)
      : computeFirstPaymentDate(releaseDate, result.addonMonths, dueDay);

// After — segment no longer gates WHICH values are meaningful, only
// whether the field applies at all (Seafarer excluded):
const paymentFrequency =
  segment === "sme" || segment === "individual"
    ? input.paymentSchedule === "mpl"
      ? "monthly"
      : input.paymentSchedule === "salary"
        ? "semi_monthly"
        : (input.paymentSchedule ?? "monthly") // weekly/bi_monthly/quarterly/two_monthly/daily/monthly pass through as-is, for either segment
    : "monthly"; // Seafarer
...
const firstPayment = isDaily
  ? new Date(input.manualPaymentDate!)
  : input.paymentSchedule === "salary"
    ? computeSalaryFirstPaymentDate(releaseDate, result.addonMonths)
    : segment === "sme" || segment === "individual"
      ? computeSmeFirstPaymentDate(releaseDate, result.addonMonths) // mpl, monthly, weekly, bi_monthly, quarterly, two_monthly all share this base rule — the frequency-specific generators (invoice.ts, schedule.ts) build their own real due dates from releaseDate directly and don't depend on this value except as a stored display field
      : computeFirstPaymentDate(releaseDate, result.addonMonths, dueDay); // Seafarer only, now
```

**This is a genuine behavior change for Individual loans that pick anything other than `salary`**: today, an Individual loan with no `individualLoanType` set falls back to the Seafarer-style 22nd-cutoff first-payment rule. After this phase, Individual picking `mpl`, `monthly`, or any of the 5 newer schedules uses the SME-style "release + 1 month, same day" rule instead — matching what SME already does for all 6 of its schedule types today. This is consistent with treating SME and Individual as the same tier once collateral/segment routing is set aside, but it's a real change in date-computation behavior for Individual loans, worth confirming is intended (it follows naturally from "let Individual access the same schedules SME has," since those schedules' generators were built assuming this date rule).

`validateFrequencyTerms`, `maxDiscountUnits`, `buildDiscountUnits`, `resolveComputationEngine` — **no changes needed**. They already operate on the *derived* `paymentFrequency`/segment values (not on `individualLoanType`/`scheduleType` directly), and none of their logic is segment-specific in a way that breaks when Individual starts producing `weekly`/`quarterly`/etc. — e.g. `buildDiscountUnits`'s Invoice branch only needs `principal`/`terms`/`releaseDate`, which Individual computations already have.

**Testing** — this phase needs real new coverage, not just regression checks:
- [ ] `paymentSchedule: "mpl"`, any segment → same `payment_frequency`/date rule as today's SME regular.
- [ ] `paymentSchedule: "salary"`, any segment → same semi-monthly behavior as today's Individual+Salary.
- [ ] **New**: `segment: "individual", paymentSchedule: "quarterly"` → produces a valid quarterly computation (dual-line interest+principal, correct term-divisibility validation) exactly like SME+Quarterly does.
- [ ] **New**: `segment: "individual", paymentSchedule: "weekly"` → produces a valid Invoice computation.
- [ ] **New**: `segment: "sme", paymentSchedule: "mpl"` → produces the same output as `segment: "sme", paymentSchedule: "monthly"` (confirms the "mpl is just a label, not different math" assumption from the risk assessment).
- [ ] **New**: `segment: "individual", paymentSchedule: "daily"` → requires `manualPaymentDate`, same as SME+Daily.

---

### Phase 3 — CSA compute route (`src/app/api/csa/applications/[id]/computation/route.ts`)

```ts
const applicationPaymentSchedule =
  ["mpl","salary","weekly","bi_monthly","quarterly","two_monthly","daily"].includes(
    application.payment_schedule as string,
  )
    ? application.payment_schedule
    : "monthly";
const paymentSchedule = body.paymentSchedule ?? applicationPaymentSchedule;
```
`computeSchema`'s field renamed `paymentSchedule`, enum widened to all 8 values, no longer gated to SME. `validateOriginationDiscounts(body.terms, body.originationDiscounts, paymentSchedule)` / `validateFrequencyTerms(paymentSchedule, body.terms)` — same calls, just no longer only reachable for SME (Individual+Quarterly now correctly enforces the divisible-by-3 rule too).

This also means CSA can override an Individual loan's schedule at compute time, same as SME already allows — consistent with opening full access.

---

### Phase 4 — Committee override (`src/lib/negotiation/service.ts`)

Rename `OverrideInput.scheduleType` → `paymentSchedule`, widen enum to all 8 values, remove the implicit SME-only framing from the doc comment. `persistOverrideComputation`'s `appRow` select swaps `collateral_type, schedule_type` for `collateral_type, payment_schedule`; the resolution chain (`input.paymentSchedule ?? existingComp?.payment_frequency ?? appRow?.payment_schedule`) is unchanged in shape.

Committee can now switch an Individual loan between any of the 8 schedules — including MPL ↔ Salary, which they couldn't do at all before (no override field existed for it). This falls directly out of the (b) decision: if Individual gets full access at intake and at CSA compute time, Committee (the final approval authority) should have at least the same reach.

---

### Phase 5 — `src/lib/csa/create-application.ts`

```ts
paymentSchedule: z
  .enum(["mpl", "salary", "monthly", "weekly", "bi_monthly", "quarterly", "two_monthly", "daily"])
  .default("monthly"),
```
```ts
.refine(
  (data) =>
    data.segment === "sme" || data.segment === "individual"
      ? true // any of the 8 values valid for either segment
      : data.paymentSchedule === "monthly", // Seafarer locked
  { message: "paymentSchedule is only configurable for SME or Individual applications", path: ["paymentSchedule"] },
)
```
Note this is **simpler** than the pure-merge version of this refine (no per-segment value-set check needed, since both segments now accept the same full list) — the scope decision actually reduces validation complexity here, it just shifts the real complexity into Phase 2's derivation logic and Phase 8's UI.

Insert `payment_schedule: body.paymentSchedule`; stop writing to `individual_loan_type`/`schedule_type`.

**Testing**: `create-application.test.mts` — merge the existing MPL/Salary and SME-schedule-type blocks into one, plus new cross-segment cases: `segment: "individual", paymentSchedule: "quarterly"` must now **succeed** (previously would have been meaningless/rejected under the old two-field design), `segment: "seafarer", paymentSchedule: "weekly"` must still fail.

---

### Phase 6 — Borrower self-service (`src/app/api/borrower/applications/reloan/route.ts`)

Same consolidation as Phase 5. `VALID_INDIVIDUAL_LOAN_TYPES`/`VALID_SCHEDULE_TYPES` merge into one `VALID_PAYMENT_SCHEDULES` set of 8; the segment-gated "required for individual+no-collateral" check simplifies to "required (defaults to monthly) for sme or individual, forced to monthly for seafarer" — matching Phase 5's simplified refine.

---

### Phase 7 — `src/lib/csa/application.ts`

One-line change: `select()` swaps `individual_loan_type, schedule_type` for `payment_schedule`.

---

### Phase 8 — UI: one single dropdown, same 8 options, for both segments

**`src/app/csa/applications/new/page.tsx`** and **`src/app/borrower/page.tsx`**: the two separately-gated pickers collapse into one, shown whenever `segment === "sme" || segment === "individual"`, with the **same full option list both times** (no more segment-conditional option filtering):
```tsx
{(segment === "sme" || segment === "individual") && (
  <div>
    <Label htmlFor="paymentSchedule">Loan schedule</Label>
    <Select id="paymentSchedule" value={paymentSchedule} onChange={...}>
      <option value="monthly">Regular (Monthly)</option>
      <option value="mpl">MPL (Multi-Purpose Loan)</option>
      <option value="salary">Salary</option>
      <option value="weekly">Invoice Financing (Weekly)</option>
      <option value="bi_monthly">Bi-monthly (every 15 days)</option>
      <option value="quarterly">Quarterly</option>
      <option value="two_monthly">Two-monthly</option>
      <option value="daily">Daily</option>
    </Select>
  </div>
)}
```
One state variable replaces the two.

**`src/components/csa/ComputationPanel.tsx`**: the `segment === "sme"` gate around the "Loan schedule" dropdown widens to `segment === "sme" || segment === "individual"`, option list becomes the same full 8-item list unconditionally (no more branching by segment). This is what actually delivers Phase 3/4's expanded access to a human, for both CSA and Committee.

**Testing**: manual walkthrough covering the genuinely new combinations — create an Individual application, pick Quarterly, confirm it computes correctly (dual-line, term-divisibility enforced) and reaches PDC/AR the same way an SME Quarterly loan does; create an SME application, pick MPL, confirm it behaves identically to SME+Regular.

---

### Phase 9 — Cleanup (separate migration, later, after Phase 1–8 verified stable in production)

```sql
ALTER TABLE loan_applications DROP CONSTRAINT loan_applications_individual_loan_type_check;
ALTER TABLE loan_applications DROP CONSTRAINT loan_applications_schedule_type_check;
ALTER TABLE loan_applications DROP CONSTRAINT loan_applications_schedule_type_sme_only;
ALTER TABLE loan_applications DROP COLUMN individual_loan_type;
ALTER TABLE loan_applications DROP COLUMN schedule_type;
```
Run a final repo-wide grep for `individual_loan_type`/`individualLoanType`/`schedule_type`/`scheduleType` (excluding this plan doc and the superseded `loan-schedule-type-redesign-plan.md`) before this ships — should return zero hits.

---

## Part 3: Explicit Constraints — What NOT to Touch

- **`sme.ts`, `sf.ts`, `invoice.ts`, `daily.ts`, `schedule.ts`'s generators, `discount-units.ts`, `ar/masterlist.ts`, `lra/release-service.ts`, the LRA page's `buildPdcRows`** — none read `individual_loan_type`/`schedule_type` directly, none should be touched. All consume `computations.payment_frequency`, whose 7-value vocabulary is explicitly preserved (Part 1's guardrail) — this holds regardless of the (b) scope decision, since the translation still funnels through `persistComputation` the same way.
- **`collateral_type`, `entity_type`** — untouched. Auto/REM routing (`resolveComputationEngine`) stays keyed on `collateral_type` alone, fully independent of `payment_schedule` — an Individual loan can now be, e.g., Car-Refinancing + Quarterly, and both facts are honored independently (net-method math from collateral, quarterly dual-line schedule from payment_schedule).
- **`segment` itself** — Seafarer is deliberately excluded from this expansion; don't add a picker for it.
- **Document generation, CIG, reports, checklists** — confirmed zero references via repo-wide grep.
- **`computations.payment_frequency`'s CHECK constraint** — stays at exactly 7 values. Never add `mpl`/`salary` to it.
- **Phase 9 must not ship in the same migration/deploy as Phase 1.**

## Open Question Requiring Confirmation Before Phase 2/8 Ship

**Should "MPL" remain a visible, separate option from "Regular (Monthly)" once both segments can pick either?** As planned, `mpl` and `monthly` produce byte-identical computation output (same date rule, same `payment_frequency: "monthly"`) — the only difference is the label shown in the dropdown. Two ways to resolve this:
1. **Keep both as separate options** (as written above) — lets CSA/Committee record *why* a loan is monthly (an intentional MPL product pick vs. just "regular"), even though the math is identical. Slightly more UI surface, no functional cost.
2. **Drop `mpl` as a distinct value**, let `monthly` cover both meanings — simpler dropdown, but loses the ability to see "this was specifically an MPL loan" later (e.g. in reports).

Plan as written keeps them separate (option 1) since it's the lower-risk default (preserves today's exact labeling for existing MPL loans) — flag if option 2 is preferred instead.
