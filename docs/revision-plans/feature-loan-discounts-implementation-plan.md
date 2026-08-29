# Loan Discounts — Implementation Plan (Offset early-settlement discount + New-loan origination discount)

**Source requirements (read these first — this plan does not restate the rules, only the build steps):**
- [feature-early-settlement-discount.md](feature-early-settlement-discount.md) — Offset/old-loan discount, confirmed from the meeting transcript.
- [feature-new-loan-origination-discount.md](feature-new-loan-origination-discount.md) — new-loan-schedule discount, confirmed directly by the user, not from the transcript.

**Status:** Plan only. No code written yet.

---

## Constraints for whoever implements this (read before touching anything)

- **Touch only what's listed in each phase's Scope line.** Two features are being built together because they share a database migration, a ledger column, and a background job — that's *why* they're in one plan, not a license to also refactor things you notice along the way.
- **Two schema fields, additive only, no existing column repurposed.** This plan adds `amortization_schedules.discount_amount` and `computations.origination_discounts` — both new, both default to "no discount" (0 / null). **No existing column's meaning changes.** `amount_due` stays the true, original, contractual amount forever — it is never edited to reflect a discount. Whatever currently reads `amount_due` anywhere in the codebase keeps working unmodified; discount-aware code is additive, not a replacement.
- **Two implementations must stay in sync, by design, matching an existing pattern in this codebase.** `refreshMasterlistAging` (TS, in `posting.ts`) and `refresh_one_masterlist_aging` (SQL, in a migration) already exist as a deliberately duplicated pair (see Fix #9). The reversion logic in Phase 3 must be added to **both**, identically, in the same phase — not one now and one "later."
- **Idempotency is a hard requirement, not a nice-to-have, for every phase touching the aging job.** Fix #9 was a real, live data-corruption incident caused by exactly this kind of background job re-running non-idempotently. Every check added to the aging job in this plan must produce the same result run twice as run once. This is a Done-when criterion, not a suggestion.
- **Locate exact functions before writing code — do not guess file/function names not already confirmed in this plan.** A few pieces (noted per-phase below) were not fully traced during planning; where that's the case, the phase says so explicitly and the first step is to locate the real code, the same way every other item in this session was grounded in actual grep/read evidence before being trusted.
- **Do not touch:** the Seafarer due-date picker work (already shipped), the penalty-idempotency fix (Fix #9's own logic — only *add* a new, separate check alongside it, never edit its existing penalty-accrual branch), the offset/other-loan *labeling* (Fix #1, already correct), or anything under `src/lib/documents` (document generation is unrelated to this feature).
- **After every phase:** run `npx tsc --noEmit -p .` and `npm test` from `loanstar/`. Both clean before moving to the next phase. Current baseline: 1369 tests passing — that number should only go up.
- **Final step (all phases done):** one combined summary covering every file touched across all phases, for a validation pass against this plan and a real `git status`/diff — per the standing validation workflow.

---

## Phase 0 — Schema

**Goal:** Add the two new columns both features depend on. Nothing else.

**Scope:**
- Migration adding `amortization_schedules.discount_amount numeric not null default 0` — the currently-active discount on a not-yet-paid installment. Any code that computes "what does the borrower actually owe on this installment right now" will eventually need to subtract this from `amount_due` (Phase 2/5), but this phase only adds the column — no reads or writes anywhere yet.
- Migration adding `computations.origination_discounts jsonb null` — the staging area for a new loan's proposed per-month discount percentages, set at computation time (CSA/Committee), before the loan is released and before any `amortization_schedules` rows exist for it. Shape: an array of `{ installmentNo: number, percent: number }`, one entry per discounted month.
- Apply both migrations to the live DB via Supabase MCP, same as every other schema change this session (write to both `loanstar/supabase/migrations/` and `supabase/migrations/`, per the standing two-folder gotcha).

**Explicitly out of scope:** any application code. This phase is schema only.

**Done when:** both columns exist on the live DB, confirmed via `information_schema.columns`; every existing row has `discount_amount = 0` and `origination_discounts = null`; full test suite still green (schema-only change, nothing should break).

---

## Phase 1 — New-loan origination discount: backend proposal storage

**Goal:** Let CSA/Committee's computation save/load `origination_discounts` on the `computations` row. No UI yet — this is the data layer the modal in Phase 6 will call.

**Scope:**
- [src/lib/csa/computation.ts](../../src/lib/csa/computation.ts) — `PersistComputationInput` gets an optional `originationDiscounts?: Array<{ installmentNo: number; percent: number }>`. `persistComputation` writes it to the new column. `getActiveComputation` reads it back.
- [src/app/api/csa/applications/[id]/computation/route.ts](../../src/app/api/csa/applications/[id]/computation/route.ts) — add `originationDiscounts` to `computeSchema`, validated: `installmentNo` must be a positive integer not exceeding the computation's own `terms`; `percent` must be `0–100`. Reject anything outside that range with a clear error, same style as the existing Seafarer due-date validation.
- [src/app/api/committee/applications/[id]/override/route.ts](../../src/app/api/committee/applications/[id]/override/route.ts) and [src/lib/negotiation/service.ts](../../src/lib/negotiation/service.ts) — same field, same validation, threaded through `persistOverrideComputation` — mirroring exactly how `dueDay` was added to this path in the Seafarer plan (explicit-wins/preserve-existing pattern).

**Explicitly out of scope:** anything about the Offset feature. Anything about installment rows (they don't exist yet at this stage — this is pre-release data only).

**Done when:** a computation can be saved and reloaded with `originationDiscounts` set, on both the CSA and Committee paths; invalid `installmentNo`/`percent` values are rejected with a clear error; full suite still green.

---

## Phase 2 — New-loan origination discount: apply at release

**Goal:** When a loan with `origination_discounts` set is actually released, the newly-created `amortization_schedules` rows carry the discount.

**Scope — needs to be located first, not guessed:** the schedule-row creation code is in [src/lib/ar/masterlist.ts](../../src/lib/ar/masterlist.ts), function `initializeArAccount` (confirmed: the only `.from("amortization_schedules").insert(...)` call anywhere in `src/`, at line ~176). Read this function fully before editing — confirm exactly what data it has access to at that point (it will need the source `computations.origination_discounts` and each row's own interest portion) before writing the change.
- For each installment being inserted that has a matching `origination_discounts` entry, compute `discount_amount = percent × that installment's interest portion` and set it on the row at insert time.
- Interest-per-installment for this purpose: derive the same way the existing "Add-on interest" line in `ComputationPanel.tsx`'s breakdown is already derived (principal × rate, evenly split per term) — do not invent a different formula; if `initializeArAccount` already computes or receives a per-installment interest figure for another reason, reuse that value rather than recomputing it a second way.

**Explicitly out of scope:** the reversion logic (Phase 3). This phase only sets the initial discounted state at release — it does not need to know how or when it later gets cleared.

**Done when:** releasing a loan with origination discounts set produces `amortization_schedules` rows where the flagged installments' `discount_amount` is correctly populated and every other installment's `discount_amount` stays `0`; full suite green.

---

## Phase 3 — New-loan origination discount: reversion via the nightly aging job

**Goal:** A discounted installment's `discount_amount` reverts to `0` the moment its due date arrives — confirmed to ride on the existing aging job, not a new scheduled process (Rule 6 in the requirements doc).

**Scope:**
- [src/lib/ar/posting.ts](../../src/lib/ar/posting.ts), `refreshMasterlistAging` — add a **new, separate step**, clearly delineated from the existing overdue/penalty logic already in this function: for every schedule row on this account with `discount_amount > 0 AND due_date <= asOf AND status NOT IN ('paid', 'rolled')`, set `discount_amount = 0`. This runs regardless of whether the account has anything overdue — it's a different check than the penalty-accrual one already in this function, and must not be merged into that branch's conditions.
- The SQL twin, `refresh_one_masterlist_aging` — same check, same phase, kept in sync per the standing constraint.
- **Idempotency check, explicit:** running this twice on the same row must leave `discount_amount` at `0` both times — trivially true here since setting an already-0 value to 0 is a no-op, but write the regression test in Phase 8 anyway, matching the aging-parity test pattern from Fix #9 (a multi-run stability test, not just a single-run assertion).

**Explicitly out of scope:** the existing penalty-accrual branch in this same function — read it to understand the function's shape, do not edit its logic or its conditions.

**Done when:** an installment with a due date that has passed has `discount_amount = 0` after the job runs, on both the JS and SQL paths; running the job multiple times produces the same result; full suite green.

---

## Phase 4 — Offset discount: expose per-installment data for the target loan

**Goal:** The Offset modal (Phase 6) needs to show a target loan's remaining installments with real due dates and real interest amounts. This data isn't currently returned anywhere.

**Scope:**
- [src/app/api/csa/applications/[id]/computation/route.ts](../../src/app/api/csa/applications/[id]/computation/route.ts), `GET` handler — the block building `activeLoans` (currently: account no., balance, flat monthly amortization, status, remaining installment count). Add, per active loan, its remaining not-yet-due installments: `{ installmentNo, dueDate, interestPortion }`.
- `interestPortion` per installment: derive from that loan's own active `computations` row (`totalInterest ÷ terms`), same even-split convention noted in Phase 2 — do not invent a per-installment interest-tracking mechanism; this is a read-only derived value for display purposes.
- This is an **additive** change to the `activeLoans` response shape — existing fields (`outstandingBalance`, `monthlyAmortization`, etc.) are untouched, so nothing already reading this response breaks.

**Explicitly out of scope:** anything about writing/saving a discount. This phase only makes data visible that wasn't visible before.

**Done when:** the `activeLoans` response includes real per-installment due dates and interest amounts for each active loan, with already-due installments excluded from the list entirely (not just marked — excluded, since Rule 2 says they're never eligible); full suite green.

---

## Phase 5 — Offset discount: the modal UI + row breakdown

**Goal:** The actual UI, in the Offset (full settlement) section — the piece the user originally asked for.

**Scope — [src/components/csa/ComputationPanel.tsx](../../src/components/csa/ComputationPanel.tsx) only:**
- A new button per Offset row (mirroring the existing "Select loan & months" button/modal pattern used by the *Other Loan* section, [:1226](../../src/components/csa/ComputationPanel.tsx:1226) and [:1293-1392](../../src/components/csa/ComputationPanel.tsx:1293) — reuse the `Modal`/Cancel-Apply convention, do not invent a new modal pattern). Enabled only when the row targets a real tracked loan (not "Custom / external").
- Modal body: list that loan's future installments (from Phase 4's data) as checkboxes, each showing its due date and interest amount. Running summary: gross interest selected → minus one month's interest (termination fee) → **net discount, floored at 0** (per Rule 3 in the requirements doc — two or fewer eligible months can net to zero).
- On Apply: reduce the row's offset amount by the net discount. Store the discount detail on the row (new fields on the existing `otherDeductions.otherLoans[]` entry shape — **corrected during validation**: despite the field being named "offsets" in the payload, that name backs the *"Other Loan amount" (partial payment)* UI section. The *"Offset (full settlement)"* section this feature lives in is backed by the `otherLoans[]` field — confirmed via [ComputationPanel.tsx:823-859](../../src/components/csa/ComputationPanel.tsx:823), where `otherLoanRows` state maps to the `otherLoans` payload key. This is the same reversed-legacy-naming-vs-UI-label situation Fix #1 deliberately left alone. Add the new fields there — additive, e.g. `discountAmount`, `discountedInstallmentNos` — existing fields on that entry untouched).
- Row display: replace the plain editable number with a transparent breakdown once a discount is applied (original balance, discount, final amount) — same spirit as the existing "Combined other-loan total" summary row already in this file, not a new visual language.

**Explicitly out of scope:** any other section of this file. Do not touch the Other Loan section, the rate fields, the Seafarer due-date picker, or the breakdown/summary panel beyond what's needed to display this row's new breakdown.

**Done when:** selecting an active loan in the Offset section shows the new button; the modal correctly excludes due/passed installments; the net discount math matches Rule 3 exactly, including the zero-floor case; the row visibly shows the breakdown after Apply.

---

## Phase 5b — New-loan origination discount: the input UI

**Added after Phase 9's manual walkthrough surfaced a real gap.** Phase 1's own text said the origination-discount data layer was "the data layer the modal in Phase 6 will call" — a stale cross-reference from an earlier draft numbering (the Phase 6 that actually got built is Offset-closure, not a UI phase). No phase in 0–9 ever built the actual input: `originationDiscounts` has full schema, validation, apply-at-release, and reversion, but grepping the whole `src/` tree for `originationDiscounts` turns up zero matches in any component — CSA/Committee have no way to set it. This phase closes that gap.

**Goal:** CSA/Committee can set a percent-per-installment origination discount on the loan they're currently computing, save it, and see it again on reload — mirroring Phase 5's own list-of-rows pattern (`otherLoanRows`) rather than inventing a new one.

**Scope — [src/components/csa/ComputationPanel.tsx](../../src/components/csa/ComputationPanel.tsx) only** (the data layer, validation, and payload plumbing are already done — Phase 1):
- New state `originationDiscountRows: Array<{ installmentNo: string; percent: string }>`, same shape convention as `OtherLoanRow` — free-typed strings, converted to numbers only at payload-build time.
- New section in the form, placed after Terms/Addon months/Due date and before "OTHER DEDUCTIONS" (this is a property of the loan's own schedule, not a deduction) — one row per discount: an installment-number input (bounded visually by the current `terms` value, but not hard-blocked client-side — the server's `validateOriginationDiscounts` is the real gate) and a percent input, a remove button per row, and an "+ Add discount" button — same visual/row pattern as the Offset section's own add/remove rows.
- Hydration: add `originationDiscounts` to the local `Computation` type in this file and populate `originationDiscountRows` from it in the existing hydration effect, the same way `otherLoanRows` is populated from `od.otherLoans`.
- Payload: include `originationDiscounts` (filtered to rows with both a valid installment number and a percent typed) in the POST body next to `otherDeductions` — the field name and shape already match `validateOriginationDiscounts`'s expectations exactly (Phase 1), no server-side change needed.
- Available in both `mode="csa"` and `mode="committee"` (same shared panel, same as every other field here) — no separate Committee-only code path.

**Explicitly out of scope:** any change to Phase 5's Offset section, the rate fields, the Seafarer due-date picker, or any backend file — this phase is UI-only, wiring into an interface that's already fully built and tested.

**Done when:** CSA can add a discount row, type an installment number and percent, save, and see it survive a reload; Committee can do the same on its override path; an out-of-range installment number or percent surfaces the existing server-side error message; full suite green.

---

## Phase 6 — Offset discount: apply at closure + enforce Rule 7 (void origination discounts on early payoff)

**Goal:** When an Offset transaction actually closes out the old loan, the discount takes effect — and any origination discount still sitting on that old loan's own future installments gets voided first, per Rule 7.

**Rewritten during validation — the original approach in this phase was wrong.** The plan originally said "reduce the transfer amount before posting." Read the real `post_internal_transfer` SQL function (confirmed via live DB, not guessed) and that doesn't work:

- `post_internal_transfer` doesn't compute a payoff figure — it takes `internal_transfers.amount` as a given and walks the target loan's unpaid installments **oldest-first**, marking each one `'paid'` only once `amount_due + penalty_amount - amount_paid` for that row is fully covered, stopping the moment the transfer amount runs out.
- **If the transfer amount is simply reduced by the discount, this does not close the loan.** It only pays off however many *earlier, undiscounted* installments the reduced amount can fully cover, and leaves the rest exactly as before — the opposite of what "full settlement" means. The discount has to be reflected in what each installment *needs* to be marked paid, not just in the total handed to the function.

**Corrected scope:**
- **New migration:** modify `post_internal_transfer` to subtract the installment's own `discount_amount` in its payoff-threshold calculation — i.e. `v_total_due := round(v_inst.amount_due + coalesce(v_inst.penalty_amount, 0) - coalesce(v_inst.discount_amount, 0), 2)` in place of the current `v_total_due := round(v_inst.amount_due + coalesce(v_inst.penalty_amount, 0), 2)`. This is the one place discount actually has to be wired into money math that already exists and is depended on elsewhere — treat this migration with the same care as the Fix #9 aging-function migration (rebuild from the live definition, don't hand-reconstruct from an old file).
- **Before `postInternalTransfer` is called** for an Offset transfer with a discount selected (from Phase 5): write `discount_amount` onto the specific installment rows being discounted — both the new Offset discount itself, **and**, per Rule 7, clear (`= 0`) any origination discount those same rows might already be carrying, in that order (origination cleared first, Offset discount applied second — they must never be summed on the same row).
- The transfer's own `amount` (set when the Offset row was entered in Phase 5) must equal the true reduced total the RPC will now need — the sum of `(amount_due + penalty_amount - discount_amount - amount_paid)` across every remaining installment — so the oldest-first loop still fully zeroes out every row and the loan genuinely closes.
- **Locate the actual call site that should trigger this** before writing it — not fully traced in this planning pass. `postInternalTransfer` in [internal-transfers.ts:74](../../src/lib/ar/internal-transfers.ts:74) is confirmed as the function that eventually calls the RPC, but which route/screen calls *it* for an Offset-type transfer (as opposed to a routine "Other Loan" partial payment) needs to be found and read first.

**Explicitly out of scope:** the reversion job (Phase 3) — this phase only handles the moment of closure, a one-time event, not the recurring due-date check.

**Done when:** closing a loan via Offset with a discount selected marks every remaining installment `'paid'` (the loan genuinely closes, not just "smaller balance, still active"); any origination discount those installments were carrying is confirmed cleared first, never combined with the Offset discount on the same row; full suite green.

---

## Phase 7 — Shared: ledger "Discount" column

**Goal:** Both features' discount amounts become visible in the account ledger, per the shared requirement in both spec docs.

**Scope:**
- [src/components/ledger/AccountLedger.tsx](../../src/components/ledger/AccountLedger.tsx) — add a `Discount` column, likely positioned next to `Target`/`Penalty` ([:98-107](../../src/components/ledger/AccountLedger.tsx:98) — both are the other per-installment adjustment columns already there).
- [src/lib/ledger/build-account-ledger-rows.ts](../../src/lib/ledger/build-account-ledger-rows.ts) — locate exactly how the existing `Penalty` column's value is sourced for each row in this file (read it first), and mirror that same sourcing pattern for `Discount`, reading `amortization_schedules.discount_amount`.

**Explicitly out of scope:** any other column, any other part of the ledger's row-building logic beyond adding this one value through.

**Done when:** any installment carrying a non-zero `discount_amount` (from either feature) shows it in the ledger's new column; rows with no discount show a blank/dash, consistent with how the existing columns already handle "nothing to show."

---

## Phase 8 — Tests

**Goal:** Lock in the math and the two idempotency/ordering-sensitive rules, the same way Fix #9's tests locked in the penalty fix.

**Scope:**
- New or existing `__tests__` file for `src/lib/csa/computation.ts` — origination discount validation (bad `installmentNo`, bad `percent`, valid save/reload round-trip).
- `src/lib/ar/__tests__/aging-parity.test.mts` (or a new file alongside it, check first) — reversion logic: a discount on a not-yet-due installment survives a run; a discount on a now-due installment is cleared; a 25-run stability test proving repeat runs never re-trigger anything, matching the existing pattern in this exact file from Fix #9.
- Offset discount math: gross interest sum minus termination fee, including the zero-floor edge case (two or fewer eligible months).
- Rule 7: a test proving that closing a loan via Offset clears any origination discount on that loan's own remaining installments before the offset's own discount is computed — this is the one cross-feature interaction in the whole plan, so it deserves its own explicit test, not just incidental coverage.

**Done when:** `npm test` passes with all new cases; full count only goes up from the 1369 baseline.

---

## Phase 9 — Manual verification (no code)

Walk through, in a real browser session:
1. CSA computes a new loan, sets an origination discount on a future month, releases it → confirm the resulting installment shows the discounted amount.
2. Let that installment's due date pass (or use the dev aging-simulation tool on a test account) → confirm it reverts to the full original amount, and the ledger's Discount column shows it clearing.
3. CSA selects an active loan in the Offset section of a *different* new application, ticks specific future months, confirms the net-discount math shown matches Rule 3 by hand.
4. Apply that Offset with a discount → confirm the old loan closes for the reduced amount, and that if that old loan itself had an origination discount sitting on any of its own future months, it's gone (Rule 7) rather than stacked.
5. Confirm Committee sees and can edit everything CSA set, on both features, matching the access-model conclusion already verified against the pipeline.
6. Confirm the ledger's Discount column renders correctly for both scenarios, and shows nothing for ordinary undiscounted installments.

---

## How to use this file

Each phase is implemented one at a time, in order — several phases depend on earlier ones (Phase 2 needs Phase 0's column; Phase 3 needs Phase 2's data to have something to revert; Phase 6 needs Phase 5's discount math to thread through). After each phase, produce a summary of exactly what changed for validation against this document before moving to the next. After **Phase 9**, produce one **combined summary** covering every phase together — every file touched, every migration, the full final test count — for a single end-to-end validation pass before this item is marked Done anywhere it's tracked.
