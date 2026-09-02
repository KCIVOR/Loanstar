# Ledger / Outstanding-Balance Consistency — Deep Audit

**Date:** 2026-08-31
**Trigger:** AN300435 — borrower paid ₱105,451.50 in full, Outstanding Balance
correctly reads ₱0.00, but the ledger still shows 4 rows as `pending` and the
hero reads "Installments paid 9/13 · 69%".
**Status:** Audit only — no fixes applied. Findings and a proposed fix
architecture are below; nothing in this document has been implemented.

**Revision (same day):** the first pass of this audit started at the AR/
masterlist layer and traced *forward* (release → payment → reconcile → aging →
ledger → reports). It did **not** cover intake → CSA → Committee → LRA. That
upstream trace was done afterwards and is in §7 — it found one **High**
regression introduced by today's own fix (F10).

---

## 1. The reported symptom — immediate cause

The 4 `pending` rows on AN300435 are **exactly** the 4 installments named in
`origination_discounts` (1, 4, 8, 9), and every one of them owes **₱0.00**:

| # | amount_due | discount | paid | net owed | status |
|---|---|---|---|---|---|
| 1 | 913.00 | 913.00 | 0.00 | **0.00** | pending |
| 4 | 913.00 | 913.00 | 0.00 | **0.00** | pending |
| 8 | 1,826.00 | 1,826.00 | 0.00 | **0.00** | pending |
| 9 | 2,282.50 | 2,282.50 | 0.00 | **0.00** | pending |

**A fully-discounted installment has no code path that can ever mark it paid.**
Only two places in the codebase set a row to `"paid"`:

1. `postSingleDcrItem` ([posting.ts](../src/lib/ar/posting.ts)) — the status
   update lives inside `if (line.amortizationScheduleId)`, i.e. it only runs
   for rows that received an **allocation line**. `computeAutoAllocation`
   skips any row whose net due is ≤ 0 (`if (remainingDue <= 0) continue;`),
   so a fully-discounted row never gets a line, never gets a posting, and is
   never visited by the status update.
2. `writeOffRoundingDifference` — explicitly throws
   *"Nothing to write off — installment is already fully paid"* when
   `remainingDue <= 0`.

So the row is structurally orphaned: settled in substance, `pending` forever.

**Note on provenance:** the skip in `computeAutoAllocation` is correct and was
added by today's payment-flow discount fix. Before that fix, the allocator
would wrongly push cash at these rows, which incidentally marked them paid and
masked this gap. Today's fix made the allocation right and exposed a
pre-existing hole in the state machine. That is worth stating plainly rather
than presenting this as an unrelated discovery.

### Scope (live data)

3 accounts, 23 orphaned rows:

| Application | status | orphan rows | discount holding them open |
|---|---|---|---|
| AN300435 | paid | 4 | ₱5,934.50 |
| AN300431 | active | 7 | ₱14,580.00 |
| AN300430 | active | 12 | ₱67,003.20 |

---

## 2. The unifying root cause

The system keeps **two parallel accounting models that are never reconciled
against each other**:

| | Account model | Row model |
|---|---|---|
| Where | `masterlist.outstanding_balance` | `amortization_schedules` |
| Seeded from | `computation.total_loan` at release | generated schedule |
| Moved by | posted **cash** only (`− item.amount`) | `amount_due`, `discount_amount`, `penalty_amount`, `amount_paid`, `status` |

Three things move the row model but are **never journaled to the account
balance**:

- **Discount** — reduces what a row really owes; no corresponding credit to
  `outstanding_balance`.
- **Penalty** — increases what a row owes; never added to `outstanding_balance`.
- **Rollover** — folds `amount_due + penalty` into the next row's
  `amount_due`, quietly converting penalty into principal-like debt in the
  row model only.

Because the balance is a **running subtraction** rather than a derived value,
these omissions never self-correct — they accumulate permanently.

### The same root cause produces two opposite symptoms

- **AN300435** (reported): row fully discounted → no cash → no allocation →
  **row stuck `pending`** while the account is settled.
- **AN300420** (found during this audit): discounts honored at row level, all
  6 rows `paid`, but `outstanding_balance` = **₱16,852.50**, which is *exactly*
  the sum of the row discounts (5 × ₱3,370.50). The account shows phantom debt
  the borrower does not owe.

Both are the same defect seen from opposite ends: **the discount is applied to
rows but never credited to the balance.**

---

## 3. Findings

### F1 — Zero-due installments can never reach `paid` · **High**
Described in §1. Consequences beyond the cosmetic counter:

