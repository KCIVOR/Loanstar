# Internal Transfer Ledger Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** When AR confirms an internal transfer (Other Loan/Offset settlement — see `2026-08-21-internal-transfer-settlement.md`), the target account's installment schedule and Account Ledger table should reflect it — not just the summary balance. Right now `postInternalTransfer` only writes `masterlist.outstanding_balance`; every installment still shows "pending," and the ledger (both AR's own masterlist page and the borrower's loan page) still shows the full original total, because neither reads `outstanding_balance` — they compute their own running balance from a completely separate data source.

---

## Audit — root cause, traced and confirmed live

1. **Confirmed via live data**: after confirming a ₱32,252 transfer against AN300406, its 3 `amortization_schedules` rows are still `status: 'pending'`, `amount_paid: 0.00` each (₱16,126 × 3 = ₱48,378) — `postInternalTransfer` never touches this table, only `masterlist.outstanding_balance` (which *is* correctly 16,126).
2. **Both ledger screens share one pure function**: `src/lib/ledger/build-account-ledger-rows.ts` → `buildAccountLedgerRows()`. Used by both `src/app/ar/masterlist/[id]/page.tsx` (AR's own view) and `src/components/borrower/LoanActivePanel.tsx` (borrower's view). One correct fix to the underlying data fixes both screens — no need to touch either page's layout.
3. **The ledger's money math ignores `schedule.amount_paid` entirely.** Read the function directly: `balance`/`credit`/`Report Total` are computed *only* from the `payments: LedgerPaymentEntry[]` array passed in (matched to installments via `scheduleId`). `schedule.status` only affects the row's status *label*, not the numbers. So flipping schedule status to `"paid"` alone would fix the badge but not the Debit/Credit/Balance columns.
4. **`postings` can't be reused** — confirmed via `information_schema.columns`: `postings.dcr_id` and `postings.payment_id` are both `NOT NULL`. Inserting there requires fabricating fake `payments`/`dcr` rows, which would corrupt real cash-collection/DCR-deposit reporting. Out of scope, matches the prior plan's constraint.
5. **Strong, working precedent already exists for exactly this problem**: `rounding_writeoffs` is a *different* non-DCR credit source (an account write-off, not a real payment) that already needs to show up in this same ledger. Traced end-to-end in `src/app/api/ar/masterlist/[id]/route.ts` (fetches `rounding_writeoffs`, returns as a separate `roundingWriteoffs` field) and `src/app/ar/masterlist/[id]/page.tsx` (maps each row into the exact `LedgerPaymentEntry` shape with `channel: "Rounding write-off"`, `id: `writeoff:${row.id}``, and merges it into the `payments` array passed to `buildAccountLedgerRows`, alongside `ledgerEntriesFromPostings(postings)`). This plan does the identical thing for internal transfers instead of inventing a new mechanism.
6. **No DB trigger links `amortization_schedules` to `masterlist.outstanding_balance`** — confirmed via `information_schema.triggers` (only `masterlist_stamp_closed_at` and `masterlist_updated_at` exist on `masterlist`; nothing on `amortization_schedules`). Real payment posting (`postSingleDcrItem`) updates both explicitly, no auto-sync. This plan follows the same convention — no double-write risk, no trigger to account for.
7. **`computeAutoAllocation`** (`src/lib/ar/posting.ts`, exported, pure — takes an amount and open installments, returns oldest-first allocation lines) is safe to reuse as-is; it's the same math already trusted for real payments. `fetchOpenInstallments` is a *private* helper in the same file — rather than exporting from a file the prior plan marked "Touch With Extreme Care," this plan duplicates the same small query locally (it's ~10 lines: select open installments for a masterlist_id).
8. **Aging bucket refresh is intentionally out of scope** — real DCR payment posting doesn't call `refresh_one_masterlist_aging` inline either (confirmed by reading `postSingleDcrItem` — it never calls it); aging is handled by a separate periodic cron. This plan matches that existing behavior rather than introducing new inline aging logic.

---

## Architecture

