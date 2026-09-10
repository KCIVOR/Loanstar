# Penalty — "a paid late fee sticks" (fee-paid protection)

**Status:** IMPLEMENTED (Phases 1–3 live; Phase 4 not needed) — 2026-09-09
**Branch:** `develop`
**Author:** Claude (2026-09-09)

---

## EXECUTION LOG (2026-09-09, implemented directly by Claude at user request)

| Phase | What | Result |
|---|---|---|
| **1** | Migration `20260909045310_penalty_fee_paid_protection.sql` — `recompute_account_penalties`: `v_fee_paid = SUM(postings.penalty_amount)`, carved out of the base (`- GREATEST(0, amount_paid - v_fee_paid)`), and `v_target := GREATEST(v_target, v_fee_paid)` floor. Both branches (on-time zero, paid CONTINUE) untouched. | Applied live (version `20260909045310`). Both folders byte-identical (md5 `c0e02097…`). Dry-run on synthesized AN300459 #4 (₱41,140 paid, ₱3,740 tagged): fee held at **₱3,740** (was shrinking to ₱1,683 — negative control confirmed). |
| **2** | Migration `20260909045617_aging_accrual_fee_paid_carveout.sql` — `refresh_one_masterlist_aging` accrual loop: select `fee_paid`, subtract `GREATEST(0, amount_paid - fee_paid)`. No floor (loop only adds periods). Move-of-payment / aging ladder / discount reversion / masterlist UPDATE verbatim (verified by string checks). | Applied live (version `20260909045617`). Both folders byte-identical (md5 `68362f6d…`). Dry-run aged AN300459 #4 to 2 months overdue: next round = 5% × (37,400 remaining + 3,740 running) = **₱2,057** → penalty ₱5,797 (negative control without carve-out = ₱1,870 → ₱5,610). |
| **3** | `src/lib/ar/__tests__/penalty-accrual.test.mts` — `feePaid` added to `Row`/`baseRow` and `simulateRecomputeRow` opts; both `bal` formulas carve it out; recompute gets the `Math.max(target, feePaid)` floor. 6 new `it`s in a new describe block. | `npm test` **1625 pass / 0 fail** (was 1619; +6). eslint + tsc clean on changed files. |
| **4** | Backfill of already-shrunk live rows. | **Not needed** — the blast-radius query (`SUM(postings.penalty_amount) > penalty_amount` on non-`paid` rows) returned **0 rows**. The only shrunk-fee rows on the whole DB are AN300459 #2/#3, which are `status='paid'` (test data) and are deliberately left alone by Phase 1's `paid` CONTINUE. No migration written. |

**Files touched:** 2 new migrations (×2 folders) + 1 test file. Nothing in the DO-NOT-TOUCH list changed (verified live via `pg_get_functiondef` string checks: move-of-payment reverts, aging ladder, discount reversion, masterlist UPDATE, Rule 4a all intact).

### Phase 5 (follow-up, 2026-09-09) — modal shows a fee that was already paid

Surfaced during validation: the collector **Allocate payment** modal's
"Penalty discount" and "Late fee paid" tables read
`amortization_schedules.penalty_amount` raw. Since Phase 1 makes that column
hold the **charged** figure after a fee is paid, the modal offered
installment #2's ₱3,740 "Fee owed" when the real remaining fee was **₱0**.
(Not a money bug — `post_single_dcr_item` caps `v_pen_paid` at the unpaid
remainder — but misleading.)

