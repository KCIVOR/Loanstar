# Stale Transfer No-Op Guard Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Fix known-issue **#2** from `2026-08-21-internal-transfer-known-issues.md`: confirming a transfer whose target account has already been fully settled through another channel (a real payment, a write-off, or a different internal transfer) currently reports success but does nothing — no balance change, no allocation rows, no ledger entry. AR sees "posted ✓" with no sign it accomplished nothing.

---

## Audit — confirmed mechanics, current code

1. **Traced against the now-atomic `post_internal_transfer` function** (added in `2026-08-21-internal-transfer-atomicity-fix.md`, live in the database): after locking the transfer and target `masterlist` rows, it loops over open installments (`status in ('pending','partial','overdue')`) allocating the transfer amount, then computes `v_new_balance := greatest(0, round(v_ml.outstanding_balance - v_transfer.amount, 2))` and writes it, then flips the transfer to `posted`.
2. **If the target account is already fully settled** (`outstanding_balance = 0`, `account_status = 'paid'`) before this confirm runs: the open-installments loop finds zero rows (nothing to allocate against — every installment is already `paid`), so zero allocation rows are inserted and zero schedule rows are touched. The balance write computes `greatest(0, round(0 - amount, 2)) = 0` — same value it already was. The transfer still flips to `posted`, `reviewed_by`/`reviewed_at` still get set, and the function still returns `{newBalance: 0, postedAt: ...}` — an identical success shape to a real posting. **Confirmed live** via a throwaway DB test (built the account to a zero balance, then confirmed a still-pending transfer against it): the call succeeds, returns `newBalance: 0`, and creates zero allocation rows — indistinguishable from a real posting in the API response.
3. **This is reachable in practice**: a transfer stays `pending` from LRA release-close until AR reviews it — during that window, the same account could be fully paid off through a real DCR-reconciled payment, a rounding write-off, or (per the just-fixed #4) a different internal transfer landing first. None of those paths currently check for or clear out stale pending transfers targeting the account they just closed.
4. **The AR review page already shows the current balance per row** (`src/app/ar/internal-transfers/page.tsx:222-224`, `targetOutstandingBalance` — fetched fresh each page load via `listPendingInternalTransfers`). So a ₱0 balance is visible *if AR happens to look at it* before clicking Confirm — but nothing stops the click, and nothing calls it out.
5. **Error messages already surface end-to-end with zero extra wiring**: `postInternalTransfer` (`internal-transfers.ts`) does `if (error) throw new Error(error.message)` on the RPC's `error`, the confirm route's `handleApiError` maps any generic `Error` to a 500 with `{ error: message }` (`toJsonError`, `src/lib/permissions/server.ts:37-41`), and the page already renders that string via `<Alert>{error}</Alert>` (`page.tsx:130-134`, `data.error ?? "Confirm failed"`). This is the exact same path the existing `/already posted/`/`/already rejected/` guards already use. **A new SQL-side guard needs no other file changes to surface its message to AR.**

---

## Architecture

- **One additional check inside `post_internal_transfer`**, right after the target `masterlist` row is locked (before the allocation loop runs): if `v_ml.outstanding_balance <= 0`, `raise exception` with a clear message instead of proceeding. This blocks the no-op outright rather than silently "succeeding" — consistent with how this feature already treats every other invalid state (`already posted`, `already rejected`) as a hard stop AR must consciously resolve (by rejecting the stale transfer with a reason), not something to quietly paper over.
- Because the whole function is already one transaction (from the atomicity-fix plan), adding an early `raise exception` here is trivial and safe — it aborts before any writes happen, exactly like the existing status checks.
- **No JS, API route, or frontend changes** — the existing error-surfacing path (point 5 above) already renders whatever message the function raises.
- **Reject stays unaffected** — `reject_internal_transfer` doesn't touch balances, so a stale transfer can still always be rejected (with a reason) regardless of this guard. That becomes the required resolution path for a stale transfer once this ships.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the verification specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.
- **The database migration (Phase 1) needs explicit user confirmation before it's applied.**

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `reject_internal_transfer` — untouched, out of scope.
- `src/lib/ar/internal-transfers.ts`, the two API routes, `src/app/ar/internal-transfers/page.tsx` — the existing error-surfacing path already carries the new message with zero changes (audit point 5). If a task in this plan seems to require touching any of these, STOP — it means the guard's error isn't surfacing the way the audit predicted, not that these files need new logic.
- `src/lib/ar/posting.ts`, `payments`/`dcr`/`dcr_items`/`postings` tables — out of scope, per every prior plan in this series.
- `src/lib/lra/release-service.ts` — out of scope.
- Any other part of `post_internal_transfer` besides the one new guard clause — the allocation loop, balance math, and status-flip logic must stay byte-for-byte identical to what Phase 1/2 of the atomicity-fix plan verified.

### Touch With Extreme Care
- `post_internal_transfer` — this is a live, already-verified financial function. The new guard must be a pure early-exit (`raise exception` before any write), added once, with no reordering of the existing logic below it.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Block, don't warn-and-post** | Confirming a transfer whose target account already has zero outstanding balance fails outright with a clear error — it does not post a no-op "success." |
| 2 | **Resolution path is Reject** | AR resolves a stale transfer by clicking Reject and recording why (e.g. "account already settled by [other channel]") — the same UI/flow that already exists, no new screen needed. |
| 3 | **Threshold is `outstanding_balance <= 0`** | Matches the exact floor-at-zero logic the balance math already uses elsewhere in this function — no new concept introduced. |

---

## Phase 1: Guard Clause — `post_internal_transfer`

### Scope
One `CREATE OR REPLACE FUNCTION` migration, adding a single early-exit check. No table changes, no other function touched.

### Allow List
- New migration file under `supabase/migrations/` (apply via Supabase MCP `apply_migration`)

### Tasks
- [x] Migration: `create or replace function public.post_internal_transfer(...)` — identical to the live version, with one addition immediately after the `select * into v_ml ... for update` / not-found check:
  ```sql
  if v_ml.outstanding_balance <= 0 then
    raise exception 'Target account already has no outstanding balance — posting this transfer would have no effect. Reject it instead.';
  end if;
  ```
- [x] Re-apply the same `revoke`/`grant` statements (a `CREATE OR REPLACE` doesn't change grants, but re-asserting them in the migration keeps it self-contained and matches this project's existing migration style).

### Verification
- [x] Confirm the function body updated as expected (query `pg_get_functiondef` after applying). Confirmed: guard clause present exactly as written, rest of the function byte-for-byte unchanged.
- [x] Confirm grants are unchanged (`service_role`-only, per `information_schema.routine_privileges`). Confirmed: only `postgres`/`service_role`.
- [x] **Explicit user confirmation before running `apply_migration`.** Confirmed "Yes, apply it"; migration `internal_transfer_stale_noop_guard` applied successfully.

---

## Phase 2: Verification — Live DB Test + Regression Sweep

### Scope
No source changes — verification only, using the same throwaway-test-data methodology already used to verify bugs #1/#4 (isolated `masterlist`/`amortization_schedules`/`internal_transfers` rows tagged for easy cleanup, referencing a real `loan_applications`/`borrowers` row only for the FK, deleted immediately after).

### Allow List
- None (read/write test data only, fully cleaned up; no application files touched)

### Tasks
- [x] Build a test account already at `outstanding_balance = 0`, `account_status = 'paid'` (M3), with a still-`pending` transfer targeting it (T3). Confirmed it — got the new error (`Target account already has no outstanding balance — posting this transfer would have no effect. Reject it instead.`), not a `posted` result.
- [x] Confirmed the transfer stayed `status = 'pending'` afterward, with 0 allocation rows and balance untouched — the guard fired before any write, so it's cleanly retryable via Reject.
- [x] Sanity checked the happy path is untouched: built a second account (M4) with a ₱20,000 open installment and a ₱15,000 pending transfer, confirmed it — posted normally, `newBalance: 5000`, schedule shows ₱15,000 paid/`partial`, exactly 1 allocation row, transfer `posted`. Identical shape to the pre-guard behavior verified in the atomicity-fix plan.
- [x] Cleaned up all test rows — verified 0 leftover.
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1335 passed, 0 failures.
- [x] Updated `2026-08-21-internal-transfer-known-issues.md` — checked off **#2**.

