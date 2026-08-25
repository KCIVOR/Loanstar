# Active Loans Deduction Selector Implementation Plan (Option C: Select & Customize)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Enable CSA to view a borrower's active loan accounts directly within the Computation Panel, select a target loan for **Other Loan (Full Buyout)** or **Offset Amount (Partial Payoff)** to auto-fill/calculate amounts, while keeping amounts **100% editable** for custom adjustments. Expose target loan account numbers to Committee in the final computation breakdown.

**Architecture:**
- **Database:** `computations.other_deductions` is already `JSONB`. Storing `otherLoanAccountNo`, `offsetAccountNo`, and `offsetMonths` requires **NO schema migrations**.
- **Data Source:** Active loan accounts are read from `masterlist` table where `borrower_id` matches and `account_status = 'active'`.
- **Computation Engines:** `src/lib/computation/sf.ts` and `sme.ts` consume `otherDeductions.otherLoan` and `otherDeductions.offset` directly. Math remains strictly untouched.
- **Design System:** Deep Harbor design system (`var(--navy-900)`, `var(--ink-400)`, `var(--surface-2)`, `var(--teal-700)`, mono typography for numbers, clean select and quick-action chips).

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Zod, Supabase.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run tests specified in each phase.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `src/lib/computation/sf.ts` & `src/lib/computation/sme.ts` (Core calculation engines)
- `src/lib/ar/*` (Accounting & Masterlist operations)
- `src/lib/lra/*` (Loan Release operations)
- `src/lib/cig/*` (Credit Investigation operations)
- `src/app/borrower/*` (Borrower portal pages)
- Any database schema or migration files

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Active Loan Fetching** | The computation endpoint `GET /api/csa/applications/[id]/computation` fetches active accounts for the borrower (`account_status = 'active'`) from `masterlist`. |
| 2 | **Other Loan (Full Buyout)** | Selecting an active loan auto-populates `otherLoan` with `outstanding_balance`. CSA can edit/override the amount freely. |
| 3 | **Offset Amount (Partial)** | Selecting an active loan reveals quick-select month chips (`1 mo`, `2 mos`, `3 mos`, `Custom`). Clicking calculates `months × monthly_amortization`. CSA can edit/override freely. |
| 4 | **Manual / External Entry** | If the borrower has no active loan or CSA wants to enter an external loan buyout, they can choose `None / Custom` and type any amount. |
| 5 | **Metadata Persistence** | `otherLoanAccountNo`, `offsetAccountNo`, and `offsetMonths` are stored in `other_deductions` JSONB and hydrated on reload. |
| 6 | **Committee Display** | Committee sees the target loan account number (e.g. `Other loan / buyout (AN300002)`) and offset months (e.g. `Offset amount (AN300002 · 2 mos)`). |

---

## Phase 1: API & Data Layer — Active Loans Query & Schema Extension

### Scope
Extend the CSA computation route to return the borrower's active loan accounts and allow saving `otherLoanAccountNo`, `offsetAccountNo`, and `offsetMonths` in `otherDeductions`.

### Allow List
- `src/lib/computation/types.ts`
- `src/app/api/csa/applications/[id]/computation/route.ts`

### Tasks
- [ ] In `src/lib/computation/types.ts`:
  - Update `OtherDeductions` type:
    ```ts
    export type OtherDeductions = {
      otherLoan?: number;
      otherLoanAccountNo?: string | null;
      offset?: number;
      offsetAccountNo?: string | null;
      offsetMonths?: number | null;
      advancePayment?: number;
      previousLoanBalance?: number;
      accountOpening?: number;
    };
    ```
- [ ] In `src/app/api/csa/applications/[id]/computation/route.ts`:
  - Update `computeSchema.otherDeductions` to allow `otherLoanAccountNo`, `offsetAccountNo`, `offsetMonths`.
  - In `GET`: Query `masterlist` for the application's `borrower_id` (`account_status = 'active'`) and return `activeLoans: Array<{ loanApplicationId: string; loanAccountNo: string; outstandingBalance: number; monthlyAmortization: number; }>` alongside `computation`.

