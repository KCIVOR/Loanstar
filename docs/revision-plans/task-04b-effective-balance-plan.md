# Task 4b — Collector never builds on a wrong balance (effective balance)

Follow-on to Task 4 ([task-04-duplicate-dcr-warn-block.md](task-04-duplicate-dcr-warn-block.md),
[task-04-duplicate-dcr-IMPLEMENTATION-plan.md](task-04-duplicate-dcr-IMPLEMENTATION-plan.md)).
Task 4 *warns/blocks* duplicates. This closes the underlying cause: the balance
the collector sees does not reflect payments already recorded but not yet posted
by Accounting, so they act on a number that's too high.

**Workflow:** Claude audits + plans → Cursor implements → summary validated. Do
not implement directly unless told otherwise. **Exception, 2026-09-15: the
user explicitly instructed "implement all," overriding the default — Claude
implemented Phases 1–6 directly this session (see Part I). Phase 7 (client
review/demo) still needs the client.**

**Status:** **Phases 1–6 implemented and verified 2026-09-15** (code,
1721/1721 tests passing incl. 9 new ones, `tsc`/`eslint`/`build` clean, and
live-verified end to end against the actual running app — see Part I). Phase
7 (client demo) not started — needs the client present.

**To whoever implements this (Cursor or otherwise): never assume this document
is still accurate the moment you start.** Every file/line reference below was
re-checked on 2026-09-15, but this codebase moves fast — re-grep each cited
symbol yourself before editing it, and if a line number or function shape has
drifted, trust the code over this doc and fix the doc's citation as part of
your diff.

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
at post time. **Re-verified 2026-09-15 directly in `postSingleDcrItem`
(`posting.ts:935`):** its own comment states plainly that "the actual writes
(posting insert(s), schedule update(s), payment status, balance
recompute+update) run atomically in one Postgres function" — the
`post_single_dcr_item` RPC — invoked only from this one call site, which itself
only runs when AR posts a DCR item. No other code path writes any of these
three things. So both the account total and every installment row over-state
what's owed for the entire time a payment sits `pending_verification` /
`confirmed`, whether or not it's even been added to a DCR yet.

**Empirically confirmed, not just read from code (2026-09-15):** recorded a
real ₱50,000 payment on a live seeded account (AN300374) via the actual
Record Payment screen. Immediately after, `payments.status` was `confirmed`
in the database, but `masterlist.outstanding_balance` had not moved at all
(same value, same `updated_at`, from *before* the payment existed), and the
Collector's own Accounts list displayed the unchanged, pre-payment balance
right next to a "DCR pending" badge — the badge fired, the number didn't.
Four other real, non-test accounts on the same live list carried the same
"DCR pending" badge at the same time, meaning this isn't a hypothetical —
it's presently true of real accounts in the system.

### A.2 Where the collector sees the (posted-only) balance

Line numbers below are as of 2026-09-08 and were **not** individually
re-confirmed line-by-line on 2026-09-15 (only the API route was, see the
footnote) — re-grep each file before editing; treat the file list as reliable,
the exact line numbers as approximate.

| File | Line | Context |
| :- | :- | :- |
| `src/app/collector/accounts/page.tsx` | 647, 708 | accounts list |
| `src/app/collector/page.tsx` | 353 | collector dashboard |
| `src/components/payments/RecordPaymentPage.tsx` | 164 | record-payment header ("Outstanding ₱X") |
| `src/components/ledger/*` (AccountLedger) | — | per-installment "amount due / paid / remaining" |
| `src/app/remedial/accounts/[id]/page.tsx` | 258 | remedial account detail |
| `src/app/remedial/page.tsx` | 682, 764 | remedial list |
| `/api/collector/dcr/allocation-preview` + `computeAutoAllocation` | `posting.ts:36` | the DCR builder's auto-split |

**Re-verified 2026-09-15, the actual data source:** `src/app/api/collector/accounts/route.ts`
selects `outstanding_balance` straight off `masterlist` (line 121) and passes
it through unmodified as `outstandingBalance` (line 199) — zero adjustment for
anything pending. This is the route every page above ultimately reads from,
and it's the cleanest single point to confirm the gap exists at the API layer,
not just in each page's rendering.

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
- Reuse Task 4's `duplicate-dcr.ts` helpers (`loadPendingAllocationsForAccount`
  for allocated pending) rather than writing a 2nd copy of the same query.
- Every UI change shows posted **and** effective, both labelled. Never replace.

