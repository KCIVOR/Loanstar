# Meeting Minutes — Progress Review: September 4 Deliverables

**Date:** September 9, 2026 · **Time:** 1:00 PM · **Duration:** 68 minutes · **Format:** Google Meet (impromptu progress review)

### Attendees

| Name | Role |
|---|---|
| Rovick Romasanta | Developer (presenter) |
| Client review team | Product owner and stakeholders |

---

## 1. Executive Summary

All four deliverables committed on September 4 have been completed and are running on the live system. The client reviewed each item through a working demonstration and accepted the delivery. Testing focus now shifts from defect remediation to end-to-end validation of a complete system.

One follow-up item was identified during review: the penalty ledger calculation is correct, but it does not yet present a per-month remaining balance after a partial payment. This is a presentation gap only and is scheduled for the next session.

The engagement now enters its next work stream: **document generation in the LRA module** and a **data import/export template** for migrating historical borrower records.

---

## 2. September 4 Deliverables — Status: Complete

### 2.1 Penalty Breakdown
- Overdue penalties are now tracked **per overdue month** rather than being consolidated or duplicated.
- The breakdown supports both daily-rate and monthly schedules.
- Penalty is assessed at **5% of the outstanding balance** per missed period and compounds for each subsequent unpaid period, up to a **three-month** ceiling.
- Penalty is calculated on any outstanding balance, whether that balance represents the amortization due or an unpaid penalty amount.
- Collections staff can direct a payment to either the amortization due or the outstanding penalty. When the full amount is entered, allocation is automatic; when a partial amount is entered, the penalty is settled first and the remainder is applied to the amortization.

**Outcome:** Calculation logic accepted as correct. See Section 3 for the outstanding presentation item.

### 2.2 Offset With Discount
- A discounted offset now settles the target loan **in full**. Previously, an offset could leave a residual balance.
- The discount is applied and the offset amount is recalculated correctly through the full workflow (application → LRA → Committee → Accounts Receivable → internal transfer).

**Outcome:** Accepted as demonstrated. Demonstration case: a discounted offset reduced the amount due from approximately ₱492,000 to ₱475,000 and closed the target loan as fully paid.

### 2.3 Duplicate Daily Collection Report (DCRR) Guard
- The account queue now displays a **pending-record indicator** for any month with an unposted DCRR.
- Submitting a **duplicate DCRR for the same period is blocked**, with an on-screen advisory identifying the existing record and its reference number.
- On the Accounts Receivable side, an overlapping or fully-covering second record cannot be selected unless the first is rejected.
- **Legitimate partial payments remain permitted** within the same period, provided the combined total does not exceed the amount due.

**Outcome:** Accepted as demonstrated.

### 2.4 Daily Interest Divisor
- The interest divisor previously used a fixed 30-day assumption. It now uses the **actual number of days in the applicable month**.
- The change is in the calculation layer and is not surfaced in the user interface.

**Outcome:** Accepted on confirmation.

---

## 3. Follow-Up Item — Penalty Ledger: Per-Month Remaining Balance

The penalty calculation is correct. The gap is in presentation: after a partial payment, collections staff cannot readily see the remaining balance for a specific month, because the current view shows only a single running total.

**Client requirement:**
- Adopt an accounting-ledger presentation in which a **new line is added beneath a period when a partial payment is recorded**, showing the updated balance for that period.
- The view must allow staff to state a borrower's current balance for a given month on request, including any remaining penalty.
- Where a period is partly settled, the view should show only the remaining amortization due plus the remaining penalty; a fully-settled penalty should show as zero.

**Planned resolution:** Add a per-month remaining-balance column (or ledger-style running lines) that updates as payments are recorded. This is a user-interface change only; the underlying calculation is unchanged. Estimated as low effort.

**Related points discussed:**
- Penalty recharges at 5% of the outstanding balance for each additional unpaid period, compounding up to three months.
- Automatic assignment to remedial handling occurs once a balance remains outstanding beyond approximately three cycles (in the range of 90 to 125 days). The exact threshold is to be confirmed.

---

## 4. Next Work Stream

### 4.1 Document Generation — LRA Module
Generation of the documents produced during LRA processing is the primary deliverable for the next session.

### 4.2 Data Import / Export Template
- The system requires a defined column template for importing and exporting borrower masterfile data, to support migration of historical records without manual entry.
- The open question is whether the client's existing masterfile format or the system's data structure should govern the template.
- The client will provide sample files for assessment.

**Decision:** Rovick will first attempt to align with the client's masterfile format. If it is not workable, the system's template will be adopted and the client will conform to it. The client agreed to this approach.

---

## 5. Deployment

Following delivery of the next-session items, the plan is to proceed to end-to-end testing with a full set of user roles to simulate the complete workflow. Deployment timing is to be confirmed.

---

## 6. Deliverables and Commitments

### 6.1 Completed and Accepted This Session

| # | Deliverable | Module | Status |
|---|---|---|---|
| 1 | Penalty breakdown — per-month tracking, daily and monthly rates, 5% of outstanding balance, compounding to three months, staff-directed allocation | Penalty / Collections | **Complete** (logic accepted) |
| 2 | Offset with discount — settles the target loan in full | Application / LRA / Committee / AR | **Complete** |
| 3 | Duplicate DCRR guard — pending indicator and duplicate block; partial payments preserved | Collections / AR | **Complete** |
| 4 | Daily interest divisor — actual days in month | Calculation layer | **Complete** |

### 6.2 Open — Due Wednesday, September 10, 2026

| # | Deliverable | Module | Notes |
|---|---|---|---|
| A | Per-month remaining-balance view on the penalty ledger; updates on partial payment; shows remaining amortization due plus remaining penalty | Collections / AR ledger (UI) | **Open** — presentation only; calculation unchanged |
| B | LRA document generation | LRA | **Open** — primary deliverable for the next session |
| C | Import/export template — assessment of client formats against the system structure and a recommendation | Data migration | **Open** — status update only at the next session |

### 6.3 Commitments

| Owner | Commitment |
|---|---|
| **Rovick Romasanta** | Deliver items A and B for the September 10 session. Review the client's masterfile format and advise on the template direction; provide a written progress update. |
| **Client review team** | Advise whether the existing format is suitable or the system template should be adopted. Confirm deployment timing and the remedial auto-assignment day threshold. |

---

## 7. Next Meeting

**Wednesday, September 10, 2026, 2:00 PM** — Google Meet
**Agenda:** penalty ledger per-month remaining balance · LRA document generation · import/export template recommendation
