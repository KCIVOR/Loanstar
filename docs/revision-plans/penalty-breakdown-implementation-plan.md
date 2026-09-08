# Late Fee (Penalty) — Implementation Plan

Phase-by-phase, surgical. Built from `penalty-breakdown-requirements.md` (11
rules) and `penalty-breakdown-audit.md` (what exists / is missing). Every
question the requirements doc raised is already answered from the transcripts.

### Names verified against the live DB + code (2026-09-09)

| Thing | Verified fact |
|---|---|
| `refresh_one_masterlist_aging(p_masterlist_id uuid, p_as_of date DEFAULT CURRENT_DATE)` | exists, `SECURITY DEFINER`, **returns `void`**. Penalty block is `ORDER BY due_date ASC, installment_no ASC LIMIT 1`. Base = `GREATEST(0, amount_due − discount_amount − amount_paid)` — does **not** subtract `penalty_discount_amount`, does **not** add prior `penalty_amount`. Guard `IF v_penalty > v_existing_penalty`. Rollover already splits `v_penalty_portion` / `v_interest_portion` into dest `penalty_amount` / `amount_due`. |
| `refresh_all_aging()` | exists, **returns `integer`**, `SECURITY DEFINER`, bare `FOR r IN SELECT id FROM public.masterlist WHERE account_status IN ('active','remedial') LOOP PERFORM refresh_one_masterlist_aging(r.id, CURRENT_DATE)` — **no per-account exception handling**. |
| cron | job `loanstar-aging-daily`, `0 17 * * *`, active, `SELECT public.refresh_all_aging()`. (Separate job `loanstar-reminders-daily` `0 1 * * *` — do not touch.) |
| `refreshMasterlistAging` (TS) | `src/lib/ar/posting.ts:535`. Callers now: **only** `dev-simulate-aging/route.ts` + two test files (`aging-parity.test.mts`, `refresh-masterlist-aging-move-of-payment.test.mts`). Collector-page call already removed. |
| `penalty_rate_for_segment(p_segment text)` | segments are `'seafarer' | 'sme' | 'individual'` — **RAISES** on null/unknown. Keys: `penalty_rate` (0.15, seafarer), `penalty_rate_individual` (0.05), `penalty_rate_sme` (0.05). `aging_thresholds` = `{"30":30,"60":60,"90":90}`. |
| `penalties` cols | `id, masterlist_id, amortization_schedule_id (nullable), amount, rate_applied, calculated_at (default now()), notes` — no reversal columns. |
| `amortization_schedules` | has `penalty_amount`, `penalty_discount_amount`, `discount_amount`, `discount_source`, `line_type` (CHECK `standard|interest|principal`), `status` (CHECK `pending|partial|paid|overdue|rolled|moved`), `rolled_at`, `rolled_into_installment_no`, `moved_at`. **UNIQUE (masterlist_id, installment_no)**. No `penalty_periods_applied` / `carried_*` (Phases 2 & 5 add them). |
| `dcr_item_allocations` cols | `id, dcr_item_id, amortization_schedule_id (nullable), amount, created_at` — **no discount/penalty columns**. The collector-discount split lives on **`dcr_items`**: `interest_discount_amount` + `interest_discounted_installment_nos`, `penalty_discount_amount` + `penalty_discounted_installment_nos`, `discount_reason`. |
| `postings` cols | `id, dcr_id, payment_id, masterlist_id, amortization_schedule_id (nullable), amount, posted_by, posted_at`. No `penalty_amount` (Phase 4 adds it). |
| `post_single_dcr_item(p_dcr_id, p_payment_id, p_allocations jsonb, p_actor_id, p_now timestamptz)` | `SECURITY DEFINER`, returns jsonb. Inserts `postings` per allocation. Reads discount inputs from `dcr_items`, distributes per-installment by `array_length(...)`. `SELECT * INTO v_payment FROM payments ... FOR UPDATE` → `v_payment.payment_date` (a `date`) **is in scope**. Ends with `recompute_outstanding_balance` → `is_account_fully_settled` → `UPDATE masterlist`. |
| `sumPenaltyIncome` | `src/lib/reports/metrics/money.ts:179` — `from("penalties").select("amount, calculated_at")` by `calculated_at`. Metric strings at lines 60–64. Second consumer: `src/lib/reports/aggregates.ts:188` `totalPenalties` (also sums `penalties.amount`). |
| ledger builder | `src/lib/ledger/build-account-ledger-rows.ts` — has `penaltyDiscount`, `discountSource`, `netPenalty()`. No `carried*` fields yet. |
| DCR allocate UI | `src/app/collector/dcr/page.tsx` — `allocationModal` with `interestDiscountSelections` / `penaltyDiscountSelections`; preview route `GET /api/collector/dcr/allocation-preview`. |
| table name | `public.masterlist` (**singular**); cols `segment`, `account_status`, `aging_bucket`, `remedial_flag`, `outstanding_balance`, `total_loan`. |

