# Early-Settlement Discount — Confirmed Requirements

**Status:** Design fully settled. No code written yet. This is the confirmed-requirements doc; a phase-by-phase implementation plan (same format as [feature-seafarer-due-date-picker.md](feature-seafarer-due-date-picker.md)) is the next step once this is reviewed.

**Source:** Tracked as Feature #1 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md), validated word-for-word against the raw meeting transcript at [transcription-2026-08-25.md](../transcription-2026-08-25.md) (not just the meeting-minutes summary).

---

## The problem today

When a borrower's new loan proceeds are used to pay off an old loan early ("Offset — full settlement"), management sometimes agrees to waive part of the remaining interest as a goodwill gesture. This is currently computed **entirely by hand, outside the system**, by AR staff. There is no field for it anywhere in the calculator today. Confirmed via direct transcript quote and a `src/`-wide grep (zero `discount` matches anywhere in code):

> **Conference:** *"Nasa calculator po kaya yun?"* / **rovick:** *"Na, hindi. Wala siya sa calculator."*

---

## Confirmed rules (all verified against the raw transcript, not assumed)

1. **Interest-only.** The discount can only ever reduce interest. The borrower always pays back 100% of the principal — no exceptions.
   > *"ang bumabalik lang sa company, yung principal... pero yung ibang interest na dini-discount, i-we-waive."*

2. **Only future, not-yet-due installments are eligible.** Anything already at or past its due date is "due and demandable" — it must be collected in full and can never be discounted, even if unpaid.
   > *"once na lumagpas kasi ng due date, eto due and demandable na to. Ibig sabihin, wala ng discount to... Bawal na pong discount."*

   This closes a real, named informal malpractice: staff sometimes hand out an ad-hoc "one month" or "50%" discount on an already-due amount to placate a difficult borrower, even though the rule forbids it. The per-month-selectable design is explicitly meant to mechanically prevent this rather than rely on staff judgment.

3. **A one-month-interest "early exit" fee is always subtracted from the discount — not charged on top of it.** Whatever gross interest is discounted, one month's interest equivalent (the termination fee) comes out of that pool first.
   Worked example from the transcript: gross discountable interest ₱851.52, minus the one-month-interest termination fee ₱212.88 → **net discount ₱638.64.**
   If only one or two eligible months remain, the fee can shrink the discount to **zero** — confirmed: *"Pag dalawang ang nakitira, wala na siyang discount... wala na siyang discount."*

4. **Per-month selectable, never all-or-nothing.** Staff tick specific individual future months to discount — there is no "discount the whole remaining loan" switch.
   > *"pwede i-tick mo lang na itong two months, eto lang ang interest ang i-discount ko."*

5. **Applies only to the Offset (full settlement) scenario — never to "Other Loan" (partial payment).**
   > *"Saan po yun? Sa offset? Sa other loan? Yung sa offset yun, wala sa other loan."*

6. **Never affects the new loan the borrower is currently applying for.** The new loan's principal, interest rate, fees, and terms are computed completely normally, untouched by this feature. The discount only shrinks the *old* loan's payoff amount, which is one of the new loan's deductions — so the only effect on the new loan is that **less of its proceeds get diverted to the payoff, leaving the borrower more net cash.** The new loan itself is never discounted. (Confirmed by direct reasoning in this conversation, not a transcript quote — this is an inference from how "Offset" already works today, cross-checked against the transcript's exclusive framing of discount as being about the *old* loan's remaining interest.)

---

## Confirmed access & approval model

- **Entry is open to anyone with calculator access** (CSA and Committee both use the same shared `ComputationPanel`). Restricting entry to one role was explicitly rejected in the meeting because it risks becoming a bottleneck: *"pag binigay lang natin sa isang tao kasi, baka magiging blocker siya ng computation."*
- **CSA can propose a discount from the application stage onward, but cannot decide.** Only Committee can actually grant it.
  > *"kay CSA pa lang, nagre-request na sila ng discount"* / *"since si CSA, hindi siya makadesight... ang pwede lang magbigay ng discount, sa committee."*