**Added 2026-09-15, from re-auditing this plan before implementation:**
- **Never assume a file/line citation in this document is still correct.**
  Several already drifted between the Sept 8 draft and today re-check
  (`validateAllocationLines` moved ~219→224, the auto-allocation branch moved
  ~1566→1594, and the helper this plan needs turned out to already exist under
  a different name than first assumed — `loadClaimedScheduleIdsAmong`, not
  `loadClaimedScheduleIds`). Re-grep the actual symbol before touching it.
- **Prove the fix, don't just claim it.** Before marking any phase done,
  reproduce the *original* bug the same way it was reproduced for this audit —
  record a real payment on a seeded account via the actual UI, confirm via a
  direct database query that `masterlist.outstanding_balance` doesn't move,
  then confirm the fix by re-running the same steps and checking the new
  "effective" figure actually changes. A passing unit test on
  `deriveEffectiveBalance` alone does not prove the wiring into a real screen
  works.
- **`postSingleDcrItem`'s own internal `fetchOpenInstallments` call
  (`posting.ts:964`) is explicitly out of scope** — see Phase 4's note. It's
  easy to "helpfully" swap every call site to the effective variant in one
  pass; that specific one must stay on the posted view or posting itself
  breaks.

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
- **Match existing conventions, don't invent new ones** — verified 2026-09-15:
  `findOverAllocatedInstallments` (`duplicate-dcr.ts:297`) does the closely
  related "is pending + candidate over the due amount" check with a
  `tolerance = 0.005` and the codebase's usual `halfUp` rounding. Use the same
  tolerance and rounding here rather than a fresh convention — this function
  is conceptually `effectiveRemaining = max(0, due − pending)`, the mirror
  image of that existing check.

**Done when:** tests pass; nothing imports it yet.

---

### Phase 2 — One server helper to assemble the inputs

**Create:** `getAccountEffectiveBalance(admin, masterlistId)` in
`src/lib/ar/effective-balance.ts` (service client param, like Task 4's
`loadClaimedScheduleIdsAmong` — **note the real exported name**, confirmed
2026-09-15 by reading `duplicate-dcr.ts` directly; the original Sept 8 draft
of this doc called it `loadClaimedScheduleIds`, which doesn't exist).

**Re-verified 2026-09-15 — this phase is smaller than originally scoped.**
Task 4 already shipped `loadPendingAllocationsForAccount(admin, masterlistId,
excludeDcrId?)` in `duplicate-dcr.ts` (line 180). Read its body: it does
exactly the "allocated pending, grouped per installment" query this phase
needs — draft/submitted DCRs only, pending `dcr_items` only, summed by
`amortization_schedule_id` — and returns
`Record<scheduleId, { amount, dcrCount }>`. **Call this directly instead of
writing a second copy of the same query.** (Its `dcrCount` field isn't needed
here — just read `.amount` per row.)

- posted installments: **corrected 2026-09-15 — `fetchOpenInstallments` does
  NOT return a pre-computed `netRemaining`.** It returns the raw columns
  (`amountDue`, `penaltyAmount`, `discountAmount`, `amountPaid`, `status`).
  Map each row through `netInstallmentDue({...})` (from
  `@/lib/computation/money`, already imported in `posting.ts` — same call
  every other site in this file makes, e.g. `computeAutoAllocation` and the
  existing Task 4 over-allocation check at `posting.ts:1625`) to get
  `netRemaining` per installment.
- **Real risk found, not present in the Sept 8 draft:** `fetchOpenInstallments`'s
  select does **not** include `penalty_discount_amount`, so any
  `netInstallmentDue` call built from its rows silently treats a Collector's
  penalty waiver as if it doesn't exist (the field defaults to 0 when
  omitted — no crash, just a quietly wrong number). This is a **pre-existing
  gap in the codebase** (today's auto-allocation already has it, unrelated to
  this task) — but it means summing `fetchOpenInstallments`-derived remainders
  will NOT always equal the true posted `masterlist.outstanding_balance` on an
  account where a penalty discount is active, which would break this plan's
  own Phase 3 promise that "a clean account shows only the posted number
  (effective == posted)." **Fix for this task specifically:** when Phase 2
  builds its own posted-installments query, select `penalty_discount_amount`
  too (additive — a wider select, not a change to `fetchOpenInstallments`
  itself) and pass it through to `netInstallmentDue`, so the "posted" figure
  this feature shows is guaranteed to match `recomputeOutstandingBalance`'s
  real output. Don't just call the existing `fetchOpenInstallments` unmodified
  and assume its total agrees with the posted balance — verify it does, on an
  account that actually has a penalty discount, before calling Phase 2 done.
