# Task 4 — Implementation plan: warn / block duplicate DCRs

Companion to the audit: [task-04-duplicate-dcr-warn-block.md](task-04-duplicate-dcr-warn-block.md).
That doc has the diagnosis + root cause. **This doc is the surgical, phase-by-phase
build sheet with hard constraints.**

**Workflow:** Claude plans → Cursor implements → summary validated. Do not
implement directly unless told otherwise.

**Verified facts this plan is built on** (re-checked in code + `pg_policies`):
- Only guard today: `addPaymentToDcr` (`src/lib/ar/posting.ts:1534-1548`) keyed
  on `payment_id`. Root cause of the demo miss.
- `submitDcr` = `src/lib/ar/posting.ts:1356`. `createDcrDraft` = `:1410`.
  `addPaymentToDcr` = `:1507`.
- `dcr` has **no** `masterlist_id` (spans accounts); `dcr_item_allocations.amortization_schedule_id`
  is the only payment→installment link; it only exists once a payment is added
  to a DCR.
- RLS: a collector's own session can SELECT **only their own** DCRs / items /
  allocations (`dcr_items_select`, `dcr_item_allocations_select` gate on
  `d.collector_user_id = auth.uid()`). A conflicting DCR left by a *previous*
  assignee is invisible to the current collector's session → **Phase 3's
  cross-DCR lookup MUST use `createServiceClient()`**.
- `payments_select` grants a collector broad read (`collection:view`), so the
  record-time summary (Phase 2) can use the request client.
- Accounts-list route (`src/app/api/collector/accounts/route.ts:150-166`)
  already does a grouped follow-up query (`collector_contacts`) — the pattern
  to copy for Phase 4, not N+1.

---

## GLOBAL CONSTRAINTS (apply to every phase)

### Never touch — the posting / balance pipeline
- `post_single_dcr_item` RPC and **all** its migrations
  (`20260831110000`, `20260831130000`, `20260903153000`).
- `reconcileDcrItem`, `reconcileAndPostDcr`, `rejectDcr`, `rejectDcrItem`,
  `settleDcrStatusIfComplete`, `postSingleDcrItem` (`posting.ts`).
- `recomputeOutstandingBalance`, `writeOffRoundingDifference`,
  `writeOffAccountRoundingDifference`, `refreshMasterlistAging`,
  `getPenaltyRate`, `getAgingThresholds`, `deriveInterestPerRow`,
  `isAccountFullySettled`.
- `computeAutoAllocation`, `fetchOpenInstallments`, `validateAllocationLines` —
  **reuse read-only, never modify**.
- The existing `alreadyBatched` (same-`payment_id`) block in `addPaymentToDcr` —
  leave it exactly as-is; the new check is **additional**, above or below it,
  never replacing it.

### Never change
- Any `status` vocabulary or lifecycle transition for `payments`, `dcr`,
  `dcr_items` (`draft/submitted/reconciled/rejected`,
  `pending_verification/confirmed/posted/rejected`, `pending/posted/rejected`).
- Collector Discount logic (`validateCollectorDiscountInput`,
  `interest_discount_*`, `penalty_discount_*`).
- Move-of-Payment (`move_of_payment_*`), PDC checks, reminders, aging cron.
- The 2 unrelated `RecordPaymentForm` fields' behaviour, proof upload,
  `assertPaymentProofPathOwnedByBorrower`.
- Remedial's own routes' *existing* behaviour (Phase 6 only *adds* the same
  surfacing).

### Data / tooling
- **No schema migration** unless Phase 3's query plan shows a seq scan on a
  large table (then: optional indexes only, two-folder convention, applied via
  Supabase MCP — see [[project_document_template_system]] p8 note).
- **No `execute_sql` / `apply_migration` data mutation** during implementation.
  `pg_policies` reads only.
- **No backfill.** Forward-looking; existing unposted DCRs just start counting.
- New permission `collection:dcr_duplicate_override` is a **role/field-rule seed
  row**, added the way other `collection` field rules were — not an app-table
  migration.

### Discipline
- Every new cross-row lookup **fails loud** (throws on query error) or **uses
  service role** — never `?? []` swallowing an RLS/error miss into "no
  duplicates" (this is the recurring silent-RLS-gap pattern —
  [[project_committee_flow_alignment]], [[project_collection_flow_alignment]]).
- Pure logic goes in `src/lib/ar/duplicate-dcr.ts` and is unit-tested; routes
  and `posting.ts` only *call* it.
