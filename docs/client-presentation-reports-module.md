# LoanStar Reports Dashboard — Presentation Script

*A plain-English, deep-dive walkthrough of the Executive Reports page, for
presenting to the CEO. This is a companion to the full system walkthrough —
use this one when the meeting is specifically about the reporting /
dashboard capabilities.*

---

## How to Use This Script

- This script assumes you're **screen-sharing or standing next to the
  screen** with the Reports page open, walking through it panel by panel,
  top to bottom, exactly as it appears on the page.
- Each section has a **purpose line** (what to tell them this part is for)
  and a **talking script** (what to say). Paraphrase freely.
- Pause after each panel and let them react — this page has a lot of
  numbers, and CEOs tend to have follow-up questions the moment they see
  something interesting.

---

## Opening — Set the Scene

**Say:**

> "I want to show you something built specifically for your seat — a
> single page where you can see the health of the entire lending business,
> without needing to ask five different teams for five different reports.
>
> Everything on this page is **live** — it's reading directly from what's
> actually happening in the system right now, not a report someone
> compiled last week. And everything is **filterable by date** — this
> month, this quarter, this year, or any custom range you choose."

---

## Part 1 — The Top-Level Snapshot

**Purpose:** Orient them with the four numbers every CEO wants first — before
going into anything detailed.

**Say:**

> "Right at the top, before anything else, are the four numbers that matter
> most at a glance:
>
> - **Pipeline applications** — how many loan applications are currently
>   moving through the process, at any stage.
> - **Active loans** — how many loans are currently out there being repaid.
> - **Portfolio outstanding** — the total amount still owed to us, across
>   every active loan combined.
> - **Posted collections** — how much we've actually collected and
>   confirmed, for the period you've selected.
>
> That last point is important — **every number on this page respects the
> date range you pick.** Right above these numbers is a filter: Month to
> date, Quarter to date, Year to date, Last 12 months, or a custom range.
> Change that filter, and every chart and number on the page updates to
> match."

**Why it matters:** *One glance tells you: how big is the business right
now, and how much came in during the period you care about.*

---

## Part 2 — Money & Collections

**Purpose:** This section answers the question every lender cares about
most: "Where is our money, and is it coming back to us?"

**Say:**

> "This section is about cash — where it's gone, and where it's coming
> back from.
>
> - **Released** — how much we lent out during this period.
> - **Total receivable** — the full amount we're owed across the entire
>   active book, whether it's already due or not yet due.
> - **Collected** — how much actually came back to us during this period.
> - **Outstanding** — what's still owed right now, as of today.
>
> Next to those, you'll see a **trend line** showing collections month by
> month — so instead of a single number, you can see whether collections
> are trending up or down over time. Beside it, a simple bar shows how our
> total receivable splits between what's already been collected and what's
> still outstanding — basically, how much of the pie we've already
> collected.
>
> Below that are three more numbers worth pausing on:
>
> - **Collection efficiency** — of everything that was due to be paid this
>   period, what percentage did we actually collect? This is one of the
>   best single numbers for judging how well collections is performing.
> - **Penalty income** — how much came from late-payment penalties. Useful
>   to track, but also a signal — if this number is climbing fast, it
>   often means more borrowers are paying late, not just that we're
>   earning more.
> - **Average days to collect** — on average, how many days before or
>   after the due date do payments actually come in?
>
> And finally, **projected inflow** — this is a forecast, not history. It
> looks at every unpaid installment on the books and tells you how much
> money we should expect in the next 30, 60, and 90 days, assuming
> borrowers pay on schedule. This is genuinely hard to fake or estimate by
> hand — it comes straight from the actual repayment schedule of every
> active loan."

**Why it matters:** *This turns "I think collections are doing okay" into
"collection efficiency is 92% this month, and we're projecting ₱2.5M coming
in over the next 90 days."*

---

## Part 3 — Risk & Portfolio Quality

**Purpose:** This section answers: "How exposed are we, and where's the
danger hiding?"

**Say:**

