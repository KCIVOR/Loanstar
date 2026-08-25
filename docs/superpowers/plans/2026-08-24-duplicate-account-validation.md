# Duplicate Account Validation Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Fix known-issue **#5** from `2026-08-21-internal-transfer-known-issues.md`: the CSA/Committee UI already prevents picking the same account twice within "Other Loan" rows or within "Offset" blocks, but that's a UI-only rule — the API itself accepts a request with the same account number listed twice in `otherLoans[]`/`offsets[]`. Low risk (requires bypassing the UI entirely), but worth closing since it's a one-line gap in an otherwise-validated schema.

---

## Audit — exact gap, confirmed against live code

1. **Both API routes that accept `otherDeductions` share the identical zod shape, inline, with zero duplicate check**: `src/app/api/csa/applications/[id]/computation/route.ts:29-57` (`computeSchema`) and `src/app/api/committee/applications/[id]/override/route.ts:22-50` (`overrideSchema`). Both validate `otherLoans`/`offsets` as plain arrays of `{ accountNo, amount, (months) }` with no cross-entry check.
2. **The UI-side prevention is bucket-scoped, confirmed in `src/components/csa/ComputationPanel.tsx:611-616`**: each "Other Loan" row's account dropdown is built from `activeLoans.filter((l) => l.loanAccountNo === row.accountNo || !usedOtherLoanAccounts.has(l.loanAccountNo))` — i.e. an account already picked in *another* Other Loan row is excluded from this row's options, but nothing stops the same account appearing in both an Other Loan row and an Offset block (cross-bucket is allowed today, and this plan does not change that). This same `ComputationPanel` component is shared by both CSA and Committee (`src/app/committee/applications/[id]/page.tsx`), so the UI rule already applies identically to both — the server-side fix in this plan should match that exact scope: **no duplicates within `otherLoans[]`, no duplicates within `offsets[]`, cross-bucket untouched.**
3. **No existing shared schema module** — the `otherDeductions` zod object is duplicated inline in both route files (pre-existing duplication, not introduced by this plan). Rather than extracting the whole schema (bigger diff than needed), this plan adds one small, testable, exported pure helper (`findDuplicateAccountNos`) to `src/lib/computation/deduction-breakdown.ts` — already the established home for `otherLoans`/`offsets` array logic (`buildDeductionBreakdownRows`, `extractDeductionTargets` both live there) — and calls it from a `.superRefine()` added to each route's existing schema. This keeps the actual validation *logic* in one tested place while leaving the pre-existing schema-shape duplication alone (out of scope to refactor here).

---

## Architecture

- **`src/lib/computation/deduction-breakdown.ts`**: add `findDuplicateAccountNos(entries: Array<{ accountNo: string | null }> | undefined): string[]` — pure, returns the distinct `accountNo` values that appear more than once (null/unset entries are never considered duplicates of each other or of anything else).
- **Both route schemas**: add `.superRefine((val, ctx) => { ... })` to the `otherDeductions` object (before its trailing `.optional()`), calling `findDuplicateAccountNos` separately on `val.otherLoans` and `val.offsets`, adding a `ctx.addIssue` (with a path pointing at the relevant array) for each bucket that has a duplicate. Both routes already catch `z.ZodError` and return `{ error: error.message }` at 400 — no new error-handling code needed, this reuses the exact existing path.
- **No database changes, no frontend changes** — the UI already prevents this in normal use; this closes the API-level gap for anyone bypassing it.

---

## Ground Rules

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- Check `git diff --stat` after implementation — only Allow-listed files touched.
- **Do not commit** unless the user explicitly requests.
- No database changes in this plan — no migration confirmation gate needed.

---

## Hard Constraints

### Never Modify
- `src/components/csa/ComputationPanel.tsx` — the existing UI-side prevention (`usedOtherLoanAccounts`/equivalent) stays exactly as-is; this plan only adds a server-side backstop, not a UI change.
- Cross-bucket behavior — an account appearing in both `otherLoans[]` and `offsets[]` simultaneously must remain allowed (matches current UI behavior exactly; not this plan's problem to solve).
- `src/lib/negotiation/service.ts`, `src/lib/csa/computation.ts` — the functions that actually persist the computation are untouched; this is purely a request-validation addition sitting in front of them.
- The legacy singular fields (`otherLoan`/`otherLoanAccountNo`/`offset`/`offsetAccountNo`) — no duplicate check applies to them (there's only ever one of each, duplication is structurally impossible).

---

## Phase 1: Duplicate-Check Helper + Wire Into Both Routes

### Scope
One pure helper function, plus a `.superRefine()` call added to each of the two existing zod schemas.

### Allow List
- `src/lib/computation/deduction-breakdown.ts`
- `src/lib/computation/__tests__/deduction-breakdown.test.mts`
- `src/app/api/csa/applications/[id]/computation/route.ts`
- `src/app/api/committee/applications/[id]/override/route.ts`

### Tasks
- [x] Add `findDuplicateAccountNos` to `deduction-breakdown.ts`.
- [x] Add unit tests for `findDuplicateAccountNos` to the existing test file: no entries → `[]`; all-unique → `[]`; one repeated accountNo → `[thatAccountNo]`; multiple `null` accountNos → `[]` (nulls never collide); a duplicate alongside unrelated unique entries → only the duplicate returned. Matched the file's existing flat `test()` style (not `describe`/`it`).
- [x] Add `.superRefine()` to `computeSchema`'s `otherDeductions` object (CSA route) calling `findDuplicateAccountNos` on both `otherLoans` and `offsets`, issuing a clear message per bucket.
- [x] Add the identical `.superRefine()` to `overrideSchema`'s `otherDeductions` object (Committee route) — confirmed byte-for-byte identical to the CSA route's block via `diff`.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in the four touched files.
- [x] `npm run test` — 1340 passed (1335 + 5 new), 0 failures.
- [x] Lint — clean on all four touched files.
- [x] Live check: browser/dev-server tooling failed the same way it has all session (server starts, tab loses connection on navigate) — fell back to the plan's disclosed alternative: reconstructed the exact schema shape from a throwaway script importing the **real, actual exported** `findDuplicateAccountNos` (not a hand-rewritten copy) and exercised it against 5 scenarios: duplicate in `otherLoans` rejected, duplicate in `offsets` rejected, the same account across *both* buckets simultaneously allowed (confirms cross-bucket is correctly untouched), an all-unique payload passes, `otherDeductions` omitted entirely passes. All 5 passed.
  - **Note surfaced during this check, not a defect**: zod v4's `ZodError.message` is a JSON-stringified array of issues (pretty-printed), not a plain sentence — confirmed by parsing it back with `JSON.parse` to check the actual issue text. This means the new duplicate-account error, like every other existing validation error on this same schema (e.g. "amount must be positive"), surfaces to the frontend as that same nested-JSON string via the existing `{ error: error.message }` response shape — a pre-existing characteristic of this schema's error handling, not something this plan changes or is in scope to fix (Hard Constraint: no changes to error-handling code).
- [x] `git diff --stat` — only the four Allow-listed files touched.
- [x] Update `2026-08-21-internal-transfer-known-issues.md` — check off **#5**.
