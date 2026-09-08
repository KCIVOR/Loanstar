# Task 2 — A full offset must close the target loan

**Sept-04 sprint tracker item.** Source: `docs/Development-Tracker-Sept-04.md`
Task 2; `docs/Meeting-Minutes-Sept-04.md` items 34–35 & action item; discount
rules from `loanstar/docs/meeting-minutes-2026-08-25.md` §4 + transcript.

Status: **plan — not started.** Label-clarity fix already shipped separately
(`ComputationPanel.tsx`, text only).

---

## 1. The one issue

A full offset (new loan pays off an existing loan of the same borrower) is
supposed to leave the target loan at **₱0, Closed**. In the Sept-04 demo it left
a balance and stayed `active`.

## 2. Root cause (live-verified on AN300442 = the demo's #442)

Rovick used the **correct** tool — `transfer_type = 'other_loan'` (the
"Offset — full settlement" UI; note the internal name / DB value are the reverse
of the label).

AN300442 is a **weekly** schedule: 12 interest installments (rows 1–12, ~₱1,155
→ ₱2,889 each, `line_type='standard'`) then one **balloon principal row 13 =
₱115,560**. `total_interest = 19,067.40`, `terms = 3`.

**Bug A — wrong per-installment interest (units mismatch).**
`src/app/api/csa/applications/[id]/computation/route.ts` (~line 229) derives the
per-row interest for the discount modal as `total_interest / terms`
= `19,067.40 / 3` = **₱6,355.80**, and hands that same figure to **every** future
installment. The schedule has 13 rows, not 3 — so each interest row's "interest
portion" is overstated ~4×. Ticking 3 rows makes `computeOffsetDiscount`
(`src/lib/computation/offset-discount.ts`) think 3 × ₱6,355.80 = the entire
₱19,067.40 interest is being waived. `netDiscount` = ₱19,067.40 − one-month
termination fee (₱6,355.80) = **₱12,711.60**.

**Bug B — even-split redistribution in `post_internal_transfer`.**
`supabase/migrations/20260831140000_post_internal_transfer_row_level_status.sql`
lines 70–84: `v_per_row := round(v_transfer.discount_amount / (v_n - 1), 2)` and
stamps that flat figure on every ticked row except the first. On AN300442 that
put **₱6,355.80 of discount on rows that owe only ₱2,311** (`line_type` doesn't
distinguish interest rows here — all `standard`). A row's net can't go below 0,
so **~₱4,000 × 6 rows ≈ ₱22k of discount evaporated**; the ₱115,560 balloon row
got only ₱6,355.80. `finalAmount` (`= balance − netDiscount`, set in
`ComputationPanel.tsx` `applyDiscountModal`) assumed the whole discount would
land, so the cash amount was ~₱15k short.

Result: balloon row 13 left `partial` — `115,560 − 6,355.80 − 94,181.40 =`
**₱15,022.80 still owed** → loan `active`.

**Bug C — fully-covered rows stuck `pending`.**
Waterfall loop lines 96–102: when `v_total_due - amount_paid <= 0` (a row whose
bloated discount already covers it) `v_applied <= 0 → continue`, so the row is
never touched. Rows 5,7,8,9,10,11 sit at `status='pending'` with net-owed 0 →
`is_account_fully_settled` (`20260831120000`) would be **false even at ₱0
balance**, so `account_status` can never flip to `paid` (line 123).

**Bug D — two transfers on one account clobber each other.**
`discount_amount` is written absolutely per row (line 80), last-writer-wins; no
per-transfer isolation, no accumulation guard. AN300442 got two posted transfers;
row 13's `discount_amount` ended at whatever the 2nd transfer wrote.