- allocated pending: `loadPendingAllocationsForAccount(admin, masterlistId)` —
  reused as-is, not reimplemented (see note above). **Already imported into
  `posting.ts` itself** (line 15, alongside `findOverAllocatedInstallments`
  and `loadDcrAllocationsWithMasterlist`) — if `effective-balance.ts` ends up
  needing logic that's easiest to place in `posting.ts`, the import is already
  there; no new import path needed.
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
- `addPaymentToDcr`'s auto-allocation branch — **re-verified 2026-09-15, now at
  `posting.ts:1594`** (`const openInstallments = await fetchOpenInstallments(supabase, masterlistId);`,
  inside `export async function addPaymentToDcr` starting line 1530; drifted
  from the Sept 8 draft's `~1566` — re-grep before editing, it will drift
  again) — uses the effective variant.
- **Do NOT touch the other `fetchOpenInstallments` call site**, inside
  `postSingleDcrItem` at `posting.ts:964` (the fallback branch when a DCR item
  has no stored allocations). That call computes what a payment **being
  posted right now** should apply to — it must keep reading the true posted
  state, not the effective one, or posting could silently skip an installment
  that's only "pending" because of the very payment being posted.
- `allocation-preview` route uses the effective variant so the preview matches.
- A deliberate advance is still expressible (trailing `null` line) — keep that
  path.
- **Confirmed 2026-09-15, and a consolidation opportunity found:**
  `computeAutoAllocation` (`posting.ts:41`) verified exactly as described —
  fills oldest-open-installment-first, caps each line at that installment's
  `netInstallmentDue`, appends one trailing `amortizationScheduleId: null`
  advance line for whatever's left. Separately, `addPaymentToDcr`'s existing
  Task 4 over-allocation block (right after the auto-allocation call,
  `posting.ts:~1606-1642`) **already fetches both pieces this phase needs** —
  it calls `loadPendingAllocationsForAccount` and re-fetches
  `fetchOpenInstallments` a second time in the same function just to build a
  `remainingDue` map for its conflict check. Once `fetchEffectiveOpenInstallments`
  exists and feeds the auto-allocation call, that second redundant fetch
  immediately below it can likely be replaced by reusing the same effective
  data instead of re-deriving it — worth doing in this phase for consistency
  (one source of "what's really left on this installment" instead of two),
  not left as separate follow-up cleanup.

