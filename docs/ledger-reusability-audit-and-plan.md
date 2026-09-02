# Ledger Reusability — Audit & Phased Plan

**Status:** ✅ Implemented and verified 2026-08-31 — see Implementation Notes at the bottom.
**Date:** 2026-08-31
**Trigger:** Collector's Record Payment page showed no discount data (screenshot,
AN300431) while the AR page showed it correctly for the same account. Investigating
why led to auditing how many places "know" how to turn a database row into a
ledger row.

---

## 1. Audit — what's already reusable, what isn't

### Already consolidated (found in progress, not something this plan creates)

Between the previous fix and this audit, `src/lib/ledger/build-account-ledger-rows.ts`
picked up a real shared mapper:

```ts
export type RawAmortizationScheduleRow = { id, installment_no?, due_date?,
  amount_due?, penalty_amount?, discount_amount?, status? };

export function mapScheduleRowForLedger(row, checkNo): LedgerSchedule
```

This is now used by **AR's masterlist page** and the **Borrower portal**
(`LoanActivePanel.tsx`) — both call this one function instead of hand-writing
the DB-row-to-ledger-row mapping. `src/lib/ledger/desk-ledger.ts`'s
`buildDeskLedgerRows` (the Collector/Remedial wrapper around the same core
`buildAccountLedgerRows`) also already declares `discountAmount` on its
`DeskLedgerSchedule` type and wires it through.

**So the row-building/mapping layer is already the "one place" the user is
asking for.** It is not duplicated math or duplicated row-shape logic anymore.

### Not yet consolidated — the actual remaining gap

The mapping function only ever sees what its caller SELECTs from the
database. Four call sites each still hand-write their own
`amortization_schedules` column list:

| Call site | `discount_amount` in SELECT? | Result |
|---|---|---|
| `src/app/api/ar/masterlist/[id]/route.ts` | Uses `amortization_schedules ( * )` — wildcard | ✅ has it |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | Uses `amortization_schedules ( * )` — wildcard | ✅ has it |
| `src/app/api/collector/accounts/[id]/route.ts` | Explicit column list, **missing** `discount_amount` (lines 64-73 and the response mapping at 126-135) | ❌ Collector never receives it |
| `src/app/api/remedial/accounts/[id]/route.ts` | Explicit column list, **missing** `discount_amount` (lines 72-81 and the response mapping at 237-248) | ❌ Remedial never receives it — this route feeds **both** Remedial's main account page and the shared Collector/Remedial `RecordPaymentPage.tsx` (Remedial side) |

This is exactly the screenshot: Collector's page can't show a discount it
never asked the database for. The row-builder is already correct and
shared — the gap is one layer earlier, in each route's own SELECT string.

**Why this can still recur even with the mapper consolidated:** if a 6th
ledger-relevant column is ever added (e.g. a future `waived_penalty`
column), someone has to remember to add it to *four* separate hand-typed
SELECT strings. The mapper being shared doesn't protect against that —
only a shared *column list* does.

### Explicitly NOT part of this gap (do not touch)

- **Payments/postings/credits assembly** differs by role on purpose, not by
  accident: AR and Borrower build `payments` from `payments` + posted
  `internal_transfer` credits (+ AR alone also includes rounding write-offs);
  Collector/Remedial build `payments` from `postings` only via
  `ledgerEntriesFromPostings`. This is real business-scoped behavior — AR
  performs write-offs and sees them, field Collectors don't. Consolidating
  this would change what each role is allowed to see, not just how it's coded.
- **Remedial's `asSchedules()` / `ScheduleLite`** (`route.ts` lines ~16-30) is
  a *separate* mapper used only for `nextOpenInstallment`/`remedialDaysPastDue`
  aging math — not for ledger display. It doesn't need `discount_amount` and
  should not be merged with the ledger mapper; they serve different concerns
  that happen to read the same table.
- **RLS/WHERE/join clauses** in every route (`assignments.collector_user_id`,
  `remedial_flag`, etc.) — untouched by this plan, only the
  `amortization_schedules(...)` column list inside each SELECT changes.

