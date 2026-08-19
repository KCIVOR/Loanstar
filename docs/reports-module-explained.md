# The Reports Module — What It Does, In Plain English

*A complete, non-technical guide to every part of the Reports section of
LoanStar. Written to be read by management, not by developers. No coding
knowledge needed.*

---

## The One-Paragraph Summary

Reports is a single place where you can see the health of the whole lending
business without asking five teams for five different spreadsheets. It reads
live from the system — there is no overnight batch, no report someone
compiles by hand. It is organised into six tabs, each answering a different
question: *how are we doing overall*, *who owes us money*, *who is late*,
*did we collect*, *what is stuck in the pipeline*, and *what should we do
about it*. Two of those tabs are assisted by AI, which can read the numbers
and explain them, but is deliberately prevented from inventing any.

---

## Table of Contents

1. [The date filter — read this first](#1-the-date-filter--read-this-first)
2. [Tab 1: Snapshot](#2-tab-1-snapshot--the-whole-business-on-one-page)
3. [Tab 2: Accounts](#3-tab-2-accounts--who-owes-us-what)
4. [Tab 3: Past due](#4-tab-3-past-due--who-is-late)
5. [Tab 4: Collections](#5-tab-4-collections--did-we-collect-what-was-due)
6. [Tab 5: Pipeline](#6-tab-5-pipeline--where-new-loans-get-stuck)
7. [Tab 6: Insights](#7-tab-6-insights--the-ai-written-executive-brief)
8. [LoanBot — the AI assistant](#8-loanbot--the-ai-assistant)
9. [Filtering by business line and collateral](#9-filtering-by-business-line-and-collateral)
10. [Getting the data out](#10-getting-the-data-out-csv-and-pdf)
11. [Who can see what](#11-who-can-see-what)
12. [Glossary of every number](#12-glossary-of-every-number)
13. [Things worth knowing](#13-things-worth-knowing-honest-notes)
14. [Questions you might be asked](#14-questions-you-might-be-asked)

---

## 1. The Date Filter — Read This First

At the top of every Reports tab there is one control labelled **Period**. It
sets the date range that the whole page reports on.

| Preset | What it means |
|---|---|
| **Month to date** | 1st of this month up to today *(this is the default)* |
| **Quarter to date** | Start of this quarter up to today |
| **Year to date** | 1 January up to today |
| **Last 12 months** | A rolling one-year window |
| **Custom** | Any two dates you type in |

Change this, and the numbers on the page change with it. The chosen range
stays with you as you move between tabs, so you do not have to re-pick it.

**One important distinction.** Some numbers are *period* numbers and some are
*right now* numbers, and it matters which is which:

- **Period numbers** answer "what happened between these two dates" — money
  collected, loans released, approvals made.
- **Right now numbers** answer "what is true at this moment" — how much is
  still owed, who is currently late, what is currently stuck.

You cannot ask "how much was outstanding last March" — the system reports
what is owed *today*. That is normal for this kind of report, but it is worth
knowing before someone asks.

Because of that, the **Accounts** and **Past due** tabs are *always* a
live picture of today. They show the date range in the header for reference,
but they do not filter by it.

---

## 2. Tab 1: Snapshot — The Whole Business On One Page

**Route:** the main Reports page
**Title on screen:** *Portfolio at a glance*

This is the executive view. It is long, and it is meant to be scrolled
top-to-bottom. It is split into four themed sections.

### The four headline numbers

Before anything else, four tiles:

- **Pipeline applications** — how many loan applications are in progress
  right now, at any stage.
- **Active loans** — how many loans are currently out being repaid.
- **Portfolio outstanding** — the total still owed to us across every
  active loan.
- **Posted collections** — how much actually came in during your selected
  period.

Three of these are clickable — they jump straight to the detailed tab
behind the number, already filtered. So "Active loans" takes you to the
list of those loans, not just a bigger version of the same tile.

### Section A — Money & collections

The cash view. Where money went out, and whether it is coming back.

**Numbers shown:** Released, Total receivable, Collected, Outstanding,
Collection efficiency, Penalty income, Average days to collect, and
Projected inflow at 30, 60 and 90 days.

**Charts:** a month-by-month **cash-in trend**, and a simple bar showing
**collected versus outstanding** — how much of the pie we have already
collected.

The one to pay attention to is **projected inflow**. It is not a guess or an
average. It reads the actual repayment schedule of every single unpaid
installment on the books and adds up what falls due in the next 30, 60 and
90 days. It answers "what should land in the bank if everyone pays on time",
which is very hard to work out by hand.

### Section B — Risk & portfolio quality

How healthy the book actually is.

**Numbers shown:** PAR > 30, PAR > 90, Top 10 concentration, Rolled-over
installments, and Remedial recovery rate.

**Charts:** outstanding balance broken down by **how overdue it is**; the
**top 10 largest exposures** by name, each clickable; **concentration by
segment** (Seafarer / SME / Individual); and **vintage**, which shows how
loans released in different months are performing today — useful for
spotting whether one month's batch of lending was weaker than the others.

"PAR" just means *portfolio at risk*. PAR > 30 is the share of everything we
are owed that is more than 30 days late. It is the single most watched number
in lending. Note that the "1 to 30 days late" bucket is deliberately *not*
counted as at-risk — a payment a week or two late is normal and recoverable.

### Section C — Origination

How well the front of the business is working.

**Numbers shown:** Lead conversion, Approval rate, Average time to decision,
SLA breaches, Average loan amount, Average term.

A link takes you to the full **Pipeline** tab for the detail behind these.

### Section D — Staff productivity

**Collector scorecard** — per collector: accounts held, amount collected,
collection reports submitted, how many were successfully reconciled by
accounting, the rejection rate, and average cycle time.

**Committee participation** — how many votes each member cast and how quickly
they typically respond. Note this shows *participation only*. The system
never reveals how any individual voted on any particular loan.

**Proof-verification backlog** — how many borrower payment submissions are
still waiting to be checked, grouped by how long they have been waiting.

---

## 3. Tab 2: Accounts — Who Owes Us What

**Title on screen:** *Accounts*
**Description:** *Every live loan, or one row per borrower.*

This is the master list. It has a toggle at the top for two ways of looking
at the same book:

- **Loans view** — one row per loan. Columns: Account no., Borrower, Segment,
  Collateral, Status, Aging, Outstanding, Collector.
- **Borrowers view** — one row per person, with their loans grouped together.
  Columns: Name, Loans, Outstanding, Worst aging, Segment. Useful when
  someone has more than one loan and you want their total exposure.

**Filters available:** business line (All / Seafarer / SME / Individual),
collateral (All / Clean / Car refi / Real estate), how overdue (All /
Current / 1-30 / 31-60 / 61-90 / 91+), and payment status (Unpaid / Paid /
All). The list defaults to unpaid loans, since that is usually what you
want.

The table is paginated, and you can choose how many rows to show per page.
Account numbers and borrower names link straight to the full account record
for anyone with accounting access.

---

## 4. Tab 3: Past Due — Who Is Late

**Title on screen:** *Past due*
**Description:** *Accounts past current, with days late from the oldest
unpaid installment.*

A focused version of Accounts showing only late accounts, plus one extra
piece of information that matters a lot: **days late**, counted from the
oldest unpaid installment rather than the most recent one. That prevents an
account from looking only slightly late when it has actually been missing
payments for months.

**Columns:** Borrower, Account, Segment, Collateral, Aging, Days late,
Outstanding, Owner.

The **Owner** column is the practical one — it shows who is responsible for
chasing this account. For accounts that have been handed to the recovery
team it shows the remedial officer; otherwise it shows the assigned
collector.

**Filters:** how overdue (All past due / 1-30 / 31-60 / 61-90 / 91+), plus
business line and collateral.

When you arrive here by clicking the PAR > 30 tile on the Snapshot, the page
tells you what you are looking at: *"Showing PAR > 30 (31–60, 61–90, 91+)."*

---

## 5. Tab 4: Collections — Did We Collect What Was Due

**Title on screen:** *Collections*
**Description:** *Did we collect what was due this period?*

Three numbers at the top: **Collected**, **Collection efficiency**, and
**Penalty income**.

Collection efficiency is the honest scorecard for the collections team. Of
everything that fell due during this period, what share actually came in
during this period? A high number means the team is keeping up. A falling
number is an early warning, usually before it shows up in the delinquency
figures.

Below that is a **per-collector table**: Collector, Collected, Submitted,
Reconciled, Rejection rate. "Submitted" and "Reconciled" refer to daily
collection reports — the rejection rate shows how often a collector's
paperwork has to be sent back for correction, which is a quality signal
separate from how much money they bring in.

You can filter the collector table by business line.

---

## 6. Tab 5: Pipeline — Where New Loans Get Stuck

**Title on screen:** *Pipeline*
**Description:** *Origination funnel, stuck files, and turnaround.*

This is the operational tab. It answers "where are we losing time, and where
are we losing applicants".

### Stuck files

The most actionable list in the entire module. It shows every application
that is currently sitting longer than it should at its present stage — with
the applicant, the business line, the collateral type, the stage, how many
days it has been there, and what the target was.

This is not a statistic. It is a to-do list. Someone can open this table
each morning and know exactly which files need chasing today.

### Turnaround versus target

Every stage of the process, with its average time, its target, and whether
it is on target or over. These are the targets the system holds each stage
to:

| Stage | Target |
|---|---|
| Intake → Credit investigation | 2 days |
| Credit investigation → Committee | 5 days |
| Committee decision | 3 days |
| Approval → Release queue | 3 days |
| Release processing | 5 days |
| Closing → Active loan | 2 days |

### The funnel

A stage-by-stage chart from **Leads → Draft → Submitted → Documents pending
→ Credit investigation → Committee review → Approved → Release processing →
Released → Active loan**, showing how many applications reach each point and
what percentage drops off between stages. This is how you find the exact
point in the process where applicants are being lost.

### Supporting charts

**Denial reasons** and **cancellation reasons** — why files do not make it.
**Mix by segment** and **Mix by collateral** — what kind of business we are
actually writing.

---

## 7. Tab 6: Insights — The AI-Written Executive Brief

**Title on screen:** *Executive Insights*

This is the newest part of the module, and the one that needs the most
explanation.

### What it is

Instead of you reading six tabs of charts and drawing your own conclusions,
this tab reads the last several months of data and writes you a short
executive brief: what happened, what it means, and what to do about it. It
takes about thirty seconds to produce.

You click **Generate brief** the first time, and **Regenerate** if you want
a fresh one later. Briefs are saved, so opening the tab again shows the last
brief for that period rather than charging you another thirty seconds.

### What is in a brief

- A **headline** — one sentence summarising the period.
- Six **sections**: Portfolio, Collections, Delinquency, Approvals,
  Bottlenecks, and Staff. Each has a short written summary, some bullet
  points, and the actual charts and tables behind it.
- Each section carries a **verdict badge**:
  - **On track** — healthy or improving.
  - **Watch** — drifting, but nothing to do yet.
  - **Needs action** — someone needs to make a decision this week.
- A **"What to do next"** list of recommendations, each tagged High, Medium
  or Low priority, each with a short reason, and each showing which figures
  it was based on.

### The important safeguard

**The AI is not allowed to write numbers.** Not pesos, not percentages, not
counts. This is enforced in two places at once: the format it must reply in
has no fields for numbers, and anything it says that cannot be traced back
to a real figure from the database is discarded before you see it.

Every number you see on the Insights page is rendered by the system from the
actual data, sitting next to the AI's words. So the AI can tell you
*"collections slipped for a third straight month"*, but the figure beside it
comes from the database, not from the AI. If the two could disagree, they
would — so we removed the possibility.

Recommendations work the same way. If the AI proposes an action it cannot
point to a specific figure for, that recommendation is dropped automatically
before the brief reaches you.

### "What this brief cannot tell you"

Sometimes a blue box appears with this heading. It means the AI is telling
you where the data does not go far enough to support a conclusion — for
example, *"Committee decisions covers 2 of the last 6 months, starting
2026-07."*

This is deliberate and it is a good sign. It means that rather than
confidently describing a six-month trend built on two months of data, the
system says so out loud.

---

## 8. LoanBot — The AI Assistant

### Where it is

A **LoanBot** button at the top of the Snapshot tab opens a chat panel on the
right-hand side. The report reflows to sit beside it rather than hiding
behind it. You can drag the panel wider or narrower, and it remembers your
preferred width.

### What it does

You ask questions in plain English and it answers from live data. It does not
answer from memory or general knowledge — every answer requires it to
actually look something up first. It can look up:

- The overall picture for the period, and how each number moved versus the
  period before.
- Any single metric, plus its definition and how it is calculated.
- Month-by-month trends over 2 to 12 months for the portfolio, collections,
  delinquency, or approvals.
- Where work is piling up across every team.
- Per-person staff performance.
- The loan book, searched by borrower name or account number.
- Late accounts, collections by collector, and stuck pipeline files.

The panel offers starter questions if you would rather click than type:
*"Give me a plain-English briefing on the portfolio for this period"*,
*"What is collection efficiency this period?"*, *"Why did posted collections
change versus the prior period?"*, *"What is PAR greater than 30 right
now?"*, *"Which accounts are past due over 30 days?"*, *"How many active
loans are there, and what is portfolio outstanding?"*, and *"Which pipeline
files are stuck over their stage target?"*

### How answers look

Answers come back as a compact card: a one-line headline, then up to four
blocks — metric tiles, a small trend chart, a table of accounts, or a few
bullet points — then a one-line bottom line.

### The guardrails

These are worth stating plainly, because they are the reason this is safe to
put in front of real financial data:

- **It cannot invent figures.** Same mechanism as the Insights brief — the
  answer format has no fields for numbers, and every figure shown is
  rendered from a real lookup. If it cites something it did not actually
  look up, that part of the answer is removed before display.
- **Borrower names are hidden from users who are not entitled to see
  them.** If you do not have accounting access, rows come back identified by
  loan or account number instead of by name. This is enforced on the server,
  not in the browser, so it cannot be worked around.
- **It never reveals how anyone voted.** It can tell you how many votes a
  committee member cast and how quickly they respond. It cannot tell you
  what they voted on any specific loan.
- **It admits when it finds nothing.** It is instructed to say so in one
  sentence rather than soften it into a maybe.
- **It tells you when it is only showing you part of a list.** Long lists are
  capped, and it says how many rows it is not showing.

### Conversations

Chats are saved as threads, private to each user — you see only your own. The
panel has a history button to reopen an earlier conversation, a button to
start a fresh one, and the ability to delete threads.

### Turning it on

LoanBot is **off by default**. A Super Admin enables it under Admin → System
Config → LoanBot, where the API key and the AI model are also set. The same
switch controls both LoanBot and the Executive Insights brief — there is not
a separate toggle for each.

---

## 9. Filtering By Business Line And Collateral

The Accounts, Past due and Collections tabs let you narrow the view two ways.

**By business line:** All, **Seafarer**, **SME**, or **Individual**. All
three lending books are treated equally throughout Reports — an Individual
loan is not lumped in with anything else or quietly dropped.

**By collateral:** All, **Clean** (no collateral), **Car refi** (car
refinancing), or **Real estate**.

Both appear as columns as well as filters, so you can see the mix in a list
without filtering, and the Pipeline tab shows the same breakdown as charts.

---

## 10. Getting The Data Out (CSV and PDF)

Nothing here is trapped on screen.

| Tab | Export to spreadsheet | Print / PDF |
|---|---|---|
| Snapshot | Yes — money, risk, and staff sections each export separately | Yes |
| Accounts | Yes | — |
| Past due | Yes | — |
| Collections | Yes | — |
| Pipeline | Yes — funnel and stuck files | — |
| Insights | Yes — the underlying trend figures | Yes |

The Print / PDF option produces a clean document with the navigation and
sidebar stripped out — suitable for a board pack without any tidying up.

---

## 11. Who Can See What

Reports is permission-controlled, not open to everyone.

Out of the box, three roles have access: **Super Admin** (full),
**Accounting/AR** (view), and **Committee** (view). Other roles do not see
the Reports link at all. This is configurable — access can be granted to
other roles if you want it.

Two finer points on top of that:

- **Borrower names** are shown only to Super Admin and to users with
  accounting access. Everyone else sees loans identified by account number.
  This applies to LoanBot as well as to the tables.
- **Clicking through** to a full account record or an application file
  requires permission for that area too. Someone can read the report without
  being able to open every underlying file.

---

## 12. Glossary Of Every Number

Every number in the module also carries its own definition inside the
system, so nobody has to guess what it means. Here they are in plain
language.

### Money

| Number | What it means |
|---|---|
| **Released** | Total lent out during the period. |
| **Total receivable** | Everything contractually owed across the whole active book, due or not yet due. The ceiling collections could reach. |
| **Collected** | Cash actually posted to borrower accounts during the period. |
| **Outstanding** | What is still owed right now. A snapshot of today, not of the period. |
| **Collection efficiency** | Of what fell due in the period, the share collected in that same period. |
| **Penalty income** | Late-payment penalties charged during the period. Revenue, but also a delinquency warning sign. |
| **Average days to collect** | On average, how many days after the due date payments actually arrive. |
| **Projected inflow (30/60/90)** | What should come in over the next 30, 60 and 90 days, read from actual unpaid installment schedules. |

### Risk

| Number | What it means |
|---|---|
| **PAR > 30** | Share of the book more than 30 days late. The 1-30 bucket is not counted as at risk. |
| **PAR > 90** | Share of the book more than 90 days late. |
| **Top 10 concentration** | Share of everything owed that sits with our 10 largest accounts. High means exposed to a few borrowers. |
| **Remedial recovery rate** | Of the balance owed when an account was handed to recovery, how much has been collected since. Does the recovery process work. |
| **Rolled-over installments** | Payments pushed to a later date instead of collected on schedule. |

### Origination

| Number | What it means |
|---|---|
| **Lead conversion** | Of leads created in the period, the share whose loan was released in that same period. |
| **Approval rate** | Of the applications Committee has decided, the share approved rather than denied. |
| **Avg. time to decision** | Days between a file reaching Committee and getting an answer. |
| **SLA breaches** | Count of stage-to-stage handoffs that took longer than that stage's own target. |
| **Avg. loan amount** | Typical size of a released loan. |
| **Avg. term** | Typical length of a released loan, in months. |

### Where work piles up

The Bottlenecks view watches seven queues and flags one as breached when its
**oldest** waiting item passes that queue's target:

| Queue | Owner | Target |
|---|---|---|
| Credit investigation not finished | CIG | 5 days |
| Waiting to be picked up for release | Release | 3 days |
| Release file not yet released | Release | 5 days |
| Negotiation not signed | Intake | 5 days |
| File on hold | Intake | 3 days |
| Released file awaiting accounting setup | Accounting | 2 days |
| Payment proof unverified | Accounting | 3 days |

---

## 13. Things Worth Knowing (Honest Notes)

A short, straight list of the module's real boundaries — better to know these
in advance than to be surprised in a meeting.

- **Balances are always "as of today".** The module reports what is owed
  right now. It does not reconstruct what the outstanding balance was on a
  past date.
- **On the Collections tab, the three tiles at the top are period-wide.**
  The business-line filter narrows the per-collector table beneath them, not
  those three headline numbers.
- **Committee decision history is short.** That data only begins around July
  2026, so approval trends over longer windows will honestly report that
  they are based on partial history rather than pretending otherwise.
- **The AI features are optional and off by default.** If they are never
  switched on, every other part of Reports works exactly the same.
- **AI usage has a cost.** Each brief and each LoanBot question calls an
  external AI service. There is no spending cap built in today, so it is
  worth being aware of if usage grows.

---

## 14. Questions You Might Be Asked

**"How current is this?"**
Live. Every time the page is opened or the date filter changes, it reads the
current state of the system. There is no nightly batch and no cached report.

**"Can I see just SME, or just one collector?"**
Business line and collateral filters are on Accounts, Past due and
Collections. Per-collector performance is on the Collections tab and in the
Snapshot staff section.

**"Can the AI make something up?"**
Structurally, no. Both AI features are built so that the AI supplies only
words, never figures. Every number on screen is rendered by the system from
the database. Anything the AI claims that cannot be traced to a real lookup
is removed before you see it.

**"Can the AI see borrower names?"**
Only if the person asking is already allowed to see them. For everyone else
the names are stripped out before the AI ever receives the data.

**"Can other people see this?"**
Only Super Admin, Accounting and Committee by default. It is role-controlled
and can be opened up if you want.

**"What is the single most useful thing here day to day?"**
The **stuck files** table on the Pipeline tab. Everything else tells you how
the business is doing; that one tells you exactly what to go and fix this
morning.

**"If I only look at three numbers, which ones?"**
Collection efficiency (are we collecting what is due), PAR > 30 (how much of
the book is genuinely at risk), and portfolio outstanding (how big the book
is). Between them they cover income, risk, and scale.