**Contrast (why it isn't caught everywhere):** AN300420 — discount ₱16,852.50,
ticked `[1..6]`, six ~equal early rows, no balloon in the set — **closed cleanly
at ₱0 `paid`.** The even split only works when the ticked rows are ~equal, i.e.
it breaks on weekly/invoice and Quarterly/Two-Monthly Special schedules (the
schedule type from this same sprint).

## 3. Settled — NOT in scope

- **Discount scope** (Aug 25 minutes §4 + transcript; Sept 1 §2; consistent
  Sept 4): interest only, never principal; **future not-yet-due months only**
  (overdue / current due-and-demandable paid in full); an **always-charged
  one-month termination fee** (the earliest not-yet-due month's interest, never
  discounted). This is correct as-is — do not widen it.
- **"Select all months"** — dropped. The full-settlement tool has no
  month-to-pay ticking; it auto-fills the whole balance. Its popup checkboxes
  only choose which interest to waive.
- **Label clarity** — already shipped.

## 4. Client decision (locked 2026-09-08)

If, at AR posting, the offset **cannot cover** the target's live balance (source
proceeds fixed too low, or interest accrued since CSA) → **BLOCK the post and
tell AR to reject + request a recomputed amount.** Never pay partial and leave a
balance.

## 5. Design

For a **full settlement** (`transfer_type = 'other_loan'`), `post_internal_transfer`
must guarantee the invariant:

> `cash applied` + `discount actually applied` = `target's live balance`, and
> every unpaid row ends `paid`.

Rather than trust the CSA-frozen split, posting **re-derives** it:

1. **Cap total discount** at the loan's remaining **interest** — never principal,
   never more interest than is actually left. Remaining interest for a target =
   `sum(amount_due of unpaid rows) − remaining principal`. Remaining principal is
   not stored per row; derive it as `computations.principal − principal_paid`,
   where `principal_paid` for a full settlement with no prior principal payments
   is 0, so **remaining interest = `sum(unpaid amount_due) − computations.principal`**
   for the common case. (Dual-line Quarterly/Two-Monthly Special: sum the unpaid
   `line_type='interest'` rows directly — cleaner, use it when present.)
2. **Distribute the capped discount greedily**, in `installment_no` order over
   the *discountable* rows (future, not-yet-due, per §3), applying
   `min(remaining share, that row's remaining net-of-nothing owed)` and
   **carrying the unused remainder to the next row** — so nothing is wasted and
   the balloon row absorbs what the small rows can't.
3. **Re-true the cash**: `required_cash = live_balance − discount_applied`. If
   `v_transfer.amount < required_cash − 0.01` → **raise** (Client decision §4:
   AR rejects + recomputes). Otherwise apply exactly `required_cash`.
4. **Waterfall** the cash oldest-first as today, but after the loop **force any
   row whose net owed is ≤ ₱0.01 to `status='paid'`, `paid_at = now`** (fixes
   Bug C).
5. `recompute_outstanding_balance` → 0; `is_account_fully_settled` → true;
   `account_status = 'paid'` (existing lines 118–124 then already work).
6. **Rounding:** if a sub-₱0.01 residue remains after 4, absorb it into the last
   discounted row (or the balloon row) so the loan lands on exact 0.

`transfer_type = 'offset'` (partial) path is **unchanged** — it already has no
discount and is not expected to close the loan.

## 6. Phases

### Phase 1 — SQL: rewrite the discount + settlement logic in `post_internal_transfer`
New migration `supabase/migrations/<ts>_post_internal_transfer_full_settlement.sql`
(+ mirror into `loanstar/supabase/migrations/` — see the two-folder gotcha in
`project_cig_flow_alignment`).
- Branch on `v_transfer.transfer_type = 'other_loan'` for the new path; leave the
  `'offset'` branch byte-identical.
- Implement §5 steps 1–6. Keep the existing `for update` locks, the
  `internal_transfer_allocations` inserts, the `recompute_outstanding_balance` /
  `is_account_fully_settled` / status lines, and the transfer status update.
- Replace the `v_per_row` even-split block (lines 70–85) with the greedy
  cap-and-carry loop.
- Add the shortfall `raise` (step 3) with a clear message AR sees.
- **Constraint:** do not touch `post_single_dcr_item`, `post_internal_transfer`'s
  `'offset'` branch, `recompute_outstanding_balance`, or `is_account_fully_settled`.