### Verification
- [ ] Call `GET /api/csa/applications/[id]/computation` and verify `activeLoans` array is returned.

---

## Phase 2: CSA Computation Panel — UI & "Select & Customize" Interaction

### Scope
Render active loan selection dropdowns and quick-select month chips in the CSA Computation Panel, wired to the editable amount inputs and hydration state.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [ ] In `ComputationPanel.tsx`:
  - Add state for `activeLoans` (`Array<{ loanAccountNo: string; outstandingBalance: number; monthlyAmortization: number }>`): fetched on mount or passed from parent.
  - Add state for `selectedOtherLoanAcct` (`string`), `selectedOffsetAcct` (`string`), `selectedOffsetMonths` (`number | null`).
  - Hydrate `selectedOtherLoanAcct`, `selectedOffsetAcct`, and `selectedOffsetMonths` from `computation.otherDeductions`.
  - In "Other Loan / Buyout":
    - Dropdown: Lists active accounts (`AN300002 — ₱45,000.00 balance · ₱5,000/mo`) and `Custom / None`.
    - Selecting an account auto-sets `otherLoan` to `outstandingBalance.toFixed(2)`.
    - Amount input remains fully editable with helper badge indicating source.
  - In "Offset Amount":
    - Dropdown: Lists active accounts (`AN300002 — ₱5,000.00/mo`) and `Custom / None`.
    - When account is selected, render month chips: `[ 1 mo (₱5,000) ]`, `[ 2 mos (₱10,000) ]`, `[ 3 mos (₱15,000) ]`.
    - Clicking a chip multiplies `months × monthly_amortization` into `offsetAmount`.
    - Amount input remains fully editable for custom adjustments.
  - In `handleCompute`, send `otherLoanAccountNo`, `offsetAccountNo`, and `offsetMonths` inside `otherDeductions`.

### Verification
- [ ] Open CSA Computation Panel on an application whose borrower has an active loan.
- [ ] Select active loan under "Other loan / buyout" -> amount auto-fills with balance.
- [ ] Select active loan under "Offset amount" and click "2 mos" -> amount auto-fills with 2 months amort.
- [ ] Click "Compute", refresh page -> ensure selected accounts and amounts remain hydrated.

---

## Phase 3: Committee Application View — Loan Account Transparency

### Scope
Display the target loan account number and offset months in the Committee review panel's computation breakdown.

### Allow List
- `src/app/committee/applications/[id]/page.tsx`

### Tasks
- [ ] In `src/app/committee/applications/[id]/page.tsx`:
  - Update `CommitteeDetail.computation.otherDeductions` type.
  - In the computation card's other deductions section:
    - If `otherLoan > 0`: display `Other loan / buyout` + `(Acct: ${otherLoanAccountNo})` if present.
    - If `offset > 0`: display `Offset amount` + `(Acct: ${offsetAccountNo} · ${offsetMonths} mo${offsetMonths > 1 ? "s" : ""})` if present.

### Verification
- [ ] Open Committee review page for the application.
- [ ] Verify the computation breakdown clearly indicates the targeted loan account numbers and offset months.

---

## Phase 4: Automated Test Sweep & Regression Check

### Scope
Run all automated test suites to ensure zero regressions across all modules.

### Allow List
- `src/lib/borrowers/__tests__/existing-obligations.test.mts` (add tests if needed)

### Tasks
- [ ] Run full test suite:
  ```bash
  npx tsx --test src/lib/borrowers/__tests__/reloan.test.mts src/lib/borrowers/__tests__/home.test.mts src/lib/borrowers/__tests__/existing-obligations.test.mts src/lib/csa/__tests__/sme-duplication.test.mts
  ```
- [ ] Check `git diff --stat` to verify zero out-of-scope edits.