**Global rules for all phases**

- **One source of truth after Phase 1: the SQL function `refresh_one_masterlist_aging`.**
  Never re-introduce a second copy of the accrual logic.
- Every new migration goes in **both** `supabase/migrations/` and
  `loanstar/supabase/migrations/` (byte-identical), applied to the live DB via
  the Supabase MCP, and its recorded version renamed to match.
- Schema changes are **additive only** — new nullable columns with defaults, new
  tables. No column drops, no type changes, no renames on existing columns.
- `refresh_one_masterlist_aging` has several unrelated blocks in it
  (move-of-payment revert, discount reversion, aging-bucket write, masterlist
  totals). **Only the penalty-accrual block and the 30-day-rollover block may be
  touched, and only where a phase says so.** Diff against the live definition
  before and after every edit.
- No change to: `post_internal_transfer`, `computeOffsetDiscount`, the
  collector-discount posting math, `recompute_outstanding_balance`,
  `is_account_fully_settled`, move-of-payment, origination-discount reversion,
  reminders/SMS, or any report metric other than the one each phase names.
- Run `npm test`, `tsc --noEmit`, `npm run build`, and `eslint` on touched files
  at the end of every phase. Live-verify on a throwaway/backed-up account.

---

## Phase 1 — Collapse to one implementation (no behaviour change)

**Why first:** the accrual logic exists twice — the SQL cron function and a
~250-line TypeScript twin `refreshMasterlistAging` (`src/lib/ar/posting.ts:535`),
now called **only** by the dev-simulate-aging route. Every later phase should
touch the logic **once**.

**Do**
1. Change `src/app/api/ar/masterlist/[id]/dev-simulate-aging/route.ts` to call
   the SQL function via RPC — `supabase.rpc("refresh_one_masterlist_aging", {
   p_masterlist_id: id })` (`p_as_of` has a DB default, so it can be omitted;
   pass it if the route ever needs backdating) — instead of importing
   `refreshMasterlistAging`. **The SQL function returns `void`**, but the route
   currently uses `result.agingBucket` / `result.remedialFlag` for its audit
   event and its `jsonOk` response — so after the RPC, add a
   `SELECT aging_bucket, remedial_flag FROM masterlist WHERE id = :id` and build
   the same response shape from that.
2. **Parity check before deleting anything:** on 3–4 backed-up test accounts of
   different schedule types (monthly, weekly, quarterly_special), snapshot the
   schedule + masterlist, run the OLD TS path, snapshot again, revert, run the
   SQL path, snapshot again. The two result snapshots must match. Record any
   divergence in this plan; if they diverge, the SQL result wins (it is the
   production path) — note it as a pre-existing bug, do not "fix" the TS twin.
3. Delete `export async function refreshMasterlistAging` and any now-unused
   helpers it alone used (`daysPastDue` etc. stay — used elsewhere).