> **Verified — a subtlety for `validateAllocationLines`
> (re-confirmed 2026-09-15, now `posting.ts:224`, was `~219`):** today it checks only (a) allocation total == payment
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
| `postSingleDcrItem`'s internal `fetchOpenInstallments` call (`posting.ts:964`) | untouched — must keep reading the posted view; only `addPaymentToDcr`'s call (`posting.ts:1594`) switches to effective |
| file/line citations in this document | **verify against current code before editing** — several already drifted once between the Sept 8 draft and the 2026-09-15 re-check |
| proof of done | reproduce the original bug live (record a real payment, confirm via DB query the posted balance doesn't move) both **before** starting and **after** each phase — a passing unit test alone doesn't prove the UI wiring works |

---

## Part E — Sequencing with Task 4

- Task 4 Phase 1 (`duplicate-dcr.ts`) and Phase 3's `loadClaimedScheduleIdsAmong`
  (service-role unposted-DCR-allocation query; **name corrected 2026-09-15** —
  the original draft called it `loadClaimedScheduleIds`) are **prerequisites**
  — 4b reuses `loadPendingAllocationsForAccount` (same file, line 180) for
  "allocated pending" rather than re-querying it.
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
- 2026-09-15 — Re-audited against current code and the live app (Claude), and
  the underlying bug was live-reproduced end-to-end rather than assumed still
  present. Findings:
  - **Root cause confirmed unchanged:** all three balance-affecting writes
    (`amount_paid`, `status`, `masterlist.outstanding_balance`) still happen
    only inside the single `post_single_dcr_item` RPC, invoked only from
    `postSingleDcrItem` (`posting.ts:935`), invoked only when AR posts. Nothing
    added between Sept 8 and Sept 15 changed this.
  - **Live proof, not inference:** recorded a real ₱50,000 payment on seeded
    account AN300374 via the actual Record Payment screen. `payments.status`
    went to `confirmed`; `masterlist.outstanding_balance` and its `updated_at`
    did not change at all; the Collector's own Accounts list displayed the
    stale pre-payment figure next to a "DCR pending" badge. Four other real
    (non-test) accounts on the same live list carried the same badge at the
    same time — the gap is presently affecting real data, not just this test.
  - **Drift found and corrected in this document:** `loadClaimedScheduleIds` →
    actually named `loadClaimedScheduleIdsAmong`; `validateAllocationLines`
    moved `~219`→`224`; the `addPaymentToDcr` auto-allocation branch moved
    `~1566`→`1594`.
  - **Scope reduction found:** Task 4 already shipped
    `loadPendingAllocationsForAccount` (`duplicate-dcr.ts:180`), which already
    does the exact "allocated pending, grouped per installment" query Phase 2
    needs. Phase 2 now calls it directly instead of writing a second copy.
  - **New explicit guard added:** `postSingleDcrItem`'s own internal
    `fetchOpenInstallments` call (`posting.ts:964`) must NOT be swapped to the
    effective variant — it computes what the payment being posted right now
    applies to, and needs the true posted state to do that correctly.
  - Still not started — this pass was verification only, no implementation.
- 2026-09-15 (second pass) — **Validated the plan itself**, not just the
  original bug — traced the actual call chains Phases 1, 2, and 4 depend on
  rather than trusting the Sept 8 draft's description of them. Real issues
  found and corrected in this document:
  - **Phase 2 was imprecise:** `fetchOpenInstallments` does not return a
    pre-computed `netRemaining` — it returns raw columns; the caller must map
    through `netInstallmentDue()`. Fixed.
  - **Genuine pre-existing risk surfaced:** `fetchOpenInstallments`'s select
    omits `penalty_discount_amount`, so totals derived from it can silently
    disagree with the true posted balance on any account with an active
    penalty discount. This isn't a bug this task would introduce, but building
    Phase 2 on `fetchOpenInstallments` unmodified would inherit it and violate
    this plan's own "effective == posted on a clean account" criterion. Fixed
    with a specific recommendation (select the field, don't assume it's there).
  - **Phase 4 de-risked:** confirmed `computeAutoAllocation` behaves exactly
    as described. Found that `addPaymentToDcr`'s existing Task 4 code already
    fetches both `loadPendingAllocationsForAccount` and a `remainingDue` map
    right after auto-allocation runs, for its own over-allocation check —
    meaning Phase 4's data needs are already proven to work together in this
    exact function, and there's a concrete consolidation opportunity (stop
    fetching the same thing twice) rather than a novel risk.
  - `loadPendingAllocationsForAccount` confirmed already imported into
    `posting.ts` itself (line 15) — no new import path needed for Phase 2/4.
  - Conclusion: **the plan is sound in structure and constraints; two real
    corrections applied (Phase 2's field gap and its penalty-discount risk).
    Safe to hand to Cursor with these fixes in place.**
- 2026-09-15 (third pass) — **Implemented Phases 1–6 directly** (Claude), on
  the user's explicit "implement all" instruction. Not routed through Cursor.

---

## Part I — Implementation record (2026-09-15)

### What shipped

- **Phase 1** — `src/lib/ar/effective-balance.ts`: `deriveEffectiveBalance`
  (pure) + `PostedInstallment`/`EffectiveBalanceInput`/`EffectiveBalanceResult`
  types. 7 unit tests in `__tests__/effective-balance.test.mts`, all passing.
- **Phase 2** — `getAccountEffectiveBalance(admin, masterlistId)` in the same
  file. Selects `penalty_discount_amount` explicitly (the real risk found
  during validation) so its posted total matches
  `recomputeOutstandingBalance` exactly. Reuses
  `loadPendingAllocationsForAccount` for allocated pending; a small
  payments/dcr_items query for unallocated pending, using the existing
  `UNPOSTED_PAYMENT_STATUSES` constant.
- **Phase 3** — `effectiveBalance` added to both
  `/api/collector/accounts/[id]` and `/api/remedial/accounts/[id]` (additive;
  `outstandingBalance` untouched). `RecordPaymentPage.tsx` shows both figures
  in the header and folds the effective total into the existing Task 4
  pending-payment warning. `AccountLedger.tsx` gained an optional
  `pendingByScheduleId` prop (same "ignored when omitted" convention as its
  existing `selection` prop) rendering a new "Pending" column — every other
  consumer (AR, borrower) is unaffected since they don't pass it.
- **Phase 4** — `fetchEffectiveOpenInstallments` added to `posting.ts`
  (exported, used by the allocation-preview route). `addPaymentToDcr`'s
  auto-allocation branch now feeds `computeAutoAllocation` an "effective"
  installment list (pending folded into `amountPaid`, capped) instead of the
  raw posted one — `computeAutoAllocation` itself was not modified, per the
  plan's constraint. The over-allocation check right after it now reuses that
  branch's fetch instead of re-fetching, when available. **A real regression
  was introduced and caught by the existing test suite** during this phase —
  an earlier version hoisted the service-client/pending fetch above
  `validateAllocationLines`, breaking its "throws before touching the DB"
  contract for manual allocations (`rejects an allocation targeting a foreign
  masterlist installment` failed with `supabaseUrl is required` instead of the
  expected validation error). Fixed by only populating the shared fetch inside
  the auto-allocation branch, leaving the manual branch's validate-first order
  untouched. `/api/collector/dcr/allocation-preview` also switched to the
  effective variant for its own auto-allocation preview. Two new tests added
  proving the actual behavior change (not just that it compiles): auto-alloc
  skips an installment fully covered elsewhere and rolls into the next one;
  an account with no pending anywhere allocates identically to before.
- **Phase 5** — Both list routes (`/api/collector/accounts`,
  `/api/remedial/accounts`) already ran a grouped (not N+1) query for Task
  4's "DCR pending" count; extended the same query to also sum `amount`,
  since a `dcr_items.amount` always equals its payment's amount — no second
  query needed. `CollectorQueueMappedRow` / `RemedialQueueMappedRow` gained
  optional `effectiveBalance`/`pendingTotal` fields; KPI/sort/filter functions
  confirmed to read only `outstandingBalance`, unchanged. UI: both list pages
  (desktop table + mobile card layout) and the Collector dashboard's
  priority-accounts list show a muted "→ ₱X after pending" line when
  applicable. Also wired into the Remedial account-detail page's hero
  "Outstanding" figure (not explicitly in the Sept 8 phase list, but the same
  API route already returns it, and A.2 cited this exact page/line as a
  posted-only display site).
- **Phase 6** — Full suite: 1721/1721 passing (1728 total, 7 pre-existing
  skips), including 9 new tests (7 Phase 1 + 2 Phase 4) — zero regressions
  (baseline was 1712/1719 before this session). `tsc --noEmit` clean on every
  touched file (remaining errors are pre-existing, unrelated dead `.test.ts`
  vitest files and other pre-existing fixture-type issues, confirmed via
  `git diff` that none touch files from this task). `eslint` on every touched
  file: the only failures are pre-existing `react-hooks/set-state-in-effect`
  errors on `void load()` calls this task's diff does not touch (confirmed via
  `git diff | grep -c "void load()"` = 0 in the affected files) and one
  pre-existing unused-var warning in `posting.test.mts` also outside this
  diff. `npm run build` succeeds with no errors, full route manifest
  generated including every touched route.
