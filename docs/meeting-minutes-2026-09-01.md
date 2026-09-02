# Meeting Minutes — Progress Demo (Follow-up to Aug 25 Walkthrough)

**Date:** September 1, 2026
**Time:** 1:00 PM
**Duration:** ~83 minutes
**Format:** Impromptu Google Meet
**Recording:** [View Recording](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ)

### Attendees
- **Rovick Romasanta** — Developer (presenter; demoing from local environment)
- **Sheila dela Cruz** — Project lead / facilitator
- **Sir Rene** — Client (primary reviewer / decision maker), with others on the client room audio ("Conference")

---

## Purpose of the Meeting

Rovick presented the changes built since the August 25 walkthrough — the Offset / Other Loan terminology fix, add-on months, the SME application schedule types, early-settlement and origination discounts, the new AR discount column, Move of Payment, and the CFR cut-off handling — for confirmation, and to surface the items still in progress. The meeting closed with an agreed list of five deliverables for the next session.

> Note: Rovick was demoing on his **local** environment, so parts of the flow ran slowly and two screens did not refresh in time. These were noted as display/persistence issues to verify, not logic problems.

---

## 1. Offset ↔ Other Loan — Terminology Fix (Confirmed)

- The two labels flagged as swapped on Aug 25 are now corrected:
  - **Offset** = full settlement / pay off the remaining balance of an existing loan (one-time payment; created via a separate borrower/"pinbag" account, not routed through the CSA borrower account).
  - **Other Loan** = partial payment toward an existing loan.
- Requires an **existing loan** on the account before an offset can be created.

**Status:** Accepted as demonstrated.

---

## 2. Early Settlement Discount on Offset (Confirmed, with a bug to fix)

- When creating an offset, staff can now tick **"Apply early settlement discount"** and select which month(s) of interest to discount.
- Discount is applied to **interest only — never the principal** (reaffirmed).
- The payment breakdown shows an **"Early Settlement Discount"** line and a recalculated **final amount**; the amount remains editable.
- **Month ordering:** Sir Rene initially asked to shift the discounted months toward the later terms (month 5/6/7); after seeing the current ordering he confirmed it is fine as-is.

**Issue found:** After applying a 50% / 100% discount and refreshing, the applied discount did **not persist / redisplay** on screen. Rovick attributed this to the local environment but it must be verified.

> **Action Item:** Fix offset early-settlement discount persistence/display; confirm the discount is saved and re-rendered, and that it appears in the **AR / PDC discount column**. — [ref](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ?timestamp=1484)

---

## 3. Origination Discount on the Current/New Loan (Confirmed)

- A discount can now also be applied to the **loan currently being applied for** (not just to an offset).
- Staff select a percentage, click **Apply → Recalculate**; the deduction is reflected against the current loan (e.g. a ₱33k reduction on a ₱500k release at 50%).
- The discount is **visible to the borrower** in the loan schedule, shown as an **"Origination Discount"** line (e.g. 3 months / ₱5,000).

**Status:** Accepted as demonstrated.

---

## 4. SME Application — Schedule Generation by Type (Confirmed)

Schedules were generated from the SME application (release date = today, Sept 1) for each mode:

| Mode | Behaviour demonstrated |
|---|---|
| **Regular monthly / MPL** | Monthly schedule generated; matches the AR ledger. Add-on months now correctly push the schedule months forward (e.g. Oct → Nov → Dec) and add an **add-on interest** amount. |
| **Salary** | Splits into **two payments within the month** (e.g. 15th and 30th/31st); dates correct from Sept 1. This was the item broken on Aug 25 — now fixed. First-payment row now also shows the **release date**. |
| **Weekly / Invoice** | Weekly dates generated for the number of terms (e.g. 3 terms → weekly through late November). |
| **Bi-monthly** | Payment every 2 months; dates and interest recomputed correctly. |
| **Quarterly** | 12-month term ÷ 4 = payment every 3 months; normal amortization confirmed correct. |
| **Daily** | Did not produce output in the demo — see Section 8. |

- The first-payment schedule now includes the **release date** as its own row (confirmed for salary: release date + first payment date shown together).

**Status:** All modes above accepted; daily still to be built.

---

## 5. Committee Override (Confirmed unchanged)

- **CSA initiates** the computation. **Committee can still override** it — including changing the loan schedule type (salary / weekly / etc.).
- Flow confirmed: Committee → vote / approve → LRA → PSA → **PDC creation**.

---

## 6. AR — New Discount Column on the PDC Ledger (Confirmed)

