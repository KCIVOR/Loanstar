# Task 4b — Collector never builds on a wrong balance (effective balance)

Follow-on to Task 4 ([task-04-duplicate-dcr-warn-block.md](task-04-duplicate-dcr-warn-block.md),
[task-04-duplicate-dcr-IMPLEMENTATION-plan.md](task-04-duplicate-dcr-IMPLEMENTATION-plan.md)).
Task 4 *warns/blocks* duplicates. This closes the underlying cause: the balance
the collector sees does not reflect payments already recorded but not yet posted
by Accounting, so they act on a number that's too high.

**Workflow:** Claude audits + plans → Cursor implements → summary validated. Do
not implement directly unless told otherwise.

**Status:** audit + plan. Not started. Best sequenced **after Task 4 Phases 1–3**
(shares the `src/lib/ar/duplicate-dcr.ts` module and the service-role
unposted-DCR lookup).

---

## Part A — Audit

### A.1 The two balances

| | Posted balance | Effective balance |
| :- | :- | :- |
| What | Money Accounting has officially accepted | Posted balance − everything recorded but not yet posted |
| Source | `masterlist.outstanding_balance`, updated only by `recomputeOutstandingBalance` at post time (`src/lib/ar/posting.ts:152`), which sums `netInstallmentDue` over non-terminal installments reading `amount_paid` (posted only) | computed at read time |
| Used by | ledger, reports (`reports/metrics/money.ts`), dashboards, aging — **must stay clean** | nothing today — this is the gap |
| Shown to collector | yes (the only number they see) | never |

`amount_paid` / installment `status` on `amortization_schedules` also only move
at post time (`postSingleDcrItem` ~`posting.ts:1129`). So both the account total
and every installment row over-state what's owed while a DCR is unposted.

### A.2 Where the collector sees the (posted-only) balance

| File | Line | Context |
| :- | :- | :- |
| `src/app/collector/accounts/page.tsx` | 647, 708 | accounts list |
| `src/app/collector/page.tsx` | 353 | collector dashboard |
| `src/components/payments/RecordPaymentPage.tsx` | 164 | record-payment header ("Outstanding ₱X") |
| `src/components/ledger/*` (AccountLedger) | — | per-installment "amount due / paid / remaining" |
| `src/app/remedial/accounts/[id]/page.tsx` | 258 | remedial account detail |
| `src/app/remedial/page.tsx` | 682, 764 | remedial list |
| `/api/collector/dcr/allocation-preview` + `computeAutoAllocation` | `posting.ts:36` | the DCR builder's auto-split |

### A.3 What "not yet posted" resolves to (same as Task 4)

- **Allocated pending** — `dcr_item_allocations.amount` where `dcr_items.status='pending'`
  and `dcr.status IN ('draft','submitted')`. Attributable to a specific
  installment (`amortization_schedule_id`).
- **Unallocated pending** — a `payments` row (`status IN ('pending_verification','confirmed')`,
  not on a posted item) that is **not yet in any DCR** → no allocation, so it
  reduces the *account* effective balance but can't be pinned to an installment.

Both must be reflected: per-installment where we can, account-level otherwise.

### A.4 RLS (verified in `pg_policies`, Task 4 audit)

A collector's own session sees **only their own** DCRs / items / allocations. A
conflicting or prior-assignee DCR is invisible. → the unposted-allocation lookup
**must use `createServiceClient()`** and **throw on error**, never silently
return zero (recurring silent-RLS-gap pattern —
[[project_collection_flow_alignment]]).

### A.5 Borrower portal

