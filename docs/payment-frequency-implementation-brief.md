# Payment Frequency Implementation Brief
## Complete Context for AI Implementation Agent

---

## INTRODUCTION: WHAT IS THIS DOCUMENT?

This document provides everything an AI implementation agent needs to understand and build missing payment frequency features for the Loanstar loan management system. It explains the business context, technical requirements, and implementation details in natural language with code examples.

**Who should read this**: AI agents tasked with creating implementation plans or building payment frequency features.

**What you'll learn**: Why these features are needed, how they work in the client's Excel calculator, how the current system works, and exactly what needs to be built.

---

## PART 1: UNDERSTANDING THE BUSINESS CONTEXT

### What Is Loanstar?

Loanstar is a loan management system for a lending company in the Philippines. Think of it as the software that runs a lending business from start to finish. When a borrower wants to take a loan, this system handles everything from the initial application through to the final payment.

The system manages four main activities:

1. **Applications**: Borrowers submit loan applications through the system. They provide information about themselves, what type of loan they need, and how much they want to borrow.

2. **Computations**: The system calculates how much interest they'll pay, what fees are charged, and creates a payment schedule showing when each payment is due.

3. **Release**: Once approved, the system tracks the loan disbursement - when money is released to the borrower and what documents are signed.

4. **Collection**: Over the life of the loan, the system tracks payments as they come in, sends reminders when payments are due, and calculates penalties if payments are late.

### The Problem: Missing Payment Frequency Types

Here's where things get complicated. The lending company has been using an Excel spreadsheet calculator for years. This Excel calculator is sophisticated - it can create payment schedules in eight different ways, depending on what the borrower needs. For example, some businesses prefer to pay weekly, others prefer quarterly, and individuals might prefer twice-monthly payments on paydays.

When the new system was built, it only implemented three of these eight payment methods. This creates real problems:

**Problem 1 - Wrong Calculations**: The system is actually calculating Auto and Real Estate Mortgage loans INCORRECTLY. It's using the wrong mathematical formula, which means borrowers are being charged the wrong interest amounts. This is urgent because it affects money and could cause compliance issues.

**Problem 2 - Missing Products**: Invoice Financing is a complete product line that doesn't exist in the system at all. Invoice Financing is when a business borrows money against unpaid customer invoices. They need to pay weekly, not monthly. Without this feature, the lending company cannot serve these business customers.

**Problem 3 - Inflexible Terms**: The system cannot offer bi-monthly, quarterly, or daily payment schedules. This makes it less competitive because other lenders can offer more flexible payment terms.

### Why This Matters

This isn't just about adding features to check boxes. There are real business consequences:

**Financial Impact**: The company is losing potential borrowers who need payment schedules the system doesn't support. These borrowers go to competitors instead. Additionally, wrong calculations mean either the company is losing money (if they're charging too little interest) or they're at legal risk (if they're charging too much).

**Operational Impact**: Loan officers are still using the old Excel calculator and manually entering the results into the system, which defeats the purpose of having automation. This wastes time and introduces human error.

**Compliance Impact**: Financial lending is heavily regulated. Using the wrong interest calculation formulas could violate lending laws or create audit problems.

The goal of this implementation is to bring the system to feature parity with the Excel calculator while ensuring all calculations are mathematically correct.


---

## PART 2: HOW THE CURRENT SYSTEM WORKS

To understand what needs to be built, you first need to understand how the system currently works. Let me walk you through the entire loan computation flow.

### The Journey of a Loan Through the System

**Step 1: Borrower Application**

When someone wants a loan, they start by filling out an application. This happens in one of two ways: either the borrower fills it out themselves through a self-service portal, or a loan agent (called CSA - Credit and Sales Associate) helps them fill it out.

During this step, some critical decisions are made that will affect how the loan is calculated:

- **Segment**: Is this a Seafarer (ship crew member), SME (business), or Individual (person)?
- **Loan Type**: If it's an individual, are they applying for a Multi-Purpose Loan or a Salary Loan?
- **Collateral**: Is this a clean loan (no collateral), or are they pledging a car or property?

These choices get stored in the database in a table called `loan_applications`. The important columns are `segment`, `individual_loan_type`, and `collateral_type`.

**Step 2: Loan Computation**

After the application is submitted, it moves to the CSA for computation. This is where the system calculates:

- How much the principal will be (the base loan amount)
- How much interest they'll pay over the life of the loan
- What fees are charged (processing fee, documentation stamp, notary, etc.)
- What the monthly payment amount will be
- When each payment is due

Here's where the routing happens. The system looks at what was selected in Step 1 and decides which calculation formula to use. Currently, there are only two calculation engines:

1. **SME Engine** (`src/lib/computation/sme.ts`): Used for business loans and most individual loans. This uses something called the "gross-up method" where fees are added on top of the loan amount to create the principal.

2. **Seafarer Engine** (`src/lib/computation/sf.ts`): Used for seafarer loans. This uses the "net method" where the principal stays as the loan amount and fees are subtracted from what the borrower receives.

The problem is that Auto and Real Estate loans currently route to the SME engine, but they should actually use the net method like Seafarer loans do.

**Step 3: Payment Schedule Generation**

Once the computation is done, the system generates a payment schedule. This is a list of all the future payments the borrower needs to make, including the date each payment is due and how much is due.

This happens in `src/lib/ar/schedule.ts` in a function called `generateAmortizationSchedule()`. Currently, this function can only create two types of schedules:

1. **Monthly schedules**: One payment per month, due on the same day each month as the release date.

2. **Semi-monthly schedules**: Two payments per month on the 15th and 30th. This is only used for Salary Loans.

The schedule gets stored in the database in the `amortization_schedules` table. Each row represents one future payment with its due date and amount.