> "This is the risk view — how healthy is the loan book, really?
>
> - **PAR over 30** and **PAR over 90** — 'PAR' just means 'portfolio at
>   risk.' These tell you what percentage of everything we're owed is more
>   than 30 days late, and more than 90 days late. These are two of the
>   most-watched numbers in any lending business — they tell you, in one
>   percentage, how much of our money is genuinely at risk of not coming
>   back.
> - **Top 10 concentration** — what share of our entire outstanding balance
>   sits in just our 10 largest borrowers. A high number here means we're
>   more exposed if even one or two large accounts run into trouble — it's
>   a concentration-risk check.
> - **Rolled-over installments** — how many payments got pushed to a later
>   date instead of being collected on time.
>
> Below that, a chart breaks down the entire outstanding balance by how
> overdue it is — current, 1 to 30 days, 31 to 60, 61 to 90, and over 90 —
> so you can see at a glance whether risk is concentrated in the 'just a
> little late' bucket or the 'seriously overdue' bucket.
>
> Next to it, our **top 10 largest exposures by name** — so if you ever
> want to know exactly which accounts represent our biggest risk, they're
> right there, and you can click through to any one of them.
>
> Then a breakdown of the portfolio by **segment** — seafarer versus SME —
> and a view of **vintage**, which shows how loans released in different
> months are currently performing, so you can spot whether a particular
> batch of loans is aging worse than others.
>
> Finally, **remedial recovery rate** — of the money owed at the moment an
> account was handed to our recovery team, how much have we gotten back
> since. This tells you whether our recovery process actually works."

**Why it matters:** *This is the section that answers "are we going to get
our money back" — before it becomes a bigger problem.*

---

## Part 4 — Origination Funnel & Speed

**Purpose:** This section answers: "How well is the front end of the
business working — and where do we lose people or waste time?"

**Say:**

> "This section is about growth and speed — how efficiently new loans move
> from a lead, all the way to becoming an active, funded loan.
>
> - **Lead conversion** — of the people who inquired during this period,
>   what percentage actually ended up with a released loan?
> - **Approval rate** — of the applications our committee has decided on,
>   what share got approved versus denied?
> - **Average time to decision** — once a file reaches our committee, how
>   many days on average before they get an answer?
> - **SLA breaches** — a count of how many times a file took longer than
>   our own target turnaround at some stage. Think of this as an early
>   warning that a particular stage is becoming a bottleneck.
> - **Average loan amount** and **average term** — the typical size and
>   length of the loans we're releasing.
>
> Right below that is a table I want to highlight specifically — **stuck
> files**. This lists every application, right now, that has been sitting
> longer than it should at its current stage — with the borrower's name and
> exactly how many days over target it is. This is the single most
> actionable list on the whole page — it's not a statistic, it's a to-do
> list. Anyone reviewing this can immediately go chase down exactly which
> files need attention today.
>
> Below that, the **funnel** — literally showing, stage by stage, from
> leads all the way to active loans, how many applications are at each
> point, and what percentage drops off between each stage. This tells you
> exactly where in the process we're losing the most applicants.
>
> Next to it, **turnaround time versus target** for every stage in the
> process — so you can see exactly which stage, if any, is consistently
> running slower than it should.
>
> And finally, the reasons behind **denials and cancellations**, and a
> quick view of our **mix** between seafarer and SME applications."

**Why it matters:** *This tells you not just "how many loans did we make,"
but "where exactly are we losing time or losing applicants" — which is
where operational fixes actually pay off.*

---

## Part 5 — Staff Productivity

**Purpose:** This section answers: "Is the team performing, and where might
we need more hands or more coaching?"

**Say:**

> "This last data section is about the people running the operation.
>
> The **collector scorecard** shows, per collector: how many accounts
> they're handling, how much they've collected, how many of their
> collection reports were submitted versus successfully reconciled by
> accounting, what percentage got rejected for errors, and how long it
> typically takes from submission to being fully reconciled. This is a
> fair, numbers-based way to see who's performing well and who might need
> support.
>
> The **committee participation** table shows how many votes each committee
> member has cast, and how quickly they typically respond once a file
> reaches them — useful if decisions are taking longer than they should.
>
> And the **proof-verification backlog** shows how many borrower payment
> submissions are still waiting to be checked, broken down by how long
> they've been waiting — so nothing sits unverified for too long without
> anyone noticing."

**Why it matters:** *This replaces "I think the team is doing fine" with an
actual, fair, numbers-based view of performance — useful for coaching,
recognition, and staffing decisions alike.*

---

## Part 6 — Getting Data Out

**Purpose:** Show that this isn't a locked, view-only page — the data is
theirs to take and use.

**Say:**

