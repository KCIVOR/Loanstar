# Collector Discount in DCRR — Implementation Plan

**Source requirements (read these first — this plan does not restate the
rules, only the build steps):**
- [transcription_2.txt](../transcription_2.txt) — Sept 1 meeting, the
  official ask (action item ~1:15:17 and ~1:16:53).
- [transcription.md](../transcription.md) — earlier meeting where the
  "due and demandable" timing rule was first established (for interest) and
  penalty-discount was first floated (~1:07 mark, "Collection or Remedial").
- [deliverables-2026-09-03.md](../deliverables-2026-09-03.md), item 3 —
  the formal deliverable entry and Definition of Done.
- [feature-loan-discounts-implementation-plan.md](feature-loan-discounts-implementation-plan.md)
  — the Offset/Origination discount plan this feature deliberately reuses
  the data pattern from. Read this before touching anything — this plan
  assumes that one's `discount_amount` / atomic-apply-at-posting pattern is
  already live (it is — confirmed via live-DB audit 2026-09-03).

**Status:** Plan only. No code written yet.

---

## Confirmed rules this plan builds to (do not re-derive, these are settled)

1. **Two independent discount targets, two opposite timing rules, usable
   together in the same payment.**
   - **Interest** — only on installments that have **not yet reached their
     due date**. Once overdue, permanently locked, no exceptions. (Same
     rule the Offset discount already enforces.)
   - **Penalty** — only on installments that are **already overdue** (a
     penalty cannot exist on a not-yet-due installment, so this is a
     natural, not an arbitrary, restriction).
   - Both use the same mechanic as the existing Offset discount: pick
     specific installments, apply a percentage to reduce that installment's
     interest (or penalty) portion. No flat "just knock off ₱X" input — do
     not build a second, different kind of discount math.
   - **These are not mutually exclusive on a single payment.** The
     account-closure scenario both meetings describe — a good-paying
     borrower settling an active account in full, right now — is exactly
     the case where *both* the remaining interest and an already-accrued
     penalty would plausibly be waived in the same transaction. Phase
     0/4/5 below build this as two independent, optionally-both-filled
     sections, not an either/or toggle — an earlier draft of this plan
     modeled it as a single toggle and that was wrong, caught on
     re-validation.
2. **No in-system approval workflow.** Management approves a discount
   amount outside the system first. The Collector's field is a *trusted
   entry*, gated by the RBAC permission below, plus a required free-text
   reason/approver note for the paper trail. Do not build an approval
   queue, a second role's sign-off step, or a status gate beyond what
   already exists on `dcr`/`dcr_items`.
3. **Scope: Collector role only**, per the official ask. Remedial was
   mentioned in the earlier, informal meeting but not in the official
   deliverable — out of scope for this plan. (If confirmed wanted later,
   it is a small, additive follow-up: one more `role_field_rules` row and
   one more RLS clause, not a redesign.)
4. **Never touch `amount_due`.** Exactly like the Offset/Origination
   discount, the true contractual amount is never edited. The discount is
   always a separate, subtractable number, applied only at the moment a
   payment is actually posted — never at draft-entry time.
5. **Must be distinguishable from Offset/Origination discounts** in the AR
   ledger — this is a confirmed gap (today, all discounts collapse into
   one indistinguishable `amortization_schedules.discount_amount` figure).
6. **Interest and penalty discounts must use two separate columns, not
   one.** Confirmed by reading the live `post_single_dcr_item` and
   `recompute_outstanding_balance` SQL functions and the TS
   `netInstallmentDue` helper directly: **every** place in this system
   that nets a discount against what's owed uses the exact same formula,
   `amount_due − discount_amount + penalty_amount − amount_paid`. That
   `discount_amount` column has always meant "reduces the interest side
   only" — it is never subtracted from `penalty_amount` anywhere. Writing
   a Collector's penalty discount into that same column would silently
   reduce the wrong side of the balance (interest, not penalty) while
   leaving the actual penalty untouched — a real money-correctness bug,
   not a display issue. Phase 0 and Phase 5 below reflect the fix: a
   second, dedicated column for the penalty discount.

---

## Constraints for whoever implements this (read before touching anything)

- **Touch only what's listed in each phase's Scope line.** This feature
  reuses existing, working machinery (Offset discount's atomic-apply
  pattern, `computeAutoAllocation`, the field-rule RBAC system, the DCR
  draft/submit lifecycle) — reuse it by calling it or extending it
  additively. Do not refactor, rename, or restructure any of it.
- **Do not touch the Offset or Origination discount logic.** Not
  `computeOffsetDiscount`, not `post_internal_transfer`, not
  `refreshMasterlistAging`'s existing origination-reversion branch (Phase 3
  of the loan-discounts plan), not `buildDiscountUnits`. This feature adds
  a **third, independent** discount source that happens to reuse the same
  *shape* of solution — it does not modify how the other two work. If a
  shared helper is genuinely needed (e.g. the percentage/selection math),
  extract it in its own small, additive step and confirm both existing
  call sites still pass their existing tests unchanged — never inline-edit
  `offset-discount.ts`'s existing exported behavior.
- **Do not touch Move of Payment, PDC check lifecycle, or the DCR
  reconciliation/reject flow's existing logic** (`reconcileDcrItem`,
  `rejectDcrItem`, `reconcileAndPostDcr`, `settleDcrStatusIfComplete` in
  `src/lib/ar/posting.ts`) beyond the one additive change Phase 5 requires
  (reading the new discount fields when posting). Their existing status
  transitions, gating, and idempotency behavior must not change.