**Step 4: The Rest of the Loan Lifecycle**

After computation, the loan goes through committee approval, document generation, fund release, and eventually collection. These parts work fine and don't need changes for this project.

### How the System Decides Which Formula to Use

This is crucial to understand because it's where we'll add the new payment frequency logic. Let me trace through the actual code flow:

When the CSA clicks "Compute" in the UI, it sends a request to the backend that ends up calling `persistComputation()` in `src/lib/csa/computation.ts`. This function is the traffic controller that decides which calculation engine to use.

Here's the current logic (simplified):

```typescript
if (segment === "sme" || segment === "individual") {
  // Use SME calculation (gross-up method)
  const sme = computeSmeLoan({
    loanDesired: input.amount,
    terms: input.terms,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    // ... more parameters
  });
  result = sme;
} else {
  // Use Seafarer calculation (net method)
  const sf = computeSfLoan({
    inputMode: input.inputMode,
    amount: input.amount,
    terms: input.terms,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    securityFeeRate: input.securityFeeRate,
    // ... more parameters
  });
  result = sf;
}
```

Notice that it only checks the segment. It doesn't check the collateral type or the loan type. This is why Auto and REM loans are calculated wrong - they're treated as SME loans just because they're in the SME segment, even though they should use a different formula.

### What Works Currently

Let me describe the three payment types that work correctly so you understand the patterns to follow:

**SME (Standard Monthly Enterprise Loans)**

These are business loans with monthly payments. The calculation uses the gross-up method, which means:

1. Borrower says: "I want ₱100,000"
2. System calculates: "The processing fee is 10%, which is ₱10,000"
3. System sets principal: ₱110,000 (loan amount + fees)
4. Interest is calculated on: ₱110,000
5. Borrower receives: ₱100,000 (after fees are deducted)

The first payment is due one month after the release date, on the same day of the month. If released on January 15, the first payment is February 15.

This is implemented correctly in `src/lib/computation/sme.ts` and doesn't need changes.

**MPL (Multi-Purpose Loans)**

These are loans for individuals that work exactly like SME loans. Same calculation, same monthly schedule. The only difference is these are for personal use rather than business use.

MPL uses the same SME calculation engine and the same monthly schedule logic. It works correctly.

**Salary Loans (Semi-Monthly)**

These are loans for salaried employees who get paid twice a month. Instead of one monthly payment, they make two payments per month - one on the 15th and one on the 30th (end of month).

The calculation is the same as SME (gross-up method), but the monthly payment amount is divided by 2. Instead of paying ₱20,000 once a month, they pay ₱10,000 on the 15th and ₱10,000 on the 30th.

The first payment date follows a special rule based on when the loan is released:
- If released between the 1st and 15th: first payment is the 30th of that same month
- If released between the 16th and 31st: first payment is the 15th of the next month

This ensures the borrower has received at least one paycheck before their first payment is due.

This is implemented correctly in `src/lib/computation/release-date.ts` (the date logic) and `src/lib/ar/schedule.ts` (the schedule generation with payments alternating between 15th and end-of-month).



---

## 3. BUSINESS REQUIREMENTS

### From Client Excel Calculator

**Source**: `Calculator SME.xlsm` + Client transcription (`transcription.md` lines 900-1100)

All business rules were extracted from:
1. **Excel formulas** (parsed from OOXML)
2. **Client meeting transcription** (August 25, 2026)
3. **Verified against 35 real loans** in Excel data register

### Priority Order

Based on business impact and urgency:

```
🔴 P1 (URGENT - Fix in Sprint 1)
├── Auto/REM Net Method Fix (2-3 days)
└── Invoice Financing (5-7 days)

🟡 P2 (IMPORTANT - Sprint 2)
├── Bi-Monthly (3 days)
└── Quarterly/2-Month (4 days)

🟢 P3 (NICE TO HAVE - Sprint 3)
└── Daily Interest (2 days)
```

---

## 4. TECHNICAL ARCHITECTURE

### Current Computation Flow

```
1. Borrower Application
   ↓
   File: src/app/borrower/applications/reloan/page.tsx
   Data: { segment, entityType, collateralType, individualLoanType }
   
2. CSA Computation
   ↓
   File: src/lib/csa/computation.ts
   Function: persistComputation()
   ↓
   Routing Logic:
   - IF segment === "sme" || "individual" → computeSmeLoan()
   - ELSE → computeSfLoan()
   
3. Schedule Generation
   ↓
   File: src/lib/ar/schedule.ts
   Function: generateAmortizationSchedule()
   ↓
   Routing Logic:
   - IF paymentFrequency === "semi_monthly" → advanceSemiMonthly()
   - ELSE → monthly schedule (addMonths)
   
4. Database Storage
   ↓
   Tables:
   - loan_applications (segment, collateral_type, individual_loan_type)
   - computations (payment_frequency, first_payment_date, terms)
   - amortization_schedules (installment_no, due_date, amount_due)
```

### Key Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/lib/computation/sme.ts` | SME gross-up calculation | No changes (keep as-is) |
| `src/lib/computation/sf.ts` | Seafarer net method | Use for Auto/REM |
| `src/lib/csa/computation.ts` | Computation routing | Add collateral-type detection |
| `src/lib/ar/schedule.ts` | Schedule generation | Add new frequency functions |
| `src/lib/computation/invoice.ts` | 🆕 NEW FILE | Invoice financing logic |
| `src/lib/computation/daily.ts` | 🆕 NEW FILE | Daily interest logic |
| `supabase/migrations/*.sql` | Database schema | Add new payment frequencies |

### Database Schema

**Current `payment_frequency` enum:**
```sql
CREATE TYPE payment_frequency AS ENUM ('monthly', 'semi_monthly');
```