| Part | Change | Notes |
|---|---|---|
| 5a | `src/app/api/collector/dcr/allocation-preview/route.ts` — select `penalty_discount_amount`; grouped `SUM(postings.penalty_amount)` per schedule (service-role, like `pendingByInstallment`); compute `feeOwed = max(0, penaltyAmount − penaltyDiscountAmount − feePaid)`; `penaltyEligible` now filters on `feeOwed > 0` (was `penaltyAmount > 0`). | Single route — used by BOTH collector and remedial DCR pages. |
| 5b | `src/app/collector/dcr/page.tsx` — `PenaltyEligibleInstallment` gains `feeOwed`; the "Penalty discount" and "Late fee paid" tables + the discount-total useMemo use `feeOwed`; the fee-paid `<Input>` gets `max={inst.feeOwed}`. | Display + client cap. |
| 5c | `src/lib/ar/posting.ts` `validateCollectorDiscountInput` — `maxPenalty` now subtracts `penalty_discount_amount` and `SUM(postings.penalty_amount)` per row, so a waiver can't exceed what is still owed (an already-paid fee is no longer waivable → no ₱-windfall). | Server guard, matches the UI. |
| **Remedial** | **No change needed.** `src/app/remedial/dcr/page.tsx` has no penalty-discount / late-fee-paid tables; its allocation grid's `installmentRemainingDue` (`amountDue − discount + penaltyAmount − amountPaid`) already nets correctly because the fee payment sits inside `amountPaid`. The shared route change adds fields it doesn't read — verified no regression (tsc clean, no `penaltyEligible`/`feeOwed` references). | — |

**Verification:** replicated the new `feeOwed` query live against AN300459 —
installment #2 (charged ₱3,740, `SUM(postings.penalty_amount)` ₱3,740) →
`feeOwed 0`, `in_penaltyEligible = false` → drops out of both tables. Full
suite **1625 pass / 0 fail**; tsc clean on all changed files. (The one eslint
error in `collector/dcr/page.tsx` line ~241, `void load()` in a `useEffect`,
pre-exists on `develop` — confirmed via `git stash`.)

**Not committed** — all changes (Phases 1–5) sit uncommitted on `develop`
pending the user's review / commit.

**Known residue (test data only):** AN300459 #2/#3 are `paid` with `penalty_amount` ₱1,683 but `SUM(postings.penalty_amount)` ₱3,740 — a pre-fix shrink artifact on now-settled rows. Harmless, cosmetic; clears on the next reset of that test loan.

---

---

## How to use this file

This follows the standing Cursor-handoff workflow:

1. Claude wrote this surgical-mode plan. Each phase is small and single-purpose.
2. Run it through Cursor **one `## Phase N` at a time** — not all at once.
3. Cursor outputs a summary of what it changed for that phase.
4. Paste that summary back to Claude, who validates it against this file
   (scope creep, missed items, wrong implementation, breakage) **including a
   real `git diff` and `list_migrations` check** — before the next phase.
5. **After every phase is done, Cursor produces one combined summary** covering
   all files + migrations + tests across every phase, for a final end-to-end
   validation pass before this is marked Done.

Do not let Cursor touch anything in the **DO NOT TOUCH** list below.

---

## Background — the bug this fixes