- `.mts` tests only (repo's `npm test` ignores `.test.ts` —
  [[project_test_runner_mts_only]]).

---

## Phase 1 — Pure detection helpers

**Create:** `src/lib/ar/duplicate-dcr.ts` + `src/lib/ar/__tests__/duplicate-dcr.test.mts`
**Touch nothing else.**

### 1.1 Types + status helper
```ts
/** DCR states whose items are still awaiting Accounting (a duplicate risk).
 * Narrower than isActiveDcrStatus — 'reconciled' means AR already processed it. */
export function isUnpostedDcrStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "draft" || s === "submitted";
}
```

### 1.2 `summarizeUnpostedForAccount`
Input: `payments` rows for **one** `masterlist_id` (already fetched).
Output: `{ count, totalAmount, references: string[] }` for payments with
`status ∈ {pending_verification, confirmed}`. Pure. No DB.

> **Verified:** `payments.status` is authoritative for "posted" — the
> `post_single_dcr_item` RPC sets `payments SET status = 'posted'`
> (`supabase/migrations/20260831110000_post_single_dcr_item_atomic.sql:103`),
> and `rejectDcr` / rejection frees the payment back to `confirmed`. So the
> `status` filter alone is correct — **no `dcr_items` join is needed** to
> exclude posted payments. (Earlier draft of this plan said "check which" —
> this is the answer.)

### 1.3 `findInstallmentConflicts`
Input: `candidateScheduleIds: string[]` (what the new DCR item would allocate to)
and `claimedScheduleIds: string[]` (installment ids already covered by other
`pending` items on `draft`/`submitted` DCRs for the same account).
Output: `string[]` — the overlap. Pure.

### 1.4 Tests (`duplicate-dcr.test.mts`)
- `isUnpostedDcrStatus`: draft/submitted → true; reconciled/rejected/'' → false.
- `summarizeUnpostedForAccount`: none; one confirmed; one pending_verification;
  a posted one excluded; a rejected one excluded; totals + refs correct.
- `findInstallmentConflicts`: no overlap → `[]`; full overlap; partial overlap;
  empty candidate; empty claimed.

**Done when:** `node --import tsx --test src/lib/ar/__tests__/duplicate-dcr.test.mts`
passes; nothing else in the repo imports the new module yet.

**MUST NOT:** import from `posting.ts` (keep it dependency-light — it may import
`isActiveDcrStatus` from `collector/desk.ts` if useful, nothing heavier).

---

## Phase 2 — Record-payment warning (informational, non-blocking)

**Touch:**
- `src/app/api/collector/accounts/[id]/route.ts` — add ONE derived field.
- `src/components/payments/RecordPaymentPage.tsx` — render a notice.
- `src/app/api/collector/payments/route.ts` (POST) — add a `warning` to the
  success payload + audit field. **Do not block.**

### 2.1 Account detail route — add `unpostedOnAccount`
`GET /api/collector/accounts/[id]` already fetches `payments` for the account
(`route.ts` ~line 78) and returns them. Add, next to `account: {...}`:
```ts
unpostedOnAccount: summarizeUnpostedForAccount(paymentRows, postedPaymentIds),
```
- `postedPaymentIds`: one extra `dcr_items` select
  (`payment_id where status='posted' and payment_id in (...)`) OR derive from
  `payments.status === 'posted'` if that's authoritative — **check which:**
  read whether a posted item flips `payments.status` to `'posted'`
  (`postSingleDcrItem` around `posting.ts:1129`). If yes, no extra query —
  `summarizeUnpostedForAccount` just filters `status`.
- **MUST NOT** change the existing `account`/`schedules`/`payments` shape — this
  is additive; downstream consumers keep working.

### 2.2 `RecordPaymentPage.tsx` — the notice
When `data.unpostedOnAccount.count > 0`, render an `<Alert variant="warning">`
above `<RecordPaymentForm>` (~line 218):
> "This account already has {count} payment(s) totalling ₱{totalAmount} recorded
> and waiting for Accounting to post. Recording another may double-count —
> review the pending list before continuing."
Plus an expander listing the pending refs (data already in `data.payments`,
filter `status !== 'posted' && not reconciled`).
- **MUST NOT** disable or gate the form; it's a heads-up only.

