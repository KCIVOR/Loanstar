# Late Fee (Penalty) — Codebase & Database Audit

Audit against `penalty-breakdown-requirements.md` (11 rules). For each rule:
**does it exist**, and the concrete evidence. Nothing assumed — every finding is
backed by a file/line or a live DB query run 2026-09-09.

**Verdict summary**

| Status | Rules |
|---|---|
| ✅ Exists & works | 1 (auto trigger), 7 (fee discount), 8 (adjustable rate), 11 (aging + 91-day handoff) |
| ⚠️ Partial / wrong | 6 (income report), 9 (3-month rule), 10 (balance breakdown) |
| ❌ Missing entirely | 2 (monthly compounding), 3 (every overdue month), 4a (auto-remove wrong fee), 4b (recompute on payment), 5 (collector enters fee portion) |

Plus one **architecture problem**: the late-fee logic exists **twice** (SQL cron
function + a TypeScript copy) and must be kept in sync by hand.

---

## Rule-by-rule

### Rule 1 — Auto late fees every night — ✅ EXISTS

- Live cron job `loanstar-aging-daily`, schedule `0 17 * * *`, **active = true**
  (verified in `cron.job`). Runs `refresh_all_aging()`.
- `refresh_all_aging()` (live def verified): loops every `active`/`remedial`
  account, calls `refresh_one_masterlist_aging(id, CURRENT_DATE)`.
- **Gap:** the loop has **no per-account error handling** — if one account
  raises, the whole night's run aborts and the rest are skipped.
- No manual "apply penalty to selected borrowers" screen exists (`grep` found
  none). The client said automatic is preferred, so this is acceptable; a
  manual multi-select is a nice-to-have only.

### Rule 2 — Fee compounds EVERY month on the running balance — ❌ MISSING

- `refresh_one_masterlist_aging` (live def): the fee base is
  `GREATEST(0, amount_due − discount_amount − amount_paid)` — it **does not
  include the existing penalty**. So `v_penalty = rate × (fixed unpaid
  principal+interest)` is a constant for a given row.
- Guard: `IF v_penalty > v_existing_penalty THEN …`. After the first accrual
  `v_existing_penalty = v_penalty`, so the guard is false on every later run —
  the fee is charged **once** and never grows on that row.
- The **only** month-over-month growth is the 30-day rollover folding the row
  into the next installment. Confirmed by the design note in
  `20260826170000_penalty_accrual_idempotent.sql`: *"Month-over-month
  compounding … is delivered by the 30-day rollover below."*
- Consequence: on the **final installment**, or once every later installment is
  paid, there is **no next row to roll into** (`v_has_next = false`) → the flat
  5% freezes forever regardless of how many months pass.
- Required behaviour (requirements Rule 2): a fresh fee every month on
  `balance including all prior fees`, indefinitely.

### Rule 3 — Every overdue month gets its own fee — ❌ MISSING

- `refresh_one_masterlist_aging`: `SELECT … WHERE status NOT IN (paid, rolled,
  moved) AND (as_of − due_date) > 0 ORDER BY due_date ASC, installment_no ASC
  **LIMIT 1**`.
- Only the **single oldest** overdue installment is ever looked at. Installments
  2, 3, 4 all overdue → only #2 accrues; #3 and #4 accrue nothing until #2 is
  paid or rolls.

### Rule 4a — Auto-remove a wrong fee when the payment was on time — ❌ MISSING

- No code anywhere compares `payments.payment_date` to `amortization_schedules.
  due_date` for penalty purposes (`grep` across `src` + migrations).
- `post_single_dcr_item` (payment posting) touches penalty **only** via the
  `penalty_discount_amount` waiver — never removes an accrued penalty based on
  the payment date.
- `penalties` table schema: `{id, masterlist_id, amortization_schedule_id,
  amount, rate_applied, calculated_at, notes}` — **insert-only. No `reversed_at`,
  no status, no link to the payment that should cancel it.**
- Live data: 63 penalty rows, **0** with a negative amount, **0** with
  "reverse/undo/waive" in notes — the reversal path has never been used because
  it doesn't exist.

### Rule 4b — Recompute fees when a payment is recorded — ❌ MISSING