4. **Two test files bind to the deleted function**, not one:
   - `src/lib/ar/__tests__/aging-parity.test.mts` — rewrite as a **pure shadow
     of the SQL accrual math** (testable JS mirror, same pattern as
     `offset-discount-closure.test.mts`), not a call into deleted code.
   - `src/lib/ar/__tests__/refresh-masterlist-aging-move-of-payment.test.mts` —
     this is the **only unit coverage of the Move-of-Payment revert block**.
     Deleting the TS function removes that coverage. Either (a) keep
     `refreshMasterlistAging` as a **non-exported test-only helper** re-scoped to
     just the move-of-payment revert (smaller surface, still one production
     path = SQL), or (b) port these assertions to a pure shadow of the SQL
     revert block. Decide and record which.

**Constraints**
- **No SQL change in this phase.** `refresh_one_masterlist_aging` and
  `refresh_all_aging` untouched.
- Do not change what the dev route *does* (same backdating, same audit-event
  fields, same response shape) — only how it invokes the refresh.
- Do not remove `daysPastDue`, `computeAgingBucket`, `calculatePenaltyAmount`,
  `DEFAULT_AGING_THRESHOLDS` from `schedule.ts` — other modules import them.
- Grep for every `refreshMasterlistAging` reference first; the only non-test
  call site is the dev route.

**Done when:** dev tool still works and returns the same `agingBucket` /
`remedialFlag` as before; the production accrual path is SQL-only; `npm test`
green (with the two test files reworked, not just deleted).

---

## Phase 2 — Monthly compounding on every overdue installment (Rules 2 & 3)

**The core rewrite.** Today: only the single oldest overdue installment gets a
**flat one-time** 5%; it only grows if the 30-day rollover folds it forward, and
freezes on the last installment. Required: **every** overdue installment accrues
a fresh fee **every calendar month** on its **current balance including all
prior fees**, indefinitely.

**Schema (new migration)**
- Add `amortization_schedules.penalty_periods_applied smallint NOT NULL DEFAULT 0`
  — how many monthly fee rounds have already been charged on this row.
  (Idempotency: the cron can run any number of times per day without
  double-charging.)

**SQL change — `refresh_one_masterlist_aging`, penalty-accrual block only**
1. Replace the single-row `SELECT … overdue … LIMIT 1` (for penalty purposes)
   with a **loop over every** row where
   `status IN ('pending','partial','overdue') AND due_date < p_as_of`
   (exclude `rolled`, `moved`, `paid` — same exclusions as today).
   - The **aging-bucket** calculation still uses the single oldest overdue row —
     do not change that; only the penalty loop becomes multi-row.
2. Per row, compute `v_target_periods = number of whole calendar months from
   due_date to p_as_of` (e.g. due Jan 10, as-of Mar 15 → 2). First fee lands at
   **1 full month** overdue.
   > **Confirm at demo:** the Aug-25 transcript is split between "penalty the
   > moment the due date passes" (Rovick) and "per month per month" / "October
   > penalty, November penalty" (the monthly-boundary reading). This plan
   > implements **monthly boundaries** (matches "per month per month"). If the
   > client wants day-1, change the period function only — nothing else.
3. If `v_target_periods > penalty_periods_applied`, apply the missing rounds,
   **compounding**: for each missing period,
   `v_bal := amount_due − discount_amount − penalty_discount_amount − amount_paid
   + penalty_amount;  v_add := half_up(v_bal × rate);  penalty_amount += v_add`.
   Then set `penalty_periods_applied = v_target_periods`, `status = 'overdue'`,
   and insert one `penalties` row per round (keep the existing
   `{amount, rate_applied, notes}` shape; `notes = 'Monthly late fee — period N'`).
   > **This base differs from today's on purpose.** The live formula is
   > `GREATEST(0, amount_due − discount_amount − amount_paid)` — it neither
   > subtracts `penalty_discount_amount` nor adds the running `penalty_amount`.
   > The new base subtracts a waived-penalty amount (so a waiver stops
   > compounding) and adds prior fees (so it compounds on the running balance,
   > per the transcript). Call this out at review — it is the intended change,
   > not a regression.