- **Not implemented as its own line item, but a genuine finding along the
  way:** `postSingleDcrItem`'s own internal `fetchOpenInstallments` call
  (`posting.ts:964`, now a different line after Phase 4's insertions —
  re-grep) was deliberately left untouched per the plan's explicit guard.

### Live proof (not just tests)

Reproduced the original bug's exact steps again post-implementation, against
the real running app and the real database, on the same account
(AN300374/Josefina Villanueva) used for the pre-implementation reproduction
(see the 2026-09-15 entry above):

- **Collector Accounts list** (`/collector/accounts`): AN300374 now reads
  `3,503,215.98` with `→ ₱3,453,215.98 after pending` beneath it — a ₱50,000
  reduction, exactly matching the outstanding test payment recorded during the
  original audit. All 5 real (non-test) accounts that carry a "DCR pending"
  badge on the live list now show the corrected figure, not just this one
  test case.
- **Record Payment screen** for the same account: header now reads
  `Outstanding ₱3,503,215.98 (posted) · ₱3,453,215.98 after pending`; the
  ledger table has a new "Pending" column (reads `—` on every row here
  because this particular payment was never added to a DCR, so it's correctly
  counted only at the account level — A.3's "unallocated pending" case,
  exactly as designed).
- The ₱50,000 test payment (`EFFBAL-TEST-002`) was deleted from the database
  after this verification — it was never committed to any DCR, so removing it
  is a clean no-op on the rest of the account.

### What's left

- **Phase 7 only** — the client demo/decision points in Part F. Nothing else
  from Phases 1–6 is outstanding.
- The document-formatting work from the earlier session (compact layout,
  Promissory Note, Disclosure Statement) is still sitting uncommitted in the
  working tree from before this task started — unrelated to this feature,
  not touched by it, flagged here only so it isn't mistaken for output of
  this session.
- This implementation itself has not yet been committed to git.
