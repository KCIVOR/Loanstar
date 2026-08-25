# Offset Amount & Other Loan Deductions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Enable CSA to input "Offset Amount" (partial payoff of an existing loan) and "Other Loan" (full buyout/payoff of previous loan) in the initial computation calculator, have the engine automatically factor them into net proceeds and principal solving, and display them in the final computation view for Committee review.

**Architecture:** 
- **Database:** `computations` table already stores `other_deductions` (`JSONB`) and `other_deductions_total` (`NUMERIC`). **NO schema migrations.**
- **Computation Engine:** `src/lib/computation/sf.ts` and `src/lib/computation/sme.ts` already support `otherDeductions: { otherLoan, offset, advancePayment, accountOpening }`. **NO calculation engine rewrites.**
- **API Layer:** `POST /api/csa/applications/[id]/computation` already validates `otherDeductions` in its Zod schema.
- **Scope:** Add input fields in CSA Computation Panel, persist them through the API, and expose the persisted deduction details in the Committee detail API and UI view.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Supabase.

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
- `src/lib/computation/sf.ts` (Engine math is already verified against Excel specification)
- `src/lib/computation/sme.ts`
- `src/lib/computation/types.ts`
- `src/lib/ar/*` (Accounting & Masterlist logic)
- `src/lib/lra/*` (Loan Release & Accounting logic)
- `src/lib/cig/*` (Credit Investigation logic)
- `src/app/borrower/*` (Borrower portal pages)
- Any Supabase migrations / database schema

---

## Locked Product Decisions (Audit Findings)

| # | Decision |
|---|---|
| 1 | **Manual Amount Input:** CSA enters raw peso amounts for "Offset Amount" and "Other Loan" (exact match to Excel `SEAMAN (offset)` cells `F12` and `F16`). |
| 2 | **Non-Negative Numbers:** Values must be $\ge 0$. If empty or zero, omitted or sent as `0`. |
| 3 | **Automatic Math:** In `NET_SARADO` mode, the engine automatically calculates the gross Principal required to ensure Net Released matches the requested amount after subtracting these deductions. |
| 4 | **Committee Read-Only:** Committee views the finalized breakdown (Principal, Total Deductions, Net Released, Line Items including Offset Amount and Other Loan). Committee does not need an independent recalculator route. |

---

## Phase 1: CSA Computation Panel — Input Fields & Persistence

### Scope
Add editable input fields for **Offset Amount** and **Other Loan** to the CSA Computation Panel, hydrate them from saved computations, and pass them in the calculation POST request.

### Allow List
- `src/components/csa/ComputationPanel.tsx`
- `src/lib/csa/computation.ts` (only if typing/mapping updates needed)

### Tasks
- [ ] In `ComputationPanel.tsx`:
  - Add state variables: `const [offsetAmount, setOffsetAmount] = useState("")` and `const [otherLoan, setOtherLoan] = useState("")`.
  - Update `Computation` type definition to include `otherDeductions?: { otherLoan?: number; offset?: number; advancePayment?: number; accountOpening?: number }`.
  - In the hydration `useEffect` (when `computation` is loaded), hydrate `setOffsetAmount` and `setOtherLoan` from `computation.otherDeductions`.
  - In `handleCompute`, add `otherDeductions` to the `POST /api/csa/applications/[id]/computation` body:
    ```ts
    otherDeductions: {
      offset: Number(offsetAmount) || 0,
      otherLoan: Number(otherLoan) || 0,
    }
    ```
  - In the UI form, render an "Other Deductions (Optional)" section with:
    - **Other Loan / Buyout (₱)**: Input with helper text *"Full payoff of previous loan"*
    - **Offset Amount (₱)**: Input with helper text *"Partial month(s) payoff of previous loan"*
  - Ensure inputs use standard `mono` styling and currency prefix `₱`.

### Verification
- [ ] Open CSA application (`/csa/applications/[id]`).
- [ ] Enter `10000` in Offset Amount, click **Compute**.
- [ ] Verify Net Released accounts for the ₱10,000 offset.
- [ ] Refresh page; verify input fields retain `10000`.

---

## Phase 2: Committee Application View — Deduction Breakdown

### Scope
Expose the persisted `otherDeductions` and line items in the Committee Application GET API and display them in the Committee review panel.

### Allow List
- `src/app/api/committee/applications/[id]/route.ts`
- `src/app/committee/applications/[id]/page.tsx`

### Tasks
- [ ] In `src/app/api/committee/applications/[id]/route.ts`:
  - In the `computation` object of the JSON response, include:
    ```ts
    otherDeductions: computation.otherDeductions ?? null,
    otherDeductionsTotal: computation.otherDeductionsTotal ?? 0,
    ```
- [ ] In `src/app/committee/applications/[id]/page.tsx`:
  - Update `CommitteeDetail.computation` type to include `otherDeductions` and `otherDeductionsTotal`.
  - In the Computation summary / breakdown card:
    - Display **Other Loan** line item if `computation.otherDeductions?.otherLoan > 0`.
    - Display **Offset Amount** line item if `computation.otherDeductions?.offset > 0`.
    - Ensure `lineItems` or deduction summary clearly displays these amounts to voting members.

### Verification
- [ ] Open Committee page for the application (`/committee/applications/[id]`).
- [ ] Verify the computation card displays the Offset Amount / Other Loan breakdown.
- [ ] Verify formatting matches Philippine Peso (`₱X,XXX.XX`).

---

## Phase 3: Final Verification & Regression Sweep

### Scope
Verify end-to-end integration and run all automated test suites to ensure no regressions in other modules.

### Allow List
- None (Verification & test execution only)

### Tasks
- [ ] Run existing test suite:
  ```bash
  npx tsx --test src/lib/borrowers/__tests__/reloan.test.mts src/lib/borrowers/__tests__/home.test.mts src/lib/borrowers/__tests__/existing-obligations.test.mts src/lib/csa/__tests__/sme-duplication.test.mts
  ```
- [ ] Check `git diff --stat` to guarantee zero unintended modifications outside Allow lists.
- [ ] Verify both `NET_SARADO` and `PRINCIPAL` computation modes with non-zero offset/other loan.