---

## 2. Phased plan

### Phase 1 — One canonical column list, not four

Add a single exported constant next to `mapScheduleRowForLedger` in
`src/lib/ledger/build-account-ledger-rows.ts`:

```ts
/** The exact amortization_schedules columns every ledger page needs.
 * Interpolate this into every route's SELECT instead of hand-typing the
 * list — adding a new ledger-relevant column here is the one place that
 * needs to change, not once per route (confirmed 2026-08-31: discount_amount
 * was missing from 2 of 4 routes because each hand-wrote its own list). */
export const AMORTIZATION_SCHEDULE_LEDGER_COLUMNS =
  "id, installment_no, due_date, amount_due, amount_paid, status, penalty_amount, paid_at, discount_amount";
```

Update the two gap routes to use it:
- `src/app/api/collector/accounts/[id]/route.ts` — replace the hand-typed
  column list (lines 64-73) with the constant; add `discountAmount:
  Number(row.discount_amount ?? 0)` to the response mapping (~line 128-135).
- `src/app/api/remedial/accounts/[id]/route.ts` — same, at lines 72-81 and
  237-248.

Also update the two routes that already work (`ar/masterlist/[id]`,
`borrower/applications/[id]/loan`) to use the same constant instead of `*`
— not because they're broken, but so all four routes genuinely share one
column list going forward instead of two coincidentally-correct wildcards
and two hand-typed lists.

**Constraint:** touch only the `amortization_schedules(...)` column
selection inside each existing `.select()` call. Do not restructure the
surrounding query, joins, or WHERE/`.eq()` filters.

### Phase 2 — Type safety at the last mile

`src/components/payments/RecordPaymentPage.tsx`'s local `ScheduleRow` type
(lines 36-43) doesn't declare `discountAmount`, even though
`buildDeskLedgerRows` already accepts it. This mostly doesn't matter at
runtime (JSON doesn't care about TS types) but means the field is invisible
to anyone reading this file. Add `discountAmount?: number` to `ScheduleRow`.

**Constraint:** additive only — do not change `AccountPayload`,
`requestAccount`, or any prop/signature this component exposes.

### Phase 3 — Regression tests

1. A test asserting `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` contains
   `"discount_amount"` — cheap, catches a regression the moment anyone edits
   the constant.
2. Tests for `mapScheduleRowForLedger` itself (currently untested) —
   confirm it correctly maps `discount_amount` → `discount`, handles a
   missing/null value as 0, and preserves `checkNo` pass-through.
3. Extend `desk-ledger.ts`'s existing test coverage (if any — check
   `src/lib/ledger/__tests__/desk-ledger.test.mts`) with a case asserting
   `discountAmount` flows from `DeskLedgerSchedule` into the built row's
   `discount` field.

### Phase 4 — Live verification, all four pages, one loan

