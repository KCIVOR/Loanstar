# Bounced Payment Status Implementation Plan

**Goal:** A payment whose check AR marks as bounced stops showing "DCR pending" and stops reducing the "after pending" balance on Collector, Remedial and Record-payment screens.
**Root cause:** `bounceDcrItem` sets `dcr_items.status = 'bounced'` and writes `payments.flagged_reason`, but never changes `payments.status`, which stays `'confirmed'` (`src/lib/ar/posting.ts:1348-1371`). Every "unposted" reader treats `'confirmed'` as "recorded, awaiting posting" (`src/lib/ar/duplicate-dcr.ts:17-20`).
**Approach:** Add `status: "rejected"` to the existing payments update inside `bounceDcrItem`, plus a one-time data backfill of the 11 already-bounced payments. No other file changes.
**Tech stack:** Next.js + TypeScript, Supabase Postgres, node:test via `tsx` (`package.json:10`).
**Source:** User report 2026-10-01 (Collector accounts, AN300516 Pedro Dela Cruz): "it says i have pending dcr, but i cant see it." Expected result: no "DCR pending" flag and no "after pending" deduction for a bounced payment.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | Reuse `'rejected'` for bounced payments, or add a new `'bounced'` payment status? | `'bounced'` needs a CHECK-constraint migration and updates to every status → label/badge map. `'rejected'` is already allowed and rendered everywhere. | Reuse `'rejected'`. The distinction is already preserved by `dcr_items.status = 'bounced'` and `flagged_reason = 'Bounced: …'`. |
| 2 | Accept the user-visible side effects listed in Audit finding 6 (Payment proofs page lists it under "rejected" instead of "confirmed"; collector history "Rejected" payment KPI +1 per bounce; dashboard collection widget stops counting bounced money)? | These are behaviour changes on screens outside the reported one. They are all corrections (a bounced check is not collected money), but the user asked for no unrelated changes. | Accept. No code changes on those screens. They follow automatically from the corrected status. |

---

## Live database/system validation: 2026-10-01

Read-only; no data changed.

- `payments` status CHECK: `status IN ('pending_verification','confirmed','rejected','posted')`. `'rejected'` is already allowed, so no migration is needed.
- No user triggers on `public.payments` (`pg_trigger` where not internal: none).
- Bounced items joined to their payments, grouped by `payments.status`: **11 rows, all `'confirmed'`**. This includes AN300516's ₱21,154.60 payment, whose DCR line is `bounced` under a `reconciled` DCR.
- AN300516 reproduction: one payment with status `confirmed` and `flagged_reason` starting with `Bounced:`. It has 1 `dcr_items` row (status `bounced`), so the DCRR "Confirmed payments" list correctly hides it while the accounts list counts it.

## Audit findings

1. **Writer (the bug):** `bounceDcrItem` updates payments with only `flagged_reason` and `flagged_at` (`src/lib/ar/posting.ts:1362-1368`).
2. **Unposted readers (all use `pending_verification` + `confirmed`):**
   - `src/app/api/collector/accounts/route.ts:187`: "DCR pending" badge and pending total.
   - `src/app/api/remedial/accounts/route.ts:161`: same, for Remedial.
   - `src/app/api/collector/payments/route.ts:265`.
   - `src/lib/ar/effective-balance.ts:166`, through `UNPOSTED_PAYMENT_STATUSES` (`src/lib/ar/duplicate-dcr.ts:17`).

   None of these need editing: once the status is `'rejected'` they exclude the payment.
3. **Bounce-history readers do not depend on payment status:**
   - `fetchAccountBouncedItems` filters `dcr_items.status = 'bounced'` only (`src/lib/collection/account-postings.ts:43-58`).
   - The demand-letter loader does the same (`src/lib/documents/generators/demand-letter.ts:393-397`).

   So the ledger "bounced" row and the demand letter keep working.
