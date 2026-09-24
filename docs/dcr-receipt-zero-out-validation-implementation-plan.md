# DCR Receipt Zero-Out Validation Implementation Plan

**Goal:** A Collector (or Remedial officer) cannot submit a manually-adjusted payment allocation that leaves money unapplied while a still-open installment on the same account could have absorbed it — the "₱58,000 receipt, only ₱20,000 applied" scenario becomes a blocked submission with a clear reason, not a silent leftover line.

**Root cause:** The system already auto-spreads a payment across every open installment oldest-first (`computeAutoAllocation`, `src/lib/ar/posting.ts:41-71`) and pre-checks the resulting rows in the allocation modal (`openAllocationModal`, `src/app/collector/dcr/page.tsx:373-450`). The bug scenario only happens when a Collector then **manually unchecks or reduces** one of those pre-filled rows — nothing currently stops them from doing that and submitting anyway. Server-side, `validateAllocationLines` (`posting.ts:264-308`) only checks that `sum(allocations) === payment.amount` — which is always true by construction, because the client auto-appends a null-schedule "leftover" line for whatever isn't checked (`confirmAddToDcr`, `page.tsx:542-564`). Total-matching was never the missing guard; a **capacity-based** guard is.

**Approach:** Add one new check inside the already-shared `validateAllocationLines` (called from the single `addPaymentToDcr` function that both `/api/collector/dcr`'s Collector and Remedial callers use — confirmed one code path, not two): when the submitted allocations include a nonzero null-schedule ("leftover") line, fetch every open installment on the account, net out what's already claimed by *another* unposted DCR (mirroring the existing Task-4 duplicate-allocation logic), and if any of them still has unclaimed capacity the submission didn't use, reject with a clear error. Explicitly exempt Move of Payment surcharge payments, which are a different, already-correct feature that *deliberately* sends 100% as an unapplied leftover line by design — this guard must not break that. Mirror the identical check + UI disablement on the client side, in both places this modal is duplicated (`src/app/collector/dcr/page.tsx` and `src/app/remedial/dcr/page.tsx`).

**Tech stack:** Next.js (App Router) + TypeScript, Supabase Postgres, `node --test` on `.mts` files (`package.json:10`).

**Source:** UAT #60/#63, 2026-09-23 session, tracked at `docs/uat-issues-2026-09-23.md` item 1. Client, quoted in the transcript: *"Dapat may blocker yan na hindi siya mag-continue na hindi naubos yung balance"* (there should be a blocker so it does not continue if the balance is not fully consumed) — a hard block, not a warning that can be dismissed.

## Open questions (resolve before implementing)

None. The scope was narrowed and confirmed in the prior session: hard block (per the quoted client statement above), server-side authoritative (not just a UI disable), no separate advance-balance tracking feature — this plan only prevents *avoidable* leftover, it does not change what happens on the legitimate-prepayment path (see Audit finding 4).

---

## Live database/system validation: 2026-09-24

Read-only code reads only for this item (no new Supabase queries needed beyond what was already run for the prior tracker item this session — the relevant tables, `dcr_items`/`dcr_item_allocations`/`amortization_schedules`/`payments`, were already inspected in this session's earlier work on the same DCR/AR surface).

- **`computeAutoAllocation`** (`posting.ts:41-71`): fills oldest-open-installment-first up to each row's `netInstallmentDue`, and only appends a trailing null-schedule line "when money remains after all open installments are covered" — confirmed by its own docstring and body. This is why the bug cannot originate from the *default*, un-edited allocation: it is structurally impossible for `computeAutoAllocation` to leave unused capacity while producing a leftover line.
- **`/api/collector/dcr/allocation-preview`** (`route.ts`): fetches every `amortization_schedules` row with `status in (pending, partial, overdue)` for the account (not just the next-due one), runs `computeAutoAllocation` over all of them, and returns the full list plus the pre-computed allocation. The modal's rows (`openAllocationModal`, `page.tsx:410-429`) are built by pre-checking whichever rows `computeAutoAllocation` picked, with `amount: allocated ?? installmentRemainingDue(inst)` — i.e. an unchecked row still carries its full remaining-due as the default amount if the Collector re-checks it, and a checked row starts at its auto-filled amount. **Every open installment is present in the modal and editable**, which is what makes the "just didn't check enough rows" failure mode reachable in the first place.
- **`installmentFreeToAllocate(row)`** (`page.tsx:88-90`, and duplicated verbatim at `src/app/remedial/dcr/page.tsx:87-89`): `max(0, installmentRemainingDue(row) - row.pendingElsewhere)` — remaining capacity on a row net of what's already posted *and* net of what another unposted DCR has already claimed (Task 4's duplicate-allocation guard, `src/lib/ar/duplicate-dcr.ts`). This is the exact per-row "still has capacity" signal this plan needs, and it already exists client-side; the new work is (a) acting on it (block, not just display) and (b) the server-side equivalent, which does not exist yet.
- **`validateAllocationLines`** (`posting.ts:264-308`): only checks `sum(allocations) === payment.amount` and that each referenced schedule belongs to the account and isn't `paid`/`rolled`. It never looks at installments the caller *didn't* reference at all — so a manual submission that simply omits a still-open installment from `allocations` passes today with no error.
- **Call-site discipline already documented in code** (`addPaymentToDcr`, `posting.ts:1622-1634`, comment): *"The manual-allocation branch must call `validateAllocationLines` as its very first action, with no client creation or query before it... caught by the existing test suite"* — a 2026-09-15 regression note. This plan's new check is added **inside** `validateAllocationLines` itself (which already performs its own queries), so `validateAllocationLines` remains the first thing `addPaymentToDcr` does in the manual branch — the documented contract is preserved, not violated.
- **One shared code path for Collector and Remedial, confirmed by grep**: `src/app/remedial/dcr/page.tsx` calls `fetch("/api/collector/dcr", ...)` for add-item/submit (lines 390, 569, 603) — there is no separate `/api/remedial/dcr` route. `src/app/api/collector/dcr/route.ts` calls `addPaymentToDcr` (line 153), which is the single function both roles' UI ultimately hits. **A server-side fix in `validateAllocationLines` protects both roles automatically; the client-side UI guard must still be duplicated in both page files, since they are separately-maintained copies of the same modal (pre-existing duplication, not introduced by this plan).**
- **Move of Payment surcharge exemption — a real, already-shipped variant that must not be broken.** `allocation-preview/route.ts`: *"a Move of Payment surcharge must not pay down any installment. Default it to a single fully-unapplied line."* `isSurcharge = Boolean(payment.move_of_payment_batch_id)`. For a surcharge payment, the **entire amount is meant to be the leftover/null-schedule line, always** — this is correct, existing, intentional behavior (Fixes Plan Phase 3, Issue 5), not the bug this plan targets. `validateAllocationLines` currently receives only `paymentAmount`, not the payment row, so it has no way to know a payment is a surcharge — **this must be threaded through**, or the new guard will incorrectly block every Move of Payment surcharge.
- **Existing test file and stub pattern** (`src/lib/ar/__tests__/posting.test.mts`, `describe("addPaymentToDcr", ...)`, line 320 on): `makeAddStub()` already stubs `amortization_schedules` for both query shapes `validateAllocationLines` and `fetchOpenInstallments` use (`.select().eq().in()` and `.select().eq().in().order()`); `makeDupServiceStub()`/`makeLoaderStub()` already stub the pending-elsewhere duplicate lookup used by `loadPendingAllocationsForAccount`. No new stub infrastructure is needed — this plan's tests extend the existing `describe("addPaymentToDcr", ...)` block using the same helpers.
- **Test runner** (`package.json:10`): `"test": "node --import tsx --test \"src/lib/**/__tests__/*.mts\""`.

## Audit findings

1. **Existing representation of "leftover/advance" is the null-schedule `AllocationLine`** (`amortizationScheduleId: null`). No separate concept or table exists for it (confirmed in the prior tracker item's research this session) — this plan does not add one; it only decides, at validation time, whether that line is *legitimate* (no capacity left) or *avoidable* (capacity existed and wasn't used).
2. **Every writer of `dcr_item_allocations`:** exactly one function, `addPaymentToDcr` → the RPC/insert path following `validateAllocationLines`/`computeAutoAllocation`. No other writer exists (this matches the pattern already established for the sibling AR audit item done earlier this session).
3. **Every caller of `addPaymentToDcr`'s manual-allocation branch:** the single `POST /api/collector/dcr` route's `add_item` action (`route.ts:153`), reached from two separate frontend pages (`collector/dcr/page.tsx`, `remedial/dcr/page.tsx`) that both build an `allocations` array client-side via `confirmAddToDcr`.
4. **The legitimate no-block case, precisely defined.** When the sum of every open installment's `installmentFreeToAllocate` (net of postings *and* net of another unposted DCR's claim) is zero, a nonzero leftover line is a genuine prepayment/advance (all open obligations already fully allocated) — this plan must not block that case. This matches the client's own description in the transcript of a legitimate advance scenario ("kung ano yung natira, pwede ibayad sa iba pang month" — implying the *only* acceptable leftover is one with nowhere left to apply it).
5. **Variant/exemption table:**

   | Variant | Should the new guard block leftover? | Why |
   | --- | --- | --- |
   | Manual allocation, capacity exists elsewhere on the account, left unchecked | Yes | The exact reported bug |
   | Manual allocation, every open installment already fully allocated (real prepayment) | No | Legitimate advance, per Audit finding 4 |
   | Auto-allocation (no `allocations` passed, Collector adds without opening the modal's manual edit) | N/A — cannot happen | `computeAutoAllocation` structurally cannot leave capacity unused (Live validation, `computeAutoAllocation` bullet) |
   | Move of Payment surcharge payment | No — always exempt | Deliberately 100%-unapplied by design (Live validation, surcharge bullet); this is a different, already-correct feature |
   | Installment fully claimed by another unposted DCR (Task 4 duplicate scenario) | No, for that installment | Already correctly excluded from "free capacity" by the existing `pendingElsewhere` netting; this plan reuses that logic, does not re-litigate it |
   | Remedial-side submission | Yes, same as Collector | Same server function (`addPaymentToDcr`/`validateAllocationLines`), confirmed one shared code path |

---

## Scope and constraints

### In scope
- New capacity check inside `validateAllocationLines` (`posting.ts`), gated to only run when the submitted `allocations` include a nonzero null-schedule line, and skipped entirely for Move of Payment surcharge payments.
- Threading `isSurcharge` (derived from `payments.move_of_payment_batch_id`, already fetched in `addPaymentToDcr`) into `validateAllocationLines`.
- Mirrored client-side guard (compute total remaining capacity across all modal rows; disable "Add to DCRR" and show an explanatory message when leftover > 0 and capacity > 0) in both `src/app/collector/dcr/page.tsx` and `src/app/remedial/dcr/page.tsx`.
- New `.mts` tests in the existing `describe("addPaymentToDcr", ...)` block.

### Out of scope: do not change
- `computeAutoAllocation` itself — already correct, not touched.
- Any advance-balance tracking table/ledger visibility for AR (that was explicitly deferred as a separate, larger question in the prior version of this tracker item's research; this plan only prevents the *avoidable* leftover from being created in the first place, which — per the client's own framing — was the actual ask, not a request to build advance tracking).
- The Move of Payment surcharge flow itself — only exempted from this new guard, not otherwise touched.
- `submitDcr` / the DCR-level submit-to-AR step and its existing Task-4 duplicate backstop (`posting.ts`, `describe("submitDcr — Task 4 duplicate backstop", ...)`) — this plan operates at the per-item `add_item` step, before an item ever reaches a submittable DCR.

### Non-negotiable safety constraints
- The check is server-side and authoritative in `validateAllocationLines` — the client-side disablement is a UX convenience only, not the security/data-integrity boundary (consistent with this project's stated rule that a hidden/disabled UI control is never a boundary).
- No change to `dcr_item_allocations`' insert shape or to `post_single_dcr_item`'s RPC — this is purely a pre-insert validation gate.
- Rounding: use the codebase's existing `halfUp` for every peso comparison (matches every other money comparison in `posting.ts`), no new rounding scheme.

### Contract

`validateAllocationLines(supabase, masterlistId, paymentAmount, allocations, isSurcharge)` — new required parameter. Throws `Error` with a message naming the reason (e.g. "Allocation leaves ₱X unapplied while installment #N still has ₱Y of open capacity — apply it there or confirm no more capacity remains") when the guard fires; otherwise behaves exactly as today.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path — auto-allocation, no manual edits | Collector | Add payment to DCR without editing checked rows | Unchanged — no leftover line is ever produced, guard never triggers |
| The reported bug — manual uncheck leaves capacity elsewhere | Collector | ₱58,000 payment, only ₱20,000 checked, another open installment with ₱30,000+ free capacity exists | Rejected with a clear error naming the installment; `add_item` does not succeed |
| Legitimate full prepayment | Collector | Payment exceeds the sum of every open installment's remaining due | Leftover line accepted, unchanged from today |
| Move of Payment surcharge | Collector | Surcharge payment, single fully-unapplied line (existing default) | Accepted, unchanged from today — guard exempts it by `isSurcharge` |
| Installment already fully claimed by another unposted DCR | Collector | Leftover exists, but the only "open" installment is 100% claimed elsewhere | Accepted — that installment contributes 0 free capacity, matching existing Task-4 netting |
| Same scenario, Remedial officer | Remedial | Same as the bug case above, via Remedial's DCR screen | Rejected identically — same server function |
| Direct API call bypassing the UI | Any authenticated Collector/Remedial user, raw `POST /api/collector/dcr` with a hand-built `allocations` array that skips an open installment | POST | Rejected by `validateAllocationLines` regardless of what the UI would have shown — this is the actual boundary |
| Zero leftover (fully applied) | Collector/Remedial | Checked rows sum exactly to payment amount | Guard never runs (only triggers when a nonzero null-schedule line exists) |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/ar/posting.ts` | `validateAllocationLines` gains an `isSurcharge` param and the new capacity check; `addPaymentToDcr`'s payment fetch (`:1595-1599`) selects `move_of_payment_batch_id` and passes `isSurcharge` through at its `validateAllocationLines` call (`:1638-1643`) | Server-side authoritative guard |
| `src/app/collector/dcr/page.tsx` | New computed `allocationUnusedCapacity`; extend the existing `disabled={allocationMismatch \|\| discountReasonMissing}` and the mismatch-styled summary/message block to also cover this case | Collector UI guard |
| `src/app/remedial/dcr/page.tsx` | Identical mirrored change to the same lines in this duplicated file | Remedial UI guard |
| `src/lib/ar/__tests__/posting.test.mts` | New tests in `describe("addPaymentToDcr", ...)` | Coverage |

## Phase 0: Failing tests first

### Task 0.1: Server-side guard, the reported bug scenario
**File:** `src/lib/ar/__tests__/posting.test.mts`
- [ ] Add a test using `makeAddStub` with two open schedules (e.g. `s1`: due 20000, `s2`: due 20000, `s3`: due 18000, all `pending`, `masterlist_id: "ml-1"`), calling `addPaymentToDcr(supabase, "dcr-1", "pay-1", "collector-1", [{ amortizationScheduleId: "s1", amount: 20000 }, { amortizationScheduleId: null, amount: 38000 }])` with `paymentAmount: 58000`.
- [ ] Assert it rejects with a message matching `/still has|open capacity|unapplied/i`.
- [ ] Run: `npm test`
- [ ] Expected: FAIL — today this submission succeeds (only the total-match check exists).

### Task 0.2: Legitimate prepayment is not blocked
**File:** same file
- [ ] Add a test with a single open schedule fully covered by the checked allocation plus a leftover line that exceeds it (e.g. schedule `amount_due: 20000`, allocation `[{schedule, amount: 20000}, {null, amount: 5000}]`).
- [ ] Assert `addPaymentToDcr` resolves without throwing.
- [ ] Run: `npm test` → Expected: PASS already today (regression guard for Phase 1 to not over-block).

### Task 0.3: Move of Payment surcharge is exempt
**File:** same file
- [ ] Add a test where `isSurcharge` would be `true` (payment row includes `move_of_payment_batch_id`), single fully-unapplied allocation line, with an open schedule elsewhere that has free capacity.
- [ ] Assert it resolves without throwing.
- [ ] Run: `npm test` → Expected: PASS once Phase 1 threads `isSurcharge` through; document that without Phase 1 this test cannot yet distinguish (the `isSurcharge` plumbing doesn't exist until Phase 1, so this test is written now but only becomes meaningful — and passes — after Phase 1's signature change compiles).

## Phase 1: Server-side capacity guard

### Task 1.1: Thread `isSurcharge` and add the capacity check
**File:** `src/lib/ar/posting.ts`
- [ ] Change `validateAllocationLines`'s signature to accept a fifth param `isSurcharge: boolean`, **and a sixth optional `serviceClient?: SupabaseClient`** (implementation correction, found during Phase 0: the literal snippet below calls `createServiceClient()` directly, which is untestable — mirror `addPaymentToDcr`'s own existing `serviceClient` param instead, so tests can inject a stub the same way the auto-allocation branch already does).
- [ ] After the existing total-match check (`:274-278`) and before the per-schedule ownership loop, add:
  ```ts
  const leftoverLine = allocations.find((line) => line.amortizationScheduleId === null);
  if (leftoverLine && leftoverLine.amount > 0 && !isSurcharge) {
    const [openInstallments, pendingRaw] = await Promise.all([
      fetchOpenInstallments(supabase, masterlistId),
      loadPendingAllocationsForAccount(
        serviceClient ?? createServiceClient(),
        masterlistId,
      ),
    ]);
    const claimedByThisSubmission = new Map(
      allocations
        .filter((l) => l.amortizationScheduleId !== null)
        .map((l) => [l.amortizationScheduleId as string, l.amount]),
    );
    let unusedCapacity = 0;
    for (const inst of openInstallments) {
      const remainingDue = netInstallmentDue({
        amountDue: inst.amountDue,
        discountAmount: inst.discountAmount,
        penaltyAmount: inst.penaltyAmount,
        amountPaid: inst.amountPaid,
      });
      const pendingElsewhere = pendingRaw[inst.id]?.amount ?? 0;
      const freeCapacity = Math.max(0, halfUp(remainingDue - pendingElsewhere));
      const usedByThisSubmission = claimedByThisSubmission.get(inst.id) ?? 0;
      unusedCapacity = halfUp(unusedCapacity + Math.max(0, freeCapacity - usedByThisSubmission));
    }
    if (unusedCapacity > 0) {
      throw new Error(
        `Allocation leaves ₱${leftoverLine.amount.toFixed(2)} unapplied while ₱${unusedCapacity.toFixed(2)} of open installment capacity is still available on this account — apply it to an open installment before adding to the DCRR.`,
      );
    }
  }
  ```
  This mirrors the client's `installmentFreeToAllocate` calculation exactly, server-side, reusing the already-imported `fetchOpenInstallments`, `loadPendingAllocationsForAccount`, `netInstallmentDue`, `halfUp`, and `createServiceClient` — no new imports needed (all already imported in this file per the existing `addPaymentToDcr` auto-allocation branch).
- [ ] Update `addPaymentToDcr`'s payment fetch (`:1595-1599`) to also select `move_of_payment_batch_id`, and its `validateAllocationLines` call (`:1638-1643`) to pass `Boolean(payment.move_of_payment_batch_id)` and its own existing `serviceClient` param through as the new arguments.
- [ ] Run: `npm test` → Task 0.1, 0.2, and 0.3 all pass; run the full suite to confirm no existing `addPaymentToDcr`/`submitDcr` test regresses (in particular the Task-4 duplicate-allocation tests, since this reuses the same `loadPendingAllocationsForAccount` data).
- [ ] Run: `npx tsc --noEmit` → clean.

**Phase constraints:** `validateAllocationLines` must still be the first action `addPaymentToDcr` takes in the manual-allocation branch (per the 2026-09-15 contract comment at `:1622-1634`) — this task adds queries *inside* that function, not before the call to it, so the contract holds.

## Phase 2: Client-side guard (Collector)

### Task 2.1: Mirror the capacity check for UI disablement
**File:** `src/app/collector/dcr/page.tsx`
- [ ] Add a computed value alongside `allocationMismatch` (`:269`):
  ```ts
  const allocationUnusedCapacity = useMemo(() => {
    if (!allocationModal || allocationModal.isSurcharge) return 0;
    return halfUp(
      allocationModal.rows.reduce((sum, row) => {
        const free = installmentFreeToAllocate(row);
        const used = row.checked ? row.amount : 0;
        return sum + Math.max(0, halfUp(free - used));
      }, 0),
    );
  }, [allocationModal]);
  const allocationBlocked = allocationLeftover > 0 && allocationUnusedCapacity > 0;
  ```
- [ ] Update the "Add to DCRR" button's `disabled` prop (`:936`) to `disabled={allocationMismatch || allocationBlocked || discountReasonMissing}`.
- [ ] Add a visible message near the existing `{allocationMismatch ? (...) : null}` block (`:986`) for the new case, e.g. "₱X is still unapplied while another installment has capacity — check it or adjust the amount before continuing," styled the same way the mismatch message is (reuse the existing red/warning treatment, don't invent a new one).
- [ ] Add the same guard at the top of `confirmAddToDcr` (`:542`): `if (allocationBlocked) return;` (defense in depth alongside the disabled button, consistent with how `discountReasonMissing` is already checked both in the disabled prop and inside the handler at `:566`).
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: open the allocation modal for a payment large enough to span two installments, uncheck the second one, confirm "Add to DCRR" is disabled and the message appears; re-check it, confirm the button re-enables.

**Phase constraints:** No change to `allocationMismatch`'s own meaning (over-allocation) — this is an additional, independent condition, not a replacement.

## Phase 3: Client-side guard (Remedial)

### Task 3.1: Identical mirrored change
**File:** `src/app/remedial/dcr/page.tsx`
- [ ] Apply the exact same edit as Task 2.1 to this file's copy of the same state/handlers (confirmed identical duplication: `allocationMismatch` at `:374`, button `disabled` at `:901`, message block at `:941`, `confirmAddToDcr` at `:516`).
- [ ] **Implementation correction, found during Phase 3:** this file's `AllocationModalState` type never carried `isSurcharge` at all (unlike the Collector page) — the shared `/api/collector/dcr/allocation-preview` response's `isSurcharge` field was simply dropped when parsed here. Add `isSurcharge: boolean` to the type, parse `isSurcharge?: boolean` from the preview response, and set it on `setAllocationModal(...)`, matching the Collector page exactly. Without this, the new capacity guard would have no way to exempt a surcharge payment reached via the Remedial screen, and would incorrectly block a legitimate Move of Payment surcharge there even though the server-side guard (which reads `payment.move_of_payment_batch_id` directly, independent of which UI submitted it) would have allowed it — a client/server behavior mismatch, not just a missing feature.
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: same as Task 2.1's, performed as a Remedial officer on an assigned account.

**Phase constraints:** Keep both files' copies of this logic textually identical in shape, since that is already the existing convention for this duplicated modal (not introducing a shared component in this plan — that would be a larger refactor outside this item's scope).

## Phase last: Regression verification and rollout

- [ ] `npm test` — full suite, expect prior pass count (1898, per this session's last full run) plus the new Phase 0 tests, 0 fail.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint src/lib/ar/posting.ts src/app/collector/dcr/page.tsx src/app/remedial/dcr/page.tsx src/lib/ar/__tests__/posting.test.mts` — clean (no new errors on touched files; pre-existing unrelated lint debt elsewhere in the repo, confirmed present in this session's earlier work, is out of scope).
- [ ] `npm run build` — clean.
- [ ] Smoke-test table:

  | Role | Scenario | Action | Expected |
  | --- | --- | --- | --- |
  | Collector | Auto-allocation, untouched | Add payment to DCR | Unchanged — no leftover ever produced |
  | Collector | Manually uncheck a row with capacity elsewhere | Try "Add to DCRR" | Blocked, message shown |
  | Collector | Genuine full prepayment (all installments covered, real excess) | Add to DCR | Allowed, unchanged |
  | Collector | Move of Payment surcharge | Add to DCR | Allowed, unchanged |
  | Remedial | Same "manually uncheck" scenario on a turned-over account | Try "Add to DCRR" | Blocked, identically |
  | Any | Direct `POST /api/collector/dcr` bypassing the UI with an incomplete `allocations` array | POST | Rejected server-side regardless of UI state |

## Rollback

1. If the new guard produces false positives on a real account (e.g. an edge case in the pending-elsewhere netting not covered by this plan's tests): revert Phase 1's change in `posting.ts` via a new commit (not editing history) — the guard is additive to `validateAllocationLines`, so reverting it restores exactly today's behavior with no data cleanup needed, since this phase never wrote any data differently, only validated before the existing write path.
2. Phases 2–3 (UI) can be reverted independently of Phase 1 without reintroducing the bug at the API layer, since Phase 1 is the authoritative boundary.
3. No migration, no schema change — nothing to roll back at the database level.

## Commit

```
git add src/lib/ar/posting.ts \
        src/app/collector/dcr/page.tsx \
        "src/app/remedial/dcr/page.tsx" \
        src/lib/ar/__tests__/posting.test.mts
```

Message: `fix(ar): block a DCR item when unapplied leftover exists while an open installment still has capacity`

## Self-review

1. **Contradictions:** "In scope" adds a capacity check; "Out of scope" explicitly excludes `computeAutoAllocation` and the surcharge flow from being touched, and the guard itself is built to exempt surcharges (Task 1.1) — no contradiction between the exemption and the "In scope" capacity check, since the exemption is a condition *within* the new check, not a separate untouched path left vulnerable.
2. **Goal reachability:** For existing/live accounts, the check runs against real `amortization_schedules`/`dcr_item_allocations` state at submit time, so it applies uniformly to every account, not just ones created after this ships. For every creation path: confirmed there is exactly one (`addPaymentToDcr`'s manual-allocation branch), reached identically by Collector and Remedial (Audit finding 3), so both are covered by the single server-side change.
3. **Bypass:** Contract table explicitly covers "direct API call bypassing the UI" — the guard lives in `validateAllocationLines`, called unconditionally whenever `allocations` is supplied to `addPaymentToDcr`, regardless of which frontend (or a raw request) produced it.
4. **Existence:** Every function, file, and line reference in this plan was read live in this session (`posting.ts`, both `dcr/page.tsx` files, `allocation-preview/route.ts`, `posting.test.mts`) — nothing named was guessed.
5. **Consistency:** Files table lists 4 files; Phase tasks touch exactly those 4; Commit's `git add` list matches exactly.
6. **Duplication:** Deliberately did *not* extract the duplicated Collector/Remedial modal logic into a shared component in this plan — flagged explicitly in Phase 3's constraints as pre-existing duplication kept as-is, not newly introduced, to keep this plan scoped to the validation bug rather than a larger refactor.
7. **Placeholders:** None remaining — every code block is literal, every file path is exact.

**Audit-checklist sections not applicable:** "Check authorization at the database, per role" — this fix does not change who can write `dcr_item_allocations`, only what shape of write is accepted before the existing RLS/permission checks (already covering Collector vs. Remedial via the dual-module pattern used elsewhere in this codebase) are reached; no new RLS surface is introduced.