**Required additions:**
```sql
ALTER TYPE payment_frequency ADD VALUE 'bi_monthly';
ALTER TYPE payment_frequency ADD VALUE 'quarterly';
ALTER TYPE payment_frequency ADD VALUE 'two_monthly';
ALTER TYPE payment_frequency ADD VALUE 'weekly';
ALTER TYPE payment_frequency ADD VALUE 'daily';
```

---

## 5. IMPLEMENTATION PRIORITIES

### 🔴 PRIORITY 1: Fix Auto/REM Net Method (2-3 days)

#### Why Urgent
- **Production issue**: Currently charging WRONG interest amounts
- **Compliance risk**: Incorrect calculations on active loans
- **Easy fix**: Net method calculation already exists in `sf.ts`

#### What to Do
1. **Detect collateral type** in `persistComputation()`
2. **Route to net method** when `collateralType === 'car_refinancing' || 'real_estate'`
3. **Keep SME method** for clean loans (no collateral)

#### How It Should Work

**Current (WRONG):**
```typescript
if (segment === "sme" || segment === "individual") {
  // ALWAYS uses SME gross-up, even for Auto/REM
  const sme = computeSmeLoan({ loanDesired: 100000 });
  // Result: principal = 110,000 (includes fees)
}
```

**Expected (CORRECT):**
```typescript
if (collateralType === "car_refinancing" || collateralType === "real_estate") {
  // Use NET method for Auto/REM
  const result = computeSfLoan({ 
    inputMode: "PRINCIPAL", 
    amount: 100000 
  });
  // Result: principal = 100,000 (fees deducted from net)
} else if (segment === "sme" || segment === "individual") {
  // Use GROSS-UP method for clean SME/Individual
  const sme = computeSmeLoan({ loanDesired: 100000 });
  // Result: principal = 110,000 (includes fees)
}
```

#### Mathematical Difference

**SME Gross-Up Method:**
```
Input: Loan Desired = ₱100,000
PF Rate: 10%

Step 1: Calculate PF Bundle
  PF Bundle = 100,000 × 10% = ₱10,000
  
Step 2: Calculate Principal
  Principal = 100,000 + 10,000 = ₱110,000
  
Step 3: Calculate Interest (3% monthly, 6 months)
  Interest = 110,000 × 3% × 6 = ₱19,800
  
Result:
  Principal: ₱110,000
  Interest: ₱19,800
  Total Loan: ₱129,800
  Monthly: ₱21,633.33
```

**Auto/REM Net Method:**
```
Input: Loan Amount = ₱100,000
PF Rate: 10%

Step 1: Principal stays the same
  Principal = ₱100,000
  
Step 2: Calculate fees FROM principal
  PF Bundle = 100,000 × (10% / 110%) = ₱9,090.91
  Doc Stamp = 100,000 × 0.75% = ₱750
  
Step 3: Calculate Interest (3% monthly, 6 months)
  Interest = 100,000 × 3% × 6 = ₱18,000
  
Step 4: Calculate Net Released
  Net = 100,000 - 9,090.91 - 750 = ₱90,159.09
  
Result:
  Principal: ₱100,000
  Interest: ₱18,000
  Total Loan: ₱118,000
  Monthly: ₱19,666.67
  Net Released: ₱90,159.09
```

**Difference**: ₱21,633 vs ₱19,667 = **₱1,966 per month** (9.1% difference!)

#### Files to Modify
- `src/lib/csa/computation.ts` (lines 259-286)
- `src/lib/committee/negotiation.ts` (if committee can override)
- Test files for Auto/REM scenarios

#### Success Criteria
- [ ] Auto loan with ₱100k principal calculates interest on ₱100k (not ₱110k)
- [ ] REM loan with ₱100k principal calculates interest on ₱100k (not ₱110k)
- [ ] SME clean loan still uses gross-up (existing behavior preserved)
- [ ] All existing tests still pass
- [ ] New tests for Auto/REM net method pass

---

### 🔴 PRIORITY 2: Invoice Financing (5-7 days)

#### Why Urgent
- **Missing product line**: Complete revenue stream unavailable
- **Client expectation**: Excel calculator supports it, system should too
- **Business need**: SMEs require working capital financing

#### What to Do
Create complete Invoice Financing implementation with:
1. **Weekly payment schedule**
2. **Escalating interest rates** (1% → 2% → 2.5%)
3. **3-month maximum term**
4. **Principal due after 3 months**

#### Business Rules (From Transcription)

**Source**: `transcription.md` lines 2:32:43 - 2:36:30

```
Client: "Invoice, weekly yung computation ng invoice. Weekly yung singilan 
hanggang 3 months. Sa first month, 1% lang ang interest niya weekly. 
Sa second month, 2% ang interest. Pagdating dito, 2.5%. Hanggang 3 months 
lang ang maximum term. Pagdating sa ika-4 month, wala na. Ang susunod 
sisinginin sa'yo itong principal plus 5% penalty."
```

**Translation**:
- Invoice financing is weekly charging up to 3 months
- First month: 1% weekly interest
- Second month: 2% weekly interest
- Third month: 2.5% weekly interest
- Maximum 3 months term
- After 4th month: Principal + 5% penalty becomes due

#### How It Should Work