- **The nightly aging job needs exactly ONE additive change — and nothing
  else.** An earlier draft of this plan said "do not touch the aging job
  at all"; that was **wrong**, caught on re-validation by reading the live
  function. Its 30-day **rollover** step folds an overdue row's unpaid
  balance *plus its penalty* into the next installment's `amount_due` —
  and that formula would carry a Collector-waived penalty forward at full
  value, silently resurrecting the waived amount as principal-side debt.
  Phase 5 specifies the exact one-line fix, in both twins. Beyond that one
  term: **do not** touch the penalty-accrual branch (its `v_outstanding`
  correctly nets only the interest-side `discount_amount` — a penalty
  discount does not belong in the base a new penalty is computed from),
  and **do not** touch the origination-discount reversion branch. Do not
  add a new reversion branch for this feature (Phase 8 explains why none
  is needed).
- **RBAC defaults to "allowed," not "denied," when no rule row exists** —
  confirmed via live-DB audit of `get_field_rule()`. Phase 1 must write an
  **explicit** rule row for Collector; do not rely on the absence of a rule
  to mean "blocked" for any other role.
- **Two-folder migration gotcha** (per this project's standing convention):
  every schema migration must be written to **both**
  `loanstar/supabase/migrations/` and the top-level `supabase/migrations/`,
  and applied to the live DB via Supabase MCP `apply_migration` — not
  `supabase db push`.
- **After every phase:** run `npx tsc --noEmit -p .` and `npm test` from
  `loanstar/`. Both clean before moving to the next phase. Confirm the
  passing-test count only goes up, never down.
- **Final step (Wave 1 done):** one combined summary covering every file
  touched across Phases 0–8, for a validation pass against this plan and a
  real `git status`/diff.
- **Wave 2 (Phase 9, the letter) is a separate, later effort.** Do not
  start it until Wave 1 is validated and confirmed working end-to-end.

---

## Wave 1 — Core capability

### Phase 0 — Schema

**Goal:** Add every column this feature needs. Nothing else.

**Scope:**
- Migration adding to `dcr_items` — **five** columns, not four (revised on
  re-validation: a single `discount_type` flag was originally planned here,
  but that would make interest and penalty discounts mutually exclusive on
  one payment, which contradicts Rule 1 above):
  - `interest_discount_amount numeric not null default 0`
  - `interest_discounted_installment_nos integer[] not null default '{}'`
  - `penalty_discount_amount numeric not null default 0`
  - `penalty_discounted_installment_nos integer[] not null default '{}'`
  - `discount_reason text null` — one shared note covering whichever of
    the two (or both) were used; no need for two separate reason fields,
    per the "don't add beyond what's needed" constraint
  - No `discount_type` column — removed; which discount(s) are present is
    now expressed by which amount(s) are nonzero, not by a separate flag.
- Migration adding to `amortization_schedules`:
  - `discount_source text null` — constrained to `'origination' | 'offset'
    | 'collector'`. Applies only to the **existing** `discount_amount`
    column (interest-side), since a Collector-entered *interest* discount
    would otherwise be indistinguishable from Origination/Offset there.
    Nullable/unset on every existing row (no backfill needed — a null
    source on a nonzero `discount_amount` simply means "predates this
    column," which today means Origination or Offset).
  - `penalty_discount_amount numeric not null default 0` — a **second,
    dedicated** column for a Collector's *penalty* discount. Confirmed
    (see Rule 6 above) this must never share the existing `discount_amount`
    column, since that column's subtraction is hard-wired everywhere to
    the interest side, not the penalty side. No source tag needed on this
    one — it is a brand-new column that only this feature will ever write
    to, so its mere presence already identifies it unambiguously.
- Apply both migrations to the live DB via Supabase MCP, written to both
  migration folders per the standing convention.

**Explicitly out of scope:** any application code. This phase is schema
only. Do not backfill `discount_source` for existing rows — out of scope,
and per Constraint 2 above, not this feature's job to reinterpret history.

**Done when:** all seven new columns exist on the live DB (five on
`dcr_items`, two on `amortization_schedules`), confirmed via
`information_schema.columns`; every existing `dcr_items` row has both
discount amounts at `0`; every existing `amortization_schedules` row has
`discount_source = null` and `penalty_discount_amount = 0`; full test
suite still green.

---

### Phase 1 — RBAC: the permission gate

**Goal:** Only the Collector role can use this feature. Written explicitly,
not by omission.

**Scope:**
- Insert one `role_field_rules` row: module `"collection"`, Collector's
  `role_id`, `field_rules: {"collector_discount": "edit"}`.
- No other role gets a row added. (Per the audit: only Collector and Super
  Admin currently have `collection`-module edit access at all; Super Admin
  bypasses field rules entirely via `is_super_admin()`. Adding deny rows
  for roles that have no module-level edit access to `collection` would be
  a no-op — skip it, per the "don't add code beyond what's needed"
  constraint above.)
- Add one code comment at the insertion point (in the migration) stating
  the fail-open behavior confirmed in this plan's audit: if `collection`
  module edit is ever granted to a new role in the future, that role
  inherits `collector_discount: edit` by default unless a deny row is
  added at that time. This is a documentation-only step — not a code
  change — so a future engineer doesn't rediscover this the hard way.

**Explicitly out of scope:** Remedial (see confirmed rules above).

**Done when:** `get_field_rule('collection', 'collector_discount', <collector-user-id>)`
returns `'edit'`; the same call for a CSA or Committee user (who lack
`collection` module edit entirely) is denied at the module-permission
check before field rules are even consulted; full suite green.

---

### Phase 2 — Eligibility data (which installments qualify)

**Goal:** Before any discount math or UI, the system needs to know, for the
specific account a Collector is recording a payment against: which
installments are eligible for an interest discount (not yet due) and which
are eligible for a penalty discount (already overdue, `penalty_amount > 0`).

**Scope:**
- [src/app/api/collector/dcr/allocation-preview/route.ts](../../src/app/api/collector/dcr/allocation-preview/route.ts)
  — confirmed by reading the route directly: it already runs its own
  inline query selecting `due_date` (not the shared `OpenInstallment` type
  from `posting.ts`, which lacks `due_date` — this route hand-rolls a
  separate, wider select). Extend its existing mapped `installments` array
  with two derived lists — **use the existing `daysPastDue`/
  `computeAgingBucket` boundary from
  [src/lib/ar/schedule.ts](../../src/lib/ar/schedule.ts), do not invent a
  new one.** An earlier draft of this phase used `dueDate > asOf` for
  "not yet due," which is off by one against the convention this codebase
  already uses everywhere else — `computeAgingBucket` treats
  `daysPastDue <= 0` (i.e. `dueDate >= asOf`, due-today included) as
  `"current"`, not overdue. Using the wrong boundary would make an
  installment due *today* ineligible for either list. Corrected:
  `interestEligible` = installments where `daysPastDue(dueDate) <= 0`;
  `penaltyEligible` = installments where `daysPastDue(dueDate) > 0 AND
  penaltyAmount > 0`. Purely additive to the response shape — nothing
  existing in this response changes.
- **`interestEligible` rows also need an `interestPortion` figure per
  installment — confirmed missing, this is not in Phase 2's original
  draft.** `amount_due` is principal+interest blended, not pure interest
  (confirmed by reading `src/app/api/csa/applications/[id]/computation/route.ts`
  lines 200–229 directly — that file's own comment states this exactly:
  *"Interest portion per installment isn't stored anywhere... derive it
  from each loan's own active computation, same even-split convention
  (totalInterest ÷ terms)"*). Without this, Phase 3's interest-discount
  math has no interest figure to take a percentage of. Fix: this phase
  must also fetch the account's `masterlist.computation_id`, then that
  computation's `total_interest, terms, payment_frequency`, and compute
  `interestPerRow = halfUp(total_interest / terms)` — halved again if
  `payment_frequency === 'semi_monthly'` — **the exact same formula and
  semi-monthly-halving rule already used in the file above**, not a
  reinvented one. Attach this figure to every `interestEligible`
  installment. Use plain `total_interest`, **not** `gross_total_interest`
  — confirmed by reading the existing code, the live Offset-discount
  `activeLoans` path (the closest precedent for this exact purpose)
  deliberately uses `total_interest` here; `gross_total_interest` exists
  for a different, earlier stage (see
  [discount-basis-mismatch-audit-and-fix-plan.md](../discount-basis-mismatch-audit-and-fix-plan.md)).
  Match the precedent exactly — do not "improve" on it as part of this
  feature.
- This is a **read-only, derived-for-display** addition — no writes, no
  discount math yet.

**Explicitly out of scope:** anything about applying or saving a discount.
Do not touch `computeAutoAllocation`'s existing allocation math in this
phase. Do not touch the Offset discount's own `activeLoans` code path in
`computation/route.ts` — this phase adds an equivalent, independent
lookup for the Collector-discount context, it does not modify or reuse
that endpoint.

**Done when:** the allocation-preview response correctly separates
eligible-for-interest-discount vs eligible-for-penalty-discount
installments for a real account with a mix of due/overdue rows; each
`interestEligible` row carries a correct `interestPortion` matching the
existing Offset feature's own figure for the same installment (spot-check
against a real account that has both); full suite green.

---

### Phase 3 — Discount math (shared, reused shape)

**Goal:** Compute the actual peso discount from a Collector's selected
installments/percentages — reusing the Offset discount's percentage
mechanic, without touching the Offset discount's own code.

**Scope:**
- New file, e.g. `src/lib/computation/collector-discount.ts` — a small,
  independent function with the same input/output shape as
  [computeOffsetDiscount](../../src/lib/computation/offset-discount.ts)
  (installment list + percentage selection → total discount), but **without**
  the termination-fee subtraction that function has — that concept is
  specific to a full-loan-closure offset and does not apply here. If the
  selection/percentage-summing logic is identical enough to extract into a
  shared helper both files call, that extraction is allowed **only** as an
  explicit, isolated step that leaves `offset-discount.ts`'s existing
  exported function signature and behavior completely unchanged (confirm
  via its existing test file passing unmodified).
- Two independent call shapes, both usable in the same request: one for
  interest (percentage of each selected installment's interest portion),
  one for penalty (percentage of each selected installment's
  `penalty_amount`). The function's result must keep these two totals
  **separate** (not summed into one number) — Phase 0's `dcr_items` schema
  stores them in separate columns and Phase 5 writes them to two separate
  `amortization_schedules` columns (see Rule 6 above), so collapsing them
  here would lose the information later phases need.

**Explicitly out of scope:** persistence, UI, posting. Pure math only,
mirroring how `offset-discount.ts` itself is pure math with no I/O.

**Done when:** unit tests (new file, same style as
`offset-discount.test.mts`) cover: interest discount on a future
installment, penalty discount on an overdue installment, a 100% discount
never going negative, and a mixed selection across both types; full suite
green.

---

### Phase 4 — DCRR UI: the input

**Goal:** The Collector can actually enter a discount on the existing
payment screen. No new page.

**Scope:**
- [src/app/collector/dcr/page.tsx](../../src/app/collector/dcr/page.tsx)
  — inside the existing Allocation modal (where installments are already
  checked off per payment), add **two independent, optional sections** —
  not a single either/or toggle (see Rule 1) — one for "Interest discount"
  (checkboxes over Phase 2's `interestEligible` list, percentage per
  installment) and one for "Penalty discount" (checkboxes over Phase 2's
  `penaltyEligible` list, percentage per installment). A Collector may
  fill in one, the other, both, or neither. One shared required
  reason/approver text field covers whichever section(s) are used.
- Gate the entire section on the Phase 1 permission: if
  `collector_discount` resolves to anything other than `'edit'` for the
  logged-in user, the section does not render at all (same pattern other
  field-gated UI in this codebase already follows).
- Uses Phase 3's math live, client-side, for the running total shown to
  the Collector before they submit — same UX pattern the existing Offset
  discount modal in `ComputationPanel.tsx` already uses.

**Explicitly out of scope:** anything about how the discount is actually
applied to balances (Phase 5). This phase only collects the input and
sends it along with the existing `add_item` request.

**Done when:** a permitted Collector sees the discount section, can select
installments and a percentage, sees a live running total, and submitting
sends the discount fields to the existing `add_item` endpoint; a
non-permitted user's screen shows no discount section at all; full suite
green.

---

### Phase 5 — Persistence and atomic apply-at-posting

**Goal:** Save the Collector's discount input on the draft `dcr_items` row,
then apply it for real only at the moment Accounting posts the payment —
mirroring exactly how the Offset discount's `post_internal_transfer` works.

**Scope:**
- [src/app/api/collector/dcr/route.ts](../../src/app/api/collector/dcr/route.ts),
  `add_item` branch — validate the new fields: for each of the two
  independent sections (interest, penalty), if its amount is nonzero then
  its matching `*_discounted_installment_nos` must be non-empty; if either
  section is present, `discountReason` must be non-empty. Call
  `validateFieldEdit("collection", "collector_discount", user.id)` once,
  before accepting a nonzero amount in *either* section — one permission
  gates both.
- **Server-side upper bound on the submitted amounts — required, not
  optional, caught on re-validation.** `dcr_items` stores a computed
  **peso amount**, not a percentage — the 0–100% clamp belongs in Phase
  3's math function (mirroring `computeOffsetDiscount`'s existing
  `Math.min(100, Math.max(0, pct))`), but that only constrains a
  well-behaved client. This route must independently **re-derive** the
  true maximum server-side — re-fetch each selected installment's real
  `interestPortion` (Phase 2's formula) or `penaltyAmount`, sum them, and
  reject the request if `interestDiscountAmount` or `penaltyDiscountAmount`
  exceeds that sum. Without this, a request that simply sends an inflated
  discount amount directly (bypassing the UI's percent math entirely)
  would sail through Phase 5's posting RPC — Pass B's closure check
  compares the payment against `gross_total_due − discount`, so an
  unbounded discount would let a trivially small payment satisfy full
  closure and mark a real debt `'paid'`. **This is a genuinely new check,
  not an existing pattern to copy** — confirmed by reading the route
  directly, the ordinary `amount` field on `add_item` today is validated
  only as `z.number().positive()`, with no server-side re-derivation
  against a real maximum (an oversized ordinary payment is harmless — it
  just becomes an advance line via `computeAutoAllocation`). An oversized
  *discount* is not harmless the same way, for the Pass B reason above, so
  this bound has to be built fresh here, not borrowed from an existing
  precedent.
- Then write the five new `dcr_items` columns from Phase 0. This is a
  **draft-time save only** — no balance changes here, matching
  Constraint 4.
- **The TypeScript caller (`postSingleDcrItem` in `posting.ts:925`) needs
  no changes.** Confirmed by reading it directly: it already calls the
  `post_single_dcr_item` RPC with only `p_dcr_id` and `p_payment_id` (plus
  allocations/actor/timestamp) — and `dcr_items` already has a `unique
  (dcr_id, payment_id)` constraint (confirmed live). That means the SQL
  function below can look up the matching `dcr_items` row's discount
  columns itself, with the parameters it already receives — no new
  parameter needs to be threaded through the TS layer.
- SQL RPC `post_single_dcr_item` (confirmed live definition read directly
  — current body is in
  `supabase/migrations/20260831110000_post_single_dcr_item_atomic.sql` and
  its row-level-status successor) — add a new, clearly delineated step:
  1. `select interest_discount_amount, interest_discounted_installment_nos,
     penalty_discount_amount, penalty_discounted_installment_nos from
     dcr_items where dcr_id = p_dcr_id and payment_id = p_payment_id` — a
     new lookup, since the function doesn't currently select from
     `dcr_items` at all.
  2. **Critical correction, caught by re-validating the Open Item 5 fix:**
     the discount must **only ever take effect on a row that the discount
     itself causes to close** (Option B — see Open Item 5). It must
     **not** be written unconditionally the moment it's present. This
     resolves what would otherwise be a circular check ("is the row paid"
     depends on the discount; "does the discount apply" depends on
     whether the row gets paid) via a **two-pass evaluation per targeted
     row**, run *before* touching that row's discount columns at all:
     - **Pass A (no new discount):** compute `v_total_due` exactly as the
       function does **today**, unmodified — existing `discount_amount`
       as-is, full `penalty_amount`, no `penalty_discount_amount` term. If
       `v_new_paid >= this figure`, the row is already fully settled
       without any help from a Collector discount — **skip this row
       entirely** in steps 3/4 below; let the function's pre-existing
       logic mark it `'paid'` exactly as it already does. (The Collector's
       entered discount for this row is simply never applied — it cost
       the account nothing, so there is nothing to reconcile later.)
     - **Pass B (with the new discount):** only if Pass A came out false,
       recompute `v_total_due` a second time, this time as it *would* be
       with the Collector discount(s) applied (interest side: existing
       `discount_amount` replaced by the new figure, per Rule 7 below;
       penalty side: `penalty_amount` reduced by
       `penalty_discount_amount`). If `v_new_paid >= this second figure`,
       the discount is exactly what earned this row's closure — proceed
       to steps 3/4, write the discount columns for real, and this row
       becomes `'paid'`.
     - **If Pass B is also false:** the payment falls short even with the
       discount. Per Option B, **the discount does not apply at all** —
       do not write `discount_amount`, `discount_source`, or
       `penalty_discount_amount` for this row; do not void the row's
       pre-existing Origination discount either (Rule 7 voiding only
       happens when the Collector discount is actually being applied —
       an unsuccessful attempt must leave the row exactly as it was
       found). The row proceeds through the function's existing
       undiscounted logic, unchanged.
  3. **Interest side** (only reached via a Pass B success, per step 2):
     **first void any pre-existing `discount_amount` on the targeted
     row(s)** — same "Rule 7" precedent `post_internal_transfer` already
     established for Offset-vs-Origination (confirmed by reading that
     migration directly, comment: *"the two discounts must never be
     summed on one installment"*). An installment could already carry a
     nonzero Origination discount from loan setup; without this step, a
     Collector discount on the same row would silently stack instead of
     replace, double-discounting it. Then write the new `discount_amount`
     and `discount_source = 'collector'`, split across
     `interest_discounted_installment_nos` using the same even-split
     convention `post_internal_transfer` uses for Offset (do not invent a
     different split rule).
  4. **Penalty side** (only reached via a Pass B success, per step 2):
     write `penalty_discount_amount` onto the matching row(s) (split
     across `penalty_discounted_installment_nos`, same even-split
     convention) — see Rule 6 / Phase 0, a different column, on purpose.
  5. Steps 3 and 4 are independent of each other (both can apply to the
     same Pass-B-successful row, per Rule 1) but both are gated by the
     **same** Pass A/Pass B evaluation in step 2 — there is one closure
     check per row, not one per discount type. A single payment spanning
     several installments runs this two-pass check separately, per row,
     since `post_single_dcr_item` already loops and updates each row's
     status independently — this keeps the fix at the same granularity
     the rest of the function already operates at, rather than inventing
     a new whole-account gate.
- `recompute_outstanding_balance` (confirmed live definition read
  directly) — this is the account-wide balance function, independent from
  the per-item posting above, and it duplicates the **same**
  `amount_due - discount_amount + penalty_amount - amount_paid` formula
  over every open row. It needs the identical additive fix:
  `- coalesce(penalty_discount_amount, 0)`. Skipping this one would make
  the per-item post in step 3 correct but the account's overall balance
  wrong.

> **The formula lives in exactly four places** — all four confirmed by
> reading them directly, and **all four must change together** or the
> money will disagree with itself: (1) `post_single_dcr_item` (SQL,
> above), (2) `recompute_outstanding_balance` (SQL, above), (3)
> `netInstallmentDue` (TS, below), (4) the 30-day rollover in both aging
> twins (below). This codebase has already been bitten once by fixing
> only some copies of this exact formula — see
> [payment-flow-discount-audit-and-fix-plan.md](../payment-flow-discount-audit-and-fix-plan.md),
> where `discount_amount` was missing from several of them.
- **The 30-day rollover, in both aging twins — the fourth and last place
  this formula lives.** Confirmed by reading both directly:
  `refresh_one_masterlist_aging` (SQL) computes
  `v_roll_amount := amount_due - discount_amount - amount_paid +
  v_final_penalty` and adds it to the next installment's `amount_due`;
  `refreshMasterlistAging` (TS, `posting.ts` ~line 693) does the same via
  `netInstallmentDue({..., penaltyAmount: finalPenalty})`. Neither
  subtracts a penalty waiver, so a Collector-discounted penalty would roll
  forward **gross** into the next installment — turning a waived penalty
  back into real debt on a different row. Fix, both twins identically:
  subtract `penalty_discount_amount` from the rolled figure (on the TS
  side, by passing the new `penaltyDiscountAmount` argument added below).
  **Both twins' `overdue` fetch must also add `penalty_discount_amount` to
  its select list** — SQL's `SELECT ... INTO v_overdue` and TS's
  `.select("id, installment_no, due_date, status, amount_due, amount_paid,
  penalty_amount, rolled_at, discount_amount")` — neither selects it
  today, and a missing column in one of two duplicated copies is precisely
  the failure mode this codebase has already been bitten by once (see the
  `discount_amount` audit, 2026-08-31).
- Also in both twins: when a row is marked `'rolled'`, set its
  `penalty_discount_amount = 0`. The waiver has been consumed by the roll
  calculation above; leaving a stale figure on a rolled row invites
  double-counting if that row is ever re-read.
- `netInstallmentDue` in
  [src/lib/computation/money.ts:39](../../src/lib/computation/money.ts) —
  the TypeScript twin of the same formula, used by `computeAutoAllocation`
  and the DCRR page's own remaining-due display. Add an optional
  `penaltyDiscountAmount?: number | null` parameter, subtracted from the
  `penaltyAmount` term, defaulting to `0`/`undefined` so every existing
  call site (which doesn't pass it) computes byte-for-byte the same
  result it does today. This keeps the TS side in sync with the SQL side,
  matching this codebase's own established convention for these
  intentionally-duplicated TS/SQL pairs (see Fix #9's
  `refreshMasterlistAging` / `refresh_one_masterlist_aging`).

**Explicitly out of scope:** the Offset discount's own posting function
(`post_internal_transfer`) — read it for the pattern, do not edit it. Do
not change `recompute_outstanding_balance`'s formula beyond the one
additive `penalty_discount_amount` term — that function only ever reads
final, already-decided state, so it needs no Pass-A/Pass-B logic of its
own (step 2 above already resolved, before this function ever runs,
whether a discount actually applies). `post_single_dcr_item`'s existing
`v_total_due` line itself is genuinely restructured by step 2 above (into
two evaluations, not one) — that is the intended scope of this phase, not
an overreach of it.

**Done when:** a request that submits a discount amount exceeding the real,
server-recomputed maximum for its selected installments is rejected by
`add_item` before ever reaching a draft row; a Collector-entered discount
saved in draft has zero effect
on any balance until the DCR is actually posted; once posted, a payment
that is **short** even with the discount applied leaves that row exactly
as if no discount had been entered at all — same status, same
`penalty_amount`, no `discount_amount`/`penalty_discount_amount` written,
and (critically) `dcr_items`' own saved discount figures are left intact
for visibility even though they didn't take effect, so the paper trail
still shows what was attempted (this is the Option B / Open Item 5 case,
and the one most worth a dedicated test); a payment that only reaches
full settlement **because of** the discount applies it and marks the row
`'paid'`; once posted, an interest discount reduces the installment's due
amount correctly and tags `discount_source = 'collector'`, a penalty
discount reduces the penalty side (via `penalty_discount_amount`) without
touching `discount_amount` at all, and **a payment carrying both at once
applies both correctly in the same post** (the case Rule 1 exists for);
an installment that already
carried a nonzero Origination `discount_amount` and then receives a
Collector interest discount ends up with **only** the new Collector
figure, never the sum of both (the Rule 7 precedent, tested explicitly);
the account's overall `outstanding_balance` (via
`recompute_outstanding_balance`) reflects both correctly; **an overdue
installment carrying a penalty waiver that then hits the 30-day rollover
carries only the waived (net) penalty into the next installment's
`amount_due`, never the gross figure — verified on both the TS and SQL
aging twins, with a parity test asserting the two produce identical
results** (same bar as the existing aging-parity tests from Fix #9); a
rejected/never-posted draft leaves every balance untouched; running
posting twice on the same item does not double-apply either discount
(idempotency, same bar as every other posting path in this codebase);
full suite green.

---

### Phase 6 — AR/PDC ledger: make the source visible

**Goal:** Fix the confirmed gap — a Collector discount must be visually
distinguishable from Origination/Offset discounts in the books.

**Scope:**
- [src/lib/ledger/build-account-ledger-rows.ts](../../src/lib/ledger/build-account-ledger-rows.ts)
  — confirmed exact insertion point: the shared select string at line 78
  (`"id, installment_no, due_date, amount_due, penalty_amount,
  discount_amount, status, ..."`) is the single fetch this file already
  funnels every row through (its own comment there notes this exists
  specifically so a new ledger-relevant column only needs to be added
  once, not per-route — the same lesson `discount_amount` itself already
  taught this codebase). Add `discount_source` and
  `penalty_discount_amount` to that same select string, and map both onto
  `AccountLedgerRow` (currently defined around line 117) as
  `discountSource` and `penaltyDiscount`.
- [src/components/ledger/AccountLedger.tsx](../../src/components/ledger/AccountLedger.tsx)
  — in the existing "Discount" column cell (the `moneyCell(row.discount)`
  calls at lines 181/243), add a small label/badge when
  `discountSource === 'collector'` (e.g. "Collector" tag next to the peso
  amount). Existing rendering for `null`/`'origination'`/`'offset'`
  sources is unaffected — no visual change for those.
- **The existing "Penalty" column (`AccountLedger.tsx:122`, cells at
  178/240) must be shown net of the penalty waiver** — confirmed by
  reading the file: it renders `schedule.penalty` raw, so a waived penalty
  would display at full value and contradict the balance. Add a
  `netPenalty(penalty, penaltyDiscount)` helper mirroring the existing
  `netTarget(target, discount)` at `build-account-ledger-rows.ts:146`, and
  apply it at the same two call sites `netTarget` is used (lines ~241 and
  ~354). This follows that helper's own documented convention verbatim —
  its comment states Target "now already reflects the discount, matching
  how `openingDebit`/`balance` already account for it." The Penalty column
  should behave the same way, for the same reason.

**Explicitly out of scope:** any other column, any other ledger view, any
change to how the total balance is calculated (unaffected by this phase —
it's a display-only change on top of Phase 5's already-correct numbers).

**Done when:** an installment discounted via this feature shows a visibly
distinct label in the AR ledger; installments discounted via Origination
or Offset render exactly as they do today, unchanged; full suite green.

---

### Phase 7 — RLS

**Goal:** Confirm the new `dcr_items` columns are covered by the existing
row-level-security policies without needing new ones.

**Scope:**
- Verify (do not rewrite) that the existing `dcr_items_write` policy
  (draft-only, collector-owns, module-edit-required — confirmed live via
  audit) already covers the new columns, since RLS in this system is
  table-level, not column-level. No new policy should be needed.
- If verification finds a gap, the fix is scoped to exactly that gap —
  not a rewrite of the policy.
- **Document, do not attempt to close, one pre-existing limitation this
  feature inherits:** confirmed by reading `dcr_items_write` directly, RLS
  here only checks module-level edit (`has_module_permission('collection',
  'edit')`), never the field-level rule from Phase 1. The `collector_discount`
  gate is enforced only in the API route (Phase 5), not in the database
  itself — the same field-rule system already works this way for every
  other field-gated value in this codebase (e.g. `borrower_info`), so this
  is an existing, accepted pattern, not a new hole this feature opens.
  Closing it (moving field-level enforcement into RLS) would be a
  system-wide change well outside this feature's scope — do not attempt
  it here.

**Explicitly out of scope:** any other table's RLS policy.

**Done when:** a Collector can write the new discount fields only while
the parent `dcr` is `'draft'` and only on their own `dcr`, confirmed by
testing an attempted write against a non-owned or non-draft `dcr` fails;
full suite green.

---

### Phase 8 — Failure safety check (not a new reversion job)

**Goal:** Confirm, explicitly, that a Collector discount can never end up
"stuck" applied when its payment didn't actually go through — without
building new background-job logic, per the Constraints section above.
This is a **different** failure mode from Phase 5's insufficient-payment
case (Option B) — that one is a payment that *does* post, just for too
little to earn the discount, decided in the moment by Pass A/B. This
phase is about a payment that never posts at all (rejected or abandoned
mid-draft). Don't conflate the two when writing tests for either phase.

**Scope:**
- Confirm (via test, not new code) that `rejectDcrItem` and any other
  path that marks a `dcr_item` `'rejected'` before `post_single_dcr_item`
  ever runs leaves every discount column inert — true by construction,
  since Phase 5 only ever mutates `amortization_schedules` inside the
  posting RPC itself, never at draft-save time. This phase is about
  writing the regression test that proves it, not adding a reversion
  branch.
- If (and only if) this test reveals a real gap — e.g. some path applies
  balance changes before the discount check — that specific gap gets its
  own narrowly-scoped fix, not a new job.

**Explicitly out of scope:** adding any **reversion** branch to the nightly
aging job (`refreshMasterlistAging` / `refresh_one_masterlist_aging`) for
this feature. Phase 5's atomic-apply-at-posting design means there is never
a window where a Collector discount sits applied-but-unpaid the way an
Origination discount can, so nothing needs nightly un-doing. Note this is
*not* the same as the rollover fix Phase 5 already requires in those same
two functions — that one is required; a reversion branch is not. Do not
conflate them.

**Done when:** a regression test confirms a rejected/never-posted DCR item
with a Collector discount attached results in zero balance changes on the
target account; full suite green.

---

### Wave 1 completion

**Final step:** one combined summary covering every file touched across
Phases 0–8, checked against this plan, plus a real `git status`/diff —
per the standing validation workflow. Do not start Wave 2 before this.

---

## Wave 2 — The paper trail (separate effort, after Wave 1 ships)

### Phase 9 — Payment receipt / letter

**Goal:** Build the payment receipt document that currently does not exist
at all in this system, with the Collector discount as a line item on it.

**Scope:**
- New generator in `src/lib/documents/generators/` (e.g.
  `payment-receipt.ts`), following the existing generators'
  structure/conventions (`demand-letter.ts` is the closest analog).
- New field-group entries in
  [src/lib/documents/templates/fields.ts](../../src/lib/documents/templates/fields.ts)
  for payment amount, date, and the discount breakdown (amount, type,
  reason), sourced from the `dcr_items` columns Phase 0 added.
- New `document_templates` row (category `"collection"`, alongside the
  existing `demand_letter`), created the same way the existing templates
  were seeded, then published through the existing admin template editor —
  no new publishing mechanism.

**Explicitly out of scope:** any existing letter/document generator or
template. This is a wholly new document type, not an edit to one that
exists.

**Done when:** a posted payment with a Collector discount attached can
generate a receipt showing the discount breakdown, using the existing
document-template rendering pipeline unmodified; full suite green.

---

## Naming/identifier validation (checked directly against live DB + code, 2026-09-03)

Every table, column, function, and file path this plan references above
was read directly — live database via Supabase MCP for schema/functions,
direct file reads for code — not assumed from memory. Confirmed:

- `dcr_items` columns today: `id, dcr_id, payment_id, amount, status,
  deposit_reference, deposit_amount, posted_by, posted_at` — the five new
  names this plan adds (`interest_discount_amount`,
  `interest_discounted_installment_nos`, `penalty_discount_amount`,
  `penalty_discounted_installment_nos`, `discount_reason`) don't collide
  with anything existing.
- Also confirmed: `dcr_items` has a live `unique (dcr_id, payment_id)`
  constraint (`dcr_items_dcr_id_payment_id_key`), which is what makes
  Phase 5's RPC-side lookup by those two columns valid and unambiguous.
- `amortization_schedules` columns today confirmed via
  `information_schema.columns` — `discount_source` and
  `penalty_discount_amount` don't collide with anything existing.
- `role_field_rules.field_rules` currently only has two keys in use
  anywhere in the live data — `borrower_info`, `computation` —
  `collector_discount` is not already used for something else.
- `get_field_rule()`'s live definition confirmed the fail-open default
  (`RETURN COALESCE(v_rule, 'edit')`) cited in Phase 1/Constraints —
  read directly, not inferred.
- `post_single_dcr_item`'s and `recompute_outstanding_balance`'s live SQL
  bodies were both read directly (`pg_get_functiondef`) to confirm the
  exact formula and the exact line each needs the new term added to,
  which is what caught the interest-vs-penalty column bug described in
  Rule 6.
- `postSingleDcrItem` (TypeScript, `posting.ts:925`) confirmed **not
  exported** (module-private) and confirmed its exact RPC call
  parameters (`p_dcr_id, p_payment_id, p_allocations, p_actor_id,
  p_now`) — this is what confirmed Phase 5 needs zero TS-layer changes.
- `netInstallmentDue` confirmed exported from `money.ts:39`, exact
  current signature and formula read directly.
- `validateFieldEdit` confirmed exported from
  `src/lib/permissions/field-rules.ts:23`.
- Role name confirmed exact as `"Collector"` (capitalized) in the live
  `roles` table; module slug confirmed exact as `"collection"` in the
  live `modules` table.
- Document generator/template file locations
  (`src/lib/documents/generators/`, `src/lib/documents/templates/fields.ts`)
  and the existing `document_templates.category = 'collection'` value
  (used by `demand_letter`) confirmed to exist for Phase 9 to follow.

## Open items to confirm before Phase 0 starts

1. Confirmed in this session: penalty discount uses the same
   percentage/installment-selection mechanic as the interest/offset
   discount (not a flat amount) — reflected in Phase 3 above.
2. Confirmed in this session: interest-discount timing rule (future-only)
   and penalty-discount timing rule (overdue-only) are both correct and
   intentional opposites — reflected in Phases 2–3 above.
3. Still open: **Remedial role** — out of scope per the official ask, but
   worth a one-line confirmation before Phase 1 locks in Collector-only.
4. Still open: exact wording/format expected for the "approver/reason"
   note — free text is assumed in Phase 0/4; confirm no structured format
   (e.g. a dropdown of managers) is actually wanted before building the
   UI in Phase 4.
5. **Revised on further re-validation — what happens to a penalty waiver
   if the payment doesn't fully settle the account?** An earlier draft of
   this plan defaulted to "the waiver is a fixed peso amount, kept
   regardless of what happens next." **That default is now reversed** —
   re-reading both source transcripts caught language this plan had missed:
   transcription.md describes the discount as *"nagdi-discount sila sa
   on-going penalty. **Polipaid ka na kaagad**"* ("discount the ongoing
   penalty — you're immediately fully-paid"), and transcription_2.txt as
   *"bayaran mo na lang ng ganitong amount **tapos sarado na natin yung
   log mo**"* ("just pay this amount **and then we close your log**").
   Both describe **one single event** — pay-this-amount-and-close-now —
   never a discount that exists independently of the account actually
   closing. There is no line in either transcript describing a waiver as
   a standing adjustment that survives on its own.
   **Corrected default (implement this unless told otherwise): the waiver
   only takes effect if the payment actually, fully closes the account
   (installment reaches `'paid'`) in the same posting. If the deposit
   falls short and the row stays `'partial'`/`'overdue'`, the waiver does
   not apply at all — the penalty stands at its real, undiscounted value,
   and the aging job continues accruing on the true figure, not a
   discounted one.** This is a smaller change than the reversed default
   might suggest: since Phase 5 already only ever writes
   `penalty_discount_amount` inside the atomic posting RPC (never at
   draft-save time), the natural implementation is simply — write it only
   in the branch where the installment's `v_paid` check comes out true;
   skip it (or roll the payment back / reject it, matching whatever this
   codebase's existing behavior is for an under-funded settlement attempt)
   when it doesn't. No separate "revert later" logic needed, unlike what
   the original fixed-amount default would have required if a later
   business-rule change had demanded reversal. Still worth a one-line
   confirmation from Sir Rene / Sheila before Phase 5 locks this in, since
   it changes what the Collector should be told to do if a payment comes
   up short (re-attempt with the full amount, since a partial payment
   would no longer carry any of the approved discount).