- **New table `internal_transfer_allocations`** — records exactly which installment(s) a confirmed transfer covered, and how much of each (a transfer can span multiple installments, e.g. ₱32,252 across 2× ₱16,126 installments). Child table of `internal_transfers`, mirrors the existing `dcr_item_allocations` shape/precedent.
- **`postInternalTransfer` gains the same allocation step `postSingleDcrItem` already does** — fetch open installments, `computeAutoAllocation`, update each allocated schedule row's `amount_paid`/`status`, insert the allocation rows. The existing `masterlist.outstanding_balance` write and `internal_transfers.status = 'posted'` write are unchanged.
- **Ledger visibility follows the `rounding_writeoffs` precedent exactly** — both the AR masterlist API route + page and the borrower loan API route + page fetch `internal_transfer_allocations` for the account, map to `LedgerPaymentEntry` (`channel: "Internal transfer"`), and merge into the existing `payments` array passed to `buildAccountLedgerRows`.
- **No schema/write-function changes to `payments`, `dcr`, `dcr_items`, `postings`** — this plan only ever writes to `amortization_schedules` (existing rows, same pattern `postSingleDcrItem` already uses) and the two new tables.
- **Migration applied via Supabase MCP** (`apply_migration`), per this project's established workflow.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the tests specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.
- **The database migration (Phase 1) needs explicit user confirmation before it's applied**, same as the prior plan's migration step.

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `payments`, `dcr`, `dcr_items`, `postings` tables/schema, or any function that writes to them (`reconcileAndPostDcr`, `postSingleDcrItem`, `submitDcr`, `addPaymentToDcr`, etc.).
- `computeAutoAllocation` itself — read-only reuse (calling the exported function) is the whole point; do not edit its logic.
- `amortization_schedules` **schema** — this plan writes to existing rows (`amount_paid`, `status`) using the exact same fields and status values `postSingleDcrItem` already writes, it does not alter the table structure.
- Anything in `src/lib/lra/release-service.ts` — out of scope for this plan entirely (that file was already finished in the prior plan).
- `src/lib/computation/*` — unrelated to this plan.

### Touch With Extreme Care (real balance/status mutation)
- `postInternalTransfer` (Phase 2) — already flagged once; this phase adds a second real-state mutation (schedule rows) inside the same function. Every write must land or none should — if the allocation step fails partway, do not leave the transfer marked `posted` with only some installments updated.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Allocation on confirm** | Confirming an internal transfer allocates the amount across the target account's open installments, oldest first, using the exact same `computeAutoAllocation` math real payments use. |
| 2 | **Installment status** | Each allocated installment's `amount_paid` increases by its allocated share; `status` becomes `"paid"` if that clears the full due+penalty, else `"partial"` — same thresholds `postSingleDcrItem` already uses. |
| 3 | **Ledger entry, not a fake payment** | The credit shows in both ledger views labeled **"Internal transfer"** (not disguised as a real payment/channel), so it's always distinguishable from actual cash collection — matches how "Rounding write-off" is already labeled distinctly. |
| 4 | **Excess amount** | If the transfer amount exceeds total open installments' remaining due (fully paid off), any leftover reduces `masterlist.outstanding_balance` the same way it already does today (unchanged) — it does not create a negative-amount allocation row. |
| 5 | **Atomicity** | If any write in the confirm sequence fails, the transfer must not end up `posted` with partial schedule updates — surface the error, leave it `pending` for AR to retry. |

---

## Phase 1: Schema — `internal_transfer_allocations` Table

### Scope
One new child table.

### Allow List
- New migration file under `supabase/migrations/` (apply via Supabase MCP `apply_migration`)

### Tasks
- [x] Create migration `internal_transfer_allocations`:
  ```sql
  create table public.internal_transfer_allocations (
    id uuid primary key default gen_random_uuid(),
    internal_transfer_id uuid not null references public.internal_transfers(id),
    amortization_schedule_id uuid not null references public.amortization_schedules(id),
    amount numeric(12,2) not null check (amount > 0),
    created_at timestamptz not null default now()
  );

  create index internal_transfer_allocations_transfer_idx
    on public.internal_transfer_allocations (internal_transfer_id);
  create index internal_transfer_allocations_schedule_idx
    on public.internal_transfer_allocations (amortization_schedule_id);

  alter table public.internal_transfer_allocations enable row level security;

  create policy internal_transfer_allocations_ar_select
    on public.internal_transfer_allocations
    for select to authenticated
    using (
      public.is_super_admin()
      or public.has_module_permission('accounting_ar', 'view')
    );
  ```
  (no INSERT/UPDATE policy for staff — written only via service role from `postInternalTransfer`, same pattern as `internal_transfers` itself. **No borrower SELECT policy either, deliberately** — checked `pg_policies` directly: `postings` has a bespoke borrower-ownership clause baked into its own SELECT policy, which is *why* the borrower route can read it today via the plain RLS-bound client with no extra code; `rounding_writeoffs` has no such clause at all, and correspondingly the borrower ledger doesn't show write-offs. This new table should behave like `postings` — visible to the borrower — but rather than duplicating a borrower-ownership subquery into RLS, Phase 3 has the borrower route read it via `createServiceClient()` instead, since that route already runs `getBorrowerMasterlist()` to verify ownership before any query executes — simpler and consistent with how this session's earlier CSA/Committee masterlist-visibility fixes were done.)

