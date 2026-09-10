# Validation Journey — "A paid late fee sticks"

Plain-language walkthrough to confirm the fix: **once money is paid toward a
month's late fee, that fee no longer shrinks when the borrower pays down
principal**, and future months still grow the fee correctly.

Do each **Action**, then check the **Expected** column. Every figure was
checked against the live database for test loan **AN300459**
(SME, 5% late-fee rate, ₱74,800 per month).

> **What changed:** before, if a month was late and the borrower made a
> part-payment, the system recalculated the late fee as 5% of whatever was
> *left* — so paying some principal (or even paying the fee itself) made the
> fee smaller. Now the fee you've paid is locked in: it can't be recalculated
> below what was collected, and the money you put toward the fee no longer
> counts as paying down principal.

---

## 0. Starting point

Sign in as **AR → Masterlist → AN300459** (Luz Torres). Confirm:

| Field | Expected |
|---|---|
| Account status | **active** |
| Aging bucket | **current** |
| Outstanding balance | **₱897,600.00** |
| All 12 months | status **pending**, Target **₱74,800.00**, Penalty **₱0.00** |
| Due dates | **2026-10-08 … 2027-09-08** |

**Tool:** on the account page, **"Simulate delinquency"** (enter a number of
days) back-dates the schedule so the oldest unpaid month lands that many days
overdue, then runs the real nightly job. It changes real data — ask the dev
team for a reset between parts (each part below starts from the clean state
above).

---

## Part 1 — Pay the whole month + fee: the fee is booked and stays

| # | Action | Expected |
|---|---|---|
| 1.1 | **Simulate delinquency → 40.** Reopen the account. | **Month #1**: status **overdue**, Target **₱74,800.00**, **Penalty ₱3,740.00** (5% × 74,800). Months #2–#12 unchanged. Aging bucket → **31-60**. |
| 1.2 | As **Collector**, record a payment of **₱78,540.00** (74,800 + 3,740), dated today. In **Allocate payment**: tick **Month #1** in the grid, applied amount **₱78,540.00**; in **Late fee paid**, tick Month #1, **₱3,740.00**. "Advance (leftover)" = **₱0.00**. Add to DCRR → submit. | Line added with no error. |
| 1.3 | As **AR**, reconcile the deposit (₱78,540.00) and **post**. | **Month #1**: status **paid**. **Penalty column still shows ₱3,740.00** (that's the fee that was charged and paid — it is not blanked). **Outstanding balance → ₱822,800.00** (897,600 − 74,800). Late-fee income of **₱3,740** is recorded for reports. |

**Part 1 passes if:** Month #1 closes, its Penalty still reads ₱3,740, and the
balance drops by ₱74,800 (the principal) — the ₱3,740 fee was money the
borrower owed on top, now collected.

---

## Part 2 — THE KEY TEST: part-payment covering the fee does **not** shrink it

*(Reset AN300459 first.)*

| # | Action | Expected |
|---|---|---|
| 2.1 | **Simulate delinquency → 40.** | **Month #1**: overdue, Target **₱74,800.00**, **Penalty ₱3,740.00**. |
| 2.2 | As **Collector**, record **₱41,140.00** (₱37,400 = half the month + ₱3,740 = the full fee), dated today. Allocate **₱41,140.00** to **Month #1** in the grid; **Late fee paid** = Month #1, **₱3,740.00**. Advance = ₱0.00. Add → submit. | — |
| 2.3 | As **AR**, reconcile (₱41,140.00) and **post**. Reopen the account. | **Month #1**: status **partial**. <br>**Penalty ₱3,740.00 — UNCHANGED.** *(Before the fix this dropped to **₱1,683.00**.)* <br>Amount still owed on Month #1 = **₱37,400.00** (74,800 + 3,740 − 41,140). <br>**Outstanding balance → ₱860,200.00** (37,400 + 11 × 74,800). <br>No "Late fee reduced after payment recompute" entry. |

**Part 2 passes if:** after the part-payment, Month #1's Penalty is **still
₱3,740.00**, not ₱1,683.00. This is the whole point of the fix.

---

## Part 3 — Age it further: the fee still **grows**, never shrinks

*(Continue from Part 2 — do **not** reset.)*

| # | Action | Expected |
|---|---|---|
| 3.1 | **Simulate delinquency → 75.** Reopen. | **Month #1**: still **partial**, Target still **₱74,800.00**, amount paid still ₱41,140. <br>**Penalty ₱5,797.00** — grew by one more month: ₱3,740 + 5% × (₱37,400 still-owed principal + ₱3,740 running fee) = ₱3,740 + ₱2,057. <br>**Month #2**: now **overdue**, Penalty **₱3,740.00** (its own first month). <br>Aging bucket → **61-90**. <br>Headline **Outstanding balance stays ₱860,200.00** — ageing alone doesn't move the headline; the new fees show in each month's **Penalty** column. |

**Part 3 passes if:** Month #1's Penalty went **up** to ₱5,797 (not down, not
frozen), Month #1's Target is still ₱74,800, and Month #2 has its own separate
₱3,740 fee.

---

## Part 4 — Regression check: an on-time payment still removes the fee

*(Reset AN300459 first.)*

| # | Action | Expected |
|---|---|---|
| 4.1 | **Simulate delinquency → 40.** | Month #1 overdue, Penalty **₱3,740.00**. |
| 4.2 | As **Collector**, record **₱74,800.00** but set the **payment date to Month #1's due date** (or earlier) — i.e. the receipt proves it was actually paid on time. Allocate ₱74,800 to Month #1. Add → submit. | — |
| 4.3 | As **AR**, reconcile and **post**. Reopen. | **Month #1**: status **paid**, **Penalty ₱0.00** — the fee is removed entirely because the payment was on time. A reversal entry ("paid on or before due date") is logged. |

**Part 4 passes if:** the fee goes to **₱0**, proving the "stick" rule only
protects *late* payments — an on-time payment still clears the fee.

---

## Result sheet

| # | Check | OK? |
|---|---|---|
| 1 | Part 1: Month #1 pays off; Penalty still shows ₱3,740; balance −₱74,800 | ☐ |
| 2 | Part 2: after ₱41,140 part-payment, Month #1 Penalty is **still ₱3,740** (not ₱1,683) | ☐ |
| 3 | Part 2: Month #1 shows **partial**, ₱37,400 still owed on it | ☐ |
| 4 | Part 2: no "Late fee reduced after payment recompute" entry appears | ☐ |
| 5 | Part 3: at 75 days, Month #1 Penalty **grows to ₱5,797** | ☐ |
| 6 | Part 3: Month #1 Target still ₱74,800; Month #2 has its own ₱3,740 fee | ☐ |
| 7 | Part 4: an on-time-dated payment still takes the fee to **₱0** | ☐ |

If 1–7 are ticked, the fee-paid protection is working.

---

## Notes for the tester

- **Which number is authoritative:** the account's headline **Outstanding
  balance** and each month's **Penalty** column. The Account-ledger table's
  running *Balance* column may read low by the accrued-penalty amount — that's
  a separate display fix that isn't deployed yet (the penalty math itself is
  live).
- **Reset between parts:** ask the dev team to restore AN300459 to
  12 × ₱74,800 `pending`, due 2026-10-08 … 2027-09-08, balance ₱897,600,
  `active` / `current`, no payments or penalties.