- **"Mark as paid off" is permanently blocked.** `canMarkPaidOff`
  ([paid-off.ts:45-53](../src/lib/ar/paid-off.ts)) rejects when any row is not
  `paid`/`rolled` — this is the exact disabled-button message in the
  screenshot. AN300435 can never be closed out, even though it owes nothing.
- The "9 of 13 · 69%" counter under-reports completion on every discounted loan.

### F2 — Discount is never credited to `outstanding_balance` · **High**
No journal entry exists for a discount. Evidence: AN300420 carries ₱16,852.50
of phantom debt equal to its total row discounts. This is real money the
system believes is collectible.

### F3 — Reversion turns orphaned rows into resurrected debt · **High / time-bomb**
The origination-discount reversion clears `discount_amount` once a row's due
date arrives, matching on `status <> 'paid' AND status <> 'rolled' AND
discount_amount > 0`. Orphaned rows are `pending`, so **they match.**

On AN300435 the earliest orphan is due **2026-09-07** (7 days out). When the
nightly job or any Collector accounts GET runs on/after that date:

1. Installment 1's ₱913.00 discount is cleared.
2. Today's reversion-balance fix adds ₱913.00 back to `total_loan` **and**
   `outstanding_balance`.
3. A fully-paid, ₱0.00 account silently starts owing money again — and will do
   so four times (₱5,934.50 total) as each orphan's due date passes.