- **No separate "approved / not approved" status or badge is needed.** Committee's own final edit to the discount value *is* the approval — confirmed by explicit user decision (they will be doing the final computation, so their edit is sufficient; no extra UI state to track).
- **Collection/Collector has no role in this discount at all.** This is CSA/Committee only, at application/computation time.
  > *"Walang nang kinalaman si collection ngayon."*

---

## Confirmed UI placement

**Inside the existing "Offset (full settlement)" section of [ComputationPanel.tsx](../../src/components/csa/ComputationPanel.tsx) — no new screen, no new page.** Confirmed directly from the transcript's own resolution of "whose screen is this, really":

> **Conference:** *"Si collection at AR ang dapat na discount [conceptually]... but since lalabas kasi ito sa calculator, ba? Yung offset amount. Kaya ang nangyayari, ang mag-tick niyan, nandito na kay... kung mag-ano ng calculator... nandun siya kay LRA."*

This section today ([ComputationPanel.tsx:1104](../../src/components/csa/ComputationPanel.tsx:1104)) only has: a dropdown to pick which old loan is being paid off, and one flat editable ₱ amount per row. No month-level breakdown of any kind exists yet.

**Design recommendation, mirroring an existing pattern already in this exact file** (the "Other Loan" section's "Select loan & months" modal, [:1226](../../src/components/csa/ComputationPanel.tsx:1226) and [:1293-1392](../../src/components/csa/ComputationPanel.tsx:1293)):

- Add a new button per Offset row — e.g. "Apply early-settlement discount" — enabled only when a real tracked active loan is selected in that row (not "Custom / external," which has no system-tracked schedule to discount from).
- Clicking it opens a new modal (same `Modal` component, same Cancel/Apply footer convention already used) showing that loan's remaining installments, split into:
  - **Already due or passed** — grayed out, not selectable.
  - **Future installments** — checkboxes, each showing its real due date and its real interest portion.
- A running summary shows: gross interest selected → minus the one-month termination fee → **net discount.**
- On Apply, the row's amount field shows a transparent breakdown (original balance, discount applied, final offset amount) instead of a raw editable number.

**Known gap, not just a UI task:** the existing "Select loan & months" modal's checkboxes work off a flat `monthlyAmortization` number because that's all `activeLoans` currently carries per loan (account no., balance, flat monthly amount, status, remaining installment count — see the GET handler in [computation/route.ts](../../src/app/api/csa/applications/[id]/computation/route.ts)). **There is no per-installment due-date/interest data available to the calculator today.** Surfacing real due dates and real interest splits for a target loan requires extending what the backend sends for `activeLoans` — this is backend work, not just a new modal, and needs to be its own phase in the eventual plan.

---

## Explicitly out of scope for this feature

**A second, distinct discount scenario exists and must not be folded into this one:** Collection/Remedial can offer a discount on an **already-accumulated penalty balance** to get a delinquent borrower to settle immediately.
> *"malami na yung penalty niya... bayaran niyo ako ngayon, kahit i-discount ko na itong, ano, kalahati, 30% o 20%."*

Different rules (percentage-of-penalty, not per-month interest), different owner (Collection/Remedial, not CSA/Committee), different trigger point (an overdue penalty, not an early full settlement). Recommended as its own separate tracker item — not yet formally added to the tracker as of this writing.

---

## Related feature — shared ledger requirement

A second, related but distinct feature was specified after this doc was written: [feature-new-loan-origination-discount.md](feature-new-loan-origination-discount.md) — discounting a **new** loan's own future installments at origination (not from the transcript; a separate business rule). The two features share one requirement: the account ledger ([AccountLedger.tsx](../../src/components/ledger/AccountLedger.tsx)) needs a new `Discount` column showing the per-month discount amount, whichever feature applied it. See that doc for the shared ledger detail — don't duplicate it here.

## Next step

Turn this into a phase-by-phase implementation plan (backend: extend `activeLoans` with per-installment data → frontend: the discount modal + row breakdown → tests), following the same constraints-first format as [feature-seafarer-due-date-picker.md](feature-seafarer-due-date-picker.md), before any code is written.
