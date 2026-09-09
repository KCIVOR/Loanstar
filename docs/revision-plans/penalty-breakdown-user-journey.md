# Late Fee (Penalty) — Validation Journey

Follow each step, then check the **Expected** column. Numbers below are the real
figures for the recommended test loan (verified against the database). If every
row matches, the late-fee rework is working. No technical knowledge needed.

- **"Late fee"** = what some screens call a *penalty*.
- **"Monthly payment"** / **"month #N"** = one line in the borrower's payment
  schedule.
- **Fee rate by segment:** Individual / SME = **5%**, Seafarer = **15%**.

---

## 0. Test loan and starting point

| Loan | Borrower | Segment | Monthly payment | Unpaid months | Balance |
|---|---|---|---|---|---|
| **AN300459** | Luz Torres | SME → **5%** | **₱74,800.00** | 12 | **₱897,600.00** |

Sign in as **AR** → **Masterlist** → search **AN300459** → **Open**. Confirm:

| Field | Expected |
|---|---|
| Outstanding balance | **₱897,600.00** |
| Aging bucket | **current** |
| Every month's **Penalty** column | **₱0.00** |

**The tool you'll use:** on that account page, **"Simulate delinquency"** (enter
a number of days). It back-dates the whole schedule so the **oldest** unpaid
month lands exactly that many days overdue, then runs **the same nightly job the
system runs on its own**. It changes real data on this account — ask the dev
team for a reset afterwards.

> **One thing to know up front — the "roll forward".** This system has always
> carried a missed month's balance forward: once a month is **30 days** overdue,
> its balance **and its late fee** fold into the next month, and the old month is
> marked **rolled**. So as you age the loan, the unpaid pile marches down the
> schedule from #1 → #2 → #3 … and the fee on that pile keeps **compounding**.
> That is expected behaviour — the checks below account for it.

---

## Part 1 — The fee is added automatically, and it compounds every month

Do these in order on AN300459. After each **Simulate delinquency**, reopen the
account and read the **Account ledger** table.

### 1a — 40 days

| Do | Expected |
|---|---|
| **Simulate delinquency → 40**. Reopen. | • **Month #1**: status **rolled**, Penalty **₱3,740.00** (= 5% × ₱74,800). <br>• **Month #2**: **Target ₱149,600.00** with a grey note **"incl. ₱74,800.00 carried from #1"**; **Penalty ₱3,740.00** (the fee carried from #1). <br>• Aging bucket → **31-60**. |

### 1b — 70 days

| Do | Expected |
|---|---|
| **Simulate delinquency → 70**. Reopen. | • Months **#1 and #2** now both show **rolled**. <br>• **Month #3**: status **overdue**, **Target ₱224,400.00** ("incl. ₱149,600.00 carried from #2"), **Penalty ₱23,197.35**. <br>• That ₱23,197.35 is the point of the whole change: it is **month 1 + month 2 + month 3 of fee, each charged on the growing balance** — not one flat ₱3,740. <br>• Aging bucket → **61-90**. |

### 1c — 100 days

| Do | Expected |
|---|---|
| **Simulate delinquency → 100**. Reopen. | • The pile is now on **Month #4**: **Target ₱299,200.00**, **Penalty ₱56,243.08**. <br>• **Month #5 has its OWN separate fee** of **₱3,740.00** — proof that *every* overdue month is charged, not just the oldest. <br>• Aging bucket → **91+**, and the account is flagged for the **remedial** team. |
| **Simulate delinquency → 100** again (same number). | **Nothing changes.** Re-running the job the same day never double-charges. |

