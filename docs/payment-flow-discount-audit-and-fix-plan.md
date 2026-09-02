# Payment-Flow Discount Blindness — Audit & Phased Fix Plan

**Status:** ✅ Implemented and verified 2026-08-31 — see Implementation Notes at the bottom.
**Date:** 2026-08-31
**Severity:** Critical. Unlike the earlier ledger-display bug (cosmetic —
fixed 2026-08-31, see `docs/ledger-reusability-audit-and-plan.md`), this one
reaches **real money-posting logic**: an installment with an active discount
can never be marked "paid" even when the borrower pays exactly what's really
owed.
**Trigger:** User reported Collector's/Borrower's payment flow shows "the
pure payment" — no sign a discount exists — and asked for a full audit of
every payment-touching feature.

---

## 1. Root cause

One concept — **"how much is actually owed on this installment"** — is
computed in **nine separate places** across the codebase. Only one of them
(the ledger *display* layer, fixed earlier today) correctly computes it as
`amount_due − discount_amount [+ penalty − amount_paid]`. Every other
instance still uses the gross `amount_due [+ penalty − amount_paid]`,
because `discount_amount` is either not selected from the database at all,
or selected but never subtracted.

This is the same shape of bug as the ledger-display issue, just never
propagated to the functions that actually move money and compute what's
still due.

## 2. Every confirmed location, ranked by severity

### Tier 1 — Marks money as paid or not (most severe, silent, always triggered)