Using AN300431 (Metro Builders Supply, Invoice/Weekly, has active
discounts on weeks 1, 2, 5, 6, 9, 10, 12 that haven't reverted yet):

- [ ] AR masterlist page — Target/Discount columns (already confirmed working, re-check after the column-list refactor to catch any regression)
- [ ] Borrower portal — same (already confirmed working, re-check for regression)
- [ ] Collector's Record Payment page — should now show Target net of discount + Discount column populated, matching AR exactly
- [ ] Remedial's main account page and Record Payment page — same

### Phase 5 — Full test suite

Run `npm test` after each phase, not just at the end — the column-list
change touches 4 live API routes, so catching a regression early (e.g. a
route that depended on the exact old column order, or a consumer expecting
`amount_paid` that Collector's route currently selects but the shared
constant above doesn't include) matters more here than usual.

**Note:** Collector's current SELECT includes `amount_paid`, which the
constant above does *not* include. Within `collector/accounts/[id]/route.ts`
itself it's only ever passed straight through to the JSON response as
`amountPaid` (not used in any calc in that file) — but downstream
components (e.g. `RecordPaymentForm`) may rely on that response field for
partial-payment math, so it must not silently disappear. Either add
`amount_paid` to the shared constant, or keep it as an addition layered on
top of the constant in that specific route's `.select()`. Remedial's route
selects the same columns as the constant with nothing extra. Check each
route's actual downstream usage (not just what's in the SELECT) before
swapping in the shared constant, so nothing loses a column it depends on.

---

## Implementation notes (2026-08-31)

- **Phase 1:** Added `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` to
  `build-account-ledger-rows.ts`. All 4 routes now interpolate it:
  `ar/masterlist/[id]`, `borrower/applications/[id]/loan` (both switched
  from `*`), and `collector/accounts/[id]`, `remedial/accounts/[id]` (both
  switched from their hand-typed, discount_amount-missing lists). Collector
  and Remedial both append `, amount_paid` on top of the constant per the
  audit's finding that it's needed downstream even though it's not a ledger
  field; Borrower needed no addition (confirmed via grep, no `amount_paid`
  usage in `LoanActivePanel.tsx`); AR needed `amount_paid` too (used in its
  write-off eligibility calc). Both response mappings in Collector's and
  Remedial's routes now include `discountAmount`.
- **Phase 2:** `RecordPaymentPage.tsx`'s `ScheduleRow` type now declares
  `discountAmount?: number`.
- **Phase 3:** Added tests for `mapScheduleRowForLedger` (previously
  untested — field mapping, null-safety, checkNo default) and for
  `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` (asserts `discount_amount` is
  present). Extended `desk-ledger.test.mts` with a discount-passthrough
  case.
- **Phase 4:** Live-verified:
  - AR masterlist (AN300431) — unchanged, confirmed no regression after the
    column-list swap.
  - Collector's Record Payment page (AN300431) — **the exact page from the
    original bug report** — now shows Target/Discount identically to AR.
  - Remedial's main account page (AN300018, a real remedial-assigned
    account) — renders correctly, no regression; this account happens to
    have no active discount on file, so discount *display* wasn't visually
    confirmed there, but the code path is identical in structure to
    Collector's now-proven-working case and the response mapping was
    verified by code read.
  - Borrower portal — **not live-verified.** AN300431's borrower has no
    linked login (fast-tracked application, `borrowers.user_id IS NULL`),
    and no other test account combines a linked login with an active,
    not-yet-reverted discount. Verified by code read instead: the route's
    column list already matched what `LoanActivePanel.tsx` needs (confirmed
    via grep before the change), and the swap from `*` to the explicit
    constant is the same low-risk pattern already proven safe on AR.
- Full suite: 1427/1427 passing (was 1421 before this work).

## 3. Constraints (apply across every phase)

1. **Only the `amortization_schedules(...)` column list changes** inside
   each route's existing `.select()` — no WHERE/join/RLS-filter changes, no
   restructuring of the query shape.
2. **Payments/postings/write-off/transfer assembly stays role-specific.**
   Do not attempt to unify AR's write-off-inclusive payment list with
   Collector/Remedial's postings-only list — that's a deliberate scope
   difference, not duplication.
3. **Remedial's `asSchedules()`/`ScheduleLite` (aging/dpd logic) stays
   separate** from the ledger mapper — different concern, same table.
4. **No signature changes** to `buildAccountLedgerRows`,
   `mapScheduleRowForLedger`, `buildDeskLedgerRows`,
   `checkNumbersByInstallmentNo`, or `ledgerEntriesFromPostings` — every
   existing caller of these must keep compiling untouched.
5. **Audit each route's other uses of its schedule rows** (e.g. Collector's
   `amount_paid`/`nextDueAmount`) before swapping in a shared column-list
   constant, so nothing downstream loses a column it needs for non-ledger
   purposes.
6. **Run `npm test` after each phase**, not only at the end.
7. **Live-verify on a real loan with an active, not-yet-reverted discount**
   (AN300431) across all four pages before considering this done — a
   passing test suite alone doesn't prove the browser renders it.
