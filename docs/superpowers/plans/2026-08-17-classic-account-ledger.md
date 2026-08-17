# Classic Account Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a shared chronological passbook ledger on AR, Borrower, and Remedial per-account pages without changing posting, DCRR, or payment write paths.

**Architecture:** Pure `buildAccountLedgerRows` + display-only `AccountLedger`. Pages adapt existing data; actions (write-off, proof submit, record payment) stay outside the shared table.

**Tech Stack:** Next.js/React, TypeScript, Node test runner.

---

### Task 1: Pure builder (TDD)

**Files:**
- Create: `src/lib/ledger/build-account-ledger-rows.ts`
- Create: `src/lib/ledger/format.ts`
- Create: `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts`

- [ ] Write failing tests for opening, chronological posted credits, schedule join, excluding non-posted, totals.
- [ ] Implement minimal builder + format helpers.
- [ ] Confirm tests pass.

### Task 2: Display component

**Files:**
- Create: `src/components/ledger/AccountLedger.tsx`

- [ ] Render classic columns with `Table`/`Th`/`Td`, compact scroll, report total footer.
- [ ] No buttons or fetches.

### Task 3: Wire AR + Borrower + Remedial

**Files:**
- Modify: `src/app/ar/masterlist/[id]/page.tsx`
- Modify: `src/components/borrower/LoanActivePanel.tsx`
- Modify: `src/app/remedial/accounts/[id]/page.tsx`
- Modify (if needed): `src/app/api/remedial/accounts/[id]/route.ts` only — raise payment limit; add postings via existing safe patterns (no RLS migration without ask)

- [ ] Replace amortization tables with `AccountLedger`.
- [ ] Keep write-off / proof form / Record Payment outside.
- [ ] Borrower payment history timeline remains for pending proofs.

### Task 4: Verify

- [ ] `node --import tsx --test src/lib/ledger/__tests__/build-account-ledger-rows.test.mts`
- [ ] `npm test`
- [ ] Confirm diff only touches allowlisted files for this feature.
