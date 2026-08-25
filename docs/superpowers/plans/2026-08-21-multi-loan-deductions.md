# Multi-Loan Deductions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Let CSA target **two or more** active loan accounts within the same computation for **Other Loan (full buyout)** and/or **Offset Amount (partial payoff)** — today the system caps out at exactly one account per bucket (`otherLoanAccountNo`, `offsetAccountNo` are singular fields). Extend to arrays, additively, without breaking any computation already stored with the old singular shape.

**Why singular today:** `OtherDeductions` (`src/lib/computation/types.ts`) has one slot per bucket:
```ts
otherLoan?: number; otherLoanAccountNo?: string | null;
offset?: number; offsetAccountNo?: string | null; offsetMonths?: number | null;
```
`sf.ts`/`sme.ts` sum these as plain scalars into `otherDeductionsTotal`. There is no list structure, so a second buyout or a second offset target has nowhere to go — CSA's only workaround today is typing a combined lump sum into one amount field, which loses the per-account transparency Committee relies on.

**Architecture:**
- **Database:** `computations.other_deductions` is `JSONB` — adding array fields requires **NO schema migration**, same as the original deduction-selector plan.
- **Backward compatibility (critical):** Every computation already stored has `otherLoan`/`otherLoanAccountNo`/`offset`/`offsetAccountNo`/`offsetMonths` as scalars, no arrays. The new `otherLoans[]` / `offsets[]` arrays must be **additive** — old records with only the singular fields must compute identically to before. Do this by having the total-calculation prefer the array when present and non-empty, and fall back to the singular scalar otherwise. Never read both and sum them (that would double-count for any record that somehow has both).
- **Computation Engines:** `src/lib/computation/sf.ts` and `sme.ts` are the ones that actually do money math — treat changes here as high-risk. The only change needed is inside `normalizeOtherDeductions`/`otherDeductionsTotal`; the rounding/summation primitives (`sumHalfUp`, `halfUp`) are unchanged and must still be used for every money sum (do not introduce plain `+`/`.reduce` with floats).
- **Design System:** Deep Harbor / Meridian (`var(--navy-900)`, `var(--ink-400)`, `var(--surface-2)`, `var(--teal-700)`, mono typography for numbers), reuse the existing `Modal`/`Checkbox`/`Select`/`Button` components from `@/components/ui`.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Zod, Supabase.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the tests specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `src/lib/ar/*` (Accounting & Masterlist operations)
- `src/lib/lra/*` (Loan Release operations)
- `src/lib/cig/*` (Credit Investigation operations)
- `src/app/borrower/*` (Borrower portal pages — this feature is CSA/Committee-only)
- Any database schema or migration files
- `sumHalfUp` / `halfUp` / other primitives in `src/lib/computation/money.ts`

### Touch With Extreme Care (money math — Phase 2 only, minimal diff)
- `src/lib/computation/sf.ts`
- `src/lib/computation/sme.ts`

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Other Loan — multiple targets** | CSA can add N rows, each picking a distinct active account (auto-filled with its outstanding balance, editable) or a manual "Custom / external" row with no account tied to it. |
| 2 | **Offset — multiple targets** | Inside the existing offset modal, CSA can add N loan blocks; each block gets its own month-checkbox grid (as built in the prior plan) and its own subtotal. |
| 3 | **No double-selection** | A given active account cannot be picked twice within the same bucket (Other Loan or Offset) in one computation — once selected in one row, it's removed from the dropdown options for the other rows in that bucket. An account *can* appear once in Other Loan and once in Offset simultaneously (full-payoff-elsewhere + separate partial-offset-here is a legitimate scenario). |
| 4 | **Storage shape** | `otherDeductions.otherLoans?: Array<{ accountNo: string \| null; amount: number }>` and `otherDeductions.offsets?: Array<{ accountNo: string \| null; amount: number; months: number \| null }>`. Legacy singular fields (`otherLoan`, `otherLoanAccountNo`, `offset`, `offsetAccountNo`, `offsetMonths`) stay in the type for backward reads, but new writes always populate the array (with a single entry if CSA only picks one loan) and leave the legacy scalars at their zero/null defaults. |
| 5 | **Total calc — array wins, no double count** | `otherDeductionsTotal` uses `otherLoans` when non-empty (`sum of amounts`), else falls back to the legacy `otherLoan` scalar. Same pattern for `offsets`/`offset`. Old stored computations (array absent) compute byte-identical totals to before. |
| 6 | **Committee display** | Committee sees one line per array entry: `Other Loan (AN300002) — ₱X`, `Other Loan (AN300005) — ₱Y`, `Offset (AN300002 · 2 mos) — ₱Z`, etc. Falls back to rendering the legacy singular line when arrays are absent (old computations). |

