# LRA / PDC Schedule — Manual QA Test Guide

Extends [`payment-frequency-manual-test-guide.md`](payment-frequency-manual-test-guide.md) past the Computation step, all the way through **LRA PDC encoding** — the step that turned out to need its own separate fix (a completely different code path from the AR masterlist schedule, discovered and fixed 2026-08-28).

**Why this matters**: computing a loan correctly is not the same as being able to actually release it. The PDC schedule is built and validated by different code than the AR schedule — this guide exists specifically to prove the two agree with each other, for every one of the 6 SME schedule types.

---

## 0. Before you start — automated check

```bash
npm test
```

Expect `1424 passing, 0 failing`. The PDC-specific tests are in `src/lib/lra/__tests__/release-service.test.mts` — 7 new tests, one per schedule type, each proving the server accepts exactly the schedule the real engines produce and rejects anything else.

---

## 1. Get a loan to the LRA stage

This is the slow part — a loan must pass Committee approval and CIG verification, and the borrower must sign the computation, before an LRA release file even exists. If your environment allows it, check for a dev-only **"⚡" autofill button** (bottom-right corner, purple circle, labeled "Autofill (dev only)") on the Committee/CIG/LRA screens — it can fill remarks and PDC check numbers/banks for you, though it does **not** fill dates/amounts (those are always computed, never typed) and does not fill the release-path checkboxes.

1. Create an application per [the computation guide's step 1](payment-frequency-manual-test-guide.md#1-create-a-test-application-do-this-once-per-scenario) — Segment `SME`, pick a **Loan schedule** (e.g. `Quarterly`), Collateral `Clean (no collateral)`.
2. Complete Privacy Orientation, Initial Interview, and Compute the loan (see the computation guide's per-schedule-type sections for exact inputs/expected numbers).
3. Endorse to CIG, complete CIG verification.
4. Endorse to Committee, approve.
5. Borrower (or CSA witness-sign) signs the disclosed computation — this is what actually queues the file for LRA (`queueForLra` in `negotiation/service.ts`).
6. Go to **`/lra/applications/{id}`**.

---

## 2. Choose "With PDC" as the release path

On the LRA workspace, the first card is **"Release path"**: *"Choose how funds will be released for this file. You may select both when PDC and ATM surrender apply together."*

1. Check **"With PDC"** (leave "ATM surrender only" unchecked — that path bypasses PDC entirely and isn't what we're testing).
2. Click **"Save path"**.

---

## 3. Build the PDC schedule and check the summary fields

The next card is **"PDC encoding"**: *"Build the schedule from the first check date, then enter the actual check number and bank/branch for every physical PDC."*

For a **non-monthly schedule type** (Invoice/Bi-monthly/Quarterly/Two-monthly/Daily), the two summary fields should now read:
- **"Number of checks"** — the *real* count for that schedule (not the raw loan term count — see the table below), with a caption *"Derived from this loan's schedule type, not the raw term count"*.
- **"Amount"** (relabeled from "Monthly amount") — *"Varies per check — see schedule below"*, since there's no single flat figure for these.

| Schedule type | Terms entered | Expected "Number of checks" |
|---|---|---|
| Quarterly | 6 | **4** (2 quarters × 2 lines) |
| Quarterly | 12 | **8** (4 quarters × 2 lines) |
| Two-monthly | 4 | **4** (2 payments × 2 lines) |
| Bi-monthly | 6 | **12** (terms × 2) |
| Invoice (Weekly) | 3 | **13** (12 weekly + 1 principal) |
| Daily | any | **1** |

If "Number of checks" instead shows the raw term count (e.g. `6` for a Quarterly loan instead of `4`), the fix regressed — that field used to read `computation.terms` directly, which is wrong for every one of these.

Click **"Build schedule"**.

**Expected**: a **"PDC details"** table appears with exactly the row count from the table above. Spot-check the **Date** and **Amount** columns (both read-only, computed — you cannot type into them):

- **Quarterly/Two-monthly**: consecutive row pairs share the same date (e.g. rows 1–2 both dated 3 months after release), one row's amount is the interest-only portion, the next is the (larger) principal portion.
- **Bi-monthly**: dates 15 days apart, starting at release + 15 days; all amounts equal except the last (rounding absorption).
- **Invoice**: first 4 rows at the Month-1 rate, next 4 at Month-2's higher rate, next 4 at Month-3's highest rate, final row is the full principal amount at a much later date.
- **Daily**: exactly one row, dated the CSA-entered payment date from Computation, amount = principal + the day-count interest.

## 4. Fill in check number / bank, then save

For each row, type a **Check no.** and **Bank/Branch** (only these two columns are editable — Date and Amount are fixed). If the dev Autofill overlay is available, its **"Fill PDC details"** action does this for you.

Click **"Save PDC schedule"**.

**Expected**: a green success banner — *"PDC schedule saved."* — and the draft table is replaced by a read-only **"PDC schedule"** card showing the persisted rows with a caption like *"13 checks · blank range ..."*.

**Regression check — try to break it on purpose**: before saving, manually edit one row's underlying data if your test setup allows submitting a mismatched payload directly (e.g. via the API), or simply confirm that the UI gives you no way to submit a wrong amount/date at all — since Date and Amount are non-editable computed fields, the only way to get a validation error out of `savePdcChecks` through this UI is a blank Check no. or Bank/Branch, which should show inline:
- *"Check number is required for PDC #N."*
- *"Bank/Branch is required for PDC #N."*

Both appear as a persistent `Alert` banner near the top of the page, not attached to the specific row.

---

## 5. Regression pass — Monthly and Salary loans are untouched

1. **Monthly (SME/MPL, no schedule type change)**: "Number of checks" shows the loan's raw term count, "Monthly amount" shows the flat figure, dates are one calendar month apart (`addScheduleMonths`) — identical to before any of this work.
2. **Salary (Individual, semi-monthly)**: "Number of checks" shows `terms × 2`, dates alternate 15th/end-of-month, amounts are flat half-amortization with the last one absorbing rounding — also identical to before.

If either of these changed at all, something in this fix leaked into the untouched paths — they were deliberately left as separate, unmodified branches throughout (both in `release-service.ts` server-side and in the client's `buildPdcRows`).
