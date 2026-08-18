# Payment Uploader Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show payment recorder attribution on Collector, Remedial, and borrower payment-history lists without exposing staff names to borrowers.

**Architecture:** Reuse the existing Collector payment API profile resolution. Add equivalent scoped resolution to the Remedial API, and add only a staff-origin boolean to the borrower API. Render attribution beside each payment’s existing metadata.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Node test runner

---

### Task 1: Add failing attribution regression tests

**Files:**
- Create: `src/lib/collector/__tests__/payment-uploader-display.test.mts`

- [ ] Assert Collector History consumes `uploadedByName` and renders `Recorded by`.
- [ ] Assert Remedial API/UI return and render `uploadedByName`.
- [ ] Assert borrower API/UI use `uploadedByStaff` and render only `Recorded by Loanstar staff`.
- [ ] Run `npx tsx --test src/lib/collector/__tests__/payment-uploader-display.test.mts` and confirm failure because the displays are absent.

### Task 2: Implement internal staff-name attribution

**Files:**
- Modify: `src/app/collector/history/page.tsx`
- Modify: `src/app/api/remedial/accounts/[id]/route.ts`
- Modify: `src/app/remedial/accounts/[id]/page.tsx`

- [ ] Add `uploadedByName` to payment response/UI types.
- [ ] Resolve uploader profile names in the Remedial API after assignment authorization.
- [ ] Render `Recorded by {uploadedByName}` under payment metadata.
- [ ] Run the focused test and confirm only borrower assertions remain failing.

### Task 3: Implement borrower-safe attribution

**Files:**
- Modify: `src/app/api/borrower/applications/[id]/loan/route.ts`
- Modify: `src/components/borrower/LoanActivePanel.tsx`

- [ ] Map borrower payment rows to include `uploadedByStaff: uploaded_by !== authenticated borrower user id`.
- [ ] Do not return staff names or profiles to the borrower.
- [ ] Render `Recorded by Loanstar staff` only for staff-recorded payments.
- [ ] Run the focused test and confirm it passes.

### Task 4: Verify

- [ ] Run focused tests.
- [ ] Run ESLint on changed source files.
- [ ] Run the full test suite.
- [ ] Report files changed and manual testing steps without committing.
