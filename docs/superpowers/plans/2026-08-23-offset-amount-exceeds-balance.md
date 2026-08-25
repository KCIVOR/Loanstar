# Offset/Other Loan Amount Exceeding Target Balance — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Nowhere in the Offset/Other Loan pipeline — screen, save, release, or AR confirm — does anything check that a deduction amount is actually ≤ what the target account currently owes. Two UI-level bugs let a bad number get created (found live via screenshot: the "Which months to cover" popup, and the freely-editable "Other Loan" amount box); but the real gap is structural: even a correctly-behaving screen could still submit a now-too-large amount if the target account's balance drops (a real payment, another transfer) in the days/weeks between CSA saving the computation and AR actually confirming it. This plan closes the gap at its root — the point where money actually moves — and also fixes the two screen-level bugs that make it easy to trigger by accident.

---

## Audit — confirmed mechanics

1. **"Which months to cover" popup always offers at least 3 months, regardless of what's actually owed.** `src/components/csa/ComputationPanel.tsx:768`:
   ```ts
   const maxMonths = match
     ? Math.max(3, Math.min(24, Math.ceil(match.outstandingBalance / (match.monthlyAmortization || 1))))
     : 12;
   ```
   For a target account that only owes 1 more month (confirmed live: AN300406, balance ₱16,126, monthly ₱16,126 — `Math.ceil(16126/16126) = 1`), the `Math.max(3, 1)` forces the popup to show 3 checkboxes anyway. Checking all 3 computes `amount: (match?.monthlyAmortization ?? 0) * b.months.size` (`ComputationPanel.tsx:393`, also `:407` for the running total) — ₱48,378 — ₱32,252 more than the account actually owes, with nothing to stop it being selected and submitted.
2. **The "Other Loan (full buyout)" amount box has the identical exposure through a different door.** Selecting an account correctly auto-fills the real balance (`updateOtherLoanRowAccount`, `ComputationPanel.tsx:309-319`, `amount: match ? match.outstandingBalance.toFixed(2) : r.amount`) — but the field stays freely editable afterward (`updateOtherLoanRowAmount`, `ComputationPanel.tsx:322-326`, a bare string setter, and the helper text at `:674` literally says "auto-fills, editable per row"). Nothing stops typing in a number larger than the real balance.
3. **No layer downstream ever re-checks the amount against the target's real balance:**
   - The zod schemas on both save routes (`computeSchema` in the CSA route, `overrideSchema` in the Committee route) validate `amount: z.number().min(0)` only — no upper bound tied to the named `accountNo`.
   - `persistComputation` (`src/lib/csa/computation.ts`) and `committeeOverrideAmount`/`committeeAdjustPreDecision` (`src/lib/negotiation/service.ts`) — neither reads the target account's balance or compares it against the deduction amount before saving.
   - `createPendingInternalTransfers` (`src/lib/lra/release-service.ts:968-1021`) — at release time, resolves the target account's *id* only (`select("id")`) and copies `target.amount` straight from the saved computation into the new `internal_transfers` row. It never re-reads `outstanding_balance`, so it can't catch drift between when the computation was saved and when the loan is actually released (which can be days or weeks later).
   - `post_internal_transfer` (the atomic SQL function added in the atomicity-fix and stale-noop-guard plans) computes `v_new_balance := greatest(0, round(v_ml.outstanding_balance - v_transfer.amount, 2))` — if `v_transfer.amount` exceeds the balance, this **silently floors to zero and posts successfully**. The excess is never flagged; it just vanishes from the source borrower's proceeds with no error, no audit trail pointing at the mismatch.