**Timeline Example**:
```
Release: Aug 20, 2026
Principal: ₱100,000

Week 1 (Aug 27): Pay ₱1,000 (1% of principal)
Week 2 (Sep 3):  Pay ₱1,000 (1%)
Week 3 (Sep 10): Pay ₱1,000 (1%)
Week 4 (Sep 17): Pay ₱1,000 (1%)
  Subtotal Month 1: ₱4,000

Week 5 (Sep 24): Pay ₱2,000 (2% - rate increases!)
Week 6 (Oct 1):  Pay ₱2,000 (2%)
Week 7 (Oct 8):  Pay ₱2,000 (2%)
Week 8 (Oct 15): Pay ₱2,000 (2%)
  Subtotal Month 2: ₱8,000

Week 9 (Oct 22):  Pay ₱2,500 (2.5% - rate increases!)
Week 10 (Oct 29): Pay ₱2,500 (2.5%)
Week 11 (Nov 5):  Pay ₱2,500 (2.5%)
Week 12 (Nov 12): Pay ₱2,500 (2.5%)
  Subtotal Month 3: ₱10,000

Total Interest Paid: ₱22,000

After Nov 19 (Week 13):
  Principal due: ₱100,000
  If not paid: Add ₱5,000 penalty (5%)
  Total due: ₱105,000
```

#### Technical Implementation

**Create New File**: `src/lib/computation/invoice.ts`

```typescript
export type InvoiceComputeInput = {
  principal: number;
  terms: number; // Must be 1, 2, or 3 (months)
  releaseDate: Date;
};

export type InvoiceComputeResult = {
  principal: number;
  terms: number;
  weeklySchedule: Array<{
    weekNo: number;
    dueDate: string;
    interestRate: number; // 0.01, 0.02, or 0.025
    amountDue: number;
    month: number; // 1, 2, or 3
  }>;
  totalInterest: number;
  principalDueDate: string;
  principalAmount: number;
};

export function computeInvoiceLoan(
  input: InvoiceComputeInput
): InvoiceComputeResult {
  // Validate terms
  if (input.terms < 1 || input.terms > 3) {
    throw new Error("Invoice financing maximum 3 months");
  }
  
  // Define weekly rates per month
  const weeklyRates = [0.01, 0.02, 0.025]; // 1%, 2%, 2.5%
  
  const schedule = [];
  let totalInterest = 0;
  let weekNo = 0;
  
  // Generate weekly installments
  for (let month = 1; month <= input.terms; month++) {
    const monthRate = weeklyRates[month - 1];
    const weeksInMonth = 4; // Simplified to 4 weeks per month
    
    for (let week = 0; week < weeksInMonth; week++) {
      weekNo++;
      const dueDate = addDays(input.releaseDate, weekNo * 7);
      const amountDue = input.principal * monthRate;
      
      schedule.push({
        weekNo,
        dueDate: formatDate(dueDate),
        interestRate: monthRate,
        amountDue,
        month,
      });
      
      totalInterest += amountDue;
    }
  }
  
  // Principal due after last week
  const principalDueDate = addDays(
    input.releaseDate, 
    (input.terms * 4 + 1) * 7
  );
  
  return {
    principal: input.principal,
    terms: input.terms,
    weeklySchedule: schedule,
    totalInterest,
    principalDueDate: formatDate(principalDueDate),
    principalAmount: input.principal,
  };
}
```

**Integrate into Computation Flow**:

File: `src/lib/csa/computation.ts`

```typescript
export type PersistComputationInput = {
  // ... existing fields ...
  paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "daily";
};

export async function persistComputation(
  supabase: SupabaseClient,
  input: PersistComputationInput,
) {
  // ... existing logic ...
  
  // NEW: Detect Invoice Financing
  if (input.paymentFrequency === "weekly") {
    // Use invoice computation
    const invoiceResult = computeInvoiceLoan({
      principal: input.amount,
      terms: input.terms, // Must be 1-3 months
      releaseDate: new Date(input.releaseDate),
    });
    
    // Store weekly schedule
    // ... save to database ...
  }
  
  // ... rest of existing logic ...
}
```

**Add UI Selector**:

File: `src/components/csa/ComputationPanel.tsx`

```typescript
// Add payment frequency selector
<Select
  label="Payment Frequency"
  value={paymentFrequency}
  onChange={(e) => setPaymentFrequency(e.target.value)}
>
  <option value="monthly">Monthly</option>
  <option value="semi_monthly">Semi-Monthly (15th/30th)</option>
  <option value="weekly">Weekly (Invoice Financing)</option>
  <option value="bi_monthly">Bi-Monthly (Every 15 days)</option>
  <option value="quarterly">Quarterly</option>
  <option value="daily">Daily Interest</option>
</Select>

{paymentFrequency === 'weekly' && (
  <div className="alert alert-warning">
    <p>Invoice Financing:</p>
    <ul>
      <li>Weekly interest payments (1% → 2% → 2.5%)</li>
      <li>Maximum 3 months</li>
      <li>Principal due after interest period</li>
    </ul>
  </div>
)}
```

#### Files to Create/Modify
- 🆕 `src/lib/computation/invoice.ts` (new file)
- 🆕 `src/lib/computation/__tests__/invoice.test.ts` (new test file)
- ✏️ `src/lib/csa/computation.ts` (add invoice routing)
- ✏️ `src/lib/ar/schedule.ts` (add weekly schedule generation)
- ✏️ `src/components/csa/ComputationPanel.tsx` (add UI selector)
- ✏️ `supabase/migrations/xxx_add_weekly_payment_frequency.sql` (DB migration)

#### Success Criteria
- [ ] Can select "Weekly (Invoice Financing)" payment frequency
- [ ] Terms limited to 1-3 months with validation error
- [ ] Week 1-4 shows 1% interest rate
- [ ] Week 5-8 shows 2% interest rate
- [ ] Week 9-12 shows 2.5% interest rate
- [ ] Principal installment generated after last week
- [ ] Total interest matches Excel calculation
- [ ] Schedule stores correctly in database

---

### 🟡 PRIORITY 3: Bi-Monthly (3 days)

#### What to Do
Add "every 15 days" payment frequency (rolling schedule).