### 2.3 Payments POST — echo + audit (no block)
In `POST /api/collector/payments` after the insert succeeds:
- Re-select the account's other unposted payments (cheap, by `masterlist_id`).
- If any existed **before** this insert, add to the `jsonOk` body:
  `warning: "Recorded. Note: N other payment(s) on this account are still
  waiting for Accounting."` and to `writeAuditEvent.afterData`:
  `recordedWithUnpostedPending: N`.
- **MUST NOT** change the 200/insert path, the schema, or add a 4xx here.

**Done when:** a 2nd record on an account with an unposted payment shows the
notice before submit and the toast after; a 1st record on a clean account shows
neither; `npm run build` + `tsc` clean.

---

## Phase 3 — Same-installment block at DCR add / submit

**Touch:**
- `src/lib/ar/posting.ts` — `addPaymentToDcr` and `submitDcr` (add a call +
  throw; do **not** restructure either function).
- `src/app/api/collector/dcr/route.ts` — `addItemSchema` gains
  `acknowledgeDuplicate: z.boolean().optional()`, passed through.
- `src/lib/ar/duplicate-dcr.ts` — add `loadClaimedScheduleIds(admin, masterlistId, excludeDcrId)`
  (service-role query helper — see below).

### 3.1 The cross-DCR lookup — **service role, fail loud**
New in `duplicate-dcr.ts`:
```ts
// service client REQUIRED: a conflicting unposted DCR left by a previous
// assignee is invisible to the current collector's RLS session
// (dcr_items_select gates on d.collector_user_id = auth.uid()).
export async function loadClaimedScheduleIds(
  admin: SupabaseClient, masterlistId: string, excludeDcrId: string,
): Promise<string[]>
```
Query: `dcr_item_allocations` → join `dcr_items` (`status='pending'`) → join
`dcr` (`status in ('draft','submitted')`) → join `payments`
(`masterlist_id = $1`), `dcr.id <> excludeDcrId`,
**`amortization_schedule_id IS NOT NULL`** (the trailing advance line —
`computeAutoAllocation` always emits one when money remains after all open
installments — has a null schedule id and is not an installment claim).
Return distinct `amortization_schedule_id`. **Throw on query error** (no
`?? []`).

> **Verified:** `addPaymentToDcr` always writes `dcr_item_allocations` rows
> (`posting.ts` ~1590, `if (resolvedAllocations.length > 0)` — and
> `computeAutoAllocation` returns ≥1 line for any positive amount), so a
> `pending` item reliably has allocation rows to match against. Pure-advance
> payments contribute only a null-schedule row, hence the `NOT NULL` filter.

### 3.2 In `addPaymentToDcr` (`posting.ts:1507`)
After `resolvedAllocations` is built (~line 1568) and **after** the existing
`alreadyBatched` block (leave that untouched):
```ts
const claimed = await loadClaimedScheduleIds(createServiceClient(), masterlistId, dcrId);
const conflicts = findInstallmentConflicts(
  resolvedAllocations.map(a => a.amortizationScheduleId).filter(Boolean),
  claimed,
);
if (conflicts.length > 0 && !overrideAllowed) {
  throw new Error(
    `Installment(s) ${conflictLabels} for this account are already on an unposted DCR. ` +
    `Ask Accounting to post/reject it first, or remove the overlapping allocation.`
  );
}
```
- `overrideAllowed` = `acknowledgeDuplicate === true` **AND**
  `validateFieldEdit("collection", "dcr_duplicate_override", userId).allowed`.
  When it overrides, `writeAuditEvent` (in the route) records
  `dcrDuplicateOverride: true, conflictInstallments: [...]`.
- `addPaymentToDcr` already receives `collectorUserId` — thread the ack flag in
  as a new **optional** last param so no existing caller breaks.
- **MUST NOT** move/relax the `alreadyBatched` throw or the "DCRR not editable"
  / "Payment not available" guards.
- **MUST NOT** import `createServiceClient` in a way that changes existing
  service-role usage in `posting.ts` (check if already imported; reuse).

### 3.3 In `submitDcr` (`posting.ts:1356`) — backstop
Before flipping `dcr.status` to `submitted` (~line 1388): load this DCR's own
allocation schedule ids, call `loadClaimedScheduleIds` (exclude self),
`findInstallmentConflicts`. If overlap and no override → throw
`"This DCR overlaps installment(s) ... already on another unposted DCR. Resolve before submitting."`
- **MUST NOT** change the `count === 0` "add at least one payment" guard or the
  `payments` status flip loop.

