# Complete Ledgers — Every Schedule Type, Row by Row

Same standard inputs as the other test docs — **Amount 100000, Interest 3%/mo,
Processing Fee 10%, Addon 0** — and the same **Release date: Aug 30, 2026**
your actual test loan (AN300429) already uses, so these ledgers match
exactly what you'll see on screen if you follow along with that same loan.

Clean (no collateral): Principal **₱110,000**, Total Interest **₱19,800**,
Total Loan **₱129,800** for every schedule below except Invoice and Daily
(their own math, see those sections) and the Collateral case at the end.

---

## Regular (Monthly) — Terms 6

| # | Due Date | Amount |
|---|---|---|
| 1 | 2026-09-30 | ₱21,633.33 |
| 2 | 2026-10-30 | ₱21,633.33 |
| 3 | 2026-11-30 | ₱21,633.33 |
| 4 | 2026-12-30 | ₱21,633.33 |
| 5 | 2027-01-30 | ₱21,633.33 |
| 6 | 2027-02-28 | ₱21,633.35 |
| **Total** | | **₱129,800.00** |

(Row 6 lands on Feb 28 because Feb 2027 is not a leap year — clamped from the
30th, per today's date-overflow fix. Row 6's amount absorbs 2 centavos of
rounding so the total matches exactly.)

## MPL — Terms 6

**Identical to Regular in every row** — same 6 dates, same 6 amounts, same
₱129,800 total. If anything differs, that's a bug.

---

## Salary — Terms 6 (12 real payments)

| # | Due Date | Amount |
|---|---|---|
| 1 | 2026-08-31 | ₱10,816.67 |
| 2 | 2026-09-15 | ₱10,816.67 |
| 3 | 2026-09-30 | ₱10,816.67 |
| 4 | 2026-10-15 | ₱10,816.67 |
| 5 | 2026-10-31 | ₱10,816.67 |
| 6 | 2026-11-15 | ₱10,816.67 |
| 7 | 2026-11-30 | ₱10,816.67 |
| 8 | 2026-12-15 | ₱10,816.67 |
| 9 | 2026-12-31 | ₱10,816.67 |
| 10 | 2027-01-15 | ₱10,816.67 |
| 11 | 2027-01-31 | ₱10,816.67 |
| 12 | 2027-02-15 | ₱10,816.63 |
| **Total** | | **₱129,800.00** |

(Alternates 15th → end-of-month. Row 12 absorbs the rounding remainder.)

## Bi-Monthly — Terms 6 (12 real payments)

| # | Due Date | Amount |
|---|---|---|
| 1 | 2026-09-14 | ₱10,816.67 |
| 2 | 2026-09-29 | ₱10,816.67 |
| 3 | 2026-10-14 | ₱10,816.67 |
| 4 | 2026-10-29 | ₱10,816.67 |
| 5 | 2026-11-13 | ₱10,816.67 |
| 6 | 2026-11-28 | ₱10,816.67 |
| 7 | 2026-12-13 | ₱10,816.67 |
| 8 | 2026-12-28 | ₱10,816.67 |
| 9 | 2027-01-12 | ₱10,816.67 |
| 10 | 2027-01-27 | ₱10,816.67 |
| 11 | 2027-02-11 | ₱10,816.67 |
| 12 | 2027-02-26 | ₱10,816.63 |
| **Total** | | **₱129,800.00** |

(Same amounts as Salary — **different dates**: every 15 days straight from
release, Aug 30, not the calendar 15th/end-of-month. This pair is the one
most likely to get confused with each other — check dates, not just amounts.)

---

## Quarterly — Terms 6 (2 due dates, dual-line each)

| # | Due Date | Line | Amount |
|---|---|---|---|
| 1 | 2026-11-10 | interest | ₱9,900.00 |
| 2 | 2026-11-10 | principal | ₱55,000.00 |
| 3 | 2027-02-10 | interest | ₱9,900.00 |
| 4 | 2027-02-10 | principal | ₱55,000.00 |
| **Total** | | | **₱129,800.00** |