- The TypeScript `refreshMasterlistAging` (`src/lib/ar/posting.ts:535`) is
  imported and called **only** by `src/app/api/ar/masterlist/[id]/
  dev-simulate-aging/route.ts` (a dev/test tool).
- It is **not** called from payment recording, DCR add/submit, DCR posting,
  `post_single_dcr_item`, or the collector/AR account pages (`grep` confirms
  the only call sites).
- Net: in production the penalty figure changes **only** on the nightly cron —
  recording a payment does not re-run any penalty logic.

### Rule 5 — Collector enters the penalty portion of a payment — ❌ MISSING

- `RecordPaymentForm.tsx` fields: **Amount, Payment date, Reference no.,
  Channel, Remarks, Proof file.** No penalty field.
- `payments` table: no penalty column (schema verified).
- `dcr_items` table: has `interest_discount_amount`,
  `interest_discounted_installment_nos`, `penalty_discount_amount`,
  `penalty_discounted_installment_nos`, `discount_reason` — these are the fee
  **waiver** (Rule 7), not "how much of the received payment is fee".
- `dcr_item_allocations` / `postings`: one `amount` per schedule row, **no
  penalty split**.
- A payment does cover the penalty as part of the installment total
  (`amountDue − discount + penalty − paid`), but which part of the cash went to
  the fee is **not recorded anywhere**.

### Rule 6 — Report: penalty income COLLECTED — ⚠️ PARTIAL (measures the wrong thing)

- A metric `money.penaltyIncome` and a **"Penalty income"** KPI on
  `/reports/collections` **do exist**.
- But `sumPenaltyIncome` (`src/lib/reports/metrics/money.ts:179`) sums the
  **`penalties` table** (`amount` filtered by `calculated_at`) — that is
  penalties **CHARGED**, not penalties **collected**. A borrower billed
  ₱100,000 in fees who has paid nothing still shows ₱100,000 "penalty income".
- Cannot be made correct until Rule 5 exists (there's no "collected fee" number
  to sum).

### Rule 7 — Fees can be discounted / forgiven — ✅ EXISTS

- The collector-discount feature: the DCR allocate modal
  (`src/app/collector/dcr/page.tsx`) has a per-installment **penalty-discount
  picker** (`penaltyEligible`, `penaltyDiscountSelections`, % per row).
- Flows to `dcr_items.penalty_discount_amount` /
  `penalty_discounted_installment_nos` → applied by `post_single_dcr_item` →
  written to `amortization_schedules.penalty_discount_amount` → shown as its own
  **ledger column** (`build-account-ledger-rows.ts` `penaltyDiscount`).
- **Confirm against spec:** the modal comment (line ~1035) says penalty can only
  be *"waived on installments not yet due"* — but the requirement (and the
  Aug-25 transcript) is about waiving **accumulated / already-overdue** fees to
  close a stuck account. This constraint may be backwards for penalties.

### Rule 8 — Adjustable rate, per segment — ✅ EXISTS

- `penalty_rate_for_segment(segment)` (called at the top of
  `refresh_one_masterlist_aging`).
- `config_settings` keys `penalty_rate` and `aging_thresholds` (admin-editable
  via `/admin/config`).

### Rule 9 — Invoice/Auto/REM: interest stops after 3 months, fees begin — ⚠️ PARTIAL

- `computeInvoiceLoan` (`src/lib/computation/invoice.ts`) bakes the **entire**
  weekly interest schedule (1%/2%/2.5% per week, 1–3 month term) into the
  schedule **at release**. Nothing in the system accrues interest *after*
  release for any loan type — so "no further interest after 3 months" is
  **structurally true by accident** (interest simply stops when the schedule
  ends).
- **But there is no explicit "penalties begin" switch.** An overdue invoice /
  auto / REM row just gets the **generic** segment penalty from the aging cron.
- `computeInvoiceLoan` computes a `penaltyAmount` = 5% of principal, but the
  code comment says *"informational only, not part of origination"* — it is
  **never automatically applied**.
- Needs a client decision: is the generic monthly penalty on the overdue
  principal row acceptable, or do they want the specific invoice 5%-of-principal
  behaviour?

### Rule 10 — Show a breakdown of each payment's balance — ⚠️ PARTIAL

