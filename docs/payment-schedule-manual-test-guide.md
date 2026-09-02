# Payment Schedule — Manual QA Test Guide (2026-08-30)

Every number below was traced directly from the real engine code (`sme.ts`,
`sf.ts`, `schedule.ts`, `invoice.ts`, `daily.ts`) — not assumed, not carried
over from an older doc. This **supersedes**
`payment-frequency-manual-test-guide.md`, which predates the payment-schedule
unification (Individual now has full access to all 8 schedules, the
Computation screen shows an editable dropdown in both CSA and Committee
mode, and — most importantly — its Quarterly/Two-Monthly description was
wrong; see §5 below for the corrected behavior).

**One real bug found while writing this guide** — flagged in §8, not fixed
yet. Read that section before you test Invoice Financing so the mismatch
doesn't look like something you broke.

---

## 0. The one test recipe used throughout

Unless a section says otherwise, use exactly this at every Computation
screen so the numbers below match what you see:

| Field | Value |
|---|---|
| Input mode | `Principal` |
| Amount (Loan Desired) | `100000` |
| Terms | `6` |
| Addon months | `0` |
| Interest rate | `3` (%/month) |
| Processing fee rate | `10` (%) |
| With DS & Notary | Yes (default) |

Two engines are in play, and which one runs is decided **only by
Collateral**, never by the schedule you pick:

| Collateral | Engine | Principal | Total Interest | Total Loan | "Monthly" figure |
|---|---|---|---|---|---|
| Clean (none) | Gross-up (`sme.ts`) | ₱100,000 + 10% PF = **₱110,000** | 110,000 × 3% × 6 = **₱19,800** | **₱129,800** | 129,800 / 6 = **₱21,633.33** |
| Car Refinancing / Real Estate | Net method (`sf.ts`) | **₱100,000** (no gross-up) | 100,000 × 3% × 6 = **₱18,000** | **₱118,000** | 118,000 / 6 = **₱19,666.67** |

Since collateral now **locks the schedule to Regular (Monthly) only** (the
fix from earlier today), every collateral scenario below is just the single
Monthly case — there's nothing else to test per-schedule for a collateral
loan.

For a **Clean** loan, Principal/Total Interest/Total Loan (₱110,000 /
₱19,800 / ₱129,800) are **the same number regardless of which of the 8
schedules you pick** — Regular, MPL, Salary, Bi-Monthly, Quarterly, and
Two-Monthly all reuse this exact total, verified straight from
`schedule.ts`. Only **Invoice** and **Daily** compute a genuinely different
total (see §7/§8). This is the single most important thing to know before
testing: if you see a different Principal/Total Interest for Regular vs.
Salary vs. Quarterly on a Clean loan, that's a regression — they must match.

---

## 1. Segment × Collateral × Schedule — what's selectable

| Segment | Collateral options | Schedule dropdown |
|---|---|---|
| Seafarer | None (never asked) | Not shown — always `monthly`, 22nd-cutoff due-date rule (unchanged, unrelated to this work) |
| SME | Clean / Car Refinancing / Real Estate | Full 8-option list if Clean; **locked to Regular (Monthly), other options hidden** if Car Refinancing/Real Estate |
| Individual | Clean / Car Refinancing / Real Estate | Same as SME — this is the new part. Individual used to only get MPL/Salary; now gets the same full 8-option list Clean access as SME |

**Quick check before anything else**: create one SME and one Individual
application, both Clean. Both should show the identical 8-option dropdown:
Regular, MPL, Salary, Invoice Financing (Weekly), Bi-monthly, Quarterly,
Two-monthly, Daily. Then switch either one's collateral to Car Refinancing
or Real Estate and confirm the dropdown collapses to Regular (Monthly)
only, greyed out, with the "(locked to Regular Monthly...)" note.

---

## 2. Regular (Monthly) — the baseline

**Setup**: Clean, schedule = `Regular (Monthly)` (the default).

**Expected after Compute**: Principal ₱110,000, Total Interest ₱19,800,
Total Loan ₱129,800, Monthly Amortization ₱21,633.33.

