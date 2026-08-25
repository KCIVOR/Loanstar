# Internal Transfer Atomicity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Fix known-issue **#1** (a failed confirm, retried, can double-allocate money) and **#4** (concurrent confirms can lose an update) from `2026-08-21-internal-transfer-known-issues.md`, together, since both share the same root cause: `postInternalTransfer` is a sequence of separate JS-side reads/writes with no transaction and no row locking. A crash mid-sequence leaves partial state a retry doesn't know about; two concurrent confirms can race on the same balance read.

---

## Audit — confirmed mechanics of both bugs

1. **#1 traced exactly**: `postInternalTransfer` (`src/lib/ar/internal-transfers.ts:107-208`) fetches open installments, runs `computeAutoAllocation(transferAmount, openInstallments)` using the **full original transfer amount** every call, loops writing `amortization_schedules` + inserting `internal_transfer_allocations` rows, *then* writes `masterlist.outstanding_balance`, *then* flips `internal_transfers.status` to `posted`. If the loop fails partway (say installment #1 succeeds, #2 throws), the transfer correctly stays `pending` — but a retry re-fetches open installments (now excluding the already-`paid` #1), and re-runs `computeAutoAllocation` with the **full amount again**, over-allocating the remaining installments. Separately: if the loop fully succeeds but the *balance* update or the *final status* update fails, a retry re-does the loop with `remaining = 0` correctly (no-op, since `computeAutoAllocation` naturally allocates nothing further once all installments are covered) — but then re-subtracts the **full `transferAmount` a second time** from the balance, since nothing currently tracks "was the balance already reduced." Both failure points are real.
2. **#4 traced exactly**: the balance read (`select outstanding_balance`) and write (`update ... set outstanding_balance`) are two separate round-trips with nothing in between locking the row. Two `postInternalTransfer` calls for the same `target_masterlist_id` (two different pending transfers, or a double-click) can both read the same starting balance and each compute a reduction from it — the second write overwrites the first, losing one reduction.
3. **Sibling issue found during this audit, folded in**: `rejectInternalTransfer` (`internal-transfers.ts:211-246`) reads `status`, checks it's `pending` in JS, then writes `status = 'rejected'` unconditionally — no `WHERE status = 'pending'` guard on the actual UPDATE. A reject racing a concurrent confirm could silently flip an already-`posted` transfer back to `rejected`, corrupting a real posted balance change's record without reversing the balance itself.
4. **No existing precedent for multi-write RPCs in this codebase's AR module** — `postSingleDcrItem`/`reconcileAndPostDcr` (the real-payment posting code) use the exact same sequential-JS-writes pattern, with the same theoretical race (this is why known-issue #4's writeup called it "not a new weakness — matches the existing pattern"). This plan does **not** touch that code (out of scope, protected by the settlement plan's constraints) — it only fixes the internal-transfer-specific function, using a stronger technique (a single Postgres function/transaction) than the pattern it's modeled on. That's a deliberate, scoped improvement, not an attempt to "fix" the DCR pipeline too.
5. **`SECURITY DEFINER` functions in this project are not execute-restricted by default** — confirmed via `get_advisors`: several existing helper RPCs (`has_module_permission`, `is_super_admin`, etc.) show up as "Public Can Execute" advisories, meaning Supabase's default grants to `anon`/`authenticated` weren't revoked for them. Those are read-only/permission-check helpers, low risk either way. This plan's new function performs a **real financial mutation**, so it explicitly revokes `EXECUTE` from `public`/`anon`/`authenticated` and grants only to `service_role` — tighter than existing precedent, appropriate given what it does. The API route already gates on `accounting_ar`/`edit` before ever calling it, using the service-role client (unchanged).

---

## Architecture

- **New Postgres function `post_internal_transfer(p_transfer_id uuid, p_actor_id uuid)`** — the entire confirm sequence (lock transfer row, lock target account row, allocate against installments, update balance, flip status) runs inside this one function. A `plpgsql` function body is one transaction: any `raise exception` inside it rolls back everything that function call did, so there is no partial-write state to ever retry into. `for update` row locks on both the transfer and the masterlist row make two concurrent calls serialize instead of racing — the second call simply waits for the first to finish (and commit or fully roll back) before it starts reading.
- **New Postgres function `reject_internal_transfer(p_transfer_id uuid, p_actor_id uuid, p_reason text)`** — same lock-then-check-then-write pattern, single UPDATE, closing the sibling race from audit point #3.
- **`postInternalTransfer`/`rejectInternalTransfer` in `internal-transfers.ts` become thin wrappers** — each becomes a single `supabase.rpc(...)` call instead of the current multi-step sequence. Same function signatures, same return shape, same call sites (the two confirm/reject API routes) — **zero changes needed outside this one file**.
- **`listPendingInternalTransfers` is untouched** — it's a read, no atomicity concern.
- **Migration applied via Supabase MCP** (`apply_migration`), per this project's established workflow.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the tests specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.
- **The database migration (Phase 1) needs explicit user confirmation before it's applied.**

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `src/lib/ar/posting.ts` — `postSingleDcrItem`, `reconcileAndPostDcr`, `computeAutoAllocation`, and everything else in the payments/DCR pipeline stay exactly as they are. This plan does not "fix" that code's equivalent race — it's out of scope, protected since the original settlement plan.
- `payments`, `dcr`, `dcr_items`, `postings` tables/schema or any function writing to them.
- `internal_transfers`/`internal_transfer_allocations` table **schema** — this plan adds functions that read/write existing columns, it does not alter either table's structure.
- The two API routes (`src/app/api/ar/internal-transfers/[id]/confirm/route.ts`, `.../reject/route.ts`) — if `postInternalTransfer`/`rejectInternalTransfer` keep the same signature and return shape (locked decision above), these routes need **zero changes**. If a task in this plan seems to require changing them, STOP — it means the wrapper functions' signatures drifted from the plan, not that the routes need to change.
- `src/lib/lra/release-service.ts` — entirely out of scope.
- Reporting/trend code (`src/lib/reports/**`) — the separately-tracked historical-trend gap is not part of this plan.

### Touch With Extreme Care (real balance/status mutation)
- The new `post_internal_transfer` SQL function — this is the one place doing the actual money math now. Every arithmetic step must match what the current JS code does exactly (`halfUp`-equivalent rounding via `round(x, 2)`, same paid/partial threshold, same floor-at-zero balance logic) — this plan must not change *what* gets calculated, only *how atomically* it gets applied.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Full atomicity** | `post_internal_transfer` either fully applies (all installment updates + allocation rows + balance update + status flip) or none of it does — no code path can leave partial schedule updates behind. |
| 2 | **Row locking closes the race** | Both the transfer row and the target masterlist row are locked (`for update`) at the start of the function — a second concurrent call for the same transfer or the same account waits, it does not read stale data. |
| 3 | **Same math, no behavior change for the happy path** | A transfer confirmed once, successfully, produces the exact same schedule updates, allocation rows, balance, and status as it does today — this plan changes *how* it's applied, not *what* gets applied. |
| 4 | **Reject gets the same treatment** | `reject_internal_transfer` locks the row and re-checks `pending` status inside the same transaction as its write — no window for a concurrent confirm to be silently overwritten. |
| 5 | **Locked down to service role only** | Neither function is executable by `anon`/`authenticated` — only `service_role`, since both are real financial mutations, not read helpers. |

---

## Phase 1: Schema — `post_internal_transfer` & `reject_internal_transfer` Functions

### Scope
Two new Postgres functions, no table changes.

### Allow List
- New migration file under `supabase/migrations/` (apply via Supabase MCP `apply_migration`)

### Tasks
- [x] Create migration with both functions:
  ```sql
  create or replace function public.post_internal_transfer(
    p_transfer_id uuid,
    p_actor_id uuid
  ) returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_transfer record;
    v_ml record;
    v_now timestamptz := now();
    v_remaining numeric;
    v_new_balance numeric;
    v_inst record;
    v_total_due numeric;
    v_new_paid numeric;
    v_applied numeric;
  begin
    select * into v_transfer
    from internal_transfers
    where id = p_transfer_id
    for update;

    if not found then
      raise exception 'Transfer not found';
    end if;

    if v_transfer.status <> 'pending' then
      raise exception 'Transfer is already % — cannot post again', v_transfer.status;
    end if;

    select * into v_ml
    from masterlist
    where id = v_transfer.target_masterlist_id
    for update;

    if not found then
      raise exception 'Target account not found';
    end if;

    v_remaining := v_transfer.amount;

    for v_inst in
      select id, amount_due, penalty_amount, amount_paid
      from amortization_schedules
      where masterlist_id = v_transfer.target_masterlist_id
        and status in ('pending', 'partial', 'overdue')
      order by installment_no
    loop
      exit when v_remaining <= 0;

      v_total_due := round(v_inst.amount_due + coalesce(v_inst.penalty_amount, 0), 2);
      v_applied := least(v_remaining, round(v_total_due - v_inst.amount_paid, 2));
      if v_applied <= 0 then
        continue;
      end if;

      v_new_paid := round(v_inst.amount_paid + v_applied, 2);

      update amortization_schedules
      set amount_paid = v_new_paid,
          status = case when v_new_paid >= v_total_due then 'paid' else 'partial' end,
          paid_at = case when v_new_paid >= v_total_due then v_now else null end
      where id = v_inst.id;

      insert into internal_transfer_allocations (internal_transfer_id, amortization_schedule_id, amount)
      values (p_transfer_id, v_inst.id, v_applied);

      v_remaining := round(v_remaining - v_applied, 2);
    end loop;

    v_new_balance := greatest(0, round(v_ml.outstanding_balance - v_transfer.amount, 2));

    update masterlist
    set outstanding_balance = v_new_balance,
        account_status = case when v_new_balance <= 0 then 'paid' else 'active' end
    where id = v_transfer.target_masterlist_id;

    update internal_transfers
    set status = 'posted',
        reviewed_by = p_actor_id,
        reviewed_at = v_now
    where id = p_transfer_id;

    return jsonb_build_object('newBalance', v_new_balance, 'postedAt', v_now);
  end;
  $$;

  revoke execute on function public.post_internal_transfer(uuid, uuid) from public, anon, authenticated;
  grant execute on function public.post_internal_transfer(uuid, uuid) to service_role;

  create or replace function public.reject_internal_transfer(
    p_transfer_id uuid,
    p_actor_id uuid,
    p_reason text
  ) returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_transfer record;
    v_now timestamptz := now();
  begin
    select * into v_transfer
    from internal_transfers
    where id = p_transfer_id
    for update;

    if not found then
      raise exception 'Transfer not found';
    end if;

    if v_transfer.status <> 'pending' then
      raise exception 'Transfer is already % — cannot reject', v_transfer.status;
    end if;

    update internal_transfers
    set status = 'rejected',
        rejection_reason = p_reason,
        reviewed_by = p_actor_id,
        reviewed_at = v_now
    where id = p_transfer_id;

    return jsonb_build_object('rejectedAt', v_now);
  end;
  $$;

  revoke execute on function public.reject_internal_transfer(uuid, uuid, text) from public, anon, authenticated;
  grant execute on function public.reject_internal_transfer(uuid, uuid, text) to service_role;
  ```

### Verification
- [x] Confirm both functions exist and their `EXECUTE` grants are `service_role`-only (query `information_schema.routine_privileges` after applying). Confirmed: only `postgres`/`service_role` have EXECUTE on both functions, no `anon`/`authenticated`.
- [x] **Explicit user confirmation before running `apply_migration`.** User confirmed "Yes, apply it"; migration `internal_transfer_atomic_functions` applied successfully. `get_advisors` (security) re-run afterward — no new advisories reference either new function.

---

## Phase 2: `internal-transfers.ts` — Thin RPC Wrappers

### Scope
Replace the JS-side multi-step logic with single `supabase.rpc(...)` calls, same signatures/return shapes.

### Allow List
- `src/lib/ar/internal-transfers.ts`
- `src/lib/ar/__tests__/internal-transfers.test.mts` (rewrite the tests that exercised the now-removed JS allocation logic — those semantics move into the SQL function and are covered by Phase 1's own verification instead; keep the tests that check the JS wrapper's error handling/return shape)

### Tasks
- [x] Replace `postInternalTransfer`'s body with a single call: `const { data, error } = await supabase.rpc("post_internal_transfer", { p_transfer_id: transferId, p_actor_id: actorId }); if (error) throw new Error(error.message); return { newBalance: Number(data.newBalance), postedAt: data.postedAt as string };`
- [x] Replace `rejectInternalTransfer`'s body the same way, calling `reject_internal_transfer`.
- [x] Remove `fetchOpenInstallments`, the `computeAutoAllocation`/`OpenInstallment` import, and the `halfUp` import from this file — none of it is used anymore (the SQL function does that work now). `ValidationError` was also no longer referenced anywhere else in the file, so its import was removed too.
- [x] The Postgres `raise exception` messages ("Transfer is already % — cannot post again" etc.) surface through `error.message` from `supabase.rpc()` — wording matches exactly what the plan's SQL specified, so the existing `/already posted/`/`/already rejected/` regex matches hold with no changes needed to `handleApiError` or the API routes.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, matches pre-existing baseline exactly, none in `internal-transfers.ts` or its test file.
- [x] Rewrote tests to mock `.rpc()` instead of `.from()` chains: covers the RPC call args, successful-result mapping, and non-pending error passthrough for both `post` and `reject`. The old allocation-math-specific cases (installment-by-installment allocation, paid/partial thresholds, balance floor-at-zero) are removed from JS — that logic now lives in and is owned by the SQL function verified in Phase 1.
- [x] `npm run test` — 1335 passed, 0 failures.

---

## Phase 3: Automated Test Sweep & Regression Check

### Scope
Full regression pass.

### Allow List
- No source changes — verification only.

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, matches the pre-existing baseline exactly.
- [x] `npm run test` — full suite, 1335 passed, 0 failures.
- [x] `git diff --stat` — confirmed only files on the Allow lists above were touched across all phases. `internal-transfers.ts`, its test file, and all three migrations are untracked (never committed in this project), and no other tracked file shows any internal-transfer-related change.
- [x] Lint (`eslint`) on the two touched files — clean, no findings.
- [ ] Manual walkthrough note (needs live data, same honesty flag as prior plans): confirm a transfer through the real AR page and verify the result matches what the old JS logic would have produced (same balance, same schedule updates, same allocation rows) — this plan should be invisible from the outside except for the atomicity/locking guarantee underneath. **Not done — requires live browser interaction with real test data, which I can't reliably drive in this environment (the preview tooling has failed every time it's been tried this session). Left open for the user to do manually, or to ask me to attempt again.**
