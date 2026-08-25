# Deduction Breakdown Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Make the itemized Other Loan/Offset breakdown (account numbers, amounts, offset months) visible everywhere a computation is shown — CSA's own computed-result view, Committee's live editable view, the borrower's application page, and the Final Computation Sheet PDF — instead of only in CSA's edit form and Committee's one read-only card.

**Why this is needed:** Audited directly — `computation.lineItems` (what's actually stored and rendered almost everywhere) collapses every deduction into a single line: `"Other Deductions — ₱X"`. No account names, no per-entry split, anywhere except two custom-built views. The borrower's own page shows no deduction breakdown at all (lumped or itemized), and no generated document references it.

**Architecture:**
- **New pure display helper**, `src/lib/computation/deduction-breakdown.ts` — converts `OtherDeductions` (array-first, legacy-scalar-fallback, same pattern as the calculation engines) into `{ label, amount }` rows. Display-only, no money math, safe to add without touching `sf.ts`/`sme.ts`.
- **No schema/migration changes** — same JSONB, same stored shape.
- **Final Computation Sheet needs no template change** — `computationRows` is already a generic repeating-row array (`label`/`original`/`renegotiated`) rendered by the template; appending more rows to that array is enough. Confirmed via `src/lib/documents/templates/fields.ts:278-285`.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript.

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
- `src/lib/computation/sf.ts` / `sme.ts` — this plan is display-only; if a task seems to need touching these, STOP, that's scope creep.
- `src/lib/ar/*`, `src/lib/lra/*`, `src/lib/cig/*`
- Any database schema or migration files
- `src/lib/documents/templates/fields.ts` schema itself (the field catalog) — `computationRows` already supports arbitrary rows; do not add a new field group for this.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Itemized, not lumped** | Wherever a deduction breakdown renders, each Other Loan/Offset entry gets its own row: `Other Loan (AN300002) — ₱50,000.00`, `Offset (AN300005 · 2 mos) — ₱8,500.80`. Falls back to a single generic row for older computations stored before multi-loan support (no `otherLoans[]`/`offsets[]`, only the legacy scalar). |
| 2 | **CSA's own result view gets fixed too** | Not just Committee's card — CSA (and Committee's live panel, since they share `ComputationPanel`) currently show the single lumped line even after computing. This becomes itemized in the same component. |
| 3 | **Borrower sees it** | The borrower's application detail page gains a deduction breakdown section (it currently shows none at all — not even the lumped total) so they can see why net proceeds were reduced. |
| 4 | **Final Computation Sheet gets the rows** | The PDF's computation table gains one row per deduction entry, for both the original and (if renegotiated) the renegotiated computation — same column layout it already has. |

---

## Phase 1: Shared Breakdown Helper

### Scope
One pure function, reusable by every consumer in later phases.

### Allow List
- `src/lib/computation/deduction-breakdown.ts` (new file)
- `src/lib/computation/__tests__/deduction-breakdown.test.mts` (new file)

### Tasks
- [x] Create `buildDeductionBreakdownRows(od: OtherDeductions | null | undefined): Array<{ label: string; amount: number }>`:
  - Prefer `otherLoans[]`/`offsets[]` when non-empty (same "array wins" rule as the calculation engines); fall back to the legacy singular fields when arrays are absent.
  - Label format: `Other Loan (ACCT)` / `Other Loan` (no account), `Offset (ACCT · N mos)` / `Offset (ACCT)` / `Offset`.
  - Also emit rows for `advancePayment`, `previousLoanBalance`, `accountOpening` when non-zero (labeled plainly — these are already-lumped scalar-only fields with no per-account concept).
  - Skip zero/undefined amounts entirely (no empty rows).

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged (13 pre-existing, unrelated).
- [x] Unit tests: empty/null input → `[]`; legacy scalar only → 1 row per populated field; multi-entry arrays → 1 row per entry with correct label; array + legacy scalar both present → array wins (matches the engines' rule).
- [x] `npm run test` — 0 failures.

---

## Phase 2: CSA / Committee — Itemize the Computed Result

### Scope
Replace the single lumped "Other Deductions" line in `ComputationPanel`'s computed-result view with itemized rows, sourced from the new helper. This is the shared component, so the fix applies to CSA and to Committee's live editable view identically.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] In the `breakdown` rendering (the "out" column line items), when the row key is `other_deductions` and `buildDeductionBreakdownRows(computation.otherDeductions)` returns entries, render those entries in place of the single lumped row instead of the stored `lineItems` value for that key. Keep the lumped row as-is when the helper returns nothing itemizable (falls back gracefully for pre-multi-loan computations, or when there simply are no deductions — though then the row wouldn't render at all per existing behavior for a zero amount).
- [x] No change to `buildComputationSteps`'s formula text (the "Total deductions" line) — that stays a single summary number, this phase only affects the itemized line-item list.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [ ] Manually confirm (code read-through, since this needs a live computation with multi-loan deductions to see rendered): a computation with 2 Other Loan entries + 1 Offset entry produces 3 separate rows instead of 1 lumped row, in both CSA's and Committee's (live-panel) computed view.

---

## Phase 3: Borrower's Application Page — Add the Breakdown

### Scope
Surface the deduction breakdown (itemized where possible) on the borrower's own application detail page, which currently shows no deduction information at all.

### Allow List
- `src/app/api/borrower/applications/[id]/route.ts` (confirm/extend the computation payload to include `otherDeductions` — check first whether it's already selected before assuming a change is needed)
- `src/app/borrower/applications/[id]/page.tsx`

### Tasks
- [x] Confirm whether the borrower application detail API already returns `otherDeductions` on the computation object; if not, add it (read-only, no RLS concern since a borrower already has access to their own computation row).
- [x] On the borrower page, add a small breakdown section near wherever `netReleased`/`monthlyAmortization` currently render: list each `buildDeductionBreakdownRows(computation.otherDeductions)` entry, only when the list is non-empty (don't add an empty "Deductions" heading when there are none).
- [x] Keep the account-number labels as-is (`Other Loan (AN300002)`) — the borrower already knows their own other account numbers from their own portal, this isn't exposing anything new to them.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [x] Confirm the section only appears when deductions exist, and is absent for a plain computation with none.

---

## Phase 4: Final Computation Sheet — Add the Rows

### Scope
Append deduction rows to the PDF's existing `computationRows` table, for both original and renegotiated computations.

### Allow List
- `src/lib/documents/generators/final-computation-sheet.ts`

### Tasks
- [x] In `toFigures`/`buildFinalComputationRows` (or the call site that assembles `context.computationRows`), after the existing fixed rows, append `buildDeductionBreakdownRows(original.otherDeductions)` rows into the `original` column and — when a renegotiated computation exists — `buildDeductionBreakdownRows(renegotiated.otherDeductions)` into the `renegotiated` column, matched by label the same way the existing rows are (a deduction present only in one version renders blank in the other's column, consistent with how this table already handles a value existing in only one version).
- [x] `mapComputationRow` (in `src/lib/csa/computation.ts`, already reused here — do not modify it) already returns `otherDeductions` — confirm this before adding any new query/field.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [x] `buildFinalComputationRows` unit test (extend the existing test file if one exists, else add one under `src/lib/documents/generators/__tests__/`): a computation with 2 Other Loan entries produces 2 extra rows in `computationRows` with the right labels/amounts.

---

## Phase 5: Automated Test Sweep & Regression Check

### Scope
Full regression pass.

### Allow List
- No source changes — verification only.

### Tasks
- [x] `npx tsc --noEmit` — error count matches the pre-existing baseline exactly.
- [x] `npm run test` — full suite, 0 failures.
- [x] `git diff --stat` — confirm only files on the Allow lists above were touched across all phases.