> "Every one of these sections has an **Export CSV** button, so any of this
> can be pulled straight into a spreadsheet for further analysis or
> board packs. And at the top of the page, there's a **Print / Export PDF**
> button that turns the entire dashboard into a clean, print-ready
> document — no sidebar, no navigation clutter, just the report itself."

**Why it matters:** *Nothing here is trapped on-screen — it's ready to go
into a board meeting or an email in seconds.*

---

## Part 7 — What's Coming Next: The AI Assistant

**Purpose:** Set expectations for where this is heading, and leave them with
something to look forward to.

**Say:**

> "One last thing — you'll notice a button labeled 'Assistant' near the top
> of the page. Clicking it opens a panel on the right, and right now it's a
> placeholder — it's not connected to anything yet, and it can't answer
> questions today.
>
> It's there because it shows you where this page is headed — a future
> where anyone can simply *type a question* — like 'why did collections
> drop last month?' or 'which loan cohort is riskiest right now?' — and get
> an answer pulled directly from this same live data, instead of having to
> read every chart yourself. That's the vision. Let me walk you through
> what it'll actually take to get there."

**Why it matters:** *This shows the roadmap, not just the current state —
the dashboard they're looking at today is a foundation, not a finished
ceiling.*

### The Plan for the AI Assistant

**Purpose:** If the CEO asks "okay, when is that ready?" or "why isn't it
working yet?" — this gives you a clear, honest answer, and sets the right
expectation: the foundation has to be finished first, before the AI itself
gets built.

**Say:**

> "I want to be straightforward with you about where this actually stands,
> because I'd rather set the right expectation now than overpromise.
>
> **The foundation for this is not finished yet — and that has to happen
> first, before we build the AI assistant itself.** Think of it like
> construction: you don't put up the walls before the ground is properly
> prepared. Right now, we've laid one important piece of that groundwork —
> every number on this dashboard already has a clear, written definition
> of what it means and how it's calculated. But that's only one piece.
>
> Before we can safely connect an AI on top of this, a few more
> foundational things still need to be in place:
>
> - **Making sure the data it would learn from is clean and trustworthy
>   across the board** — not just on this one page, but wherever the AI
>   would eventually need to look.
> - **Deciding, carefully, what the AI is allowed to see and say** —
>   especially since this involves financial and borrower information. We
>   want firm guardrails in place before it ever answers a real question,
>   not after.
> - **Testing it thoroughly for accuracy** before anyone relies on it —
>   so the first time you or your team use it, it already works
>   correctly, instead of us fixing mistakes in front of you.
>
> Once that foundation is properly in place, building the actual assistant
> becomes much faster and much safer. That's the honest order of
> operations: **foundation first, then the AI feature on top of it** — not
> the other way around.
>
> So today, what you're seeing is the placeholder and the first building
> block. The AI itself is the next project, and we're being deliberate
> about it precisely because it's going to be handling real financial
> data — yours."

**Why it matters:** *This is an honest, credible answer instead of an
overpromise — and it actually reflects well on us: it shows we won't bolt
AI onto real financial data carelessly.*

---

## Closing — Tie It Together

**Say:**

> "So to sum up — this one page answers four questions you'd otherwise have
> to chase down separately: is our money coming back to us, how much risk
> are we carrying, how fast and efficiently are we bringing in new loans,
> and is the team performing well. All of it live, all of it filterable by
> date, and all of it exportable whenever you need it in a document.
>
> Happy to filter this to any specific period you're curious about right
> now, or drill into any number you'd like to see more detail on."

---

## Anticipated Questions (Presenter Notes)

*Keep this section for yourself — don't read it aloud unless asked.*

- **"Can I see just my collectors, or just seafarer loans?"** — Right now
  the dashboard shows the whole business. Filtering by team or loan type is
  a natural next enhancement, not yet built.
- **"How current is this data?"** — It's live — every time you open the
  page or change the date filter, it's reading the current state of the
  system, not a cached or scheduled report.
- **"Why is [some number] so high/low?"** — Use this as a natural segue:
  "That's actually a great example of the kind of question the assistant
  panel will be able to answer directly once it's active."
- **"Can other people see this too, or is it just for me?"** — Access is
  role-based — right now it's available to you, Accounting, and the
  Committee. It's not open to every team by default.

---

## Closing Line

**Say:**

> "That's the Reports dashboard — built so you never have to wait for a
> report to know how the business is doing. Want me to filter this to a
> specific period, or dive deeper into any one section?"
