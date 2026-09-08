> **SUPERSEDED 2026-09-07** by [task-03-daily-interest-validation-journey.md](task-03-daily-interest-validation-journey.md) — this described the per-day / compute-date version. Kept for history.

# Task 3 — Test journey: daily interest divisor = real days in month

**What we're proving:** a Daily Interest loan's interest now divides the monthly
rate by the **actual number of days in the release month** (28/29/30/31), not a
fixed 30. Change lives in `src/lib/computation/daily.ts`
(`monthlyRate ÷ daysInMonthOf(releaseDate)`); the CSA calculator's "Total
interest" formula label changed from `÷ 30 per day` to `÷ days in release month`.

**Important framing for the demo:** in a **30-day** release month the number is
**identical** to the old behaviour (30 ÷ 30). So to *show a difference on screen*
you must compute with a release date in a 28-, 29- or 31-day month. September has
30 days — see Part D for how to force a February/July release date without
waiting for the calendar.

---

## Part A — Preconditions

- A borrower with an **Individual** or **SME** application (Seafarer cannot use
  Daily — the DB forces monthly; a collateral loan also forces monthly).
- The application is at the **CSA computation** stage with the **initial
  interview recorded** (the compute route rejects it otherwise).
- You can reach the CSA calculator for that application:
  `/csa/applications/<id>` → the computation panel.
- For Part B only: a terminal in `loanstar/` (`npm`, `node` available).
- For Part D (optional): ability to run one SQL `UPDATE` (Supabase SQL editor)
  **or** temporarily change the machine date.

---

## Part B — Fast deterministic proof (no UI, ~15 seconds)

This is the authoritative check that the maths is right for every month length.

1. In `loanstar/`, run the focused suite:

   ```bash
   npm test -- --test-name-pattern="daily"
   ```

   (or run just the file: `node --import tsx --test "src/lib/computation/__tests__/daily.test.mts"`)

2. **Expect:** `pass 8  fail 0`, including these named cases:
   - `30-day release month: divisor 30 … ₱500`
   - `31-day release month (July): divisor 31, ₱483.87`
   - `28-day release month (Feb 2026): divisor 28, ₱1,071.43`
   - `leap-year February (2028): divisor 29 … ₱1,034.48`
   - `release/payment in different months: divisor stays the RELEASE month`
   - `rejects a payment date on or before the release date`

3. Optional one-off REPL to try your own numbers (₱200,000, 5%/mo, 10 days):

   ```bash
   node --import tsx -e "import {computeDailyInterestLoan as f} from './src/lib/computation/daily.ts'; for (const [lbl,r] of [['Feb/28','2026-02-10'],['leap Feb/29','2028-02-10'],['Apr/30','2026-04-10'],['Jul/31','2026-07-10']]) { const p=new Date(r); p.setDate(p.getDate()+10); const x=f({principal:200000,monthlyRate:0.05,releaseDate:new Date(r),paymentDate:p}); console.log(lbl.padEnd(12), 'divisor', x.daysInDivisorMonth, 'interest', x.interest, 'totalDue', x.totalDue); }"
   ```

   **Expect exactly:**

   | Release month | divisor | interest | total due |
   | :- | -: | -: | -: |
   | Feb 2026 (28) | 28 | ₱3,571.43 | ₱203,571.43 |
   | Feb 2028 (leap, 29) | 29 | ₱3,448.28 | ₱203,448.28 |
   | Apr 2026 (30) | 30 | ₱3,333.33 | ₱203,333.33 |
   | Jul 2026 (31) | 31 | ₱3,225.81 | ₱203,225.81 |

   The interest moves purely because the divisor moves — that is the whole fix.

---

## Part C — End-to-end UI journey (current month)

Proves the calculator wires the new divisor through and shows the corrected
label. In a 30-day month the value equals the old behaviour — that's expected;
Part D shows the value actually changing.

1. Open `/csa/applications/<id>` for the Individual/SME application.
2. In the computation panel set:
   - **Input mode:** Principal
   - **Amount:** `200000`
   - **Interest rate:** `5` (i.e. 5%/month)
   - **Processing fee rate:** `5` (or your normal value — irrelevant to interest)
   - **Schedule type:** `Daily`
3. The **Terms / Addon** fields disappear; a **Payment date** field appears with
   the helper text *"Single payment — interest accrues per actual day to the
   payment date below"*.
4. Set **Payment date** to **10 days after today**.
5. Click **Compute** (or **Save computation**).
6. In **"How this was computed"**, check the **Total interest** row:
   - **Formula reads:** `₱200,000.00 × (5.00% ÷ days in release month) × actual days to payment date`
     — it must **not** say `÷ 30 per day`.
   - **Value:** `₱ principal × 0.05 ÷ <days in THIS month> × 10`.
     In a 30-day month → **₱3,333.33**. In a 31-day month → **₱3,225.81**.
7. Check the one-time payment row:
   - **Label:** `Amount due (one-time)` (not "Monthly amortization").
   - **Formula:** `Principal + Total interest — single payment on the payment date`.
   - **Value:** principal + the interest above (30-day month → **₱203,333.33**).
