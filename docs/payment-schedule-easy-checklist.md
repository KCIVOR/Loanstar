# Easy Testing Checklist — Loan Schedules

Simple version. For every test: same starting numbers, just follow the steps and compare what you see to the "You should see" line.

**Always start with these same inputs** (unless a step says otherwise):
- Amount: **100000**
- Terms: **6**
- Addon months: **0**
- Interest rate: **3**
- Processing fee: **10**

---

## TEST 1 — Regular loan, no collateral

1. New application → Segment: **SME** (or Individual, same result) → Collateral: **Clean**
2. Loan schedule: **Regular (Monthly)**
3. Enter the numbers above → click **Compute**

✅ You should see:
- Principal: **₱110,000.00**
- Total Interest: **₱19,800.00**
- Total Loan: **₱129,800.00**
- Monthly payment: **₱21,633.33**
- 6 payments total, one every month, same day each month

---

## TEST 2 — MPL

1. Same as Test 1, but Loan schedule: **MPL**

✅ You should see: **the exact same numbers as Test 1.** If anything is different, that's a bug.

---

## TEST 3 — Salary

1. Same as Test 1, but Loan schedule: **Salary**

✅ You should see:
- Same totals as Test 1 (₱110,000 / ₱19,800 / ₱129,800)
- But split into **12 smaller payments** of ₱10,816.67 each (twice a month instead of once)
- Payment dates land on the **15th or the last day of the month**

---

## TEST 4 — Bi-monthly

1. Same as Test 1, but Loan schedule: **Bi-monthly**

✅ You should see:
- Same totals as Test 1
- Also **12 payments** of ₱10,816.67 each — looks like Salary, BUT:
- Dates are exactly **every 15 days from the release date** (not the 15th/end-of-month like Salary). This is the one to double check carefully — it's easy to mix up with Salary.

---

## TEST 5 — Quarterly

1. Same as Test 1, but Loan schedule: **Quarterly**

✅ You should see:
- Same totals as Test 1
- Schedule (check this in AR → Masterlist after the loan is released): **2 due dates**, 3 months apart, each with **2 lines**:
  - Interest: ₱9,900.00
  - Principal: ₱55,000.00

⚠️ Try this too: change Terms to **7** → should be **rejected** with an error (Quarterly needs terms divisible by 3).

---

## TEST 6 — Two-monthly

1. Same as Test 1, but Loan schedule: **Two-monthly**

✅ You should see:
- Same totals as Test 1
- Schedule: **3 due dates**, 2 months apart, each with 2 lines:
  - Interest: ₱6,600.00
  - Principal: ₱36,666.67 (last one ₱36,666.66)

⚠️ Try this too: change Terms to **5** → should be **rejected** (needs terms divisible by 2).

---

## TEST 7 — Daily

1. Same as Test 1, but Loan schedule: **Daily**
2. Set Release date, then set Payment date to **5 days later**
3. Try clicking Compute with NO payment date first → should be **blocked** with an error

✅ After entering a payment date 5 days later, you should see:
- Total Interest: **₱550.00**
- Total Due: **₱110,550.00**

Try again with payment date **7 days later**:
- Total Interest: **₱770.00**
- Total Due: **₱110,770.00**

---

## TEST 8 — Invoice Financing ⚠️ (known issue, not your fault)

1. Same as Test 1, but Loan schedule: **Invoice Financing (Weekly)**, Terms: **3**

✅ Right after clicking Compute, you'll see: ₱19,800 / ₱129,800 (same as Test 1 — this is a known bug, ignore it for now)

✅ The REAL numbers only show up **after the loan is released**, in AR → Masterlist:
- 12 weekly payments: 4 at ₱1,100, 4 at ₱2,200, 4 at ₱2,750
- Then 1 final payment of ₱110,000 (the principal)
- Real total interest: **₱24,200.00**
- Real total loan (principal + interest): **₱134,200.00**

⚠️ Try this too: Terms = **4** → should be **rejected** (Invoice only allows 1-3 months).

📌 **Don't report the mismatch between ₱19,800 (right after Compute) and ₱24,200 (after release) as a new bug** — it's already known and documented. Everything else about Invoice should work as described.

---

## TEST 9 — Collateral loan (Car Refinancing or Real Estate)

1. New application → Collateral: **Car Refinancing**
2. Look at the "Loan schedule" field — it should be **greyed out**, showing only "Regular (Monthly)", with a note that it's locked
3. Enter the numbers above → Compute

✅ You should see:
- Principal: **₱100,000.00** (not grossed up — different from Test 1)
- Total Interest: **₱18,000.00**
- Total Loan: **₱118,000.00**
- Monthly payment: **₱19,666.67**
- 6 monthly payments

4. Now change Collateral back to **Clean** → the schedule dropdown should immediately show all 8 options again

5. Repeat with **Real Estate** instead of Car Refinancing → same numbers as above.

---

## TEST 10 — Individual gets the same options as SME now

1. New application → Segment: **Individual** → Collateral: **Clean**
2. Check the Loan schedule dropdown

✅ You should see all 8 options, same as SME (this used to only show MPL/Salary before — now it's the full list).

---

## Quick reference — what "good" looks like

| Test | Total Interest | Total Loan | # Payments |
|---|---|---|---|
| Regular / MPL | ₱19,800 | ₱129,800 | 6 |
| Salary / Bi-monthly | ₱19,800 | ₱129,800 | 12 |
| Quarterly | ₱19,800 | ₱129,800 | 4 rows (2 dates × 2 lines) |
| Two-monthly | ₱19,800 | ₱129,800 | 6 rows (3 dates × 2 lines) |
| Daily (5 days) | ₱550 | ₱110,550 | 1 |
| Invoice (after release) | ₱24,200 | ₱134,200 | 13 |
| Car Refinancing / Real Estate | ₱18,000 | ₱118,000 | 6 |

If a number doesn't match its row, something's wrong — tell me which test and what you saw instead.
