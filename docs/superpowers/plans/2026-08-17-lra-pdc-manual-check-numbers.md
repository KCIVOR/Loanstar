# LRA PDC Manual Check Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let LRA staff manually enter a check number and bank/branch for every generated PDC schedule row.

**Architecture:** Preserve the current schedule derivation and persistence flow. Add a client-side draft grid on the existing LRA detail page, tighten the existing API schema, and defensively validate/trim rows inside `savePdcChecks`; do not touch any other release, document, DCRR, or posting logic.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase, Node test runner.

---

## Scope gate

Only edit the files explicitly allowed by §6.1 of `docs/superpowers/specs/2026-08-17-lra-pdc-manual-check-numbers-design.md`. If another file appears necessary, stop and ask.

### Task 1: Service validation (TDD)

**Files:**
- Modify: `src/lib/lra/__tests__/release-service.test.mts`
- Modify: `src/lib/lra/release-service.ts` (`savePdcChecks` only)

- [x] Add tests proving a blank/missing check number and blank bank/branch are rejected before deletion/insertion.
- [x] Add a test proving complete rows are trimmed before insertion.
- [x] Run `node --import tsx --test src/lib/lra/__tests__/release-service.test.mts` and confirm the new tests fail for the expected reason.
- [x] Add minimal validation and normalization inside `savePdcChecks`, preserving term-count and amount checks.
- [x] Re-run the focused test and confirm it passes.

### Task 2: API input contract

**Files:**
- Modify: `src/app/api/lra/applications/[id]/pdc/route.ts`

- [x] Change `checks[].checkNumber` to a required trimmed non-empty string.
- [x] Change `checks[].bankName` to trimmed non-empty validation.
- [x] Do not alter permission, release-file lookup, audit, or response behavior.

### Task 3: LRA PDC draft grid

**Files:**
- Modify: `src/app/lra/applications/[id]/page.tsx` (PDC encoding state/form/table only)

- [x] Add a local typed draft-row state containing `checkNumber`, `checkDate`, `bankName`, and `amount`.
- [x] Replace first-number/shared-bank submission with a “Build schedule” action that derives dates and amounts and creates editable blank check/bank rows.
- [x] Render the editable table `# | Check no. | Date | Bank/Branch | Amount`; keep Date and Amount read-only.
- [x] Validate all check numbers and bank/branches client-side before POST.
- [x] Submit the draft rows unchanged except for trimming user text.
- [x] Rename the saved schedule header from `Bank` to `Bank/Branch`.
- [x] Leave ATM, path selection, documents, signing, physical collection, release, and close sections unchanged.

### Task 4: Verification

**Files:** no additional files.

- [x] Run the focused LRA service test.
- [x] Run `npm test`.
- [x] Run ESLint on the four implementation files and distinguish pre-existing diagnostics from introduced ones.
- [x] Run `git diff --check`.
- [x] Search the diff to confirm only allowlisted files changed for this implementation.
- [x] Search the LRA page to confirm the PDC schedule header reads `Bank/Branch`.