8. Confirm there is **no amortization schedule / no monthly figure** — Daily is a
   single payment.
9. **Discounts:** the origination-discount section should refuse Daily with
   *"Daily Interest loans have a single fixed payment — there's nothing to
   discount."*

---

## Part D — Prove the divisor changes on screen (28-day month)

Pick **one** option. Needed because `release_date` at CSA compute time is the
server's "today", so a 30-day month hides the change.

### Option D1 — SQL patch the release date, then recompute

1. Do Part C steps 1–7 once (creates a `computations` row).
2. In the Supabase SQL editor, for that application:

   ```sql
   update computations
   set release_date = '2026-02-10'
   where loan_application_id = '<application-id>'
     and is_active = true;
   ```

   > This is a **test-only** nudge. Do not do this on a real loan — release date
   > is normally set by the LRA release step. Revert or discard the test app
   > afterwards.

3. Back in the CSA calculator, change any field trivially and **Compute again**
   so `persistComputation` re-reads the release date. *(If the calculator does
   not accept a release-date override, instead re-run the REPL in Part B with
   `releaseDate: new Date('2026-02-10')` — the engine is the same code path.)*
4. **Expect** the Total interest row value to jump to the **÷ 28** figure:
   ₱200,000 × 0.05 ÷ 28 × 10 = **₱3,571.43**; amount due **₱203,571.43**.

### Option D2 — Move the machine clock

1. Set the OS date to any day in **February** (e.g. Feb 10).
2. Restart the dev server so the server picks up the new date.
3. Run Part C with **Payment date = Feb 20** (10 days out).
4. **Expect** divisor 28 → interest **₱3,571.43**, amount due **₱203,571.43**.
5. Restore the clock and restart afterwards.

### Also check a 31-day month

Repeat D1 with `release_date = '2026-07-10'` (or clock in July) and payment 10
days later → divisor 31 → interest **₱3,225.81**, amount due **₱203,225.81**.

---

## Part E — Downstream propagation (the stored total flows unchanged)

Daily interest is computed once at CSA and only **read** afterwards — verify it
is not silently recomputed at `/30` somewhere.

1. Take the Part D (28-day) computation through **sign / endorse** to **LRA**.
2. In LRA, choose the **With PDC** path and open PDC encoding.
3. **Expect exactly one** expected check: amount = **the amount due**
   (₱203,571.43 for the 28-day case), dated the **payment date**. Not a monthly
   series, not a `/30` amount.
4. Release the loan; open the **AR masterlist** for the account.
5. **Expect one** amortization row: `installment_no = 1`, `amount_due` = the same
   amount due, `due_date` = the payment date.
6. Borrower portal for that account shows the single instalment with that amount.

---

## Part F — Regression / negative checks

| Check | Steps | Expected |
| :- | :- | :- |
| Payment date must be after release | In Part C set payment date = today (or earlier) | Blocked: *"Payment date is required…"* / *"Payment date must be after release date"* — no row saved |
| Non-Daily schedules untouched | Compute a normal **Monthly** SME loan, same amount/rate/terms | Interest = `principal × rate × (terms + addon)` exactly as before this change; formula row still shows the months formula, no "days in release month" text |
| Seafarer cannot pick Daily | Open a Seafarer application's calculator | No `Daily` option / forced Monthly |
| Existing daily loans unchanged | Open a `daily` computation created **before** 2026-09-07 and do **not** recompute | Stored `total_interest` / `total_loan` unchanged (no backfill). It only moves to the new divisor if CSA/Committee recompute. |
| Full suite | `npm test` | `pass 1569  fail 0` (1561 baseline + 8 new daily cases) |
| Build | `npm run build` | `✓ Compiled successfully`, 140/140 pages |

---

## Part G — Consolidated expected results (₱200,000, 5%/mo, 10 elapsed days)

| Release month | Divisor | Interest | Amount due (one-time) |
| :- | -: | -: | -: |
| February (non-leap) | 28 | ₱3,571.43 | ₱203,571.43 |
| February (leap year) | 29 | ₱3,448.28 | ₱203,448.28 |
| 30-day month (Apr/Jun/Sep/Nov) | 30 | ₱3,333.33 | ₱203,333.33 |
| 31-day month (Jan/Mar/May/Jul/Aug/Oct/Dec) | 31 | ₱3,225.81 | ₱203,225.81 |

Old behaviour was the **30-day row for every month**. Only non-30-day months
change.

---

## Part H — Client sign-off (Wednesday demo)

Show the client the 28-day and 31-day results side by side (Part D), then get an
explicit answer on each — the code has a default in place but these are not
confirmed:

1. **Actual days per month vs fixed 30 ("30/30")** — is the new behaviour what
   they want at all? (Rovick flagged this still needs confirming.)
2. **Which month owns the divisor** when the loan is released in one month and
   paid in another. Current default: **the release month**. Alternative: the
   payment month (one-line change).
3. **Leap-year February** — 28 or 29? Current default: **29** (real length).

Only mark tracker Task 3 **Done** after all three are answered and the demo
values are accepted.