### Verification
- [x] Confirm the table + policy exist via a direct `select` after applying.
- [x] **Explicit user confirmation before running `apply_migration`.**

---

## Phase 2: `postInternalTransfer` — Allocate Against the Schedule

### Scope
Extend the confirm function to also update installments and record the allocation, alongside its existing balance write.

### Allow List
- `src/lib/ar/internal-transfers.ts`
- `src/lib/ar/__tests__/internal-transfers.test.mts` (extend existing tests)

### Tasks
- [x] Add a local, private helper mirroring `fetchOpenInstallments`'s query shape (select `id, installment_no, amount_due, penalty_amount, amount_paid, status` from `amortization_schedules` where `masterlist_id = target` and `status in ('pending','partial','overdue')`, ordered by `installment_no`) — duplicated intentionally per the Hard Constraints above, not imported from `posting.ts`.
- [x] In `postInternalTransfer`, after loading the transfer and before (or alongside) the existing balance update: fetch open installments for `target_masterlist_id`, run `computeAutoAllocation(transfer.amount, openInstallments)` (imported from `@/lib/ar/posting` — read-only reuse), and for each allocation line:
  - Update that `amortization_schedules` row: `amount_paid = amount_paid + line.amount`, `status = (fully covers due+penalty) ? "paid" : "partial"`, `paid_at = (paid) ? now : null` — matching `postSingleDcrItem` exactly, including `paid_at`, which the collector and remedial account pages read directly (`src/app/api/collector/accounts/[id]/route.ts`, `src/app/api/remedial/accounts/[id]/route.ts`) — omitting it would leave those screens showing no paid-date for an installment this flow marks paid.
  - Insert one `internal_transfer_allocations` row (`internal_transfer_id`, `amortization_schedule_id: line.amortizationScheduleId`, `amount: line.amount`). Skip rows where `line.amortizationScheduleId` is null (an unapplied trailing "advance" line, per `computeAutoAllocation`'s existing behavior when the amount exceeds total open installments — that excess is exactly what continues to reduce `masterlist.outstanding_balance` via the existing code path, so it needs no allocation row).
- [x] Keep the existing `masterlist.outstanding_balance`/`account_status` update and `internal_transfers.status = 'posted'` update exactly as they are now — this phase only adds the schedule-allocation step, it does not change the balance math.

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged (13 pre-existing, unrelated).
- [x] Unit test: confirming a transfer whose amount exactly matches N full installments marks exactly those N rows `"paid"` with the right `amount_paid`, creates N allocation rows, and the (N+1)th installment (if any) stays untouched.
- [x] Unit test: confirming a transfer that partially covers one installment marks it `"partial"` with the right `amount_paid`.
- [x] Unit test: confirming a transfer larger than all open installments combined allocates fully against all of them and still reduces `masterlist.outstanding_balance` by the leftover, matching today's existing balance behavior.
- [x] Re-run the existing `postInternalTransfer` tests (balance reduction, floor-at-zero, no-double-post) — must still pass unmodified in behavior.
- [x] `npm run test` — 0 failures.

---

## Phase 3: Ledger Visibility — AR & Borrower Views

### Scope
Surface confirmed internal-transfer allocations in both ledger screens, exactly the way `rounding_writeoffs` already is.

### Allow List
- `src/app/api/ar/masterlist/[id]/route.ts`
- `src/app/ar/masterlist/[id]/page.tsx`
- `src/app/api/borrower/applications/[id]/loan/route.ts`
- `src/components/borrower/LoanActivePanel.tsx`

### Tasks
- [x] In both API routes, fetch `internal_transfer_allocations` for the account's schedule rows (join through `internal_transfers` by `target_masterlist_id = id`), returning `{ id, amortizationScheduleId, amount, createdAt, sourceLoanAccountNo }` as a new `internalTransferCredits` response field (same shape/spirit as the existing `roundingWriteoffs` field). `sourceLoanAccountNo` resolves specifically via `internal_transfers.source_masterlist_id` → `masterlist.loan_account_no` (not `loan_applications.application_no` — the ledger's `referenceNo` column should read like `AN300407`, matching the account-number style everything else in this ledger uses, not an application number).
  - **AR's route** (`src/app/api/ar/masterlist/[id]/route.ts`) already uses the RLS-bound `supabase` client for its other queries and already has `accounting_ar` permission gating the whole route — read this new table the same way (RLS grants it directly per Phase 1's policy).
  - **The borrower's route** (`src/app/api/borrower/applications/[id]/loan/route.ts`) must read this new table via `createServiceClient()`, not the `supabase` client the rest of that GET handler uses — the new table's RLS has no borrower-ownership clause (unlike `postings`, see Phase 1 note), and ownership is already verified earlier in the handler via `getBorrowerMasterlist()`, so this mirrors the same privileged-read-after-verified-ownership pattern used elsewhere this session.
