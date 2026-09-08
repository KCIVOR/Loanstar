# Task 3 — validation journey (daily interest = SME calculator)

**Supersedes** `task-03-daily-interest-test-journey.md` (that one described the
per-day / compute-date version). This matches what is in the code now:

> `interest = principal × monthlyRate ÷ (days in the RELEASE month) × (paymentDate − releaseDate)`
> `totalDue = round(principal + rawInterest, 2)` — one divisor, entered dates,
> round once. Same as `docs/Calculator SME.xlsm` (sheet SME).

The big change for testing: the CSA calculator now has a **Release date** field
for daily loans, so you can test a 28-day or 31-day divisor directly — no clock
or DB tricks needed.

---

## Part A — Preconditions

- An **Individual** or **SME** application (Seafarer can't use Daily; a
  collateral loan can't either).
- The application is at the **CSA computation** stage with the **initial
  interview recorded**.
- Open `/csa/applications/<id>` → the computation panel.

All money figures below use **principal ₱100,000, interest 3%/month** so they
are easy to check by hand. Verified against the engine.

---

## Part B — Fast engine check (optional, ~10 s)

```bash
cd loanstar && npm test -- --test-name-pattern="daily"
```

Expect `pass` for all daily cases, including "released 10 Feb 2026, paid 5 Mar
2026: all 23 days ÷ 28 (not per-day)" and "leap-year February (2028): divisor
29".

Try your own numbers:

```bash
node --import tsx -e "import {computeDailyInterestLoan as f,parseLocalDate as p} from './src/lib/computation/daily.ts'; const x=f({principal:100000,monthlyRate:0.03,releaseDate:p('2026-07-10'),paymentDate:p('2026-07-20')}); console.log(x.daysInReleaseMonth,x.days,x.interest,x.totalDue);"
# -> 31 10 967.74 100967.74
```

---

## Part C — End-to-end UI journey (the main validation)

Do this once per scenario in the table at the end. Steps are identical; only the
two dates change.

1. Open the CSA computation panel for the Individual/SME application.
2. Set:
   - **Input mode:** Principal
   - **Amount:** `100000`
   - **Interest rate:** `3`  (i.e. 3%/month)
   - **Processing fee rate:** your normal value (does not affect interest)
   - **Schedule type:** `Daily`
3. The **Terms / Addon** fields disappear. **Two date fields** appear:
   - **Release date** — defaults to today. **Set it to the scenario's release date.**
   - **Payment date** — set it to the scenario's payment date.
   The Release field won't let you pick a date on/after the Payment date, and
   the Payment field won't let you pick one on/before Release.
4. Click **Compute** (or **Save computation**).
5. In **"How this was computed"**, check the **Total interest** row:
   - **Formula** reads, e.g.:
     `₱100,000.00 × 3.00%/mo ÷ 31 days in 2026-07 × 10 days (2026-07-10 → 2026-07-20)`
     — the divisor is the number of days in the **release month**, and the day
     count is `payment − release`.
   - **Value** = the scenario's **Interest**.
6. Check the one-time payment row:
   - **Label:** `Amount due (one-time)`.
   - **Value:** the scenario's **Amount due** (= principal + interest, rounded).
7. Confirm there is **no monthly figure / no schedule** — Daily is one payment.
8. The origination-discount section refuses Daily
   ("...single fixed payment — there's nothing to discount").

### Scenario 1 — 31-day release month
Release `2026-07-10`, Payment `2026-07-20`.
Expect: divisor **31**, days **10**, Interest **₱967.74**, Amount due **₱100,967.74**.

### Scenario 2 — 28-day release month
Release `2026-02-10`, Payment `2026-02-20`.
Expect: divisor **28**, days **10**, Interest **₱1,071.43**, Amount due **₱101,071.43**.

### Scenario 3 — 30-day release month (baseline; equals the old ÷30)
Release `2026-09-10`, Payment `2026-09-20`.
Expect: divisor **30**, days **10**, Interest **₱1,000.00**, Amount due **₱101,000.00**.

### Scenario 4 — crosses a month boundary (still uses the RELEASE month)
Release `2026-02-25`, Payment `2026-03-10`.
Expect: divisor **28** (February — the release month, *not* per-day), days
**13**, Interest **₱1,392.86**, Amount due **₱101,392.86**.

### Scenario 5 — leap-year February
Release `2028-02-10`, Payment `2028-02-20`.
Expect: divisor **29**, days **10**, Interest **₱1,034.48**, Amount due **₱101,034.48**.

### Scenario 6 — change the release date, watch the number move
On Scenario 2's saved computation, change **Release date** to `2026-01-10`
(keep Payment `2026-02-20`) and Compute again.
Expect: divisor **31** (January), days **41**, Interest **₱3,967.74**, Amount
due **₱103,967.74**. Proves the figure follows the entered release date, not
"today".

---

## Part D — Validation / negative cases

| # | Do this | Expect |
| :- | :- | :- |
| D1 | Schedule = Daily, leave **Release date** blank, Compute | Blocked: "Release date is required for Daily Interest loans" — nothing saved |
| D2 | Release date = Payment date (both `2026-07-15`) | Blocked: "...release date must be before the payment date" |
| D3 | Release date `2026-07-20`, Payment `2026-07-10` (release after) | Blocked, same message (the date pickers also prevent this) |
| D4 | Leave **Payment date** blank | Blocked: "Payment date is required for Daily Interest loans" (unchanged) |
| D5 | Any **non-Daily** schedule (e.g. Monthly), compute a normal loan | No Release-date field; interest = `principal × rate × (terms + addon)` exactly as before — this change must not touch non-daily loans |

---

## Part E — Downstream (after release)

Take Scenario 2 (or any) through **sign → endorse → LRA**.

1. **LRA "With PDC" path** → PDC encoding: expect **one** expected check =
   **₱101,071.43**, dated the **payment date** (`2026-02-20`).
2. **Record the release** in LRA on some later day.
3. Open the loan's **computation / AR masterlist**:
   - `computations.release_date` is **still `2026-02-10`** (the entered date) —
     it is **not** overwritten with the actual release day for daily loans.
     (For a Monthly loan it *would* be overwritten — that's unchanged.)
   - **One** amortization row: `installment_no = 1`, `amount_due = ₱101,071.43`,
     `due_date = 2026-02-20`.
4. Borrower portal shows the single instalment of ₱101,071.43.

> Note: because `release_date` stays the entered date, this daily loan reports
> under **February** even if it was actually disbursed in March. This is
> intended (the interest was priced off the entered date). Flag it if the
> client wants reports to use the true disbursement day.

---

## Part F — Committee override path

1. Send a daily computation to Committee; on the Committee calculator, the same
   **Release date** field appears.
2. Committee changes the amount (or the release date) and submits the override.
3. Expect the recomputed interest to use the **release date shown in the
   Committee calculator** (the one just submitted, or — if left untouched — the
   value the CSA computation already carried), **never "today"**.
4. Same validation as D1–D3 applies on the override.

---

## Part G — Consolidated expected results (₱100,000, 3%/month)

| Scenario | Release | Payment | Divisor | Days | Interest | Amount due |
| :- | :- | :- | -: | -: | -: | -: |
| 1  31-day month | 2026-07-10 | 2026-07-20 | 31 | 10 | ₱967.74 | ₱100,967.74 |
| 2  28-day month | 2026-02-10 | 2026-02-20 | 28 | 10 | ₱1,071.43 | ₱101,071.43 |
| 3  30-day month | 2026-09-10 | 2026-09-20 | 30 | 10 | ₱1,000.00 | ₱101,000.00 |
| 4  crosses months | 2026-02-25 | 2026-03-10 | 28 | 13 | ₱1,392.86 | ₱101,392.86 |
| 5  leap February | 2028-02-10 | 2028-02-20 | 29 | 10 | ₱1,034.48 | ₱101,034.48 |
| 6  earlier release | 2026-01-10 | 2026-02-20 | 31 | 41 | ₱3,967.74 | ₱103,967.74 |

Formula for each: `Interest = round(100000 × 0.03 ÷ Divisor × Days, 2)`,
`Amount due = round(100000 + (that, un-rounded), 2)`.

Cross-check against the client's spreadsheet: on the **SME** sheet enter the
same principal, rate, release date (F19) and payment date (F20) with the daily
option — cells should show the same **days in month**, day count and interest.

---

## Part H — Sign-off (before the tracker item is "Done")

Demonstrate Scenarios 1, 2 and 4 to the client and confirm:

1. **Actual days per month** (28/29/30/31), not a flat 30/30 — the SME sheet
   uses actual days; Rovick asked for this to be confirmed.
2. **Leap-year February = 29** (Scenario 5) — matches the sheet.
3. **No re-pricing if the actual release date differs from the entered one**
   (Part E note) — the interest is fixed once entered/signed; a slipped release
   is not recalculated.

Not covered by automated tests (verify here / in QA): the D1–D4 error messages
and the Part E "release_date not overwritten for daily" behaviour.
