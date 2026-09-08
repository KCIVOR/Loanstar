# Late Fee (Penalty) — Complete Requirements

Plain-language spec for the "penalty breakdown" deliverable (the last unfinished
item from the pre-Sept-04 meeting). Built from the Aug-25 and Sept-01 meeting
recordings. No technical detail — this is what the system must *do*.

Throughout, "**late fee**" = what the code calls a *penalty*, and "**monthly
payment**" = one row in the borrower's payment schedule.

---

## 1. The idea in one sentence

When a borrower is late on a payment, the system charges a **late fee** every
month until they pay, the fee **grows each month**, and when the borrower finally
pays, staff record **how much of that payment was for the late fee** versus the
actual loan — and the system automatically **fixes any late fee that turns out
to be wrong**.

---

## 2. The rules

### Rule 1 — Late fees are added automatically, every night

- Once a monthly payment's due date passes without full payment, the system adds
  a late fee to it. **No one has to trigger this by hand** — a scheduled job runs
  every night and does it for every overdue account.
- *(Nice-to-have, not required: a screen where a supervisor can hand-pick
  specific borrowers and add fees, as a backup. The automatic job is the main
  thing.)*

### Rule 2 — The late fee grows EVERY month the payment stays unpaid

This is the biggest change. Right now a late payment gets **one** fee and it
never grows. It must instead **compound monthly**.

- The fee is a percentage (currently **5%**, adjustable) of what is **currently
  owed** on that payment — and "currently owed" **includes the late fees already
  added**.
- Every month that passes with the payment still unpaid, another round is added
  on top.

**Example** — monthly payment of ₱10,000, fee rate 5%:

| When | What's owed on that payment | Late fee added | New total owed |
|---|---|---|---|
| Due date passes, month 1 | ₱10,000 | 5% × 10,000 = **₱500** | ₱10,500 |
| Still unpaid, month 2 | ₱10,500 | 5% × 10,500 = **₱525** | ₱11,025 |
| Still unpaid, month 3 | ₱11,025 | 5% × 11,025 = **₱551** | ₱11,576 |

- It must keep compounding **for as long as the payment is unpaid** — including
  on the borrower's **final payment**, where today the fee wrongly freezes.

### Rule 3 — Every overdue month gets its own late fee (not just the oldest)

Borrowers are allowed to skip months and choose which to pay. So a borrower can
have several overdue months at once.

- **Each** overdue monthly payment carries its own late fee, compounding on its
  own schedule (per Rule 2).
- Today the system only ever charges the **oldest** unpaid month and ignores the
  rest — that's wrong.

**Example** — borrower misses June, July, and August:

| Month | Late fee status |
|---|---|
| June | Overdue longest → most rounds of fee compounded |
| July | Overdue → its own fee, fewer rounds |
| August | Overdue → its own fee, one round |

### Rule 4 — When a payment is recorded, the system re-checks and fixes the fees automatically

Two situations, both handled **automatically** the moment AR records a payment —
no manual "waive" button needed:

**4a. The borrower actually paid on time, but the receipt arrived late.**
The nightly job already added a late fee. When AR records the payment with its
**real payment date**, the system sees that date was **on or before the due
date**, so it **removes the late fee** that shouldn't be there.

**4b. The borrower paid late, and only paid part of what's owed.**
The system **recomputes the late fees on what's still unpaid**, walking through
**every month that has passed** since the payment was due — not just one month.
So if the borrower is 3 months late and pays half, the remaining half keeps
carrying (and compounding) the fee for each of those 3 months.

- Any time a payment is added, changed, or reversed, the fees for that account
  should **recalculate to match reality**.

### Rule 5 — Recording a payment: separate the late-fee part from the loan part

Right now, if a borrower owes ₱10,000 for the month plus a ₱500 late fee and
pays ₱10,500, the system just records **"paid ₱10,500"** as one lump. It can't
tell how much was late-fee money.

- Add a **separate "late fee" field** on the payment-recording screen.
- The **collector types in** how much of the payment goes to the late fee versus
  the regular monthly payment.