- [x] In both frontend components, map each row into `LedgerPaymentEntry`: `{ id: `transfer:${row.id}`, paymentDate: row.createdAt.slice(0,10), amount: row.amount, referenceNo: row.sourceLoanAccountNo, channel: "Internal transfer", status: "posted", scheduleId: row.amortizationScheduleId }`, and merge into the existing `payments` array passed to `buildAccountLedgerRows`, alongside `ledgerEntriesFromPostings(postings)` (and `writeOffEntries` on the AR page, which already coexists there).
- [x] No changes to `buildAccountLedgerRows` or `ledgerEntriesFromPostings` themselves — the existing shape already supports this without modification (confirmed: `LedgerPaymentEntry.channel` is a free-text string, already used for `"Rounding write-off"`).

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [ ] Manual walkthrough note (needs live data with a confirmed transfer to see rendered, same honesty flag as prior phases): AN300406's ledger should show 2 installments marked paid/partial with an "Internal transfer" credit row each, Report Total balance dropping to ₱16,126.00, matching the top summary figure exactly.

---

## Phase 4: Automated Test Sweep & Regression Check

### Scope
Full regression pass.

### Allow List
- No source changes — verification only.

### Tasks
- [x] `npx tsc --noEmit` — error count matches the pre-existing baseline exactly.
- [x] `npm run test` — full suite, 0 failures.
- [x] `git diff --stat` — confirm only files on the Allow lists above were touched across all phases.

---

## Phase 5: Revert the Test Transfer — Retry It Fresh

### Scope
**Data-only, no code changes.** The transfer confirmed earlier this session (AN300407 → AN300406, ₱32,252, offset · 2 mos) was posted *before* this plan's Phase 2 existed, so it has no `internal_transfer_allocations` rows and never will retroactively — same caveat as the original settlement plan's release revert. Rather than hand-write a one-off backfill, put it back to `pending` so the user can confirm it again through the real AR UI once Phases 1–4 are live, exercising the actual new code path end-to-end instead of a synthetic test.

### Allow List
- No source files — direct SQL against the live Supabase project only (same execution method as the earlier LRA release revert this session).

### Tasks
- [ ] Confirm current state first (don't assume it hasn't moved since this plan was written): re-check `masterlist.outstanding_balance`/`account_status` for AN300406, and the `internal_transfers` row's `status` for the AN300407→AN300406 transfer.
- [ ] Revert `masterlist` for AN300406: `outstanding_balance` back to `48378.00` (its pre-transfer value), `account_status` back to `'active'` (unchanged either way, but set explicitly).
- [ ] Revert the `internal_transfers` row: `status = 'pending'`, `reviewed_by = null`, `reviewed_at = null`.
- [ ] Leave AN300407 alone — its own balance (already `0.00`/`paid` from the borrower's real payments) is unrelated to this transfer and the user didn't ask to revert that.
- [ ] Leave `amortization_schedules` for AN300406 alone — they're already untouched (still their original `pending` state), nothing to revert there.

### Verification
- [ ] Re-query all four values after the revert (`masterlist.outstanding_balance`, `masterlist.account_status`, `internal_transfers.status`, `internal_transfers.reviewed_by`) and confirm each matches the target.
- [ ] **Explicit user confirmation before running this revert** — same as every other direct-data-mutation step this session, even though it's simpler than the earlier release rollback.