**Schedule** (check after Endorse → Release, in AR → Masterlist → this
account → Amortization Schedule): **6 equal installments** of ₱21,633.33
(the very last one may differ by a few centavos — it absorbs whatever
rounding the other 5 left over, so the 6 add up to exactly ₱129,800). Due
dates: first = release date advanced one month **on the same day-of-month
as the release date** (no 22nd-cutoff — that rule is Seafarer-only now),
then +1 month each time after that, same day-of-month throughout.

Example: released Aug 20 → due dates Sep 20, Oct 20, Nov 20, Dec 20, Jan 20, Feb 20.

---

## 3. MPL — must be byte-identical to Regular

**Setup**: same as §2, just pick `MPL (Multi-Purpose Loan)` instead of Regular.

**Expected**: every single number and every due date must come out
**exactly the same** as §2 — ₱110,000 / ₱19,800 / ₱129,800 / ₱21,633.33,
same 6 monthly dates. This is a deliberate design decision (MPL and Regular
compute identically — the label is the only difference), not a bug if you
can't tell them apart. If any number differs, that's the regression to
report.

---

## 4. Salary — semi-monthly

**Setup**: Clean, schedule = `Salary (semi-monthly)`.

**Expected after Compute**: same totals as §2 — Principal ₱110,000, Total
Interest ₱19,800, Total Loan ₱129,800 (**not recomputed** — Salary only
changes the payment cadence, not the cost of the loan).

**Schedule**: **12 installments** (6 months × 2), each ₱10,816.67
(halfUp(21,633.33 ÷ 2)), last one rounding-adjusted so all 12 total exactly
₱129,800. First due date rule (`computeSalaryFirstPaymentDate`): if the
release day is the 15th or earlier, the first due date is **that same
month's 15th**; if the release day is after the 15th, it's **that same
month's last day**. Every date after that alternates 15th → end-of-month →
15th → end-of-month (`advanceSemiMonthly`) — not a fixed 15-day interval,
that's Bi-Monthly (§5) instead.

Example: released **Aug 20** (after the 15th) → due dates: **Aug 31**, Sep
15, Sep 30, Oct 15, Oct 31, Nov 15, Nov 30, Dec 15, Dec 31, Jan 15, Jan 31,
Feb 15 (12 total).

---

## 5. Bi-Monthly — every 15 days from release (NOT the same as Salary's dates)

**Setup**: Clean, schedule = `Bi-monthly (every 15 days)`.

**Expected after Compute**: same totals as §2 — ₱110,000 / ₱19,800 / ₱129,800.

**Schedule**: **12 installments**, each ₱10,816.67 (same split as Salary,
coincidentally — both halve the same monthly figure) — but the **dates are
different from Salary**: Bi-Monthly counts every 15 days straight from the
**release date itself** (release+15, +30, +45, +60...), not the calendar
15th/end-of-month. This is the one pair of schedules that's easy to
confuse — verify the dates, not just the amounts.

Example: released Sep 1 → due dates Sep 16, Oct 1, Oct 16, Oct 31, Nov 15,
Nov 30, Dec 15, Dec 30, Jan 14, Jan 29, Feb 13, Feb 28.

---

## 6. Quarterly & Two-Monthly — dual-line, interest AND principal split evenly every period

**This corrects the old test guide**, which wrongly described these as
"interest-only until a final lump payment." The real code
(`generateInterestPrincipalSplitSchedule` in `schedule.ts`, verified against
its own test suite) splits **both** interest and principal evenly across
every period — every due date gets two rows (an `interest` line and a
`principal` line), not just the last one.

### 6a. Quarterly (terms must be divisible by 3 — 6 works)

**Setup**: Clean, schedule = `Quarterly`, Terms = `6` (2 quarters).

**Expected after Compute**: same totals as §2 — ₱110,000 / ₱19,800 / ₱129,800.

**Schedule** (2 due dates, 3 months apart):
| Due date | Line | Amount |
|---|---|---|
| Release + 3mo | interest | ₱9,900 |
| Release + 3mo | principal | ₱55,000 |
| Release + 6mo | interest | ₱9,900 |
| Release + 6mo | principal | ₱55,000 |