4. Rate: keep `penalty_rate_for_segment(v_segment)` exactly as today.

**30-day rollover block — minimal touch**
- Keep it. A `rolled` row leaves the overdue set, so it stops accruing — no
  double-count. When it folds into the next row, that row's now-larger balance
  is what its future monthly fee compounds on. This composes correctly.
- **One change:** when a row rolls, also copy its `penalty_periods_applied` to
  the destination row *only if* the destination's own `due_date` is already
  past (so the destination doesn't "lose" elapsed periods). If the destination
  is not yet due, leave its counter at 0. Nothing else in the rollover block
  changes.

**Constraints**
- Touch **only** the penalty-accrual loop and the one rollover line above.
  Move-of-payment revert, discount reversion, aging-bucket write, `masterlist`
  update at the bottom — **byte-identical** to the live definition.
- Do not change `refresh_all_aging` (Phase 7 handles its robustness).
- Do not change the config keys or `penalty_rate_for_segment`.
- Do not change any table other than adding the one column above.
- The `penalties` table stays insert-only in this phase (reversal is Phase 3).

**Done when:** an account 3 months overdue shows 3 compounding rounds on **each**
overdue installment; a fully-overdue **final** installment keeps accruing monthly;
re-running the cron the same day changes nothing.

---

## Phase 3 — Auto-remove wrong fees + recompute on payment (Rules 4a & 4b)

Today nothing recomputes penalty when a payment is recorded — only the nightly
cron does, and it can only ever add.

**Schema (new migration)**
- Add `penalties.reversed_at timestamptz NULL` and
  `penalties.reversal_reason text NULL`.
- (A reversal is recorded as: mark the offending `penalties` rows `reversed_at`,
  **and** insert one compensating row with a **negative** `amount` + a
  `reversal_reason`, so any sum-by-`calculated_at` nets out automatically.)

**New SQL function** `public.recompute_account_penalties(p_masterlist_id uuid)`
- For each still-open installment: recompute `penalty_periods_applied` and the
  compounded `penalty_amount` **from scratch** using the same math as Phase 2,
  but with an **on-time check**: if a confirmed payment exists for that
  installment whose `payment_date <= due_date` and it covers the installment,
  the installment's penalty target is **0** (fee should never have applied).
- Where the freshly-computed penalty is **less** than what's on the row, write
  the reduction: lower `amortization_schedules.penalty_amount`, mark the
  matching `penalties` rows `reversed_at`, insert the negative compensating row
  (`reversal_reason = 'paid on/before due date'` or `'recomputed after payment'`).
- Where it is **more** (a partial late payment left a balance that has since
  aged another month), top it up — same as Phase 2.

**Wire it in**
- `post_single_dcr_item` (payment posting): after the allocation loop finishes
  updating the schedule rows but **before** the existing
  `v_new_balance := public.recompute_outstanding_balance(v_masterlist_id)` /
  `is_account_fully_settled` / `UPDATE masterlist` tail, insert
  `PERFORM public.recompute_account_penalties(v_masterlist_id)` — so the balance
  and settled check see the reversed/re-added fees. Same transaction. The
  on-time check reads `v_payment.payment_date` (already selected `FOR UPDATE` at
  the top of the function).
- The DCR **reject / un-post** path: same call after it reverses the schedule
  rows, so reversing a payment re-inflates the fee correctly. (Confirm the exact
  function name — grep `postings` delete / `status = 'rejected'` in
  `supabase/migrations/`; it is **not** `post_single_dcr_item`.)

**Constraints**
- `recompute_account_penalties` must reuse the **exact** compounding formula
  from Phase 2 (copy it into a shared internal helper if that avoids drift, but
  do not create a second cron path).
- Do not change what `post_single_dcr_item` does to the schedule rows, discount,
  or balance — only insert the one `PERFORM` call just above its
  `recompute_outstanding_balance` tail.
- Do not change `refresh_one_masterlist_aging`'s own accrual (it and the new
  function share the formula but the cron path is unchanged structurally).