4. **No re-confirm path:** the proof-review PATCH only transitions from `pending_verification` (`src/app/api/collector/payments/[id]/route.ts:24,67`). A rejected (bounced) payment cannot be flipped back to confirmed. `dcr_items` keeps the row, so it also cannot be re-batched.
5. **Payment receipt:** this generator requires `status === 'posted'` (`src/lib/documents/generators/payment-receipt.ts:102`). It is unaffected, because bounced payments never had receipts.
6. **Indirect, automatic effects (no code change):**
   - Borrower portal: **no visible change**. A flagged payment already renders "needs re-verification" whatever its status, because the `flagged` check wins over the status badge (`src/components/borrower/LoanActivePanel.tsx:480-499`).
   - Collector Payment proofs page: the payment moves from the "confirmed" filter to the "rejected" filter (`src/app/api/collector/payments/route.ts:90-101`).
   - Collector history counts the payment under "Rejected" (`src/app/collector/history/page.tsx:100,258`).
   - The dashboard collection widget's `.in("status", ["confirmed","posted"])` stops counting it (`src/lib/dashboard/aggregates.ts:387`).
7. **Prior decision:** `docs/ar-bounced-check-recording-implementation-plan.md` (2026-09-23) chose to flag the payment "via the same `flagged_reason`/`flagged_at` columns Reject already uses". It did not consider the unposted-status readers, so this plan extends that design rather than contradicting it.
8. **Tests:** the runner executes `src/lib/**/__tests__/*.mts` (`package.json:10`). The existing bounce test lives at `src/lib/ar/__tests__/posting.test.mts:1030-1046` and captures the payments payload via `getUpdatedPayment()`.

---

## Scope and constraints

### In scope
- One added property (`status: "rejected"`) in the existing payments `.update({...})` in `bounceDcrItem`.
- One added assertion in the existing bounce test.
- One-time backfill of already-bounced payments.

### Out of scope: do not change
- All reader routes and helpers listed in Audit findings 2, 3 and 6, plus `UNPOSTED_PAYMENT_STATUSES`.
- `rejectDcrItem`, `reconcileDcrItem`, `settleDcrStatusIfComplete`, the bounce API route, and all UI components.
- No migration, no new status value, no RLS changes.

### Non-negotiable safety constraints
- The bounce must still never write to `postings` or `dcr_item_allocations`. The existing test stub throws if it does.
- The backfill touches only payments that have a `dcr_items` row with status `bounced` **and** a payment status of `confirmed`.