### Phase 2 — Fix the per-installment interest figure
`src/app/api/csa/applications/[id]/computation/route.ts` (~176–253).
- The modal's `interestPortion` must reflect a row's **actual** interest:
  - dual-line (`line_type='interest'`): the row's own `amount_due`;
  - weekly/invoice `standard` rows before a final principal row: the row's own
    `amount_due` (these rows *are* interest);
  - blended monthly `standard`: `total_interest / (count of standard rows)` —
    the real installment count, **not `terms`**.
- This only feeds the modal's display + `computeOffsetDiscount`'s estimate;
  posting (Phase 1) is now authoritative, so a wrong estimate here can no longer
  strand money — but it must be close enough that AR isn't surprised.
- **Constraint:** no change to `computeOffsetDiscount`'s signature or the
  even-split origination-discount path that shares this map.

### Phase 3 — CSA panel: stop pre-shrinking the amount for a full settlement
`src/components/csa/ComputationPanel.tsx` `applyDiscountModal` (~1315).
- For the full-settlement row, keep `amount = target's whole outstanding
  balance` (what `updateOtherLoanRowAccount` already sets); store the discount
  selection (`discountAmount`, `discountedInstallmentNos`) but **do not** set
  `amount = balance − netDiscount`.
- The displayed "final amount" line becomes `balance − (estimated discount)` for
  the CSA's information only; the value sent as `amount` stays the full balance.
- Lock the amount field (read-only) when the row is a full settlement with a
  linked account.
- **Constraint:** the `offsets[]` (partial) section and origination-discount
  modal untouched.

### Phase 4 — Plumb the full balance through
`src/lib/computation/deduction-breakdown.ts` `extractDeductionTargets`,
`src/lib/lra/release-service.ts` `createPendingInternalTransfers`.
- Confirm `amount` carried to `internal_transfers` for an `other_loan` target is
  the full balance (Phase 3 output), and `discount_amount` /
  `discounted_installment_nos` still ride along.
- No schema change — `transfer_type='other_loan'` already means full settlement.

### Phase 5 — "₱0 = Closed" consistency
- Confirm Phase 1 step 4 leaves zero `pending/partial/overdue` rows on a full
  settlement, so `is_account_fully_settled` passes.
- Align the `moved`-row mismatch: `recompute_outstanding_balance` excludes
  `moved`, `is_account_fully_settled` does not. Decide (small, isolated): either
  add `'moved'` to the `is_account_fully_settled` allow-list, or exclude `moved`
  rows from a full-settlement's closure check. **Needs a one-line confirm from
  the team** on whether a `moved` row should block closure.

### Phase 6 — Tests
- `src/lib/ar/__tests__/offset-discount-closure.test.mts` — extend the pure
  `simulateOffsetDiscountRowSplit` shadow to the new greedy cap-and-carry;
  add the AN300442 shape (12 small rows + ₱115,560 balloon, tick a subset) and
  assert **no discount wasted, balloon absorbs the remainder, sum = capped
  discount**.
- New pure helper + test for "remaining interest cap" and "required cash /
  shortfall" decision.
- `npm test` green; `tsc`/`build`/`eslint` clean on touched files.

### Phase 7 — Backfill + live re-verify
- One-off migration or script to settle the **stuck AN300442** (and any other
  `other_loan` transfer whose target is `active` with a residue ≈ wasted
  discount): re-run the corrected settlement, or manually zero + close with an
  audit note. List candidates first:
  `select … from internal_transfers where transfer_type='other_loan' and status='posted'`
  joined to `masterlist.account_status='active'`.
- Live: new full offset on a weekly / Special-schedule target → confirm ₱0 +
  Closed in the borrower portal and AR; confirm the shortfall path blocks with a
  clear message.

## 7. Constraints (do not touch)

- `post_single_dcr_item` and the DCR posting path.
- `post_internal_transfer`'s `transfer_type='offset'` (partial) branch.
- `recompute_outstanding_balance`, `netInstallmentDue`, `computeAutoAllocation`.
- Origination-discount and collector-discount code paths.
- The discount **scope** rules (§3) — future-only + termination fee stay.
- `computeOffsetDiscount` public signature.

## 8. Open items

