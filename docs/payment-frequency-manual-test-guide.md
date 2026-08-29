# Payment Frequency — Manual QA Test Guide

Step-by-step user journeys to manually verify P1–P5, with the exact expected numbers (these match the worked examples from `payment-frequency-implementation-plan.md`/`loan-schedule-type-redesign-plan.md` and the automated test suite — if what you see on screen doesn't match this doc, something regressed).

**Updated for the loan-schedule-type redesign**: the "Loan schedule" (Regular/Invoice/Bi-monthly/Quarterly/Two-monthly/Daily) is now chosen **at application creation**, alongside Segment and Collateral — not on the Computation screen. It only appears for **SME** applications (confirmed against the client's Excel calculator — every Invoice/Quarterly/Daily rate entry traces back to SME/business borrowers). Individual and Seafarer are unchanged: no schedule choice, always monthly or (Individual+Salary) semi-monthly.

---

## 0. Before you start — automated tests (fastest sanity check)

If you just want to confirm the underlying math without clicking through the UI:

```bash
npm test
```

Expect: `1417 passing`, `0 failing`. This is the project's real CI check and covers every formula below at the unit level. The manual journeys are for confirming the **UI wiring** (does the right field appear at the right step, does the right value reach the database) — the automated suite already proves the **math**.

```bash
npx vitest run src/lib/ar/__tests__/schedule.test.ts src/lib/computation/__tests__/invoice.test.ts src/lib/computation/__tests__/daily.test.ts
```

Expect: all passing (32 tests across schedule.test.ts + invoice.test.ts + daily.test.ts).

---

## 1. Create a test application (do this once per scenario)

1. Log in as a CSA user, go to **CSA → Applications → New** (or use the borrower portal's "Start application" picker — both have the same fields, see step 3a).
2. Fill in any borrower details (email, name).
3. **Loan segment**: `SME` (or `Individual` for P1's collateral scenario — Invoice/Bi-Monthly/Quarterly/Two-Monthly/Daily are SME-only, see step 3a).
   - 3a. If SME: **Entity type** → either option. Then a new **"Loan schedule"** dropdown appears — this is where you pick the product for P2–P5 (see each scenario below). It defaults to `Regular (Monthly)`.
4. **Collateral**:
   - `Clean (no collateral)` for P2–P5
   - `Car Refinancing` or `Real Estate` for **P1** specifically (independent of Loan schedule — an SME application can combine any Collateral with any Loan schedule; they're separate facts)
5. If Individual + Clean: **Individual loan type** → `MPL` (Salary forces semi-monthly and isn't relevant here; Individual has no "Loan schedule" field at all).
6. Submit. Complete **Privacy Orientation** and **Initial Interview** if the app requires them before Computation unlocks (same gate as any application — nothing about this changed).
7. Go to the application's **Computation** tab. The "Loan schedule" you picked at step 3a now shows there as **read-only text** (not a dropdown) — CSA cannot change it on this screen. If you need a different schedule, create a new application with the right choice, or ask Committee to override it (see step 8 below).
8. **Committee only**: once the application reaches Committee (`for_approval`/`negotiating_terms`), the Computation panel in Committee's view shows "Loan schedule" as an **editable dropdown** instead of read-only text — Committee retains override authority, same as they already have over amount/rate/terms.

---

## 2. P1 — Auto/REM Net-Method Fix

**Setup**: Segment `SME`, Loan schedule `Regular (Monthly)` (default — unrelated to this fix), Collateral `Car Refinancing` (or `Real Estate`).

**Computation inputs**:
| Field | Value |
|---|---|
| Input mode | `Principal` |
| Amount | `100000` |
| Terms | `6` |
| **Addon months** | `0` ⚠️ (defaults to `2` — change it) |
| Interest | `3` (%/mo) |
| Processing fee | `10` (%) |

Click **Compute**.

**Expected output** (shown in the computation summary):
| Field | Expected |
|---|---|
| Principal | **₱100,000.00** (NOT ₱110,000 — this is the whole point of P1) |
| Total Interest | ₱18,000.00 |
| Monthly Amortization | **₱19,666.67** |
| Security Fee | ₱0.00 |

**Regression check** — repeat with Collateral `Clean (no collateral)` instead, same inputs:
| Field | Expected |
|---|---|
| Principal | **₱110,000.00** (gross-up, unchanged from before) |
| Monthly Amortization | **₱21,633.33** |

If Auto/REM shows ₱110,000/₱21,633.33 instead of ₱100,000/₱19,666.67, the P1 fix regressed.

---

## 3. P2 — Invoice Financing (Weekly)

**Setup**: at application creation — Segment `SME`, **Loan schedule `Invoice Financing (Weekly)`**, Collateral `Clean (no collateral)`.

**Computation inputs**:
| Field | Value |
|---|---|
| Amount | `100000` |
| Terms | `3` |

The Computation screen should show "Loan schedule: Weekly (Invoice Financing)" as read-only text, with a hint underneath: *"Invoice: 1-3 month terms only, weekly interest-only payments."*

Click **Compute**.

**Expected output**:
| Field | Expected |
|---|---|
| Total Interest | **₱22,000.00** |
| Weekly schedule | 12 rows: weeks 1–4 at ₱1,000 (1%), weeks 5–8 at ₱2,000 (2%), weeks 9–12 at ₱2,500 (2.5%) |

**Boundary check**: change Terms to `4` and re-Compute → should be **rejected** ("Invoice financing terms must be 1, 2, or 3 months" or similar validation error), since Invoice is capped at 3 months.

**After release** (if you carry this loan through to Release): the AR masterlist's amortization schedule should show **13 installments** — 12 weekly interest payments + 1 final principal payment of ₱100,000, one week after the last interest payment. No 5% penalty row should appear at release (it's a collections-time charge if the principal goes unpaid, not an origination line item).

---

## 4. P3 — Bi-Monthly (Every 15 Days)

**Setup**: at application creation — Segment `SME`, **Loan schedule `Bi-monthly (every 15 days)`**, Collateral `Clean (no collateral)`.

**Computation inputs**:
| Field | Value |
|---|---|
| Amount | `100000` |
| Terms | `6` |
| Addon months | `0` |
| Interest | `3` |
| Processing fee | `10` |

Click **Compute**, then carry through to **Release** (Bi-Monthly's schedule only becomes visible in the AR masterlist, not the computation summary itself, since it's a payment-*schedule* concern not a computation-*amount* concern).

**Expected schedule** (AR → Masterlist → this loan → Amortization Schedule), release date used as the anchor:
- **12 installments** (6 months × 2)
- First due date = release date **+ 15 days**
- Second due date = release date **+ 30 days**, and so on, every 15 days — **not** the 15th/30th of the calendar month (that's Salary/semi-monthly, a different frequency)
- Each installment ≈ half the monthly amortization amount, with the last one absorbing any rounding remainder so the total matches the total loan exactly

Example: release **Sep 1** → due dates **Sep 16, Oct 1, Oct 16, Oct 31, Nov 15, Nov 30, ...**

---

## 5. P4 — Quarterly / Two-Monthly (Dual-Line)

This is the one that was **broken and is now fixed** — it used to only accept exactly 12-month terms. Test both a term it always accepted and a term that used to be wrongly rejected.

### 5a. Quarterly, 12-month term (previously worked, should still work)

**Setup**: Loan schedule `Quarterly` (set at application creation). **Computation inputs**: Amount `100000`, Terms `12`, Addon months `0`, Interest `3`, Processing fee `10`.

Compute, then check the AR masterlist schedule after release:
- **4 due dates**, 3 months apart
- Each due date has **2 rows**: one `interest`-only row, one `principal` row (same due date)
- First 3 due dates: interest row only carries a balance; last due date: interest row + a principal row for the remaining principal

### 5b. Quarterly, 6-month term (**this is the regression test for the fix**)

Same setup, but **Terms `6`** at compute time.

**Expected**: this must now **succeed**, not throw "Quarterly loans must be 12-month terms". The read-only "Loan schedule" hint should show: *"Terms must be divisible by 3 (e.g. 6, 9, 12 months)..."*. Schedule after release: **2 due dates**, 3 months apart, each with an interest row + principal row.

### 5c. Quarterly, invalid term (should still correctly reject)

Terms `7` (not divisible by 3) → clicking Compute should show a clear validation error (*"Quarterly terms must be divisible by 3 (e.g. 6, 9, or 12 months)"*) **before** it submits — caught client-side.

### 5d. Two-monthly, 4-month term (previously impossible, now works)

**Setup**: Loan schedule `Two-monthly` (set at application creation). Terms `4` (or `6`, `8`, `10`) at compute time → should succeed, showing a hint about divisibility by 2. Terms `5` → should be rejected with a clear message.

---

## 6. P5 — Daily Interest

This one was **completely reimplemented** — it used to silently generate 30-90 wrong installments; now it's a single manually-dated payment.

**Setup**: at application creation — Segment `SME`, **Loan schedule `Daily`**, Collateral `Clean (no collateral)`.

**Computation inputs**:
| Field | Value |
|---|---|
| Amount | `100000` |
| Interest | `3` |
| Terms | any value (doesn't drive the math for Daily) |

The Computation screen should show "Loan schedule: Daily" as read-only text, plus a new **Payment date** field (date picker) that only appears for this schedule type, with a hint: *"Single payment — interest accrues per actual day to the payment date below."*

Set **Release date** to `2026-08-20` (if the form lets you set it) and **Payment date** to `2026-08-25` (5 days later).

Click **Compute** without a payment date first — **expected**: blocked with *"Payment date is required for Daily Interest loans."*

Now fill in the payment date and Compute.

**Expected output**:
| Field | Expected |
|---|---|
| Total Interest | **₱500.00** |
| Monthly Amortization / Total Due | **₱100,500.00** |
| First payment date | `2026-08-25` (exactly what you typed, not a derived date) |

**After release**: AR masterlist schedule should show **exactly 1 installment**, due `2026-08-25`, amount ₱100,500.00 — not a series of daily payments.

**Second example** to double-check the day-counting: same setup but Payment date `2026-08-27` (7 days) → Total Interest should be **₱700.00**, Total Due **₱100,700.00**.

---

## 7. Committee override — schedule type

**Setup**: any SME application from P2–P5 above, sitting at `for_approval` or `negotiating_terms`.

1. Open it in the **Committee** view. The "Loan schedule" field on the Computation panel should now be an **editable dropdown** (unlike CSA's read-only text), pre-filled with whatever the application was created with (or the last override, if one already happened).
2. Change it to a different schedule (e.g. from `Quarterly` to `Regular (Monthly)`) and submit an override.
3. **Expected**: the new computation reflects the changed schedule (check `payment_frequency` on the resulting computation, or just look at the recomputed totals — Quarterly's dual-line interest+principal split should disappear if you switched to Regular).
4. Submit a *different* override that doesn't touch the schedule field at all (e.g. just a new amount) — **expected**: the schedule type from the previous step is preserved, not silently reset to `Regular (Monthly)`.

---

## 8. Regression pass — confirm nothing else moved

Run through one ordinary loan of each pre-existing type and confirm they're byte-identical to before:

1. **SME, Clean, Regular (Monthly — the default, no Loan schedule change needed)**: Amount ₱100,000, Terms 6, Addon 0, Interest 3%, PF 10% → Principal ₱110,000, Monthly ₱21,633.33 (same as the P1 regression check above).
2. **Individual, Clean, Salary**: any amount/terms → frequency auto-resolves to Semi-monthly, schedule alternates 15th/end-of-month, unaffected by any of this work. No "Loan schedule" field appears anywhere for Individual.
3. **Seafarer**: any loan type → no "Loan schedule" field at application creation, no schedule-type control on the Computation screen at all (always monthly/semi-monthly, as before).
