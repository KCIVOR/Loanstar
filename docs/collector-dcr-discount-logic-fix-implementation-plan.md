# Collector DCR Discount Logic Fix Implementation Plan

**Goal:** A Collector discount entered on a DCRR line always waives exactly what the Collector chose, on exactly the installments chosen. A borrower who pays the agreed discounted amount ends with those installments `paid` and no leftover balance. A discount that cannot take effect is refused or clearly warned about, never silently dropped.
**Root cause:** `post_single_dcr_item` (live DB, migration `supabase/migrations/20260909002138_dcr_penalty_paid_split.sql`) receives only one peso *total* per discount type. It even-splits that total over the selected installment numbers and applies a share only to installments that appear in this payment's allocation lines. Separately, the Collector allocation modal pre-fills each row with the gross (undiscounted) remaining due (`src/app/collector/dcr/page.tsx:160`), so the payment never lands on the rows in the shape Pass B needs.
**Approach:** Store a per-installment discount breakdown on `dcr_items`, have the RPC apply each installment's own amount (falling back to the old even-split only for legacy rows), validate on the server that every discounted installment is open and allocated, and make the modal re-fill rows net of the selected discount. Pass A/Pass B semantics, permissions, and the receipt stay untouched.
**Tech stack:** Next.js (App Router) + TypeScript, Supabase Postgres (PL/pgSQL RPCs), node:test via `tsx` (`npm test` → `src/lib/**/__tests__/*.mts`, `package.json:10`).
**Source:** Audit in chat, 2026-10-01 (user's report: "i paid 21,154.60 and apply 100% discount… i still paid the whole"). Expected result: discounts behave as entered, and nothing is left owing after the agreed amount is paid.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | The even-split rule was a deliberate earlier decision ("do not invent a different split rule", `docs/revision-plans/feature-collector-discount-implementation-plan.md:460-466`). May we replace it with per-installment amounts? | Finding 3 cannot be fixed without overriding that decision. | Yes. The Collector UI already collects a percent per installment; even-splitting it contradicts what the Collector sees. |
| 2 | When a payment already covers the full (undiscounted) amount, should the system (a) block the discount, (b) warn but allow saving it as a no-op, or (c) apply the discount and carry the excess to the next installment / advance? | Finding 4. Option (c) is a business-policy change: it turns a discount into credit. | (a) Block, with a message telling the Collector to reduce the payment amount or remove the discount. Ask the client before any (c). |
| 3 | Should a discount be allowed on an installment that this payment does not allocate to? | Finding 2. Today it is silently dropped. | No. Reject with a clear error. |
| 4 | When a Collector interest discount lands on a row that already has an origination `discount_amount`, should it keep replacing (current, deliberate per plan line 455-459) or take the larger of the two? | If the Collector discount is smaller, today the borrower ends up owing more than before the discount. | Keep replacing (out of scope here), but block a Collector interest discount smaller than the row's existing discount. Confirm with the client. |
| 5 | May we remove the collector/remedial direct-database write access on `dcr`, `dcr_items`, and `dcr_item_allocations` (Phase 4), so every write goes through the server routes? | Today a collector can bypass every server check (discount permission, caps, allocation checks) and can reopen a submitted DCR. Phases 1–3 are not a real safety boundary without this. | Yes. This is internal hardening with no client-visible behaviour change, and it can ship ahead of Q1–Q4. |

---

## Live database/system validation: 2026-10-01

Diagnostics ran on the live project. The simulations used write statements inside a PL/pgSQL `DO` block that always aborted with `RAISE EXCEPTION`, so every write rolled back. A follow-up read query confirmed 0 `SIM%` payments, installments #4/#5 on AN300516 still `pending` with `amount_paid` 0, and the balance unchanged at ₱63,463.80. **Note:** this departs from the skill's read-only rule. It is disclosed here.

1. **Live RPC = migration source.** `pg_get_functiondef('post_single_dcr_item')` matches `20260909002138_dcr_penalty_paid_split.sql`. The share calculation is `half_up(interest_discount_amount / v_interest_count)` and `half_up(penalty_discount_amount / v_penalty_count)`, applied only inside the `for v_alloc in jsonb_array_elements(p_allocations)` loop.
2. **Discounted lines in live data:** 6 `dcr_items` rows have a discount greater than 0, all posted:
   - 5 of the 6 were full-gross payments. Pass A closed the row and `discount_amount` stayed 0 (Finding 4).
   - 1 row carries ₱8,400 on installments `{3,2}` but allocates only to #2. #3's ₱4,200 share was never applied (Finding 2).
3. **Simulation, Finding 1 (AN300516, installments #4/#5, ₱21,154.60 each, interest-per-row ₱2,597.93):**
   - Input: payment ₱37,113.34, interest discount ₱5,195.86 on `{4,5}`, UI-default allocation of ₱21,154.60 on #4 and ₱15,958.74 on #5.
   - Result: #4 `paid` with discount 0; #5 `partial` with discount 0. ₱2,597.93 is left owing even though the borrower paid the agreed amount.
4. **Control (same input, net split of ₱18,556.67 each):** both installments `paid`, each with `discount_amount` ₱2,597.93. This proves the RPC's Pass B works when the allocation is net of the discount.
5. **Simulation, Finding 3 (penalty fees ₱100 on #4 and ₱900 on #5, ₱1,000 penalty waiver on `{4,5}`):**
   - Each row received `penalty_discount_amount` ₱500.
   - #4 was marked `paid` with only ₱20,754.60 paid against ₱21,154.60 principal, so ₱400 of principal was forgiven.
   - #5 kept ₱400 of a fee the Collector intended to waive.
6. **`recompute_outstanding_balance`** sums `amount_due − discount_amount + penalty_amount − penalty_discount_amount − amount_paid` over rows not `paid/rolled/moved`, so a correctly applied discount leaves no floating balance.
7. **Remedial DCR page has the same UI (verified).** `src/app/remedial/dcr/page.tsx` has its own discount selections (lines 190-218), its own `canDiscount` gate (line 199), sends totals only (line 580), and its own gross `installmentRemainingDue` (line 158, used at 484 and 532). It posts to the same `/api/collector/dcr` route (lines 413, 595, 629). It needs the same Phase 3 change.
8. **RLS on the DCR tables (`pg_policies`, verified):**
   - `dcr_items_write` and `dcr_item_allocations_write` are `ALL`, role `authenticated`. They allow super admin, or the DCR's own `collector_user_id = auth.uid()` while `dcr.status = 'draft'` with `collection`/`remedial` `edit` permission. No borrower write policy exists, so borrowers are blocked.
   - **Bypass:** the owning collector can INSERT or UPDATE `dcr_items` directly with the browser Supabase client. That skips `route.ts`'s `collector_discount` field-rule gate, `validateCollectorDiscountInput`, and the allocation and over-allocation checks.
   - **Wider bypass:** `dcr_collector_write` on `dcr` is `ALL` with **no status restriction**. A collector can set their own submitted DCR back to `draft`, re-edit its items, and set it to `submitted` again.
   - `dcr_ar_reconcile` (UPDATE, AR `execute_trigger`) is AR's write path and stays.
9. **Writes using the caller's own session (`grep from("dcr…")` in `src/`, verified).** Every other `dcr_items` / `dcr_item_allocations` write already uses `createServiceClient()` (`posting.ts:985, 1148, 1253`) or a SECURITY DEFINER RPC. The user-session writes are:
   - `dcr_items` insert at `posting.ts:1903` and `dcr_item_allocations` insert at `posting.ts:1937` (`addPaymentToDcr`);
   - `dcr` insert at `posting.ts:1609` (`createDcrDraft`);
   - `dcr` update to `submitted` at `posting.ts:1581` (`submitDcr`);
   - `dcr` updates at `posting.ts:961` (reject) and `posting.ts:1484` (reconcile). These are AR paths covered by `dcr_ar_reconcile`.
   - No browser-side page writes these tables; both DCR pages go through `/api/collector/dcr`.

## Audit findings

1. **Writers of the discount:** only `addPaymentToDcr` (`src/lib/ar/posting.ts:1898-1916`), via `POST /api/collector/dcr` `add_item` (`src/app/api/collector/dcr/route.ts`). Fields: `interest_discount_amount`, `interest_discounted_installment_nos`, `penalty_discount_amount`, `penalty_discounted_installment_nos`, `discount_reason`.
2. **Readers:** `post_single_dcr_item` (applies it) and `src/lib/documents/generators/payment-receipt.ts:73-146` (shows it only if it was actually applied on the schedule row, so it is safe and needs no change).
3. **Server validation gaps** (`validateCollectorDiscountInput`, `posting.ts:1653-1737`):
   - The interest maximum is `interestPerRow × count`. It does not check that the installments exist, are open, or are allocated.
   - The penalty maximum is a total across rows, not a per-row cap.
4. **UI:** the percent is chosen per installment (`page.tsx:1145-1190`), but only totals are sent (`page.tsx:592-603`). Rows default to `installmentRemainingDue`, which is gross of the new discount (`page.tsx:160`). The leftover-capacity block (`page.tsx:277-288`) then forces leftover money onto gross capacity.
5. **Auto-allocation (no `allocations` sent):** `computeAutoAllocation` (`posting.ts:41`) also ignores the new discount. The UI always sends allocations (`page.tsx:572-585`), so this path only matters for direct API callers. It is covered by the new server checks (Phase 2).
6. **Prior decisions:**
   - Even-split (plan lines 460-466) → Open question 1.
   - "Short even with discount → no discount written, `dcr_items` figures kept for paper trail" (plan lines 546-550) is preserved.
   - Replace-not-stack for origination discounts (plan lines 455-459) → Open question 4.
7. **Variants:**

| Variant | Supported today? | Change |
| --- | --- | --- |
| Interest discount, 1 installment | yes, if the payment is short of gross | Finding 4 warning/block |
| Interest discount, 2+ installments | broken (Findings 1, 2) | Phases 1–3 |
| Penalty discount, equal fees | works | none |
| Penalty discount, unequal fees | broken (Finding 3) | Phases 1–2 |
| Mixed percents per row | broken (even-split) | Phases 1–3 |
| Legacy posted/draft rows (no breakdown) | n/a | RPC falls back to even-split |

---

## Scope and constraints

### In scope
- Per-installment discount breakdown stored, validated, and applied.
- Server-side rejection of discounts on unallocated, closed, or nonexistent installments, and per-row caps.
- Modal re-fill of row amounts net of the selected discount.
- Finding 4 handling per Open question 2.
- The same modal changes on the Remedial DCR page.
- RLS hardening: collectors/remedial lose direct UPDATE/DELETE on `dcr` and all direct writes on `dcr_items` / `dcr_item_allocations`. The server performs those writes with the service client after its checks (Phase 4, Open question 5).

### Out of scope: do not change
- The Pass A/Pass B closure model.
- Origination discount reversion.
- The Offset tools.
- The receipt generator.
- Permission gating (`collector_discount` field rule).
- `computeAutoAllocation`'s behaviour for payments without a discount.

### Non-negotiable safety constraints
- The server re-derives every cap. The client breakdown is never trusted.
- The sum of breakdown amounts must equal the stored totals (to the centavo).
- Legacy `dcr_items` rows with a NULL breakdown post exactly as today.
- Migration is forward-only: a new `create or replace function`. Never edit `20260909002138`.

### Contract
`add_item` gains two optional fields:

```ts
interestDiscountLines?: { installmentNo: number; amount: number }[];
penaltyDiscountLines?:  { installmentNo: number; amount: number }[];
```

Rules:
- If lines are present, installment numbers are unique and each `amount` is greater than 0.
- `sum(lines.amount)` equals the matching `*DiscountAmount` (±0.01).
- The `*DiscountedInstallmentNos` arrays must equal the set of line installment numbers.

New errors (HTTP 400 via `handleApiError`):
- "Discount selected on installment N, but this payment is not allocated to it"
- "Installment N is already paid"
- "Interest discount on installment N exceeds its interest (X)"
- "Penalty discount on installment N exceeds its unpaid late fee (X)"
- Finding 4 (per Open question 2a): "This payment already covers the full amount due on installment N — remove the discount or reduce the payment"

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy, multi-row interest | Collector with discount rule | pay ₱37,113.34, 100% on #4, #5, modal re-fills ₱18,556.67 each | posted: both `paid`, `discount_amount` ₱2,597.93 each, no balance on #4/#5 |
| Mixed percent | Collector | 100% on #4, 50% on #5 | lines ₱2,597.93 / ₱1,298.97; RPC applies exactly those |
| Unequal penalty | Collector | fees ₱100/₱900, waive both 100% | `penalty_discount_amount` ₱100 / ₱900; principal untouched |
| Discount on unallocated row | Collector/direct API | discount on #3, allocation only #2 | 400, nothing saved |
| Discount on paid row | direct API | installment already `paid` | 400 |
| Per-row over-cap | direct API | ₱1,000 penalty line on a row with a ₱100 fee | 400 |
| Gross already covered | Collector | pay ₱21,154.60 + 100% interest on that row | per Open question 2 (recommended: 400 + UI block) |
| Lines/total mismatch | direct API | lines sum ≠ total | 400 |
| No discount permission | Collector without rule | any discount | 403 (unchanged, `route.ts` gate) |
| Direct DB write by borrower | borrower session | INSERT/UPDATE `dcr_items` | blocked (no borrower write policy; verified) |
| Direct DB write by collector | collector session, own draft | INSERT/UPDATE `dcr_items` or `dcr_item_allocations` | blocked after Phase 4 (RLS error); same action through `/api/collector/dcr` still works |
| Reopen a submitted DCR | collector session | UPDATE `dcr` set status='draft' | blocked after Phase 4 |
| Create draft / submit | collector via UI | `create` / `submit` actions | still work (submit now via the service client after the owner check) |
| AR reject / reconcile | AR via UI | existing routes | unchanged (`dcr_ar_reconcile` kept) |
| Remedial officer | remedial via UI | same discount cases as the Collector rows | same outcomes as the Collector rows |
| Legacy row | AR posts a draft created before deploy | NULL lines | even-split, exactly as today |
| Short even with discount | Collector | pay less than net | row `partial`, no discount written, `dcr_items` figures kept (unchanged) |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20261002090000_dcr_items_discount_lines.sql` | new | add `interest_discount_lines jsonb`, `penalty_discount_lines jsonb` (nullable) to `dcr_items`; `create or replace` `post_single_dcr_item` with per-row lookup + legacy fallback |
| `src/lib/ar/discount-lines.ts` | new | pure helpers: `validateDiscountLines`, `shareForInstallment`, `netRowAmountsForDiscount` |
| `src/lib/ar/posting.ts` | edit | `CollectorDiscountInput` gains lines; `validateCollectorDiscountInput` takes resolved allocations + does per-row checks; insert writes the lines |
| `src/app/api/collector/dcr/route.ts` | edit | zod schema accepts the two line arrays and passes them through |
| `src/app/collector/dcr/page.tsx` | edit | build lines from the per-row selections; re-fill allocation rows net of discount; Finding 4 block |
| `src/app/remedial/dcr/page.tsx` | edit | same three changes as the Collector page |
| `supabase/migrations/20261002091000_dcr_tables_server_only_writes.sql` | new | replace collector write policies on `dcr`, `dcr_items`, `dcr_item_allocations` |
| `src/lib/ar/__tests__/discount-lines.test.mts` | new | unit tests for the helpers |
| `src/lib/ar/__tests__/posting.test.mts` | edit | add validation tests for the new server checks |

## Phase 0: Failing tests first

### Task 0.1: discount-lines helpers
**File:** `src/lib/ar/__tests__/discount-lines.test.mts`
- [ ] Tests:
  - `validateDiscountLines` rejects a sum mismatch, duplicate installment numbers, and amounts ≤ 0.
  - `shareForInstallment(lines, 5)` returns that line's amount, and returns `null` when the lines are NULL (the RPC uses that to fall back).
  - `netRowAmountsForDiscount` for #4/#5 at ₱21,154.60 with ₱2,597.93 each and a ₱37,113.34 payment returns ₱18,556.67 / ₱18,556.67.
- [ ] Run: `npm test` → Expected: FAIL (module not found).

### Task 0.2: server validation
**File:** `src/lib/ar/__tests__/posting.test.mts` (existing stub-client style in this file)
- [ ] Tests: `addPaymentToDcr` throws for (a) a discount on an unallocated installment, (b) a per-row penalty over-cap, (c) a lines/total mismatch.
- [ ] Run: `npm test` → Expected: FAIL.

## Phase 1: Migration (deploy BEFORE code)

### Task 1.1
- [ ] `alter table public.dcr_items add column if not exists interest_discount_lines jsonb, add column if not exists penalty_discount_lines jsonb;`
- [ ] `create or replace function public.post_single_dcr_item(...)`: copy the live body exactly, and change only the two share expressions:

```sql
v_interest_share := case
  when v_dcr_item.interest_discount_lines is not null then coalesce((
    select (l->>'amount')::numeric from jsonb_array_elements(v_dcr_item.interest_discount_lines) l
    where (l->>'installmentNo')::int = v_schedule.installment_no), 0)
  when v_interest_count > 0 and v_schedule.installment_no = any(v_dcr_item.interest_discounted_installment_nos)
    then public.half_up(v_dcr_item.interest_discount_amount / v_interest_count)
  else 0 end;
-- identical pattern for v_penalty_share with penalty_discount_lines, then cap:
v_penalty_share := least(v_penalty_share, greatest(0, coalesce(v_schedule.penalty_amount,0)));
```

  Also add `interest_discount_lines, penalty_discount_lines` to the `select … into v_dcr_item`.
- [ ] Apply via the Supabase MCP `apply_migration`. This is the project's practice (memory: p8 migrations go through MCP, not `db push`).
- [ ] Verify (read-only): `select column_name from information_schema.columns where table_name='dcr_items' and column_name like '%discount_lines';` → 2 rows. `pg_get_functiondef` contains `interest_discount_lines`.

**Phase constraints:** with NULL lines, every existing behaviour is byte-for-byte unchanged.

## Phase 2: Server validation and storage

### Task 2.1
**Files:** `src/lib/ar/discount-lines.ts`, `src/lib/ar/posting.ts`, `src/app/api/collector/dcr/route.ts`
- [ ] Implement the helpers.
- [ ] Move the `validateCollectorDiscountInput` call to after `resolvedAllocations` (already the case at `posting.ts:1898`) and pass `resolvedAllocations` plus `openInstallments` in. For each discounted installment number, require:
  - the row exists and is open;
  - its `amortizationScheduleId` is in the allocations;
  - interest line ≤ `interestPerRow`;
  - penalty line ≤ charged − waived − already-paid fee for that row (reuse the existing `feePaidByScheduleId` logic);
  - Finding 4 (per Open question 2a): reject when the allocation on that row is ≥ the gross remaining due.
- [ ] If lines are omitted (an older client), derive even-split lines server-side so new rows always store lines.
- [ ] Insert `interest_discount_lines` / `penalty_discount_lines`.
- [ ] Run: `npm test` → Phase 0 tests pass.

## Phase 3: Collector modal

### Task 3.1
**Files:** `src/app/collector/dcr/page.tsx`, `src/app/remedial/dcr/page.tsx` (same edits in both; audit item 7)
- [ ] Build `interestDiscountLines` / `penaltyDiscountLines` from `interestDiscountSelections` / `penaltyDiscountSelections`, using the same per-row `halfUp(pct/100 × base)` math as `computeCollectorDiscount`.
- [ ] When any discount selection changes, re-fill each checked row's amount with `installmentRemainingDue(row) − thatRow'sDiscount`, then spill any remaining payment in installment order using `netRowAmountsForDiscount`.
- [ ] Disable Add and show the Finding 4 message when a discounted row's allocation ≥ its gross due.
- [ ] Manual check: AN300516-like account → record ₱37,113.34 → Allocate → tick 100% interest on the next 2 installments → the rows show ₱18,556.67 each → Add → Submit → AR Post → both installments `paid`, account balance reduced by ₱42,309.20.

## Phase 4: Server-only writes on DCR tables (Open question 5)

Can ship independently of Phases 1–3. Deploy order: **code first, then migration.** The code must already write with the service client before the policies are removed, otherwise add_item/submit break.

### Task 4.1: move session writes to the service client
**File:** `src/lib/ar/posting.ts`
- [ ] `addPaymentToDcr`: perform the `dcr_items` insert (line 1903) and the `dcr_item_allocations` insert (line 1937) with `serviceClient ?? createServiceClient()`. They run only after the existing owner + `status === 'draft'` check (lines 1755-1762) and all validations.
- [ ] `submitDcr`: perform the `dcr` update to `submitted` (line 1581) and the `payments` status update after it with the service client, after the existing owner/draft check (lines 1507-1515).
- [ ] Leave `createDcrDraft` (line 1609) on the session client. The new INSERT policy below covers it.
- [ ] Leave the AR writes at lines 961 and 1484 as they are (`dcr_ar_reconcile`).
- [ ] Run: `npm test` → existing posting tests pass. Tests that inject `serviceClient` keep working.

### Task 4.2: migration
**File:** `supabase/migrations/20261002091000_dcr_tables_server_only_writes.sql`

```sql
drop policy if exists dcr_items_write on public.dcr_items;
drop policy if exists dcr_item_allocations_write on public.dcr_item_allocations;

drop policy if exists dcr_collector_write on public.dcr;
create policy dcr_collector_insert_draft on public.dcr
  for insert to authenticated
  with check (
    status = 'draft'
    and collector_user_id = auth.uid()
    and (has_module_permission('collection','edit') or has_module_permission('remedial','edit'))
  );
-- super admin keeps direct write for support; AR keeps dcr_ar_reconcile.
create policy dcr_super_admin_write on public.dcr
  for all to authenticated using (is_super_admin()) with check (is_super_admin());
```

SELECT policies (`dcr_items_select`, `dcr_item_allocations_select`, and the `dcr` select policy) are untouched.

- [ ] Apply via the Supabase MCP `apply_migration`, **after** the Task 4.1 code is deployed to Vercel.
- [ ] Verify (read-only): `select tablename, policyname, cmd from pg_policies where tablename in ('dcr','dcr_items','dcr_item_allocations') order by 1,2;` → `dcr`: `dcr_ar_reconcile`, `dcr_collector_insert_draft`, `dcr_super_admin_write`, plus the existing select policy. `dcr_items` / `dcr_item_allocations`: select only.
- [ ] Manual check: as Collector, create a draft → add a payment → submit (all succeed). As AR, post and reject (both succeed). From the Collector's browser console, `supabase.from('dcr_items').update({penalty_discount_amount: 1}).eq('id', '<own draft item id>')` → 0 rows updated / RLS error.

**Phase constraints:** no change to who can *read* DCR data. No change to the AR routes.

## Phase last: Regression verification and rollout

- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Smoke tests:

| Role | Variant | Action | Expected |
| --- | --- | --- | --- |
| Collector | no discount | add + submit + AR post | identical to before |
| Collector | 1-row interest, short payment | post | `paid`, discount applied |
| Collector | 2-row interest | post | both `paid` |
| Collector | unequal penalties | post | each row waives exactly its fee |
| Collector | full payment + discount | add | blocked with message |
| AR | legacy draft (pre-deploy) | post | even-split as before |

- Phase 4 rows: Collector and Remedial create/add/submit all succeed. A direct console write to `dcr_items` is refused. AR post/reject/bounce are unchanged.
- Data check after deploy: `select count(*) from dcr_items where (interest_discount_amount>0 or penalty_discount_amount>0) and created after deploy and interest_discount_lines is null and penalty_discount_lines is null` → 0. `dcr_items` has no `created_at`, so join `dcr.created_at`.

## Rollback

1. Revert the code commit. The old client and server ignore the new columns.
2. If the RPC must revert, apply a forward migration re-creating the `20260909002138` body. Stored lines become inert, and NULL-or-not, the old body even-splits.
3. Rows written with lines stay valid. No data cleanup is needed.

## Commit

Work on `main` (project rule).

```
git add supabase/migrations/20261002090000_dcr_items_discount_lines.sql supabase/migrations/20261002091000_dcr_tables_server_only_writes.sql src/lib/ar/discount-lines.ts src/lib/ar/posting.ts src/app/api/collector/dcr/route.ts src/app/collector/dcr/page.tsx src/app/remedial/dcr/page.tsx src/lib/ar/__tests__/discount-lines.test.mts src/lib/ar/__tests__/posting.test.mts
```

Message: `fix(dcr): apply collector discounts per installment, server-only DCR writes`. If Phase 4 ships first, commit its two files (the `posting.ts` hunks for Task 4.1 + the `20261002091000` migration) separately as `fix(dcr): route collector DCR writes through the server`.

## Self-review

1. **Contradictions:** "Receipt untouched" holds, because the receipt reads the schedule rows. Finding 4 handling is gated on Open question 2, not silently chosen.
2. **Goal reachability:** new rows are fixed via Phases 2–3. Direct-API callers are covered by server-derived lines. Legacy unposted drafts keep the old behaviour, which is acceptable. Already-posted rows are not retro-fixed: the one live dropped ₱4,200 (Finding 2) is history. Flag to the client if a correction is wanted.
3. **Bypass:** the self-review found the direct-RLS bypass (audit item 8). It is fixed by Phase 4. After Phase 4 the remaining writers are the server (service client after checks), SECURITY DEFINER RPCs, AR via `dcr_ar_reconcile`, and super admin. Borrowers had no path (verified).
4. **Existence:** `post_single_dcr_item`, `validateCollectorDiscountInput`, `computeAutoAllocation`, `installmentRemainingDue`, `computeCollectorDiscount`, and `deriveInterestPerRow` were all seen. New files are marked new.
5. **Consistency:** Files table equals the commit list. Tests are under `src/lib/**/__tests__/*.mts`, matching the runner.
6. **Duplication:** the lines are a breakdown of the existing totals, which are kept for legacy rows and the receipt. The sum invariant is enforced on the server.
7. **Placeholders:** none. The migration timestamp is concrete. The implementer bumps it if it collides.

Audit sections not applicable: reporting/analytics scope (no report reads `dcr_items` discounts, per grep: only `posting.ts`, the receipt, and the two DCR pages).