### Contract

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path | AR | Bounce a pending item on a submitted DCR | `dcr_items.status='bounced'`, `payments.status='rejected'`, `flagged_reason='Bounced: <ref>'`. Account loses "DCR pending" and the "after pending" deduction. |
| Already processed | AR | Bounce a posted item | Unchanged: throws "This line item was already processed". The payment is not touched. |
| Existing data | n/a | The 11 bounced/confirmed payments | Become `rejected` after the backfill. |
| Bounce history | Collector/Remedial/AR | Open the AN300516 ledger | The "bounced" row is still shown. |
| Direct DB write by non-staff | Borrower | n/a | Unchanged: the write uses the existing service client in the AR-gated route. No new write path. |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/ar/posting.ts` | Add `status: "rejected"` to the payments update in `bounceDcrItem` (lines 1364-1367) | Fix future bounces |
| `src/lib/ar/__tests__/posting.test.mts` | Add one assertion to the existing "records the bounce…" test | Regression test |

The data backfill is run once against live data. It is not a repo file.

## Phase 0: Failing test first

### Task 0.1: assert the payment status on bounce
**File:** `src/lib/ar/__tests__/posting.test.mts`
- [ ] In the test `"records the bounce (status, reference, amount) and never touches postings"`, after line 1045 (`assert.match(String(getUpdatedPayment()!.flagged_reason), /DAIF/);`), add:
  ```ts
  assert.equal(getUpdatedPayment()!.status, "rejected");
  ```
- [ ] Run: `npm test`. Expected: this test FAILS (`undefined !== 'rejected'`).

## Phase 1: Code fix

### Task 1.1
**File:** `src/lib/ar/posting.ts`
- [ ] Change the payments update in `bounceDcrItem` to:
  ```ts
    .update({
      status: "rejected",
      flagged_reason: `Bounced: ${input.depositReference}`,
      flagged_at: now,
    })
  ```
- [ ] Run: `npm test`. Expected: all tests pass.

**Phase constraints:** no other line in `posting.ts` changes. Do not touch `rejectDcrItem` (lines ~1210-1270). It intentionally leaves the payment `confirmed` so it can be re-batched.

## Phase 2: Backfill existing data (after the code is deployed)

- [ ] Pre-check (read-only), expected `confirmed | 11`, or more if bounces happened since:
  ```sql
  select p.status, count(*) from dcr_items i join payments p on p.id = i.payment_id
  where i.status = 'bounced' group by p.status;
  ```
- [ ] Apply via the Supabase SQL editor or MCP `execute_sql`, with the user's approval:
  ```sql
  update payments p set status = 'rejected'
  from dcr_items i
  where i.payment_id = p.id and i.status = 'bounced' and p.status = 'confirmed';
  ```
- [ ] Post-check: rerun the pre-check. Expected: only `rejected`.

## Phase last: Regression verification and rollout

- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

| Role | Screen | Action | Expected |
| --- | --- | --- | --- |
| Collector | Accounts | Find AN300516 | No "DCR pending"; balance shows ₱105,773.00 with no "after pending" line |
| Remedial | Accounts | Any account with a bounced payment | No "DCR pending" for it |
| Collector | AN300516 ledger | Open | "bounced" row still present, balance unchanged |
| AR | DCR | Bounce a new test item | Account stops showing pending for that payment immediately |
| Collector | DCRR | Open | Bounced payment still not listed (unchanged) |

## Rollback
1. Revert the one-line code change. Future bounces will leave the payment `confirmed` again (the old behaviour).
2. Reversing the backfill (only if required): `update payments p set status='confirmed' from dcr_items i where i.payment_id=p.id and i.status='bounced' and p.status='rejected';`. This restores the old (buggy) display. Nothing else depends on the change.

## Commit
Work on `main` (project rule).
```bash
git add src/lib/ar/posting.ts src/lib/ar/__tests__/posting.test.mts docs/bounced-payment-status-implementation-plan.md
git commit -m "fix(ar): mark bounced payment rejected so it stops counting as DCR pending"
```

## Self-review
1. **Contradictions:** none. The out-of-scope screens get no code change; their automatic effects are listed in Open question 2.
2. **Goal reachability:** existing rows are covered by the Phase 2 backfill. Future rows are covered by Phase 1. `bounceDcrItem` is the only writer of `dcr_items.status='bounced'` (grep: only `posting.ts:1351`).
3. **Bypass:** no new write path. The bounce route is AR-gated and uses the existing service client.
4. **Existence:** every path, line, test name and the `'rejected'` CHECK value were confirmed by grep/query on 2026-10-01.
5. **Consistency:** the Files table matches the phases and the commit list. The test path matches the runner glob.
6. **Duplication:** no new field. The bounce distinction stays in `dcr_items.status` / `flagged_reason`.
7. **Placeholders:** none.

**Full reader sweep (2026-10-01):** every `src` file that queries `payments` (23 files) and every public DB function that references it (`post_single_dcr_item`, `recompute_account_penalties`, `connect_application_to_borrower_account`, `reassign_application_borrower_account`) was checked.
- `post_single_dcr_item` only runs on pending DCR lines, and a bounced line is never pending.
- `recompute_account_penalties` joins `postings`; a bounced payment has no postings.
- The two account-connect functions update only `borrower_id`.
- `addPaymentToDcr` already refuses non-pending/confirmed payments (`posting.ts:1769`), which is correct for a bounced payment.

No reader breaks. Residual risk is limited to the screen-level changes in Audit finding 6, which are verified by the smoke tests.

Not applicable: RLS/permission changes (none touched), migrations (CHECK already allows `'rejected'`), per-segment variants (the logic is segment-agnostic).