- Phase 7: fix AN300442 in place, or leave as known demo residue? (Rovick)
- Phase 5 `moved`-row question — **resolved 2026-09-08**: a `moved` row does NOT
  block a full-settlement closure (default accepted).

---

## Progress log

- 2026-09-08 — **Phase 1 + Phase 5 done** (folded into one migration:
  `supabase/migrations/20260908132813_post_internal_transfer_full_settlement.sql`,
  mirrored both folders, applied live to `acopcwlhkovssjnrqygk`, verified with
  `pg_get_functiondef`).
  - `post_internal_transfer` now branches on `transfer_type`. `'offset'`
    (partial) path is byte-for-byte unchanged (even-split block, amount-exceeds
    guard, waterfall, close). `'other_loan'` (full settlement):
    - discount via **greedy cap-and-carry** — each discountable row
      (`status in pending/partial/overdue`, `line_type <> 'principal'`, skipping
      the earliest = termination fee) absorbs `least(budget_left, its net owed)`,
      remainder carries forward; budget capped at
      `least(CSA discount, live_balance − largest_unpaid_row)` so principal on a
      balloon schedule can never be waived even pre-Phase-2.
    - cash **re-trued**: `required = live_balance − discount_applied`; if
      `transfer.amount < required − 0.01` → **raise** (AR rejects + recompute).
    - after the waterfall: force every row whose net owed ≤ ₱0.01 to `paid`;
      absorb a ≤₱1.00 residue into the last unpaid row so the loan lands on 0.
    - closure check for a full settlement excludes `moved` rows (Phase 5), so a
      Move-of-Payment row no longer blocks `account_status='paid'`.
      `is_account_fully_settled` itself untouched (partial path still uses it).
- 2026-09-08 — **Phases 2, 3, 4, 6 done.**
  - **Phase 2** — per-installment interest moved to a testable helper
    `src/lib/computation/offset-interest.ts` (`interestByInstallment`) and wired
    into the CSA route (`.../computation/route.ts`): dual-line Special uses
    `line_type`; weekly/invoice interest-only+balloon uses each small row's own
    amount (balloon carries `amount_due − principal`); blended monthly/semi
    even-splits across the real row count (not `terms`). Route now fetches all
    schedule rows + `computations.principal` (dropped `terms`/`payment_frequency`
    from that select).
  - **Phase 3** — `ComputationPanel.tsx`: `applyDiscountModal` keeps
    `amount = balance − netDiscount` (correct once Phase 1 makes the discount
    land) with a comment tying it to the AR re-true; the full-settlement amount
    is now **read-only** whenever a real account is linked (`hasDiscount || match`
    → static pill, no editable input) so it can't be hand-lowered below the
    balance. Plain full balance path unchanged.
  - **Phase 4** — no code change: `extractDeductionTargets` /
    `createPendingInternalTransfers` already carry `amount` + `discount_amount` +
    `discounted_installment_nos` for `transfer_type='other_loan'`.
  - **Phase 1 SQL hardened** while writing tests: added a **principal-balloon
    exclusion** (`v_balloon_no` = largest unpaid row when ≥ `computations.principal
    × 0.99`) so a `line_type='standard'` balloon row can't receive discount even
    if ticked, not just the `(balance − largest_row)` budget cap. Re-applied live
    + mirrored.
  - **Phase 6** — `src/lib/ar/__tests__/offset-discount-closure.test.mts`
    rewritten: `simulateEvenSplit` (legacy `'offset'` path, byte-preserved) +
    `simulateFullSettlement` (new greedy path incl. balloon exclusion, shortfall
    block, force-paid, residue) + `interestByInstallment` cases. 12 tests.
  - Regression: `npm test` **1619/1619**; `tsc` clean on touched files;
    `npm run build` ✓; `eslint` clean on the four touched files (the 1
    pre-existing `useRateHistoryRow` error at ComputationPanel.tsx:2510 is
    untouched by this work).
  - **Pending: Phase 7** — backfill AN300442 (blocked on Rovick: fix in place vs
    leave) + live re-verify a fresh full offset on a weekly/Special target.