The client's complaint was about the *collector's* view. A borrower seeing
"pending" could be more confusing than helpful ("I paid — why does it still show
a balance?"). **This plan does not change the borrower portal** — open question
for the client (Part F).

---

## Part B — Design (Option A + Option B)

**Option A — show the effective balance everywhere the collector decides.**
Never overwrite `masterlist.outstanding_balance`. At read time compute and
display **both**:

> Balance (posted): **₱50,000**
> After pending payments: **₱41,000** — 2 payments (₱9,000) awaiting Accounting

Per installment: `₱5,000 due · ₱4,000 pending (DCR #123) · ₱1,000 remaining`.

**Option B — the DCR builder allocates against the effective remaining.**
Auto-allocation and allocation validation use *effective* per-installment
remaining (posted remaining − allocated pending), so a collector physically
cannot build a DCR line that over-covers an installment already covered by an
unposted DCR. A deliberate advance/overpayment stays possible via the existing
trailing `amortizationScheduleId: null` advance line.

**Not doing Option C** (a "reserved" state on `amortization_schedules`) — new
column + migration + every installment-status reader must handle it. Revisit
only if the client wants the stored installment ledger itself to carry pending.

**Hard rule:** the posted number is always shown and always labelled as the
authoritative one. "After pending" is secondary, always labelled, never the
figure a report or an audit answer is drawn from.

---

## Part C — Phased plan

### GLOBAL CONSTRAINTS

**Never touch:**
- `recomputeOutstandingBalance`, `postSingleDcrItem`, `reconcile*`, `reject*`,
  `settleDcrStatusIfComplete`, aging/penalty/rounding — the posted pipeline.
- `masterlist.outstanding_balance` writes, `amortization_schedules.amount_paid`
  / `status` writes — no new writer.
- Reports (`src/lib/reports/**`), dashboards' money aggregates, KPI math — they
  read the **posted** number and must keep doing so.
- Borrower portal balance/schedule display.
- The `AllocationLine` shape and the trailing advance-line behaviour of
  `computeAutoAllocation`.

**Rules:**
- Effective balance is **computed at read time only**. No migration. No backfill.
- Cross-DCR / cross-owner lookup = **service role, throw on error**.
- Pure math in `src/lib/ar/effective-balance.ts` + `.mts` tests; routes/UI call it.
- Reuse Task 4's `duplicate-dcr.ts` unposted-DCR query rather than a 2nd copy.
- Every UI change shows posted **and** effective, both labelled. Never replace.

---

### Phase 1 — Pure effective-balance helpers

**Create:** `src/lib/ar/effective-balance.ts` + `__tests__/effective-balance.test.mts`.

- `deriveEffectiveBalance(input)` — pure. Given:
  - `postedInstallments`: `{ id, netRemaining }[]` (netRemaining from
    `netInstallmentDue`, posted `amount_paid`)
  - `allocatedPendingByScheduleId`: `Map<string, number>`
  - `unallocatedPendingTotal`: number
  returns:
  ```ts
  {
    postedTotal: number,
    effectiveTotal: number,               // max(0, postedTotal − allocatedPending − unallocatedPending)
    perInstallment: { id, netRemaining, pendingApplied, effectiveRemaining }[],
    pendingAllocatedTotal: number,
    pendingUnallocatedTotal: number,
  }
  ```
  Floors every installment and the total at 0. Does **not** invent negative
  advances.
- Unit tests: no pending; one allocated-pending installment; over-allocated
  pending (floors at 0); unallocated-only pending; mixed; rejected/posted
  excluded by construction (caller filters).

**Done when:** tests pass; nothing imports it yet.

---

### Phase 2 — One server helper to assemble the inputs

**Create:** `getAccountEffectiveBalance(admin, masterlistId)` in
`src/lib/ar/effective-balance.ts` (service client param, like Task 4's
`loadClaimedScheduleIds`).

- posted installments: reuse `fetchOpenInstallments` (already returns the
  fields) — or a direct select mirroring `recomputeOutstandingBalance`'s filter
  (`status not in (paid,rolled,moved)`).
- allocated pending: reuse Task 4's unposted-DCR-allocation query, grouped
  `Map<amortization_schedule_id, sum(amount)>`.
- unallocated pending: `payments` for this `masterlist_id`,
  `status IN ('pending_verification','confirmed')`, minus those whose
  `payment_id` is on any **non-rejected** `dcr_item` — i.e. recorded, not yet
  batched. (`payments.status='posted'` is authoritative for "already on the
  ledger" — set by the `post_single_dcr_item` RPC,
  `migrations/20260831110000_...:103` — so no join is needed to exclude posted
  ones; the join above is only to tell *unallocated* pending from *allocated*
  pending.)
- call `deriveEffectiveBalance`.
- **Throws** on any query error.

**Done when:** returns a correct object for a hand-seeded account in a REPL /
targeted test; no route wired yet.

---

### Phase 3 — Surface it on the record-payment screen

**Touch:** `src/app/api/collector/accounts/[id]/route.ts`,
`src/components/payments/RecordPaymentPage.tsx`, `RecordPaymentForm.tsx` header.

- Route: add `effectiveBalance: getAccountEffectiveBalance(admin, id)` to the
  response (additive; existing `account`/`schedules`/`payments` unchanged).
- `RecordPaymentPage` header: show both numbers —
  `Outstanding ₱50,000 (posted) · ₱41,000 after 2 pending`.
- The ledger table: add a `Pending` / `Remaining after pending` column, per
  installment, from `perInstallment`.
- Ties into Task 4 Phase 2's warning (same data) — render them together.

**Done when:** the record screen shows posted + effective + per-installment
pending; a clean account shows only the posted number (effective == posted).

---

### Phase 4 — Effective allocation in the DCR builder (Option B)

**Touch:** `src/lib/ar/posting.ts` — add an **effective** open-installments
variant used only by the builder; `computeAutoAllocation` call sites in the
DCR add path and `/api/collector/dcr/allocation-preview`.

- New `fetchEffectiveOpenInstallments(admin, masterlistId)` = `fetchOpenInstallments`
  minus allocated-pending per row (floored at 0). **Do not modify
  `fetchOpenInstallments` itself** — `recomputeOutstandingBalance` and other
  callers must keep the posted view.
- `addPaymentToDcr`'s auto-allocation branch (`posting.ts` ~1566, the
  `else { const openInstallments = await fetchOpenInstallments(...) }` path)
  uses the effective variant.