- **The borrower does not decide this** — the collector (or Collections/AR)
  assigns it, exactly like the branch's paper accounting ledger already does.
- Example: borrower hands over ₱10,500. Collector records **₱10,000 → loan
  payment, ₱500 → late fee.**

### Rule 6 — Reports must show late-fee income

Because of Rule 5, the system must be able to answer:
**"How much did we collect in late fees this month/period?"**

- A report or column that totals only the late-fee portion of payments,
  separate from regular loan collections.
- This should line up with how AR/accounting already tracks it manually.

### Rule 7 — Late fees can be reduced or forgiven

- Collections or the Committee can offer a **discount on accumulated late fees**
  to get a stuck account to settle ("your late fees are ₱100,000; pay ₱X today
  and we'll write off the rest and close your account").
- This already exists in the system (the collector-discount feature). It just
  needs to keep working correctly alongside the new monthly-compounding fee.

### Rule 8 — The fee rate is adjustable

- The percentage (5% today) can be changed by an admin, because SEC/BSP rules
  change. Already in place — keep it.
- It can differ by loan segment (SME, individual, etc.). Already in place.

### Rule 9 — Special rule for Invoice, Auto, and Real-Estate loans

- Interest builds up for a **maximum of 3 months**.
- After **3 months** with no payment: **stop adding interest entirely.** From
  that point on, **only the monthly late fee** accrues on the outstanding
  balance.

### Rule 10 — Show a clear breakdown of each payment's balance

When an overdue amount gets carried forward and merged into a later payment, the
later payment's total must not become an unexplained lump. It should be possible
to see, for any monthly payment, **what makes up its balance**: how much is the
original amount, how much was carried over from a missed month, and how much is
late fees.

### Rule 11 — Aging and hand-off (already working, keep it)

- Accounts are grouped by how overdue they are: current, 1-30 days, 31-60,
  61-90, 91+ days.
- At **91 days** overdue, the account is automatically handed from the regular
  collector to the **remedial (hard collections)** team.

---

## 3. What's broken today (why this deliverable exists)

| # | Problem | Fixed by |
|---|---|---|
| 1 | Only the **oldest** overdue month gets a late fee; skipped months get nothing | Rule 3 |
| 2 | The late fee is charged **once** and then stops growing (only grows if it can roll onto a later payment; freezes on the last payment) | Rule 2 |
| 3 | **No way to remove a wrong late fee** — borrower paid on time but the fee stays forever | Rule 4a |
| 4 | A payment is recorded as one lump — **no record of how much was late-fee money** → "how much late-fee income" is unanswerable | Rules 5, 6 |
| 5 | After a missed amount is carried forward, the later payment's balance is **an unexplained lump** | Rule 10 |
| 6 | A known bug seen live: the nightly job **duplicates a month's payment row** | Fix as part of Rule 2/3 rewrite |
| 7 | The "stop interest after 3 months" rule for Invoice/Auto/REM **isn't really built** | Rule 9 |

---

## 4. Sign-off checklist (what to show the client)

- [ ] A borrower 3 months overdue has a **visibly larger** late fee than one 1
      month overdue — and it kept growing on the **final** payment too.
- [ ] A borrower who missed 3 months shows a late fee on **all 3**, not just the
      first.
- [ ] Record a payment dated **before** the due date on an account that already
      got a late fee → the fee **disappears** automatically.
- [ ] Record a **partial late** payment → the remaining balance still carries a
      recomputed late fee for each month elapsed.
- [ ] The payment screen has a **late-fee field**; a payment of ₱10,500 can be
      split into ₱10,000 loan + ₱500 late fee.
- [ ] A report shows **total late-fee income** for a period, separate from loan
      collections.
- [ ] For an Invoice loan 3+ months unpaid: **interest has stopped**, only late
      fees are growing.
- [ ] Any monthly payment's balance can be **broken down** into original amount /
      carried-over amount / late fees.
- [ ] No **duplicate month rows** appear after the nightly job or a "simulate
      delinquency" run.
