# Internal Transfer Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** When a new loan releases with an Other Loan (full payoff) or Offset (partial payoff) deduction targeting an existing account, actually move that money — reduce the target account's balance in AR — instead of the deduction being a calculation-only note that AR never sees. **AR reviews and confirms each one** (not fully automatic); it does **not** go through the payments/DCR pipeline (verified: `reconcileAndPostDcr` hard-blocks unless a confirmed bank deposit exactly matches the DCR total — an internal transfer never touches a bank, so it structurally cannot go through that pipeline without corrupting deposit reconciliation).

**Confirmed via live data this session:** borrower's loan AN300407 offset 2 months (₱32,252) against AN300406. AN300406's `outstanding_balance` is still 48,378.00, `account_status` still `"active"`, zero rows in `payments` for that account. This plan closes that gap.

**Architecture:**
- **New table `internal_transfers`** — one row per deduction entry with an `accountNo`, created automatically (as `pending`) the moment the new loan's release is *closed* (`closeRelease` in `release-service.ts`, right after the new loan's own masterlist enrollment — the same point that already privileged-writes via service role). AR confirms or rejects from a new small queue; confirming reduces the *target* account's `outstanding_balance` directly (floor at 0, flip `account_status` to `"paid"` at zero) and records who/when.
- **Not the `payments`/`dcr`/`postings` tables** — a deliberately separate, clearly-labeled table so it can never be mistaken for real cash collection in AR's deposit-reconciliation reports.
- **RLS**: mirrors `masterlist`'s existing pattern — `accounting_ar` module permission or `super_admin` for SELECT/UPDATE (AR review). INSERT happens only via `createServiceClient()` from the LRA release flow (same privileged-write pattern `initializeArAccount` already uses) — no direct INSERT policy needed for staff roles.
- **Migration applied via Supabase MCP** (`apply_migration`), not `supabase db push` — per this project's established workflow for schema changes.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Zod, Supabase/Postgres.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the tests specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.
- **The database migration (Phase 1) is the one genuinely hard-to-reverse step in this plan** — confirm with the user before applying it, even though the rest of this plan already has their go-ahead.

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `payments`, `dcr`, `dcr_items`, `postings`, `amortization_schedules` tables/schema, or any function that writes to them (`reconcileAndPostDcr`, `postSingleDcrItem`, `computeAutoAllocation`, etc.) — this plan is deliberately a *separate* posting path specifically because those enforce bank-deposit matching, which doesn't apply here. Touching them is scope creep and risks breaking real cash-collection reconciliation.
- `src/lib/computation/sf.ts` / `sme.ts` — no math changes, this is a downstream consumer of already-computed `otherDeductions`.
- Anything in `src/lib/lra/release-service.ts` other than the one insertion point identified in Phase 2 (inside `closeRelease`, after the existing `initializeArAccount` call).

### Touch With Extreme Care (real balance/status mutation)
- The new `postInternalTransfer` function (Phase 3) — this is the one place real money-adjacent state changes. Every write must be inside a single logical operation; do not partially update balance without also marking the transfer posted (or vice versa).

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Trigger point** | A pending `internal_transfers` row is created automatically when `closeRelease` succeeds for the new loan — one row per deduction entry that has a non-null `accountNo` (both `otherLoans[]` and `offsets[]` entries; legacy singular `otherLoanAccountNo`/`offsetAccountNo` too, for older computations). Entries with no account (manual/external) are skipped — there's no target account to reduce. |
| 2 | **Unresolvable account** | If the named `accountNo` doesn't match any `masterlist` row, skip that entry (log via audit, do not fail/block the release — release must never be blocked by this bookkeeping side-effect, same principle `closeRelease` already applies to AR enrollment retries). |
| 3 | **AR confirms, doesn't just rubber-stamp blind** | The review screen shows: source loan (new), target account (old), amount, type (Other Loan / Offset), and offset months if applicable — enough for AR to sanity-check against the paperwork before confirming. |
| 4 | **Posting effect** | Confirming reduces `masterlist.outstanding_balance` by the transfer amount (floor 0), sets `account_status = "paid"` when it reaches 0, else stays `"active"`. Rejecting just marks the row `rejected` with a reason — no balance change. |
| 5 | **No double-posting** | A transfer can only be confirmed once (status must be `pending`); confirming an already-`posted`/`rejected` row is a no-op error, not a silent double-deduction. |