- `allocation-preview` route uses the effective variant so the preview matches.
- A deliberate advance is still expressible (trailing `null` line) — keep that
  path.

> **Verified — a subtlety for `validateAllocationLines`
> (`posting.ts:219`):** today it checks only (a) allocation total == payment
> amount and (b) each installment belongs to the account and isn't
> `paid`/`rolled`. **It does NOT cap a line at the installment's remaining
> due** — a manual allocation of ₱10,000 onto an installment that owes ₱5,000
> is currently *allowed* (the ₱5,000 excess floors to 0 downstream via
> `netInstallmentDue`). So adding an "effective remaining" cap here is a
> **new restriction on manual allocation that also newly caps against the
> posted remaining**, not just the effective one.
>
> **Recommendation:** in this phase, apply the effective cap only to the
> **auto-allocation** path (`computeAutoAllocation` already caps each line at
> `remainingDue`, so feeding it effective installments is a clean, in-spirit
> change). Treat a *manual*-allocation cap as a **separate, explicit
> decision** — it's a real behaviour change (blocks deliberate single-
> installment overpayment) and belongs with the client questions in Part F,
> not silently bundled here.

**Done when:** auto-allocating a payment on an account with an unposted DCR
covering installment #3 skips #3 (0 effective remaining) and moves to #4 /
advance; an account with no pending allocates exactly as today (regression);
manual allocation behaviour is unchanged unless the separate manual-cap
decision is taken.

---

### Phase 5 — Accounts list + dashboard + remedial

**Touch:** `src/app/api/collector/accounts/route.ts` (+ remedial equivalent),
`src/lib/collector/queue.ts` (type only), `collector/accounts/page.tsx`,
`collector/page.tsx`, `remedial/*`.

- Accounts list route: one grouped follow-up (mirroring Task 4 Phase 4's
  pending-count query) that also sums allocated + unallocated pending per
  account → `effectiveBalance?: number` + `pendingTotal?: number` on the mapped
  row. **No change to the `masterlist` select / filters / sort / pagination /
  KPI math** — KPIs keep using the posted `outstandingBalance`.
- List UI: show `₱50,000` with a muted `→ ₱41,000 after pending` beneath, only
  when `pendingTotal > 0`.
- Remedial list + detail: same.

**Done when:** the list shows both figures where pending exists; KPIs, filters,
sort unchanged.

---

### Phase 6 — Tests + regression

- Phase 1 helper tests (there).
- `posting.ts`: `fetchEffectiveOpenInstallments` reduces the right rows;
  `computeAutoAllocation` fed effective installments skips a fully-pending one
  and rolls into the next / advance line.