#### Business Rules (From Transcription)

**Source**: `transcription.md` lines 2:45:00 - 2:48:30

```
Client: "BI-MONTHLY. Babayaran niya yung loan ng 1530. Dalawang beses sa 
isang buwan siya magbabayad. Hatiin mo lang. Ang first mong payment is 
magbilang ka ng 15 days after release. First payment mo, 820 plus 15. 
Next month, 9-5. Tapos, sumunod is 9-20. Ang amortisation, hatiin mo 
lang din ng dalawa."
```

**Translation**:
- Borrower pays the loan twice per month (15th and 30th pattern)
- Split the payment in half
- First payment: count 15 days after release
- Example: Release Aug 20 → First payment Sep 4 (20+15)
- Next payment: Sep 19 (20+30)
- Amortization: split monthly amount by 2

#### Key Difference from Salary Loan

| Feature | Salary Loan | Bi-Monthly |
|---------|-------------|------------|
| Schedule | Calendar-based (15th, 30th) | Rolling (release + 15, +30, +45 days) |
| Example (Release Aug 20) | Aug 30, Sep 15, Sep 30, Oct 15 | Sep 4, Sep 19, Oct 4, Oct 19 |
| Use Case | Salaried employees | Business with rolling cash flow |

#### How It Should Work

**Example Calculation**:
```
Release: Aug 20
Terms: 6 months
Monthly Amortization: ₱20,000
Bi-Monthly Amount: ₱10,000

Schedule:
1.  Sep 4  (Day 15)  = ₱10,000
2.  Sep 19 (Day 30)  = ₱10,000
3.  Oct 4  (Day 45)  = ₱10,000
4.  Oct 19 (Day 60)  = ₱10,000
5.  Nov 3  (Day 75)  = ₱10,000
6.  Nov 18 (Day 90)  = ₱10,000
7.  Dec 3  (Day 105) = ₱10,000
8.  Dec 18 (Day 120) = ₱10,000
9.  Jan 2  (Day 135) = ₱10,000
10. Jan 17 (Day 150) = ₱10,000
11. Feb 1  (Day 165) = ₱10,000
12. Feb 16 (Day 180) = ₱10,000

Total: 12 payments (6 months × 2)
```

#### Technical Implementation

File: `src/lib/ar/schedule.ts`

```typescript
export function generateBiMonthlySchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  totalLoan?: number;
}): AmortizationInstallment[] {
  const release = input.releaseDate instanceof Date 
    ? input.releaseDate 
    : new Date(input.releaseDate);
  
  const installments: AmortizationInstallment[] = [];
  const biMonthlyAmount = halfUp(input.monthlyAmortization / 2);
  const totalInstallments = input.terms * 2; // 6 months = 12 payments
  
  for (let i = 0; i < totalInstallments; i++) {
    const dueDate = new Date(release);
    dueDate.setDate(dueDate.getDate() + (i + 1) * 15);
    
    let amountDue = biMonthlyAmount;
    
    // Last installment adjustment for rounding
    if (i === totalInstallments - 1 && input.totalLoan != null) {
      const prior = halfUp(biMonthlyAmount * (totalInstallments - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(dueDate),
      amountDue,
    });
  }
  
  return installments;
}
```

Integrate into `generateAmortizationSchedule()`:

```typescript
export function generateAmortizationSchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  addonMonths: number;
  dueDay?: number;
  totalLoan?: number;
  firstPaymentDate?: string | Date | null;
  paymentFrequency?: "monthly" | "semi_monthly" | "bi_monthly";
}): AmortizationInstallment[] {
  
  // ... existing code ...
  
  if (input.paymentFrequency === "bi_monthly") {
    return generateBiMonthlySchedule({
      terms: input.terms,
      monthlyAmortization: input.monthlyAmortization,
      releaseDate: input.releaseDate,
      totalLoan: input.totalLoan,
    });
  }
  
  // ... rest of existing logic ...
}
```

#### Files to Modify
- ✏️ `src/lib/ar/schedule.ts` (add generateBiMonthlySchedule function)
- ✏️ `src/lib/csa/computation.ts` (add bi_monthly routing)
- ✏️ `src/components/csa/ComputationPanel.tsx` (add UI selector)
- 🆕 `src/lib/ar/__tests__/schedule-bimonthly.test.ts` (test file)
- ✏️ `supabase/migrations/xxx_add_bi_monthly_frequency.sql` (DB migration)

#### Success Criteria
- [ ] Can select "Bi-Monthly (Every 15 days)" frequency
- [ ] First payment is exactly 15 days after release
- [ ] Second payment is exactly 30 days after release
- [ ] Total installments = terms × 2
- [ ] Amount per installment = monthly ÷ 2
- [ ] Last installment adjusts for rounding

---

### 🟡 PRIORITY 4: Quarterly/2-Month (4 days)

#### What to Do
Add interest-only payment frequencies for every 2 or 3 months.

#### Business Rules (From Transcription)

**Source**: `transcription.md` lines 2:50:22 - 2:53:37

```
Client: "2 months tsaka quarterly. Divisible lang siya ng 2 ang allowed. 
Every 2 months. Ang lalabas sa biller ay interest lang sa unang mga buwan. 
Sa ikatlong month, interest plus principal. Pag quarterly, divisible by 
threes. Per quarter yan."
```

**Translation**:
- 2-month and quarterly frequencies
- Terms must be divisible by 2 (for 2-month) or 3 (for quarterly)
- Early payments: interest only
- Last payment: interest + principal (as 2 separate checks)

#### How It Should Work

