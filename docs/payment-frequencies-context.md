# Payment Frequencies - Context & Background

## What This Document Is About

This document explains the missing payment frequency features in the Loanstar loan management system. It provides context for understanding what needs to be built and why.

---

## The Situation

### What We Have Now

The Loanstar system is a loan management platform used by a lending company in the Philippines. Right now, the system can handle **3 types of payment schedules**:

1. **SME (Monthly)** - Borrowers pay once per month. The system calculates fees by adding them on top of the loan amount (called "gross-up method"). For example, if someone wants ₱100,000, the system adds ₱10,000 in fees, making the principal ₱110,000.

2. **MPL (Monthly)** - Same as SME but for individual borrowers instead of businesses. Uses the same monthly payment and gross-up calculation.

3. **Salary Loan (Semi-Monthly)** - Borrowers pay twice per month on fixed dates: the 15th and the 30th. The monthly payment is split in half. For example, if the monthly payment is ₱20,000, they pay ₱10,000 on the 15th and ₱10,000 on the 30th.

### The Problem

The client has been using an Excel calculator that supports **8 different payment types**, but we only built 3 of them. This means:

- We're missing 5 payment frequency types that the client needs
- One payment type (Auto/REM) is using the wrong calculation formula
- The client cannot serve certain types of borrowers because the system doesn't support their payment needs
- Some borrowers are being charged the wrong interest amounts

---

## What's Missing

### 1. Auto/REM Loans - Currently Using WRONG Calculation ⚠️

**What it is**: Auto loans (for car financing) and REM loans (real estate mortgages) are loans where the borrower puts up collateral. These should use a different calculation method than regular SME loans.

**The problem**: Right now, the system treats Auto and REM loans exactly like SME loans, using the "gross-up" method. But they should use the "net method" instead.

**Why it matters**: This means every Auto and REM loan is calculating the wrong interest amount. Borrowers are being charged more interest than they should be.

**How it should work**:
- **SME Method (Gross-up)**: If you want ₱100,000, the system adds ₱10,000 fees on top, so the principal becomes ₱110,000. Interest is calculated on ₱110,000.
- **Auto/REM Method (Net)**: If you want ₱100,000, the principal stays at ₱100,000. Fees are subtracted from what you receive. Interest is calculated on ₱100,000 (not ₱110,000).

**The difference**: For a ₱100,000 loan at 3% monthly for 6 months:
- SME: Monthly payment = ₱21,633 (interest on ₱110,000)
- Auto/REM: Monthly payment = ₱19,667 (interest on ₱100,000)
- **Difference: ₱1,966 per month** (9% more than it should be!)

**Where the code is**: The system currently routes all SME and Individual loans through the same calculation in `src/lib/computation/sme.ts`. We need to detect when the loan has collateral (Auto or REM) and route it to a different calculation in `src/lib/computation/sf.ts` instead.

---

### 2. Invoice Financing - Completely Missing ❌

**What it is**: A special loan product for businesses that sell to customers (like government) who take a long time to pay. The business needs cash NOW, so they borrow against their unpaid invoice.

**Why it's different**: 
- Payments are **weekly** (not monthly)
- Interest rate **increases each month** if not paid
- Maximum **3 months** of interest payments allowed
- After 3 months, the full principal becomes due immediately

**How it works**:
- **Month 1**: Interest is 1% per week
- **Month 2**: Interest increases to 2% per week
- **Month 3**: Interest increases to 2.5% per week
- **After 3 months**: Must pay back the full ₱100,000 principal + 5% penalty

**Example timeline**:
```
Release: Aug 20, ₱100,000

Week 1 (Aug 27): Pay ₱1,000 (1%)
Week 2 (Sep 3):  Pay ₱1,000 (1%)
Week 3 (Sep 10): Pay ₱1,000 (1%)
Week 4 (Sep 17): Pay ₱1,000 (1%)
Total Month 1: ₱4,000

Week 5 (Sep 24): Pay ₱2,000 (2% - rate went up!)
Week 6 (Oct 1):  Pay ₱2,000 (2%)
Week 7 (Oct 8):  Pay ₱2,000 (2%)
Week 8 (Oct 15): Pay ₱2,000 (2%)
Total Month 2: ₱8,000

Week 9 (Oct 22):  Pay ₱2,500 (2.5% - rate went up again!)
Week 10 (Oct 29): Pay ₱2,500 (2.5%)
Week 11 (Nov 5):  Pay ₱2,500 (2.5%)
Week 12 (Nov 12): Pay ₱2,500 (2.5%)
Total Month 3: ₱10,000

After Nov 19: Must pay ₱100,000 principal + ₱5,000 penalty = ₱105,000
```

