# Ledger — per-installment "This month" + "Penalty left" columns

**Status:** IMPLEMENTED (2026-09-09, direct — verified live) — uncommitted on `develop`
**Branch:** `develop`
**Author:** Claude (2026-09-09)

---

## EXECUTION LOG (2026-09-09, implemented directly at user request)

Shared change — no per-page work needed (all 5 surfaces build via the shared helpers):

| File | Change |
|---|---|
| `src/lib/ledger/build-account-ledger-rows.ts` | `LedgerSchedule.amountPaid`, `RawAmortizationScheduleRow.amount_paid`, `mapScheduleRowForLedger` maps it; `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` gains `amount_paid`; `LedgerPaymentEntry.penaltyPortion` + `ledgerEntriesFromPostings` maps it from `postings.penalty_amount`; `AccountLedgerRow.monthRemaining` / `penaltyRemaining` + `NO_REMAIN`; builder tracks per-schedule `principalRemaining` / `penaltyRemaining` (seeded to netTarget / netPenalty, decremented per credit — `penaltyPortion` is the fee slice, rest principal; 'moved'/'rolled' excluded); totals row carries the account-wide sums. |
| `src/lib/ledger/desk-ledger.ts` | `DeskLedgerSchedule.amountPaid` threaded into `buildDeskLedgerRows`. |
| `src/lib/collection/account-postings.ts` | postings select gains `penalty_amount` (covers collector + remedial desks). |
| `src/app/api/ar/masterlist/[id]/route.ts` | postings select gains `penalty_amount`; dropped the now-redundant `, amount_paid` append. |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | postings select gains `penalty_amount` (schedule `amount_paid` now via the shared constant — was missing entirely before). |
| `src/app/api/collector/accounts/[id]/route.ts`, `src/app/api/remedial/accounts/[id]/route.ts` | dropped the redundant `, amount_paid` append (now in the shared constant). |
| `src/components/ledger/AccountLedger.tsx` | two `<Th>`/`<Td>` columns — "This month" and "Penalty left" — after Balance, before Status, in all 4 render paths (header, single row, group header, expanded sub-rows). |
| `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts` | 2 `deepEqual` fixtures updated (`penaltyPortion: 0`, `amountPaid: 0`); +5 new cases incl. the totals-reconciliation invariant. |

**Verification:**
- `npm test` → **1630 pass / 0 fail** (+5). tsc + eslint clean on every changed file.
- Live on AN300421 (a quarantined-rollover account — the hardest case): rolled rows show `— / —`; the partial destination row shows `This month 36,593.42` / `Penalty left 3,273.42`; **Report Total = 36,593.42 + 3,273.42 = 39,866.84 = the account's Outstanding Balance** (the old Balance column reads 32,148.43 there — a pre-existing rollover quirk where `openingDebit` uses the un-inflated `total_loan`; the new columns are the accurate ones).
- Table overflows horizontally into its existing scroll container — no layout break.

**Not committed.** Sits on `develop` with the penalty-fee-paid-protection changes.