- No UI change in this phase.
- The negative-`amount` compensating row is the **only** way a `penalties` row's
  effect is undone — never `DELETE` from `penalties`.

**Done when:** record a payment dated before the due date on an account that
already accrued a fee → the fee disappears (and a negative `penalties` row is
logged); a partial late payment leaves a correctly-recomputed fee on the
remainder; rejecting that payment restores the fee.

---

## Phase 4 — Collector enters the fee portion + real "fee income" (Rules 5 & 6)

**Schema (new migration) — follow the existing `dcr_items` discount pattern**
`dcr_item_allocations` has no discount/penalty columns today; the collector
discount already lives on `dcr_items` as an aggregate + an installment-no array
(`penalty_discount_amount` + `penalty_discounted_installment_nos`). Mirror that:
- `dcr_items.penalty_paid_amount numeric NOT NULL DEFAULT 0` — total of this
  payment the collector says is late-fee money.
- `dcr_items.penalty_paid_installment_nos integer[] NOT NULL DEFAULT '{}'` — which
  installments it applies to (so `post_single_dcr_item` can split it per row the
  same way it splits `penalty_discount_amount` via `array_length`).
- `postings.penalty_amount numeric NOT NULL DEFAULT 0` — the per-posting-row
  share, written at posting time so the income report has a clean source.
- CHECK `penalty_paid_amount >= 0`.

**UI — the DCR Allocate modal only** (`src/app/collector/dcr/page.tsx`)
- Alongside the existing `penaltyDiscountSelections` control, add a **"late fee
  paid ₱"** input (aggregate, or per eligible installment to match the discount
  UI), defaulting to 0, capped at the summed outstanding `penalty` of the ticked
  rows and at the payment amount. Transcript: *"dito siya pwede maglagay… mag-type
  kung magkano"*.
- Send `penaltyPaidAmount` + `penaltyPaidInstallmentNos` in the same payload that
  already carries the discount fields. `GET /api/collector/dcr/allocation-preview`
  echoes them back.

**Posting — `post_single_dcr_item`**
- Add a `v_penalty_paid_share` computed exactly like the existing
  `v_penalty_share` (`half_up(penalty_paid_amount / array_length(...))` when the
  row's `installment_no` is in `penalty_paid_installment_nos`).
- Apply it: that row's `penalty_amount` is reduced by `v_penalty_paid_share` (the
  fee got paid). `amount_paid` still rises by the **full** allocation `amount`,
  and the Pass A / Pass B "is it settled?" thresholds are untouched.
- Write `postings.penalty_amount = v_penalty_paid_share` on that allocation's
  `postings` row.

**Report — `src/lib/reports/metrics/money.ts` only**
- `sumPenaltyIncome` (line 179): switch from `from("penalties").select("amount,
  calculated_at")` by `calculated_at` (fees **charged**) to `from("postings")
  .select("penalty_amount, posted_at")` by `posted_at` (fees **collected**).
- Update the metric's human strings at lines 62–64: `description` ("collected
  during the period", not "assessed") and `formula`
  ("SUM(postings.penalty_amount) where posted_at is in the period").
- Keep the metric id `money.penaltyIncome` and label "Penalty income".

**Constraints**
- `RecordPaymentForm` / `RecordPaymentPage` — **unchanged**. The gross payment is
  captured there; the fee split happens later at allocation, as the client
  described.
- `src/lib/reports/aggregates.ts` `totalPenalties` (line 188, also sums
  `penalties.amount`) — leave it; note that Phase 3's negative compensating rows
  will (correctly) net into it.
- The auto-allocation fallback (`computeAutoAllocation`) — unchanged; it leaves
  `penalty_paid_amount = 0` (collector edits after).
- Do not change any other report metric, the collections-register column set, or
  the ledger in this phase.
- Do not change `payments` schema. `dcr_items` gets **only** the two additive
  columns above.