Note the due-date **day-of-month is whatever "Due Day" was set to (default
10)** — not the release date's own day, unlike Regular/MPL/Salary/Bi-Monthly
above. Total of all 4 rows = ₱129,800. ✓

**Boundary check**: Terms = `7` at Compute time should be rejected —
"Quarterly terms must be divisible by 3 (e.g. 6, 9, or 12 months)."

### 6b. Two-Monthly (terms must be divisible by 2 — 6 works, giving 3 periods)

**Setup**: same as 6a but schedule = `Two-monthly`.

**Expected after Compute**: same totals — ₱110,000 / ₱19,800 / ₱129,800.

**Schedule** (3 due dates, 2 months apart):
| Due date | Line | Amount |
|---|---|---|
| Release + 2mo | interest | ₱6,600 |
| Release + 2mo | principal | ₱36,666.67 |
| Release + 4mo | interest | ₱6,600 |
| Release + 4mo | principal | ₱36,666.67 |
| Release + 6mo | interest | ₱6,600 |
| Release + 6mo | principal | ₱36,666.66 (last one absorbs the 1-centavo rounding remainder) |

Total of all 6 rows = ₱129,800. ✓

**Boundary check**: Terms = `5` at Compute time should be rejected —
"Two-monthly terms must be divisible by 2 (e.g. 4, 6, 8, 10, or 12 months)."

---

## 7. Daily Interest — single manually-dated payment

**Setup**: Clean, schedule = `Daily`. A **Payment date** field appears —
required.

Try clicking Compute with no payment date first — **expected**: blocked,
"Daily Interest loans require a manual payment date."

**Important**: Daily's interest is based on the **already-grossed-up
principal** (₱110,000, same as every other Clean schedule) — not the raw
₱100,000 you typed. Formula: `dailyRate = monthlyRate ÷ 30`,
`interest = principal × dailyRate × days`.

**Example A**: Release date `2026-08-20`, Payment date `2026-08-25` (5 days).
| Field | Expected |
|---|---|
| Total Interest | 110,000 × 0.001 × 5 = **₱550.00** |
| Total Due | **₱110,550.00** |
| First payment date | `2026-08-25` (exactly what you typed) |

**Example B**: same setup, Payment date `2026-08-27` (7 days).
| Field | Expected |
|---|---|
| Total Interest | 110,000 × 0.001 × 7 = **₱770.00** |
| Total Due | **₱110,770.00** |

**After release**: AR masterlist should show **exactly 1 installment**,
matching the Total Due above — not a recurring schedule.

---

## 8. ⚠️ Invoice Financing (Weekly) — known pre-existing mismatch, not something you broke

This is the one schedule where **what you see right after clicking Compute
does not match what you'll see later in the AR masterlist after release**.
This is a real, pre-existing gap in how Invoice is wired (confirmed by
reading `persistComputation` in `computation.ts` and `initializeArAccount`
in `masterlist.ts`) — not a regression from today's collateral-lock work,
and not something you're doing wrong when you see two different totals.

**Setup**: Clean, schedule = `Invoice Financing (Weekly)`, Terms = `3`
(Invoice is capped at 1–3 months).

### 8a. What you'll see immediately after clicking Compute (the CSA screen)

`persistComputation` doesn't special-case "weekly" the way it does "daily"
— it just stores the generic gross-up numbers, same as Regular:

