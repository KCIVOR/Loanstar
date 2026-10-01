# Paid-Off Accounts with Move of Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an account with a zero derived balance to be marked paid off when every live obligation is settled and any replaced Move of Payment installment is marked `moved`.

**Architecture:** Preserve the existing balance formula and all payment-posting behavior; add `moved` only to the existing settled-row classification in the pure eligibility helper, AR progress display, TypeScript settlement check, and its SQL twin. Use one forward migration and regression tests to keep application and database behavior aligned.

**Tech Stack:** Next.js 16, TypeScript, React, Node’s built-in test runner via `tsx`, Supabase/PostgreSQL migrations, ESLint.

---

## UAT source

User report and screenshot supplied on 2026-10-01: the AR details page displays `Outstanding balance ₱0.00`, `Installments paid 6/7`, and a disabled `Mark as paid off` button with `All installments must be paid before marking paid off`. The account had already used Move of Payment.

## Root cause

The Move of Payment writer intentionally marks the selected schedule row `moved` and appends a new `pending` replacement row (`src/lib/ar/move-of-payment.ts:478-484`, `src/lib/ar/move-of-payment.ts:535-572`). The derived balance already excludes `moved` rows (`src/lib/ar/posting.ts:214-217`), but the paid-off helper only treats `paid` and `rolled` as settled (`src/lib/ar/paid-off.ts:43-52`). The page’s progress counter similarly excludes only `rolled` rows from its denominator (`src/app/ar/masterlist/[id]/page.tsx:477-518`), and the database SQL settlement function excludes only `paid` and `rolled` (`supabase/migrations/20260831120000_is_account_fully_settled_function.sql:12-17`). This produces the exact screenshot mismatch: zero balance but one historical moved row blocking closure.

## Approach

1. Add failing unit tests for `moved` as a settled status in the pure helper and settlement checks.
2. Update only the four settlement/progress classification sites.
3. Add a new forward migration replacing the SQL twin with `status not in ('paid', 'rolled', 'moved')`.
4. Verify the focused tests, full suite, lint, build, and read-only migration status before deployment.

## Open questions / unverified live validation

- **UNVERIFIED:** The exact production row statuses and application status for the screenshot account require a read-only Supabase query; no Supabase MCP connection is configured in this session. Verify the account has `outstanding_balance <= 0`, `application.status = 'loan_active'`, and only `paid`, `rolled`, or `moved` schedule rows before applying the migration.
- **UNVERIFIED:** Whether the previously prepared migrations `20261002090000_dcr_items_discount_lines.sql` and `20261002091000_dcr_tables_server_only_writes.sql` have both been applied in production. This plan does not alter or re-run them.

## Live validation — 2026-10-01

No live database was changed or queried during this audit. The application source and migration files were read locally. Before rollout, run read-only checks for the target account’s schedule-status distribution, null statuses, current SQL function definition, and relevant RLS/policy state. Do not include borrower names, payment references, or other personal data in logs or plan output.

## Audit findings

| Boundary | Current behavior | Required behavior | Evidence |
| --- | --- | --- | --- |
| Balance | Excludes `moved` rows | Keep unchanged | `src/lib/ar/posting.ts:204-240` |
| Client paid-off eligibility | Rejects any status other than `paid`/`rolled` | Accept `moved` as settled history | `src/lib/ar/paid-off.ts:43-52` |
| AR progress header | Counts moved history as an unpaid installment | Exclude moved history from denominator | `src/app/ar/masterlist/[id]/page.tsx:477-518` |
| Server settlement status | SQL twin leaves account active if any row is `moved` | Treat moved as settled | `supabase/migrations/20260831120000_is_account_fully_settled_function.sql:12-17`; current replacement function is also used by the latest posting migration |
| Move writer | Marks old row `moved`, creates replacement row | No change | `src/lib/ar/move-of-payment.ts:535-572` |
| Payment posting | Updates balances and schedule rows | No change | `src/lib/ar/posting.ts:1853-2105`; `supabase/migrations/20261002090000_dcr_items_discount_lines.sql:126-136` |

## Scope and constraints

### In scope

- Classifying `moved` as settled historical schedule state for paid-off eligibility.
- Excluding `moved` rows from the AR progress denominator while preserving live replacement rows.
- Updating the TypeScript and PostgreSQL settlement checks together.
- Regression tests for moved-only historical rows, genuinely open rows, zero schedules, and existing rolled behavior.

### Out of scope — do not change

- Payment allocation, DCR posting, surcharge handling, Move of Payment creation/revert, penalties, discounts, rollover rules, or account balance arithmetic.
- Existing applied migrations; use one new forward migration.
- Any direct data repair or manual status update in production.
- RLS policies, permissions, routes, notifications, history, or application-status transitions other than the existing paid-off action.

### Non-negotiable safety constraints