4. **No real damage has occurred yet.** Queried live: exactly one `posted` offset transfer exists in the whole system (the AN300406/AN300407 one from this session's own testing), and its amount was fully and exactly allocated (`internal_transfer_allocations` sum = transfer amount, zero leftover). The screenshot that triggered this audit was caught before submission.
5. **Why the fix belongs at confirm-time, not just at save-time.** Even a perfectly-behaving screen only knows the target's balance *at the moment CSA fills the form*. `createPendingInternalTransfers` runs at LRA release — which can be well after the computation was saved — and AR's actual confirm (`post_internal_transfer`) can happen later still. The target account's real balance can legitimately drop in that window (a normal payment, a different transfer landing first). A save-time-only check cannot catch that drift; only a check at the moment the transfer is actually posted can guarantee correctness. This mirrors the same reasoning already applied in `2026-08-24-stale-transfer-noop-guard.md` — the account's true state has to be checked at the point of posting, not trusted from earlier in the pipeline.

---

## Architecture

- **Primary fix — a new guard clause inside `post_internal_transfer`** (the same live, already-atomic SQL function from the two prior plans): immediately after locking the target `masterlist` row (and after the existing no-op guard from the stale-noop-guard plan), if `v_transfer.amount > v_ml.outstanding_balance`, `raise exception` instead of proceeding. This is the authoritative check — it runs at the one moment that matters (the instant money would actually move), using the account's real balance at that exact instant, regardless of what happened earlier in the pipeline. AR resolves it the same way as the no-op case: reject the transfer and ask CSA/Committee to recompute with a correct amount.
- **Secondary fix — remove the screen-level bugs that make this easy to trigger by accident**, in `ComputationPanel.tsx` (shared by both CSA and Committee, one fix covers both entry points):
  - Drop the `Math.max(3, ...)` floor — show exactly how many months are actually owed, never an inflated minimum.
  - Clamp the "Other Loan" amount field to the selected account's real balance when an account is chosen (an unselected/custom row has no real balance to check against, so stays uncapped as today).
- **Nothing else changes.** `createPendingInternalTransfers` still just copies whatever amount was saved — it doesn't need its own check now that the true backstop lives at confirm-time, and adding a second, redundant check there would be scope creep without adding real protection (per audit point 5, only the confirm-time check can actually be authoritative).

---

## Ground Rules

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- Check `git diff --stat` after each phase — only Allow-listed files touched.
- **Do not commit** unless the user explicitly requests.
- **One phase at a time.**
- **The database migration (Phase 1) needs explicit user confirmation before it's applied.**

---

## Hard Constraints

### Never Modify
- The existing atomicity/locking logic and the stale-noop guard already inside `post_internal_transfer` — this plan adds one more early-exit check in the same style, it does not restructure anything already there.
- `reject_internal_transfer` — untouched, out of scope.
- `createPendingInternalTransfers` / `src/lib/lra/release-service.ts` — per Architecture, no change needed here; the confirm-time guard is sufficient and this file is out of scope.
- `src/lib/csa/computation.ts`, `src/lib/negotiation/service.ts` — no save-time balance check is being added (see Architecture point on why confirm-time is the correct and sufficient place); these stay untouched.
- The two API routes' zod schemas (`computeSchema`, `overrideSchema`) — no change; this is a UI-affordance fix and a posting-time guard, not a request-validation change.

### Touch With Extreme Care
- `post_internal_transfer` — live, twice-already-modified financial function. The new check must be a pure early-exit added in the same place/style as the existing no-op guard, with zero changes to the allocation loop, balance math, or status-flip logic below it.
- `ComputationPanel.tsx` — shared by CSA and Committee; a change here affects both. Keep the diff to exactly the two described fixes — no unrelated cleanup.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Confirm-time is the authoritative check** | `post_internal_transfer` refuses to post when the transfer amount exceeds the target account's *current* balance, checked at the instant of posting — not relying on any earlier screen-time or save-time check. |
| 2 | **Block, don't clamp or silently accept partial** | Matches the stale-noop-guard's philosophy: refuse outright with a clear error, rather than silently applying only what's owed and discarding the rest (which would hide the mistake instead of surfacing it). |
| 3 | **Paying less than owed stays completely normal** | The guard only fires when amount *exceeds* the balance. Partial offsets (e.g. covering 1 of 3 owed months) are the main legitimate use case and are unaffected. |
| 4 | **Screen-level fixes prevent the mistake, they don't need to catch every case** | Removing the `Math.max(3,...)` floor and capping the editable "Other Loan" amount stop the two known ways to construct a bad number today. They're a UX improvement (catch it immediately instead of at confirm-time, possibly weeks later) — the confirm-time guard (Decision #1) is what actually guarantees correctness regardless of whether the screen-level fixes are ever bypassed or drift occurs later. |

---

## Phase 1: Confirm-Time Balance Guard (SQL)

### Scope
One additional early-exit check inside `post_internal_transfer`, no table changes.

### Allow List
- New migration file under `supabase/migrations/` (apply via Supabase MCP `apply_migration`)

### Tasks
- [x] Migration: `create or replace function public.post_internal_transfer(...)` — identical to the current live version (atomicity fix + stale-noop guard), with one addition immediately after the existing no-op guard (`if v_ml.outstanding_balance <= 0 then raise exception ...`) and before the allocation loop:
  ```sql
  if v_transfer.amount > v_ml.outstanding_balance then
    raise exception 'Transfer amount % exceeds the target account current balance of % — reject this transfer and ask for a recomputed amount', v_transfer.amount, v_ml.outstanding_balance;
  end if;
  ```
- [x] Re-apply the same `revoke`/`grant` statements, matching this project's established migration style for this function.

### Verification
- [x] Confirm the function body updated as expected (`pg_get_functiondef`). Confirmed byte-for-byte, guard present exactly as written.
- [x] Confirm grants unchanged (`service_role`-only). Confirmed: only `postgres`/`service_role`.
- [x] **Explicit user confirmation before running `apply_migration`.** Confirmed "Yes, apply it"; migration `internal_transfer_amount_exceeds_balance_guard` applied successfully.
- [x] Live DB check (same throwaway-test-data method as the prior two plans): built a target account mirroring the exact screenshot scenario (balance ₱16,126), created a pending transfer for ₱48,378 (the exact over-amount from the bug) — confirming it produced the expected error (`Transfer amount 48378.00 exceeds the target account current balance of 16126.00 ...`), the transfer stayed `pending`, and the balance was untouched. Then built a second target account and confirmed a transfer for an amount *exactly equal* to its balance still posts normally (`newBalance: 0`) — regression check against Decision #3 passed. Test data fully cleaned up (0 leftover).

---

## Phase 2: Screen-Level Fixes

### Scope
Remove the `Math.max(3,...)` floor; cap the "Other Loan" amount field to the selected account's real balance.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] `ComputationPanel.tsx:768` — changed `Math.max(3, Math.min(24, ...))` to `Math.min(24, Math.ceil(match.outstandingBalance / (match.monthlyAmortization || 1)))` — no artificial floor; a fully-paid target now correctly offers zero months.
- [x] `updateOtherLoanRowAmount` — when the row has an `accountNo` selected, the typed amount is now clamped to that account's current `outstandingBalance` (via `activeLoans.find`); a custom/external row (no `accountNo`) stays uncapped, since there's no real balance to check against.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in the touched file.
- [x] `npm run test` — 1340 passed, 0 failures.
- [x] Lint on the touched file — 1 error + 1 warning, confirmed via `git stash` diff to be pre-existing (identical before and after, at unrelated lines).
- [x] `git diff --stat` — only `ComputationPanel.tsx` touched.

---

## Phase 3: Regression Sweep

### Scope
Full regression pass, no source changes.

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, matches baseline exactly.
- [x] `npm run test` — full suite, 1340 passed, 0 failures.
- [x] `git diff --stat` — confirmed only Allow-listed files touched across all phases (`ComputationPanel.tsx`, the one new migration file).
- [ ] Manual walkthrough note: attempted via the preview tooling — the dev server started, but the browser tab failed to navigate to it, the same failure this session has hit on every attempt (this plan's, and the two before it). **Left open for the user to check manually**: open the "Which months to cover" popup for an account that owes less than 3 months and confirm it now shows the true count; try typing an inflated amount into an "Other Loan" row with an account selected and confirm it gets clamped to the real balance.