**`postSingleDcrItem`** — [src/lib/ar/posting.ts:753-773](../src/lib/ar/posting.ts#L753-L773)

This is the function that actually runs when AR reconciles a DCRR (confirms
the bank deposit) — it's the real "mark this installment paid" logic used
by both `reconcileDcrItem` and `reconcileAndPostDcr`.

```ts
const { data: schedule } = await supabase
  .from("amortization_schedules")
  .select("id, amount_due, amount_paid, penalty_amount, status") // no discount_amount
  ...
const totalDue = Number(schedule.amount_due) + Number(schedule.penalty_amount ?? 0);
const newPaid = Number(schedule.amount_paid) + Number(line.amount);
const paid = newPaid >= totalDue; // gross totalDue — a discounted installment can never satisfy this at its real, net amount
```

**Concrete failure:** installment has `amount_due = 1080`, `discount_amount
= 1080` (100% off, real amount owed = ₱0). Borrower pays ₱0 (or the DCR
allocates ₱0 to it, correctly, per the fixed ledger). `totalDue` here is
still 1080. `newPaid (0) >= totalDue (1080)` is false → status stays
`"partial"` forever, even though nothing is actually owed. The installment
can never reach `"paid"`, which cascades into aging/penalty logic treating
it as perpetually overdue.

### Tier 2 — Allocation math (feeds Tier 1 and the DCR-building UI directly)

**`computeAutoAllocation` + `fetchOpenInstallments`** — [posting.ts:34-85](../src/lib/ar/posting.ts#L34-L85)

```ts
.select("id, installment_no, amount_due, penalty_amount, amount_paid, status") // no discount_amount
...
const totalDue = halfUp(inst.amountDue + inst.penaltyAmount); // gross
const remainingDue = halfUp(totalDue - inst.amountPaid);
```

Splits an incoming payment oldest-installment-first by how much each one
"still needs" — using the gross figure. A discounted installment absorbs
money it doesn't actually need, starving later real payments of correct
allocation.

**`/api/collector/dcr/allocation-preview/route.ts`** (whole file) — a
**second, independently hand-rolled** copy of the exact same gross
calculation, not even calling the function above. This is what Collector
and Remedial staff literally see on screen while building a DCR — **this is
"the payment page" the bug report is about.**

**`addPaymentToDcr`** — [posting.ts:1227-1233](../src/lib/ar/posting.ts#L1227-L1233) — calls
`computeAutoAllocation`/`fetchOpenInstallments` when a Collector adds a
payment to a DCR draft without a manual allocation override. Same bug,
different call site.

### Tier 3 — Aging, penalty, and 30-day rollover (same pattern; usually masked by timing, not eliminated)

**Overdue penalty base** — [posting.ts:444-446](../src/lib/ar/posting.ts#L444-L446)

```ts
const outstanding = Number(overdue.amount_due) - Number(overdue.amount_paid); // no discount
const penalty = calculatePenaltyAmount(outstanding, penaltyRate);
```

**30-day rollover amount** — [posting.ts:480-484](../src/lib/ar/posting.ts#L480-L484)

```ts
const rollAmount = halfUp(
  Number(overdue.amount_due) - Number(overdue.amount_paid) + finalPenalty, // no discount
);
```

**SQL parity twin** — `refresh_one_masterlist_aging` (the function fixed
earlier today for the reversion-balance bug) has the identical two spots:
`v_outstanding` and the rollover's amount calculation.

**Why this is "usually masked, not eliminated":** the origination-discount
reversion rule clears `discount_amount` to 0 the moment an installment's due
date arrives (dpd ≥ 0) — one day *before* penalty ever applies (dpd ≥ 1). In
normal day-by-day operation, by the time an installment is actually
penalized, its discount has typically already reverted in a prior run, so
`amount_due` and the "real" amount happen to coincide by then. **But** any
time reversion and penalty both fire in the *same* run — a cron that missed
a few days, or (confirmed live today) the "Simulate delinquency" dev
tool jumping days-past-due in one shot — the discount is still present when
`outstanding`/`rollAmount` are computed, and both overstate what's owed.
This is a real, reproducible bug, just lower-frequency than Tier 1/2.

### Tier 4 — Informational displays that mislead staff (not money-moving, but shown as fact)

**`writeOffRoundingDifference`** — [posting.ts:234-253](../src/lib/ar/posting.ts#L234-L253) — `remainingDue`
computed from gross `amount_due`, same missing subtraction. Could let AR
write off a *larger* remainder than actually exists on a discounted
installment, or refuse a legitimate small write-off because the (wrongly
inflated) remaining balance looks too large for the configured threshold.

**`nextOpenInstallment` / `ScheduleLite` / `NextInstallment`** — [src/lib/collector/desk.ts:1-40](../src/lib/collector/desk.ts#L1-L40)
— no `discount_amount` field at all, `amount_due` returned as-is. Feeds:
- Collector's account **queue list** — `nextDueAmount` at [api/collector/accounts/route.ts:196-198](../src/app/api/collector/accounts/route.ts#L196-L198)
- Remedial's account **queue list** — `nextDueAmount` at [api/remedial/accounts/route.ts:247-249](../src/app/api/remedial/accounts/route.ts#L247-L249)
- Remedial's account **detail page** — a *third*, separately hand-rolled `nextDueAmount: next.amount_due + next.penalty_amount` at [api/remedial/accounts/[id]/route.ts:229](../src/app/api/remedial/accounts/%5Bid%5D/route.ts#L229)
- The **Demand Letter** document generator — [src/lib/documents/generators/demand-letter.ts:98,123](../src/lib/documents/generators/demand-letter.ts#L98) —
  an official letter sent to a delinquent borrower, quoting the gross amount owed

## 3. What's already correct — do not re-touch

- The ledger *display* layer (`mapScheduleRowForLedger`,
  `buildAccountLedgerRows`, `buildDeskLedgerRows`, and all 4 routes' SELECTs)
  — fixed earlier today, confirmed correct, out of scope here.
- `validateAllocationLines` (posting.ts) — only checks that allocation
  lines sum to the payment amount and that referenced installments are in a
  postable status. It's discount-agnostic by design and needs no change.
- The origination-discount reversion rule itself (`refreshMasterlistAging`'s
  discount-clearing UPDATE, and today's balance-carry-forward fix) — correct,
  untouched by this plan.
- Payment **submission** forms (`RecordPaymentForm.tsx`, Borrower's own
  proof-of-payment submission) — these just take a raw amount typed by a
  human; there's no gross/net confusion inside the form itself. The bug is
  entirely in what happens *after* submission (allocation, reconcile,
  aging, and the informational displays staff read before/instead of typing
  a number).

---

## 4. Phased plan

### Phase 0 — One shared, pure helper (the actual "single source of truth" fix)

Add one small, pure, well-tested function — the payment-side counterpart to
`mapScheduleRowForLedger` — that every Tier 1-4 call site switches to
instead of re-deriving the formula:

```ts
// src/lib/computation/money.ts (next to halfUp — framework-agnostic, no
// AR-specific imports, so both posting.ts and collector/desk.ts can use it
// without a new cross-module dependency)

/** The real amount owed on an installment: gross amount_due, net of any
 * origination/early-settlement discount, plus any accrued penalty, minus
 * whatever's already been paid. Every "how much is still owed" calculation
 * in the payment/allocation/aging/display pipeline must go through this —
 * discount_amount was being silently dropped in 9 separate hand-written
 * copies of this formula before 2026-08-31 (see
 * docs/payment-flow-discount-audit-and-fix-plan.md). */
export function netInstallmentDue(input: {
  amountDue: number;
  discountAmount?: number | null;
  penaltyAmount?: number | null;
  amountPaid?: number | null;
}): number {
  const net = halfUp(
    (input.amountDue - (Number(input.discountAmount) || 0)) +
      (Number(input.penaltyAmount) || 0) -
      (Number(input.amountPaid) || 0),
  );
  return Math.max(0, net);
}
```

**Constraint:** this function only computes the *net owed* number — it does
not decide status transitions, does not touch the database, and takes no
`SupabaseClient`. Every caller still owns its own read/write; this just
replaces their inline arithmetic.

### Phase 1 — Tier 1: `postSingleDcrItem` (the critical fix)

- Add `discount_amount` to the SELECT at posting.ts:756.
- Replace the gross `totalDue` with `netInstallmentDue({ amountDue,
  discountAmount, penaltyAmount })`, compared against `newPaid` the same
  way.
- **Constraint:** do not change how `newPaid` itself accumulates
  (`amount_paid + line.amount` stays as-is) — only the threshold it's
  compared against changes.

### Phase 2 — Tier 2: allocation math + the DCR-building UI

- `fetchOpenInstallments`: add `discount_amount` to the SELECT and
  `OpenInstallment` type.
- `computeAutoAllocation`: use `netInstallmentDue` for `totalDue`/`remainingDue`.
- `/api/collector/dcr/allocation-preview/route.ts`: stop hand-rolling a
  second copy — select `discount_amount`, add it to the `installments`
  mapping, and (since this route's installment shape now matches
  `OpenInstallment`) call the shared `computeAutoAllocation` directly
  instead of maintaining a parallel implementation.
- **Constraint:** `addPaymentToDcr`'s call site doesn't need its own edit —
  it already calls the now-fixed `computeAutoAllocation`/`fetchOpenInstallments`.
- **Constraint:** do not change `validateAllocationLines` — confirmed
  discount-agnostic and correct as-is (Section 3).

### Phase 3 — Tier 3: aging, penalty, 30-day rollover (TS + SQL twin)

- `refreshMasterlistAging`: fetch `discount_amount` alongside the other
  overdue-installment columns (already needs a broader SELECT for the
  reversion step below it — reuse that same fetched row); use
  `netInstallmentDue` for both `outstanding` (penalty base) and
  `rollAmount`.
- Mirror the identical two changes in the `refresh_one_masterlist_aging`
  SQL function, via a new migration (same pairing discipline as today's
  reversion-balance fix).
- **Constraint:** this phase touches the *same function* as today's
  reversion-balance-carry-forward fix — apply this as a **new, separate**
  `CREATE OR REPLACE FUNCTION` migration on top of it, not a rewrite of
  that migration, so the two fixes stay independently attributable and
  revertable.
- **Constraint:** do not change the discount-reversion UPDATE itself, the
  aging-bucket thresholds, or the rollover's 30-day trigger condition —
  only the two amount calculations.

### Phase 4 — Tier 4: rounding write-off + every "next due" display

- `writeOffRoundingDifference`: select `discount_amount`, use
  `netInstallmentDue` for `remainingDue`/`totalDue`.
- `collector/desk.ts`: add `discount_amount`/`discountAmount` to
  `ScheduleLite`/`NextInstallment`; `nextOpenInstallment` returns the net
  amount via `netInstallmentDue`.
- Update the **three** separate callers that currently add `penalty_amount`
  onto `next.amount_due` by hand instead of trusting the (now-fixed)
  helper's output:
  - `api/collector/accounts/route.ts:196-198`
  - `api/remedial/accounts/route.ts:247-249`
  - `api/remedial/accounts/[id]/route.ts:229` (this one doesn't even call
    `nextOpenInstallment` — it's a fourth hand-rolled copy; either wire it
    to the shared function or apply the same net-calc inline, whichever is
    the smaller diff once the surrounding code is re-read)
- Update **every route that selects `ScheduleLite` rows** for
  `nextOpenInstallment`/`asSchedules` to include `discount_amount` in its
  `amortization_schedules(...)` SELECT (these routes already use
  `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` for the *ledger* portion of the
  same query in some cases — check whether the aging/next-due portion reads
  from the same fetched rows or a separate query before duplicating work).
- `demand-letter.ts`: no code change expected beyond receiving the
  corrected `nextOpenInstallment` output — verify by regenerating a demand
  letter for a discounted, overdue account.

### Phase 5 — Regression tests

1. `netInstallmentDue` — pure function, direct unit tests: zero discount,
   partial discount, 100% discount, discount larger than amount_due (should
   floor at 0, never go negative), with and without penalty/amount_paid.
2. `computeAutoAllocation` — extend existing tests
   (`src/lib/ar/__tests__/posting.test.mts`) with a discounted-installment
   case: confirm a fully-discounted installment is skipped (remaining due
   is 0) and money flows to the next real installment instead.
3. `postSingleDcrItem` / reconcile flow — the critical regression: a
   discounted installment reaches `status: "paid"` when the *net* amount is
   paid, not stuck at `"partial"`.
4. Aging/penalty — a discounted-and-simultaneously-overdue fixture (mirrors
   the Simulate-delinquency repro) proving penalty is computed on the net
   balance.
5. `nextOpenInstallment` — a discounted next-installment case returns the
   net amount.

### Phase 6 — Live verification

Using AN300431 (Metro Builders Supply, Invoice/Weekly, has active
discounts on weeks 1, 2, 5, 6, 9, 10, 12):

- [ ] Collector's DCR allocation preview shows net amounts for discounted weeks
- [ ] Building and reconciling a DCR that pays exactly the net amount on a
      100%-discounted week marks that installment `"paid"`, not `"partial"`
- [ ] Collector's and Remedial's account queue lists show net `nextDueAmount`
- [ ] Regenerate a Demand Letter (on a different, overdue+discounted test
      account) and confirm the quoted amount is net
- [ ] Re-run the "Simulate delinquency" dev tool on a discounted account and
      confirm penalty is charged on the net balance, not gross

---

## 5. Constraints (apply across every phase)

1. **Route through `netInstallmentDue` everywhere, don't hand-derive the
   formula again** — the entire point of this plan is collapsing nine
   copies into one; a phase that adds a *tenth* inline `amount_due -
   discount_amount` is a regression against the plan's own goal.
2. **Do not touch the ledger-display layer** (`mapScheduleRowForLedger`,
   `buildAccountLedgerRows`, `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`) —
   already correct, already tested, already live-verified today.
3. **Do not touch `validateAllocationLines`, the reversion UPDATE, aging
   thresholds, or the 30-day rollover trigger condition** — only the
   *amount* calculations within the functions that contain them.
4. **Keep the SQL migration for Phase 3 separate from today's
   reversion-balance-fix migration** — a new `CREATE OR REPLACE FUNCTION`,
   not an edit to the existing migration file.
5. **No signature changes** to `computeAutoAllocation`,
   `fetchOpenInstallments`, `nextOpenInstallment`, or any other existing
   exported function beyond what's needed to accept/return the
   discount-aware amount — every existing caller must keep compiling.
6. **Audit each touched route's SELECT for unrelated columns it still
   needs** (same discipline as the ledger-reusability plan) before
   swapping in a shared column list or helper, so nothing downstream loses
   a field it depends on.
7. **Run `npm test` after each phase**, not only at the end — this plan
   touches real money-posting logic across 9 call sites; catching a
   regression early matters more here than in the display-only fix.
8. **Live-verify on a real discounted, not-yet-reverted loan (AN300431)**
   before considering this done — especially Phase 1/2, since a passing
   unit test doesn't prove the DCR reconcile flow actually flips status to
   `"paid"` in the real UI.
9. **Do not fix Tier 3 (aging/penalty/rollover) by suppressing or delaying
   the discount-reversion rule** — the two features are independent; Tier
   3's bug is that its *own* amount math ignores discount, not that
   reversion is timed wrong.

## Implementation notes (2026-08-31)

- **Phase 0:** `netInstallmentDue()` added to `src/lib/computation/money.ts`
  (framework-agnostic, no AR-specific imports) — 8 unit tests covering zero/
  partial/100% discount, penalty, amount_paid, and the never-negative floor.
- **Phase 1 (critical):** `postSingleDcrItem` now selects `discount_amount`
  and compares `newPaid` against `netInstallmentDue(...)` instead of gross
  `amount_due + penalty_amount`.
- **Phase 2:** `OpenInstallment`/`fetchOpenInstallments` (now exported) carry
  `discountAmount`; `computeAutoAllocation` uses `netInstallmentDue`. The
  allocation-preview route keeps its own SELECT (needs `dueDate`, which
  `OpenInstallment` doesn't carry — confirmed genuinely different shapes,
  not worth forcing into one) but now includes `discount_amount` and passes
  `discountAmount` into `computeAutoAllocation`.
- **Phase 3:** `refreshMasterlistAging`'s `outstanding` (penalty base) and
  `rollAmount` (30-day rollover) both routed through `netInstallmentDue`.
  SQL parity twin fixed in a **separate** new migration
  (`penalty_rollover_net_of_discount`), not a rewrite of the earlier
  reversion-balance migration, per constraint #4.
- **Phase 4:** `writeOffRoundingDifference` fixed the same way.
  `collector/desk.ts`'s `NextInstallment` gained an additive `netAmountDue`
  field (gross `amount_due`/`penalty_amount` kept unchanged for any other
  caller) — wired into the 3 places that were hand-adding
  `amount_due + penalty_amount`: Collector's queue list, Remedial's queue
  list, Remedial's account detail page. **Correction to the original
  audit:** the Demand Letter generator does *not* need a fix — it quotes
  `masterlist.outstanding_balance` (already correct), only using
  `nextOpenInstallment` for the due date.
- **Phase 5:** 16 new tests added across
  `net-installment-due.test.mts` (new), `posting.test.mts` (discount-aware
  allocation + the critical "reaches paid at net amount" regression),
  `aging-parity.test.mts` (penalty/rollover net of discount), and
  `desk.test.mts` (`netAmountDue`). Full suite: 1443/1443 passing (was 1427).
- **Phase 6 — live, end-to-end, on real data (AN300431):**
  - Collector's queue list "Next due" now shows **₱0.00** for a
    100%-discounted week (was the gross amount before this fix).
  - Recorded a real ₱2,160 payment, opened the DCR allocation-preview
    modal — it correctly **skipped** the two 100%-discounted weeks
    (unchecked, not auto-selected) and allocated the full amount across
    the two real, undiscounted weeks instead. Checked Total matched
    Payment Amount exactly, ₱0 leftover.
  - Submitted the DCR, reconciled it as AR — confirmed directly in the
    database: the two real installments now show `status: "paid"`,
    `amount_paid: 1080.00` each; the two discounted installments remain
    untouched (`pending`, `amount_paid: 0.00`, discount still intact).
  - `masterlist.outstanding_balance` dropped from ₱117,180.00 to
    ₱115,020.00 — exactly the ₱2,160 posted.

## Second pass (2026-08-31) — surfaces missed the first time

Asked directly "are you sure you checked all pages" — re-audited with a
broader grep (`amount_due.*penalty_amount` and variants) across the whole
`src/` tree instead of relying on the original file list. Found real gaps
outside the DCR/reconcile/aging pipeline the first pass focused on:

**Client-side (confirmed real risk, not just display):**
- `src/app/collector/dcr/page.tsx` and `src/app/remedial/dcr/page.tsx` each
  had their own independent, stale copy of `installmentRemainingDue()`
  (gross). Used for the "Amount Due" column display **and** as the fallback
  amount if staff manually checked a row the server's auto-allocation had
  skipped — a real path to misapplying money that the server-side Phase 1/2
  fix alone didn't close.

**Reports/Analytics (read-only, wrong numbers shown to management):**
- `reports/metrics/money.ts` — Total receivable, Collection efficiency,
  Projected inflow 30/60/90
- `reports/trends/inputs.ts` + `delinquency.ts` — PAR30/60/90 trend
- `reports/trends/inputs.ts` + `collections.ts` — collection-efficiency trend
- `dashboard/aggregates.ts`'s `buildCollectionWidget` — "Weekly collected vs
  due" chart

**Customer-facing (the most important one found this pass):**
- `collector/reminders.ts` + `reminder-scan.ts` — the actual email/SMS text
  sent to borrowers quoted the gross amount, not what they really owed.

All fixed the same way — routed through `netInstallmentDue()` (or, where
the row's own accounting already tracks `amountPaid` separately via a pool,
just the discount subtraction inline). Test fixtures across
`sms-reminders.test.mts`, `delinquency.test.mts`, and `series.test.mts`
needed `discountAmount`/`discount_amount` added to compile (the type
changes were additive-but-required on those specific fields, which is why
they surfaced immediately as compile/assertion failures rather than silent
gaps). Full suite: 1446/1446 passing (was 1443).

**Verified this was a genuinely complete sweep, not another partial one:**
re-ran the same grep pattern after all fixes — every remaining match is
either an already-fixed file or a test fixture. Also checked the Executive
Reports UI pages (`src/app/reports/*`) and their API routes directly —
none compute `amount_due` themselves; they read `outstanding_balance` or
go through the now-fixed trends/metrics modules.