- The PDC ledger now has a **Discount** column.
- Future payments that were discounted (e.g. Dec / Jan 28 / Feb 28 at 100%) show the discount and a reduced amount due.
- **If a discounted payment is not paid within its due date, the discount is removed** and the original amount is restored (e.g. back to ₱56,000). Confirmed correct by the group.

---

## 7. Move of Payment (In progress — ~85%)

- New **"Move of Payment"** option added to the Collection screen (alongside Loan / Demand / Log / Record Payment).
- Opens a **Move of Payment page** where the Collector selects which scheduled payment to move (e.g. Sept 15), then sets a **new deadline / surcharge due date** for the shifted payment.
- On refresh, the schedule **adjusts and extends** (demo pushed the tail from November to December); a **status** shows whether each payment was "moved".
- The moved payment **does not add to the loan total**. The borrower pays **only that month's interest**; if that is not paid, the whole schedule **reverts to normal and a penalty applies**.
- Amount-to-pay logic is still being finalized (~85%).

> **Deliverable:** Finish the remaining ~15% (the amount-to-pay calculation) and present with the penalty breakdown.

---

## 8. Daily Schedule — Requirements Clarified (To build)

The daily mode produced no output in the demo. The group clarified the intended behaviour:

- SA selects a **payment date** (the borrower's known payoff / due date — e.g. a sales-invoice cheque date). "Bumbay style" / sales-invoice style.
- Interest is computed on the **number of days from the release date to that payment date**.
- Conceptually one term (~30 days) of interest, **divided across the number of days** until payment.
- The amortization / ledger shows **one row only — a single one-time payment** on that date. Not a monthly-term schedule.

> **Deliverable:** Implement the daily schedule — one-row amortization, interest counted from release date to the selected payment (due) date, single one-time payment. — [ref](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ?timestamp=2346)

---

## 9. Special Quarterly / Bi-Monthly Arrangement — New Requirement (To build)

- The **normal** quarterly and bi-monthly schedules are correct and stay as they are.
- One large client has a **special arrangement**: each period they pay **interest only** (interest, interest, interest…), then at the **end of the term** they settle the **full principal plus the final interest** (balloon). Minimal / specific to that client's terms.
- This should be an **additional, selectable variant** (via a terminology/label option), keeping the existing normal schedule alongside it. Applies to both the big **bi-monthly** and **quarterly** clients.

> **Deliverable:** Add the interest-only-then-principal (balloon) variant for quarterly and bi-monthly, selectable by terminology, without removing the normal schedule. — [ref](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ?timestamp=4892)

---

## 10. CFR — Add-on & Cut-off Handling (Confirmed)

- CFR now has a **due-date field** like the Calculator, with **cut-off options 5th / 15th / 25th** that set the first payment date accordingly.
- **Add-on months now add to the schedule months** (previously they did not); an **add-on interest** field is available (e.g. 2 months / ₱2,000).
- **Origination discount** line shows on the CFR loan (e.g. 3 months / ₱5,000).
- Same flow continues through **LRA → AR**; the discount breakdown carries through the ledger.

**Status:** Accepted as demonstrated.

---

## 11. Collector Discount in DCRR — New Requirement (To build)

- A **Collector** should be able to grant a discount to a **good payer / early payer** on an **active account where the borrower is NOT applying for a new loan** — they are simply paying their balance in full.
- This is **distinct from an offset**: an offset closes the account via a one-time payment tied to a **new application**; this is a straight full payment with no new application.
- **Management approval is required first.** The Collector does **not** set the discount — they **input the amount that was approved**. Treated as an internal arrangement on the account; the rest of the process is untouched.
- The discount can apply to **interest** and to **accumulated / compounded penalties** (to bring a large compounded penalty down so the log can be closed).
- Entered in the **DCRR**; the payment still goes through the **normal accounting approval**.
- The discount amount must be **shown in the letter** (so it is recorded) and reflected in the **AR / PDC discount column** and against the **penalty targets** for reconciliation.
- Requires a **role-based-access addition** so the Collector is allowed this discount capability.

> **Deliverable:** Add Collector discount in the DCRR (interest and penalty), gated by management approval and a new role-based-access permission; surface the amount in the letter and in AR / PDC. — [ref](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ?timestamp=4543)

---

## 12. Penalty Breakdown (In progress — ~90%)

- Remaining ~10% is a bug: the penalty breakdown currently **duplicates the month**. The correct per-item penalty breakdown is still to be finished.
- To be presented together with Move of Payment.

> **Deliverable:** Fix the duplicated-month issue and finish the correct penalty item breakdown.

---

## Deliverables & Commitments — Due Thursday, September 3, 2026

Sir Rene confirmed all previously-missing items from Aug 25 were delivered. Five items remain for the next session:

| # | Deliverable | Module | Current | 
|---|---|---|---|
| 1 | **Move of Payment** — finish amount-to-pay calculation | Collection / AR | ~85% |
| 2 | **Penalty breakdown** — fix duplicated month, complete per-item breakdown | Penalty | ~90% |
| 3 | **Collector discount** — DCRR (interest + penalty), management-approval gate, new role-based access, show in letter + AR/PDC | Collection / DCRR / RBAC | Not started / not integrated |
| 4 | **Special quarterly & bi-monthly** — interest-only-then-principal (balloon) variant, selectable, keep normal schedule | SME calculator / schedule | Not started |
| 5 | **Daily schedule** — one-row amortization, interest from release date to selected payment date, single one-time payment | SME calculator / schedule | Not started |

**Also to fix (not counted in the five):** Offset early-settlement discount not persisting / redisplaying after refresh; verify it shows in the AR / PDC discount column.

### Commitments
- **Rovick:** deliver items 1–5 by Thursday; send **chat updates** on progress in the meantime; follow up with **Sir Rene** on progress.
- **Sir Rene:** available Thursday 1:00 PM; no further questions or clarifications at close.

---

## Next Meeting

- **Thursday, September 3, 2026, 1:00 PM** — same Google Meet.
- Agenda: walk through the five deliverables above.

---

## Checklist — Track Progress Here

_Target: **Thursday, September 3, 2026 (1:00 PM demo)** unless noted._

### 1. Move of Payment
- [ ] "Move of Payment" option opens the Move of Payment page from the Collection screen
- [ ] Collector can select which scheduled payment to move
- [ ] Collector can set a new deadline / surcharge due date for the shifted payment
- [ ] Schedule adjusts and extends correctly on refresh; status shows "moved" per payment
- [ ] Moved payment does **not** add to the loan total
- [ ] Borrower pays only that month's interest; unpaid → whole schedule reverts to normal + penalty
- [ ] Amount-to-pay calculation finalized (the remaining ~15%)

### 2. Penalty Breakdown
- [ ] Duplicated-month issue fixed
- [ ] Correct per-item penalty breakdown displayed
- [ ] Presented alongside Move of Payment

### 3. Collector Discount (DCRR)
- [ ] New role-based-access permission allowing Collector to apply a discount
- [ ] Discount entry available in the DCRR
- [ ] Applies to interest
- [ ] Applies to accumulated / compounded penalties
- [ ] Requires management approval first; Collector only inputs the approved amount
- [ ] Payment still routes through normal accounting approval
- [ ] Discount amount shown in the letter (recorded)
- [ ] Discount reflected in the AR / PDC discount column and penalty targets
- [ ] Distinct from offset (no new application involved)

### 4. Special Quarterly / Bi-Monthly (Balloon Variant)
- [ ] Normal quarterly schedule unchanged
- [ ] Normal bi-monthly schedule unchanged
- [ ] New variant: interest-only each period, full principal + final interest at end of term
- [ ] Variant selectable via a terminology / label option
- [ ] Works for both quarterly and bi-monthly big-client cases

### 5. Daily Schedule
- [ ] SA selects a payment (due) date
- [ ] Interest computed on number of days from release date to that payment date
- [ ] One-row amortization only
- [ ] Single one-time payment on the ledger (no monthly terms)

### Bug Fix (carry-over)
- [ ] Offset early-settlement discount persists and redisplays after refresh
- [ ] Applied offset discount appears in the AR / PDC discount column

### Confirmed / Accepted This Meeting (no further action)
- [x] Offset ↔ Other Loan terminology corrected
- [x] Early settlement discount: interest only, month-selectable, editable, breakdown shown
- [x] Discount month ordering accepted as-is
- [x] Origination discount on the current loan, visible to borrower in the schedule
- [x] SME schedule generation: regular / MPL / salary / weekly-invoice / bi-monthly / quarterly
- [x] Add-on months push schedule months forward + add-on interest field
- [x] Release date shown as its own row on the first-payment schedule
- [x] Committee override retained (CSA initiates; Committee can change schedule)
- [x] AR PDC ledger discount column; discount removed if payment missed past due date
- [x] CFR cut-off options (5th / 15th / 25th) set first payment date; add-on months add to month; origination discount carries through LRA → AR

---

*Prepared from the meeting recording. Update checkboxes as items are completed.*
