# Implementation Plan: Remove 30-Day Roll-Forward from Delinquency Path

**Version:** 2.1 (production-ready — supersedes v2.0 / v1.0)
**Date:** 2026-09-09
**Status:** Ready for execution approval
**Companion doc:** `penalty-rollforward-audit.md` (transcript evidence)

---

## Revision History

| Version | Change |
|---------|--------|
| 1.0 | Initial plan |
| 2.0 | Rewritten after critical audit + live-database fact-finding. Fixes 3 blocking defects in v1.0. See "What Changed in v2.0". |
| 2.1 | Fixes 2 substantive gaps + 1 minor, found in a second live-DB review. See "What Changed in v2.1". |
| 2.2 | **Phase 1a executed.** AN300450 (`3638a07f`) reclassified AUTO → QUARANTINE: its rolled row fails reconciliation (recorded roll_amount ≠ recomputed — source state drifted post-roll). New baseline: **15 AUTO / 6 accounts, 9 QUARANTINE / 4 accounts**. New Fact 8; new Phase 1a.5 pre-check; the Phase 1c quarantine set now also excludes reconciliation-failures; Phase 1d drops to 6 accounts. 1a.1/1a.2/1a.3 all passed. |

### What Changed in v2.2 (read this first)

Phase 1a was run live on `acopcwlhkovssjnrqygk`. Results:

| Check | Outcome |
|-------|---------|
| 1a.1 classification | 24 rolled rows. **15 AUTO / 9 QUARANTINE** (not 16/8) — AN300450 moved to QUARANTINE. |
| 1a.2 one rollover penalty per rolled row | ✅ 0 offending rows |
| 1a.3 no pre-roll waiver | ✅ 0 rows |
| 1a.4 reconciliation per AUTO account | ✅ 6 of 7 — **AN300450 fails** (recorded 3,303.09 vs recomputed 6,448.89). See Fact 8. |

Changes: AN300450 added to the Phase 1b quarantine table and Fact 1; Fact 8 documents why; Phase 1a
gains **1a.5** (a reconciliation pre-check so this class is caught in read-only, not mid-migration);
the Phase 1c `_quarantined_masterlists` set now `UNION`s in any account with a non-reconciling
rolled row; Phase 1c counts 16→15 / 8→9; Phase 1d drops `3638a07f` (6 accounts, not 7).

### What Changed in v2.1

v2.0 was correct on the mechanics but left three things unhandled. All verified against the live
DB on 2026-09-09.

1. **Stored `masterlist.outstanding_balance` is never reconciled — and is already wrong.**
   `recompute_outstanding_balance` includes `penalty_amount` and excludes `status='rolled'`, but
   `refresh_one_masterlist_aging` only rewrites `outstanding_balance` when a discount reverts. So
   the frozen rollover penalties were never added to the stored balance. Measured live:
   AN300432 stored 203,979.60 vs derived 237,288.95 (−33,309.35); AN300362 −39,885.49;
   AN300418 −9,603.29; four more between −5k and −17k. v2.0's Phase 5.4 checkbox
   *"outstanding_balance now equals recompute_outstanding_balance"* would have failed on every AUTO
   account. **v2.1 adds Phase 1d** — an explicit reconcile of the 6 AUTO accounts' stored balance
   (which also fixes the pre-existing bug). Quarantined accounts are left alone.
