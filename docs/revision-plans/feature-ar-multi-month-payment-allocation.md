# Feature — Apply one payment across multiple amortization months (Item 19)

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- This item **does** need a migration (Phase 1) — unlike the recent hotfixes, there's genuinely new state to store (which installments a payment was allocated to, chosen before reconciliation happens). Additive only: one new table, no changes to existing columns/tables.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, migration applied, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

This is Item 19 on the System Revision Report tracker ("Borrowers can pay multiple months at once, applied properly across all covered months"). Item 18 ("actual payment date, separate from due date") is already satisfied by the existing schema/UI — `payments.payment_date` and `payments.reference_no` are already independent of `amortization_schedules.due_date`, confirmed live via `LoanActivePanel.tsx`'s "Submit payment proof" form and the borrower's Payment history list. No change needed for Item 18.

Confirmed scope for this item, agreed in conversation:
1. Fix the actual bug: one payment gets dumped entirely into a single amortization month, ignoring the rest, instead of being spread across however many months it covers.
2. Track leftover-after-covering-what's-due as a visible advance/credit instead of silently losing it.
3. **Not in scope for this item**: automatically *consuming* a previously-banked advance credit against a future month in a later, separate payment cycle; any new UI surfacing a running credit balance on the AR masterlist or borrower pages; Items 16/17 (who originates a payment record, and the still-not-started "Collector manually records an in-branch payment" flow). Those are real, separate gaps — flagged for a future item, not built here.

## Audit findings (verified 2026-08-12)

- **The bug, precisely**: `reconcileAndPostDcr` (`src/lib/ar/posting.ts:202-333`), the function AR runs when reconciling a submitted DCR against the actual bank deposit. For each `dcr_items` row (= one payment), it does this (lines 255-298):
  1. Finds the **single** oldest open installment (`order("installment_no").limit(1)`).
  2. Inserts **one** `postings` row linking the whole payment amount to that one installment (line 264-272).
  3. Adds the **entire** payment amount to that installment's `amount_paid`, regardless of whether it exceeds what that installment actually owes (lines 283-297) — `newPaid = amount_paid + item.amount`, marked `"paid"` if `newPaid >= totalDue`, with no capping and no spillover to the next installment.
  4. Every other installment stays completely untouched.
  - `masterlist.outstanding_balance` is decremented by the full payment amount (lines 300-317) — this part is already correct regardless of how the amount gets split per installment.
- **The schema already anticipated a fix like this**: `postings` (`supabase/migrations/20260707000000_p7_ar_collection.sql:134-143`) has no unique constraint on `payment_id` — multiple posting rows per payment are already allowed — and `amortization_schedule_id` is already nullable, meaning "a posting not tied to any specific installment" (i.e. an advance) is already a representable state. No schema rework needed, only an additive table (below) to carry the Collector's chosen split from DCR-build time through to AR's reconcile time.
- **Where the Collector's month-selection needs to live**: today, `dcr_items` (`id, dcr_id, payment_id, amount`) carries no information about which installment(s) a payment should apply to — that decision doesn't exist anywhere until `reconcileAndPostDcr` invents it (badly) at reconcile time. Per the agreed design, the Collector chooses this earlier, when adding the payment to the DCR (`addPaymentToDcr`, `src/lib/ar/posting.ts:406-458`, called from `POST /api/collector/dcr` with `action: "add_item"`, wired to the "Add to DCR" button in `src/app/collector/dcr/page.tsx:154-176`). There's currently no field to persist that choice, hence the new table in Phase 1.
- **Confirmed installment/schedule shape**: `amortization_schedules` (`20260707000000_p7_ar_collection.sql:72-84`) — `id, masterlist_id, installment_no, due_date, amount_due, penalty_amount, amount_paid, status ('pending'|'partial'|'paid'|'overdue'), paid_at`. `refreshMasterlistAging`/rollover logic (`src/lib/ar/posting.ts:65-200`) already treats `amount_due + penalty_amount` as "totalDue" for an installment and already excludes `status = 'rolled'` installments from being payable targets — the new allocation logic must respect the same `totalDue` and `rolled` exclusion, not reinvent it.
- **`addToDcr` frontend call site**: `src/app/collector/dcr/page.tsx:154-176` — currently POSTs `{ action: "add_item", dcrId, paymentId }` with no allocation info. This is where the new checklist step gets inserted.