**Part 1 passes if:** a fee appeared by itself, it grew every month
(₱3,740 → ₱23,197.35 → ₱56,243.08 on the pile), a second month (#5) got its own
fee, the ledger showed **"incl. … carried from #N"**, and re-running changed
nothing.

---

## Part 2 — Paid on time, receipt logged late → the fee is removed automatically

Reset AN300459, then **Simulate delinquency → 40** (so month #1 has rolled into
month #2, and **#2 carries a ₱3,740.00 fee** and owes **₱149,600.00** — as in
step 1a).

| # | Do | Expected |
|---|---|---|
| 2.1 | As **Collector**, record a payment for **month #2**: **Amount ₱149,600.00**, **Payment date = on or before month #2's due date** (the borrower really paid on time; only the paperwork was late). | Payment saved / pending. |
| 2.2 | Batch it into a **DCRR**, submit. As **AR**, reconcile and **post** it. | Green "posted". |
| 2.3 | Reopen AN300459 → month #2. | Status **paid**, **Penalty ₱0.00** — the fee is gone, no "waive" button pressed. |
| 2.4 | Open the account's fee/penalty history (or ask a developer to check the `penalties` rows). | The fee is reversed with reason **"paid on or before due date"** and a matching **negative** entry cancels it. Nothing is deleted. |

**Part 2 passes if:** an on-time-dated payment removed the fee by itself.

---

## Part 3 — Paid late and only partly → the fee is recomputed on what's left

Reset AN300459, then **Simulate delinquency → 40** again (month #2 owes
**₱149,600.00** + **₱3,740.00** fee).

| # | Do | Expected |
|---|---|---|
| 3.1 | As **Collector**, record a **partial** payment for month #2 — **₱100,000.00** — **dated today** (i.e. late). Batch into a DCRR; as **AR**, post it. | — |
| 3.2 | Reopen AN300459 → month #2. | Status **partial**. Still unpaid = 149,600 − 100,000 = **₱49,600.00**. Its fee is **recomputed** to **≈ 5% × ₱49,600 = ₱2,480.00** — not left at ₱3,740, not wiped to ₱0. |
| 3.3 | **Simulate delinquency → 70**. | The ₱49,600 remainder now carries a **second** month of fee, compounding — the leftover ages like any unpaid balance. |

**Part 3 passes if:** the partial late payment left a **smaller, recomputed** fee
on the remaining balance.

---

## Part 4 — Split a payment into "late fee" vs "loan", and see it in the report

Reset AN300459, then **Simulate delinquency → 40** (month #2 owes **₱149,600.00**
+ **₱3,740.00** fee = **₱153,340.00** total).

| # | Do | Expected |
|---|---|---|
| 4.1 | As **Collector**, record a payment of **₱153,340.00** for month #2, **dated today** (late). Open the **Allocate** step for it in the DCRR. | The allocate window opens, payment mapped to month #2. |
| 4.2 | In the allocate window find the **"Late fee paid"** section. Tick **month #2** and type **3740** in its **₱ Fee paid** box. Add to the DCRR. | "Late fee paid total: **₱3,740.00**". |
| 4.3 | As **AR**, reconcile and **post** the DCRR. | Month #2 → **paid**. |
| 4.4 | Repeat 4.1–4.3 on **month #3** next time, but type an absurd **99999** in the Fee-paid box (only a few thousand pesos of fee is actually owed). | It still posts, and the recorded fee is **capped at the fee actually owed** — a typo cannot inflate fee income or wrongly close the row. |
| 4.5 | Sign in as a **reports** user → **Reports → Collections**, date range = **today**. Read **"Penalty income"**. | It shows the **fee money actually collected today** — ₱3,740.00 from step 4.2 (plus the capped amount from 4.4) — **separate** from the loan-principal portion. |
| 4.6 | Do 4.1–4.3 once more with an **on-time-dated** payment that just covers the principal (no fee). Re-check "Penalty income". | It does **not** move — an on-time payment carries no fee. |

**Part 4 passes if:** you could type the fee portion by hand, a too-large typo
was capped, and **"Penalty income"** counted only fee money actually received.

---

## Part 5 — Ledger breakdown & Report Total

| # | Do | Expected |
|---|---|---|
| 5.1 | On the loan from **Part 1** (aged to 100 days), open the **Account ledger** and find the month the pile rolled into (month #4 at that point). | Under its **Target** amount: **"incl. ₱224,400.00 carried from #3"** — the enlarged row is explained, not an unexplained lump. |
| 5.2 | *(If you have a settled loan that used a **Collector discount** or an **Offset** payoff.)* Open its ledger; read the **Report Total** row's **Balance**. | **₱0.00** — not the leftover discount amount. (Before the fix it wrongly showed the discount amount.) |

---

## Result sheet

| # | Check | OK? |
|---|---|---|
| 1 | A fee appeared automatically once a month was overdue | ☐ |
| 2 | The fee **grew every month** (₱3,740 → ₱23,197.35 → ₱56,243.08), not one flat charge | ☐ |
| 3 | A second overdue month (#5) carried **its own** fee | ☐ |
| 4 | Re-running the nightly job the same day changed nothing | ☐ |
| 5 | The ledger showed **"incl. ₱… carried from #N"** on a rolled-into row | ☐ |
| 6 | At 91+ days the account was handed to the **remedial** team | ☐ |
| 7 | An **on-time-dated** payment removed the fee automatically, with a reversal trail | ☐ |
| 8 | A **partial late** payment left a **smaller, recomputed** fee (≈ ₱2,480) on the remainder | ☐ |
| 9 | The Allocate window let the collector **type** the fee portion | ☐ |
| 10 | A too-large typed fee was **capped** at what was owed | ☐ |
| 11 | **"Penalty income"** on Reports → Collections showed only fee money collected | ☐ |
| 12 | *(if tested)* A settled discounted loan's **Report Total** read **₱0.00** | ☐ |

If 1–11 are ticked, everything shipped is working.

> **Reset:** the accounts you age/pay on will not be in their original state
> afterwards. Ask the dev team to restore AN300459 (one-line restore) or use
> throwaway loans.