**Why it matters**: This is a complete product line that brings in revenue. Without it, the company cannot serve businesses that need working capital. These businesses will go to competitors instead.

**What needs to be built**: A new computation engine that generates weekly payment schedules with escalating interest rates. This doesn't exist anywhere in the codebase right now.

---

### 3. Bi-Monthly (Every 15 Days) - Completely Missing ❌

**What it is**: A payment schedule where the borrower pays every 15 days, counting from the release date. This is different from Salary loans.

**The confusion**: People think this is the same as Salary loans (15th/30th), but it's NOT:
- **Salary Loan**: Always pays on the 15th and 30th of each month (calendar-based)
- **Bi-Monthly**: Pays every 15 days from release date (rolling dates)

**Example to show the difference**:
```
Release: Aug 20
Monthly Payment: ₱20,000

SALARY LOAN (calendar-based):
- Aug 30 = ₱10,000 (end of month)
- Sep 15 = ₱10,000 (15th)
- Sep 30 = ₱10,000 (end of month)
- Oct 15 = ₱10,000 (15th)

BI-MONTHLY (rolling 15 days):
- Sep 4  = ₱10,000 (20 + 15 days)
- Sep 19 = ₱10,000 (20 + 30 days)
- Oct 4  = ₱10,000 (20 + 45 days)
- Oct 19 = ₱10,000 (20 + 60 days)
```

**How it works**: Take the release date and keep adding 15 days for each payment. The monthly payment amount is split in half.

**Why it matters**: Some businesses have cash flow that comes in every 2 weeks but not on fixed calendar dates. They need a rolling schedule that matches their actual cash flow pattern.

**What needs to be built**: A schedule generator that creates payments every 15 days from the release date (not calendar-based like Salary loans).

---

### 4. Quarterly/2-Month - Completely Missing ❌

**What it is**: Payment schedules where the borrower pays every 2 or 3 months, but with a special twist: they only pay interest for most payments, then pay all the principal at the end.

**Two variants**:

#### **2-Month Frequency**
Pay every 2 months. Terms must be divisible by 2 (like 4, 6, 8, 10, 12 months).

**Example (6-month loan, ₱100,000 at 3% monthly)**:
```
Payment 1 (Oct 20): ₱6,000 (interest only for 2 months)
Payment 2 (Dec 20): ₱6,000 (interest only for 2 months)
Payment 3 (Feb 20): ₱6,000 (interest) + ₱100,000 (principal)
```

#### **Quarterly (3-Month) Frequency**
Pay every 3 months. Terms must be divisible by 3 (like 6, 9, 12 months).

**Example (12-month loan, ₱100,000 at 3% monthly)**:
```
Payment 1 (Nov 20): ₱9,000 (interest only for 3 months)
Payment 2 (Feb 20): ₱9,000 (interest only for 3 months)
Payment 3 (May 20): ₱9,000 (interest only for 3 months)
Payment 4 (Aug 20): ₱9,000 (interest) + ₱100,000 (principal)
```

**The special part**: On the last payment, the system generates **2 separate line items** with the same due date:
- One line for interest (₱9,000)
- One line for principal (₱100,000)

This is for accounting purposes so the company can track interest income separately from principal repayment.

**Why it matters**: Large loans (like ₱500,000+) are hard to pay monthly. Businesses prefer to pay quarterly to match their business cycles (like seasonal businesses). This gives them flexibility and makes larger loans possible.

**What needs to be built**: A schedule generator that creates quarterly or bi-monthly payments, calculates interest-only amounts, and generates dual line items for the final payment.

---

### 5. Daily Interest - Completely Missing ❌

**What it is**: Very short-term loans (usually 7-30 days) where interest is calculated per actual day instead of per month.

**How it works**:
- Convert monthly interest rate to daily rate: Monthly rate ÷ 30 = Daily rate
- Count actual days between release and payment
- Interest = Principal × Daily rate × Actual days