(Due day defaults to the 10th — a separately configurable "Due Day" field,
not tied to the release date's own day-of-month like the schedules above.)

## Two-Monthly — Terms 6 (3 due dates, dual-line each)

| # | Due Date | Line | Amount |
|---|---|---|---|
| 1 | 2026-10-10 | interest | ₱6,600.00 |
| 2 | 2026-10-10 | principal | ₱36,666.67 |
| 3 | 2026-12-10 | interest | ₱6,600.00 |
| 4 | 2026-12-10 | principal | ₱36,666.67 |
| 5 | 2027-02-10 | interest | ₱6,600.00 |
| 6 | 2027-02-10 | principal | ₱36,666.66 |
| **Total** | | | **₱129,800.00** |

(Row 6's principal is 1 centavo less than rows 2/4 — rounding remainder.)

---

## Invoice Financing (Weekly) — Terms 3

The on-screen preview now shows the real escalating total (₱24,200 interest /
₱134,200 total, matching the ledger below) as soon as you click Compute —
fixed 2026-08-31, see `docs/invoice-weekly-interest-corruption-audit-and-fix-plan.md`.
(Previously showed a flat ₱19,800/₱129,800 estimate that didn't match the real
schedule below.)

| # | Due Date | Type | Amount |
|---|---|---|---|
| 1 | 2026-09-06 | interest (1%) | ₱1,100.00 |
| 2 | 2026-09-13 | interest (1%) | ₱1,100.00 |
| 3 | 2026-09-20 | interest (1%) | ₱1,100.00 |
| 4 | 2026-09-27 | interest (1%) | ₱1,100.00 |
| 5 | 2026-10-04 | interest (2%) | ₱2,200.00 |
| 6 | 2026-10-11 | interest (2%) | ₱2,200.00 |
| 7 | 2026-10-18 | interest (2%) | ₱2,200.00 |
| 8 | 2026-10-25 | interest (2%) | ₱2,200.00 |
| 9 | 2026-11-01 | interest (2.5%) | ₱2,750.00 |
| 10 | 2026-11-08 | interest (2.5%) | ₱2,750.00 |
| 11 | 2026-11-15 | interest (2.5%) | ₱2,750.00 |
| 12 | 2026-11-22 | interest (2.5%) | ₱2,750.00 |
| 13 | 2026-11-29 | **principal** | ₱110,000.00 |
| **Total interest** | | | **₱24,200.00** |
| **Total (interest + principal)** | | | **₱134,200.00** |

---

## Daily — Release Aug 30, Payment Date Sep 4 (5 days)

| # | Due Date | Amount |
|---|---|---|
| 1 | 2026-09-04 | ₱110,550.00 |

Single row only. Interest = ₱110,000 × 0.001 × 5 = ₱550.00, Total Due =
₱110,550.00. (Try a different payment date — the interest scales linearly:
7 days → ₱770.00 interest, ₱110,770.00 total.)

---

## Collateral (Car Refinancing / Real Estate) — Regular Monthly only, Terms 6

Principal is **not** grossed up here (₱100,000, net method) — different
totals from every Clean case above:

| # | Due Date | Amount |
|---|---|---|
| 1 | 2026-09-30 | ₱19,666.67 |
| 2 | 2026-10-30 | ₱19,666.67 |
| 3 | 2026-11-30 | ₱19,666.67 |
| 4 | 2026-12-30 | ₱19,666.67 |
| 5 | 2027-01-30 | ₱19,666.67 |
| 6 | 2027-02-28 | ₱19,666.65 |
| **Total** | | **₱118,000.00** |

Same dates as Regular/MPL (same date rule, collateral only changes the
math, not the schedule) — including the same Feb 28 clamp on the last row.
Real Estate collateral produces identical numbers to Car Refinancing.