### 3.4 Route wiring (`collector/dcr/route.ts`)
- `addItemSchema` + `submitSchema`: add `acknowledgeDuplicate: z.boolean().optional()`.
- Pass it to `addPaymentToDcr` / `submitDcr`.
- On a successful override, extend the existing `writeAuditEvent` for `submit`
  and add one for `add_item` (there is none today — add a minimal one only when
  an override happened, to avoid noisy new audit volume on the happy path).
- **MUST NOT** change the `create` / discount-permission branches.

**Done when:** two different payments both allocating to installment #k of one
account, on two draft DCRs → the second `add_item` is rejected with the message;
granting `collection:dcr_duplicate_override` + `acknowledgeDuplicate:true` lets
it through and logs it; two payments on different installments are unaffected;
`submitDcr` catches the draft-built-before-conflict case.

---

## Phase 4 — Visible "pending / unposted" indicator

**Touch:**
- `src/app/api/collector/accounts/route.ts` — one grouped follow-up query +
  one field on the mapped row.
- `src/lib/collector/queue.ts` — extend `CollectorQueueMappedRow` type only
  (no logic).
- `src/app/collector/accounts/page.tsx` — render a badge.
- DCR builder page/component — inline caution on a row whose account has another
  unposted payment (reuse the account-detail data).

### 4.1 Accounts list route
After `activeIds` is known (~line 148), add a grouped query mirroring the
`collector_contacts` block:
```ts
const { data: pend } = await supabase
  .from("payments")
  .select("masterlist_id, id, status")
  .in("masterlist_id", activeIds)
  .in("status", ["pending_verification", "confirmed"]);
// minus payment_ids on a posted item if payments.status isn't authoritative (see 2.1)
```
Build `Map<masterlistId, count>`; set `unpostedPaymentCount` on each mapped row.
- **MUST NOT** alter the existing `masterlist` select, filters, sort, pagination,
  or KPI computation. `computeCollectorQueueKpis` input shape unchanged (add the
  field after KPIs are computed, or make it optional so KPI code ignores it).

### 4.2 `queue.ts` type
Add `unpostedPaymentCount?: number` to `CollectorQueueMappedRow`. **Type only —
no function touched.**

### 4.3 Accounts list UI
A small `<Badge variant="warning">DCR pending</Badge>` (or `N unposted`) on rows
where `unpostedPaymentCount > 0`. Non-intrusive; doesn't change row layout/sort.

### 4.4 DCR builder
When adding a payment, if its account has another unposted payment, show an
inline note on that item row. Read-only; no gate (Phase 3 is the gate).

**Done when:** the accounts list shows the badge without opening each account;
badge disappears once Accounting posts; no change to filtering/sorting/KPIs.

---

## Phase 5 — Remedial parity

- Remedial uses the same `RecordPaymentPage` (`desk="remedial"`) and the same
  `posting.ts` functions — Phases 2 & 3 already cover it.
- Apply Phase 4's indicator to the Remedial accounts list
  (`src/app/remedial/...` + its API) if it has a separate queue view.
- **MUST NOT** change Remedial-specific logic (recovery queue, demand letters,
  remedial assignment) — indicator + warning only.

**Done when:** a remedial officer sees the same warning/block/indicator.

---

## Phase 6 — Tests + regression

- Phase 1 helper tests (in Phase 1).
- `posting.ts` test: `addPaymentToDcr` throws on a same-installment conflict,
  passes on a distinct installment, and passes with a valid override. Follow the
  existing `src/lib/ar/__tests__/` style — **check first** whether they use a
  stub Supabase client (like `lra/__tests__/release-service.test.mts`) or call
  helpers directly; if a full stub is disproportionate, cover the pure logic via
  `findInstallmentConflicts` + a thin integration note.
- Route-level: `add_item` without ack → 400/blocked; with ack + permission →
  ok.
- Full: `npm test` green (count up only by new tests); `npx tsc --noEmit`
  clean; `npm run build` ✓; `eslint` clean on touched files.
- Manual/QA (no DB-mock harness for these): the record-time notice, the
  accounts-list badge, and the Remedial parity.

---

## Phase 7 — Client review (Wednesday)

Demo the warning → block progression. Confirm the four Part-E questions from the
audit doc (block scope, hard-vs-override, Remedial, wording). Only then mark the
tracker item Done.

---

## Constraint quick-reference (the "do not break" list)