- `moved` is settled only as historical replacement state; a `pending`, `partial`, `overdue`, or unknown/null status must still block paid-off.
- The application must still be `loan_active`, not already `paid_off` or another status.
- The derived outstanding balance must remain `<= 0`.
- Server-side `markPaidOff` validation remains authoritative; client button state is only a mirror.
- The SQL function and TypeScript helper must use the same three settled statuses.

## Contract acceptance table

| Scenario | Expected result |
| --- | --- |
| `loan_active`, balance 0, rows `paid`, `moved` | Allowed |
| `loan_active`, balance 0, rows `paid`, `rolled`, `moved` | Allowed |
| `loan_active`, balance 0, any `pending`, `partial`, `overdue`, null, or unknown row | Rejected with existing installment message |
| Positive balance, even with only settled statuses | Rejected with existing balance message |
| Application already `paid_off` or not `loan_active` | Rejected with existing application-status message |
| No schedule rows and zero balance | Allowed, preserving current behavior |
| Collector/remedial or direct non-staff database write | No new authority; paid-off route and existing AR permission remain unchanged |
| Existing rows created before this migration | Evaluated correctly at the next paid-off attempt; no data rewrite required |
| Future Move of Payment rows | The existing writer continues to create `moved`; all readers now classify it consistently |

## Files

| File | Responsibility |
| --- | --- |
| `src/lib/ar/paid-off.ts` | Add `moved` to the settled-status predicate only |
| `src/app/ar/masterlist/[id]/page.tsx` | Exclude moved historical rows from progress denominator; keep replacement rows visible |
| `src/lib/ar/posting.ts` | Add `moved` to `isAccountFullySettled` TypeScript query predicate |
| `supabase/migrations/20261002092000_paid_off_moved_rows_settled.sql` | Forward-only SQL twin update |
| `src/lib/ar/__tests__/paid-off.test.mts` | Pure paid-off eligibility regressions |
| `src/lib/ar/__tests__/posting.test.mts` | TypeScript settlement regression for moved rows |
| `src/app/ar/masterlist/[id]/__tests__/paid-off-progress.test.mts` | Source-level regression ensuring progress treats moved as settled, if the repository’s existing test pattern permits page-source tests; otherwise keep this assertion in the paid-off helper test and manually verify the page |

## Phase 0 — Baseline tests

### Task 1: Capture the current failure with focused tests

**Files:**
- Modify: `src/lib/ar/__tests__/paid-off.test.mts`
- Modify: `src/lib/ar/__tests__/posting.test.mts`

- [ ] Add this test to `paid-off.test.mts`:

```ts
test("canMarkPaidOff treats moved installments as settled history", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: ["paid", "moved"],
  });
  assert.deepEqual(result, { ok: true });
});
```

- [ ] Extend the posting settlement stub to capture the arguments passed to `.not()` and add:

```ts
it("excludes moved rows from the open-row query", async () => {
  const notArgs: string[] = [];
  await isAccountFullySettled(stubOpenIds([], notArgs), "ml-1");
  assert.deepEqual(notArgs, ["status", "in", "(paid,rolled,moved)"]);
});
```

The stub must capture the real `.not()` arguments; do not weaken the test by bypassing `isAccountFullySettled`.

- [ ] Run `node --import tsx --test src/lib/ar/__tests__/paid-off.test.mts src/lib/ar/__tests__/posting.test.mts`.
- [ ] Expected pre-fix result: the new paid-off test fails because `moved` is reported as unpaid. The posting test must remain green until its stub asserts the predicate; if a test cannot observe the predicate, replace it with a source/query-contract assertion rather than claiming coverage.

## Phase 1 — Pure eligibility and progress display

### Task 2: Make the client/server pure eligibility rule consistent

**Files:**
- Modify: `src/lib/ar/paid-off.ts:43-52`
- Test: `src/lib/ar/__tests__/paid-off.test.mts`

- [ ] Change only the settled filter to:

```ts
const unpaid = input.scheduleStatuses.filter(
  (status) => !["paid", "rolled", "moved"].includes(status),
);
```

- [ ] Preserve the existing application-status and positive-balance checks and the existing rejection message.
- [ ] Run the focused paid-off test; expected result: all paid-off tests pass.

### Task 3: Correct the AR progress denominator without changing payment state

**Files:**
- Modify: `src/app/ar/masterlist/[id]/page.tsx:477-518`
- Test: `src/app/ar/masterlist/[id]/__tests__/paid-off-progress.test.mts` only if an existing page-source test convention is present; otherwise document the manual check below and do not add a new test harness.