- Assert **`recomputeOutstandingBalance` output is unchanged** for an account
  with pending DCRs (the posted number must not move).
- Assert **`validateAllocationLines` behaviour is unchanged** (manual
  allocation path untouched unless the Part F #6 decision is taken).
- `npm test` green; `tsc`; `build`; `eslint` on touched files.
- Manual/QA: the two-number display on every screen in A.2; report totals
  unaffected.

---

### Phase 7 — Client review

Demo: account with ₱50k posted, ₱9k recorded-unposted → collector sees ₱41k
"after pending" and cannot allocate a new DCR line onto an already-covered
installment. Confirm:
- both numbers shown, posted labelled authoritative — acceptable?
- should the **borrower portal** show anything about pending? (default: no)
- should a **rejected** pending payment visibly bounce the effective balance
  back up (it will — is that wording OK)?

---

## Part D — Constraints quick-reference

| Area | Rule |
| :- | :- |
| `recomputeOutstandingBalance` / posted ledger / `amount_paid` / installment `status` | untouched — no new writer |
| Reports, dashboard money aggregates, KPIs | keep reading the **posted** number |
| `fetchOpenInstallments`, `computeAutoAllocation` shape | unchanged — add a `fetchEffectiveOpenInstallments` *alongside*; feed it into the **auto**-allocation path only |
| `validateAllocationLines` | **unchanged** — manual-allocation path is not touched by default (see Part F #6); it has no per-installment cap today |
| Borrower portal | untouched (open question) |
| `masterlist.outstanding_balance` | never written by this task |
| effective balance | computed at read time only, **no migration**, no backfill |
| cross-DCR / cross-owner lookup | service role, throw on error |
| every balance UI | show posted **and** effective, both labelled; never replace |
| pure math | `src/lib/ar/effective-balance.ts` + `.mts` tests |
| Supabase MCP | `pg_policies` reads only, no data mutation |

---

## Part E — Sequencing with Task 4

- Task 4 Phase 1 (`duplicate-dcr.ts`) and Phase 3's `loadClaimedScheduleIds`
  (service-role unposted-DCR-allocation query) are **prerequisites** — 4b reuses
  that exact query for "allocated pending".
- Do Task 4 Phases 1–3 first, then 4b Phases 1–5, then Task 4 Phase 4
  (indicator) and 4b Phase 5 (two-number list) can ship together.
- 4b Phase 4 (effective allocation) makes Task 4 Phase 3's same-installment
  block partly redundant for the auto-allocation path — keep **both**: Phase 3
  is the hard stop, Phase 4 is the "don't even offer it" guidance.

---

## Part F — Open questions for the client

1. Show **both** balances (posted + after-pending), posted labelled as
   authoritative — OK, or do they want just one?
2. Should the **DCR builder be unable** to allocate onto an already-covered
   installment (Option B), or only warned (Task 4 Phase 3 alone)?
3. Does the **borrower portal** show anything about pending payments? (default:
   no change)
4. A **rejected** pending payment makes the effective balance rise again —
   acceptable, and how should it be worded?
5. Same treatment for **Remedial**? (assumed yes)
6. **Manual-allocation cap:** today a collector can manually allocate *more*
   than an installment's remaining due (the excess floors to 0). Should Option B
   also stop that (block deliberate single-installment overpayment via manual
   split), or leave manual allocation as-is and only make auto-allocation
   effective-aware? Default in this plan: **leave manual alone**, auto only.

---

## Part G — Progress log

- 2026-09-08 — Audit + plan written (Claude). Depends on Task 4 Phases 1–3.
  Not started.
- 2026-09-08 — Validated against code (Claude). Confirmed: balance display
  sites, `recomputeOutstandingBalance` filter/formula, `fetchOpenInstallments`
  fields, `computeAutoAllocation` per-line cap + trailing advance, remedial has
  its own routes, RLS needs service role. **Corrections:** (1) `payments.status
  = 'posted'` is authoritative (RPC sets it — migration `20260831110000:103`),
  so no `dcr_items` join needed to exclude posted payments; (2)
  `validateAllocationLines` has **no** per-installment cap today, so an
  "effective" cap on the *manual* path is a genuine new restriction — moved to a
  Part F client question, Phase 4 now touches the **auto** path only.
