# AR Bounced-Check Recording Implementation Plan

**Goal:** When a deposited check bounces, AR clicks a dedicated "Bounce" action (next to today's "Post" and "Reject") on that DCR line item. It records a permanent, visible entry on the account's ledger — posted as ₱0/₱0 (no real money moved, no net effect on the balance) — carrying the bank's own return code as its reference, exactly as described by the client.

**Design correction, 2026-09-24 (post-implementation):** the first shipped version rendered the bounce row with `debit = credit = <the bounced amount>` (e.g. both ₱100,000), mirroring the existing "Move of Payment" self-cancelling row. Live review of the actual rendered ledger raised the question "why 100,000 instead of 0?" — the client's own transcript language ("record it as payment, but zero") was about the literal displayed amount, not just the net balance effect. Corrected to post `debit: 0, credit: 0`. This still doesn't collapse into an invisible blank row, because Date, Reference No., and the "bounced" status badge all render regardless of the amount being zero — only the Debit/Credit cells show as "—", which is fine since a bounce isn't a real payment amount to display in the first place.

**Design correction, 2026-09-24 (row-nesting follow-up):** originally the bounce rendered as its own standalone row at the bottom of the ledger. Live feedback ("can we just move it where the borrower or remedial picked installment, just like the if a schedule have multiple payment") asked for it to nest under its target installment instead, using the same expand/collapse grouping already used for multiple real payments on one schedule — so `fetchAccountBouncedItems` (`src/lib/collection/account-postings.ts`) now resolves and returns the `scheduleId` from `dcr_item_allocations` (recorded at "Add to DCR" time, so it survives even though a bounce never posts), and `buildAccountLedgerRows` pushes the bounce row immediately after any real payments on that same schedule, right where the plain "installment" placeholder row would otherwise have gone. Caught two follow-on bugs while implementing this: (1) a lone bounce with no real payment on its installment still rendered a duplicate blank "installment" placeholder row alongside it, since the placeholder branch didn't know to skip itself when a bounce (rather than a credit) had claimed the row — fixed by gating that branch on `credits.length === 0 && bounces.length === 0`; (2) once nested, a bounce-only installment's "This Month"/"Penalty Left" cells (`monthRemaining`/`penaltyRemaining`) rendered as a blank "—" instead of the amount actually still owed, and — because the collapsed group header reads its status/remaining figures off the *last* row in the group, which is always the bounce — that blanked the whole group's header too, and silently dropped that installment out of the Report Total footer's sums (caught from a live screenshot). The row had been built with the same `NO_REMAIN` (both null) used by other zero-money marker rows like Move of Payment, which is right for a marker that truly has no bearing on what's owed — but a bounce doesn't reduce what's owed either, so the correct value is the schedule's actual still-outstanding amount, not null. Fixed by having the bounce row compute it via the same `schedRemaining()` helper the plain placeholder row already used.

**Design correction, 2026-09-25 (group-header status follow-up):** same "reads the *last* row" issue as above surfaced a third time, now on the group header's status badge. `AccountLedger.tsx` always pushes credits for a schedule before its bounces (an ordering decision, not chronology — see the row-nesting correction above), so once nesting shipped, the bounce row was *always* the last row in its group regardless of when it actually happened. That meant if a borrower paid the installment again after the bounce (a second, successful check that fully or partially covers it), the group header kept showing the red "bounced" badge forever instead of the installment's real, current status — reported live: "i bounce the schedule first, but after i paid, the overall status remain bounced." Every non-bounce row in a group already carries the installment's true current status (`statusLabel(schedule.status)` — identical on every payment row for that schedule, since it comes from the schedule record itself, not per-payment history), so the header now prefers the last *non-bounce* row's status over the literal last row, falling back to "bounced" only when nothing else in the group has resolved it yet (a bounce-only group).

**Root cause:** No such concept exists today. AR's only two actions on a pending DCR item are Post (`reconcileDcrItem`, `posting.ts:1045-1120`) and Reject (`rejectDcrItem`, `posting.ts:1175-1274`). Reject **deletes** the `dcr_items` row outright after snapshotting it into a jsonb column — it creates no ledger-visible trace at all. Nothing named "bounce," "DAIF," or "returned check" exists anywhere in the codebase.

**Approach:** Reuse the existing Post/Reject infrastructure as closely as possible rather than inventing new machinery: the same `deposit_reference`/`deposit_amount` fields already on `dcr_items` (used today for Post's bank-reconciliation reference) become where AR types the bank's return code — exactly the field the client pointed to in the meeting ("that reference number... DAIF... you won't need a separate remarks field, that's what we'll use"). A new `bounceDcrItem()` function sets the item's status to a new `'bounced'` value (never deletes it, unlike Reject) and **does not touch the `postings` table at all** — this is what guarantees a genuinely zero effect on the balance, since every existing write to `postings` is treated by the ledger as money in. The bounce is instead rendered as its own dedicated ledger row, built directly from the `dcr_items` row itself (mirroring how this codebase already renders a different self-cancelling case, "Move of Payment," as its own row kind with equal debit and credit) — sourced in **every place this system already renders an account ledger**: AR's own account view and the borrower's own loan page both call the same `buildAccountLedgerRows` function directly; Collector's and Remedial's account pages call `buildDeskLedgerRows`, a thin wrapper around that same builder. Four screens, one shared row-construction function to extend, four API routes to feed it.

**Tech stack:** Next.js (App Router) + TypeScript, Supabase Postgres, `node --test` on `.mts` files (`package.json:10`).

**Source:** UAT #65 discussion, 2026-09-23 session, tracked at `docs/uat-issues-2026-09-23.md` item 2. Client's own words, quoted from the transcript: *"maglarecord po siya as payment. Pero zero"* (it records as a payment, but zero); *"merong debit, merong credit, parang sinisero out niya lang"* (there's a debit, there's a credit, it just zeroes out); *"itong reference number na ito, nang DAEB [DAIF] to... hindi mo na kailangan lagyan ng remarks"* (this reference number, it's DAIF... you won't need to add a remarks field); *"hindi siya blocker eh, parang reference kasi siya"* (it's not a blocker, it's more of a reference).

## Open questions (resolve before implementing)

None. Both resolved 2026-09-24: the bounce entry must be visible everywhere this system already shows an account ledger — AR, Collector, Remedial, **and the borrower's own portal**. This corrects an earlier draft of this plan, which incorrectly claimed no borrower-facing ledger exists; it does (`src/components/borrower/LoanActivePanel.tsx`, confirmed below), and it already calls the exact same `buildAccountLedgerRows` function AR's own page calls. Extending the bounce row to the borrower's view is the same shape of change as extending it to Collector/Remedial — one more existing API route to feed the same new data into — not a new feature.

---

## Live database/system validation: 2026-09-24

Project `acopcwlhkovssjnrqygk`, read-only queries; code reads live in this session.

- **`dcr_items` schema** (`information_schema.columns`): `id, dcr_id, payment_id, amount, status, deposit_reference, deposit_amount, posted_by, posted_at, interest_discount_amount, interest_discounted_installment_nos, penalty_discount_amount, penalty_discounted_installment_nos, discount_reason, penalty_paid_amount, penalty_paid_installment_nos`. **`deposit_reference` and `deposit_amount` already exist** — these are exactly the fields the client described wanting to type the bank's return code into; no new column is needed for that part.
- **`dcr_items_status_check` constraint** (`supabase/migrations/20260818030036_dcr_items_per_item_reconciliation.sql:9-10`): `check (status in ('pending', 'posted', 'rejected'))`. **A migration is required** to add `'bounced'` to this list — cannot be done in application code alone.
- **`postings` schema**: `id, dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at, penalty_amount` — one signed `amount` column, no debit/credit split, no "kind" column. Confirms (again, for this specific design) that any write to `postings` is always read by the ledger as reducing the balance — there is no native way to post a "debit" through this table. This is why the design below deliberately **never writes to `postings`** for a bounce, rather than trying to construct an offsetting pair through it.
- **`rejectDcrItem`** (`posting.ts:1175-1274`): fetches the item (must be `status === 'pending'`), snapshots it into `dcr.rejected_items` (jsonb), sets `payments.flagged_reason`/`flagged_at`, then **deletes** the `dcr_items` row — comment at `:1249-1251` explains this is deliberate, "same `dcr_items_payment_id_unique` constraint reasoning... the row must be gone before this payment can be re-batched onto a new draft." **This is the opposite of what a bounce needs**: a bounced deposit is not a mis-entered line waiting to be resubmitted — it's a permanent, closed-out fact about that specific payment attempt. The new `bounceDcrItem` must NOT delete the row.
- **`settleDcrStatusIfComplete`** (`posting.ts:1282-1308`): after any item action, checks `dcr_items` for the parent DCR — if any row is still `'pending'`, does nothing; otherwise marks the whole DCR `'reconciled'` if `anyPosted`, else `'rejected'`. **A DCR containing only bounced items (no posted ones) would today be wrongly marked `'rejected'`** by this exact logic, since it only checks for `'posted'`. This function must be updated to treat `'bounced'` as a processed (non-pending) outcome that still counts toward `'reconciled'`, not `'rejected'` — a bounce is not the same thing as the whole DCR having been thrown out.
- **Reject's route permission** (`src/app/api/ar/dcr/items/[itemId]/reject/route.ts:20-23`): `requireModulePermission("accounting_ar", "execute_trigger")` — same gate reconcile's route uses. The new bounce route uses the identical gate; no new permission slug needed.
- **Reconcile's request body shape** (`src/app/api/ar/dcr/items/[itemId]/reconcile/route.ts:14-17`): `{ depositReference: string, depositAmount: number, depositProofPath?: string }`. The new bounce route reuses this exact shape — `depositReference` becomes where AR types the bank code (e.g. "DAIF"), `depositAmount` is validated against the item's amount the same way reconcile already does.
- **Four ledger-viewing screens, one shared row-construction function, confirmed by grep of every caller of `buildAccountLedgerRows` across `src/app`, `src/lib`, and `src/components` (an earlier pass of this research incorrectly searched only the first two and missed the third — corrected here):**
  1. `src/app/ar/masterlist/[id]/page.tsx` calls `buildAccountLedgerRows` directly, sourcing credits from `postings` via `ledgerEntriesFromPostings` (AR's own account view).
  2. `src/components/borrower/LoanActivePanel.tsx` (rendered inside the borrower's own application page once a loan is active — `applicationStatus` in `["loan_active", "closed", "paid_off"]`) calls `buildAccountLedgerRows` **directly, the same function AR's page calls** (`LoanActivePanel.tsx:325-345`), fed by `postings` + `internalTransferCredits` from `GET /api/borrower/applications/[id]/loan` (`route.ts:127-133, 182-188`). The borrower already has a full account ledger today — balance, per-installment schedule, debit/credit, running balance, reference numbers — built the same way AR's is.
  3. `src/lib/ledger/desk-ledger.ts`'s `buildDeskLedgerRows` wraps the same underlying row-builder, sourcing credits from `postings` the same way (comment at `desk-ledger.ts:39-42`: *"Collector and Remedial share the AR/borrower ledger shape... each posted split lands on the installment it settled"*) — used by both the Collector and Remedial account-detail pages.
  A bounce fix touching only one of these four would be invisible on the other three roles' screens — resolved in Open questions above: all four are in scope.
- **`AccountLedgerRowKind`** (`build-account-ledger-rows.ts:141-147`): closed union `"opening" | "installment" | "payment" | "move_of_payment" | "surcharge_payment" | "totals"`. The existing `"move_of_payment"` kind is the direct precedent for what's needed here: it is built **not** from `payments`/`postings` but from the `amortization_schedules` row's own `moveOfPaymentBatchId`/surcharge fields (`build-account-ledger-rows.ts:483-513`), and renders `debit: surcharge, credit: surcharge` (both populated, net zero) specifically so it stays visible rather than collapsing into a blank row. It deliberately leaves `referenceNo: null` — the new bounce kind is the first to actually populate that field, since that's specifically what the client asked for.
- **`statusVariant` in the ledger UI** (`src/components/ledger/AccountLedger.tsx:83-96`): a plain string-keyed function (`"paid" → success`, `"moved" → warning`, etc.), not an exhaustive switch — confirms a new `"bounced"` status value can be added as one more `if` line with no risk of breaking existing rendering.
- **Row-grouping logic** (`AccountLedger.tsx:111-118`): consecutive rows only collapse into a group when `kind === "payment"` and share a `scheduleId`. A bounce must use its **own distinct kind** (not `"payment"`) so it is never accidentally grouped with, or visually confused for, a real payment on the same installment.
- **No existing test coverage for `reconcileDcrItem` or `rejectDcrItem`** (grep across `src/lib/ar/__tests__/*.mts` for both names returns nothing) — a pre-existing gap in this codebase, not something this plan can build on top of. This plan's own tests for `bounceDcrItem` are new coverage, built from the same stub conventions already used elsewhere in `posting.test.mts` (`makeAddStub`-style table stubs), not an extension of prior tests for the sibling functions.
- **Test runner** (`package.json:10`): `"test": "node --import tsx --test \"src/lib/**/__tests__/*.mts\""`.
- **Migration naming convention** (`ls supabase/migrations`, most recent): `YYYYMMDDHHMMSS_description.sql`.

## Audit findings

1. **Existing representation of "the reconciliation reference"**: `dcr_items.deposit_reference` / `deposit_amount`, already written by `reconcileDcrItem` for a normal Post. This plan reuses these columns for bounce rather than adding new ones — the client explicitly said not to add a separate remarks field, and this is the field that already serves that exact role for a normal deposit.
2. **Every writer of `dcr_items.status`:** `reconcileDcrItem` (→ `'posted'`), `rejectDcrItem` (deletes the row instead of setting `'rejected'` — so `'rejected'` as a literal stored value is, in practice, never actually persisted by current code despite being in the CHECK constraint; it exists in the constraint for the jsonb-snapshot's own record, not as a live row state). This plan adds the third real writer, `bounceDcrItem` (→ `'bounced'`).
3. **Every reader of `dcr_items.status`:** the AR DCR queue's "pending" filter (items no longer `'pending'` drop out of that view — confirmed by `rejectDcrItem`'s `if (item.status !== "pending")` guard being the same contract `bounceDcrItem` must honor), and `settleDcrStatusIfComplete`'s completion check (Live validation above).
4. **Every reader of the account ledger, per role — the "enumerate every variant" the client's own request implies:**

   | Reader | Built by | Data source route | Currently shows a bounce? | Change needed |
   | --- | --- | --- | --- | --- |
   | AR — `src/app/ar/masterlist/[id]/page.tsx` | `buildAccountLedgerRows` | (assembled directly in the page's own server-side data load) | No — no bounce concept exists | Yes |
   | Borrower — `src/components/borrower/LoanActivePanel.tsx` | `buildAccountLedgerRows` (same function as AR, confirmed by import) | `GET /api/borrower/applications/[id]/loan` | No | Yes |
   | Collector — account detail page | `buildDeskLedgerRows` | Collector's account-detail data loader | No | Yes |
   | Remedial — account detail page (shares the `AccountLedger` component and desk-ledger builder with Collector, per this session's earlier work on Remedial parity) | `buildDeskLedgerRows` | Remedial's account-detail data loader | No | Yes |

5. **Prior decision / established precedent to follow, not invent from scratch:** the `"move_of_payment"` row kind (Fixes Plan Phase 4, `docs/revision-plans/feature-move-of-payment-implementation-plan.md`) already solved "a zero-net-effect entry that must still be visible, not hidden as a blank row." This plan's `"bounced_check"` kind is built the same way (self-populated debit/credit, own dedicated kind so it never groups with real payments), differing only in that it also populates `referenceNo`, which `move_of_payment` deliberately leaves blank.

---

## Scope and constraints

### In scope
- Migration widening `dcr_items_status_check` to include `'bounced'`.
- `bounceDcrItem()` in `src/lib/ar/posting.ts` — sets `dcr_items.status = 'bounced'`, `deposit_reference`, `deposit_amount`, `posted_by`, `posted_at`; flags the underlying `payments` row via the same `flagged_reason`/`flagged_at` columns Reject already uses (consistent existing pattern, no new payments-table columns); never writes to `postings`.
- `settleDcrStatusIfComplete` updated so a `'bounced'` item counts as processed (unblocks DCR completion) and, when mixed with or standing alone against posted items, the DCR is marked `'reconciled'`, never `'rejected'`, purely because a bounce occurred.
- New route `POST /api/ar/dcr/items/[itemId]/bounce`, same permission gate and request-body shape as reconcile's route.
- New "Bounce" button on `src/app/ar/dcr/page.tsx`, next to the existing Post/Reject buttons, opening a small confirm step that captures the bank return reference (reusing the same reference-input UI pattern already on this page for Post's `depositReference`).
- New `AccountLedgerRowKind = "bounced_check"` and a `"bounced"` status value, added to `buildAccountLedgerRows` (used directly by both AR's and the borrower's pages) and `buildDeskLedgerRows`/`ledgerEntriesFromPostings` (Collector/Remedial) — plus `statusVariant` in `AccountLedger.tsx`, which all four screens share.
- Fetching the new bounced-items data in all four of this ledger's existing data-source routes: AR's masterlist page load, `GET /api/borrower/applications/[id]/loan`, and the Collector/Remedial account-detail loaders.
- A notification to the Collector who submitted the DCR, mirroring Reject's existing `notifyUser`/`notifyDcrOwner` pattern.

### Out of scope: do not change
- The Reject action itself, or its deletion behavior — untouched; bounce is a new, third action, not a replacement.
- `postings` table schema — no debit/credit split or "kind" column added there; the zero-net effect is achieved entirely by *not* writing to that table for a bounce, not by inventing a paired-posting mechanism inside it.
- Any change to how AR verifies deposits against the bank statement — this plan only adds what happens once AR has already determined a specific item bounced.
- The DCR receipt zero-out validation (tracker item 1) and LRA document layout fixes (tracker item 3) — separate tracked items.
- Making this a required/blocking step anywhere in the workflow — the client was explicit it is "not a blocker... more of a reference."

### Non-negotiable safety constraints
- `bounceDcrItem` must require `item.status === 'pending'` before acting (same precondition `rejectDcrItem` already enforces) — an already-posted or already-rejected item cannot be bounced.
- The balance must be provably unaffected: verified by a test asserting the account's derived balance before and after a bounce is identical, and by the design choice of never touching `postings`.
- `deposit_amount` must be validated against the item's real amount, exactly as `reconcileDcrItem` already validates deposit amount for a normal post — a bounce isn't exempt from that basic sanity check just because no money moves.
- Migration is additive only (widen the CHECK constraint) — no existing allowed status value is removed.

### Contract

**`POST /api/ar/dcr/items/[itemId]/bounce`** — body `{ depositReference: string, depositAmount: number, depositProofPath?: string }` (identical shape to reconcile's). Requires `accounting_ar:execute_trigger`. Returns `{ status: "bounced" }`.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path | AR, item currently `pending` | `{ depositReference: "DAIF - RETURNED, INSUFFICIENT FUNDS", depositAmount: 58000 }` matching the item's real amount | 200; `dcr_items.status = 'bounced'` (still stores the real `deposit_amount` for audit purposes); item's account ledger shows a new row with debit ₱0, credit ₱0, reference "DAIF - RETURNED, INSUFFICIENT FUNDS", date, and a "bounced" status badge — balance unchanged from before the bounce |
| Item already processed | AR | Bounce an item already `posted` or `bounced` | Rejected — "This line item was already processed" (same guard `rejectDcrItem` already uses) |
| Amount mismatch | AR | `depositAmount` doesn't match the item's amount | Rejected — same validation reconcile already performs |
| Unauthorized role | Collector/Remedial hitting this route directly | POST | 403 — no `accounting_ar` grant |
| DCR completion with only bounced items | AR bounces every item on a DCR, none posted | (system) | DCR marked `'reconciled'`, not `'rejected'` — Live validation's `settleDcrStatusIfComplete` fix |
| Collector's own ledger view | Collector, account with a bounced item | Open the account | Sees the same bounced row AR sees — same data, same visual treatment |
| Remedial's own ledger view | Remedial, turned-over account with a bounced item from before turnover | Open the account | Sees the same bounced row |
| Borrower's own portal | Borrower, own loan account with a bounced item | Open their application's loan page | Sees the same bounced row in their existing "Account ledger" section, with the bank's reference visible |
| Historic accounts (pre-this-feature) | Any role | View an old account's ledger | Renders exactly as it does today — no bounce rows exist for old data, nothing retroactively invented |
| Direct DB write bypassing the route | Any authenticated non-AR role | Raw `dcr_items` update setting `status = 'bounced'` | Blocked by existing `dcr_items` RLS write policies (unchanged by this plan — confirmed no RLS policy on `dcr_items` is touched, only the CHECK constraint on allowed values) |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/<ts>_dcr_items_bounced_status.sql` | Widen `dcr_items_status_check` to include `'bounced'` | Schema |
| `src/lib/ar/posting.ts` | New `bounceDcrItem()`; update `settleDcrStatusIfComplete` to treat `'bounced'` as processed | Server-side logic |
| `src/app/api/ar/dcr/items/[itemId]/bounce/route.ts` | New route, mirrors reconcile's | API |
| `src/app/ar/dcr/page.tsx` | New "Bounce" button + confirm modal capturing the bank reference, next to Post/Reject | AR UI |
| `src/lib/ledger/build-account-ledger-rows.ts` | New `"bounced_check"` kind added to `AccountLedgerRowKind`; new input array for bounced items; row construction mirroring the `move_of_payment` pattern but populating `referenceNo` | Shared ledger builder (AR + Borrower) |
| `src/lib/ledger/desk-ledger.ts` | `BuildDeskLedgerInput` gains a bounced-items array; `buildDeskLedgerRows` merges the same new row kind in | Collector/Remedial ledger |
| `src/app/ar/masterlist/[id]/page.tsx` | Fetch bounced `dcr_items` for the account, pass into `buildAccountLedgerRows` | AR data plumbing |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | Fetch bounced `dcr_items` for `ctxData.masterlistId` (same join pattern as the existing `postings` fetch at `:127-133`), add `bouncedItems` to the JSON response (`:182-188`) | Borrower data plumbing |
| `src/components/borrower/LoanActivePanel.tsx` | Read `data.bouncedItems` from the loan API response; pass into the existing `buildAccountLedgerRows({...})` call (`:325-345`) | Borrower ledger wiring |
| Collector and Remedial account-detail data loaders (the API routes feeding `buildDeskLedgerRows` on each page) | Fetch the same bounced-items data, pass into `buildDeskLedgerRows` | Collector/Remedial data plumbing |
| `src/components/ledger/AccountLedger.tsx` | `statusVariant` gains `"bounced" → "danger"` | UI styling |
| `src/lib/ar/__tests__/posting.test.mts` | New `describe("bounceDcrItem", ...)` | Coverage |
| `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts` | New test(s) for the `"bounced_check"` row | Coverage |

## Phase 0: Failing tests first

### Task 0.1: `bounceDcrItem` records the bounce without affecting balance
**File:** `src/lib/ar/__tests__/posting.test.mts`
- [ ] Build a fresh stub (no existing sibling test to extend, per Live validation — construct it from the same table-stub conventions already used for `makeAddStub` elsewhere in this file) covering `dcr_items` (one `pending` row), `payments`, and `dcr`.
- [ ] Assert calling `bounceDcrItem(supabase, itemId, actorId, { depositReference: "DAIF", depositAmount: <item amount> })` updates the item to `status: 'bounced'` with the given reference/amount stored, and does **not** call any `postings` insert (the stub should throw if `postings` is touched, proving the zero-balance-effect design is actually followed, not just believed).
- [ ] Run: `npm test` → Expected: FAIL — `bounceDcrItem` doesn't exist yet.

### Task 0.2: An already-processed item cannot be bounced
**File:** same file
- [ ] Stub an item with `status: 'posted'`; assert `bounceDcrItem` rejects with "already processed."
- [ ] Run: `npm test` → Expected: FAIL (function doesn't exist).

### Task 0.3: Ledger row renders with equal debit/credit and the reference populated
**File:** `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts`
- [ ] Add a test feeding a bounced-item input into `buildAccountLedgerRows`; assert the resulting row has `kind: "bounced_check"`, `debit === 0`, `credit === 0`, `referenceNo === "DAIF"`, and that `balance` after this row equals `balance` before it (unchanged).
- [ ] Run: `npm test` → Expected: FAIL — the new kind/input doesn't exist yet.

## Phase 1: Schema and server-side logic

### Task 1.1: Migration
**File:** `supabase/migrations/<ts>_dcr_items_bounced_status.sql`
- [ ] Forward SQL:
  ```sql
  alter table public.dcr_items drop constraint dcr_items_status_check;
  alter table public.dcr_items
    add constraint dcr_items_status_check
    check (status in ('pending', 'posted', 'rejected', 'bounced'));
  ```
- [ ] Apply via the Supabase MCP `apply_migration` tool against project `acopcwlhkovssjnrqygk`.
- [ ] Read-only verification: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.dcr_items'::regclass and conname = 'dcr_items_status_check';` → confirms `'bounced'` is now allowed, the other three values unchanged.

### Task 1.2: `bounceDcrItem` and the `settleDcrStatusIfComplete` fix
**File:** `src/lib/ar/posting.ts`
- [ ] Add `bounceDcrItem(supabase, dcrItemId, actorId, { depositReference, depositAmount, depositProofPath? })`, structured after `reconcileDcrItem`/`rejectDcrItem`'s existing shape: fetch the item + its payment (same select shape as `rejectDcrItem`'s, `:1181-1205`), require `status === 'pending'`, validate `depositAmount` against the item's real amount (mirror reconcile's existing check), then `update dcr_items set status = 'bounced', deposit_reference = ..., deposit_amount = ..., posted_by = actorId, posted_at = now()`, flag the `payments` row's `flagged_reason`/`flagged_at` (same as reject), call `settleDcrStatusIfComplete`. **Do not call `postSingleDcrItem` or insert into `postings` anywhere in this function** — that is the entire mechanism by which the balance stays untouched.
- [ ] Update `settleDcrStatusIfComplete` (`:1282-1308`): change `const anyPosted = rows.some((row) => row.status === "posted");` to `const anyProcessed = rows.some((row) => row.status === "posted" || row.status === "bounced");`, and use `anyProcessed` in place of `anyPosted` in the subsequent `status: anyProcessed ? "reconciled" : "rejected"` branch.
- [ ] Run: `npm test` → Task 0.1 and 0.2 pass. Run the full suite to confirm no existing `reconcileDcrItem`/`rejectDcrItem`-adjacent test (if any exists indirectly, e.g. through `reconcileAndPostDcr`) regresses from the `settleDcrStatusIfComplete` change.
- [ ] Run: `npx tsc --noEmit` → clean.

**Phase constraints:** `bounceDcrItem` must never reach `postings` — this is a hard constraint verified by Task 0.1's stub throwing if that table is touched, not just a design intention.

## Phase 2: API route

### Task 2.1: New route
**File:** `src/app/api/ar/dcr/items/[itemId]/bounce/route.ts` (new)
- [ ] Mirror `reconcile/route.ts` exactly: same `requireModulePermission("accounting_ar", "execute_trigger")` gate, same Zod body schema (`depositReference`, `depositAmount`, optional `depositProofPath`), calling `bounceDcrItem` instead of `reconcileDcrItem`.
- [ ] Add a `writeAuditEvent` call (`trigger: "bounce_dcr_item"`) mirroring reject's audit shape.
- [ ] Add a notification to the collector who owns the DCR, mirroring reject's `notifyUser`/`notifyDcrOwner` pattern, worded for a bounce specifically (e.g. "AR recorded a bounced check on your DCRR").
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: as AR, POST this route for a pending item with a real bank return reference → 200; item disappears from the "pending" queue view (same as Post/Reject already do).

## Phase 3: AR UI — the third button

### Task 3.1: Add "Bounce" next to Post/Reject
**File:** `src/app/ar/dcr/page.tsx`
- [ ] Add a third `<Button>` alongside the existing Post (`:870-880`) and Reject (`:881-891`) buttons, e.g. `variant="danger-soft"`, opening a small confirm step that reuses the same reference-input field already on this page for Post's `depositReference` (same UI pattern, different submit target and button label — "Bounce" rather than "Post").
- [ ] On confirm, POST to the new bounce route with the entered reference and the item's known amount (pre-filled, matching how Post's `depositAmount` is already pre-filled/validated on this page).
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: click "Bounce," enter "DAIF," confirm → item leaves the pending list; opening that account's ledger (Task 4 below) shows the new row.

## Phase 4: Ledger — every consumer of the shared builder

### Task 4.1: AR's ledger (`buildAccountLedgerRows`)
**File:** `src/lib/ledger/build-account-ledger-rows.ts`
- [ ] Add `"bounced_check"` to `AccountLedgerRowKind`.
- [ ] Add a new optional input to `BuildAccountLedgerInput` (wherever that type is defined in this file) for bounced items: `{ id: string, amount: number, referenceNo: string, date: string }[]`.
- [ ] After the existing unapplied-credits handling and before the `totals` row, push one row per bounced item, styled after the `move_of_payment` construction (`:493-513`) for kind-isolation and `referenceNo` population, but posted as ₱0/₱0 rather than the bounced amount (design correction, 2026-09-24 — see Goal section):
  ```ts
  for (const bounced of input.bouncedItems ?? []) {
    rows.push({
      kind: "bounced_check",
      key: `bounced_check:${bounced.id}`,
      checkNo: null,
      dueDate: null,
      target: null,
      penalty: null,
      discount: null,
      discountSource: null,
      date: bounced.date,
      referenceNo: bounced.referenceNo,
      status: "bounced",
      debit: 0,
      credit: 0,
      balance,
      scheduleId: null,
      ...NO_CARRY,
      ...NO_REMAIN,
    });
  }
  ```
  (`balance` unchanged — carried through from whatever it already was, since this loop doesn't touch the running `balance` variable. The row still renders visibly, not as a blank line, because `formatLedgerMoneyCell` only blanks the amount cells — Date, Reference No., and the "bounced" status badge always render.)
- [ ] Run: `npm test` → Task 0.3 passes.

### Task 4.2: Collector/Remedial's ledger (`buildDeskLedgerRows`)
**File:** `src/lib/ledger/desk-ledger.ts`
- [ ] Add the same bounced-items array to `BuildDeskLedgerInput`, and push the same row shape as Task 4.1 into the rows this function returns (after `ledgerEntriesFromPostings`'s output is merged in, same position conceptually as Task 4.1's placement).
- [ ] Run: `npx tsc --noEmit` → clean.

### Task 4.3: Wire the data through on all four pages
**Files:** `src/app/ar/masterlist/[id]/page.tsx`, `src/app/api/borrower/applications/[id]/loan/route.ts`, `src/components/borrower/LoanActivePanel.tsx`, and the Collector and Remedial account-detail API routes that currently supply `postings`/`schedules` to `buildDeskLedgerRows` on their respective pages
- [ ] AR: fetch `dcr_items` rows with `status = 'bounced'` for this account's DCR items (joined through `payments.masterlist_id`), map to the `{ id, amount, referenceNo, date }` shape, pass as the new input.
- [ ] Borrower: in `src/app/api/borrower/applications/[id]/loan/route.ts`, add a fetch alongside the existing `postings` query (`:127-133`) — `dcr_items` joined to `payments` where `payments.masterlist_id = ctxData.masterlistId` and `dcr_items.status = 'bounced'`, selecting `id, deposit_amount, deposit_reference, posted_at`. Map to the same `{ id, amount, referenceNo, date }` shape and add `bouncedItems` to the response object (`:182-188`). In `LoanActivePanel.tsx`, read `data.bouncedItems ?? []` from the fetch response (alongside the existing `data.postings`/`data.pdcChecks` destructuring at `:168-179`), store it in state, and pass it as the new input in the existing `buildAccountLedgerRows({...})` call (`:325-345`).
- [ ] Collector/Remedial: same fetch, added to whichever existing data-loading route already assembles `schedules`/`postings`/`pdcChecks` for `buildDeskLedgerRows` on each page (identify the exact route per page during implementation — both were confirmed to share `buildDeskLedgerRows` this session, but the exact loader file per role needs a one-time lookup, not guessed here).
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: bounce an item as AR, then open the same account as Collector, as Remedial (if turned over), and log in as the borrower — confirm the same bounced row appears identically on all four.

## Phase 5: Ledger UI styling

### Task 5.1: `statusVariant`
**File:** `src/components/ledger/AccountLedger.tsx`
- [ ] Add `if (status === "bounced") return "danger";` to `statusVariant` (`:83-96`).
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: the bounced row's status badge renders in the "danger" (red) style, visually distinct from a normal payment row.

## Phase last: Regression verification and rollout

- [ ] `npm test` — full suite, expect prior pass count plus this plan's new tests, 0 fail.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint` on every touched file — clean (pre-existing unrelated lint debt elsewhere, confirmed present earlier this session, is out of scope).
- [ ] `npm run build` — clean.
- [ ] Smoke-test table:

  | Role | Scenario | Action | Expected |
  | --- | --- | --- | --- |
  | AR | Pending item, real bank return code entered | Click Bounce, confirm | Item leaves pending queue; ledger shows debit=credit=amount, reference visible, balance unchanged |
  | AR | Already-posted item | Click Bounce | Rejected — "already processed" |
  | AR | DCR where every item bounced, none posted | (system) | DCR marked reconciled, not rejected |
  | Collector | Account with a bounced item | Open account ledger | Sees the same bounced row |
  | Remedial | Turned-over account with a bounced item from before turnover | Open account ledger | Sees the same bounced row |
  | Borrower | Own account with a bounced item | Open their loan page | Sees the same bounced row in their existing ledger |
  | Any | Old account, no bounces ever recorded | Open ledger | Renders exactly as before this change |

- [ ] Data check after deploy (read-only): `select status, count(*) from dcr_items group by status;` — confirms `'bounced'` only appears going forward, existing rows' statuses unchanged.

## Rollback

1. Revert Phases 2–5 (route, UI, ledger rendering) via normal commit reverts — none of them are destructive; reverting just stops new bounces from being recorded or displayed.
2. The migration (Task 1.1) is additive (widens a CHECK constraint) — reverting it (a new forward migration narrowing the constraint back to the original three values) is only safe if no `dcr_items` row has `status = 'bounced'` at that point; if any exist, they must be handled first (e.g., left as historical fact, since a bounce is a real event that already happened — not deleted).
3. Never edit the applied migration file itself — any correction is a new forward migration.

## Commit

```
git add supabase/migrations/<ts>_dcr_items_bounced_status.sql \
        src/lib/ar/posting.ts \
        src/app/api/ar/dcr/items/[itemId]/bounce/route.ts \
        src/app/ar/dcr/page.tsx \
        src/lib/ledger/build-account-ledger-rows.ts \
        src/lib/ledger/desk-ledger.ts \
        src/app/ar/masterlist/[id]/page.tsx \
        src/app/api/borrower/applications/[id]/loan/route.ts \
        src/components/borrower/LoanActivePanel.tsx \
        src/components/ledger/AccountLedger.tsx \
        src/lib/ar/__tests__/posting.test.mts \
        src/lib/ledger/__tests__/build-account-ledger-rows.test.mts
```
(Plus the Collector/Remedial account-detail loader file(s) identified during Task 4.3 — added to this list once found; not guessed here.)

Message: `feat(ar): add a Bounce action for AR DCR reconciliation, recorded as a zero-net ledger entry with the bank's return reference`

## Self-review

1. **Contradictions:** "Non-negotiable safety constraints" requires the balance stay provably unaffected; the design achieves this by never writing to `postings` at all (not by writing offsetting postings rows) — consistent throughout, no section claims a `postings` write happens.
2. **Goal reachability:** For existing accounts (no bounces ever recorded), the new optional `bouncedItems` input defaults to empty and changes nothing (Contract table, "Historic accounts" row). For every future bounce, the single `bounceDcrItem` function is the only writer, and Phase 4 wires its data into all four ledger consumers identified in Audit finding 4's table (AR, Borrower, Collector, Remedial) — reachable for every role that can view an account, including the borrower, which an earlier draft of this plan incorrectly assumed had no ledger at all.
3. **Bypass:** Contract table's "Direct DB write bypassing the route" row confirms the actual boundary is `dcr_items`' existing RLS write policies (unchanged by this plan) plus the CHECK constraint — the route's permission check is a convenience layer, not the security boundary itself.
4. **Existence:** Every file, function, column, and line reference was read or queried live this session (`dcr_items`/`postings` schema, `dcr_items_status_check`, `rejectDcrItem`, `settleDcrStatusIfComplete`, `reconcile/route.ts`, both ledger builders, `AccountLedger.tsx`) — nothing named was guessed. One explicit exception, flagged rather than invented: Task 4.3 names the Collector/Remedial account-detail pages as needing a data-loader change but defers identifying the *exact* loader file to implementation time rather than guessing a path that might not exist — consistent with the rule against naming a file not actually seen.
5. **Consistency:** Files table lists 13 entries (12 certain + 1 flagged-pending-lookup for the Collector/Remedial loader); Commit's `git add` list matches, with the same explicit caveat about the one pending file.
6. **Duplication:** Deliberately did not invent a new "kind" system inside `postings` — reused the existing `deposit_reference`/`deposit_amount` fields (Audit finding 1) instead of adding parallel columns, and modeled the new ledger row on the already-established `move_of_payment` self-cancelling pattern instead of designing a second, different zero-net mechanism.
7. **Placeholders:** `<ts>` in the migration filename is the standard convention placeholder; the one genuinely open item (exact Collector/Remedial loader file path) is explicitly flagged as such, not disguised as a placeholder or guessed name.

**Audit-checklist sections not applicable:** "Check authorization at the database, per role" for the *read* side is effectively answered by Audit finding 4's table (same roles that can already read an account's ledger can read this new row kind, since it's added to the same builders they already call) — no new RLS surface is introduced for reading; the only new authorization surface is the bounce route itself, covered in the Contract table.