**Example**:
```
Principal: ₱100,000
Monthly Rate: 3%
Daily Rate: 3% ÷ 30 = 0.1% per day

Release: Aug 20
Payment: Aug 25 (5 days later)

Interest = ₱100,000 × 0.1% × 5 = ₱500
Total Payment = ₱100,500
```

**Different from monthly**: 
- Monthly: Would charge ₱3,000 for any time in August (full month)
- Daily: Only charges ₱500 for 5 days (fair for short-term)

**Why it matters**: Short-term loans (like check discounting or bridge loans) shouldn't charge a full month's interest if the borrower only needs money for a few days. Daily interest makes short-term loans fair and attractive.

**What needs to be built**: A calculator that takes a manual payment date, counts actual days, and generates a single payment (not a recurring schedule like monthly loans).

---

## Why This Matters

### Business Impact

**Right now**:
- ❌ Auto and REM borrowers are being overcharged (wrong formula)
- ❌ Cannot offer Invoice Financing (losing SME clients to competitors)
- ❌ Cannot offer flexible payment terms (Bi-Monthly, Quarterly)
- ❌ Cannot offer fair short-term loans (Daily interest)

**After fixing**:
- ✅ Auto and REM loans calculate correctly
- ✅ Can serve businesses needing working capital (Invoice Financing)
- ✅ Can offer flexible terms to attract larger loans (Quarterly)
- ✅ Can offer fair short-term loans (Daily interest)
- ✅ More competitive in the lending market

### Financial Impact

**Auto/REM wrong calculation**:
- If 100 Auto loans at ₱100k each are overcharged by ₱1,966/month for 6 months
- Overcharge = ₱1,179,600 (₱1.18 million)
- This is a compliance risk and reputation damage

**Missing Invoice Financing**:
- If the company could serve 20 SMEs per month at ₱100k each
- Potential monthly interest income = ₱440,000
- Lost annual revenue = ₱5.28 million

---

## How the System Works (Current Architecture)

### The Flow

1. **Borrower applies** → Chooses loan type (Seafarer, SME, Individual)
2. **CSA computes** → Enters loan amount, terms, rates
3. **System calculates** → Routes to correct formula based on loan type
4. **Schedule generates** → Creates payment due dates and amounts
5. **Loan released** → Borrower receives funds
6. **Payments tracked** → System tracks what's paid and what's owed

### The Code Structure

**Computation engines** (the math):
- `src/lib/computation/sme.ts` - SME gross-up formula (Loan + Fees = Principal)
- `src/lib/computation/sf.ts` - Seafarer net formula (Loan = Principal, Fees subtracted)

**Schedule generators** (the payment dates):
- `src/lib/ar/schedule.ts` - Creates payment schedule with due dates

**Routing logic** (which formula to use):
- `src/lib/csa/computation.ts` - Decides: "Is this SME? Is this Seafarer? Which formula should I use?"

**Database**:
- `computations` table - Stores the calculated amounts
- `amortization_schedules` table - Stores each payment due date and amount
- `payment_frequency` enum - Lists available payment types (currently only "monthly" and "semi_monthly")

### The Problem in the Code

Right now, the routing logic in `src/lib/csa/computation.ts` only checks the **segment** (Seafarer, SME, Individual):

```typescript
if (segment === "sme" || segment === "individual") {
  // Use SME formula for EVERYTHING
  computeSmeLoan()  // ← This is used for ALL SME/Individual loans
}
```

But it should ALSO check the **collateral type**:

```typescript
if (collateralType === "car_refinancing" || collateralType === "real_estate") {
  // Use NET method for Auto/REM
  computeSfLoan()  // ← Use this for collateral loans
} else if (segment === "sme" || segment === "individual") {
  // Use GROSS-UP method for clean loans
  computeSmeLoan()  // ← Use this for clean loans
}
```

---

## What Needs to Happen

### Priority 1: Fix Auto/REM (2-3 days) 🔴

**The task**: Change the routing logic to detect collateral and use the correct formula.

**Why urgent**: Production issue - wrong amounts being charged right now.

**What to modify**: Just the routing logic in `src/lib/csa/computation.ts`. Don't touch the actual computation formulas - they're correct. Just route Auto/REM to the right one.

---

### Priority 2: Invoice Financing (5-7 days) 🔴