- Borrower has no input here (confirmed: *"wala siyang control si borrower"*).

**Done when:** a ₱10,500 payment on ₱10,000 due + ₱500 fee can be recorded as
₱10,000 loan / ₱500 fee; the row's `penalty_amount` drops by ₱500; the
"Penalty income" KPI reflects **collected** fees for the period.

---

## Phase 5 — Balance breakdown + ledger total fix (Rule 10)

**Schema (new migration)**
- `amortization_schedules.carried_interest_amount numeric NOT NULL DEFAULT 0`
- `amortization_schedules.carried_penalty_amount numeric NOT NULL DEFAULT 0`
- `amortization_schedules.carried_from_installment_no smallint NULL`
- Set by the 30-day rollover block. It **already** computes `v_interest_portion`
  and `v_penalty_portion` of the roll amount and bumps the destination row's
  `amount_due` / `penalty_amount`. Add: also write those two figures into
  `carried_interest_amount` / `carried_penalty_amount` and set
  `carried_from_installment_no = v_overdue.installment_no` on the destination.
  The existing bump stays unchanged — these columns are display-only metadata.

**Ledger — `src/lib/ledger/build-account-ledger-rows.ts`**
- Add `carriedInterest`, `carriedPenalty`, `carriedFromInstallmentNo` to
  `LedgerSchedule` and map them from the new columns.
- The two server-rendered ledger pages (AR account detail, Borrower loan panel)
  show a small "incl. ₱X carried from #N" note on a rolled-into row.
- **Fix the Report Total row:** its running balance must subtract the `discount`
  **and** `penaltyDiscount` columns (today it ignores them), so a fully-settled
  account's total reads ₱0.00 instead of the discount amount.

**Constraints**
- Additive columns only; the existing `amount_due` / `penalty_amount` bump in
  the rollover is **kept** (removing it would change every balance calc).
- Touch only `build-account-ledger-rows.ts`, the AR account-detail ledger
  render, and the borrower loan-panel ledger render. No change to DCR, posting,
  reports.
- Do not change the rollover's arithmetic — only add the extra column writes.

**Done when:** a rolled-into installment's ledger row shows what it's made of;
a settled discounted account's Report Total shows ₱0.00.

---

## Phase 6 — Invoice / Auto / REM: interest stops, fees begin (Rule 9)

**Blocked on a client answer** (in the requirements doc): is the generic monthly
fee on the overdue principal row acceptable, or do they want the specific
invoice "5% of principal" behaviour and an explicit interest-stop at 3 months?

**If "generic fee is fine" (most likely):** this phase is **verification only** —
confirm no interest accrues post-release for invoice/auto/REM (it doesn't:
`computeInvoiceLoan` and the origination math bake all interest into the schedule
at release), document it, add a test that an invoice loan 4 months overdue shows
**no new interest** and a compounding monthly fee. **No code change.**

**If they want the specific invoice rule:** in the Phase 2 accrual loop, add a
segment/schedule check — for invoice loans, once the principal row is past due,
apply the fee to the principal balance (already the behaviour) and confirm the
5%-of-principal figure matches `computeInvoiceLoan.penaltyAmount`. Small,
localised to the accrual loop.

**Constraints**
- Do not touch `computeInvoiceLoan` or any origination computation.
- Any change stays inside the Phase 2 accrual loop.

---

## Phase 7 — Robustness + the "duplicate month" question

1. **Per-account error isolation in `refresh_all_aging`** (new migration): wrap
   the `PERFORM refresh_one_masterlist_aging(r.id, CURRENT_DATE)` in a
   `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END` block that logs the
   failing `masterlist_id` and continues, so one bad account can't abort the
   whole nightly run. Concrete trigger seen: `penalty_rate_for_segment` **raises**
   if `masterlist.segment` is null/unknown — one un-backfilled account currently
   kills the entire night.
   - The function today `RETURNS integer`. Keep that (return the processed count)
     and just add a `RAISE WARNING` per failure — simplest, no signature change.
     If a `{processed, failed}` shape is wanted instead, it needs
     `DROP FUNCTION public.refresh_all_aging()` first (return-type change can't
     `CREATE OR REPLACE`) and the cron `command` stays `SELECT ...` so that's
     fine — but treat it as a deliberate signature change, not a constraint-free
     edit.