The late fee on an installment is `5% × (installment's remaining balance)`,
recomputed after every payment (`recompute_account_penalties`) and each night
(`refresh_one_masterlist_aging`). This is the client's stated model
(`transcription-2026-08-25.md` ~2:55–3:24: *"kung ano yung balance, yun yung
kinukumputan niya ng penalty"* / *"i-re-recompute… mag-auto-adjust"*).

Consequence a collector hit while testing (live AN300459):

- Month owes ₱74,800. It's 1 month late → fee charged = 5% × 74,800 = **₱3,740**.
- Borrower pays **₱41,140** (₱37,400 principal + the ₱3,740 fee), and the
  collector types **₱3,740** into the **"Late fee paid"** box for that month.
- After posting, `recompute_account_penalties` re-derives the fee on the new
  balance: 5% × (74,800 − 41,140) = 5% × 33,660 = **₱1,683**. It overwrites the
  ₱3,740 and logs a −₱2,057 "Late fee reduced after payment recompute" row.

So the ₱3,740 the borrower actually paid toward the fee also **shrinks the fee
that is charged** — a double benefit. The "Late fee paid" box today only feeds
`postings.penalty_amount` (income reporting); it has no effect on the fee math.

## The decision (made 2026-09-09, client not reachable)

**Once an amount has been paid toward a month's late fee, that month's fee can
never be recomputed below what was paid.** The fee-paid portion of a payment
also must not count as paying down principal (so it doesn't drag the
compounding base down).

- This **diverges from the literal transcript** ("recompute on the remaining
  balance"). The client was unavailable; the collector/PO chose this. Logged
  here so it is not mistaken for spec.
- The fee still **grows** month-over-month on the remaining balance. "Sticks"
  means it can't go *backwards* below what's been paid — not frozen.
- An **on-time** payment still zeroes the fee entirely (Rule 4a) — unchanged.

---

## Audit findings (verified live on `acopcwlhkovssjnrqygk`, 2026-09-09)

| Object | Current state (verified) | Needs change? |
|---|---|---|
| `recompute_account_penalties(uuid)` | ELSE branch computes `v_bal = amount_due − discount − penalty_discount − amount_paid + v_running`; `v_target := v_running`. Rule 4a (`v_ontime_paid >= v_net_due` → `v_target := 0`) and the `status = 'paid'` → `CONTINUE` guard are separate branches. | **YES — Phase 1** |
| `refresh_one_masterlist_aging(uuid,date)` | Accrual loop: `v_running_penalty := v_row.penalty_amount`; only runs periods `periods_applied+1 .. target_periods` (never shrinks); `v_bal = amount_due − discount − penalty_discount − amount_paid + v_running_penalty`. | **YES — Phase 2** (carve-out only; no floor needed — it never shrinks) |
| `postings.penalty_amount` | Written by `post_single_dcr_item` for **every** allocation — Phase 4b collector override when the installment is tagged, else Phase 4a auto "penalty-first" split, else 0 for on-time. No un-post path exists. `SUM(postings.penalty_amount)` per `amortization_schedule_id` = total fee money recorded against that installment. | No — **this is the "fee paid so far" source. No new column.** |
| `recompute_outstanding_balance(uuid)` | `SUM(GREATEST(0, half_up(amount_due − discount + penalty − penalty_discount − amount_paid)))` WHERE `status NOT IN ('paid','rolled','moved')`. | **NO** — already nets correctly once `penalty_amount` stops being shrunk (74,800 + 3,740 − 41,140 = 37,400 = remaining principal). |
| `src/lib/ledger/build-account-ledger-rows.ts` | 2026-09-09 fix folds each row's `netPenalty` into the debit basis + running balance; Report Total reconciles to `outstanding_balance`. | **NO** — with `penalty_amount` held at ₱3,740, debit 78,540 − credit 41,140 = 37,400 = derived balance. Already correct. |
| `src/lib/ar/__tests__/penalty-accrual.test.mts` | Pure-JS shadows: `simulateRecomputeRow` → `recompute_account_penalties`; `simulateMonthlyAccrual` → aging loop. Line-for-line mirrors, asserted to catch SQL drift. | **YES — Phase 3** |
| `src/lib/ar/posting.ts` `refreshMasterlistAging` (TS twin) | Orphaned since the roll-forward removal — only `dev-simulate-aging` reached it and now goes via SQL RPC. Already stale (flat-fee era). | **NO** — leave as-is; note only. |
| `dcr_items.penalty_paid_amount` / `penalty_paid_installment_nos`, `addPaymentToDcr`, `/api/collector/dcr`, collector DCR page "Late fee paid" table | Already capture the collector-typed fee amount and pass it to `post_single_dcr_item`, which writes it to `postings.penalty_amount`. | **NO** — the input path is done. |

### Worked example with the fix (live AN300459 month #4, ₱74,800, 1mo late, ₱41,140 paid, ₱3,740 tagged)

```
v_fee_paid           = SUM(postings.penalty_amount for this row) = 3,740
principal_paid        = amount_paid − v_fee_paid = 41,140 − 3,740 = 37,400
period 1 base v_bal   = 74,800 − 0 − 0 − 37,400 + 0 = 37,400
period 1 add          = half_up(37,400 × 0.05) = 1,870
v_running / v_target  = 1,870
v_target (floored)    = GREATEST(1,870, v_fee_paid 3,740) = 3,740
v_delta              = 3,740 − penalty_amount(3,740) = 0  → row unchanged, fee holds at 3,740
outstanding for row   = GREATEST(0, 74,800 + 3,740 − 41,140) = 37,400  (remaining principal) ✓
```

2 months late later: period 1 → 1,870 (running 1,870); period 2 base = 74,800 −
37,400 + 1,870 = 39,270, add 1,963.50, running 3,833.50; floored
`GREATEST(3,833.50, 3,740) = 3,833.50` → fee grows normally.

---

## Phase 1 — `recompute_account_penalties`: carve out fee-paid + floor

**New migration** (both folders, byte-identical), `CREATE OR REPLACE FUNCTION
public.recompute_account_penalties(uuid)`. Copy the **current** body verbatim
and make exactly these three edits:

1. **Declare** one new variable in the `DECLARE` block:
   ```sql
   v_fee_paid numeric;
   ```

2. **Inside the `FOR v_row` loop**, right after the existing
   `SELECT ... INTO v_ontime_paid ...` block, add:
   ```sql
   -- Fee money already collected against this installment (Phase 4a auto
   -- split + Phase 4b collector override both land in postings.penalty_amount).
   -- It must NOT count as paying down principal, and it is a floor the
   -- recomputed fee cannot drop below.
   SELECT COALESCE(SUM(po.penalty_amount), 0)
   INTO v_fee_paid
   FROM public.postings po
   WHERE po.amortization_schedule_id = v_row.id;
   ```

3. **In the `ELSE` branch only** (the late-payment recompute — NOT the
   `v_ontime_paid >= v_net_due` branch, NOT the `status = 'paid'` CONTINUE):
   - change the period-loop balance line from
     ```sql
     - v_row.amount_paid
     ```
     to
     ```sql
     - GREATEST(0, v_row.amount_paid - v_fee_paid)
     ```
   - immediately after `v_target := v_running;` add:
     ```sql
     -- A late fee that has already been (partly) paid never recomputes lower
     -- than what was collected against it (decision 2026-09-09).
     v_target := GREATEST(v_target, v_fee_paid);
     ```

**Everything else verbatim:** Rule 4a on-time zeroing, the `status = 'paid'`
CONTINUE, `v_net_due`, the `v_delta` / `targetPeriods` skip guard, the
`UPDATE amortization_schedules` (incl. its `status` CASE and `paid_at` CASE),
the `penalties` reversal + signed compensating-row insert.

**Constraints:**
- Do NOT change the function signature or the on-time branch.
- Do NOT add a floor to the on-time (`v_target := 0`) path.
- Do NOT touch any other function in the same migration file — this migration
  contains only this one `CREATE OR REPLACE`.
- Rename the local file to the `apply_migration` timestamp after applying;
  keep both folders identical.

**Dry-run before applying** (`BEGIN; … ROLLBACK;` via `execute_sql`), against
AN300459 (`masterlist_id c60d90ac-0774-4fd6-a739-959e0061fdc0`) in the
post-payment state:
```sql
BEGIN;
-- apply the CREATE OR REPLACE here
SELECT public.recompute_account_penalties('c60d90ac-0774-4fd6-a739-959e0061fdc0');
SELECT installment_no, status, amount_paid, penalty_amount, penalty_periods_applied
FROM public.amortization_schedules
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND installment_no <= 3
ORDER BY installment_no;
-- EXPECT: the overdue partial row's penalty_amount is >= its SUM(postings.penalty_amount),
--         NOT shrunk to 5% of the post-payment balance.
ROLLBACK;
```

---

## Phase 2 — `refresh_one_masterlist_aging`: carve fee-paid out of the accrual base

**New migration** (both folders), `CREATE OR REPLACE FUNCTION
public.refresh_one_masterlist_aging(p_masterlist_id uuid, p_as_of date DEFAULT
CURRENT_DATE)`. Copy the **current** body verbatim and make exactly these two
edits, both inside the `-- PENALTY ACCRUAL` `FOR v_row IN … LOOP`:

1. Add one column to that loop's `SELECT` list (it selects into a `RECORD`, so
   no DECLARE change needed):
   ```sql
   COALESCE((
     SELECT SUM(po.penalty_amount)
     FROM public.postings po
     WHERE po.amortization_schedule_id = s.id
   ), 0) AS fee_paid
   ```

2. In the inner `FOR v_p IN … LOOP`, change the `v_bal` line from
   ```sql
   - v_row.amount_paid
   ```
   to
   ```sql
   - GREATEST(0, v_row.amount_paid - v_row.fee_paid)
   ```

**No floor here** — this loop only ever *adds* periods (`v_target_periods <=
v_row.periods_applied THEN CONTINUE`) and starts from the existing
`v_row.penalty_amount`, which Phase 1 already protects. It never shrinks.

**Constraints — DO NOT TOUCH, verbatim:**
- The move-of-payment revert blocks (the three `DELETE`/`UPDATE` on
  `amortization_schedules` / `pdc_checks` with `move_of_payment_deadline < p_as_of`).
- The `v_overdue` SELECT, `v_has_overdue`, the aging-bucket `IF` ladder.
- The `v_reverted_discount_total` SELECT + the `discount_amount = 0` UPDATE.
- The final `UPDATE public.masterlist` (aging_bucket, remedial_flag,
  account_status, total_loan, outstanding_balance CASE).
- `v_penalty_rate` / `penalty_rate_for_segment`, the config-threshold read.
- No rollover logic (it was removed 2026-09-09 — do not reintroduce).

**Dry-run:** age AN300459 forward one more month
(`p_as_of := due_date + 2 months`) in a `BEGIN; … ROLLBACK;` and confirm the
new period's `v_add` is `5% × remaining_principal` (fee-paid excluded), and the
protected months keep their held fee.

---

## Phase 3 — update the pure-JS shadow tests

File: `src/lib/ar/__tests__/penalty-accrual.test.mts`. Keep them line-for-line
mirrors of the Phase 1 + Phase 2 SQL.

1. **`simulateMonthlyAccrual`** — add `feePaid` to the `Row` type (default `0`
   in `baseRow`) and change the `bal` expression to subtract
   `Math.max(0, row.amountPaid - row.feePaid)` instead of `row.amountPaid`.

2. **`simulateRecomputeRow`** — add `feePaid: number` to `opts`. In the `else`
   (late) branch only:
   - `bal` subtracts `Math.max(0, row.amountPaid - feePaid)` instead of
     `row.amountPaid`;
   - after `target = running;` add `target = Math.max(target, feePaid);`.
   Leave the `onTimePaid >= netDue` and `status === "paid"` branches unchanged.

3. **New `it(...)` cases** (node:test / `assert/strict`):
   - "a paid late fee is not recomputed below what was collected" — row
     `amountDue 74_800, amountPaid 41_140, penaltyAmount 3_740`, `feePaid 3_740`,
     `elapsedMonths 1` → `penaltyAmount` stays `3_740` (not `1_683`), `delta 0`.
   - "fee money is excluded from the compounding base" — same row, assert the
     internal period-1 `add` is `half_up(37_400 * 0.05) = 1_870`, not `1_683`.
   - "partial fee payment floors the fee at the partial amount" — `feePaid
     2_000`, recompute would give `< 2_000` → result floored to `2_000`.
   - "on-time payment still zeroes the fee even with feePaid > 0" —
     `onTimePaid >= netDue`, `feePaid 3_740` → `penaltyAmount 0`.
   - `simulateMonthlyAccrual`: "next month compounds on remaining principal,
     not the fee-reduced balance" — `amountPaid 41_140, feePaid 3_740,
     penaltyAmount 3_740, periodsApplied 1`, target 2 → new round is
     `half_up((74_800 - 37_400 + 3_740) * 0.05)` ... (compute and assert the
     exact figure).

4. Update any existing assertion in this file whose expected number changes
   because the base formula changed. Run `npm test`; expect the count to rise
   by the number of new `it`s, 0 failures.

**Constraint:** touch only `penalty-accrual.test.mts`. Do not modify
`build-account-ledger-rows.test.mts` (the 2026-09-09 ledger fix already covers
reconciliation) or any other test file.

---

## Phase 4 — (OPTIONAL) heal already-shrunk live rows

Only if the team wants existing accounts corrected now rather than on their next
payment. Rows where a fee was shrunk pre-fix have
`penalty_amount < SUM(postings.penalty_amount)`.

**New migration**, a `DO` block:
```sql
DO $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT s.masterlist_id
    FROM public.amortization_schedules s
    JOIN public.postings po ON po.amortization_schedule_id = s.id
    WHERE s.status NOT IN ('paid','rolled','moved')
    GROUP BY s.masterlist_id, s.id, s.penalty_amount
    HAVING COALESCE(SUM(po.penalty_amount),0) > s.penalty_amount + 0.005
  LOOP
    PERFORM public.recompute_account_penalties(r.masterlist_id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'healed % account(s)', v_n;
END $$;
```

Run the `SELECT DISTINCT … HAVING …` first on its own to see the blast radius
and eyeball each account before committing. `recompute_account_penalties`
inserts a signed `penalties` row for the correction (audit trail preserved).

**Constraint:** this migration contains only the `DO` block — no function
redefinition, no schema change.

---

## DO NOT TOUCH (any phase)

- `post_single_dcr_item` — already writes `postings.penalty_amount` correctly
  (Phase 4a/4b). No change.
- `recompute_outstanding_balance` — formula already nets correctly.
- `src/lib/ledger/build-account-ledger-rows.ts` + its test — the 2026-09-09
  penalty-fold-in fix already reconciles Report Total.
- `dcr_items` / `dcr_item_allocations` schema; `addPaymentToDcr`;
  `/api/collector/dcr/route.ts`; `src/app/collector/dcr/page.tsx` — the
  "Late fee paid" input path is complete.
- All move-of-payment columns and logic (`moved_at`, `move_of_payment_batch_id`,
  `move_surcharge_amount`, deferral rows, `pdc_checks` held/replaced).
- Rollover / quarantine rows and `carried_*` columns (roll-forward is removed;
  the 9 quarantined historical rows stay untouched).
- Aging-bucket thresholds, `remedial_turnovers`, 91+ turnover.
- `sumPenaltyIncome` / `src/lib/reports/**` — reporting already sums
  `postings.penalty_amount`.
- `penalty_rate_for_segment`, `half_up`, `is_account_fully_settled`.
- `refresh_all_aging` (the per-account error-isolation wrapper).
- `src/lib/ar/posting.ts` `refreshMasterlistAging` (orphaned TS twin) — leave
  stale; do not "sync" it.
- Any migration file already applied — never edit in place; always a new one.

---

## Rollback

Each phase is a `CREATE OR REPLACE` (Phase 1/2) or an idempotent `DO` block
(Phase 4). To revert: `CREATE OR REPLACE` the prior body from git history and
apply as a new migration. No column adds, no data destruction, so rollback is
a function-body swap only.

---

## Test-data note

AN300459 (`c60d90ac-0774-4fd6-a739-959e0061fdc0`, borrower Luz Torres) is the
live test loan. After each dry-run/validation, restore it to: 12 × ₱74,800 all
`pending`, due 2026-10-08 … 2027-09-08, `outstanding_balance` 897,600,
`account_status` active, `aging_bucket` current, no penalties / payments /
postings / turnovers, `assignments.remedial_user_id` NULL.