**2-Month Frequency Example**:
```
Terms: 6 months
Principal: ₱100,000
Monthly Interest: ₱3,000

Schedule (2-month payments):
1. Month 2 (Oct 20): ₱6,000 (interest only for 2 months)
2. Month 4 (Dec 20): ₱6,000 (interest only for 2 months)
3. Month 6 (Feb 20): ₱6,000 (interest) + ₱100,000 (principal)
   - Shown as 2 separate line items in schedule
```

**Quarterly (3-Month) Example**:
```
Terms: 12 months
Principal: ₱100,000
Monthly Interest: ₱3,000

Schedule (quarterly payments):
1. Month 3 (Nov 20):  ₱9,000 (interest only for 3 months)
2. Month 6 (Feb 20):  ₱9,000 (interest only for 3 months)
3. Month 9 (May 20):  ₱9,000 (interest only for 3 months)
4. Month 12 (Aug 20): ₱9,000 (interest) + ₱100,000 (principal)
```

#### Technical Implementation

File: `src/lib/ar/schedule.ts`

```typescript
export function generateQuarterlySchedule(input: {
  terms: number;
  principal: number;
  interestRate: number;
  releaseDate: string | Date;
  firstPaymentDate: string | Date;
  frequencyMonths: 2 | 3; // 2-month or Quarterly
}): AmortizationInstallment[] {
  // Validate terms divisible by frequency
  if (input.terms % input.frequencyMonths !== 0) {
    throw new Error(
      `Terms must be divisible by ${input.frequencyMonths} for this payment frequency`
    );
  }
  
  const numPayments = input.terms / input.frequencyMonths;
  const interestPerMonth = input.principal * input.interestRate;
  const interestPerPayment = interestPerMonth * input.frequencyMonths;
  
  const firstPayment = input.firstPaymentDate instanceof Date
    ? input.firstPaymentDate
    : new Date(input.firstPaymentDate);
  
  const installments: AmortizationInstallment[] = [];
  
  for (let i = 0; i < numPayments; i++) {
    const dueDate = new Date(firstPayment);
    dueDate.setMonth(dueDate.getMonth() + i * input.frequencyMonths);
    
    if (i < numPayments - 1) {
      // Interest-only payment
      installments.push({
        installmentNo: i + 1,
        dueDate: formatDateLocal(dueDate),
        amountDue: halfUp(interestPerPayment),
      });
    } else {
      // Last payment: Interest + Principal (as 2 separate line items)
      // But store as 2 installments with same due date
      installments.push(
        {
          installmentNo: i + 1,
          dueDate: formatDateLocal(dueDate),
          amountDue: halfUp(interestPerPayment),
          // Mark as interest-only for display purposes
        },
        {
          installmentNo: i + 1, // Same installment number
          dueDate: formatDateLocal(dueDate),
          amountDue: halfUp(input.principal),
          // Mark as principal for display purposes
        }
      );
    }
  }
  
  return installments;
}
```

**Note**: The system will need to handle "dual installments" for the last payment (interest + principal on same date).

#### Files to Modify
- ✏️ `src/lib/ar/schedule.ts` (add generateQuarterlySchedule)
- ✏️ `src/lib/csa/computation.ts` (add quarterly/two_monthly routing)
- ✏️ `src/components/csa/ComputationPanel.tsx` (add UI selector + validation)
- 🆕 `src/lib/ar/__tests__/schedule-quarterly.test.ts` (test file)
- ✏️ `supabase/migrations/xxx_add_quarterly_frequencies.sql` (DB migration)

#### Success Criteria
- [ ] Can select "2-Month" or "Quarterly" frequency
- [ ] Terms validation: must be divisible by 2 or 3
- [ ] First N-1 payments are interest-only
- [ ] Last payment has 2 line items (interest + principal)
- [ ] Interest calculation accounts for full term
- [ ] Payment dates match frequency (every 2 or 3 months)

---

### 🟢 PRIORITY 5: Daily Interest (2 days)

#### What to Do
Add daily interest calculation for short-term loans.

#### Business Rules (From Transcription)

**Source**: `transcription.md` lines 2:53:38 - 2:55:33

```
Client: "Ito daily. Arawan yung interest. After 7 days, bayaran na siya. 
7 days ang sisingilan ko ng interest. Daily interest yung pagbilang. 
Payment date, 8.20. Babayaran sa 8.25. So, 5 days ang lalagyan niya ng 
interest. Parang one month payment lang din to. Isang payment lang siya."
```

**Translation**:
- Daily interest calculation
- Typically 7 days period
- Interest charged per actual day
- Payment date is manually set
- Single payment (not recurring)

#### How It Should Work

**Example**:
```
Principal: ₱100,000
Monthly Rate: 3%
Daily Rate: 3% ÷ 30 = 0.1% per day

Release: Aug 20
Payment Date: Aug 25 (5 days)

Interest: ₱100,000 × 0.1% × 5 = ₱500
Total Due: ₱100,500
```

**Another Example**:
```
Principal: ₱100,000
Monthly Rate: 3%
Daily Rate: 0.1% per day

Release: Aug 20
Payment Date: Aug 27 (7 days)

Interest: ₱100,000 × 0.1% × 7 = ₱700
Total Due: ₱100,700
```

#### Technical Implementation

**Create New File**: `src/lib/computation/daily.ts`