- The ledger row model (`build-account-ledger-rows.ts` `LedgerSchedule`) has
  separate `target` (amount due), `penalty`, `discount`, `penaltyDiscount`,
  `moveSurchargeAmount` — so **the penalty is shown as its own column**.
- The 30-day rollover (post-`20260904020000`) splits the rolled amount into the
  destination row's `amount_due` (interest part) + `penalty_amount` (penalty
  part) — good, the penalty stays a penalty.
- **Missing:** there is no record of *"this installment's ₱X due = ₱Y original +
  ₱Z carried over from installment #N"*. The destination `amount_due` becomes an
  opaque larger number; `rolled_at` / `rolled_into_installment_no` are **not**
  in the ledger row shape, so the ledger can't show where the extra came from.
  Only a free-text `penalties.notes` line records the rollover.
- Related known display bug (seen during Task 2 testing): the ledger's **"Report
  Total" balance row** shows the discount amount instead of ₱0 on a discounted
  payoff — the running total ignores the discount column.

### Rule 11 — Aging buckets + 91-day handoff — ✅ EXISTS

- `refresh_one_masterlist_aging` sets `aging_bucket` (current / 1-30 / 31-60 /
  61-90 / 91+) from days-past-due against `config_settings.aging_thresholds`.
- At `91+`: `remedial_flag = true`, `account_status = 'remedial'`.
- `remedial_turnovers` table + remedial portal handle the actual hand-off.

### Duplicate-month bug — ⚠️ NOT REPRODUCED

- `amortization_schedules` has `UNIQUE (masterlist_id, installment_no)` — true
  duplicate installments are impossible at the DB level.
- Live DB now: **0** duplicate `(masterlist_id, installment_no)` groups, **0**
  duplicate `(masterlist_id, due_date, amount_due)` groups.
- The `dev-simulate-aging` route's own comment admits that **re-running that dev
  tool** "stacked" rows by dragging due-dates on top of each other — so the
  "Marami na siyang May 22" the client saw is most likely a **dev-tool
  artifact**, not the real nightly cron.
- Needs the exact demo repro to confirm and close.

---

## Architecture finding — the logic is written twice

- **SQL:** `refresh_one_masterlist_aging` (the live cron path).
- **TypeScript:** `refreshMasterlistAging` in `src/lib/ar/posting.ts` (~250
  lines) — now called **only** by the dev-simulate-aging route.
- Every past penalty fix had to be applied to **both** (the migration comments
  say so explicitly — "SQL twin", "parity twin", "mirrors its TypeScript
  twin"). This doubles the work and invites drift.
- Any new penalty rule (monthly compounding, per-installment fee, auto-reversal,
  payment split) should be built **once**. Since the only production caller is
  the SQL cron, the cleanest path is: SQL is the single source of truth; delete
  or thin the TS copy; have the dev tool call the SQL function.

---

## What the implementation plan will need to cover

| # | Work | Size |
|---|---|---|
| A | Rewrite the fee accrual: **monthly compounding on the running balance, on every overdue installment, no reliance on rollover** (Rules 2, 3) | Large — core rewrite |
| B | **Auto-reversal + recompute on payment**: when AR records/reverses a payment, recompute fees for the account; drop fees for installments whose real payment date was on time; for partial-late, recompute per elapsed month on the remaining balance (Rules 4a, 4b) | Large |
| C | **Penalty-portion field**: new column on the payment / DCR allocation; collector types it; posting writes it; it feeds a real "penalty income collected" number (Rules 5, 6) | Medium–Large (schema + UI + posting + report) |
| D | **Balance breakdown**: store & surface "original vs carried-over vs fee" per installment; fix the ledger total row (Rule 10) | Medium |
| E | **Invoice/Auto/REM 3-month rule** — confirm intent, then enforce if different from generic (Rule 9) | Small–Medium (pending client answer) |
| F | **Collapse the two implementations** into one; make the dev tool call it (architecture) | Medium |
| G | **Robustness**: per-account error isolation in `refresh_all_aging`; confirm/close the duplicate-month repro | Small |
| H | Confirm the **fee-waiver "not yet due" constraint** is correct for penalties (Rule 7) | Small |

All 5 open client questions from the requirements doc are already answered from
the transcripts — see `penalty-breakdown-requirements.md` and
`project_penalty_breakdown_audit.md`.