---

## Phase 1: Schema — `internal_transfers` Table

### Scope
One new table, RLS matching the existing `masterlist` pattern.

### Allow List
- New migration file under `supabase/migrations/` (apply via Supabase MCP `apply_migration`, per this project's convention)

### Tasks
- [x] Create migration `internal_transfers`:
  ```sql
  create table public.internal_transfers (
    id uuid primary key default gen_random_uuid(),
    source_loan_application_id uuid not null references public.loan_applications(id),
    source_masterlist_id uuid references public.masterlist(id),
    target_masterlist_id uuid not null references public.masterlist(id),
    transfer_type text not null check (transfer_type in ('other_loan', 'offset')),
    months integer,
    amount numeric(12,2) not null check (amount > 0),
    status text not null default 'pending' check (status in ('pending', 'posted', 'rejected')),
    rejection_reason text,
    created_by uuid,
    created_at timestamptz not null default now(),
    reviewed_by uuid,
    reviewed_at timestamptz
  );

  create index internal_transfers_target_idx on public.internal_transfers (target_masterlist_id);
  create index internal_transfers_status_idx on public.internal_transfers (status);

  alter table public.internal_transfers enable row level security;

  create policy internal_transfers_ar_select on public.internal_transfers
    for select to authenticated
    using (
      public.is_super_admin()
      or public.has_module_permission('accounting_ar', 'view')
    );

  create policy internal_transfers_ar_update on public.internal_transfers
    for update to authenticated
    using (
      public.is_super_admin()
      or public.has_module_permission('accounting_ar', 'edit')
    )
    with check (
      public.is_super_admin()
      or public.has_module_permission('accounting_ar', 'edit')
    );
  ```
  (no INSERT policy for staff roles — rows are only ever created via service role from the LRA release flow, mirroring how `masterlist` rows get created)

### Verification
- [x] Confirm the table + policies exist via `list_tables`/a direct `select` after applying.
- [x] **Explicit user confirmation before running `apply_migration`** — this is the one step in this plan that touches live schema.

---

## Phase 2: LRA Release — Create Pending Transfers

### Scope
Hook into `closeRelease` to create `internal_transfers` rows for every deduction entry with a target account.

### Allow List
- `src/lib/lra/release-service.ts` (one insertion point only, inside `closeRelease`, after the existing `initializeArAccount` call)
- `src/lib/lra/__tests__/*` (add tests)

### Tasks
- [x] After the existing `initializeArAccount(...)` call in `closeRelease`, read the active computation's `otherDeductions` for `file.loanApplicationId` (reuse `getActiveComputation`, already imported patterns elsewhere in this codebase).
- [x] Build the list of `{ accountNo, amount, transferType, months }` entries from `otherLoans[]` (transferType `"other_loan"`, months `null`) and `offsets[]` (transferType `"offset"`), falling back to the legacy singular fields when the arrays are empty — same "array wins" rule used everywhere else this session.
- [x] For each entry with a non-null `accountNo`: look up `target_masterlist_id` by `loan_account_no = accountNo` via the service client; if found, insert a `pending` `internal_transfers` row (`source_loan_application_id = file.loanApplicationId`, `source_masterlist_id = ar.masterlistId`, `created_by = actorId`); if not found, skip and write an audit event noting the unresolved account number instead of failing the close.
- [x] Wrap this in a try/catch that logs but never throws — exactly like the plan's Locked Decision #2, a bookkeeping side-effect must never block `closeRelease` from succeeding.

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged (13 pre-existing, unrelated).
- [x] Unit test: closing a release whose computation has 2 offset entries with resolvable account numbers creates 2 pending `internal_transfers` rows with the right amounts/types.
- [x] Unit test: an entry with an unresolvable account number does not throw and does not block `closeRelease`'s normal return value.
- [x] `npm run test` — 0 failures.

---

## Phase 3: AR — Confirm/Reject + Balance Posting

### Scope
The actual posting function, plus API routes for AR to act on a pending transfer.

### Allow List
- `src/lib/ar/internal-transfers.ts` (new file — deliberately separate from `posting.ts`, matching Locked Decision's "Never Modify payments/dcr/postings" boundary)
- `src/lib/ar/__tests__/internal-transfers.test.mts` (new file)
- `src/app/api/ar/internal-transfers/route.ts` (new — list pending)
- `src/app/api/ar/internal-transfers/[id]/confirm/route.ts` (new)
- `src/app/api/ar/internal-transfers/[id]/reject/route.ts` (new)

### Tasks
- [x] `listPendingInternalTransfers(supabase)` — joins in the source application's number, borrower name, and target account's loan_account_no/borrower for display.
- [x] `postInternalTransfer(supabase, transferId, actorId)`:
  - Load the transfer; if `status !== "pending"`, throw (no double-posting, Locked Decision #5).
  - Load `target_masterlist_id`'s current `outstanding_balance`.
  - `newBalance = max(0, halfUp(currentBalance - amount))` (reuse `halfUp` from `@/lib/computation/money`, same rounding convention as the rest of AR).
  - Update `masterlist`: `outstanding_balance = newBalance`, `account_status = newBalance <= 0 ? "paid" : "active"`.
  - Update the transfer row: `status = "posted"`, `reviewed_by = actorId`, `reviewed_at = now`.
  - Write an audit event (`writeAuditEvent`, module `accounting_ar`, entity `internal_transfer`).
- [x] `rejectInternalTransfer(supabase, transferId, actorId, reason)` — same pending-only guard, sets `status = "rejected"`, `rejection_reason`, `reviewed_by`, `reviewed_at`. No balance change.
- [x] API routes: `requireModulePermission("accounting_ar", "view")` for the list GET, `("accounting_ar", "edit")` for confirm/reject POSTs. Use `createServiceClient()` for the actual balance write (masterlist RLS doesn't grant staff direct UPDATE beyond what's already established this session), same pattern as every other privileged AR write this session.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [x] Unit tests for `postInternalTransfer`: reduces balance correctly; flips to `"paid"` at exactly 0; floors at 0 rather than going negative when amount exceeds balance; throws on a non-`pending` transfer (no double-post).
- [x] Unit test for `rejectInternalTransfer`: no balance change, status/reason set correctly.

---

## Phase 4: AR UI — Review Queue

### Scope
A small page for AR to see and act on pending transfers.

### Allow List
- `src/app/ar/internal-transfers/page.tsx` (new)
- Whatever AR navigation/sidebar file lists existing AR pages (add one link) — identify the exact file during this phase, do not touch unrelated nav entries.

### Tasks
- [x] List pending transfers: source loan, target account, amount, type + months, created date.
- [x] Confirm button → `ConfirmDialog` (existing component, same pattern used throughout this codebase) → POST confirm.
- [x] Reject button → small reason textarea → POST reject.
- [x] After action, remove from the pending list / refresh.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [ ] Manual walkthrough note: this needs a live pending transfer to click through — same honesty pattern as prior plans this session, flag as unverified-by-browser if not actually clicked.

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
- [ ] Re-check the live AN300406/AN300407 data from this session (via Supabase MCP) — after Phase 2+3 land and get exercised (either via a fresh test release or a manual backfill the user approves separately), confirm the actual gap that started this plan is closed.