```typescript
export type DailyInterestInput = {
  principal: number;
  monthlyRate: number;
  releaseDate: Date;
  paymentDate: Date;
};

export type DailyInterestResult = {
  principal: number;
  monthlyRate: number;
  dailyRate: number;
  releaseDate: string;
  paymentDate: string;
  days: number;
  interest: number;
  totalDue: number;
};

function daysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function computeDailyInterestLoan(
  input: DailyInterestInput
): DailyInterestResult {
  // Calculate actual days
  const days = daysBetween(input.releaseDate, input.paymentDate);
  
  if (days < 1) {
    throw new Error("Payment date must be after release date");
  }
  
  // Daily rate = monthly rate ÷ 30
  const dailyRate = input.monthlyRate / 30;
  
  // Interest = principal × daily rate × actual days
  const interest = halfUp(input.principal * dailyRate * days);
  
  // Total due = principal + interest
  const totalDue = input.principal + interest;
  
  return {
    principal: input.principal,
    monthlyRate: input.monthlyRate,
    dailyRate,
    releaseDate: formatDateLocal(input.releaseDate),
    paymentDate: formatDateLocal(input.paymentDate),
    days,
    interest,
    totalDue,
  };
}
```

**Add UI for Payment Date Selection**:

File: `src/components/csa/ComputationPanel.tsx`

```typescript
{paymentFrequency === 'daily' && (
  <>
    <Input
      type="date"
      label="Payment Date"
      value={paymentDate}
      onChange={(e) => setPaymentDate(e.target.value)}
      required
      min={releaseDate} // Must be after release date
    />
    <div className="alert alert-info">
      <p>Daily Interest Calculation:</p>
      <p>Interest = Principal × (Monthly Rate ÷ 30) × Actual Days</p>
      {paymentDate && releaseDate && (
        <p className="font-bold">
          Days: {daysBetween(releaseDate, paymentDate)}
        </p>
      )}
    </div>
  </>
)}
```

#### Files to Create/Modify
- 🆕 `src/lib/computation/daily.ts` (new file)
- 🆕 `src/lib/computation/__tests__/daily.test.ts` (test file)
- ✏️ `src/lib/csa/computation.ts` (add daily routing)
- ✏️ `src/components/csa/ComputationPanel.tsx` (add payment date picker)
- ✏️ `supabase/migrations/xxx_add_daily_frequency.sql` (DB migration)

#### Success Criteria
- [ ] Can select "Daily Interest" frequency
- [ ] Can input manual payment date (must be after release date)
- [ ] Daily rate = monthly rate ÷ 30
- [ ] Interest = principal × daily rate × actual days
- [ ] Single payment generated (not recurring schedule)
- [ ] Calculation matches Excel formula

---

## 6. SUCCESS CRITERIA

### Overall System Requirements

After all implementations, the system must support:

✅ **8 Payment Frequency Types**:
1. SME (Monthly)
2. MPL (Monthly)
3. Salary (Semi-Monthly 15th/30th)
4. Invoice (Weekly with escalating rates)
5. Bi-Monthly (Every 15 days rolling)
6. Quarterly (Every 3 months, interest-only)
7. 2-Month (Every 2 months, interest-only)
8. Daily (Per actual day, one-time payment)

✅ **Correct Calculations**:
- Auto/REM use net method (not gross-up)
- All frequencies match Excel output
- Rounding matches Excel (half-up to centavos)

✅ **Database Schema**:
- `payment_frequency` enum includes all 8 types
- `amortization_schedules` can store weekly/bi-monthly/quarterly installments
- Computation storage includes frequency type

✅ **User Interface**:
- CSA can select payment frequency at computation time
- Committee can override payment frequency
- Borrower sees correct schedule in portal
- All frequencies show in document generation

✅ **Testing**:
- Unit tests for each computation type
- Integration tests for schedule generation
- Regression tests ensure existing frequencies still work
- Sample loans from Excel verified against system output

---

## 7. TESTING STRATEGY

### Test Data from Excel

Use these real loans from `Calculator SME.xlsm` Data register:

**SME Loans (Already working)**:
- LA900021: ₱934,579.44 @ 7% PF, 3% interest, 3 months
- LA900022: ₱102,040.82 @ 8% PF, 3% interest, 6 months

**Auto/REM Loans (Need to verify after fix)**:
- Create test loan: ₱100,000 auto loan @ 10% PF, 3% interest, 6 months
- Expected: Principal = ₱100,000 (not ₱110,000)
- Expected Monthly: ₱19,666.67 (not ₱21,633.33)

**Invoice Financing (New)**:
- Test: ₱100,000 invoice @ 1%/2%/2.5% weekly, 3 months
- Expected total interest: ₱22,000 (4k + 8k + 10k)
- Expected weeks: 12 installments

**Bi-Monthly (New)**:
- Test: ₱100,000 @ 3% monthly, 6 months
- Expected: 12 installments of ₱10,000 each
- Expected dates: Every 15 days from release

**Quarterly (New)**:
- Test: ₱100,000 @ 3% monthly, 12 months
- Expected: 4 payments (3 interest-only + 1 principal)
- Expected: ₱9,000 per quarter + ₱100,000 final

### Regression Testing

Ensure these still work after changes:
- [ ] All 35 loans from Excel Data register still compute correctly
- [ ] Seafarer 21st cutoff still works
- [ ] Salary loan 15th/30th still works
- [ ] SME add-on months still works
- [ ] Document generation still works for all types

---

## 8. DEPLOYMENT CONSIDERATIONS

### Database Migration Order

```sql
-- Migration 1: Add payment frequencies
ALTER TYPE payment_frequency ADD VALUE 'bi_monthly';
ALTER TYPE payment_frequency ADD VALUE 'quarterly';
ALTER TYPE payment_frequency ADD VALUE 'two_monthly';
ALTER TYPE payment_frequency ADD VALUE 'weekly';
ALTER TYPE payment_frequency ADD VALUE 'daily';

-- Migration 2: Add columns if needed
ALTER TABLE computations 
  ADD COLUMN IF NOT EXISTS frequency_months INTEGER; -- For quarterly/2-month

-- Migration 3: Backfill existing loans
UPDATE computations 
SET payment_frequency = 'monthly' 
WHERE payment_frequency IS NULL;
```

