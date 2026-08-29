# New-Loan Origination Discount — Confirmed Requirements

**Status:** Design fully settled. No code written yet. This is a companion feature to [feature-early-settlement-discount.md](feature-early-settlement-discount.md) — related, but distinct.

**Source:** **Not from the meeting transcript.** This is a new business rule specified directly by the user in this session, separate from anything discussed in the 2026-08-25 meeting. Do not cite the transcript for this feature's rules — cite this doc and the conversation that produced it.

---

## What this is, and how it differs from the Offset discount

[feature-early-settlement-discount.md](feature-early-settlement-discount.md) covers discounting an **old loan** that's being paid off early using a new loan's proceeds ("Offset").

This feature is different: it discounts the **new loan's own future installments**, at the time that new loan is being originated. Both live in the same calculator, both are entered by CSA/Committee, but they touch different loans and have different rules — **they must not be merged into one feature.**

---

## Confirmed rules

1. **Interest only — principal is never discounted.** Same principle as the Offset discount: only the interest portion of a future installment can be reduced. The borrower always owes 100% of what they borrowed.

2. **Percentage-based, per month.** For each future installment in the new loan's own schedule, staff can enter a discount **percentage** to apply to that month's interest — not a flat peso amount, and not an all-or-nothing toggle.

3. **The discount is an early-payment incentive, not a permanent reduction.** Once a discounted month's due date simply arrives — regardless of whether it was paid or not — the discount on that installment is removed and the **original, full amount** takes its place. In other words: the discount only ever benefits the borrower if that specific installment is paid *before* its due date. Once the due date is reached, that installment reverts to its normal, undiscounted amount going forward.

4. **No offsetting fee.** Unlike the Offset discount (which subtracts a one-month-interest "early exit" fee), this discount is a plain percentage reduction with nothing subtracted from it. This isn't an early-termination scenario — it's a per-month incentive on a loan that's just starting.

5. **Both CSA and Committee see and can use this in their shared calculator** — carried over from the same access pattern already established for the Offset discount (open entry, not restricted to one role). Not independently re-confirmed for this specific feature in this session, but assumed consistent unless told otherwise, since both features live in the same shared `ComputationPanel` and nothing suggests a different access model was intended.

---

## UI, as described by the user

- A new button in the calculator (used by both CSA and Committee).
- Clicking it opens a modal showing the new loan's **own full term schedule** — principal and interest broken out per month (i.e., the new loan's own amortization table, not another loan's).
- Each month in that schedule gets a field for entering a discount **percentage** for that month.
- Once the loan is released with discount(s) set, those months carry the reduced amount until their own due date arrives, at which point each one individually reverts to its original full amount (per Rule 3).

6. **Reversion runs the same way the nightly aging job does — a background/scheduled process that checks due dates and reverts expired discounts.** Confirmed by direct user decision. **Hard requirement carried over from a real incident this session:** the aging job's original design re-computed penalties non-idempotently — re-running it (nightly cron, or any extra trigger) kept compounding the same charge further each time, and it took a live data-corruption bug and a manual repair of 8 real accounts to catch it (see Fix #9 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md)). **This reversion job must be idempotent from the first version written** — running it twice on the same installment must produce the exact same end state as running it once. This isn't a nice-to-have; it's a condition of building this feature at all, given the precedent.

7. **Early full settlement (Offset) voids any origination discount still sitting on that loan's unpaid future months — Option B, confirmed by direct user decision.** Concretely: if Loan B has a 20% origination discount tagged on months 4–6, and it gets closed out early via the Offset feature, months 4–6 revert to their **full, original, undiscounted** interest the moment Offset processing begins — the same way an ordinary due-and-demandable month can't be discounted. Any discount Loan B receives from that point forward comes *only* from the Offset feature's own discount-picker (see [feature-early-settlement-discount.md](feature-early-settlement-discount.md)), calculated from the real, undiscounted numbers — **never combined or stacked** with a leftover origination discount. This prevents a borrower from getting the origination discount and the Offset discount on the same month.

---

## Shared requirement with the Offset discount feature

**The account ledger needs a new column showing the discount amount applied per month, for both this feature and the Offset discount.**

Located the real component: [AccountLedger.tsx](../../src/components/ledger/AccountLedger.tsx), current columns ([:98-107](../../src/components/ledger/AccountLedger.tsx:98)): `Check No. | Due Date | Target | Penalty | Date | Reference No. | Debit | Credit | Balance | Status`.

A new `Discount` column (numeric, likely sitting next to `Target`/`Penalty` — both are the other per-installment adjustment columns already there) needs to show the discount amount for any month where one was applied, whether that discount came from this feature (new-loan origination) or from the Offset feature (old-loan early settlement). This is one shared UI change serving both features, not two separate columns.

---

## Reversion job — confirmed to reuse the existing nightly aging job, not a new one

**Decision: the discount-reversion check (Rule 6) rides on the existing nightly aging job** — [posting.ts's `refreshMasterlistAging`](../../src/lib/ar/posting.ts) and its SQL twin `refresh_one_masterlist_aging` (see Fix #9 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md)) — rather than standing up a second scheduled process.

**Implementation note for the eventual phase plan, not yet built:** the aging job's current job is narrow — find the earliest *overdue* installment and accrue penalty on it; it returns early for any account with nothing overdue yet. Discount reversion is a different concern that needs to run for **every** account on **every** installment whose due date has just arrived, overdue or not — that's a wider check than what the job does today. This should be added as its **own clearly separate step inside the same nightly run** (same schedule, same trigger, own logic) — not folded into the penalty-accrual calculation itself, so the two don't become tangled the way the original aging bug did. Must be idempotent from the first version, per Rule 6.

**Access/approval — resolved, not open.** Verified directly against [pipeline.ts:6-12](../../src/lib/applications/pipeline.ts:6): every application, with no exceptions or size-based branches, passes through a mandatory Committee stage (`for_approval`) before release — Committee's per-segment `committee_size` config controls vote quorum, not whether review happens at all. Combined with Committee's existing override/edit capability (already confirmed for the Offset feature), this means Committee already sees and can edit anything CSA sets here, same as everywhere else in the calculator. The access model carries over from the Offset feature cleanly — no separate approval mechanism needed for this feature either.

**No open items remain for this feature's design.** Ready for a phase-by-phase implementation plan.

---

## Next step

Once the open items above are resolved, this and [feature-early-settlement-discount.md](feature-early-settlement-discount.md) should be turned into a combined or sequential phase-by-phase implementation plan (same constraints-first format as [feature-seafarer-due-date-picker.md](feature-seafarer-due-date-picker.md)) before any code is written.