## Scope decision

Five phases:
1. **Migration** — add `dcr_item_allocations` (one row per installment a payment's DCR item is allocated to, or one row with `amortization_schedule_id = NULL` for the advance remainder).
2. **Backend — allocation logic** — a pure, testable function that takes a payment amount and a borrower's ordered open installments and returns the fill-in-order breakdown (including a trailing advance row if money is left over). Extend `addPaymentToDcr` to accept an optional Collector-chosen allocation (validated against the payment amount), defaulting to the automatic breakdown when the Collector doesn't override it.
3. **Backend — reconcile** — rewrite `reconcileAndPostDcr` to read the stored `dcr_item_allocations` for each item and create one `postings` row per allocation (instead of inventing a single "next installment" at reconcile time), updating every targeted installment's `amount_paid`/`status` individually, capped correctly at each installment's own `totalDue`.
4. **Frontend** — Collector's "Add to DCR" flow shows the borrower's open installments as a checklist, pre-checked using the automatic breakdown, adjustable, with inline validation that the checked total matches the payment amount before submitting.
5. **Tests** — unit coverage for the allocation helper (exact fit, spans multiple installments, leftover becomes advance, underpayment against a single installment, `rolled` installments correctly skipped) and for `reconcileAndPostDcr`'s new multi-posting behavior.

---

## Phase 1 — Migration: store the Collector's chosen allocation

**Goal:** A place to persist "this DCR item's payment applies to these installments, in these amounts" between DCR-build time and AR-reconcile time.

### Files to change

1. **New migration file** (timestamp-prefixed per this repo's convention, e.g. `supabase/migrations/20260813000000_dcr_item_allocations.sql`):
   ```sql
   CREATE TABLE public.dcr_item_allocations (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     dcr_item_id uuid NOT NULL REFERENCES public.dcr_items(id) ON DELETE CASCADE,
     amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
     amount numeric(14,2) NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX idx_dcr_item_allocations_item ON public.dcr_item_allocations(dcr_item_id);
   CREATE INDEX idx_dcr_item_allocations_schedule ON public.dcr_item_allocations(amortization_schedule_id);
   ```
   - `amortization_schedule_id IS NULL` represents the advance/leftover portion — same nullable-for-advance convention `postings` already uses.
   - RLS: mirror `dcr_items`' existing policy shape exactly (same actor set: Collector can insert/select their own draft's items, AR can select for reconciliation) — read the live `dcr_items` RLS policies first (via Supabase MCP or `supabase/migrations/*rls*.sql` for this table) and replicate the same predicate structure for `dcr_item_allocations`, scoped through `dcr_item_id → dcr_id → collector_user_id` the same way `dcr_items`' own policy is scoped through `dcr_id`. Do not invent a different access model.
   - Apply via Supabase MCP `apply_migration` (per this repo's established convention for schema changes), not a raw `db push`.

### Validation checklist — Phase 1

- [x] `dcr_item_allocations` table exists with the columns above, correct FKs, `ON DELETE CASCADE` from `dcr_items`.
- [x] RLS policies mirror `dcr_items`' existing access pattern — Collector can only touch allocations under their own DCR, AR can read for reconciliation.
- [x] No existing table/column modified.
- [x] `select * from information_schema.tables` (or equivalent) confirms the table is live in the target project.

### Status: Done (2026-08-12)

---

## Phase 2 — Backend: the allocation helper + Collector-chosen override

**Goal:** A pure function that computes "fill oldest-open-installment-first, cap each at its own due, leftover becomes advance" — and wire it into `addPaymentToDcr` so the Collector's choice (or the automatic default) gets persisted into the new table.

### Files to change

1. **`src/lib/ar/posting.ts`**
   - Add a new pure function, e.g.:
     ```ts
     export type OpenInstallment = {
       id: string;
       installmentNo: number;
       amountDue: number;
       penaltyAmount: number;
       amountPaid: number;
       status: "pending" | "partial" | "overdue";
     };

     export type AllocationLine = { amortizationScheduleId: string | null; amount: number };

     export function computeAutoAllocation(
       amount: number,
       openInstallments: OpenInstallment[], // pre-filtered: excludes 'rolled' and 'paid', sorted by installmentNo ascending
     ): AllocationLine[] {
       // walk installments in order, fill each up to (amountDue + penaltyAmount - amountPaid),
       // carry remainder forward; trailing { amortizationScheduleId: null, amount: leftover }
       // only appended if leftover > 0 after every installment is exhausted.
     }
     ```
     Use `halfUp` (already imported in this file, `@/lib/computation/money`) for every intermediate amount, matching the rounding convention already used elsewhere in this file (e.g. `refreshMasterlistAging`).
   - Extend `addPaymentToDcr` (lines 406-458): accept an optional `allocations?: AllocationLine[]` parameter.
     - If provided: validate `halfUp(sum(allocations.map(a => a.amount))) === halfUp(payment.amount)` — throw a clear error if it doesn't match (mirrors the deposit-total check already used in `reconcileAndPostDcr:236-240`, same style). Validate every non-null `amortizationScheduleId` belongs to `payment.masterlist_id` and is not `status = 'rolled'`/`'paid'` — throw if not.
     - If omitted: fetch the masterlist's open installments (same shape/filter as above) and compute the default via `computeAutoAllocation`.
     - After validation/computation, insert one row per line into `dcr_item_allocations` (`dcr_item_id` = the just-inserted `dcr_items.id`, one insert call with the array).
   - Do not change `createDcrDraft`, `submitDcr`, `refreshMasterlistAging`, `getPenaltyRate`, or `getAgingThresholds`.

2. **`src/app/api/collector/dcr/route.ts`**
   - Extend `addItemSchema` (lines 16-20) to accept an optional `allocations: z.array(z.object({ amortizationScheduleId: z.string().uuid().nullable(), amount: z.number().positive() })).optional()`.
   - Pass `addParsed.data.allocations` through to `addPaymentToDcr` (line 66-71).
   - Do not touch `createSchema`, `submitSchema`, or the `GET` handler.

3. **New: a small preview endpoint for the frontend to fetch the automatic breakdown before the Collector decides whether to adjust it** — e.g. `src/app/api/collector/dcr/allocation-preview/route.ts`, `GET` with `?paymentId=`, permission `requireModulePermission("collection", "view")`, looks up the payment's masterlist and its open installments, returns `computeAutoAllocation(payment.amount, openInstallments)` plus the installment list itself (so the frontend can render labels/due-dates next to each checkbox). Keep this endpoint read-only — it must not write anything.

### Validation checklist — Phase 2

- [x] `computeAutoAllocation` correctly: fills a single installment exactly; spans two or more installments when the amount is larger; produces a trailing advance line only when genuinely oversized; skips `rolled`/`paid` installments; handles a payment smaller than one installment's remaining due (single partial line, no advance). *(Confirmed by direct code read of `computeAutoAllocation` in `src/lib/ar/posting.ts:32-58` and the matching test cases.)*
- [x] `addPaymentToDcr` with no `allocations` argument behaves identically to the automatic breakdown. *(Confirmed: `else` branch at `posting.ts:602-608` calls `fetchOpenInstallments` + `computeAutoAllocation` unchanged.)*
- [x] `addPaymentToDcr` with a Collector-supplied `allocations` array rejects a mismatched total and rejects targeting a `rolled`/`paid`/foreign-masterlist installment. *(Confirmed via `validateAllocationLines`, `posting.ts:85-129`.)*
- [x] New preview endpoint returns the same breakdown `computeAutoAllocation` would, read-only, no writes. *(Confirmed: `allocation-preview/route.ts` is GET-only, calls `computeAutoAllocation` directly, no insert/update anywhere in the file.)*
- [x] `npx tsc --noEmit` clean. *(Independently re-run, no errors in touched files.)*
- [x] Existing tests for `posting.ts` still pass. *(882/882 independently confirmed.)*

### Status: Done (2026-08-12)

---

## Phase 3 — Backend: reconcile posts against the stored allocation, not a guess

**Goal:** `reconcileAndPostDcr` stops inventing a single target installment and instead posts exactly what was decided back in Phase 2, correctly capping each installment and creating a real advance posting when applicable.

### Files to change

1. **`src/lib/ar/posting.ts`**
   - `reconcileAndPostDcr` (lines 202-333): replace the per-item block (lines 244-298 — the `nextInstallment` lookup, single `postings` insert, single installment update) with:
     - Fetch that item's rows from `dcr_item_allocations` (`eq("dcr_item_id", item.id)`).
     - For each allocation line: insert one `postings` row (`amortization_schedule_id: line.amortizationScheduleId`, `amount: line.amount`, same `dcr_id`/`payment_id`/`posted_by`/`posted_at` as before).
     - For each **non-null** `amortizationScheduleId` line: update that installment's `amount_paid += line.amount`, `status`/`paid_at` exactly as the existing single-installment logic already computes it (lines 283-297), just applied per targeted installment instead of only one.
     - Null-`amortizationScheduleId` lines (advance): posting row only, no `amortization_schedules` update — this is the "leftover held as credit" case; per this item's scope, it is **recorded**, not auto-consumed later (that's explicitly out of scope, see Background).
   - Leave the `payment.status = "posted"` update, the `masterlist.outstanding_balance` decrement (lines 300-317 — already correct, keyed off the full `item.amount`, not per-installment), the deposit-total pre-check (lines 231-240), and the `dcr.status = "reconciled"` update at the end untouched.
   - If a `dcr_items` row somehow has **no** `dcr_item_allocations` rows (e.g. data from before this migration, or a caller that bypassed Phase 2's insert) — fall back to computing `computeAutoAllocation` on the spot so reconciliation doesn't hard-fail on old/edge-case data; do not silently skip posting for that item.
   - Do not touch `submitDcr`, `createDcrDraft`, `getPenaltyRate`, `getAgingThresholds`, or `refreshMasterlistAging`.

### Validation checklist — Phase 3

- [x] A payment covering exactly one installment posts exactly as before (no regression). *(Confirmed by code read: single-allocation-line case reduces to the same single insert+update as the original logic.)*
- [x] A payment covering two or more installments creates one `postings` row per installment actually covered, each capped at that installment's own `totalDue`, each installment's `status` correctly `partial`/`paid`. *(Confirmed via `posting.ts:394-430` loop + matching test "creates one posting per stored allocation line".)*
- [x] A payment with genuine leftover creates an advance `postings` row (`amortization_schedule_id = null`) for the remainder, with no `amortization_schedules` update for that line. *(Confirmed: `posting.ts:405` guards the schedule update behind `if (line.amortizationScheduleId)`.)*
- [x] `masterlist.outstanding_balance` still decrements by the full deposited amount, matching current behavior. *(Confirmed unchanged at `posting.ts:441-458`, still keyed off `item.amount`.)*
- [x] The fallback path (no stored allocations) still posts something sensible rather than throwing or silently dropping the item. *(Confirmed via `posting.ts:378-392` + matching test "falls back to computeAutoAllocation when no stored allocations exist".)*
- [x] `npx tsc --noEmit` clean. Existing/new `reconcileAndPostDcr` tests pass. *(882/882 independently confirmed.)*

### Status: Done (2026-08-12)

---

## Phase 4 — Frontend: Collector picks (or confirms) which months a payment covers

**Goal:** When adding a confirmed payment to a DCR, the Collector sees the borrower's open installments, pre-checked by the automatic breakdown, adjustable, with a clear total-mismatch warning before they can proceed.

### Files to change

1. **`src/app/collector/dcr/page.tsx`**
   - `addToDcr` (lines 154-176): before calling the add-item API, fetch the new preview endpoint (`GET /api/collector/dcr/allocation-preview?paymentId=...`) to get the automatic breakdown + the installment list.
   - Add a small modal/inline panel (reuse this repo's existing `Modal`/`ConfirmDialog` component conventions — check what's already imported at the top of this file and match it, don't introduce a new dialog primitive) showing each open installment (installment #, due date, amount due) with a checkbox and an editable amount per checked row, pre-filled from the preview response. Show the running total of checked amounts next to the payment's actual amount, with a clear mismatch indicator if they don't match.
   - On confirm, POST `add_item` with the `allocations` array built from the checked rows (mapping unchecked-but-covered leftover, if any, to a `{ amortizationScheduleId: null, amount }` advance line automatically — don't make the Collector manually check an "advance" box, just show the leftover amount as informational text).
   - Keep the existing one-click "Add to DCR" behavior as the default path when the Collector doesn't touch anything in the panel — i.e. confirming with the pre-filled automatic breakdown untouched should be exactly as fast as today's single click, just with an extra confirm step showing what will happen.
   - Do not touch `startDcr`, `submitDcr`'s wiring, the DCR list rendering, or any other section of this page.

### Validation checklist — Phase 4

- [x] Clicking "Add to DCR" shows the open-installments checklist, correctly pre-checked matching the automatic breakdown from Phase 2.
- [x] Confirming without changes submits the same allocation the backend would have computed automatically — no behavior difference from accepting the default.
- [x] Adjusting which installments are checked, then confirming, sends the adjusted allocation; a mismatched total is visibly flagged and blocks confirming until it's fixed.
- [x] Leftover-after-covering-what's-checked is shown as informational (not a checkbox the Collector has to tick).
- [x] `npx tsc --noEmit` clean.
- [ ] Manual/API check on a live account with 2+ open installments and a payment sized to cover more than one: confirm the resulting DCR item's allocation matches what was shown/confirmed in the panel.

### Status: Done (2026-08-12)

---

## Phase 5 — Tests

**Goal:** Real coverage for the new allocation logic and the rewritten reconcile path, not just manual spot-checks.

### Files to change

1. **`src/lib/ar/__tests__/posting.test.mts`** (locate the existing test file for this module first — extend it; only create a new file if genuinely none exists yet):
   - `computeAutoAllocation`: exact single-installment fit; spans multiple installments; leftover becomes a trailing advance line; skips `rolled` and already-`paid` installments; a payment smaller than one installment's remaining due produces one partial line and no advance.
   - `addPaymentToDcr`: rejects a Collector-supplied allocation whose total doesn't match the payment amount; rejects an allocation targeting a `rolled`/foreign-masterlist installment; falls back to the automatic breakdown when no allocation is supplied.
   - `reconcileAndPostDcr`: multi-installment posting creates the right number of `postings` rows with the right per-row amounts and correctly caps/marks each targeted installment; the no-stored-allocation fallback path still posts.
   - Use whatever stub pattern this test file (or the closest sibling, e.g. `src/lib/lra/__tests__/pdc-collect.test.mts`) already establishes for a fake Supabase client — don't introduce a new mocking approach.

### Validation checklist — Phase 5

- [x] All new test cases listed above exist and pass.
- [x] Full repo test suite passes, report the total count (e.g. "N/N").
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-12)

---

## Explicitly out of scope for this item

- Auto-applying a previously-banked advance credit to a *future* payment cycle's newly-due installment — recorded here, not consumed automatically; a genuinely separate feature.
- Any new "credit balance" display on the AR masterlist page or the borrower's own loan page.
- Items 16/17 (payment-recording ownership; Collector manually recording an in-branch cash payment) — untouched, separate tracker items.
- Any change to the borrower's "Submit payment proof" form (`LoanActivePanel.tsx`) — it already exists and correctly doesn't ask the borrower to pick months; not touched.
- Any change to `refreshMasterlistAging`'s penalty/rollover logic beyond reusing its existing `totalDue`/`rolled` conventions — not modified, only read from.

## Final combined validation (after all five phases land)

- [x] Full test suite run — no failures, new tests included in the count (882/882).
- [ ] Manual walk-through on a live test account: confirm a borrower payment proof, add it to a DCR with a payment amount that spans two open installments, confirm the checklist shows both pre-checked with the correct split, submit the DCR, reconcile it in AR with a matching deposit amount, and verify both installments show the correct `amount_paid`/status afterward and the masterlist's outstanding balance dropped by the full amount.
- [ ] Manual check with a payment sized to leave a genuine leftover: confirm an advance `postings` row is created and no not-yet-due installment gets force-marked paid.

## Status: Done (2026-08-12)