---

## Phase 1: Type & Schema Extension

### Scope
Add the array fields to the shared type and to the API's Zod validation, additively.

### Allow List
- `src/lib/computation/types.ts`
- `src/app/api/csa/applications/[id]/computation/route.ts`

### Tasks
- [x] In `src/lib/computation/types.ts`, extend `OtherDeductions`:
  ```ts
  export type LoanDeductionEntry = {
    accountNo: string | null;
    amount: number;
  };

  export type OffsetDeductionEntry = LoanDeductionEntry & {
    months: number | null;
  };

  export type OtherDeductions = {
    // Legacy singular fields — kept for backward-compat reads of computations
    // stored before multi-loan support. New writes should leave these at
    // their defaults and populate otherLoans/offsets instead.
    otherLoan?: number;
    otherLoanAccountNo?: string | null;
    offset?: number;
    offsetAccountNo?: string | null;
    offsetMonths?: number | null;

    otherLoans?: LoanDeductionEntry[];
    offsets?: OffsetDeductionEntry[];

    advancePayment?: number;
    previousLoanBalance?: number;
    accountOpening?: number;
  };
  ```
- [x] In `route.ts`, extend `computeSchema.otherDeductions` with:
  ```ts
  otherLoans: z.array(z.object({
    accountNo: z.string().nullable(),
    amount: z.number().min(0),
  })).optional(),
  offsets: z.array(z.object({
    accountNo: z.string().nullable(),
    amount: z.number().min(0),
    months: z.number().min(0).nullable(),
  })).optional(),
  ```
  (keep the existing singular fields in the schema unchanged — additive only)

