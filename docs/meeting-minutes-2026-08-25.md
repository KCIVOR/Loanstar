# Meeting Minutes — System Walkthrough & Review
**Date:** August 25, 2026
**Duration:** ~3 hours 25 minutes
**Recording:** [View Recording](https://fathom.video/share/6r948ueWz_qT4pdCnvaWxbodCYSdLwJx)

---

## Purpose of the Meeting

Rovick walked through the current state of the loan system (new loan applications, active loan dashboards, payment handling, and interest/penalty calculations) so decisions could be confirmed and issues flagged before moving forward with the next round of development.

---

## 1. Applying for a New Loan While Already Having an Active Loan

- Borrowers can now apply for a second loan even while they already have one running.
- On the borrower's dashboard, there is an **"Apply for Another Loan"** button. Clicking it lets the borrower choose the loan type (Individual or SME) and the collateral type (Clean, Auto, or Real Estate) before starting the new application.
- The system was demonstrated end-to-end using a "Clean Loan" (no collateral) as the test case.

**Decision:** Approved as demonstrated, with adjustments noted below.

---

## 2. Active Loans Dashboard

- A new section was added showing **cards for each active loan** (loan/account number, outstanding balance, etc.), so staff can quickly see a borrower's existing loans at a glance.
- Question raised: should the loan/account number be manually entered or automatically generated in sequence? **Decision:** It should follow the same numbering pattern already used for loan numbers, and this should eventually be automatic rather than manual. This will be looked into.

---

## 3. Paying Off or Reducing Other Loans During a New Application

When a borrower applies for a new loan while they still owe on an old one, the system lets staff apply part of the new loan's proceeds toward the old balance. Two options were shown:

- **Full settlement of another loan** — pay off an existing loan completely using the new loan.
- **Partial payment toward another loan** — apply only part of the new loan toward an existing balance for a specific month or months.

**Important correction:** The two option labels were mixed up in the current build and need to be swapped:
- What is currently labeled **"Other Loan"** should actually be **"Offset"** (full settlement).
- What is currently labeled **"Offset"** should actually be **"Other Loan"** (partial payment).

This was a naming/labeling fix only — the underlying process itself is correct.

---

## 4. Early Settlement Discounts

This describes what happens when a borrower wants to pay off a loan early ("offsetting"), and management chooses to give them a discount.

- **Only interest can be discounted — never the principal (the original loan amount).** The full remaining principal must always be paid back.
- **A borrower cannot get a discount on a payment that is already due or overdue.** Once a due date has passed, that amount must be paid in full — discounts only apply to *future*, not-yet-due months.
- There is also a standard **one-month "termination fee"** (equal to one month's interest) charged when a loan is settled early. This is separate from — and comes out of — the discount given.
- **Only Committee and CSA (Customer Service/Sales Associate) staff are authorized to approve a discount.** However, since the discount amount is entered into the loan calculator, access to make that entry should be open to relevant staff — approval authority stays with Committee/CSA, but they need someone to input it.
- Discounts can apply to **any loan type**, not just Seafarer loans.

**Decision:** This logic should be built into the calculator as a toggleable/editable field so staff can select which months' interest to discount.

---

## 5. "Move of Payment" (Seafarer & All Loan Types)

This is a one-time relief option for borrowers who are struggling to pay on time.

- Instead of missing a payment and accumulating penalties, the borrower can pay a smaller amount — equal to **one month's interest only** (called a "security fee").
- Paying this amount **shifts the borrower's entire remaining payment schedule forward by one month**, without changing what they ultimately owe. It essentially buys them one extra month.
- **This can only be used once per loan.** If the borrower fails to pay the shifted schedule afterward, everything reverts back to the original schedule, and penalties will apply as normal.
- This feature applies to **all loan types**, not just Seafarer loans.
- It is initiated by the **Collections team**, not by the borrower directly (it should not be a self-service option on the borrower's own dashboard).

**Action Item:** Design how this will be triggered from the Collections dashboard and how it reflects on the borrower's payment ledger.

---

## 6. First Payment Due Dates (By Loan Type)

Confirmed rules for when a borrower's first payment is due:

| Loan Type | Rule |
|---|---|
| **SME / MPL (Multi-Purpose Loan) / Auto** | First due date is exactly **one month after the release date**. Example: released Aug 20 → first due date Sept 20. |
| **Salary Loan** | Due dates are fixed at either the **5th, 15th, or 25th** of the month, based on the borrower's actual payday — set by CSA. |
| **Seafarer** | Uses a **cutoff system** (see Section 7 below) — more complex due to overseas pay schedules. |
| **Invoice Financing** | No fixed due date — payment depends on when the borrower's client pays their invoice (see Section 8). |

**"Add-on months":** If staff add extra month(s) onto a loan before release (e.g., to delay the first payment), the first due date shifts forward accordingly, and additional interest is added for each extra month. This should be reflected correctly on-screen (see Action Items).

---

## 7. Seafarer Cutoff Rule (Needs Further Review)

Seafarer loans follow their pay cutoff schedule (adapted from the manning agency's own payroll cutoff), not a simple "one month after release" rule.

- The cutoff is on the **21st of each month.**
- Any loan released between the **22nd of one month and the 21st of the next month** is treated as if it were released in the earlier month, for due-date counting purposes.
  - Example: A loan released anytime from Aug 22 to Sept 21 is treated as an "August release."
- This caused confusion during the walkthrough because loans released very close to the 21st can appear to have an oddly long or short gap before the first payment. The group worked through several examples on screen to confirm the logic is mathematically correct, even though it looks unusual at first glance.
- **This section needs a separate, more detailed follow-up discussion** dedicated purely to the cutoff logic, ideally with written documentation to avoid confusion.

**Action Item:** Rovick to prepare a document specifically explaining the Seafarer cutoff and due-date logic.

---

## 8. Other Special SME Loan Structures

Several sub-types under the SME calculator were reviewed:

- **Auto Loans / Real Estate Mortgage (REM):** Unlike a standard SME loan (where the amount handed to the borrower is the starting point and all fees are added on top), **Auto and REM loans calculate everything — including fees — directly from the approved loan amount** (the amount requested/approved is the true principal).
- **Invoice Financing:** Designed for businesses that borrow against unpaid invoices from their own clients.
  - Interest builds up **weekly** (roughly 1% per week) for up to 3 months.
  - After 3 months without payment, no further interest is added — instead, penalties begin.
  - **No "add-on month" option applies to this loan type**, since the payment timing already depends on when the borrower's own client pays them.
- **Bi-Monthly Payments:** The monthly payment is simply split in half and collected twice a month (roughly every 15 days) instead of once.
- **Quarterly Payments:** Similar concept to bi-monthly, but payments are grouped every 3 months instead. Only the payment schedule changes — the total amount owed does not.
- **Daily-Interest Loans:** Interest is calculated based on the exact number of days until the agreed payment date (used for short-term loans with a known payoff date).

**Decision:** All of the above are confirmed as correct. Bi-monthly and other applicable options should also be added to the loan application form so borrowers/CSA can select them upfront.

---

## 9. Penalty Calculation Logic

- Penalties apply automatically once a payment becomes overdue (currently set at a percentage per month, but this is adjustable since regulations from the SEC/BSP can change).
- **Penalties compound** — if a borrower misses multiple months, each new month's penalty is calculated on top of the previous unpaid balance *plus* prior penalties.
- There was discussion about **how penalties get triggered**:
  - Preferred approach: an **automatic system check** runs on a schedule and flags all overdue accounts, rather than staff manually selecting individual borrowers.
  - A remaining concern to resolve: what happens if a borrower actually paid on time, but the proof of payment (receipt/deposit slip) was submitted late? The system should be able to **reverse or adjust a penalty** once the actual payment date is confirmed, rather than leaving an incorrect penalty on record.
- **Penalty payments must be tracked separately from regular loan payments (amortization).** Currently, when a borrower pays, the system doesn't clearly distinguish how much of that payment went toward the penalty versus the regular loan payment. This makes it hard to report "how much penalty income did we collect" accurately.
  - **Decision:** Add a separate field/column so Collections staff can specify how much of a payment applies to the penalty vs. the regular loan balance. This will also match how the current manual/accounting ledger already separates these two amounts.
- Committee/Collections can also offer a **discount on accumulated penalties** to encourage a borrower to settle — this is a separate scenario from the interest-discount rules in Section 4.

**Decision:** Rovick will simulate the full penalty computation logic (including partial payments and reversals) and confirm it's working correctly before finalizing.

---

## 10. Application Form & Document Adjustments

- **Application form sequence:** For SME loans, the form should ask for **Business information first, then Individual/Representative information** — not the other way around, since the business is the primary subject of the loan.
- **Remove the separate "Application Form" upload requirement** from the document intake checklist (it's redundant — the form is filled out within the system itself, not uploaded as a file).
- **Add a border/outline** to the rounded-off figures shown in the AR (Accounts Receivable) section, for visual clarity.
- **Add a Co-Borrower section** to the application form, with basic fields only (full name, address). This is only needed when the approving officer determines a co-borrower is required — CSA will then be asked to go back and add these details before the loan proceeds to LRA (Loan Release/Approval).
- **Release Date** should become a standard piece of information tracked for every loan (visible alongside things like the loan/account number and first payment date) — right now it isn't clearly recorded.
- **Loan Information Sheet:** This printed summary (shown during both CSA intake and final LRA release) is the same format for both stages. The additional bottom section with ratio breakdowns is specific to **Seafarer loans only** — other loan types do not need that section.

---

## 11. Remedial / Restructured Accounts (Deferred)

- Discussion on how penalties and restructuring work for accounts that have moved to "Remedial" status (heavily overdue, being restructured) was **postponed** — this needs its own dedicated session.
- **Action Item:** Rovick to send a separate document explaining Remedial account computations before the next discussion.

---

## Checklist — Track Progress Here

_Target for all items below: **By Thu/Fri (Aug 27–28, 2026)**, unless noted otherwise. Check items off as they're completed._

### Multiple / Additional Loan Applications
- [ ] "Apply for Another Loan" button works for borrowers with an existing active loan
- [ ] Modal lets user pick loan type (Individual or SME)
- [ ] Modal lets user pick collateral type (Clean, Auto, Real Estate)
- [ ] Individual loan sub-type selector (Housing, Multi-Purpose, Salary) works correctly

### Active Loans Dashboard
- [ ] Active loan cards display account number, loan amount, and balance correctly
- [ ] Loan/account numbering follows the same sequence as the main loan numbering system
- [ ] Loan/account number generation is automated (not manually typed) — *to be investigated/planned*

### Offset / Other Loan (Paying Off Existing Loans)
- [ ] **Fix label swap:** "Other Loan" should be "Offset" (full settlement)
- [ ] **Fix label swap:** "Offset" should be "Other Loan" (partial/month-specific payment)
- [ ] "Offset" (full settlement) correctly pays off an existing loan in full using new loan proceeds
- [ ] "Other Loan" (partial) lets user select specific month(s) to pay via dropdown
- [ ] Supports adding more than one other loan/offset entry at the same time
- [ ] Reference number field pulls in relevant loan number correctly

### Early Settlement Discounts
- [ ] Discount logic applies to **interest only**, never principal
- [ ] System blocks discounts on any amount already past its due date (due & demandable)
- [ ] One-month termination fee (equal to 1 month interest) auto-applied on early settlement, separate from discount
- [ ] Discount is editable/selectable by month (not just a flat all-or-nothing discount)
- [ ] Access to enter discount amount is open to relevant staff; approval authority stays with Committee/CSA
- [ ] Confirmed working across **all loan types**, not just Seafarer

### Move of Payment (One-Time Relief)
- [ ] Available for **all loan types** (not Seafarer-only)
- [ ] Payment amount required = 1 month's interest ("security fee")
- [ ] Paying it shifts the entire remaining schedule forward by one month
- [ ] Enforced as **one-time use only** per loan
- [ ] If borrower fails to pay the shifted schedule, system reverts to original schedule + applies penalty
- [ ] Triggered/initiated from the **Collections dashboard** (not borrower self-service)
- [ ] Ledger correctly reflects the moved payment line (no false "past due" shown)

### First Payment Date Logic (By Loan Type)
- [ ] SME: first due date = release date + 1 month
- [ ] MPL: first due date = release date + 1 month (same as SME)
- [ ] Auto: first due date = release date + 1 month
- [ ] Salary Loan: due date fixed at 5th, 15th, or 25th, based on borrower's payday (set by CSA)
- [ ] Seafarer: first due date follows cutoff logic (see below)
- [ ] Invoice Financing: no fixed due date, follows client-payment-dependent schedule
- [ ] Add-on month field accepts **0** as a valid value (meaning no add-on)
- [ ] Add-on month value correctly shifts/reflects on the calculated first payment date
- [ ] Add-on month correctly adds proportional interest to total loan cost

### Seafarer Cutoff Rule
- [ ] Cutoff date fixed at the **21st of each month**
- [ ] Releases from the 22nd through the 21st of the next month are grouped as one "release month"
- [ ] First due date calculation correctly accounts for cutoff grouping (validated against meeting test cases)
- [ ] Add-on months calculate correctly in combination with cutoff logic
- [ ] Due date field supports fixed options: **5th, 15th, or 25th**
- [ ] Written explainer document from Rovick received and reviewed
- [ ] Dedicated follow-up session held to confirm logic end-to-end

### SME Loan Sub-Types & Special Computations
- [ ] **Auto / REM:** computation starts from approved loan amount as true principal (fees deducted from it, not added on top)
- [ ] **Invoice Financing:** weekly interest accrual (~1%/week) implemented correctly
- [ ] **Invoice Financing:** interest accrual stops after 3 months; penalty applies after that
- [ ] **Invoice Financing:** "add-on month" option disabled/hidden for this loan type
- [ ] **Bi-Monthly:** payment split in half, collected every ~15 days
- [ ] **Bi-Monthly:** option added to the loan application form
- [ ] **Quarterly:** payments grouped every 3 months; final quarter splits principal & interest into separate line items
- [ ] **Quarterly:** option added to the loan application form
- [ ] **Daily-Interest:** interest computed based on exact number of days to agreed payment date
- [ ] All sub-type codes/identifiers (SME, MP, Invoice, Auto, REM, etc.) confirmed correctly mapped in calculator

### Penalty Computation
- [ ] Penalty auto-applies once a payment is overdue
- [ ] Penalty rate is configurable/editable (not hardcoded), since SEC/BSP rules can change
- [ ] Penalties compound correctly month-over-month on outstanding balance + prior penalty
- [ ] Automatic scheduler flags overdue accounts and triggers penalty calculation (no manual per-borrower trigger needed)
- [ ] Option/fallback exists to select specific borrowers for penalty computation if needed
- [ ] System can reverse/adjust a penalty when proof of on-time payment is submitted late
- [ ] Partial payments correctly reduce the balance penalty is calculated on (recalculates on remaining balance)
- [ ] Multiple missed months each compound their own penalty correctly (validated against meeting test case)
- [ ] Penalty discount option available for Collections/Committee (separate from interest discount above)

### Ledger / Payment Tracking
- [ ] New field/column added to separate **penalty payment amount** from **regular amortization payment amount**
- [ ] Collections staff can specify how a payment splits between penalty and amortization
- [ ] Ledger entries match the format/structure already used in the manual AR ledger
- [ ] Reports can accurately total "penalty income collected" separately from principal/interest collected

### Application Form Adjustments
- [ ] SME application form order changed: **Business info first, then Individual/Representative info**
- [ ] "Application Form" removed from the document upload/intake checklist (redundant — filled in-system)
- [ ] Co-Borrower section added to application form (Full Name, Address fields)
- [ ] Co-Borrower fields only required/shown when approving officer flags "co-borrower needed"
- [ ] Workflow: CSA notified to go back and add co-borrower details before proceeding to LRA
- [ ] Bi-Monthly (and other new payment schedule types) added as selectable options on the form

### Documents & Printing
- [ ] Border/outline added to rounded-off amount display in AR section
- [ ] "Release Date" added as a standard, always-visible field for every loan (not just in calculator)
- [ ] Loan Information Sheet prints correctly during **CSA** stage (initial)
- [ ] Loan Information Sheet prints correctly during **LRA** stage (final)
- [ ] Confirmed: bottom ratio-breakdown section on the sheet shows **only for Seafarer loans**, hidden for other types
- [ ] CI Form correctly differentiates: Seafarer uses Employment Verification Form; other individual loans use standard CI form
- [ ] Promissory Note (PN) correctly generated per loan type (MPL/Salary use PN-MPL format; SME uses separate format)
- [ ] Cancellation of Mortgage document correctly pulls in notarization details (only available after full payment + notarization)

### Remedial / Restructured Accounts (Deferred Topic)
- [ ] Document from Rovick on Remedial computation received
- [ ] Follow-up session scheduled and held
- [ ] Remedial penalty/restructuring logic defined and confirmed

### Rovick's Follow-Up Deliverables
- [ ] Written explainer on the Seafarer cutoff logic
- [ ] Document on Remedial account computation
- [ ] Simulate and confirm full penalty computation logic, including partial payments and reversals

---

## Progress Summary

| Category | Total Items | Completed |
|---|---|---|
| Multiple Loan Applications | 4 | 0 |
| Active Loans Dashboard | 3 | 0 |
| Offset / Other Loan | 6 | 0 |
| Early Settlement Discounts | 6 | 0 |
| Move of Payment | 7 | 0 |
| First Payment Date Logic | 9 | 0 |
| Seafarer Cutoff Rule | 7 | 0 |
| SME Sub-Types | 10 | 0 |
| Penalty Computation | 9 | 0 |
| Ledger / Payment Tracking | 4 | 0 |
| Application Form | 6 | 0 |
| Documents & Printing | 8 | 0 |
| Remedial Accounts | 3 | 0 |
| Rovick's Follow-Up Deliverables | 3 | 0 |
| **Total** | **85** | **0** |

---

*Minutes and checklist prepared from the meeting recording and Rovick's working notes. Update checkboxes as items are completed; update the Progress Summary table to match.*
