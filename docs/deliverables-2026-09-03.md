# Deliverables Report — Due September 3, 2026

**Source meeting:** Progress Demo, September 1, 2026 ([minutes](meeting-minutes-2026-09-01.md))
**Recording:** [View Recording](https://fathom.video/share/_yd8azwSorXhfiSQynBnyvyrfFndpbjJ)
**Owner:** Rovick Romasanta
**Review:** Sir Rene
**Delivery target:** **Thursday, September 3, 2026, 1:00 PM** — walkthrough on the same Google Meet
**Progress updates:** Rovick to send chat updates before the session

---

## Context

At the September 1 demo, Sir Rene confirmed that every item still outstanding from the August 25 walkthrough had been delivered. Five items remained open at the end of the call. This report describes each one, why it is needed, what "done" looks like, and when it is due.

All five are due for the **September 3, 1:00 PM** demo. Items 1 and 2 are near-complete bug/finish work; items 3, 4, and 5 are new build work raised during this meeting.

| # | Deliverable | Module(s) | Starting point |
|---|---|---|---|
| 1 | Move of Payment — finish amount-to-pay calculation | Collection / AR | ~85% built |
| 2 | Penalty breakdown — fix duplicated month | Penalty | ~90% built |
| 3 | Collector discount in DCRR | Collection / DCRR / Role-Based Access | Not integrated |
| 4 | Special quarterly & bi-monthly (balloon) schedule | SME calculator / schedule | Not started |
| 5 | Daily schedule | SME calculator / schedule | Not started |
| — | *Carry-over fix:* offset early-settlement discount not persisting | Offset / AR / PDC | Bug to verify |

---

## 1. Move of Payment — finish the amount-to-pay calculation

**Module:** Collection screen → Move of Payment page; reflected in AR ledger
**Starting point:** ~85% complete

### What it is
"Move of Payment" is the one-time relief option (agreed on Aug 25) that lets a struggling borrower shift a scheduled payment forward instead of missing it and accruing penalties. On the Collection screen there is now a **Move of Payment** option that opens a dedicated page. The Collector picks which scheduled payment to move (e.g. September 15) and sets a new deadline / surcharge due date for it. On refresh, the payment schedule adjusts and its tail extends by the moved period, and each payment row shows a status of whether it was moved.

### What is already working
- The Move of Payment option and page exist and are reachable from the Collection screen.
- Selecting a payment highlights its row; the Collector can enter a new deadline.
- The schedule re-generates and extends on refresh (demo pushed the tail from November to December).
- The moved payment does **not** add to the loan total.
- Rule confirmed: the borrower pays only that month's interest; if that is not paid, the whole schedule reverts to normal and a penalty applies.

### What is still needed (the ~15%)
- The **amount the borrower must pay** for the moved payment is not finalized. In the demo it was showing roughly 85% of the value and is still being worked out. This calculation must be completed so the figure is correct and stable, and it must display correctly on the Move of Payment page and on the AR ledger.

### Definition of done
- Moving a payment produces a correct, final "amount to pay" (one month's interest for that payment).
- The moved amount is shown on the Collection page and the AR ledger, does not inflate the loan total, and the revert-to-normal + penalty behaviour works if it goes unpaid.

### Delivery
**September 3, 2026** — presented together with the penalty breakdown (Item 2).

---

## 2. Penalty breakdown — fix the duplicated month

**Module:** Penalty computation / breakdown view
**Starting point:** ~90% complete

### What it is
The penalty breakdown shows, per overdue period, how a borrower's penalty was built up (base amount, rate, compounding on prior unpaid balance + prior penalty). This supports the Aug 25 decision to track penalty amounts separately from regular amortization.

### What is still needed (the ~10%)
- The breakdown currently **duplicates the month** — the same period appears more than once in the itemized list. The remaining work is to correct the per-item breakdown so each period appears once with the right figures.

### Definition of done
- The penalty breakdown lists each overdue period exactly once with correct base, rate, and compounded values.
- Totals reconcile with the penalty shown on the ledger.

### Delivery
**September 3, 2026** — presented together with Move of Payment (Item 1).

---

## 3. Collector discount in the DCRR

**Module:** Collection → DCRR; Role-Based Access; letter output; AR / PDC discount column
**Starting point:** Not integrated (flow understood, not built into the DCRR)

### What it is
A way for a **Collector** to give a discount to a borrower who is a **good payer / early payer** on an **active account** — where the borrower is **not** applying for a new loan, they are simply paying their balance in full. This closes out the account cleanly.

This is **distinct from an offset.** An offset closes an account through a one-time payment that is tied to a **new loan application**. The Collector discount has **no new application** — it is a straight full payment on an existing active account.

### How it must work
- **Management approval comes first.** The Collector does not decide the discount. Management approves a specific discount for a specific borrower, and the Collector **inputs the approved amount** into the system. It is treated as an internal arrangement on the account; no other part of the process changes.
- The discount can apply to:
  - **Interest**, and
  - **Accumulated / compounded penalties** — so a penalty that has compounded to a large figure can be brought down to an agreed amount and the log closed.
- It is entered in the **DCRR**. The payment still goes through the **normal accounting approval** path.
- The discount amount must appear:
  - **In the letter** (so it is recorded), shown like the payment schedule breakdown, and
  - **In the AR / PDC discount column** and against the **penalty targets**, so it reconciles.
- A new **role-based-access permission** is required so that the Collector role is allowed this discount capability. (Sheila confirmed this is an additional RBAC capability for the Collector role.)

### Definition of done
- New RBAC permission exists and gates the feature to the Collector role.
- Collector can enter an approved discount in the DCRR against interest and/or penalties.
- Approval-first workflow is enforced (Collector inputs an approved amount, does not set policy).
- Discount shows in the generated letter and in the AR / PDC discount column and penalty targets.
- Payment continues to flow through the normal accounting approval.

### Delivery
**September 3, 2026.**

---

## 4. Special quarterly & bi-monthly schedule (interest-only, then balloon)

**Module:** SME calculator / schedule generation
**Starting point:** Not started (normal quarterly and bi-monthly schedules already work)

### What it is
The normal quarterly and bi-monthly schedules demoed on September 1 are correct and stay exactly as they are. In addition, one large client has a **special arrangement**:

- Each period they pay **interest only** (interest, interest, interest…).
- At the **end of the term** they settle the **full principal plus the final period's interest** in one payment (a balloon payment).
- This is minimal and specific to that client's terms.

The same pattern applies to both the big **quarterly** client and the big **bi-monthly** client.

### How it must work
- Keep the existing normal quarterly and bi-monthly amortization untouched.
- Add a **selectable variant** — chosen via a terminology / label option in the calculator — that generates the interest-only schedule with a principal + final-interest balloon at the end of the term.
- Works for both quarterly and bi-monthly.

### Definition of done
- Normal quarterly and bi-monthly schedules unchanged.
- Selecting the special variant produces: interest-only rows per period, then a final row for full principal + last interest.
- Variant is clearly selectable and labeled.

### Delivery
**September 3, 2026.**

---

## 5. Daily schedule

**Module:** SME calculator / schedule generation
**Starting point:** Not started (the daily mode produced no output in the demo)

### What it is
A schedule for short-term loans with a **known single payoff date** — for example, a business borrowing against a sales invoice where the client's cheque date is already known ("Bumbay style" / sales-invoice style).

### How it must work
- The SA selects a **payment date** — the date the borrower will pay off the loan.
- Interest is computed on the **number of days from the release date to that payment date**. Conceptually one ~30-day term of interest, divided across the actual number of days.
- The amortization / ledger shows **one row only** — a **single, one-time payment** on that date.
- It is **not** a monthly-term schedule; the "term" effectively becomes a day count to the target date.

### Definition of done
- SA can pick a payment (due) date.
- Interest is calculated from release date → selected payment date by day count.
- The schedule and ledger show a single one-time payment row, no monthly terms.

### Delivery
**September 3, 2026.**

---

## Carry-over fix — offset early-settlement discount not persisting

**Module:** Offset creation; AR / PDC discount column
**Not counted among the five deliverables, but to be verified.**

During the demo, after applying a 50% / 100% early-settlement discount on an offset and refreshing, the applied discount did **not** persist or redisplay. Rovick attributed this to the local environment. Before the next demo:

- Confirm the applied discount is saved and re-rendered after refresh.
- Confirm the discount appears in the **AR / PDC discount column**.

### Delivery
Verify by **September 3, 2026** and confirm during the walkthrough.

---

## Delivery Schedule Summary

| Deliverable | Due | Notes |
|---|---|---|
| 1. Move of Payment — amount-to-pay calc | **Sep 3, 2026, 1:00 PM** | Demo with Item 2 |
| 2. Penalty breakdown — duplicated month | **Sep 3, 2026, 1:00 PM** | Demo with Item 1 |
| 3. Collector discount in DCRR | **Sep 3, 2026, 1:00 PM** | New RBAC permission + letter + AR/PDC |
| 4. Special quarterly & bi-monthly (balloon) | **Sep 3, 2026, 1:00 PM** | Keep normal schedules; add variant |
| 5. Daily schedule | **Sep 3, 2026, 1:00 PM** | One-row, one-time payment |
| Carry-over: offset discount persistence | **Verify by Sep 3, 2026** | Not one of the five |

**Progress updates:** Rovick sends chat updates to Sir Rene / Sheila in the run-up to the session.
**Next review:** Thursday, September 3, 2026, 1:00 PM, same Google Meet.