**Known edge (not a regression):** on the 4 legacy quarantined-rollover accounts the ledger's own "Balance" column already disagreed with the true outstanding; the new columns match the true outstanding. Plain loans reconcile exactly (`Σ This month + Σ Penalty left === Balance`).
**Origin:** client meeting 2026-09-09 (`docs/meeting-transcript-2026-09-09.md`,
~47:24–59:28). Client accepted the penalty *calculation* ("okay na yung
calculation, tama yun") and asked only for a **display** change: show, per
month, how much is still owed on that installment — split into principal and
penalty — so a collector/borrower can answer "how much for *this* month?"
without reading it off the whole-loan running Balance.

---

## How to use this file

Standing Cursor-handoff workflow:

1. Claude wrote this surgical plan. Phases are small and single-purpose.
2. Run it through Cursor **one `## Phase N` at a time** — not all at once.
3. Cursor outputs a summary of what it changed for that phase.
4. Paste that summary back to Claude, who validates it against this file —
   **including a real `git diff`** — before the next phase.
5. **After every phase, Cursor produces one combined summary** covering all
   files + tests across every phase, for a final end-to-end validation.

Nothing in the **DO NOT TOUCH** list changes.

---

## What the two columns mean

For each installment row (and the payment rows / group header under it):

| Column | Formula | Clears to 0 when |
|---|---|---|
| **This month** (principal left) | `max(0, half_up( (amount_due − discount) − (amount_paid − feePaid) ))` | the month's principal is fully paid |
| **Penalty left** | `max(0, half_up( (penalty_amount − penalty_discount_amount) − feePaid ))` | the month's late fee is fully paid |

where **`feePaid` = Σ `postings.penalty_amount` for that installment** (the
fee-tagged portion of every posted credit — Phase 4a auto split + Phase 4b
collector override; kept at the charged figure by the 2026-09-09 "fee sticks"
fix, so subtracting it here yields the true remaining).

- The month is fully settled only when **both** are 0.
- The existing **Penalty (charged)** column is unchanged — it stays the audit
  record of what fee was applied. **Penalty left** is what's unpaid of it.
- The existing **Balance** column (whole-loan running balance) is unchanged.
- **Report total:** `Σ This month + Σ Penalty left` must equal the totals-row
  **Balance** (= `recompute_outstanding_balance`). This is the reconciliation
  check for every test.

Rows that show **no** value (both columns render `—`): `opening`,
`move_of_payment`, `surcharge_payment`, and the hidden Special-loan $0
placeholder (already skipped).

---

## Audit — every ledger surface (verified 2026-09-09)

Two builder entry points, one shared table component. Change the core once;
each caller needs `amount_paid` on its schedule shape and `penalty_amount` on
its posting shape.

| Surface | Builds rows via | Data route | `amount_paid` on schedules? | `penalty_amount` on postings? |
|---|---|---|---|---|
| AR masterlist detail | `buildAccountLedgerRows` + `mapScheduleRowForLedger` — `src/app/ar/masterlist/[id]/page.tsx:591` | `src/app/api/ar/masterlist/[id]/route.ts` | **yes** (`…COLUMNS, amount_paid`, route L70) | **NO** — postings select L124 lacks it |
| Borrower loan panel | `buildAccountLedgerRows` + `mapScheduleRowForLedger` — `src/components/borrower/LoanActivePanel.tsx:325` | `src/app/api/borrower/applications/[id]/loan/route.ts` | **NO** — `…COLUMNS` only, route L106 | **NO** — postings select L127 lacks it |
| Remedial account detail | `buildDeskLedgerRows` — `src/app/remedial/accounts/[id]/page.tsx:177` | `src/app/api/remedial/accounts/[id]/route.ts` | **yes** (`…COLUMNS, amount_paid`, route L76) | check the `[id]` route's postings select |
| Collector Record-payment | `buildDeskLedgerRows` — `src/components/payments/RecordPaymentPage.tsx:129` | `src/app/api/collector/accounts/[id]/route.ts` | **yes** (`…COLUMNS, amount_paid`, route L69) | check the `[id]` route's postings select |
| Collector Move-of-Payment picker | `buildDeskLedgerRows` — `src/app/collector/accounts/[id]/move-of-payment/page.tsx:244` | (same collector `[id]` route) | yes | — |

Core: `src/lib/ledger/build-account-ledger-rows.ts`
Desk wrapper: `src/lib/ledger/desk-ledger.ts`
Table component: `src/components/ledger/AccountLedger.tsx`
Tests: `src/lib/ledger/__tests__/{build-account-ledger-rows,desk-ledger,account-ledger-overflow}.test.mts`

---

## Phase 1 — core builder: data + computation

File: `src/lib/ledger/build-account-ledger-rows.ts`. Additive only.

1. **`RawAmortizationScheduleRow`** — add `amount_paid?: number | string | null;`.

2. **`AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`** — append `, amount_paid`. (Then
   the three routes that manually append `, amount_paid` become redundant —
   Phase 4 removes those appends. Do NOT change any route in this phase.)

3. **`LedgerSchedule`** — add `amountPaid?: number;` (with a doc comment: net
   figure from `amortization_schedules.amount_paid`; the fee-tagged portion is
   carried on the posting entries).

4. **`mapScheduleRowForLedger`** — map `amountPaid: Number(row.amount_paid ?? 0)`.

5. **`ledgerEntriesFromPostings`** input posting shape — add
   `penalty_amount?: number | string | null;`. **`LedgerPaymentEntry`** — add
   `penaltyAmount?: number;`. Map `penaltyAmount: Number(posting.penalty_amount ?? 0)`.

6. **`AccountLedgerRow`** — add:
   ```ts
   /** Principal still owed on THIS installment (netTarget − principalPaid),
    * floored at 0. null on non-installment rows. */
   monthPrincipalRemaining: number | null;
   /** Late fee still owed on THIS installment (netPenalty − feePaid),
    * floored at 0. null on non-installment rows. */
   monthPenaltyRemaining: number | null;
   ```
   Add both to the `NO_CARRY`-style defaults wherever a row literal is built
   (opening, move_of_payment marker, surcharge_payment, totals) — set to `null`
   there except totals (step 8).

7. **`buildAccountLedgerRows`** — inside, before the main loop, build a
   per-schedule fee-paid map from the already-partitioned credits:
   ```ts
   const feePaidByScheduleId = new Map<string, number>();
   for (const [sid, list] of creditsByScheduleId) {
     feePaidByScheduleId.set(
       sid,
       list.reduce((s, p) => s + (Number(p.penaltyAmount) || 0), 0),
     );
   }
   ```
   Add a helper:
   ```ts
   function monthRemaining(schedule: LedgerSchedule | null | undefined) {
     if (!schedule) return { principal: null, penalty: null };
     const feePaid = feePaidByScheduleId.get(schedule.id) ?? 0;
     const penLeft = Math.max(0, halfUpMoney(
       netPenalty(schedule.penalty, schedule.penaltyDiscount) - feePaid));
     const principalPaid = Math.max(0, (Number(schedule.amountPaid) || 0) - feePaid);
     const prinLeft = Math.max(0, halfUpMoney(
       netTarget(schedule.target, schedule.discount) - principalPaid));
     return { principal: prinLeft, penalty: penLeft };
   }
   ```
   In `pushCredit(payment, schedule)` and the `installment`-row branch, set
   `monthPrincipalRemaining` / `monthPenaltyRemaining` from
   `monthRemaining(schedule)`. On the `move_of_payment` marker,
   `surcharge_payment`, opening, and the skipped Special placeholder → leave
   `null`.
   - Multi-payment installments: every `pushCredit` for that schedule gets the
     **same** final figures (`schedule.amountPaid` is the row's running total,
     not incremental). Acceptable for v1 — the last row shows the current
     truth. (Incremental per-payment running values = Phase 7, optional.)

8. **Totals row** — `monthPrincipalRemaining` = sum of `monthRemaining(s).principal`
   over every schedule that produced a visible row (exclude moved / rolled /
   empty placeholder); `monthPenaltyRemaining` = the matching penalty sum.
   Assert-friendly invariant: `totals.monthPrincipalRemaining +
   totals.monthPenaltyRemaining === totals.balance`.

**Constraints:** do not touch `openingDebit`, the `balance` / `creditTotal`
running math, the 2026-09-09 penalty-fold-into-debit logic, the
move-of-payment branch, the realized-post-release-discount subtraction, or
`checkNumbersByInstallmentNo`.

---

## Phase 2 — desk-ledger wrapper

File: `src/lib/ledger/desk-ledger.ts`.

1. **`DeskLedgerSchedule`** — add `amountPaid?: number;`.
2. **`buildDeskLedgerRows`** — in the `schedules.map(...)` that builds
   `LedgerSchedule`, add `amountPaid: Number(row.amountPaid ?? 0)`.
3. `payments: ledgerEntriesFromPostings(postings)` already flows through — no
   change needed there once Phase 1 maps `penalty_amount` (Phase 4 adds it to
   the `postings` shape the desk routes pass in).

**Constraints:** nothing else in this file. `openingDebit` / `scheduleTotal`
logic untouched.

---

## Phase 3 — table component: two columns

File: `src/components/ledger/AccountLedger.tsx`.

1. Header `<tr>` — add two `<Th num>` after the existing **Balance** `<Th>` and
   before **Status**: `This month` and `Penalty left`. Two-line headers are
   fine (`This month` / small `principal left`; `Penalty` / small `left`) to
   match the mockup — keep it minimal, plain `<Th num>` is acceptable.
2. `item.type === "row"` render path — add two `<Td num className="mono">`
   cells rendering `moneyCell(row.monthPrincipalRemaining)` and
   `moneyCell(row.monthPenaltyRemaining)` in the same position. `moneyCell`
   already renders `null` / `0` as `—` vs `0.00` correctly — decide: show
   `0.00` (not `—`) when the value is a real `0` on an installment/payment row
   so "settled" reads clearly; `—` only when `null`. If `moneyCell` can't
   distinguish, add a tiny local `remainCell(v)` that returns `—` for `null`
   and `formatLedgerMoneyCell(v)` otherwise.
3. Grouped-rows path (the collapsed "N payments" row + its expanded children) —
   collapsed header row: render the two columns from the group's **last** row
   (`last.monthPrincipalRemaining` / `last.monthPenaltyRemaining`). Expanded
   child rows: render `—` for both (matches how Target/Penalty already show `—`
   on expanded children).
4. Totals row branch — render the two totals values.
5. `selection` mode (Move-of-Payment) appends a trailing **Surcharge** column —
   make sure the new two columns sit **before** Status so the optional
   Surcharge column stays last. Update the `selection ? <Th num>Surcharge</Th>`
   / `<Td>` count so header and body still align.

**Constraints:** do not change `statusVariant`, `groupRows`, `targetCell`,
`discountCell`, the move-of-payment / surcharge rendering, or the `selection`
radio logic. Column addition only.

---

## Phase 4 — data routes: select the two fields

Four routes. Two edits each at most.

1. `src/app/api/ar/masterlist/[id]/route.ts`
   - postings `.select(...)` (~L124) → add `penalty_amount`:
     `"id, amortization_schedule_id, amount, penalty_amount, payments ( … )"`.
   - schedule select already has `amount_paid`; once Phase 1 folds it into
     `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`, **remove** the now-duplicate
     `, amount_paid` after `${AMORTIZATION_SCHEDULE_LEDGER_COLUMNS}` (L70).

2. `src/app/api/borrower/applications/[id]/loan/route.ts`
   - postings `.select(...)` (~L127) → add `penalty_amount`.
   - schedule select (`${AMORTIZATION_SCHEDULE_LEDGER_COLUMNS}` only, L106) —
     no change needed; the constant now carries `amount_paid`.

3. `src/app/api/collector/accounts/[id]/route.ts`
   - its postings source (the one feeding `buildDeskLedgerRows` for
     RecordPaymentPage / Move-of-Payment) → add `penalty_amount` to that
     `.select`.
   - remove the duplicate `, amount_paid` after the constant (L69).

4. `src/app/api/remedial/accounts/[id]/route.ts`
   - same: `penalty_amount` on the postings select feeding the desk ledger.
   - remove the duplicate `, amount_paid` after the constant (L76).

**Constraints:** touch only the `postings` select and the one redundant
`, amount_paid` token per route. No new joins, no filter changes, no
RLS/permission changes.

---

## Phase 5 — page mappings: thread the fields through

Each page maps its API response into `LedgerSchedule` / `DeskLedgerSchedule`
and (for desk pages) into the `postings` array. Add `amountPaid` to the
schedule objects and `penalty_amount` to the posting objects.

1. `src/app/ar/masterlist/[id]/page.tsx` (~L591) — the API row type already
   has `amount_paid?` (L66); `mapScheduleRowForLedger` (Phase 1) now reads it,
   so verify the row passed in still carries `amount_paid` from the API. The
   postings passed to `buildAccountLedgerRows` must include `penalty_amount` —
   add it to the posting map if the page reshapes postings.
2. `src/components/borrower/LoanActivePanel.tsx` (~L325) — add `amount_paid` to
   the API schedule row type (L64 area) and ensure it reaches
   `mapScheduleRowForLedger`; add `penalty_amount` to the posting shape.
3. `src/app/remedial/accounts/[id]/page.tsx` (~L177) — the schedule type
   already has `amountPaid` (L66); ensure it's passed into the
   `DeskLedgerSchedule` objects for `buildDeskLedgerRows`; add `penalty_amount`
   to the postings array it passes.
4. `src/components/payments/RecordPaymentPage.tsx` (~L129) — same: `amountPaid`
   into the desk schedule objects, `penalty_amount` into the postings.
5. `src/app/collector/accounts/[id]/move-of-payment/page.tsx` (~L244) — same.

**Constraints:** mapping additions only. Do not change what installments are
shown, the Move-of-Payment `selection` wiring, or any other panel on these
pages.

---

## Phase 6 — tests

1. `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts`
   - Extend the shared `schedules` fixture / `mapScheduleRowForLedger` test to
     include `amount_paid`; extend a posting fixture with `penalty_amount`.
   - New `it(...)` cases:
     - installment with no payment → `monthPrincipalRemaining === netTarget`,
       `monthPenaltyRemaining === netPenalty`.
     - partial principal payment, no fee tagged → principal drops, penalty
       unchanged.
     - fee-tagged payment (`penaltyAmount` on the posting) → `monthPenaltyRemaining`
       drops by the tagged amount; `monthPrincipalRemaining` unaffected.
     - fully paid row → both `0`.
     - penalty waiver (`penaltyDiscount`) → netted out of `monthPenaltyRemaining`.
     - **totals reconciliation:** `totals.monthPrincipalRemaining +
       totals.monthPenaltyRemaining === totals.balance` (mirror the live
       AN300459-style ₱374,000 / 5-installment scenario: 249,200 + 7,480 =
       256,680).
     - `opening`, `move_of_payment`, `surcharge_payment` rows → both `null`.
2. `src/lib/ledger/__tests__/desk-ledger.test.mts` — one case asserting a
   `DeskLedgerSchedule` with `amountPaid` produces the same two-column values
   as the direct builder.
3. `src/lib/ledger/__tests__/account-ledger-overflow.test.mts` — update the
   expected column count / any `regex` on the header row for the two new
   columns; confirm the overflow-wrapper assertion still holds.
4. `npm test` green; count rises by the number of new `it`s.

---

## Phase 7 — OPTIONAL: incremental running values on each payment row

Not requested for the deadline. The client's paper ledger shows a *new line
per partial payment* with the running per-month remaining after each. v1
(Phases 1–6) shows the **current** remaining on the installment's latest row;
intermediate payment rows show `—`. If the client later wants the running
history, reconstruct it in `buildAccountLedgerRows` by walking each schedule's
credits in order and subtracting cumulatively (fee portion first, then
principal) instead of using the schedule's final `amountPaid`. Isolated to the
`pushCredit` loop; no new data.

---

## DO NOT TOUCH (any phase)

- The penalty engine: `refresh_one_masterlist_aging`,
  `recompute_account_penalties`, `recompute_outstanding_balance`, any SQL /
  migration. This is display-only.
- `post_single_dcr_item` and the whole payment-posting flow.
- The ledger's existing columns and their math: `openingDebit`, `Debit`,
  `Credit`, `Balance`, the 2026-09-09 penalty-fold-into-debit fix, the
  realized-discount subtraction.
- Move-of-Payment: `moved_at`, `move_of_payment_batch_id`,
  `move_surcharge_amount`, `surcharge_payment` rows, the `selection` picker.
- `checkNumbersByInstallmentNo`, PDC check mapping, Special-loan $0 placeholder
  handling.
- The collector Allocate-modal / DCRR flow, `allocation-preview`,
  `validateCollectorDiscountInput` (separate work).
- Any RLS policy, permission check, or route auth.
- Reports (`src/lib/reports/**`), `sumPenaltyIncome`.

---

## Rollback

All TypeScript, all additive (new optional fields, new columns). Revert = drop
the two `AccountLedgerRow` fields, the `monthRemaining` helper, the two `<Th>`
/ `<Td>` pairs, and the `penalty_amount` / `amount_paid` select tokens. No data
migration, no schema change.
