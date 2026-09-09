# Validation Journey — "Each missed month is its own line now"

Plain-language walkthrough to confirm the **30-day roll-forward has been removed**.
Do each **Action**, then check the **Expected** column. Every number below was
checked against the live database for test loan **AN300459**.

**What changed:** before, once a monthly payment was 30 days late the system
**merged** it into the next month — the old line was marked *rolled*, and the
next line's amount doubled. Now **nothing merges**. Each missed month keeps its
own amount; only its **Penalty** grows, month by month, on its own.

---

## 0. Test loan and starting point

| Loan | Borrower | Segment | Monthly payment | Unpaid months |
|---|---|---|---|---|
| **AN300459** | Luz Torres | SME → **5%** fee rate | **₱74,800.00** | 12 (all `pending`) |

Sign in as **AR** → **Masterlist** → open **AN300459**. Confirm:

| Field | Expected |
|---|---|
| Aging bucket | **current** |
| Every month's **Penalty** column | **₱0.00** |
| Every month's **Target** | **₱74,800.00** |

**Tool:** on that account page, **"Simulate delinquency"** (enter a number of
days). It back-dates the schedule so the oldest unpaid month lands that many
days overdue, then runs the real nightly job. It changes real data on this
account — ping the dev team for a reset when done.

> The **headline "Outstanding balance"** (₱897,600.00) does **not** move from
> ageing alone — it updates when a payment is posted. The late fees show in each
> month's **Penalty** column, and in the ledger row for that month.

---

## Part 1 — One month late: only the oldest month gets a fee, nothing merges

| # | Action | Expected |
|---|---|---|
| 1.1 | **Simulate delinquency → 40**. Reopen the account, open the **Account ledger**. | **Month #1**: status **overdue**, Target **₱74,800.00**, **Penalty ₱3,740.00** (= 5% × 74,800). <br>**Months #2–#12**: unchanged — status **pending**, Target **₱74,800.00**, Penalty **₱0.00**. <br>Aging bucket → **31-60**. <br>**No row anywhere says "rolled".** No "incl. ₱… carried from #…" note. |

**Part 1 passes if:** only month #1 changed, it kept its ₱74,800 Target, and
nothing was merged or marked *rolled*.

---

## Part 2 — Two months late: each overdue month has its own fee, on its own clock

| # | Action | Expected |
|---|---|---|
| 2.1 | **Simulate delinquency → 75**. Reopen. | **Month #1**: overdue, Target **₱74,800.00**, **Penalty ₱7,667.00** — that's **two** months of fee compounding on itself (₱3,740, then 5% of ₱78,540 = ₱3,927). <br>**Month #2**: now overdue too — Target **₱74,800.00**, **Penalty ₱3,740.00** (its first month). <br>Months #3–#12: pending, ₱0. <br>Aging bucket → **61-90**. <br>Still **no "rolled" rows**, and **month #1's Target is still ₱74,800** — it did **not** get folded into month #2. |

**Part 2 passes if:** #1 and #2 are **both** overdue with **separate** fees
(₱7,667 and ₱3,740), each Target is still ₱74,800, and nothing merged.

---

## Part 3 — Three months late: fees keep compounding, still no merge, then remedial

| # | Action | Expected |
|---|---|---|
| 3.1 | **Simulate delinquency → 100**. Reopen. | **Month #1**: Penalty **₱11,790.35** (3 months compounded: 3,740 + 3,927 + 4,123.35). <br>**Month #2**: Penalty **₱7,667.00** (2 months). <br>**Month #3**: Penalty **₱3,740.00** (1 month). <br>Months #4–#12: pending, ₱0. <br>**All three Targets are still ₱74,800.00.** No "rolled" rows. <br>Aging bucket → **91+**, and the account is flagged for the **remedial** team. |
| 3.2 | **Simulate delinquency → 100** again (same number). | **Nothing changes** — same three penalties, same statuses. Re-running the job never double-charges. |

**Part 3 passes if:** the fee on each month grew by one more round, no month's
Target changed, nothing rolled, and re-running changed nothing.

---

## Part 4 — You can pay any one of the overdue months by itself

(Leave the loan at the "100 days" state from Part 3.)

| # | Action | Expected |
|---|---|---|
| 4.1 | As **Collector**, record a payment for **month #2 only** — Amount **₱82,467.00** (= ₱74,800 + its ₱7,667 fee), dated today. Batch it into a DCRR; as **AR**, reconcile and **post** it. | **Month #2**: status **paid**. <br>**Month #1**: **unchanged** — still overdue, Target ₱74,800, Penalty ₱11,790.35. <br>**Month #3**: **unchanged** — still overdue, Target ₱74,800, Penalty ₱3,740.00. <br>Outstanding balance drops by ₱82,467.00. |

**Part 4 passes if:** paying month #2 left months #1 and #3 exactly as they were.
Under the old system month #1 would have been *rolled* into #2 and you could not
have paid #2 without touching #1's balance.

---

## Result sheet

| # | Check | OK? |
|---|---|---|
| 1 | At 40 days, only month #1 has a fee (₱3,740); every Target still ₱74,800 | ☐ |
| 2 | No row is ever marked **"rolled"**, at any stage | ☐ |
| 3 | At 75 days, months #1 **and** #2 each have their **own** fee (₱7,667 / ₱3,740) | ☐ |
| 4 | At 100 days, three separate fees (₱11,790.35 / ₱7,667 / ₱3,740); all Targets ₱74,800 | ☐ |
| 5 | Re-running "100" changes nothing | ☐ |
| 6 | The 91+ bucket still hands the account to remedial | ☐ |
| 7 | You can pay month #2 alone and months #1 / #3 are untouched | ☐ |
| 8 | No "incl. ₱… carried from #…" note appears on any row | ☐ |

If 1–8 are ticked, the roll-forward removal is working.

> **Reset:** ask the dev team to restore AN300459 afterwards (12 × ₱74,800,
> all `pending`, due 2026-10-08 … 2027-09-08, balance ₱897,600.00). All of the
> plan's own verification runs used a rolled-back transaction, so the loan is
> currently still in that clean state.
