# Move of Payment — Fixes: Audit + Phase-by-Phase Plan

**Written:** 2026-09-02. Companion to `move-of-payment-flow-explained.md` (plain-language flow +
the 8 issues). This document is the technical audit of each issue and the build plan to fix
them.

Everything in the audit below was checked on 2026-09-02 against the live code in `src/` and the
live Supabase project (`acopcwlhkovssjnrqygk`) via MCP — function bodies re-fetched with
`pg_get_functiondef`, balances re-derived with the live functions, the penalty scenario run
inside a rolled-back transaction. Nothing here is assumed.

---

## Part 1 — Per-issue audit

| # | Issue (from the flow doc) | Verified how | Status |
|--|--|--|--|
| 1 | Outstanding balance double-counts after a move | See 1.1 | **Confirmed, live now** |
| 2 | No way to pay the moved installment | See 1.2 | Confirmed (design gap) |
| 3 | Surcharge not tied to the move | See 1.3 | Confirmed |
| 4 | Surcharge can look counted twice / balances disagree | See 1.4 | Confirmed |
| 5 | DCR pop-up defaults to applying the surcharge | See 1.5 | Confirmed |
| 6 | Moved month missing from the DCR pop-up | See 1.6 | Confirmed (symptom of #2) |
| 7 | Check numbers don't follow a moved payment | See 1.7 | Confirmed, reproduced on AN300426 |
| 8 | Moved payment penalized before its deadline, then stuck | See 1.8 | **Confirmed by simulation** |

### 1.1 — Balance double-count (Issue 1)

`recompute_outstanding_balance(uuid)` (live function) sums:

```
sum( greatest(0, half_up(amount_due - discount_amount + penalty_amount - amount_paid)) )
from amortization_schedules
where masterlist_id = p_masterlist_id
  and status not in ('paid', 'rolled')
```

`'moved'` is **not** excluded. So after a Move of Payment the sum includes **both** the moved
row (`amount_due` unchanged) **and** the appended extension row (`status = 'pending'`, same
`amount_due`) — the same obligation twice.

TypeScript twin `recomputeOutstandingBalance` (`src/lib/ar/posting.ts:112`) mirrors the same
filter and has the same gap.

Live check:

| Account | `masterlist.outstanding_balance` (stored) | `recompute_outstanding_balance()` (live) | Correct value |
|--|--|--|--|
| AN300383 | 350,313.06 | **408,698.57** | 350,313.06 |
| AN300426 | 326,880.00 | **383,520.00** | 326,880.00 |

Both differ by exactly one installment. It is latent only because `applyMoveOfPayment` never
triggers a recompute — the first payment posting, internal transfer, or aging pass with a
discount reversion on the account writes the wrong value into `masterlist.outstanding_balance`.

Callers that would surface it: `post_single_dcr_item` (RPC), `post_internal_transfer` (RPC),
`refresh_one_masterlist_aging` (discount-reversion branch), and every `repair_*` migration
pattern.

### 1.2 — No way to pay the moved installment (Issue 2)

Every path that applies money to installments filters to `status in ('pending','partial','overdue')`:

- `fetchOpenInstallments` — `src/lib/ar/posting.ts:81`
- `/api/collector/dcr/allocation-preview` — `route.ts:52`
- `post_internal_transfer` (RPC) — `where ... status in ('pending','partial','overdue')`
- `computeAutoAllocation` operates only on the list `fetchOpenInstallments` returns

`RecordPaymentForm.tsx` and the borrower `LoanActivePanel.tsx` payment form have **no
installment picker at all** — they only capture amount/date/reference/channel.

The deadline-revert query (`refresh_one_masterlist_aging` and the TS twin) matches
`status = 'moved' AND move_of_payment_deadline < as_of` — it has no "was it paid?" branch, and
nothing can take a row off `'moved'` except that revert. So a moved installment **always**
reverts once its deadline passes, regardless of any payment.

### 1.3 — Surcharge not tied to the move (Issue 3)

`payments` columns (live): `id, masterlist_id, loan_application_id, borrower_id, reference_no,
payment_date, amount, channel, storage_path, file_name, status, uploaded_by, reviewed_by,
reviewed_at, created_at, notes, flagged_reason, flagged_at`. **No** `move_of_payment_batch_id`
or any move reference. `applyMoveOfPayment` writes no payment at all (per the 2026-09-01
"collect it separately" decision). Matching a surcharge payment to its move is entirely by
human memory.

### 1.4 — Surcharge counted twice / balances disagree (Issue 4)

- The synthetic `move_of_payment` ledger row (`build-account-ledger-rows.ts:267-282`) sets
  `debit === credit === move_surcharge_amount` and is pushed **without** touching the running
  `balance` or `creditTotal` — it nets to zero and always shows, paid or not.
- A real surcharge payment posted **unapplied** (null allocation) becomes an
  `unappliedCredits` entry (`:172-182`) and is rendered via `pushCredit(payment, null)`
  (`:309-311`), which **does** reduce the displayed `balance` and add to `creditTotal`.
- The AR masterlist page headline "Outstanding balance" is `record.outstanding_balance`
  (`page.tsx:466`) — the stored value (wrong per 1.1). The ledger table on the same page
  starts from `total_loan` (`page.tsx:537`), not the stored balance.

Net: after a move + a collected unapplied surcharge, the AR page can show three different
"still owed" figures — the inflated headline, the ledger Report Total (total_loan − credits),
and the intuitively-correct number.

### 1.5 — DCR pop-up defaults to applying the surcharge (Issue 5)

`openAllocationModal` (`dcr/page.tsx:248-297`) builds the pop-up rows from
`/api/collector/dcr/allocation-preview`, whose response includes `computeAutoAllocation`'s
result. A row is **pre-checked** when auto-allocation assigned money to it
(`:277-284`, `checked: allocated !== undefined`). Auto-allocation fills oldest-open-first, so a
₱10,528.54 surcharge opens the pop-up with the **next installment pre-checked and pre-filled**
with the full amount. The collector must actively uncheck it to make the surcharge an extra
charge. There is no signal that this payment is a surcharge.

### 1.6 — Moved month missing from the DCR pop-up (Issue 6)

`/api/collector/dcr/allocation-preview/route.ts:52` fetches
`.in("status", ["pending","partial","overdue"])`. A `'moved'` row never matches, so it is not
in the list the pop-up renders. Symptom of 1.2.

### 1.7 — Check numbers don't follow a moved payment (Issue 7)

Check→installment pairing is purely positional: `checkNumbersByInstallmentNo`
(`build-account-ledger-rows.ts:382-393`) maps `sort_order + 1 → check_number`. Both ledger
builders attach it by `installment_no`:

- collector desk: `desk-ledger.ts:64` — `checkNo: checkNoByInstallment.get(row.installmentNo) ?? null`
- AR masterlist: `ar/masterlist/[id]/page.tsx:565` — `checkNoByInstallment.get(Number(row.installment_no)) ?? null`

After a move: the moved row keeps `installment_no = 1` but renders as the synthetic
`move_of_payment` row, which is hard-coded `checkNo: null` (`:270`). The appended row is
`installment_no = 7`; there is no check slot at position 7, so it maps to `null`.

Live, AN300426 (`pdc_checks`: `sort_order` 0-5 → 667220, 861649, 825575, 723264, 884486,
631429). After the move: Sep 28 line shows blank (its real map value 667220 is dropped),
Mar 28, 2027 line shows blank. Check 667220 is orphaned.

### 1.8 — Moved payment penalized before its deadline, then stuck (Issue 8, new)

`refresh_one_masterlist_aging`'s overdue-detection query:

```
SELECT ... INTO v_overdue
FROM amortization_schedules s
WHERE s.masterlist_id = p_masterlist_id
  AND s.status <> 'paid'
  AND s.status <> 'rolled'
  AND (p_as_of - s.due_date) > 0
ORDER BY s.due_date ASC, s.installment_no ASC
LIMIT 1;
```

`'moved'` is not excluded. The TS twin `refreshMasterlistAging` (`src/lib/ar/posting.ts`, the
`schedules` query is `.neq("status","paid")` then `.filter(r => r.status !== "rolled")` +
`daysPastDue > 0`) has the same gap.

The revert block runs first, but only for `move_of_payment_deadline < p_as_of`. In the window
**after the original due date, before the deadline**, the revert does nothing and the
overdue block picks up the still-`moved` row.

Live simulation — `refresh_one_masterlist_aging(AN300383, '2026-10-12')` in a rolled-back
transaction (payment #1 due 2026-10-10, deadline 2026-10-15):

| Field | Before | After |
|--|--|--|
| status | moved | **overdue** |
| penalty_amount | 0.00 | **8,757.83** |
| move_of_payment_deadline | 2026-10-15 | 2026-10-15 (unchanged) |
| move_of_payment_batch_id | set | set (unchanged) |
| payment #7 (extension) | present | **still present** |

Because the row is now `overdue`, the later deadline-revert (`WHERE status = 'moved'`) can
**never** match it: the extension row is never deleted, the `move_*` fields are never cleared.
This fires on every Move of Payment whose deadline is after the original due date — the normal
case.

---

## Part 2 — Decisions needed before Phases 2–5 (Phase 0)

Phase 1 needs no decision. Phases 2–5 each hinge on a business rule that is not in the code or
the requirements doc.

### D1 — Can the borrower actually pay the moved installment before the deadline? (Issues 2, 6)

- **A — No.** "Deadline" only means "the date the deferred payment returns to the schedule."
  The moved installment always reverts on the deadline; if the borrower pays early it lands as
  an unapplied credit and the collector sorts it out. Reword the UI, no payment path. Smallest.
- **B — Yes.** Add a way to record a payment against the moved installment. Paying it in full
  before the deadline marks it `paid` and cancels the revert; the extension row becomes the
  genuine new final payment. Larger (touches allocation + revert).

### D2 — How is a *collected* surcharge shown on the ledger? (Issue 4)

- **A — As an ordinary credit.** It lowers the displayed balance like any payment. Then the
  synthetic "moved" marker line should be removed (double-representation).
- **B — As a distinct "Surcharge received" line** that does **not** net against the loan
  balance (the loan obligation is unchanged; the surcharge is separate). Keep the marker line
  or replace it with this.

### D3 — How structured is the surcharge↔move link? (Issue 3, gates Issue 5)

- **A — Tag column + "Record surcharge" action.** `payments.move_of_payment_batch_id` +
  a button on the Move of Payment page that pre-fills the amount and sets the tag. The DCR
  pop-up reads the tag.
- **B — Note text only.** No structured link; Issue 5 cannot be auto-fixed.

### D4 — Check numbers (Issue 7): minimal or full?

- **Minimal — display only.** Show the moved payment's check number on the "moved" ledger
  line (stop forcing blank); show a "no check on file" marker on the new final row. No
  re-issuance modeling.
- **Full — model re-issuance.** Track that the moved check is void/held and a replacement is
  needed. Bigger, needs a check-lifecycle design.

**Recommended defaults for a first pass:** D1 = A, D2 = B, D3 = A, D4 = Minimal.

---

## Part 3 — Phase-by-phase plan

### Phase 1 — Balance correctness (Issues 1 + 8). ✅ DONE 2026-09-02.

Migration `supabase/migrations/20260902120000_move_of_payment_freeze_moved_rows.sql` (applied
live via Supabase MCP as `20260902034903`) + edits to `src/lib/ar/posting.ts`.

**As-built:**

- SQL `recompute_outstanding_balance`: `status not in ('paid','rolled')` →
  `('paid','rolled','moved')`. Formula untouched.
- SQL `refresh_one_masterlist_aging`: `AND s.status <> 'moved'` added next to the existing
  `<> 'rolled'` in all four spots — overdue-detection SELECT, 30-day-rollover `v_next` SELECT,
  discount-reversion SELECT, discount-reversion UPDATE. Every other line (the Move of Payment
  revert/delete block, penalty math, rollover math, `masterlist` update) byte-for-byte from the
  live definition re-fetched via `pg_get_functiondef` immediately before writing the migration.
- TS `recomputeOutstandingBalance` (`posting.ts`): `.not("status","in","(paid,rolled)")` →
  `"(paid,rolled,moved)"`.
- TS `refreshMasterlistAging` (`posting.ts`): `&& row.status !== "moved"` added to the three
  `row.status !== "rolled"` filters (overdue detection, rollover-`next` pick,
  discount-reversion).
- `is_account_fully_settled` — deliberately unchanged (a pending move means the account is not
  done).
- Repair: all 8 existing test moves fully reverted (user decision) — extension rows deleted,
  moved rows back to `pending`, `move_of_payment_used_at` cleared on all 8, the one orphan
  ₱10,528.54 confirmed test surcharge on AN300383 deleted, `outstanding_balance` recomputed for
  the 8 named accounts. Idempotent.

**Verification (all passed):**

- `recompute_outstanding_balance(AN300383)` → 350,313.06 (was 408,698.57);
  `AN300426` → 326,880.00 (was 383,520.00). All 8 repaired accounts: stored balance ==
  recomputed balance, 0 moved rows, 0 extension rows, 0 with `move_of_payment_used_at`.
- Simulated `refresh_one_masterlist_aging` on a synthetic moved row (due 2026-09-10, deadline
  2099, as-of 2026-09-25), rolled back: row **stays `moved`**, `penalty_amount = 0`, no
  `penalties` row, batch id intact.
- Simulated past-deadline run (as-of 2026-10-20) on a moved row (due 2026-10-10, deadline
  2026-10-15), rolled back: reverts `moved → pending`, clears the batch id, then the same pass
  correctly charges the overdue penalty on the now-reverted row.
- New regression tests: `posting.test.mts` (the `.not` filter string includes `moved`) and
  `refresh-masterlist-aging-move-of-payment.test.mts` (a past-due moved row with a future
  deadline gets no `overdue` flip, no penalty, no revert).
- Full suite **1511/1511** (baseline 1509 + 2 new); `tsc --noEmit` clean for `src/` (the 5
  remaining errors are all in `.next/dev/types/routes.d.ts`, a Next.js dev artifact, present
  at baseline).

---

Single root cause: three status filters treat `'moved'` as an ordinary open installment.

**1a. `recompute_outstanding_balance` (SQL).** New migration, `CREATE OR REPLACE` of the live
function (re-fetch first). The **only** change: `status not in ('paid','rolled')` →
`status not in ('paid','rolled','moved')`. Formula untouched.

**1b. `recomputeOutstandingBalance` (TS, `src/lib/ar/posting.ts:112`).** Add `'moved'` to the
same exclusion in its query. Nothing else in the function changes.

**1c. `refresh_one_masterlist_aging` (SQL).** New migration, `CREATE OR REPLACE` of the live
function (re-fetch first). **Refinement found during implementation (2026-09-02):** the narrow
"overdue SELECT only" scope is not enough. The function has the pattern
`status <> 'paid' AND status <> 'rolled'` in **three** places, and a `'moved'` row must be
frozen exactly the way a `'rolled'` row is in every one of them:

- the overdue-detection `SELECT ... INTO v_overdue` — without this, a moved row past its
  original due date is penalized before its deadline (Issue 8, confirmed by simulation);
- the 30-day-rollover `SELECT ... INTO v_next` — without this, an unrelated overdue balance
  can roll **into** a moved row (it has the lowest `installment_no`), inflating its
  `amount_due`;
- the discount-reversion `SELECT SUM(discount_amount)` and its paired `UPDATE ... SET
  discount_amount = 0` — without this, a discounted installment that was moved loses its
  discount permanently once its original due date passes, even though it may still revert.

The change in each is the same single token: `AND s.status <> 'moved'` added next to the
existing `AND s.status <> 'rolled'`. **Nothing else changes** — the penalty math, the rollover
math, the `masterlist` update, and the Move of Payment revert/delete block at the top are
byte-for-byte identical.

**1d. `refreshMasterlistAging` (TS, `src/lib/ar/posting.ts`).** Mirror 1c exactly. The TS
function filters in JS after a `.neq("status","paid")` query, with `.filter(r => r.status !==
"rolled")` in three spots (overdue detection, rollover-`next` selection, discount-reversion).
Add `&& row.status !== "moved"` to each. No other change.

**1e. `is_account_fully_settled` — DO NOT CHANGE.** A pending move genuinely means the account
is not done; leaving `'moved'` in its filter is correct. (Noted here so a later reader does not
"consistency-fix" it by mistake.)

**1f. Repair migration.** Idempotent. For any row where `move_of_payment_batch_id IS NOT NULL`
AND `status NOT IN ('moved','pending','partial','overdue')` — i.e. a row that got wrongly
penalized into `overdue` and lost its `moved` status while a batch id is still attached — set
`status = 'moved'`, delete `penalties` rows added after `moved_at`, reset `penalty_amount = 0`,
and recompute `outstanding_balance` for the account. List every affected account in the
migration comment. Right now, live, there are **zero** such rows (all moved installments are
future-dated), so this is expected to be a no-op — include it anyway.

**Definition of done:**

- `recompute_outstanding_balance(AN300383)` → `350313.06`; `AN300426` → `326880.00`.
- Simulated `refresh_one_masterlist_aging(AN300383, '2026-10-12')` (rolled back): payment #1
  stays `moved`, `penalty_amount = 0`, extension row untouched.
- Simulated `refresh_one_masterlist_aging(AN300383, '2026-10-20')` (rolled back, past deadline):
  payment #1 → `pending`→`overdue`+penalty, extension row **deleted** — i.e. the real revert
  still works.
- `npm test` full suite green; `tsc --noEmit` clean.

**Do not touch:** internal transfers, DCR reconcile/reject, write-offs, `post_single_dcr_item`,
`post_internal_transfer`, `is_account_fully_settled`, the Move of Payment offer/append logic,
the deadline-revert logic.

---

### Phase 2 — Link the surcharge to the move (Issue 3). D3 = A. ✅ DONE 2026-09-02.

**As-built:**

- **Migration** `supabase/migrations/20260902130000_payments_move_of_payment_batch_id.sql`
  (applied live via MCP): `payments.move_of_payment_batch_id uuid` nullable, no FK, `NULL` on
  every existing/ordinary payment.
- **`src/lib/ar/move-of-payment.ts`** — new exported `recordMoveOfPaymentSurcharge(supabase,
  masterlistId, actorId, { referenceNo, channel, paymentDate })`. Reads the batch id + surcharge
  amount from the account's `status = 'moved'` rows (amount = sum of `move_surcharge_amount`
  across the batch — only the interest-bearing row is non-zero); rejects if there is no active
  move or if a `payments` row already carries that batch id; inserts one `payments` row
  (`status: 'confirmed'`, `amount` from the moved row, `move_of_payment_batch_id`, `notes: 'Move
  of Payment surcharge'`, `uploaded_by`/`reviewed_by` = actor); writes a `collection` / `create`
  / `payment` audit event. Does **not** touch `amortization_schedules` or
  `masterlist.move_of_payment_used_at`. `applyMoveOfPayment` unchanged.
- **Route** `src/app/api/collector/accounts/[id]/move-of-payment/surcharge/route.ts` — new,
  isolated from the offer route. `collection:edit` + `assignments` gate, then
  `createServiceClient()` → `recordMoveOfPaymentSurcharge`.
- **`src/app/api/collector/accounts/[id]/route.ts`** — added `move_of_payment_batch_id` to the
  `payments` select so the page can tell if the surcharge is already recorded.
- **`src/app/collector/accounts/[id]/move-of-payment/page.tsx`** — when a `moved` schedule row
  exists, renders a "Record surcharge payment" section (payment date / reference no. / channel,
  amount shown read-only from the moved row) that POSTs to the new route; shows a "Surcharge
  recorded" confirmation once done or if a tagged payment already exists. Offer-flow copy
  updated to point at that section instead of "Record payment".

**Verification:** `payments.move_of_payment_batch_id` live (`uuid`, nullable). New unit tests
in `move-of-payment.test.mts` (happy path size-1, size-2 amount = interest row only, no-active-
move rejection, already-recorded rejection). Full suite **1515/1515**; `tsc` clean for `src/`;
`eslint` clean except the pre-existing `react-hooks/set-state-in-effect` on the page's
fetch-on-mount `useEffect`. Browser click-through still to do.

**Did not touch:** `applyMoveOfPayment`, the DCR reconcile/reject flow, `RecordPaymentForm`,
`post_single_dcr_item`.

---

### Phase 3 — DCR allocation default for a surcharge (Issue 5). D3 = A. ✅ DONE 2026-09-02.

**As-built:**

- **`/api/collector/dcr/allocation-preview/route.ts`** — selects `move_of_payment_batch_id` on
  the payment; when set, `allocation` is a single `{ amortizationScheduleId: null, amount }`
  line (instead of `computeAutoAllocation`) and the response carries `isSurcharge: true`.
  Untagged payments: `computeAutoAllocation` path unchanged.
- **`src/app/collector/dcr/page.tsx`** — `AllocationModalState` + the preview type gained
  `isSurcharge`. The existing row mapping already leaves every installment **unchecked** when
  the allocation has no schedule ids, so a surcharge opens the pop-up with nothing pre-checked
  and the full amount in "Advance (leftover)". When `isSurcharge`, an `info` Alert banner
  appears at the top of the modal. The Collector can still override.

**Verification:** full suite **1515/1515**; `tsc` clean for `src/`; `eslint` clean except the
pre-existing `react-hooks/set-state-in-effect` on the DCR page's fetch-on-mount `useEffect`.
Browser click-through still to do.

**Did not touch:** the allocation math, `validateAllocationLines`, `computeAutoAllocation`,
`confirmAddToDcr`, `addPaymentToDcr`, `post_single_dcr_item`.

---

### Phase 4a — Ledger: "Surcharge received" line (Issue 4, D2 = B). ✅ DONE 2026-09-02.

**As-built (`src/lib/ledger/build-account-ledger-rows.ts`):**

- `LedgerPaymentEntry` gained `moveOfPaymentBatchId`; `ledgerEntriesFromPostings` reads it from
  the `postings.payments(...)` join (the join select got `move_of_payment_batch_id` in
  `account-postings.ts`, the AR masterlist route, and the borrower loan route — additive).
- New `AccountLedgerRowKind` value `"surcharge_payment"`. A posted payment carrying a batch id
  is split out (`surchargePaymentsByBatch`) before the credit loop, so it never flows through
  `pushCredit`. It renders via a new `pushSurcharge` helper: `credit = amount`, `debit = null`,
  `status = "surcharge"`, and **neither `balance` nor `creditTotal` is touched**.
- The `move_of_payment` marker row now suppresses its `debit`/`credit` (both `null`) once a
  real surcharge payment exists for that batch — the money is shown once, on the
  surcharge_payment row. With no real surcharge it still shows `debit = credit = surcharge` as
  before.
- Fallback: a surcharge payment whose move already reverted (no `moved` schedule row) is
  rendered after the unapplied-credits loop, so collected money never disappears.
- `AccountLedger.tsx` `statusVariant` maps `"surcharge"` → `navy`.

**Verification:** ledger + desk-ledger tests updated/added (collected surcharge = own line, no
balance/total change; marker amounts suppressed; reverted-move fallback). Full suite
**1517/1517**; `tsc` clean for `src/`.

**Did not touch:** `pushCredit`, `netTarget`, `discountOrNull`, the opening / installment /
payment / totals row shapes, the desk-ledger and AR-page call sites beyond the join column.

---

### Phase 4b — Check re-issuance for a moved payment (Issue 7, D4 = Full). ✅ DONE 2026-09-02 (4b-full scope chosen).

**As-built:**

- **Migrations** `20260902140000_pdc_checks_move_of_payment_lifecycle.sql` (+ follow-up
  `20260902141000_pdc_checks_revert_order_fix.sql`), applied live via MCP:
  - `pdc_checks.status text NOT NULL DEFAULT 'active'` + `CHECK (status IN
    ('active','held','replaced'))`; `pdc_checks.move_of_payment_batch_id uuid`;
    `pdc_checks.replaced_by_check_id uuid` (self-FK). All 266 existing rows → `active`.
  - `refresh_one_masterlist_aging` + TS `refreshMasterlistAging`: after the extension-delete,
    a lapsed batch **restores** its held/replaced check(s) to `active` (clearing the batch id
    and `replaced_by_check_id`) **then deletes** any replacement check(s). Order matters —
    restore first so the self-FK is cleared before the replacements are removed (the follow-up
    migration fixes the original DELETE-first ordering that hit the FK).
- **`src/lib/ar/move-of-payment.ts`:**
  - `applyMoveOfPayment` — for `monthly` / `semi_monthly` / `bi_monthly` loans with a size-1
    moved group and a release file, sets the moved installment's check
    (`sort_order = installment_no − 1`) to `status = 'held'` + tags it with the batch id.
    Quarterly / Two-Monthly (size-2 groups) are skipped — their check↔installment mapping is
    not 1:1.
  - new `recordReplacementCheck(supabase, masterlistId, actorId, { checkNumber, checkDate,
    bankName? })` — inserts a `pdc_checks` row mapping positionally to the extended installment
    (`sort_order = installment_no − 1`), `bank_name` falling back to the held original's bank
    (that column is NOT NULL); marks the held original `replaced` with `replaced_by_check_id`;
    audit event. Rejects if no held check / already replaced.
- **Route** `src/app/api/collector/accounts/[id]/move-of-payment/replacement-check/route.ts` —
  `collection:edit` + assignment gate → `recordReplacementCheck`.
- **Ledger** (`build-account-ledger-rows.ts` + `desk-ledger.ts` + the 4 route selects +
  `LedgerPdcCheck` + `LedgerSchedule` + `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`):
  - `pdc_checks` selects gained `status`; `checkNumbersByInstallmentNo` renders a held check as
    `"<n> (held)"` and a replaced one as `"<n> (replaced)"`.
  - the `move_of_payment` marker row now shows the moved installment's (held) check number
    instead of a hard `null`.
  - an appended extension row (`deferred_from_move_of_payment_batch_id` set) with no check
    shows `"replacement needed"`; once a replacement is on file it maps in positionally like
    any check.
- **UI** (`move-of-payment/page.tsx`) — a "Replacement check for the extended installment"
  section (check no. / date / bank) shown while a held check exists and no replacement is
  recorded; a confirmation once done.

**Verification:** live rolled-back simulation on AN300426 — held → move deadline lapses →
original check restored to `active` (batch id + FK link cleared), replacement check deleted,
extension row deleted. Full suite **1522/1522**; `tsc` clean for `src/`; `eslint` clean on the
touched lib/route files. Browser click-through still to do.

<details><summary>Original sub-plan (kept for reference)</summary>

#### Original PDC model (verified live 2026-09-02)

**Current PDC model (verified live 2026-09-02):**

- `pdc_checks`: `id, release_file_id (FK → release_files, ON DELETE CASCADE), check_number,
  amount, check_date, bank_name, ref_account, sort_order, created_at`. **No status / lifecycle
  column.** 266 rows live. RLS: `pdc_checks_select`, `pdc_checks_write` (ALL).
- Written only by LRA at release (`release-service.ts` — delete-all + re-insert on encode) and
  `pdc-collect.ts` (records physical collection on `release_files`, not per check).
- Read by the AR / collector / remedial / borrower ledger routes; mapped to installments
  **positionally** by `checkNumbersByInstallmentNo` — `sort_order + 1 → installment_no`. There
  is no FK or explicit link between a check and an installment.

**What "Full" means here, given D1 = A (moves are temporary):** a moved payment's check is not
permanently dead — the payment returns to the schedule on the deadline. So the lifecycle is:
`active → held` (while moved) `→ active` (on revert), plus an optional `→ replaced` when the
branch captures a genuine replacement check for the extended installment.

**Proposed build:**

1. **Schema** (additive migration):
   - `pdc_checks.status text NOT NULL DEFAULT 'active'`, `CHECK (status IN
     ('active','held','replaced'))`. Existing 266 rows default to `active` — positional mapping
     unchanged.
   - `pdc_checks.replaced_by_check_id uuid` nullable, FK → `pdc_checks(id)`.
2. **`applyMoveOfPayment`** (`src/lib/ar/move-of-payment.ts`): after the move + append, set the
   moved installment's check to `status = 'held'` — look up `release_file_id` via `masterlist`,
   then `UPDATE pdc_checks SET status = 'held' WHERE release_file_id = ? AND sort_order =
   <moved installment_no − 1>`. (Quarterly / Two-Monthly check-to-installment mapping is not
   1:1 — must be checked during implementation; may be out of scope for those loan types.)
3. **Revert** (`refresh_one_masterlist_aging` SQL + TS twin): when a batch reverts, set its
   held check back to `status = 'active'`, and delete any replacement check row that was added
   for the (now-deleted) extension row.
4. **New `recordReplacementCheck(supabase, masterlistId, actorId, { checkNumber, checkDate,
   bankName? })`** in `move-of-payment.ts`: inserts a new `pdc_checks` row with `sort_order =
   max(sort_order) + 1` (→ maps positionally to the appended installment), `check_date` = the
   extension row's due date; flips the held original to `status = 'replaced'`,
   `replaced_by_check_id` = the new row. + a route + audit event.
5. **UI** (Move of Payment page): a "Replacement check for the extended installment" section
   (check no. + date) that calls the new route; shows the held original's status.
6. **Ledger** (`build-account-ledger-rows.ts` + the 4 route selects + `LedgerPdcCheck`): add
   `status` (and the replacement) to the `pdc_checks` select; `checkNumbersByInstallmentNo`
   (or its callers) honour `status` — show a `held` check with a "(held)" marker on the moved
   line, and on the appended installment show the replacement check number if present, else a
   "replacement check needed" marker. Additive; existing behaviour unchanged when every check
   is `active`.

**Scope question for sign-off:** with D1 = A, steps 1–3 + 6 (the **held / active + ledger
markers**) fully solve the "check numbers are confusing" problem. Steps 4–5 (capturing a
genuine *replacement* check) add real branch workflow and a new route+UI. Confirm whether
Phase 4b is:
- **4b-lite** — steps 1, 2, 3, 6 only (held/active lifecycle + ledger clarity), or
- **4b-full** — all six steps (adds replacement-check capture).

*(Scope chosen: **4b-full**.)*

</details>

---

### Phase 5 — Moved-installment "deadline" wording (Issues 2 + 6). D1 = A. ✅ DONE 2026-09-02.

D1 = A: the moved installment **always** returns to the schedule on the deadline; there is no
"pay it by then to keep the move" path (none exists in the code, and building one was D1 = B,
not chosen). So this phase is copy-only — no code, no schema.

**As-built (`src/app/collector/accounts/[id]/move-of-payment/page.tsx`):**

- Deadline field label: "New deadline for the shifted payment" → **"Date the shifted payment
  becomes due again"**.
- Deadline helper text: now says the payment is deferred penalty-free until that date, then
  returns to the schedule as a normal (overdue-if-late) installment, and the extra end
  installment is removed.
- Success alert + confirm dialog: "must come in by X or it reverts" → "returns to the schedule
  as due on X, penalty-free until then".

No other UI surface carried deadline-payment copy (grep-verified). Full suite **1517/1517**;
`tsc` clean.

**Did not touch:** any route, `fetchOpenInstallments`, `allocation-preview`,
`validateAllocationLines`, `post_single_dcr_item`, the revert logic — Issue 6 (moved month
absent from the DCRR pop-up) is left as-is on purpose, since with D1 = A there is nothing to
allocate to a moved row.

---

## Part 4 — Cross-phase constraints (apply to every phase)

1. **Additive migrations only.** `ADD COLUMN` nullable; `CREATE OR REPLACE FUNCTION` with the
   live body re-fetched first; any CHECK-constraint change strictly widens the allowed set.
   No destructive DDL, no column drops, no data deletes outside a labeled repair migration.
2. **`refresh_one_masterlist_aging` / `refreshMasterlistAging`:** the only permitted change in
   Phase 1 is adding the `'moved'` token to the three `status <> 'rolled'` filters (overdue
   detection, rollover-`next` selection, discount-reversion) so `'moved'` is frozen like
   `'rolled'`. The penalty math, the rollover math, the discount math, the `masterlist`
   update, and the Move of Payment revert/delete block stay byte-for-byte identical. Each was
   independently fixed and tested in
   `docs/ledger-balance-consistency-fix-implementation-plan.md` and must not regress.
3. **`recompute_outstanding_balance`:** change only the status-exclusion list. Never the
   formula (`amount_due − discount_amount + penalty_amount − amount_paid`, floored at 0).
4. **Do not modify** `is_account_fully_settled`, `post_internal_transfer`, internal-transfer
   UI/API, rounding write-off, or the DCR reconcile/reject flow beyond what a phase names
   explicitly.
5. **Do not change** the already-verified Phase 1–7 Move of Payment mechanic: the offer
   action, the extension-row append, the `move_of_payment_batch_id` /
   `deferred_from_move_of_payment_batch_id` scheme, the deadline-revert trigger, and
   `move_of_payment_used_at` (still exactly once per loan, ever).
6. **`applyMoveOfPayment` stays payment-free** — the surcharge is recorded by a separate
   action (Phase 2), never folded back into the offer, unless D1/D3 explicitly reopen it.
7. **Re-fetch every function's live definition** via `pg_get_functiondef` immediately before
   writing its migration. Do not trust the on-disk migration file — it may already be behind.
8. **`npm test` (full suite) and `tsc --noEmit` before and after every phase.** A phase that
   leaves either red is not done. Note pre-existing unrelated failures (vitest import errors,
   stale `cig`/`lra`/`account` fixtures) and do not count them.
9. **Migrations apply via Supabase MCP `apply_migration`**, not `db push`.
10. **Live data repairs** only inside a clearly-labeled, idempotent repair migration that
    names every account and row it touches in its comment, and is verified to be a safe no-op
    where nothing is broken.
11. **One phase per change set.** Do not bundle Phase 1 (safe, no-decision) with any
    decision-gated phase.

---

## Part 5 — Progress (2026-09-02)

| Phase | Issues | State |
|--|--|--|
| 1 | 1, 8 | ✅ done — `moved` frozen like `rolled` in balance + aging; 8 test moves reverted |
| 2 | 3 | ✅ done — `payments.move_of_payment_batch_id` + `recordMoveOfPaymentSurcharge` + route + UI |
| 3 | 5 | ✅ done — DCRR pop-up defaults a tagged surcharge to fully-unapplied + banner |
| 4a | 4 | ✅ done — "surcharge_payment" ledger line, non-netting; marker amounts suppressed |
| 4b | 7 | ✅ done — 4b-full: `pdc_checks` lifecycle (held/replaced), replacement-check capture, ledger markers |
| 5 | 2, 6 | ✅ done (D1 = A) — copy-only reword; the "no payment path for a moved row" is intended |

**Decisions locked:** D1 = A, D2 = B, D3 = A, D4 = Full.

**All 8 issues resolved.** Migrations `20260902034903 / 041546 / 045029 / 050203` applied live;
full suite 1522/1522; `tsc` clean. **Remaining:** one browser click-through of the whole
feature end to end (offer → surcharge → replacement check → deadline lapse → revert).