**The task**: Build a new computation engine and schedule generator for weekly payments with escalating rates.

**Why urgent**: Complete product line missing, can't serve a whole market segment.

**What to build**:
- New file: `src/lib/computation/invoice.ts` (the weekly math)
- Update: `src/lib/ar/schedule.ts` (generate weekly schedule)
- Update: `src/lib/csa/computation.ts` (route to invoice when selected)
- Update: UI to let CSA select "Invoice Financing" payment type
- Update: Database to support "weekly" payment frequency

---

### Priority 3: Bi-Monthly (3 days) 🟡

**The task**: Add a schedule generator for rolling 15-day payments.

**Why important**: Some businesses need it, but not as critical as Invoice Financing.

**What to build**:
- New function in `src/lib/ar/schedule.ts`: `generateBiMonthlySchedule()`
- Update: Routing to use it when "bi_monthly" is selected
- Update: Database to support "bi_monthly" payment frequency

---

### Priority 4: Quarterly/2-Month (4 days) 🟡

**The task**: Add schedule generators for quarterly and 2-month frequencies with interest-only payments.

**Why important**: Needed for larger loans, but lower volume than weekly/monthly.

**What to build**:
- New function in `src/lib/ar/schedule.ts`: `generateQuarterlySchedule()`
- Logic to validate terms (must be divisible by 2 or 3)
- Logic to generate dual line items for final payment
- Update: Database to support "quarterly" and "two_monthly" frequencies

---

### Priority 5: Daily Interest (2 days) 🟢

**The task**: Build a calculator for short-term loans with daily interest.

**Why low priority**: Niche use case, not many borrowers need it.

**What to build**:
- New file: `src/lib/computation/daily.ts` (daily rate calculator)
- UI to let CSA enter manual payment date
- Logic to count actual days and calculate interest
- Update: Database to support "daily" payment frequency

---

## Success Criteria

After all implementations are done:

✅ Auto/REM loans calculate interest on the correct amount (net method)
✅ CSA can select "Invoice Financing" and system generates weekly schedule with escalating rates
✅ CSA can select "Bi-Monthly" and system generates rolling 15-day schedule
✅ CSA can select "Quarterly" and system generates interest-only + principal schedule
✅ CSA can select "Daily Interest" and system calculates per actual day
✅ All existing monthly and salary loans still work (nothing broken)
✅ All calculations match the Excel calculator output exactly
✅ Database stores all new payment frequency types
✅ Documents generate correctly for all payment types

---

## Testing Requirements

Each new payment type must be tested against real examples from the Excel calculator:

**Auto/REM Test**:
- Input: ₱100,000, 10% PF, 3% interest, 6 months
- Expected: Principal = ₱100,000, Monthly = ₱19,667
- Verify: Interest calculated on ₱100k (not ₱110k)

**Invoice Test**:
- Input: ₱100,000, 3 months
- Expected: Week 1-4 at 1%, Week 5-8 at 2%, Week 9-12 at 2.5%
- Verify: Total interest = ₱22,000

**Bi-Monthly Test**:
- Input: Release Aug 20, ₱20,000 monthly
- Expected: Payments Sep 4, Sep 19, Oct 4, Oct 19 (15-day intervals)
- Verify: Each payment = ₱10,000

**Quarterly Test**:
- Input: ₱100,000 at 3% monthly, 12 months, quarterly
- Expected: 3 payments of ₱9,000 interest + final ₱9,000 interest + ₱100,000 principal
- Verify: 4 payment dates, 3 months apart

**Daily Test**:
- Input: ₱100,000, 3% monthly, 5 days
- Expected: Interest = ₱500, Total = ₱100,500
- Verify: Daily rate = 0.1%, Interest = Principal × 0.1% × 5

---

## Source Documents

All business rules came from:

1. **Excel Calculator**: `Calculator SME.xlsm` - The client's actual working calculator
2. **Excel Extraction**: `sme-calculator-extraction.md` - Technical analysis of Excel formulas
3. **Client Transcription**: `transcription.md` (lines 900-1100) - Client explaining each payment type
4. **Implementation Brief**: `payment-frequency-implementation-brief.md` - Complete technical details

---

**This context document explains WHAT needs to be built and WHY. The implementation brief explains HOW to build it.**