The reversion rule itself is correct (*"discount reverts if the installment
isn't settled by its due date"*). The defect is that these installments **are**
settled — they just were never marked as such, so the rule cannot tell the
difference. F1 is the cause; this is its most damaging consequence.

### F4 — Per-payment refactor silently changed the meaning of stored `installmentNo` · **High**
AN300430's `origination_discounts` names installments **1, 2, 3**, but **all
12** interest rows carry a 100% discount, in three tiers of four
(₱3,045.60 ×4, ₱6,091.20 ×4, ₱7,614.00 ×4) — the signature of Invoice's old
*month* grouping, where one unit = 4 weeks.

That masterlist was built when `buildDiscountUnits` grouped Invoice by month.
After the per-payment refactor, the same stored values `[1,2,3]` now read as
*weeks* 1–3. The stored JSON was never migrated, so:

- the **rows** encode the old meaning (12 weeks waived, ₱67,003.20)
- the **computation** now reads as the new meaning (3 weeks, ₱9,136.80)

This is precisely the ₱57,866.40 drift measured on that account. Any
re-derivation from the JSON (re-release, recompute, report) will disagree with
the rows already in the ledger. **This is a data-migration gap, not a
calculation bug** — and it will affect any other pre-refactor Invoice loan.

### F5 — `outstanding_balance` mutated at 4 sites, none atomic, none derived · **Medium-High**
`posting.ts` lines 317, 391, 587, 842 each do a read-modify-write
(`SELECT outstanding_balance` → compute → `UPDATE`). There is no transaction,
no `rpc()`, no row lock, and no path anywhere that recomputes the balance from
the rows. Consequences:

- **Lost update under concurrency.** Two payments reconciled on the same
  account concurrently (AR posting while the nightly aging job runs, or two AR
  users) can each read the same starting balance; the second write silently
  discards the first.
- **No self-healing.** Any drift, once introduced, is permanent.

### F6 — `postSingleDcrItem` is not transactional · **Medium-High**
It performs, sequentially and without a transaction: insert posting → update
schedule → update payment → read masterlist → update masterlist. A failure or
crash part-way leaves a durable inconsistent state (e.g. postings written and
schedule marked paid, but balance never decremented). The
`if (payment.status === 'posted') return;` guard gives partial idempotency,
but that flag is set *after* the postings and schedule writes — so a retry
following a mid-sequence failure will **re-insert postings and
double-decrement the balance.**

### F7 — Penalty is absent from the account model · **Medium**
`outstanding_balance` is seeded from `total_loan` (principal + interest) and
never has penalty added. The row model does track it. Measured negative drifts
on AN300432 (−₱22,009.88), AN300362 (−₱21,701.94), AN300361, AN300418,
AN300359, AN300360, AN300421 are largely explained by this plus rollover
folding penalty into `amount_due`. Whether penalty *should* count toward
outstanding is a **business decision** — but today the two models silently
disagree, so neither number can be trusted as "the" balance.

### F8 — `account_status = 'paid'` is set from the balance alone · **Medium**
`postSingleDcrItem` sets `account_status: newBalance <= 0 ? "paid" : "active"`
purely from the (unreliable, per F5) balance, with no row-level check. That is
why AN300435 reads `paid` at account level while 4 rows are `pending` — the two
status systems can contradict each other, and the account-level one wins in
the UI hero while the row-level one blocks "Mark as paid off".

### F9 — Rounding-drift tail · **Low**
~13 accounts drift by ±₱0.01–0.07 (e.g. AN300372 −₱0.07). Consistent with
per-row `halfUp` vs. an independently-rounded account total. Cosmetically
harmless, but it means an exact `= 0` comparison is not a safe settlement test
— `canWriteOffAccountRounding` exists precisely to paper over this.

---

## 4. Loopholes and edge cases worth explicit testing

1. **100%-discounted loan** — every installment discounted → zero cash ever
   collected → no allocation, no posting, no status change; account can never
   close. Extreme case of F1.
2. **Discount ≥ amount_due** — `netInstallmentDue` floors at 0 (verified), so
   no negative allocation; but the row still never settles (F1).
3. **Reversion after full settlement** — F3.
4. **Reversion on a `partial` row** — clears the discount and inflates what's
   owed even though the borrower already paid the then-correct net.
5. **Rollover of a discounted row** — rollover reads net-of-discount (fixed
   today) but the *target* row's inflated `amount_due` then re-enters
   `buildDiscountUnits` territory on any recompute.
6. **Concurrent reconcile + nightly aging** — F5 lost update.
7. **Retry after partial posting failure** — F6 double-decrement.
8. **Pre-refactor Invoice loans** — F4 semantic drift.
9. **Manual allocation override** — staff can hand-allocate to a zero-due row
   via the DCR modal; `validateAllocationLines` only checks the total matches
   and the row is postable, so cash can be applied to a row that owes nothing,
   creating an over-payment the balance won't reflect correctly.

---

## 5. Proposed fix architecture (not implemented)

Ordered by dependency, not just severity.

**Phase 1 — Give zero-due installments a settlement path (fixes F1, defuses F3).**
Introduce an explicit "settled by discount" transition: when a row's
`netInstallmentDue()` is ≤ 0 and it isn't already `paid`/`rolled`, mark it
`paid` with `paid_at` set and `amount_paid` left at its cash value. Run it at
release (`initializeArAccount`, for rows discounted to zero up front) **and**
after every posting/aging pass (for rows that reach zero later). This must
land before the earliest orphan due date (**2026-09-07**) to prevent F3 from
firing on AN300435.

**Phase 2 — Journal the discount to the account balance (fixes F2).**
Credit `outstanding_balance` when a discount is applied, so the account and row
models agree. Requires deciding whether the credit happens at release (reducing
`total_loan`) or at settlement — the former is closer to how discounts are
already disclosed to the borrower.

**Phase 3 — Make the balance derived, not accumulated (fixes F5, F9; contains F7).**
Add a single `recomputeOutstandingBalance(masterlistId)` that derives the
balance from the rows in one SQL statement, and call it at the end of every
mutation path instead of the four independent read-modify-writes. This makes
drift self-healing and removes the lost-update window. Decide explicitly
whether penalty is in or out of the definition (F7) and apply it consistently.

**Phase 4 — Make posting atomic (fixes F6).**
Move `postSingleDcrItem`'s write sequence into a single Postgres function so
posting, schedule update, payment update, and balance update commit or roll
back together. This also removes the retry double-decrement.

**Phase 5 — Reconcile status systems (fixes F8).**
Derive `account_status` and the "installments paid" counter from the same
source, so the hero, the counter, and the "Mark as paid off" gate can never
disagree.

**Phase 6 — Data repair.**
Only after Phases 1–3: settle the 23 orphan rows, clear AN300420's ₱16,852.50
phantom debt, and decide AN300430's F4 semantic conflict (its rows waived
₱67,003.20 under the old meaning; the stored JSON now implies ₱9,136.80 — a
**business call** about which is the honored agreement, not something to fix
silently in code).

---

## 7. Upstream lifecycle trace (intake → CSA → Committee → LRA → AR → Collector)

### F10 — PDC checks and the AR ledger now generate from different bases · **High · regression introduced today**

There are **four** independent places that generate a payment schedule from a
computation. Today's `masterlist.ts` fix moved one of them onto the **gross**
(pre-discount) basis; the others still use **net**:

| # | Where | Basis | Purpose |
|---|---|---|---|
| 1 | `initializeArAccount` ([ar/masterlist.ts](../src/lib/ar/masterlist.ts)) | **gross** (changed today) | the real AR ledger rows |
| 2 | `buildExpectedPdcSchedule` + inline validation ([lra/release-service.ts](../src/lib/lra/release-service.ts)) | net | validates the physical PDC checks |
| 3 | LRA detail page ([lra/applications/[id]/page.tsx:95-165](../src/app/lra/applications/%5Bid%5D/page.tsx)) | net | pre-fills the PDC rows staff encode |
| 4 | `buildBlriData` fallback ([lra/blri-data.ts:109-118](../src/lib/lra/blri-data.ts)) | net | briefing sheet (prefers real `pdc_checks` when present — lower risk) |