2. **Un-rolled rows would retroactively compound on the next aging run.** Every rolled row has
   `penalty_periods_applied = 0` (they predate Phase 2, and Phase 2's adoption backfill skipped
   `rolled` rows), yet they are 1–3 whole months overdue. Setting them back to `overdue` without
   seeding the counter means the first cron run accrues 1–3 full compounding rounds at once on
   each of the 15 rows — a sudden penalty jump on live remedial accounts. **v2.1 seeds
   `penalty_periods_applied` to the current whole-months-overdue in the Phase 1c un-roll**, so the
   fee resumes forward-only (same philosophy as Phase 2's adoption backfill). This is a stated
   business choice — if a retroactive catch-up is wanted instead, see the note in Phase 1c.
3. **Phase 1a.3's waiver assertion was hollow.** The rollover zeroes `penalty_discount_amount` on
   the source row, so `WHERE status='rolled' AND penalty_discount_amount <> 0` is trivially zero
   rows and proves nothing about a waiver that existed *before* the row rolled. v2.1 rewrites it to
   check the `penalties` history instead.

### What Changed in v2.0

v1.0 contained three defects that would have caused real damage. All fixed here.

1. **`penalties.created_at` does not exist.** The column is `calculated_at`. The v1.0 backfill
   used `ORDER BY created_at DESC` and would have aborted on its first statement.
2. **Rollovers are chained, and v1.0 unwound them in the wrong order.** Verified live: within a
   single account the chain runs `#1→#2→#3→#4→#5→#6`, and most destinations are themselves
   `status='rolled'`. v1.0 processed `ORDER BY rolled_at ASC` (oldest first), which subtracts from
   a destination whose inflated value has *already* been carried further up the chain —
   guaranteed corruption. v2.0 unwinds **LIFO (`rolled_at DESC`)**.
3. **Three accounts cannot be un-rolled automatically.** Their rollover destination is already
   `paid` or `partial`, and two of those accounts are fully settled (`outstanding_balance = 0.00`,
   `account_status = 'paid'`). Un-rolling them would resurrect debt on a closed loan. These are
   **quarantined for a human business decision**, not silently floored to zero.

Additionally: `dcr_items` has no `masterlist_id` column, so v1.0's test-account reset step would
have failed. Fixed in Phase 5.

---

## EXECUTION LOG — 2026-09-09 (all phases applied, live on `acopcwlhkovssjnrqygk`)

Branch `develop`, commits `f47f443` → `9bfad06`.

| Phase | Outcome |
|-------|---------|
| 0 | Audit + plan committed (`f47f443`). |
| 1a | 24 rolled rows → **15 AUTO / 9 QUARANTINE** (AN300450 reclassified — Fact 8). 1a.2/1a.3/1a.5 clean. Plan v2.2 (`80d18cd`). |
| 1b | **Q1 chosen** — leave the 9 quarantined rows as historical `rolled`. |
| 1c | `20260909025938_unroll_existing_rolled_rows` — 15 rows un-rolled LIFO; `penalty_periods_applied` seeded to whole-months-overdue; 15 rollover penalties reversed; 0 negatives; 9 rows remain (quarantined). |
| 1d | `20260909030401_reconcile_unrolled_account_balances` — 6 AUTO accounts' `outstanding_balance` set to derived; `stored == derived` confirmed for all 6. |
| 2 | **`20260909011055_remove_30day_rollover`** — recorded as applied via the MCP during the plan-authoring session **with no local file**, then clobbered back by a re-run of an earlier migration. Re-asserted on the live DB; matching file created in both folders. `refresh_one_masterlist_aging` has no rollover; smoke test: 0 newly-rolled on a 5-overdue-installment account. |
| 3 | `refreshMasterlistAging` (orphaned TS twin) rollover block + dead `finalPenalty`/`dpd` removed. `aging-parity.test.mts` deleted (stale pure shadow — no Phase 2 compounding, no rollover). +1 test in `penalty-accrual.test.mts`. `npm test` 1617/1617 (`9bfad06`). |
| 4 | Downstream audit — **no code change needed**; every `'rolled'` reference is an exclusion filter. Now frozen but not broken: `risk.ts` "rolled installments" KPI (stuck at 9) and the ledger "incl. ₱X carried from #N" note. Cleanup candidates. |
| 5.2 | AN300459 aged 3/2/1 months → #1/#2/#3 all `overdue`, **each Target ₱74,800.00**, penalties **11,790.35 / 7,667.00 / 3,740.00**, periods 3/2/1, **`rolled_at` NULL on all 12 rows**. Matches the client model. |
| 5.4/5.5 | Full `refresh_all_aging()` sweep, 45 active/remedial accounts: **0 newly-rolled, 0 new rollover penalties, 0 negative money**; `total_rolled` stays 9; AN300421's quarantined rows untouched. |
| 5.6 | Not needed — all Phase 5 runs were `BEGIN`/`ROLLBACK`. |

Live backup tables (drop after a clean week): `_backup_rolled_rows_20260909`,
`_backup_rollover_penalties_20260909`, `_backup_masterlist_balances_20260909`.

Recorded migration order on a fresh replay: `…011055` (remove rollover) →
`…025938` (un-roll) → `…030401` (reconcile). Valid ordering.

---

## Executive Summary

**Objective:** Remove the automatic 30-day roll-forward that merges overdue installments, so each
missed installment stays as its own payable line with an independently compounding penalty —
matching the client's model as documented in `penalty-rollforward-audit.md`.

**Scope:**
- SQL function `refresh_one_masterlist_aging` (remove rollover block)
- TypeScript twin `refreshMasterlistAging` (keep in sync)
- Backfill 15 of 24 existing `status='rolled'` rows; quarantine 9
- Reconcile the 6 AUTO accounts' stored `masterlist.outstanding_balance` (Phase 1d) — currently
  understated by the frozen rollover penalties
- Verification on test account AN300459 plus one live account per affected segment

**Risk level:** Medium-High. The aging function is core, and the backfill mutates money columns on
live accounts. Every mutating step is gated behind a dry-run and an assertion that aborts on
anything unexpected.

**Phases:** 0, 1 (1a–1d), 2, 3, 4, 5.

---

## Verified Facts (live database, `acopcwlhkovssjnrqygk`, 2026-09-09)

Every number below was read from the live database, not assumed. The plan depends on these; if a
re-check before execution disagrees with any of them, **stop and re-plan**.

### Fact 1 — 24 rolled rows across 10 accounts, 3 segments

| Account | Masterlist ID | Segment | Status | Rolled rows | Destination statuses | Auto-unroll? |
|---------|---------------|---------|--------|-------------|----------------------|--------------|
| AN300432 | `30ebc0a2-ca92-49c7-b400-10c66754b6e0` | sme | remedial | 5 | overdue, rolled | ✅ Yes |
| AN300418 | `9c6f0048-50ca-4481-b738-a13c097beed5` | individual | remedial | 3 | overdue, rolled | ✅ Yes |
| AN300362 | `9488b31e-95fa-4fbe-b77c-affedf43af42` | seafarer | remedial | 3 | overdue, rolled | ✅ Yes |
| AN300361 | `9776dcab-88d0-49b2-954d-416888bd4262` | seafarer | remedial | 2 | overdue, rolled | ✅ Yes |
| AN300359 | `d383bea5-d1e2-4472-89d8-4e936888677a` | seafarer | active | 1 | overdue | ✅ Yes |
| AN300360 | `5b3d85b8-4de1-452f-a5fb-beb86148a52c` | seafarer | active | 1 | overdue | ✅ Yes |
| **AN300450** | `3638a07f-f69c-4df5-a9e8-91218c978402` | sme | active | 1 | overdue | ⛔ Quarantine — **fails reconciliation** (Fact 8) |
| **AN300421** | `c91f8a2d-2848-45df-9ed5-52b43e589936` | individual | active | 5 | **partial**, rolled | ⛔ Quarantine — dest partial |
| **AN300434** | `e74fff24-dea6-4606-b93e-2ed8f6039390` | sme | **paid** | 2 | **paid**, rolled | ⛔ Quarantine — dest paid, closed loan |
| **AN300018** | `e0296c9a-29eb-411c-b948-2f8b8c4f4858` | sme | **paid** | 1 | **paid** | ⛔ Quarantine — dest paid, closed loan |

**Totals:** **15 rows / 6 accounts auto-unrollable. 9 rows / 4 accounts quarantined.**
(v2.0/2.1 said 16/8 — AN300450 was reclassified during the Phase 1a live run; see Fact 8.)

### Fact 2 — `carried_*` columns were never written by the rollover

```
total rolled rows                    : 24
rows with carried_interest_amount ≠ 0:  0
rows with carried_penalty_amount  ≠ 0:  0
rows with carried_from_installment_no  :  0 (all NULL)
```

The Phase 5b migration (`20260909001146`) added these columns, but the rollover block in
`20260908231312` only ever updated `amount_due` and `penalty_amount` on the destination. Clearing
`carried_*` during the backfill is therefore a **verified no-op**, kept only for hygiene.

### Fact 3 — `penalties` table columns

```
id, masterlist_id, amortization_schedule_id, amount, rate_applied,
calculated_at, notes, reversed_at, reversal_reason
```

There is **no `created_at`**. Ordering and timestamps must use `calculated_at`. There is a
`reversal_reason` column — use it rather than appending to `notes`.

### Fact 4 — the rollover is reversible, and the arithmetic reconciles

Sample chain (`30ebc0a2`), showing each rolled row's recorded `roll_amount` and its destination:

| Rolled # | → dest # | roll_amount | rolled penalty | dest amount_due (before un-roll) | dest penalty |
|----------|----------|-------------|----------------|----------------------------------|--------------|
| 1 | 2 | 34,885.62 | 1,661.22 | 68,110.02 | 3,405.50 |
| 2 | 3 | 71,515.52 | 3,405.50 | 104,739.92 | 5,237.00 |
| 3 | 4 | 109,976.92 | 5,237.00 | 143,201.32 | 7,160.07 |
| 4 | 5 | 150,361.39 | 7,160.07 | 183,585.79 | 9,179.29 |
| 5 | 6 | 192,765.08 | 9,179.29 | 225,989.48 | 11,299.47 |

Note the destination's `penalty_amount` at each step equals the *next* row's `rolled penalty` —
proof the chain is a strict LIFO stack. Unwinding row 5 first restores row 6; unwinding row 4 then
restores row 5; and so on down to row 1. Unwinding in the opposite order does **not** work.

Worked inverse for row 1:
```
penalty_portion  = half_up(1661.22 - 0)            = 1,661.22
interest_portion = 34,885.62 - 1,661.22            = 33,224.40
dest.amount_due  = 68,110.02 - 33,224.40           = 34,885.62
dest.penalty     =  3,405.50 -  1,661.22           =  1,744.28
check: 34,885.62 × 0.05 = 1,744.28 ✓ (penalty is exactly 5% of restored principal)
```

### Fact 5 — `dcr_items` has no `masterlist_id`

```
dcr_items : id, dcr_id, payment_id
payments  : id, masterlist_id
postings  : id, dcr_id, payment_id, masterlist_id, amortization_schedule_id
```

Test-data cleanup must delete `postings` → `dcr_items` (via `payment_id`) → `payments`, in that
order, to respect foreign keys.

### Fact 6 — the 6 AUTO accounts' stored balance is already understated

`recompute_outstanding_balance(id)` = `SUM(GREATEST(0, half_up(amount_due − discount_amount +
penalty_amount − penalty_discount_amount − amount_paid)))` where `status NOT IN
('paid','rolled','moved')`. `refresh_one_masterlist_aging` only writes `masterlist.outstanding_balance`
when `v_reverted_discount_total > 0`. The rollover's compounding penalties therefore never reached
the stored balance:

| Account | Masterlist ID | stored | derived | diff |
|---------|---------------|--------|---------|------|
| AN300432 | `30ebc0a2-…` | 203,979.60 | 237,288.95 | −33,309.35 |
| AN300362 | `9488b31e-…` | 154,811.56 | 194,697.05 | −39,885.49 |
| AN300361 | `9776dcab-…` | 139,736.17 | 156,356.85 | −16,620.68 |
| AN300359 | `d383bea5-…` | 175,700.12 | 187,559.82 | −11,859.70 |
| AN300418 | `9c6f0048-…` | 73,080.00 | 82,683.29 | −9,603.29 |
| AN300360 | `5b3d85b8-…` | 127,271.77 | 135,862.60 | −8,590.83 |

The un-roll (Phase 1c) moves debt from destination rows to the un-rolled rows but is roughly
balance-neutral in `recompute_outstanding_balance` terms. Phase 1d writes the derived value to
`outstanding_balance` for these **6** AUTO accounts, closing both the pre-existing gap and any
residual rounding from the un-roll. The 4 quarantined accounts (`c91f8a2d`, `e74fff24`,
`e0296c9a`, `3638a07f`) are **not** touched — `c91f8a2d` already reconciles (diff 0.00), two are
closed at 0.00, and `3638a07f` needs the manual reconciliation from Fact 8. AN300450's own
−5,243.00 gap stays until that manual review.

### Fact 7 — every rolled row has `penalty_periods_applied = 0`

Verified across the AUTO cohort: all 15 rolled rows have `penalty_periods_applied = 0`, while
`age(CURRENT_DATE, due_date)` is 1–3 whole months. They predate the Phase 2 migration
(`20260908231312`), and that migration's adoption backfill filtered out `status='rolled'`. If
Phase 1c set them to `overdue` without seeding the counter, the next `refresh_one_masterlist_aging`
run would accrue 1–3 compounding rounds at once on top of each row's frozen `penalty_amount`.
Phase 1c seeds the counter to the current whole-months-overdue.

### Fact 8 — AN300450 (`3638a07f`) fails reconciliation and is quarantined

Found during the Phase 1a live run. AN300450 has one rolled row (installment #3 → #6, on a
Special/balloon schedule with `$0` placeholder rows and a fully-discounted interest line):

| Field | Value |
|-------|-------|
| recorded `penalties.amount` (roll_amount) | **3,303.09** |
| recomputed from #3's current fields | **6,448.89** |
| #3 now | `amount_due` 6,291.60, `amount_paid` 0, `discount_amount` 0, `penalty_amount` 157.29 |
| rolled_at | 2026-09-04 (old flat-fee logic — the other penalty row is `'Missed payment penalty'`) |

The recorded roll_amount ≈ 3,145.80 interest + 157.29 penalty = half of #3's current
`amount_due` + the penalty. #3's `amount_due` / `amount_paid` drifted after it rolled, so the
mechanical un-roll (subtract the reconstructed portions from #6) would mis-state the balance.
Phase 1c's reconciliation assertion would abort the whole migration on this row. **AN300450 is
therefore moved to QUARANTINE** — it needs a human look, like the other three.

The other 6 AUTO accounts all reconcile (`abs(recorded − recomputed) ≤ 0.01` for every rolled
row) — verified live.

---

## Phase 0 — Audit Documentation

**Purpose:** Freeze the evidence before touching anything.

**Deliverable:** `loanstar/docs/revision-plans/penalty-rollforward-audit.md` (already written).

**Exit criteria:**
- [ ] File exists and contains verbatim transcript quotes with file + line references
- [ ] Committed to `main` before any schema or code change

---

## Phase 1 — Data Backfill (Un-Roll)

**Purpose:** Restore rolled installments to `overdue` so they become independently payable, and
remove the amounts that were folded into their destination rows.

This phase is split into three sub-phases. **1a and 1b are read-only.** Do not proceed to 1c until
1a and 1b produce exactly the expected output.

### Phase 1a — Classification and quarantine (read-only)

Re-verify the facts above and produce the definitive work list. Run this **immediately before**
1c; if the counts differ from Fact 1, the data changed since planning — stop and re-plan.

```sql
-- 1a.1 — Classify every rolled row. Expect 15 'AUTO' and 9 'QUARANTINE'.
SELECT
  CASE WHEN bool_or(d.status IN ('paid', 'partial')) OVER (PARTITION BY s.masterlist_id)
       THEN 'QUARANTINE' ELSE 'AUTO' END              AS disposition,
  s.masterlist_id,
  s.installment_no,
  s.rolled_into_installment_no,
  s.rolled_at,
  d.status                                            AS dest_status
FROM public.amortization_schedules s
LEFT JOIN public.amortization_schedules d
       ON d.masterlist_id = s.masterlist_id
      AND d.installment_no = s.rolled_into_installment_no
WHERE s.status = 'rolled'
ORDER BY disposition, s.masterlist_id, s.rolled_at DESC;
```

```sql
-- 1a.2 — Assert every rolled row has exactly one un-reversed rollover penalty.
-- Expect ZERO rows returned.
SELECT s.id, s.masterlist_id, s.installment_no, count(pe.id) AS rollover_penalties
FROM public.amortization_schedules s
LEFT JOIN public.penalties pe
       ON pe.amortization_schedule_id = s.id
      AND pe.notes LIKE '30-day rollover:%'
      AND pe.reversed_at IS NULL
WHERE s.status = 'rolled'
GROUP BY s.id, s.masterlist_id, s.installment_no
HAVING count(pe.id) <> 1;
```

```sql
-- 1a.3 — Assert no rolled row was penalty-waived BEFORE it rolled.
-- The rollover zeroes penalty_discount_amount on the source row, so checking that column
-- on the schedule row proves nothing. Check the penalty ledger instead: a collector
-- penalty waiver leaves a negative / 'reduced' row against the schedule id, calculated
-- before the '30-day rollover:%' row. Expect ZERO rows returned.
SELECT s.id, s.masterlist_id, s.installment_no
FROM public.amortization_schedules s
WHERE s.status = 'rolled'
  AND EXISTS (
    SELECT 1
    FROM public.penalties w
    JOIN public.penalties r
      ON r.amortization_schedule_id = w.amortization_schedule_id
     AND r.notes LIKE '30-day rollover:%'
    WHERE w.amortization_schedule_id = s.id
      AND (w.amount < 0 OR w.notes ILIKE '%reduc%' OR w.notes ILIKE '%waiv%'
           OR w.reversal_reason IS NOT NULL)
      AND w.calculated_at < r.calculated_at
  );
```

If this returns rows, the reconstruction in Phase 1c cannot recover the original
`penalty_discount_amount` — stop and reconstruct those rows by hand from the ledger.

```sql
-- 1a.4 — Record pre-state for the 6 AUTO accounts (+ AN300450 for reference).
SELECT masterlist_id, sum(amount_due) AS sum_due, sum(penalty_amount) AS sum_penalty,
       sum(amount_paid) AS sum_paid, count(*) AS rows
FROM public.amortization_schedules
WHERE masterlist_id IN (
  '30ebc0a2-ca92-49c7-b400-10c66754b6e0','9c6f0048-50ca-4481-b738-a13c097beed5',
  '9488b31e-95fa-4fbe-b77c-affedf43af42','9776dcab-88d0-49b2-954d-416888bd4262',
  'd383bea5-d1e2-4472-89d8-4e936888677a','5b3d85b8-4de1-452f-a5fb-beb86148a52c',
  '3638a07f-f69c-4df5-a9e8-91218c978402')
GROUP BY masterlist_id ORDER BY masterlist_id;
```

```sql
-- 1a.5 — Reconciliation pre-check (added v2.2). For every non-quarantined rolled row, the
-- recorded rollover roll_amount must still match the row's current net due, else the source
-- state drifted after the roll and the mechanical un-roll would mis-state the balance.
-- Any account listed here is added to the Phase 1c quarantine set (via the UNION). Expect
-- exactly two rows: 3638a07f (#3) and e74fff24 (#2) — both already quarantined
-- (e74fff24 by the paid-destination rule). Any OTHER account here is new: stop and re-count.
SELECT DISTINCT m.loan_account_no, left(s.masterlist_id::text, 8) AS ml8,
       s.installment_no,
       round(pe.amount, 2)                                   AS recorded_roll_amount,
       round(public.half_up(GREATEST(0,
           COALESCE(s.amount_due, 0) - COALESCE(s.discount_amount, 0)
         - COALESCE(s.amount_paid, 0) + COALESCE(s.penalty_amount, 0)
         - COALESCE(s.penalty_discount_amount, 0))), 2)       AS recomputed
FROM public.amortization_schedules s
JOIN public.masterlist m ON m.id = s.masterlist_id
JOIN public.penalties pe
  ON pe.amortization_schedule_id = s.id
 AND pe.notes LIKE '30-day rollover:%'
 AND pe.reversed_at IS NULL
WHERE s.status = 'rolled'
  AND abs(pe.amount - public.half_up(GREATEST(0,
        COALESCE(s.amount_due, 0) - COALESCE(s.discount_amount, 0)
      - COALESCE(s.amount_paid, 0) + COALESCE(s.penalty_amount, 0)
      - COALESCE(s.penalty_discount_amount, 0)))) > 0.01;
```

**Exit criteria for 1a:**
- [ ] 1a.1 returns exactly 15 `AUTO` and 9 `QUARANTINE` rows, matching Fact 1
- [ ] 1a.2 returns zero rows
- [ ] 1a.3 returns zero rows
- [ ] 1a.4 output saved to the execution log for later comparison
- [ ] 1a.5 returns **exactly two rows** — `3638a07f` #3 and `e74fff24` #2 — both already
      quarantined. Any *other* account here is a new reconciliation failure: stop, add it to
      quarantine, re-count.

### Phase 1b — Quarantine decision (blocking, human input required)

**Do not automate this.** Four accounts (9 rolled rows) cannot be auto-un-rolled. Three have a
rollover destination since paid/partially paid (two are closed loans at `outstanding_balance =
0.00`); the fourth fails reconciliation.

| Account | Situation | Why it cannot be auto-unrolled |
|---------|-----------|-------------------------------|
| AN300018 (`e0296c9a`) | Loan fully paid & closed. Destination installment is `paid`, `penalty_amount = 0.00`. | The un-roll would need to subtract ₱5,045.09 of penalty from a row that holds ₱0.00 — arithmetically impossible. Restoring the source row would resurrect ₱105,946.97 of debt on a settled loan. |
| AN300434 (`e74fff24`) | Loan fully paid & closed. Destination `paid` with `amount_paid = 65,624.10`. | Subtracting the rolled amount leaves the row over-paid, producing a negative net balance and a phantom credit. |
| AN300421 (`c91f8a2d`) | Active. Destination is `partial` with `amount_paid = 28,874.99`. | The payment was made against a merged balance. Splitting it back across two installments is an allocation decision (which installment did the borrower intend to pay?), not a mechanical one. |
| AN300450 (`3638a07f`) | Active. Special/balloon schedule. One rolled row (#3 → #6). | Recorded roll_amount ₱3,303.09 ≠ recomputed ₱6,448.89 — #3's `amount_due`/`amount_paid` drifted after it rolled (Fact 8). The reconstruction cannot be trusted; needs a per-account manual look. |

**Required decision before Phase 1c runs.** Options:

- **Option Q1 — Leave quarantined (recommended).** These 9 rows keep `status='rolled'` as a
  historical artefact. No new rolled rows will ever be created after Phase 2. Ledger and reports
  already render old rolled rows correctly. Zero risk of resurrecting settled debt.
- **Option Q2 — Manual reconciliation per account.** Finance reviews each of the 4 accounts and
  supplies the intended allocation; engineering writes a bespoke, per-account correction script.
  Higher effort, and for the two closed loans it likely reopens a settled contract — a business
  and possibly legal decision. AN300450 is the lightest of the four (one row, active account).

**This plan assumes Option Q1.** If Q2 is chosen, it becomes a separate work item with its own
plan; Phase 1c is unaffected either way.

**Exit criteria for 1b:**
- [ ] Written decision recorded (Q1 or Q2) with the approver's name and date
- [ ] If Q2: separate plan drafted and approved before Phase 1c

### Phase 1c — Un-roll the 15 AUTO rows

**Migration file:** `20260909100000_unroll_existing_rolled_rows.sql`

Key properties of this migration:
- **LIFO order** (`rolled_at DESC`) — unwinds each chain from its tip. Non-negotiable; see Fact 4.
- **Account-level quarantine** — any account with a `paid`/`partial` destination is skipped whole.
  Skipping individual rows within a chain would corrupt the remainder of that chain.
- **Assert, never floor.** Every subtraction is validated first and raises an exception on
  shortfall. `GREATEST(0, …)` appears only where it is arithmetically safe: computing
  `v_penalty_portion` (mirrors the original rollover) and seeding `penalty_periods_applied`
  (a count, never negative) — never on a destination-row subtraction.
- **Reconciliation assertion** — the recorded `roll_amount` must equal the recomputed
  `interest_portion + penalty_portion`, else abort.
- **Forward-only fee resumption** — each un-rolled row's `penalty_periods_applied` is seeded to
  whole-months-overdue (Fact 7) so the next aging run does not retroactively compound.
- **Idempotent** — re-running finds no `status='rolled'` AUTO rows and is a clean no-op.

```sql
-- Migration: Un-roll existing 'rolled' rows (AUTO cohort only)
--
-- Reverses the 30-day roll-forward for accounts where it can be reversed exactly.
-- Accounts whose rollover destination has since been paid or partially paid are
-- QUARANTINED (left untouched) — see docs/revision-plans/penalty-remove-rollforward-plan.md
-- Phase 1b. This migration must run BEFORE 20260909110000_remove_rollover_from_refresh_aging.sql.
--
-- Ordering is LIFO (rolled_at DESC). Rollovers chain (#1→#2→#3→…), and each rolled row's
-- amount_due already contains everything folded in from upstream. Unwinding oldest-first
-- would subtract amounts that have already been carried further up the chain.

DO $$
DECLARE
  v_rolled          RECORD;
  v_penalty         RECORD;
  v_dest            RECORD;
  v_roll_amount     numeric;
  v_penalty_portion numeric;
  v_interest_portion numeric;
  v_expected        numeric;
  v_unrolled        int := 0;
  v_quarantined     int := 0;
BEGIN
  -- Quarantined accounts, skipped wholesale:
  --  (a) a rollover destination has been settled (paid/partial), OR
  --  (b) a rolled row's recorded roll_amount no longer reconciles with its
  --      current fields — its source state drifted after rolling (Fact 8).
  CREATE TEMP TABLE _quarantined_masterlists ON COMMIT DROP AS
  SELECT DISTINCT s.masterlist_id
  FROM public.amortization_schedules s
  JOIN public.amortization_schedules d
    ON d.masterlist_id  = s.masterlist_id
   AND d.installment_no = s.rolled_into_installment_no
  WHERE s.status = 'rolled'
    AND d.status IN ('paid', 'partial')
  UNION
  SELECT DISTINCT s.masterlist_id
  FROM public.amortization_schedules s
  JOIN public.penalties pe
    ON pe.amortization_schedule_id = s.id
   AND pe.notes LIKE '30-day rollover:%'
   AND pe.reversed_at IS NULL
  WHERE s.status = 'rolled'
    AND abs(
          pe.amount
          - public.half_up(GREATEST(0,
              COALESCE(s.amount_due, 0) - COALESCE(s.discount_amount, 0)
            - COALESCE(s.amount_paid, 0) + COALESCE(s.penalty_amount, 0)
            - COALESCE(s.penalty_discount_amount, 0)))
        ) > 0.01;

  SELECT count(*) INTO v_quarantined
  FROM public.amortization_schedules s
  WHERE s.status = 'rolled'
    AND s.masterlist_id IN (SELECT masterlist_id FROM _quarantined_masterlists);

  RAISE NOTICE 'Quarantined % rolled row(s) across % account(s) — left untouched by design.',
    v_quarantined, (SELECT count(*) FROM _quarantined_masterlists);

  FOR v_rolled IN
    SELECT s.id, s.masterlist_id, s.installment_no, s.due_date, s.amount_due, s.penalty_amount,
           s.discount_amount, s.amount_paid, s.penalty_discount_amount,
           s.rolled_at, s.rolled_into_installment_no
    FROM public.amortization_schedules s
    WHERE s.status = 'rolled'
      AND s.masterlist_id NOT IN (SELECT masterlist_id FROM _quarantined_masterlists)
    ORDER BY s.rolled_at DESC, s.installment_no DESC   -- LIFO: unwind the chain from its tip
  LOOP
    ----------------------------------------------------------------------
    -- 1. Locate the rollover penalty. Exactly one must exist.
    ----------------------------------------------------------------------
    SELECT pe.id, pe.amount INTO v_penalty
    FROM public.penalties pe
    WHERE pe.amortization_schedule_id = v_rolled.id
      AND pe.notes LIKE '30-day rollover:%'
      AND pe.reversed_at IS NULL
    ORDER BY pe.calculated_at DESC          -- NB: calculated_at, NOT created_at
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Un-roll aborted: no rollover penalty for schedule % (installment #%, masterlist %). '
        'Cannot determine the amount to reverse.',
        v_rolled.id, v_rolled.installment_no, v_rolled.masterlist_id;
    END IF;

    v_roll_amount := v_penalty.amount;

    ----------------------------------------------------------------------
    -- 2. Rebuild the interest/penalty split exactly as the rollover computed it.
    ----------------------------------------------------------------------
    v_penalty_portion := GREATEST(0, public.half_up(
      COALESCE(v_rolled.penalty_amount, 0) - COALESCE(v_rolled.penalty_discount_amount, 0)));
    v_interest_portion := public.half_up(v_roll_amount - v_penalty_portion);

    -- Reconciliation: the recorded roll_amount must match the source row's net due.
    v_expected := public.half_up(GREATEST(0,
        COALESCE(v_rolled.amount_due, 0)
      - COALESCE(v_rolled.discount_amount, 0)
      - COALESCE(v_rolled.amount_paid, 0)
      + COALESCE(v_rolled.penalty_amount, 0)
      - COALESCE(v_rolled.penalty_discount_amount, 0)));

    IF abs(v_expected - v_roll_amount) > 0.01 THEN
      RAISE EXCEPTION
        'Un-roll aborted: reconciliation failed for schedule % (installment #%, masterlist %). '
        'Recorded roll_amount = %, recomputed = %, difference = %. The row changed after it '
        'was rolled; reversing it automatically is unsafe.',
        v_rolled.id, v_rolled.installment_no, v_rolled.masterlist_id,
        v_roll_amount, v_expected, (v_expected - v_roll_amount);
    END IF;

    IF v_interest_portion < 0 THEN
      RAISE EXCEPTION
        'Un-roll aborted: negative interest portion (%) for schedule %. '
        'penalty_portion (%) exceeds roll_amount (%).',
        v_interest_portion, v_rolled.id, v_penalty_portion, v_roll_amount;
    END IF;

    ----------------------------------------------------------------------
    -- 3. Locate the destination row.
    ----------------------------------------------------------------------
    SELECT d.id, d.installment_no, d.status, d.amount_due, d.penalty_amount
    INTO v_dest
    FROM public.amortization_schedules d
    WHERE d.masterlist_id  = v_rolled.masterlist_id
      AND d.installment_no = v_rolled.rolled_into_installment_no
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% not found for schedule % (masterlist %). '
        'Refusing to leave the chain half-unwound.',
        v_rolled.rolled_into_installment_no, v_rolled.id, v_rolled.masterlist_id;
    END IF;

    ----------------------------------------------------------------------
    -- 4. Validate the subtraction BEFORE performing it. Assert, never floor.
    ----------------------------------------------------------------------
    IF COALESCE(v_dest.amount_due, 0) < v_interest_portion THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% (%) holds amount_due = % but the reversal '
        'requires subtracting % (shortfall %). The destination was modified after the rollover.',
        v_dest.installment_no, v_dest.id, v_dest.amount_due, v_interest_portion,
        (v_interest_portion - COALESCE(v_dest.amount_due, 0));
    END IF;

    IF COALESCE(v_dest.penalty_amount, 0) < v_penalty_portion THEN
      RAISE EXCEPTION
        'Un-roll aborted: destination installment #% (%) holds penalty_amount = % but the reversal '
        'requires subtracting % (shortfall %). The penalty was waived or paid after the rollover.',
        v_dest.installment_no, v_dest.id, v_dest.penalty_amount, v_penalty_portion,
        (v_penalty_portion - COALESCE(v_dest.penalty_amount, 0));
    END IF;

    ----------------------------------------------------------------------
    -- 5. Mutate: destination first, then the source row, then the penalty.
    ----------------------------------------------------------------------
    UPDATE public.amortization_schedules
    SET amount_due     = COALESCE(amount_due, 0)     - v_interest_portion,
        penalty_amount = COALESCE(penalty_amount, 0) - v_penalty_portion
    WHERE id = v_dest.id;

    UPDATE public.amortization_schedules
    SET status                     = 'overdue',
        rolled_at                  = NULL,
        rolled_into_installment_no = NULL,
        carried_interest_amount    = 0,      -- verified no-op (Fact 2); kept for hygiene
        carried_penalty_amount     = 0,
        carried_from_installment_no = NULL,
        -- Fact 7: seed the compounding counter to whole-months-overdue so the next
        -- aging run resumes the fee FORWARD-ONLY instead of retroactively compounding
        -- 1-3 rounds at once. Same philosophy as the Phase 2 adoption backfill.
        -- If the business wants the retroactive catch-up instead, delete this line
        -- and quantify the per-account jump in Phase 5.4.
        penalty_periods_applied = GREATEST(0, (
          date_part('year',  age(CURRENT_DATE, v_rolled.due_date)) * 12
        + date_part('month', age(CURRENT_DATE, v_rolled.due_date))
        )::int)
    WHERE id = v_rolled.id;

    UPDATE public.penalties
    SET reversed_at     = now(),
        reversal_reason = 'Un-rolled: 30-day roll-forward removed from delinquency path '
                          '(penalty-remove-rollforward-plan.md Phase 1c)'
    WHERE id = v_penalty.id;

    v_unrolled := v_unrolled + 1;

    RAISE NOTICE
      'Un-rolled installment #% → removed % (interest %, penalty %) from installment #%',
      v_rolled.installment_no, v_roll_amount, v_interest_portion, v_penalty_portion,
      v_dest.installment_no;
  END LOOP;

  RAISE NOTICE 'Un-rolled % row(s). Quarantined % row(s).', v_unrolled, v_quarantined;

  IF v_unrolled <> 15 THEN
    RAISE EXCEPTION
      'Un-roll aborted: expected to un-roll exactly 15 rows, actually un-rolled %. '
      'The data differs from the plan baseline — re-run Phase 1a and re-plan.', v_unrolled;
  END IF;
END $$;

-- Post-condition: only the quarantined rows may remain rolled.
DO $$
DECLARE v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.amortization_schedules WHERE status = 'rolled';

  IF v_remaining <> 9 THEN
    RAISE EXCEPTION 'Post-condition failed: expected 9 quarantined rolled rows, found %.',
      v_remaining;
  END IF;

  RAISE NOTICE 'Post-condition OK: % quarantined rolled row(s) remain, by design.', v_remaining;
END $$;
```

### Phase 1c dry-run protocol

Run the migration body inside an explicit transaction and roll it back. The Supabase MCP returns
only the **last** result set of a multi-statement call, so run the verification queries as separate
calls inside the same transaction, or inspect the `NOTICE` stream.

```sql
BEGIN;
  -- <paste the full migration body here>

  -- Inside the transaction, confirm the outcome:
  SELECT count(*) FILTER (WHERE status = 'rolled')  AS still_rolled,
         count(*) FILTER (WHERE status = 'overdue') AS now_overdue
  FROM public.amortization_schedules
  WHERE masterlist_id IN (
    '30ebc0a2-ca92-49c7-b400-10c66754b6e0','9c6f0048-50ca-4481-b738-a13c097beed5',
    '9488b31e-95fa-4fbe-b77c-affedf43af42','9776dcab-88d0-49b2-954d-416888bd4262',
    'd383bea5-d1e2-4472-89d8-4e936888677a','5b3d85b8-4de1-452f-a5fb-beb86148a52c',
    '3638a07f-f69c-4df5-a9e8-91218c978402');
ROLLBACK;
```

**Dry-run pass criteria — all must hold. Any failure blocks Phase 1c.**

- [ ] `NOTICE`: "Quarantined 9 rolled row(s) across 4 account(s)"
- [ ] Exactly 15 `NOTICE: Un-rolled installment #…` lines
- [ ] `NOTICE`: "Un-rolled 15 row(s). Quarantined 9 row(s)."
- [ ] `NOTICE`: "Post-condition OK: 9 quarantined rolled row(s) remain"
- [ ] Zero `EXCEPTION`, zero `WARNING`
- [ ] In-transaction check: `still_rolled = 0` for the 6 AUTO accounts
- [ ] Every un-rolled row has `penalty_periods_applied` equal to its whole-months-overdue
      (`> 0` for all 15 rows, matching `age(CURRENT_DATE, due_date)`)
- [ ] For each AUTO account, `recompute_outstanding_balance` stays within ±₱1.00 of its
      pre-backfill *derived* value (un-rolling moves debt between rows; it does not change the
      total). It will still differ from the *stored* `outstanding_balance` — that is Phase 1d's job.

### Phase 1c post-apply verification

```sql
-- V1 — Exactly the 9 quarantined rows remain rolled.
SELECT count(*) AS rolled_remaining FROM public.amortization_schedules WHERE status = 'rolled';
-- Expect: 9

-- V2 — All remaining rolled rows belong to the 4 quarantined accounts.
SELECT DISTINCT masterlist_id FROM public.amortization_schedules WHERE status = 'rolled';
-- Expect exactly: c91f8a2d…, e74fff24…, e0296c9a…, 3638a07f…

-- V3 — 15 rollover penalties are now marked reversed.
SELECT count(*) AS reversed FROM public.penalties
WHERE notes LIKE '30-day rollover:%' AND reversed_at IS NOT NULL;
-- Expect: 15

-- V4 — No negative money anywhere.
SELECT count(*) AS negatives FROM public.amortization_schedules
WHERE amount_due < 0 OR penalty_amount < 0;
-- Expect: 0

-- V5 — Balance moved in the correct direction for every AUTO account.
SELECT m.id, m.outstanding_balance AS stored,
       public.recompute_outstanding_balance(m.id) AS derived
FROM public.masterlist m
WHERE m.id IN (
  '30ebc0a2-ca92-49c7-b400-10c66754b6e0','9c6f0048-50ca-4481-b738-a13c097beed5',
  '9488b31e-95fa-4fbe-b77c-affedf43af42','9776dcab-88d0-49b2-954d-416888bd4262',
  'd383bea5-d1e2-4472-89d8-4e936888677a','5b3d85b8-4de1-452f-a5fb-beb86148a52c',
  '3638a07f-f69c-4df5-a9e8-91218c978402');
```

**On V5:** `stored` and `derived` will still differ after 1c. `masterlist.outstanding_balance` is
only recomputed by the aging function when a discount reverts, so the aging run does **not** fix
it (this was a wrong assumption in v2.0). The gap is closed by **Phase 1d** below, which is the
only step that writes `outstanding_balance`. Record both values here; after 1d they must agree
for all 6 AUTO accounts.

**Constraints for Phase 1:**
- ❌ Never `DELETE` from `penalties` — reverse via `reversed_at` + `reversal_reason`
- ❌ Never touch rows with `status IN ('moved', 'paid')`
- ❌ Never use `GREATEST(0, …)` to hide a shortfall on a **money** subtraction — validate and
  abort instead. (It is fine on `v_penalty_portion` and the `penalty_periods_applied` seed —
  neither can legitimately be negative.)
- ❌ Never process a quarantined account partially
- ❌ Phase 1d touches `masterlist.outstanding_balance` for the **6 AUTO accounts only** —
  never the 4 quarantined accounts
- ✅ Only `status='rolled'` rows in non-quarantined accounts are modified in 1c

### Phase 1d — Reconcile the stored balance (6 AUTO accounts only)

**Migration file:** `20260909105000_reconcile_unrolled_account_balances.sql`
**Runs after** `20260909100000_unroll_existing_rolled_rows.sql`, **before**
`20260909110000_remove_rollover_from_refresh_aging.sql`.

**Why:** Fact 6. `masterlist.outstanding_balance` for these 6 accounts was already understated by
the frozen rollover penalties, and no later step writes it. This migration sets it to the derived
value. It is a targeted, ID-scoped update — never a table-wide recompute.

```sql
-- Migration: Reconcile outstanding_balance for the 6 un-rolled AUTO accounts.
-- The stored value was understated by the 30-day rollover's compounding penalties
-- (refresh_one_masterlist_aging only rewrites outstanding_balance on a discount revert).
-- Quarantined accounts (c91f8a2d, e74fff24, e0296c9a) are intentionally excluded.

DO $$
DECLARE
  v_id      uuid;
  v_before  numeric;
  v_after   numeric;
  v_n       int := 0;
  v_ids     uuid[] := ARRAY[
    '30ebc0a2-ca92-49c7-b400-10c66754b6e0',
    '9c6f0048-50ca-4481-b738-a13c097beed5',
    '9488b31e-95fa-4fbe-b77c-affedf43af42',
    '9776dcab-88d0-49b2-954d-416888bd4262',
    'd383bea5-d1e2-4472-89d8-4e936888677a',
    '5b3d85b8-4de1-452f-a5fb-beb86148a52c'
    -- 3638a07f (AN300450) intentionally NOT here — quarantined (Fact 8)
  ]::uuid[];
BEGIN
  -- Guard: none of these must still hold a rolled row (Phase 1c must have run first).
  IF EXISTS (
    SELECT 1 FROM public.amortization_schedules
    WHERE masterlist_id = ANY(v_ids) AND status = 'rolled'
  ) THEN
    RAISE EXCEPTION
      'Reconcile aborted: an AUTO account still has status=rolled rows. Run '
      '20260909100000_unroll_existing_rolled_rows.sql first.';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT outstanding_balance INTO v_before FROM public.masterlist WHERE id = v_id;
    v_after := public.recompute_outstanding_balance(v_id);

    -- Sanity: reconciliation only ever raises the stored balance here (previously
    -- hidden penalty). A drop would mean something else changed — stop.
    IF v_after < v_before - 0.01 THEN
      RAISE EXCEPTION
        'Reconcile aborted: account % derived balance (%) is LOWER than stored (%). '
        'Unexpected — investigate before writing.', v_id, v_after, v_before;
    END IF;

    UPDATE public.masterlist SET outstanding_balance = v_after WHERE id = v_id;
    v_n := v_n + 1;
    RAISE NOTICE 'Reconciled % : % -> % (Δ +%)', v_id, v_before, v_after, (v_after - v_before);
  END LOOP;

  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Reconcile aborted: expected 6 accounts, updated %.', v_n;
  END IF;
END $$;
```

**Dry-run pass criteria:**
- [ ] 6 `NOTICE: Reconciled …` lines, each Δ positive (or 0.00 for any that already matched)
- [ ] Zero `EXCEPTION`
- [ ] After apply: `stored = derived` for all 6 AUTO IDs
- [ ] Quarantined IDs (`c91f8a2d`, `e74fff24`, `e0296c9a`) unchanged
- [ ] `total_loan` on all 10 accounts unchanged (this migration never touches it)

**Constraints:**
- ❌ Never `recompute_outstanding_balance` table-wide — only the 6 hard-coded IDs
- ❌ Never touch `total_loan`, `account_status`, `aging_bucket`, `remedial_flag`
- ❌ Never touch the 4 quarantined accounts

---

## Phase 2 — Remove the Rollover from `refresh_one_masterlist_aging`

**Migration file:** `20260909110000_remove_rollover_from_refresh_aging.sql`
**Must run after** `20260909100000_unroll_existing_rolled_rows.sql`.

### Delete — rollover block

The entire block currently at lines 284–358 of `20260908231312_penalty_monthly_compounding.sql`,
comment header included:

```
-- 30-DAY ROLLOVER — unchanged arithmetic. …
IF v_has_overdue AND v_dpd >= v_t30 AND v_overdue.rolled_at IS NULL THEN
  … SELECT … INTO v_next …
  … UPDATE (destination) … UPDATE (status='rolled') … INSERT INTO penalties ('30-day rollover: …')
END IF;
```

### Delete — dead variables

```sql
v_next             RECORD;
v_has_next         boolean := false;
v_roll_amount      numeric;
v_penalty_portion  numeric;
v_interest_portion numeric;
v_final_penalty    numeric := 0;   -- ← v2.0 addition; see below
```

**On `v_final_penalty`:** v1.0 wrongly listed this under "keep". It exists solely to feed the
rollover — the code even says so at line 234: *"Still keep v_final_penalty in step with the oldest
overdue row for the rollover block below."* Its only two readers (lines 315 and 322) are inside the
block being deleted. Leaving it would be write-only dead code. Removing the declaration means also
removing its three assignments:

- line 197 — `v_final_penalty := COALESCE(v_overdue.penalty_amount, 0);`
- lines 236–238 — the assignment inside the accrual loop's `CONTINUE` branch
- lines 278–280 — the assignment at the end of the accrual loop

Deleting lines 236–238 and 278–280 removes the surrounding `IF v_row.id = v_overdue.id THEN … END IF;`
wrappers entirely. **The accrual arithmetic itself is untouched** — these blocks only mirrored a
value outward for the rollover; nothing inside the loop reads `v_final_penalty`.

### Keep verbatim

| Block | Lines (source migration) |
|-------|--------------------------|
| Move of Payment revert (schedules, PDC checks, status reset) | 105–159 |
| Oldest-overdue selection | 160–181 |
| Aging bucket computation | 183–198 (minus the `v_final_penalty` assignment) |
| **Penalty accrual loop** | 200–282 (minus the two `v_final_penalty` mirrors) |
| Origination-discount reversion | 360–377 |
| Masterlist update | 379–392 |

Variables retained: `v_segment`, `v_penalty_rate`, `v_t30`, `v_t60`, `v_t90`, `v_cfg`, `v_overdue`,
`v_has_overdue`, `v_dpd`, `v_aging_bucket`, `v_outstanding`, `v_penalty`, `v_existing_penalty`,
`v_now`, `v_reverted_discount_total`, `v_row`, `v_target_periods`, `v_running_penalty`, `v_bal`,
`v_add`, `v_p`.

> `v_outstanding`, `v_penalty` and `v_existing_penalty` are already unused in the current function
> (leftovers from the pre-Phase-2 flat-fee logic). They are **retained deliberately** to keep this
> migration's diff limited to the rollover. Removing them is a separate cleanup, out of scope here.

### Compile-safety check

Removing `v_next` / `v_has_next` / `v_roll_amount` / `v_penalty_portion` / `v_interest_portion`
cannot break the retained code: `grep` confirms every reference to each of them lies inside the
deleted block. `v_final_penalty` has three references outside the block, all assignments, all
removed together. PL/pgSQL resolves identifiers at first execution, so a stale reference would
surface as a runtime error, not a compile error — hence the mandatory smoke test below rather than
relying on `CREATE FUNCTION` succeeding.

### Phase 2 verification

```sql
-- Smoke test on the clean test account. Must not raise.
BEGIN;
  SELECT public.refresh_one_masterlist_aging(
    'c60d90ac-0774-4fd6-a739-959e0061fdc0'::uuid, CURRENT_DATE);
ROLLBACK;
```

```sql
-- Source-level assertion: the deployed function no longer contains rollover code.
SELECT
  position('rolled_into_installment_no' in prosrc) AS has_rolled_into,
  position('30-day rollover'            in prosrc) AS has_rollover_note,
  position('v_final_penalty'            in prosrc) AS has_final_penalty,
  position('penalty_periods_applied'    in prosrc) AS has_accrual_marker,
  position('move_of_payment_deadline'   in prosrc) AS has_move_of_payment
FROM pg_proc
WHERE proname = 'refresh_one_masterlist_aging';
-- Expect: first three = 0, last two > 0
```

---

## Phase 3 — TypeScript Twin

**File:** `loanstar/src/lib/ar/posting.ts`, function `refreshMasterlistAging` (from line 535).

Delete the rollover block (approximately lines 728–805): the `if (dpd >= thresholds.t30 && !overdue.rolled_at) { … }`
statement, including `rollAmount`, `penaltyPortion`, `interestPortion`, both `amortization_schedules`
updates, and the `penalties` insert with the `30-day rollover:` note. Delete the now-unused `dpd`
binding on line 731 if nothing below reads it, and the `finalPenalty` binding if it becomes
write-only.

Replace with a short note in the surrounding comment style:

```typescript
// The 30-day roll-forward was removed 2026-09-09; each overdue installment now keeps
// its own Target and compounds its own penalty. See
// docs/revision-plans/penalty-remove-rollforward-plan.md.
```

Keep untouched: the Move of Payment revert block, the penalty accrual, the origination-discount
reversion, and the masterlist update.

> This function is orphaned — only the `dev-simulate-aging` route reaches it, and that route now
> calls the SQL RPC. It is kept in sync so the two twins do not drift further.

**Verification:**
```bash
npx tsc --noEmit
npx eslint src/lib/ar/posting.ts
npm test
```
`aging-parity.test.mts` and `refresh-masterlist-aging-move-of-payment.test.mts` both import this
function — both must stay green. If `aging-parity` asserts rollover behaviour, update the test to
assert the new behaviour and note it in the commit message.

---

## Phase 4 — Downstream Audit

`rolled` is not removed as a status; it simply stops being produced. Every downstream site either
filters it out or renders it for historical rows, and 9 quarantined rows still exist — so all
existing handling must stay.

```bash
rg "'rolled'" --type ts --type sql loanstar/src loanstar/supabase
rg "carried_interest_amount|carried_penalty_amount|carriedInterest|carriedPenalty" --type ts loanstar/src
```

Classify each hit:

| Pattern | Action |
|---------|--------|
| `status <> 'rolled'` / `NOT IN ('paid','rolled')` filter | Keep — harmless |
| Renders carried/rolled rows (ledger) | Keep — 9 quarantined rows still render |
| Produces a rolled row | Only the two blocks removed in Phases 2–3 |

Known sites confirmed safe: `recompute_outstanding_balance`, `is_account_fully_settled`,
`build-account-ledger-rows.ts`, `AccountLedger.tsx` (`targetCell`), `register-queries.ts`,
`collector/desk.ts`, `collector/reminder-scan.ts`, `documents/generators/demand-letter.ts`.

**Exit criteria:**
- [ ] Every `'rolled'` reference classified; none require code change
- [ ] `npm test` green
- [ ] An account with quarantined rolled rows (e.g. AN300421) still renders its ledger correctly

---

## Phase 5 — Verification Journey

### 5.1 — Backdate AN300459

Masterlist `c60d90ac-0774-4fd6-a739-959e0061fdc0`; 12 × ₱74,800; currently all `pending`.

Use month-arithmetic rather than hard-coded dates so the expected penalty counts hold whenever this
is run:

```sql
BEGIN;
UPDATE public.amortization_schedules
SET due_date = (CURRENT_DATE - INTERVAL '3 months' - INTERVAL '5 days')::date
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND installment_no = 1;

UPDATE public.amortization_schedules
SET due_date = (CURRENT_DATE - INTERVAL '2 months' - INTERVAL '5 days')::date
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND installment_no = 2;

UPDATE public.amortization_schedules
SET due_date = (CURRENT_DATE - INTERVAL '1 month' - INTERVAL '5 days')::date
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND installment_no = 3;

SELECT installment_no, due_date, CURRENT_DATE - due_date AS dpd
FROM public.amortization_schedules
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND installment_no <= 3;
COMMIT;
```

The `- 5 days` guarantees `age()` yields a whole 3 / 2 / 1 months regardless of month length.

### 5.2 — Run aging and assert

Expected penalties (5% compounding on each row's own balance):

| # | Rounds | Working | Penalty |
|---|--------|---------|---------|
| 1 | 3 | 74,800→+3,740; 78,540→+3,927; 82,467→+4,123.35 | **11,790.35** |
| 2 | 2 | 74,800→+3,740; 78,540→+3,927 | **7,667.00** |
| 3 | 1 | 74,800→+3,740 | **3,740.00** |

```sql
BEGIN;
  SELECT public.refresh_one_masterlist_aging(
    'c60d90ac-0774-4fd6-a739-959e0061fdc0'::uuid, CURRENT_DATE);

  SELECT installment_no, amount_due, penalty_amount, penalty_periods_applied,
         status, rolled_at, rolled_into_installment_no
  FROM public.amortization_schedules
  WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0'
  ORDER BY installment_no;
ROLLBACK;
```

**Pass criteria:**
- [ ] `#1/#2/#3` are `overdue`; `#4`–`#12` are `pending`
- [ ] **Every** row has `amount_due = 74800.00` — the decisive assertion; a rollover would have
      pushed `#2` to `149,600`
- [ ] Penalties are `11790.35 / 7667.00 / 3740.00`, `penalty_periods_applied` = `3 / 2 / 1`
- [ ] `rolled_at` and `rolled_into_installment_no` are `NULL` on all 12 rows
- [ ] `penalties` contains 6 `Monthly late fee — month N overdue` rows and **zero** `30-day rollover` rows
- [ ] `masterlist.aging_bucket = '91+'`, `remedial_flag = true` (from `#1` at ~95 DPD)
- [ ] `recompute_outstanding_balance` = **920,797.35**
      (`86,590.35 + 82,467.00 + 78,540.00 + 9 × 74,800`)

### 5.3 — Payment flexibility

Pay only installment `#2` through the real posting path (`post_single_dcr_item`), not a manual
`UPDATE` — a hand-written update would prove nothing about the payment pipeline.

- [ ] `#2` becomes `paid`; its penalty is cleared or recorded as collected
- [ ] `#1` remains `overdue` at Target 74,800, penalty 11,790.35
- [ ] `#3` remains `overdue` at Target 74,800, penalty 3,740.00
- [ ] `postings.penalty_amount` records the fee portion
- [ ] Outstanding balance drops by exactly the amount paid

### 5.4 — Diverse live accounts (addresses "passes on one account, broken elsewhere")

AN300459 is a single 12 × equal-instalment loan. Verify on one real account per affected segment,
all of which now carry un-rolled overdue rows:

| Segment | Account | Masterlist ID |
|---------|---------|---------------|
| sme | AN300432 | `30ebc0a2-ca92-49c7-b400-10c66754b6e0` |
| individual | AN300418 | `9c6f0048-50ca-4481-b738-a13c097beed5` |
| seafarer | AN300362 | `9488b31e-95fa-4fbe-b77c-affedf43af42` |
| quarantined (regression) | AN300421 | `c91f8a2d-2848-45df-9ed5-52b43e589936` |

```sql
BEGIN;
  SELECT public.refresh_one_masterlist_aging(id, CURRENT_DATE)
  FROM public.masterlist
  WHERE id IN ('30ebc0a2-ca92-49c7-b400-10c66754b6e0',
               '9c6f0048-50ca-4481-b738-a13c097beed5',
               '9488b31e-95fa-4fbe-b77c-affedf43af42',
               'c91f8a2d-2848-45df-9ed5-52b43e589936');

  SELECT count(*) AS newly_rolled
  FROM public.amortization_schedules
  WHERE status = 'rolled' AND rolled_at > now() - INTERVAL '5 minutes';
ROLLBACK;
```

- [ ] `newly_rolled = 0` — no rollover even though these accounts are far past 30 DPD
- [ ] Penalties grew on each overdue row **only where `age()` exceeds the seeded
      `penalty_periods_applied`** — i.e. forward-only, no retroactive 1-3 round jump (Fact 7).
      `amount_due` unchanged on every row.
- [ ] AN300421's 5 quarantined rolled rows are still `rolled` and untouched
- [ ] `masterlist.outstanding_balance` already equals `recompute_outstanding_balance` for the
      3 AUTO accounts here — set by **Phase 1d**, not by this aging run
- [ ] Segment penalty rates applied correctly via `penalty_rate_for_segment`

### 5.5 — Proactive post-deployment sweep

The nightly cron (`loanstar-aging-daily`, `0 17 * * *`) is ~15 hours after deployment. Do not wait.

```sql
-- Full production sweep, rolled back. Exercises every active/remedial account.
BEGIN;
  SELECT public.refresh_all_aging();

  SELECT count(*) AS newly_rolled
  FROM public.amortization_schedules
  WHERE status = 'rolled' AND rolled_at > now() - INTERVAL '10 minutes';

  SELECT count(*) AS new_rollover_penalties
  FROM public.penalties
  WHERE notes LIKE '30-day rollover:%' AND calculated_at > now() - INTERVAL '10 minutes';
ROLLBACK;
```

- [ ] `newly_rolled = 0`
- [ ] `new_rollover_penalties = 0`
- [ ] `refresh_all_aging()` returns its usual account count with no exceptions
      (per-account error isolation from `20260908234736` means a single bad account would be
      swallowed — check the returned count against
      `SELECT count(*) FROM masterlist WHERE account_status IN ('active','remedial')`)

Then, the morning after the first real cron run, re-run the two counts without the transaction
wrapper, scoped to the last 24 hours. Both must be 0.

### 5.6 — Reset AN300459

Deletion order respects foreign keys, and `dcr_items` is reached via `payment_id` because it has no
`masterlist_id` (Fact 5).

```sql
BEGIN;

DELETE FROM public.postings WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0';

DELETE FROM public.dcr_items
WHERE payment_id IN (
  SELECT id FROM public.payments WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0');

DELETE FROM public.payments WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0';
DELETE FROM public.penalties WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0';

UPDATE public.amortization_schedules
SET due_date = ('2026-10-08'::date + ((installment_no - 1) || ' months')::interval)::date,
    amount_due = 74800.00, amount_paid = 0.00,
    penalty_amount = 0.00, penalty_periods_applied = 0,
    discount_amount = 0.00, penalty_discount_amount = 0.00,
    status = 'pending', paid_at = NULL,
    rolled_at = NULL, rolled_into_installment_no = NULL,
    carried_interest_amount = 0.00, carried_penalty_amount = 0.00,
    carried_from_installment_no = NULL,
    moved_at = NULL, moved_to_installment_no = NULL, move_surcharge_amount = NULL,
    move_of_payment_deadline = NULL, move_of_payment_batch_id = NULL,
    deferred_from_move_of_payment_batch_id = NULL
WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0';

UPDATE public.masterlist
SET account_status = 'active', aging_bucket = 'current', remedial_flag = false,
    outstanding_balance = 897600.00, total_loan = 897600.00
WHERE id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0';

COMMIT;
```

**Reset verification — every value must be exactly as stated:**

```sql
SELECT
  (SELECT count(*) FROM public.penalties WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0') AS penalties,
  (SELECT count(*) FROM public.postings  WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0') AS postings,
  (SELECT count(*) FROM public.payments  WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0') AS payments,
  (SELECT count(*) FROM public.dcr_items di JOIN public.payments p ON p.id = di.payment_id
    WHERE p.masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0')                                   AS dcr_items,
  (SELECT count(*) FROM public.amortization_schedules
    WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0' AND status <> 'pending')             AS non_pending,
  (SELECT count(*) FROM public.amortization_schedules
    WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0'
      AND (amount_due <> 74800.00 OR penalty_amount <> 0 OR penalty_periods_applied <> 0))            AS wrong_amounts,
  (SELECT count(*) FROM public.amortization_schedules
    WHERE masterlist_id = 'c60d90ac-0774-4fd6-a739-959e0061fdc0')                                     AS total_rows,
  (SELECT public.recompute_outstanding_balance('c60d90ac-0774-4fd6-a739-959e0061fdc0'::uuid))         AS derived_balance;
```

- [ ] `penalties = 0`, `postings = 0`, `payments = 0`, `dcr_items = 0`
- [ ] `non_pending = 0`, `wrong_amounts = 0`, `total_rows = 12`
- [ ] `derived_balance = 897600.00`
- [ ] Due dates run `2026-10-08` … `2027-09-08`

---

## Migration Discipline (mandatory)

### Explicit, ordered timestamps

| Order | Filename |
|-------|----------|
| 1 | `20260909100000_unroll_existing_rolled_rows.sql` |
| 2 | `20260909105000_reconcile_unrolled_account_balances.sql` |
| 3 | `20260909110000_remove_rollover_from_refresh_aging.sql` |

Full 14-digit timestamps, spaced so un-roll → reconcile → code-removal is provable by sort order.
v1.0's date-only `20260909_` prefixes left ordering to alphabetical chance.

### Byte-identical copies in both folders

Every migration must exist in **both** `loanstar/supabase/migrations/` and `supabase/migrations/`.

```powershell
$name = '20260909100000_unroll_existing_rolled_rows.sql'
Copy-Item "loanstar\supabase\migrations\$name" "supabase\migrations\$name" -Force

$a = (Get-FileHash "loanstar\supabase\migrations\$name" -Algorithm SHA256).Hash
$b = (Get-FileHash "supabase\migrations\$name"          -Algorithm SHA256).Hash
if ($a -eq $b) { "OK  byte-identical: $name" }
else           { Write-Error "MISMATCH: $name"; exit 1 }
```

Repeat for the second migration. **A phase is not complete until its hash check passes.**

### Applying, and the MCP-assigned version

`apply_migration` assigns its **own** version. After applying, read the real version and rename both
copies to match:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

```powershell
$old = '20260909100000_unroll_existing_rolled_rows.sql'
$new = '<assigned_version>_unroll_existing_rolled_rows.sql'
Move-Item "loanstar\supabase\migrations\$old" "loanstar\supabase\migrations\$new"
Move-Item "supabase\migrations\$old"          "supabase\migrations\$new"
# re-run the hash check after renaming
```

### Dry-run rule

Every mutating statement runs first inside `BEGIN; … ROLLBACK;` via `execute_sql`, against real
data, with its pass criteria checked. The MCP returns only the final result set of a multi-statement
call — issue verification queries separately, or read the `NOTICE` stream.

---

## Do Not Touch

**Move of Payment — entirely off limits.** Verified to share nothing with the rollover: different
status (`moved` vs `rolled`), different columns (`moved_at`, `move_of_payment_batch_id`,
`moved_to_installment_no`, `move_surcharge_amount`, `move_of_payment_deadline`,
`deferred_from_move_of_payment_batch_id`), different variables. Covers the revert block at lines
105–159, `applyMoveOfPayment`, the PDC-check lifecycle, and migrations `20260901*`/`20260902*`.

**Penalty accrual loop (lines 200–282)** — the correct behaviour. The only edits are the removal of
the two `v_final_penalty` mirrors, which no accrual arithmetic reads.

Also untouched: `penalty_periods_applied`; `penalty_rate_for_segment`; origination-discount
reversion; Collector Discount (`penalty_discount_amount`, `recompute_account_penalties`,
`20260903*`); posting logic (`post_single_dcr_item`, `post_internal_transfer`,
`recompute_outstanding_balance`, `is_account_fully_settled`, penalty-first split,
`postings.penalty_amount`, `dcr_items.penalty_paid_amount`); aging buckets, `remedial_flag`,
`aging_thresholds`; ledger rendering of historical carried/rolled rows.

**Columns kept, not dropped:** `rolled_at`, `rolled_into_installment_no`, `carried_interest_amount`,
`carried_penalty_amount`, `carried_from_installment_no`. Eight quarantined rows still use them.

---

## Rollback Plan

| Phase | Rollback |
|-------|----------|
| 2 / 3 | Re-apply `refresh_one_masterlist_aging` from `20260908231312_penalty_monthly_compounding.sql`; `git revert` the TS commit. Take a copy of the deployed `prosrc` before applying. |
| 1d | Restore from `_backup_rolled_rows_20260909` (which captured the pre-1c destination rows) is not enough — 1d writes `masterlist`, not `amortization_schedules`. Add `_backup_masterlist_balances_20260909` to the pre-flight backup (below) and restore `outstanding_balance` from it per id. |
| 1c | Not reversible by re-running a script — the rollover is not idempotent. Mitigated instead by: assertions that abort before any partial write; the whole `DO $$` block running in one transaction; and a pre-flight backup. |

**Pre-flight backup (run before Phase 1c):**

```sql
CREATE TABLE public._backup_rolled_rows_20260909 AS
SELECT * FROM public.amortization_schedules
WHERE status = 'rolled'
   OR id IN (SELECT d.id FROM public.amortization_schedules s
             JOIN public.amortization_schedules d
               ON d.masterlist_id = s.masterlist_id
              AND d.installment_no = s.rolled_into_installment_no
             WHERE s.status = 'rolled');

CREATE TABLE public._backup_rollover_penalties_20260909 AS
SELECT * FROM public.penalties WHERE notes LIKE '30-day rollover:%';

-- For Phase 1d rollback: stored balance of every account this plan may touch.
CREATE TABLE public._backup_masterlist_balances_20260909 AS
SELECT id, outstanding_balance, total_loan, account_status, aging_bucket, remedial_flag
FROM public.masterlist
WHERE id = ANY (ARRAY[
  '30ebc0a2-ca92-49c7-b400-10c66754b6e0','9c6f0048-50ca-4481-b738-a13c097beed5',
  '9488b31e-95fa-4fbe-b77c-affedf43af42','9776dcab-88d0-49b2-954d-416888bd4262',
  'd383bea5-d1e2-4472-89d8-4e936888677a','5b3d85b8-4de1-452f-a5fb-beb86148a52c',
  '3638a07f-f69c-4df5-a9e8-91218c978402',
  'c91f8a2d-2848-45df-9ed5-52b43e589936','e74fff24-dea6-4606-b93e-2ed8f6039390',
  'e0296c9a-29eb-411c-b948-2f8b8c4f4858']::uuid[]);
```

Captures both sides of every rollover pair, plus the pre-change masterlist balances. Drop after
a clean week.

---

## Success Criteria

- [ ] **P0** Audit doc committed
- [ ] **P1a** Classification returns 15 AUTO / 9 QUARANTINE; assertions 1a.2 and 1a.3 return zero rows
- [ ] **P1b** Quarantine decision recorded and approved
- [ ] **P1c** Dry-run passes; applied; 9 rolled rows remain; 15 penalties reversed; no negative money;
      every un-rolled row's `penalty_periods_applied` = its whole-months-overdue
- [ ] **P1d** 6 AUTO accounts' `outstanding_balance` set to derived; `stored = derived` after apply;
      quarantined accounts untouched
- [ ] **P2** Rollover block and 6 dead variables removed; `prosrc` assertion passes; smoke test clean
- [ ] **P3** `tsc --noEmit` and `eslint` clean; `npm test` green
- [ ] **P4** Every `'rolled'` reference classified; no downstream change required
- [ ] **P5.2** AN300459: 3 overdue rows, all Targets 74,800, penalties 11,790.35 / 7,667 / 3,740, zero rolled
- [ ] **P5.3** Installment #2 payable alone via the real posting path
- [ ] **P5.4** Three segments verified; zero new rolled rows; quarantined rows intact
- [ ] **P5.5** `refresh_all_aging()` sweep produces zero rolled rows and zero rollover penalties
- [ ] **P5.6** AN300459 reset; all reset assertions pass
- [ ] **Post-cron** Morning after: zero rolled rows and zero rollover penalties in the last 24h

---

## Execution Order

```
P0  commit audit doc
P1a run classification + assertions      (read-only)
P1b obtain quarantine decision           (BLOCKING — human)
     take pre-flight backup
P1c dry-run → verify → apply 20260909100000 → V1–V5 + periods_applied check
P1d dry-run → verify → apply 20260909105000 → stored == derived for the 6 AUTO accounts
P2  dry-run → verify → apply 20260909110000 → smoke + prosrc assertion
P3  edit posting.ts → tsc → eslint → npm test
P4  downstream grep + classification
P5  5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6
     hash-check both migration folders after each apply
     rename migrations to MCP-assigned versions; re-hash
next morning: post-cron sweep
```

---

## File Inventory

**Create**
- `loanstar/docs/revision-plans/penalty-rollforward-audit.md` ✅ done
- `loanstar/supabase/migrations/20260909100000_unroll_existing_rolled_rows.sql` + identical copy in `supabase/migrations/`
- `loanstar/supabase/migrations/20260909105000_reconcile_unrolled_account_balances.sql` + identical copy in `supabase/migrations/`
- `loanstar/supabase/migrations/20260909110000_remove_rollover_from_refresh_aging.sql` + identical copy in `supabase/migrations/`

**Edit**
- `loanstar/src/lib/ar/posting.ts` — remove rollover from `refreshMasterlistAging`
- `loanstar/src/lib/ar/__tests__/penalty-accrual.test.mts` — add a case asserting three overdue
  installments each hold their own Target with independent compounding and no rolled status

**Temporary (drop after a clean week)**
- `public._backup_rolled_rows_20260909`
- `public._backup_rollover_penalties_20260909`

---

## Commit Messages

```
docs: record transcript audit for 30-day rollover removal

The automatic 30-day roll-forward merges overdue installments, which no
client transcript supports. Records the quotes showing each missed month
must stay its own payable line with an independently compounding penalty.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

```
fix(aging): un-roll 15 rolled installments, quarantine 9

Restores rolled rows to overdue and removes the folded amounts from their
destination installments, unwinding each chain LIFO. Eight rows across
three accounts are quarantined because their destination has since been
paid or partially paid; two of those loans are closed, so reversing them
is a business decision rather than a mechanical one.

Every subtraction is asserted before it runs — a shortfall aborts the
whole migration rather than flooring the value to zero. Each un-rolled
row's penalty_periods_applied is seeded to whole-months-overdue so the
next aging run resumes the fee forward-only rather than retroactively
compounding 1-3 rounds at once.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

```
fix(aging): reconcile stored balance for the 6 un-rolled accounts

masterlist.outstanding_balance for these accounts was understated by the
30-day rollover's compounding penalties (refresh_one_masterlist_aging only
rewrites the stored balance on a discount revert). Sets it to the derived
value, ID-scoped, with a guard that aborts if the derived value is lower
than stored. Quarantined and all other accounts untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

```
fix(aging): remove 30-day roll-forward from refresh_one_masterlist_aging

Each overdue installment now keeps its own Target and compounds its own
penalty, matching the client's model. Removes the rollover block and the
six variables that existed only to serve it, v_final_penalty included.
The penalty accrual loop, Move of Payment revert, discount reversion and
aging/remedial updates are unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

```
fix(aging): drop rollover from the TypeScript aging twin

Keeps refreshMasterlistAging in step with the SQL function. The function
is orphaned — only dev-simulate-aging reaches it, and that route uses the
RPC — but the twins should not drift further apart.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

```
test(aging): cover independent compounding across overdue installments

Asserts three consecutively overdue installments each keep Target 74,800
with penalties compounding separately, and that none is marked rolled.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

**End of plan — v2.1. Ready for execution approval.**