### Rollout Strategy

**Phase 1**: Auto/REM Fix (Week 1)
- Deploy to staging
- Test with sample Auto/REM loans
- Verify calculations match Excel
- Deploy to production
- Monitor for 2 days

**Phase 2**: Invoice Financing (Week 2)
- Deploy to staging
- Test with sample Invoice loans
- Get client approval on UI/UX
- Deploy to production
- Monitor for 1 week

**Phase 3**: Bi-Monthly (Week 3)
- Deploy to staging with Invoice
- Test bi-monthly schedules
- Deploy to production

**Phase 4**: Quarterly/Daily (Week 4)
- Deploy remaining frequencies
- Full regression test
- Client UAT (User Acceptance Testing)
- Production deployment

### Monitoring

After deployment, monitor:
- [ ] Computation errors in logs
- [ ] Payment schedule generation failures
- [ ] Client feedback on new frequencies
- [ ] Comparison reports (Excel vs System)

---

## 9. CONTEXT FOR AI AGENT

### What You Need to Know

**You are building missing payment frequency types for a loan management system.**

The client has an Excel calculator that supports 8 different ways to structure loan payments:
1. Monthly
2. Semi-monthly (15th/30th)
3. Weekly (for invoice financing)
4. Bi-monthly (every 15 days)
5. Quarterly
6. 2-month
7. Daily interest
8. Different calculation for Auto/REM loans

**The system currently only supports 3 of these (monthly, semi-monthly, and standard calculation).**

**Your task is to create detailed implementation plans for the missing 5 frequency types.**

### Key Constraints

1. **Must match Excel calculations exactly** - Client has been using Excel for years
2. **Cannot break existing features** - Monthly and Salary loans must keep working
3. **Must follow existing code patterns** - Use same structure as `sme.ts` and `sf.ts`
4. **Must include comprehensive tests** - Each frequency needs unit + integration tests
5. **Must update database schema** - Add new payment frequency values
6. **Must update UI** - Add selectors for new frequency types

### Files You'll Work With

**Core computation files**:
- `src/lib/computation/sme.ts` - SME gross-up method (keep as-is)
- `src/lib/computation/sf.ts` - Seafarer net method (use for Auto/REM)
- `src/lib/computation/invoice.ts` - NEW FILE for Invoice Financing
- `src/lib/computation/daily.ts` - NEW FILE for Daily Interest

**Schedule generation**:
- `src/lib/ar/schedule.ts` - Add new frequency functions here
- `src/lib/computation/release-date.ts` - Date calculation utilities

**Integration points**:
- `src/lib/csa/computation.ts` - Routes to correct computation based on type
- `src/components/csa/ComputationPanel.tsx` - UI for frequency selection

**Database**:
- `supabase/migrations/` - Add new payment frequency enum values

### What Makes This Complex

1. **Different math for different types**: Weekly has escalating rates, quarterly has interest-only payments
2. **Date calculations vary**: Bi-monthly is rolling, salary is calendar-based
3. **Auto/REM need different formula**: Net method vs gross-up method
4. **Last payment adjustments**: Rounding adjustments, dual-check generation
5. **Validation rules**: Terms must be divisible by frequency for quarterly

### Success Looks Like

After implementation:
- CSA can select any payment frequency from dropdown
- Computation matches Excel output exactly
- Schedule generates correctly for each frequency
- Documents print with correct payment dates
- All tests pass (existing + new)
- Client approves UAT testing

---

## 10. REFERENCES

### Source Documents

1. **Excel Calculator**: `docs/Calculator SME.xlsm`
   - Contains formulas and 35 sample loans
   
2. **Extraction Document**: `docs/sme-calculator-extraction.md`
   - Technical analysis of Excel formulas
   - Verification against 35 real loans (99.6% match)
   
3. **Client Transcription**: `docs/transcription.md`
   - Meeting recording from Aug 25, 2026
   - Client explaining each payment type
   - Lines 900-1100 cover payment frequencies
   
4. **Implementation Tracker**: `docs/implementation-tracker-2026-08-25.md`
   - Current status of all features
   - What's done, what's pending
   
5. **Audit Documents**: 
   - `docs/payment-frequency-audit.md` (technical)
   - `docs/payment-frequency-audit-simple.md` (business)

### Related Features

- **Move of Payment** (Seafarer) - Deferred to later sprint
- **Discount Calculator** (Early settlement) - Separate feature
- **Co-Borrower** - Separate feature
- **Penalty Compounding** - Already implemented

---

## 11. QUESTIONS FOR IMPLEMENTATION PLANNING

When creating implementation plans, consider:

1. **Computation Logic**:
   - What is the exact formula?
   - How does rounding work?
   - What edge cases exist?

2. **Date Calculations**:
   - How is first payment date determined?
   - How do subsequent dates calculate?
   - What happens with month-end dates?

3. **Schedule Generation**:
   - How many installments?
   - What is the pattern?
   - How does the last installment adjust?

4. **Validation Rules**:
   - What terms are allowed?
   - What combinations are valid?
   - What errors should be shown?

5. **Database Schema**:
   - What new fields are needed?
   - What migrations are required?
   - How to handle existing loans?

6. **UI/UX**:
   - Where does user select frequency?
   - What information should be shown?
   - What warnings/alerts are needed?

7. **Testing**:
   - What test cases are critical?
   - How to verify against Excel?
   - What regression tests are needed?

8. **Documentation**:
   - What should be documented?
   - How to explain to users?
   - What training is needed?

---

**END OF DOCUMENT**

This brief provides complete context for an AI agent to create detailed implementation plans for each priority. All business rules are documented with evidence from client sources (Excel + transcription). The agent should now have everything needed to build comprehensive implementation specifications.