2. **Duplicate-month bug:** it could not be reproduced. `amortization_schedules`
   has **`UNIQUE (masterlist_id, installment_no)`** — a true duplicate row is
   impossible. The `dev-simulate-aging` route's own comment already documents the
   real effect: re-running it dragged the next open installment's `due_date`
   backwards onto earlier ones ("installments #1–#4 all collapsed onto
   2026-05-22") — a **date collision**, not a row duplication. Likely the client
   saw either that, or a UI grouping artifact.
   - Get the exact repro from the Sept-04 recording / Rovick.
   - If it's the dev tool: make `dev-simulate-aging` **idempotent** (restore
     original due dates before re-shifting, or refuse to run twice) — that route
     only.
   - If it's the real cron: fix in `refresh_one_masterlist_aging` (likely the
     move-of-payment schedule-extension or rollover appending a row twice) —
     targeted, with a regression test.
3. **Fee-waiver "not yet due" constraint (Rule 7):** confirm with the client
   whether accumulated **overdue** fees should be waivable (the Aug-25 transcript
   says yes — *"malaki na yung penalty… bayaran mo na lang ng ganitong amount"*).
   If yes, relax the picker's `not yet due` filter **for the penalty side only**
   in `src/app/collector/dcr/page.tsx` / the allocation-preview route. Do not
   touch the interest-discount side.

**Constraints**
- Item 1: `refresh_all_aging` body only.
- Item 2: whichever single path the repro points to — nothing else.
- Item 3: the penalty-eligibility filter only; interest-discount eligibility
  unchanged.

---

## Phase 8 — Tests, regression, validation journey

- **Pure shadow tests** (`.mts`, node:test) for the new accrual math: monthly
  compounding over N months, multiple overdue installments, on-time reversal,
  partial-late recompute, rollover composition. Mirror the SQL, same approach as
  `offset-discount-closure.test.mts`.
- Test `sumPenaltyIncome` now sums collected, not charged.
- Full run: `npm test`, `tsc --noEmit`, `npm run build`, `eslint` on every
  touched file.
- **Live end-to-end on a backed-up account:** accrue over 3 simulated months →
  record an on-time-but-late-proof payment → fee vanishes → record a partial
  late payment → fee recomputes → check the ledger breakdown and the "Penalty
  income" KPI.
- Write `penalty-breakdown-validation-journey.md` (plain-language, like the
  Task 2 one) for the client demo.

**Constraints**
- New test files only; do not weaken existing tests to make them pass — if an
  existing test breaks, it caught a real behaviour change, investigate it.

---

## Phase dependency order

```
Phase 1 (collapse)  ──►  Phase 2 (compounding)  ──►  Phase 3 (reversal/recompute)
                                     │
                                     ├──►  Phase 4 (fee-portion + income report)
                                     ├──►  Phase 5 (breakdown + ledger total)
                                     └──►  Phase 6 (invoice rule — blocked on client)
Phase 7 (robustness)  — independent, can slot anywhere after Phase 1
Phase 8 (tests/journey) — last
```

## What's confirmed vs. still needs the client

**Confirmed from the transcripts** (do not re-ask): monthly compounding on the
running balance; every overdue installment; automatic reversal/recompute on
payment; collector types the fee portion (borrower has no say); fee-income
report must show **collected**; keep the automatic trigger.

**Confirm at the demo:** (a) first fee at 1 day overdue vs 1 full month
(plan assumes 1 month); (b) invoice/auto/REM — generic fee vs specific
5%-of-principal (Phase 6); (c) exact duplicate-month repro (Phase 7); (d) waive
overdue fees, not just not-yet-due (Phase 7).