| Field | What's shown |
|---|---|
| Total Interest | ₱19,800 (the flat gross-up formula — **not** Invoice's real tiered math) |
| Total Loan | ₱129,800 |
| "Monthly Amortization" | ₱21,633.33 (meaningless for Invoice, but that's what's stored) |

**Boundary check** (this part *is* correctly wired): Terms = `4` should be
rejected — "Invoice financing terms must be 1, 2, or 3 months."

### 8b. What you'll actually see after Endorse → Release, in AR → Masterlist

At release, `initializeArAccount` calls the *real* Invoice formula
(`computeInvoiceLoan`) using the loan's stored principal — **₱110,000**, the
same grossed-up figure, even though Invoice's own spec says "no PF bundle"
(a second, smaller inconsistency worth knowing about: Invoice conceptually
shouldn't be marked up by the PF bundle at all, but the code routes it
through the same gross-up engine as every other Clean schedule before
handing the result to the weekly calculator).

Weekly rate schedule: 1% for the 1st month's 4 weeks, 2% for the 2nd
month's, 2.5% for the 3rd month's, all as a percentage of ₱110,000:

| Weeks | Rate | Per-week amount | Subtotal |
|---|---|---|---|
| 1–4 | 1% | ₱1,100.00 | ₱4,400.00 |
| 5–8 | 2% | ₱2,200.00 | ₱8,800.00 |
| 9–12 | 2.5% | ₱2,750.00 | ₱11,000.00 |

| Field | Expected |
|---|---|
| **Real Total Interest** | **₱24,200.00** (22% of ₱110,000 — not the ₱19,800 shown at Compute time) |
| Installment count | **13** — 12 weekly interest rows + 1 final principal row |
| Week 13 (principal) | **₱110,000.00**, due 1 week after the last interest week |

**What to actually verify**: that the AR masterlist's 13-row schedule
matches the §8b table (real math), and separately note for the record that
the CSA Computation screen's ₱19,800/₱129,800 (§8a) does **not** match it —
that's the gap. If you want this closed (either make the Computation screen
show the real ₱24,200 up front, or strip the PF gross-up out of Invoice's
principal entirely per its own "no PF bundle" spec), that's a separate,
scoped fix — flag it back to me and I'll plan it properly rather than
patching it inline here.

---

## 9. Collateral lock — the fix from today

**Setup**: SME or Individual, Collateral = `Car Refinancing`.

**Expected**: schedule dropdown shows only `Regular (Monthly)`, greyed out,
labeled "(locked to Regular Monthly — Auto/Real Estate loans don't use
other schedules)". Switch Collateral back to `Clean` → all 8 options
reappear immediately, previous selection resets to Monthly.

**Compute numbers**: Principal ₱100,000 (net method, no gross-up), Total
Interest ₱18,000, Total Loan ₱118,000, Monthly Amortization ₱19,666.67,
Security Fee ₱0.00 — 6 equal monthly installments, same day-of-month rule
as §2.

Repeat with `Real Estate` — same numbers (collateral type only changes
which documents get required, not the math).

**Try to break it** (should be blocked, not silently accepted):
1. On the intake form, pick Car Refinancing, then somehow submit a non-monthly schedule (shouldn't be possible via the UI — the dropdown removes the other options — but if you're testing the API directly, this should come back with "Auto and Real Estate loans can only use the Regular (Monthly) schedule").
2. On an existing Clean application already computed with `Quarterly`, go to Committee's override screen and change Collateral... actually Collateral can't be changed post-intake (confirmed unrelated to this work — it's a locked fact once the application exists), so this scenario only applies at initial intake.

---

## 10. Committee override — schedule stays editable, still respects the lock

**Setup**: any Clean SME or Individual application sitting at `for_approval` or `negotiating_terms`.

1. Open in Committee's view — the "Loan schedule" dropdown should be
   editable (not read-only), pre-filled with whatever the application was
   created with.
2. Change it to a different schedule (e.g. Quarterly → Regular) and submit
   an override — the recomputed totals should reflect the new schedule.
3. Submit a second override that doesn't touch the schedule field —
   **expected**: the schedule from step 2 is preserved, not silently reset.
4. If the underlying application has collateral (Car Refinancing/Real
   Estate), Committee should **not** be able to override it to anything but
   Monthly either — same `validateCollateralPaymentSchedule` check runs on
   this path too.

---

## 11. Fast sanity check — automated tests

Before or after your manual pass:

```bash
npm test
```
Expect: `1430 passing`, `0 failing`.

```bash
npx vitest run src/lib/ar/__tests__/schedule.test.ts src/lib/computation/__tests__/invoice.test.ts src/lib/computation/__tests__/daily.test.ts src/lib/computation/__tests__/discount-units.test.ts
```
Expect: all passing (44 tests). These are the exact formulas this guide's
numbers were verified against — if your manual result disagrees with this
doc, run these first to check whether the underlying math itself broke.