- [ ] Define historical settled rows as `paid`, `rolled`, or `moved` for progress calculations.
- [ ] Exclude both `rolled` and `moved` from `trackedCount`/`billableTrackedCount`.
- [ ] Keep `paidCount` counting only rows whose actual status is `paid`; this makes a paid replacement installment count as paid while the replaced historical row is excluded.
- [ ] Do not change the schedule query, amount filters, terms fallback, or button eligibility source.
- [ ] Manual check: an account with one `moved` row and one paid replacement shows `Installments paid 1/1` (or the correct live count), 100%, and an enabled button when other gates pass; an account with a `pending` row remains blocked.

## Phase 2 — TypeScript and database settlement parity

### Task 4: Update the TypeScript settlement predicate

**Files:**
- Modify: `src/lib/ar/posting.ts:255-268`
- Test: `src/lib/ar/__tests__/posting.test.mts`

- [ ] Change the schedule query predicate from `not("status", "in", "(paid,rolled)")` to `not("status", "in", "(paid,rolled,moved)")`.
- [ ] Preserve the function’s account scoping, limit, error handling, and return contract.
- [ ] Add a stub assertion that the exact status exclusion string is `(paid,rolled,moved)` and retain the existing open-row failure test.
- [ ] Run `node --import tsx --test src/lib/ar/__tests__/posting.test.mts`; expected result: all posting tests pass.

### Task 5: Add the forward SQL migration

**Files:**
- Create: `supabase/migrations/20261001100000_paid_off_moved_rows_settled.sql`

- [ ] Use this complete forward migration shape in `supabase/migrations/20261002092000_paid_off_moved_rows_settled.sql`:

```sql
-- Treat Move of Payment's replaced schedule rows as settled historical rows.
-- The replacement row remains the live obligation. No data is changed.
create or replace function public.is_account_fully_settled(p_masterlist_id uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.amortization_schedules
    where masterlist_id = p_masterlist_id
      and status not in ('paid', 'rolled', 'moved')
  );
$$;

comment on function public.is_account_fully_settled(uuid) is
  'True only when every amortization_schedules row is paid, rolled, or moved. A moved row is historical because Move of Payment creates a replacement obligation.';
```

- [ ] Do not edit `20260831120000_is_account_fully_settled_function.sql` or any already-applied migration.
- [ ] Verify the function definition and run a read-only query against a known test account before and after deployment; do not update schedule rows.

## Phase 3 — Regression and integration verification

### Task 6: Verify all paths and prevent unrelated regressions

- [ ] Run focused tests:

```text
node --import tsx --test src/lib/ar/__tests__/paid-off.test.mts src/lib/ar/__tests__/posting.test.mts
```

- [ ] Run the complete suite:

```text
npm test
```

- [ ] Run static/build checks:

```text
npm run lint
npm run build
git diff --check
```

- [ ] Manually verify these cases in AR:
  - zero balance + paid replacement + moved historical row: button enabled;
  - zero balance + pending/partial/overdue row: button disabled;
  - positive balance: button disabled;
  - already paid-off application: button remains absent;
  - normal account without Move of Payment: existing behavior unchanged.
- [ ] Verify DCR posting and Move of Payment pages are unchanged by diff review; no files outside the Files table are modified.

## Deployment order

1. Deploy application code and the new migration in the project’s normal migration pipeline.
2. Confirm the SQL function definition exists with `moved` in its exclusion list.
3. Exercise a read-only eligibility check for the reported account.
4. Have AR click `Mark as paid off`; verify application status history and account status are updated by the existing route.

## Rollback

1. If the application regression appears, redeploy the previous application version while retaining data.
2. If the SQL behavior must be reversed, apply a new corrective migration restoring `status not in ('paid', 'rolled')`; never edit or delete the applied migration.
3. Do not change any schedule status or payment row during rollback.
4. Re-run the focused and full test suites before restoring normal deployment.

## Exact commit list

- `fix: treat moved installments as settled for paid-off accounts`
- `test: cover moved installment paid-off eligibility`
- `chore: align SQL settlement function with moved status`

If the repository requires one commit per release, squash these in order into `fix: allow paid-off closure after move of payment`.

## Self-review

- **Contradictions:** None. Balance logic remains unchanged; only historical moved rows are reclassified for settlement/progress.
- **Existing and future rows:** Existing moved rows and all future Move of Payment rows are covered because readers and the SQL function change; the writer remains untouched.
- **Bypass paths:** No new route, permission, RLS, or direct database write is introduced. Server-side `markPaidOff` remains authoritative.
- **Identifiers:** All cited source files, functions, route, migration directory, and test command were verified locally. The proposed migration filename is new and must be checked for timestamp collision before creation.
- **Files/commits:** The Files table is the source of truth; implementation must not modify DCR, payment, Move of Payment, or unrelated manual files.
- **Competing sources of truth:** TypeScript `canMarkPaidOff`, TypeScript `isAccountFullySettled`, page progress, and SQL `is_account_fully_settled` are explicitly aligned.
- **Placeholders:** None. Any live database facts remain explicitly marked **UNVERIFIED** and require read-only verification before rollout.