| Area | Rule |
| :- | :- |
| `post_single_dcr_item` RPC + its migrations | untouched |
| `reconcile*` / `reject*` / `postSingleDcrItem` / `settleDcrStatusIfComplete` | untouched |
| `recomputeOutstandingBalance`, aging, penalty, rounding write-off | untouched |
| `computeAutoAllocation` / `fetchOpenInstallments` / `validateAllocationLines` | read-only reuse |
| existing `alreadyBatched` (`payment_id`) guard | kept verbatim, new check is additive |
| `payments` / `dcr` / `dcr_items` status values + transitions | unchanged |
| Collector Discount, Move-of-Payment, PDC, reminders | unchanged |
| record-payment POST 200 path + schema | unchanged (warning is additive, no 4xx) |
| accounts-list `masterlist` select / filters / sort / pagination / KPIs | unchanged (one grouped follow-up query + one optional field) |
| cross-DCR duplicate lookup | **service role, throw on error** — never silent |
| new pure logic | `src/lib/ar/duplicate-dcr.ts`, `.mts` tests, no `posting.ts` import |
| schema | no migration (indexes only if a plan proves a seq scan) |
| Supabase MCP | `pg_policies` reads only; no data mutation |

---

## Progress log

- 2026-09-07 — Implementation plan written (Claude). Phases 1, 2, 4 are
  client-answer-independent and can start. Phase 3's *default* (hard block,
  same-installment scope) is coded behind the `dcr_duplicate_override`
  permission so the client's answers become config, not a rewrite.
- 2026-09-08 — Validated against code (Claude). All cited line numbers /
  functions / RLS policies confirmed. **Corrections:** (1) `payments.status =
  'posted'` is authoritative (set by the `post_single_dcr_item` RPC —
  `migrations/20260831110000_...:103`), so Phase 2's "posted" exclusion needs
  no `dcr_items` join; (2) Phase 3's claimed-installment query must add
  `amortization_schedule_id IS NOT NULL` to skip the trailing advance line that
  `computeAutoAllocation` always emits. Both folded into the phase text.
- 2026-09-08 — **Phase 1 DONE** (Claude). New `src/lib/ar/duplicate-dcr.ts`:
  `isUnpostedDcrStatus`, `summarizeUnpostedForAccount` (status filter only — no
  `dcr_items` join, per the correction above), `findInstallmentConflicts`
  (ignores null/blank advance-line ids). Imports only `sumHalfUp` from
  `computation/money` — nothing from `posting.ts`. New
  `src/lib/ar/__tests__/duplicate-dcr.test.mts` — 13 cases, all pass. Full
  `npm test` 1587/1587; `tsc` + `eslint` clean. Nothing imports the module yet.
- 2026-09-08 — **Phase 3 design correction (Claude).** Plan §3.1/§3.2 gated the
  override on `validateFieldEdit("collection","dcr_duplicate_override",...)`.
  **That RPC (`get_field_rule`) is fail-OPEN** — `COALESCE(v_rule, 'edit')`, per
  the comment in `migrations/20260903151000_collector_discount_rbac.sql`: with
  no rule row it returns `allowed: true`. So gating the override on it would
  ship a block that anyone bypasses by sending `acknowledgeDuplicate: true`
  until a deny row is seeded. **Resolution:** Phase 3 ships an
  **unconditional hard block** — no `acknowledgeDuplicate`, no route/schema
  change. The override ("hard vs override-with-reason", Part E #2) becomes a
  small fail-CLOSED follow-up (`hasModulePermission` on a new ungranted
  `collection` action + a required reason + audit) once the client decides.
- 2026-09-08 — **Phase 2 DONE** (Claude), collector desk only:
  - `api/collector/accounts/[id]/route.ts` — response gains
    `unpostedOnAccount: summarizeUnpostedForAccount(payments)` (additive; other
    fields unchanged).
  - `RecordPaymentPage.tsx` — `AccountPayload` gains optional
    `unpostedOnAccount`; renders an `<Alert variant="warning">` above the form
    when `count > 0`, listing the pending reference numbers. `handleRecorded`
    now prepends any POST `warning` to its success message.
  - `RecordPaymentForm.tsx` — parses the POST body and passes
    `{ warning }` up to `onRecorded`.
  - `api/collector/payments/route.ts` (POST) — counts unposted payments on the
    account **before** the insert; if >0, adds `warning` to the 200 body and
    `recordedWithUnpostedPending: N` to the audit event. **No block, no schema
    change, no 4xx.** (Also fixed one pre-existing `prefer-const` lint error in
    the GET handler of the same file.)
  - Verified live (dev server, `collector@loanstar.local`): account **with** an
    unposted payment (AN300449) shows *"This account already has 1 payment
    totalling ₱14,077.35 … Pending ref: 352456"*; a **clean** account (AN300442)
    shows nothing. `npm test` 1587/1587; `tsc` / `eslint` / `npm run build`
    clean.
  - Remedial desk uses the same component but its `/api/remedial/accounts/[id]`
    route does not yet return `unpostedOnAccount` — that's Phase 5 (the UI
    guard is optional-safe, so remedial just shows no notice for now).