`buildExpectedPdcSchedule`'s own doc comment states the invariant it exists to
hold: *"Reuses the exact same generators/engines `initializeArAccount` uses …
so a CSA encoding PDC checks before release can never produce a schedule that
disagrees with what actually gets billed after release."* **That invariant is
now broken.**

It is also **hard-enforced** — every branch throws
`"Check amount must equal ₱X for PDC #N"`. All three PDC branches use net:

- monthly/MPL/Seafarer → `computation.monthlyAmortization` (net)
- salary → `halfUp(monthlyAmortization / 2)`, last row against `totalLoan` (net)
- bi-monthly / quarterly / two-monthly → generators fed `computation.totalLoan`
  / `totalInterest` (net)
- weekly / daily → unaffected (Invoice derives its own real schedule from
  principal; Daily is a single payment)

**Consequence for a discounted, non-Invoice loan:** the borrower signs physical
bank checks for the *diluted net* amount, while the AR ledger bills the *gross*
amount with `discount_amount` subtracted separately. Concretely on an
AN300434-shaped loan: PDC = ₱20,321.08 per check, AR row = ₱21,738.83 with its
own discount line. Because check numbers are paired to installments
positionally (`checkNumbersByInstallmentNo`), the ledger will display a check
number next to an amount that check was never written for.

**This is the highest-priority item in this document** — it affects money
leaving the borrower's bank account, and it is a regression from today, not a
pre-existing defect. Fix is narrow: give #2, #3, and #4 the same gross basis
`initializeArAccount` now uses (the `gross_total_interest` column added today
already carries it), and add a test asserting all generators agree for a
discounted loan of each schedule type.

### Clean handoffs verified (no action needed)

- **All computation-creation paths funnel through `persistComputation`.** CSA's
  compute route, Committee's override route (→ `negotiation/service.ts`), and
  the negotiation flow are the only three entry points; there is no direct
  `INSERT` into `computations` anywhere else. So `gross_total_interest` is
  populated on every new computation regardless of who creates it.
- **LRA reads `computation.paymentFrequency`, never the application's own
  `payment_schedule`.** CSA/Committee can override the schedule per-computation
  without touching the application row, so these two *can* diverge by design —
  but no downstream consumer reads the application field for scheduling, so the
  divergence is inert.

### Not traced (declared gaps, not clean bills of health)

- **Collateral (Auto/REM) specifics** beyond what was verified earlier in the
  session: `resolveComputationEngine` routes collateral to the SF net-method
  engine, and collateral locks `payment_schedule` to monthly. Because collateral
  loans are always monthly, they inherit F10's monthly branch — but the
  chattel/REM inspection, document, and fee paths were not re-examined here.
- **Briefer stage**, and the Final Computation Sheet / contract generators
  beyond confirming they read net totals (correct for *disclosure*, which is a
  net-of-discount figure — but not cross-checked against the row-level schedule).
- **Borrower-facing disclosure/acceptance** of terms prior to release.

## 6. Constraints for whoever implements this

1. **Do not "fix" F3 by narrowing the reversion rule.** The rule is correct;
   the orphaned rows are the defect. Suppressing reversion would break the
   genuine unpaid-by-due-date case.
2. **Phase 6 must not run before Phases 1–3**, or repaired data will re-drift.
3. **AN300430 (F4) requires a human decision** before any data change — the
   two interpretations differ by ₱57,866.40 of waived interest on a live
   account.
4. **Penalty-in-or-out (F7) is a business decision**, not an implementation
   detail. Pick once, apply everywhere, document it.
5. **Do not change `computeAutoAllocation`'s zero-due skip.** It is correct;
   F1 must be fixed in the state machine, not by reverting the allocator.
6. Keep the ledger *display* layer untouched — it was fixed and verified
   earlier today and correctly reflects whatever the rows say.
7. **F10 outranks everything else here.** It is a same-day regression that
   affects physical bank check amounts, and it should be fixed before Phase 1 —
   ahead of the Sep 7 reversion deadline, since both touch release-time data.
8. **Do not fix F10 by reverting `masterlist.ts` to the net basis.** The gross
   basis is correct (it is what stops the discount being double-counted); the
   other three generators are what need to move.