### Verification
- [x] `npx tsc --noEmit` — zero new errors (baseline is 13 pre-existing, unrelated).
- [x] POST a computation with `otherDeductions.otherLoans` populated and confirm the route accepts it (schema doesn't reject).

---

## Phase 2: Calculation Engine — Array-Aware Totals (money math, minimal diff)

### Scope
Make `normalizeOtherDeductions`/`otherDeductionsTotal` in both engines prefer the array when present, else fall back to the legacy scalar. No other math changes.

### Allow List
- `src/lib/computation/sf.ts`
- `src/lib/computation/sme.ts`
- `src/lib/computation/__tests__/*` (add tests)

### Tasks
- [x] In both `sf.ts` and `sme.ts`, update `normalizeOtherDeductions` to also default `otherLoans: other?.otherLoans ?? []` and `offsets: other?.offsets ?? []`.
- [x] Add a small helper (duplicated in both files, matching the existing duplication pattern already in this codebase — do not introduce a new shared module for this):
  ```ts
  function effectiveOtherLoanAmount(other: Required<OtherDeductions>): number {
    return other.otherLoans.length > 0
      ? sumHalfUp(...other.otherLoans.map((e) => e.amount))
      : other.otherLoan;
  }
  function effectiveOffsetAmount(other: Required<OtherDeductions>): number {
    return other.offsets.length > 0
      ? sumHalfUp(...other.offsets.map((e) => e.amount))
      : other.offset;
  }
  ```
- [x] In `otherDeductionsTotal`, replace the direct `other.otherLoan` / `other.offset` references with `effectiveOtherLoanAmount(other)` / `effectiveOffsetAmount(other)`. Every other line (advancePayment, previousLoanBalance, accountOpening) is untouched.
- [x] Do **not** touch `computeFromPrincipal`, `solvePrincipal`, or any NET_SARADO/PRINCIPAL solving logic beyond this substitution — the goal is a single total number in, same as before.

### Verification
- [x] Existing test suites for `sf.ts`/`sme.ts` (whatever `__tests__` currently cover `otherDeductions`) must still pass unmodified — this proves old singular-field records are byte-identical.
- [x] Add new cases: `otherLoans: [{accountNo: "AN1", amount: 5000}, {accountNo: "AN2", amount: 3000}]` → total reflects `8000`; same for `offsets` with 2 entries.
- [x] Add a mixed case: both `otherLoan` (legacy scalar) and `otherLoans` (array) present — array wins, scalar ignored (documents the "array wins" rule so it doesn't regress).
- [x] Run `npm run test` — 0 failures.

---

## Phase 3: CSA Computation Panel — Multi-Loan UI

### Scope
Let CSA add more than one row under "Other Loan," and more than one loan block inside the existing Offset modal (built in the prior deduction-selector plan).

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] Replace the single `otherLoanAccountNo`/`otherLoan` state with an array of rows: `{ accountNo: string; amount: string }[]`, seeded with one empty row.
- [x] "Other Loan" section: each row = account dropdown (excludes accounts already chosen in *other* rows of this same bucket, per Locked Decision #3) + amount input (auto-fills on account pick, stays editable) + a remove-row (×) button. An **"+ Add another loan"** button appends a row (disabled once all active accounts are already used across rows, if any exist — still allow unlimited manual/custom rows).
- [x] In `handleCompute`, build `otherLoans: rows.filter(r => Number(r.amount) > 0).map(r => ({ accountNo: r.accountNo || null, amount: Number(r.amount) }))` and send it instead of the old singular `otherLoan`/`otherLoanAccountNo` (leave those undefined/omitted on new saves).
- [x] Offset modal: change `modalAccountNo` (single) + `modalMonths` (single Set) into a list of blocks: `{ accountNo: string; months: Set<number> }[]`, seeded with one block on open (hydrated from existing `offsets[]` if present). Each block renders its own account dropdown + month checkbox grid + subtotal (reusing the exact per-block layout already built for the single-loan modal). An **"+ Add another loan"** button inside the modal appends a block; a block can be removed.
- [x] Modal footer total sums across all blocks. On Apply, build `offsets: blocks.filter(b => b.months.size > 0).map(b => ({ accountNo: b.accountNo || null, months: b.months.size, amount: monthlyAmort(b.accountNo) * b.months.size }))`.
- [x] Hydration effect (on computation load): if `computation.otherDeductions.otherLoans`/`offsets` arrays are present, hydrate the new row/block state from them; else fall back to seeding a single row/block from the legacy scalar fields (so editing an old computation doesn't lose its data, and re-saving it upgrades it to the array shape).
- [x] Outer summary card (outside the modal) lists each offset block on its own line, e.g. `AN300002 · 2 mos`, `AN300005 · 1 mo`, with a combined total.

### Verification
- [ ] Open CSA Computation Panel on a borrower with 2+ active loans.
- [ ] Add two "Other Loan" rows targeting different accounts — amounts auto-fill, total deduction reflects both.
- [ ] Open the Offset modal, add a second loan block, check different months in each, Apply — outer summary shows both, amount field reflects the combined total.
- [ ] Reload the page — both rows/blocks rehydrate correctly.
- [ ] Confirm you cannot pick the same account twice within "Other Loan" rows, nor within Offset blocks.

---

## Phase 4: Committee Application View — Multi-Loan Transparency

### Scope
Render one line per array entry instead of the single line built in the prior plan; fall back to the old singular line for pre-existing computations that have no arrays.

### Allow List
- `src/app/committee/applications/[id]/page.tsx`

### Tasks
- [x] Where the computation card currently renders one "Other Loan" row and one "Offset amount" row, switch to: if `otherDeductions.otherLoans?.length`, `.map()` one row per entry (`Other Loan (AN300002)` / amount); else fall back to the existing single-row rendering keyed off the legacy scalar fields.
- [x] Same pattern for `offsets[]` vs the legacy `offset`/`offsetAccountNo`/`offsetMonths` single row.

### Verification
- [ ] Open Committee review on an application computed with 2 Other Loan rows + 2 Offset blocks (from Phase 3's test) — verify 4 distinct lines render with correct account numbers/months/amounts.
- [ ] Open Committee review on an older application (pre-existing computation, singular fields only) — verify it still renders exactly as it did before this plan (no blank/broken rows).

---

## Phase 5: Automated Test Sweep & Regression Check

### Scope
Full regression pass across the touched modules plus the wider suite, to confirm zero out-of-scope breakage.

### Allow List
- No source changes in this phase — verification only. Add missing tests only if a Phase above left a gap.

### Tasks
- [x] `npx tsc --noEmit` — error count must match the pre-existing baseline (currently 13, all unrelated `.test.mts` files) — zero new errors.
- [x] `npm run test` — full suite, 0 failures.
- [x] `git diff --stat` — confirm only files on the Allow lists above were touched.

---

## Open Question To Confirm With User Before Phase 3

Should the "remove old singular fields entirely" cleanup ever happen, or do they stay forever for backward-compat reads? Recommendation: keep them permanently in the type (cheap) — do not attempt a data migration to backfill `otherLoans`/`offsets` on old rows; the fallback-rendering logic in Phase 2 and Phase 4 makes that unnecessary.