- 2026-09-08 — **Phase 3 DONE** (Claude), unconditional hard block:
  - `src/lib/ar/duplicate-dcr.ts` — added `loadClaimedScheduleIdsAmong(admin,
    candidateIds, excludeDcrId)` and `loadDcrScheduleIds(admin, dcrId)`.
    Service-role, **three flat queries** (`dcr_item_allocations` → `dcr_items`
    `status='pending'` → `dcr` `status in (draft,submitted)` `≠ excludeDcrId`),
    **throw on every query error** (no `?? []`). Advance-line rows
    (`amortization_schedule_id IS NULL`) filtered out. Still imports nothing
    from `posting.ts` (only a `SupabaseClient` type + `sumHalfUp`).
  - `src/lib/ar/posting.ts` — `addPaymentToDcr`: after `resolvedAllocations`,
    calls `loadClaimedScheduleIdsAmong` and **throws** if any installment this
    payment covers is already on another unposted DCRR. `submitDcr`: same
    backstop over the DCRR's own installments. Both gained an **optional
    trailing `serviceClient?` param** (defaults to `createServiceClient()`;
    injectable for tests) — no existing caller changed. Existing
    `alreadyBatched` (`payment_id`) guard untouched.
  - **No route / schema change** — the throw flows through the route's existing
    `handleApiError`, exactly like the `alreadyBatched` throw already does.
  - `src/lib/ar/__tests__/posting.test.mts` — fixed the one test that now
    reached the service call (passed a `makeDupServiceStub()`), added 2:
    "blocks when an installment is already on another unposted DCRR" and
    "allows when it is not". 45/45 in that file.
  - `npm test` 1589/1589; `tsc` clean on touched; `npm run build` ✓
    (needed a `rm -rf .next` first — a stale `.next/dev/types` from the Phase-2
    dev-server run, not a code issue); `eslint` exit 0 (one pre-existing
    `_args` warning in the file's `thenable` helper, not mine).
- 2026-09-08 — **Phase 4 DONE** (Claude), collector queue only:
  - `api/collector/accounts/route.ts` — one grouped `payments` query
    (`status in (pending_verification,confirmed)` over the assigned `activeIds`),
    parallel to the existing `collector_contacts` follow-up (not N+1). Each
    mapped row gains `unpostedPaymentCount`. `masterlist` select / filters /
    sort / pagination / `computeCollectorQueueKpis` all untouched — KPIs still
    read `outstandingBalance`.
  - `lib/collector/queue.ts` — `CollectorQueueMappedRow` gains optional
    `unpostedPaymentCount?: number`. **Type only, no function touched.**
  - `collector/accounts/page.tsx` — new `renderDcrPending(acc)` helper →
    `<Badge variant="warning">DCR pending</Badge>` (with count when >1) when
    `unpostedPaymentCount > 0`; rendered in both the card view (`gcard-top`)
    and the table view (Account cell). No change to row layout / sort / KPI.
  - Verified live: `/collector/accounts` shows "DCR pending" on AN300450 /
    AN300007 / AN300449 (each has 1 recorded-unposted payment — matches the DB)
    and nothing on the rest; KPIs unchanged.
  - `npm test` 1589/1589; `tsc` clean on touched; `npm run build` ✓ (full
    route table printed). **eslint:** 2 `react-hooks/set-state-in-effect`
    errors in `accounts/page.tsx` — **confirmed pre-existing on `HEAD`** by
    stashing the change; my additions add zero new lint issues (a genuine fix
    is a `useCallback`/effect refactor, out of scope).
  - DCR-builder inline caution (plan §4.4) not done — it's a nice-to-have on
    top of the enforced block; can fold into Phase 5.
- 2026-09-08 — **Phase 5 DONE** (Claude), Remedial parity:
  - `api/remedial/accounts/[id]/route.ts` — returns `unpostedOnAccount`
    (identical to the collector route; the shared `RecordPaymentPage` already
    renders it, so the record-payment warning now works for `desk="remedial"`).
  - `api/remedial/accounts/route.ts` — same grouped `payments` query →
    `unpostedPaymentCount` on each `RemedialQueueMappedRow`. Remedial
    `masterlist` select / severity / turnover logic / KPIs untouched.
  - `lib/remedial/queue.ts` — `RemedialQueueMappedRow` gains optional
    `unpostedPaymentCount?: number` (type only).
  - `remedial/page.tsx` — same `renderDcrPending` helper + badge in the card
    (`gcard-top`) and table (Account cell) views.
  - `npm test` 1589/1589; `tsc` clean on touched; `npm run build` ✓. eslint:
    `remedial/page.tsx` has 3 pre-existing errors on `HEAD` (same
    `set-state-in-effect` family as the collector page) — my additions add
    **zero new** (verified by stash).
  - **Not verified live:** no remedial account currently has an unposted
    payment to demo the badge; the code path is byte-identical to the
    collector one, which *was* verified live in Phase 4.
- 2026-09-08 — **Badge layout fix** (Claude, reported by Rovick): with a count
  the badge ("DCR pending (2)") wrapped onto 2–3 lines in the narrow Account
  cell. Fixed: `Badge className="whitespace-nowrap"`, wrapper `shrink-0`, the
  Account cell's inner `<span>` also `whitespace-nowrap`, and the count label
  `(${n})` → `×${n}` (shorter). Both collector + remedial pages. `tsc` /
  `npm run build` clean; verified single-line on `/collector/accounts`.
- 2026-09-08 — **§4.4 delivered** — DCRR Allocate modal now annotates
  installments already spoken for by another unposted DCRR (Claude, on Rovick's
  request). Also surfaced the block error inside the modal (it was only in the
  Network tab).
  - `duplicate-dcr.ts` — new `loadPendingAllocationsForAccount(admin,
    masterlistId, excludeDcrId?)` → `{ [scheduleId]: { amount, dcrCount } }`,
    summing pending allocations on `draft`/`submitted` DCRRs. Flat queries,
    service-role, throws on error. +3 unit tests (24 total in that file).
  - `api/collector/dcr/allocation-preview/route.ts` — returns
    `pendingByInstallment` (service client).
  - `collector/dcr/page.tsx` + `remedial/dcr/page.tsx` — `AllocationRow` gains
    `pendingElsewhere` / `pendingDcrCount`; `installmentFreeToAllocate()`
    helper; the modal now: greys + disables a **fully-covered** row (checkbox
    off, not pre-checked so auto-alloc's pick shows as advance), and on a
    **partly-covered** row shows *"₱X on N unposted DCRR · ₱Y free"* and caps
    the Apply `max` at the free amount. Also added the in-modal `<Alert>` for
    the hard-block error + `closeAllocationModal` clears `error`.
  - Verified live: Juan Mendoza / AN300455 modal — installment #1 *"₱3,668.00
    on 1 unposted DCRR — fully covered"* (greyed, disabled); #5 *"₱15,232.00 on
    1 unposted DCRR · ₱3,668.00 free"*; #6 free.
  - `npm test` 1602/1602; `tsc` clean on touched; `npm run build` ✓.
  - **Still deferred:** the DCR-builder per-row inline caution (§4.4) — pure
    client-side polish on top of the enforced Phase 3 block; low priority.
- 2026-09-08 — **Phase 6 DONE** (Claude), tests + regression:
  - `duplicate-dcr.test.mts` — +8: a compact in-memory PostgREST `makeLoaderStub`
    and coverage for `loadClaimedScheduleIdsAmong` (no candidates → no query;
    finds a pending item on another draft DCRR; ignores the excluded DCRR;
    ignores reconciled/rejected DCRRs; ignores a posted item; **throws** on a
    query error — no silent `?? []`) and `loadDcrScheduleIds` (distinct
    non-null ids; empty DCRR).
  - `posting.test.mts` — +2: `submitDcr` backstop "blocks when the DCRR
    overlaps an installment on another unposted DCRR" and "submits cleanly when
    it does not" (same `makeLoaderStub` fed as the injected `serviceClient`).
    The Phase-3 `addPaymentToDcr` block/allow tests already cover the add path.
  - **Not applicable:** the plan's route-level "`add_item` without ack → 400"
    test — there is no `acknowledgeDuplicate` (Phase 3 is an unconditional hard
    block), and the route has no branching to test; the throw flows through
    `handleApiError` exactly like the existing `alreadyBatched` guard (which
    likewise has no route test).
  - `npm test` **1599/1599** (1589 + 10 new); `tsc` clean on the four Task-4
    files (pre-existing errors in `initialize-ar-account.test.mts` /
    `schedule.test.ts` are unrelated); `npm run build` ✓; `eslint` — 1
    pre-existing `_args` warning in the file's `thenable` helper (shifted line
    number only), 0 errors.
- 2026-09-08 — **Block made amount-aware (Option 1)** (Claude). The Phase-3
  block was binary — "is this installment on ANY other unposted DCRR?" — so it
  rejected a *legitimate partial fill* the §4.4 Allocate modal had just told the
  collector was fine (installment #5 for Juan Mendoza / AN300455: owes ₱18,900,
  ₱15,232 pending elsewhere, ₱3,668 genuinely free). Matches what Rovick said in
  the meeting ("several DCRRs on one account are fine"). Now blocks **only a real
  over-fill**.
  - `duplicate-dcr.ts` — +2 exports: `findOverAllocatedInstallments({candidate,
    pending, remainingDue, tolerance=0.005})` (pure — flags a scheduleId only
    when `pending[sid] + candidate[sid] > remainingDue[sid] + tol`), and
    `loadDcrAllocationsWithMasterlist(admin, dcrId)` (flat service-role queries →
    `{scheduleId, amount, masterlistId}[]` so `submitDcr` can group its own
    lines per account). `loadClaimedScheduleIdsAmong` / `loadDcrScheduleIds` kept
    exported (still unit-tested) but no longer used by `posting.ts`.
  - `posting.ts` — `addPaymentToDcr` and `submitDcr` backstops rewritten: build
    the candidate peso-per-installment, load `loadPendingAllocationsForAccount`
    (amount, not just presence) + `fetchOpenInstallments` → `netInstallmentDue`
    for the real remaining due, then `findOverAllocatedInstallments`. `addPayment`
    passes **no** `excludeDcrId` (this draft's own added items must count, so
    double-filling one row in the same draft is still caught); `submitDcr`
    excludes self (its own totals are the candidate). New wording: *"…would
    over-fill an installment that another unposted DCRR already covers. Post or
    reject that DCRR first, or reduce the overlapping amount…"*.
  - Tests: `duplicate-dcr.test.mts` +9 (`findOverAllocatedInstallments` pure
    cases incl. tolerance + multi-id; `loadDcrAllocationsWithMasterlist` join +
    empty). `posting.test.mts` — `makeDupServiceStub` reworked to feed
    `makeLoaderStub` fixtures (peso-per-installment); the `addPaymentToDcr` /
    `submitDcr` Task-4 cases now assert **over-fill blocks, partial fill up to
    the free amount passes**. `makeLoaderStub` gained a no-op `.order()`.
  - `npm test` **1612/1612**; `tsc` clean on touched files; `npm run build` ✓;
    `eslint` 0 errors (same 1 pre-existing `_args` warning).
  - **Verified live** (collector, port 3000): Juan Mendoza / AN300455 — modal
    shows "₱15,232 on 1 unposted DCRR · ₱3,668 free" on installment #5; checking
    it, entering ₱3,668, **Add to DCRR now succeeds** ("Payment added to DCRR",
    draft `eb3bea14` → 1 item · ₱3,668.00). Installment #1 (fully covered) stays
    greyed + checkbox disabled.

---

## Status summary (2026-09-08)

| Phase | State |
| :- | :- |
| 1 — pure helpers | **DONE** |
| 2 — record-payment warning (collector) | **DONE**, verified live |
| 3 — same-installment hard block (add + submit) | **DONE** — now **amount-aware** (Option 1): blocks only a genuine over-fill, not a legitimate partial fill; unconditional; override deferred to client decision |
| 4 — "DCR pending" badge (collector queue) | **DONE**, verified live |
| 5 — Remedial parity | **DONE** (badge not demo'd — no seeded remedial data) |
| 6 — tests + regression | **DONE** — `npm test` 1612/1612, build ✓ |
| §4.4 DCR-builder inline caution | deferred (nice-to-have) |
| 7 — client review | pending Wednesday |

**Open for the client (unchanged):** block scope (same-installment vs wider);
hard block vs override-with-reason (if override: a fail-CLOSED
`hasModulePermission` gate + a required reason + audit — small, self-contained);
Remedial parity confirmation; message wording.