- 2026-09-08 — **Deep validation (codebase + live DB dry-runs, all rolled back).**
  - **Found & fixed a parallel bug:** `src/app/api/committee/applications/[id]/route.ts`
    builds `activeLoans` / `futureInstallments` **independently** of the CSA route
    (for Committee overrides of an offset) and still had the old
    `total_interest ÷ terms` interest figure. Now uses the same
    `interestByInstallment` helper. `tsc`/`eslint` clean; `npm test` 1619/1619;
    `npm run build` ✓.
  - **Live dry-runs on `post_internal_transfer`** (BEGIN … ROLLBACK, nothing
    persisted):
    - AN300431 (weekly, ₱115,020, ₱108k balloon at row 13), full settlement +
      ₱4,000 discount on [7,8,11], amount = full balance → **`account_status`
      'paid', balance ₱0.00, 0 non-paid rows, discount on the balloon = 0**
      (row 8 force-paid via discount, row 11 partial disc + cash, row 13 paid
      full cash).
    - Same account, offset amount ₱50,000 (below the ₱115,020 needed) →
      **raises** "This offset provides 50000.00 but the target loan needs
      115020.00 to close … Reject this transfer and ask CSA for a recomputed
      amount." — reaches AR as an `<Alert>` (verified the error path:
      `postInternalTransfer` → `handleApiError` → `toJsonError` passes the
      message through; AR page shows `data.error`).
    - AN300431 partial `'offset'` ₱5,000 → oldest-first: rows 7,8 paid, row 11
      partial, row 13 untouched, no discount, no force-paid, no close —
      **legacy behaviour byte-identical**.
    - AN300449 (quarterly_special dual-line, has a `moved` row) full settlement →
      **'paid', ₱0.00, moved row did not block closure** (Phase 5), discount on
      `line_type='principal'` rows = 0.
  - Live function fingerprints confirmed (balloon exclusion wired, shortfall
    block, Phase 5 moved-row, legacy even-split intact); migration `20260908132813`
    recorded; both migration folders byte-identical; no stale `20260908000000`.
- 2026-09-08 — **Phase 7 (part 1): full browser end-to-end re-verify, then
  reverted.** Logged in as AR, seeded a pending `other_loan` transfer for
  **AN300431** (weekly, ₱115,020 owed, ₱108,000 balloon at inst 13), amount =
  full balance, ₱4,000 discount on inst [7,8,11]. Screenshots captured:
  1. AR *Internal transfers* — pending row, "Offset (full payoff)", target
     current balance **₱115,020.00**, discount ₱4,000 inst 7–8,11.
  2. Confirm dialog — *"…settling the account's current balance of ₱115,020.00
     in full."*
  3. **"Posted — AN300431 balance updated"**, 0 pending.
  4. AR *Masterlist* — AN300431 **OUTSTANDING ₱0.00 · STATUS paid**.
  5. AR *Posting History → Closed accounts* — AN300431 ₱0.00, **Closed Sep 8**.
  6. Account detail — **OUTSTANDING BALANCE ₱0.00 · Installments paid 13/13
     (100%)**. Ledger: inst 7 paid cash (fee row, no discount), inst 8 discount
     ₱2,160, inst 11 discount ₱1,840 + ₱860 cash, **inst 13 balloon ₱108,000
     paid in full, discount ₱0**. Discount applied = ₱4,000 exactly, none wasted.
  Then **restored AN300431** to its exact pre-test snapshot (transfer +
  allocations deleted, schedule rows + masterlist row reverted; verified back to
  `active` / ₱115,020 / 4 open rows / 0 leftover transfers).
  Cosmetic observation (pre-existing, not Task 2): the AR confirm dialog copy
  reads "Cash ₱115,020 + ₱4,000 discount = ₱119,020" — over-counts because it
  shows the raw transfer amount, not the re-trued cash (₱111,020). And the
  account ledger's running-balance total ends at ₱4,000 (it prints the discount
  column but never as a credit line) even though the derived balance is ₱0. Both
  are ledger/dialog display quirks that affect every discounted settlement, not
  new. Worth a small follow-up.
- **Left: Phase 7 (part 2)** — the stuck **AN300442** backfill only (Rovick: fix
  in place vs leave).
