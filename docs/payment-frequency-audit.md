# Payment Frequency Types - Complete Audit
## Based on Calculator SME.xlsm and Client Transcription

**Audit Date**: 2026-08-28  
**Sources**: 
- Calculator SME.xlsm (extraction doc: `sme-calculator-extraction.md`)
- Meeting transcription: `transcription.md` (Lines 900-1100, 2:32:43 - 3:05:21)
- Current codebase: `src/lib/`

---

## 🎯 EXECUTIVE SUMMARY

The client's Excel calculator supports **7 different payment frequency types**:
1. **SME** (Standard Monthly)
2. **MPL** (Multi-Purpose Loan - Monthly)
3. **Salary** (Semi-Monthly: 15th/30th)
4. **Invoice** (Weekly with escalating rates)
5. **Bi-Monthly** (Every 15 days)
6. **Quarterly** (Every 3 months, interest-then-principal)
7. **Daily** (Daily interest, flexible payment date)
8. **Auto/REM** (Monthly, but different principal calculation)

**Your system currently has**: SME, MPL, Salary ✅  
**Missing from your system**: Invoice, Bi-Monthly, Quarterly, Daily ❌

---

## 📊 DETAILED AUDIT BY PAYMENT TYPE

### ✅ 1. SME (Standard Monthly) - IMPLEMENTED

**What the Excel does:**
- **Calculation**: Gross-up method (Principal = Loan Desired + PF Bundle)
- **Interest**: Principal × Rate × Terms (monthly)
- **Due Date**: Release date + 1 month (same day)
- **Add-on**: Supported (adds extra months of interest)

**What your system does:**
- ✅ File: `src/lib/computation/sme.ts`
- ✅ Lines 110-121: Correct gross-up and interest calculation
- ✅ Date logic: `computeSmeFirstPaymentDate(releaseDate, addonMonths)`

**Verdict**: ✅ **FULLY IMPLEMENTED & CORRECT**

---

### ✅ 2. MPL (Multi-Purpose Loan) - IMPLEMENTED

**What the Excel does:**
- Same calculation as SME
- Same date logic as SME (release + 1 month)
- For Individual borrowers (not corporate)

**What your system does:**
- ✅ Uses SME calculation engine
- ✅ `individualLoanType: "mpl"` triggers monthly schedule
- ✅ File: `src/lib/csa/computation.ts` line 294-297

**Verdict**: ✅ **FULLY IMPLEMENTED & CORRECT**

---

### ✅ 3. Salary Loan (Semi-Monthly) - IMPLEMENTED

**What the Excel does:**
- **Payment Frequency**: Twice per month (15th and 30th)
- **Date Logic**: 
  - Release Aug 1-15 → First payment Aug 30
  - Release Aug 16-31 → First payment Sep 15
- **Amortization**: Monthly amount ÷ 2 for each payment

**What your system does:**
- ✅ File: `src/lib/computation/release-date.ts`
- ✅ Function: `computeSalaryFirstPaymentDate()`
- ✅ Schedule: `src/lib/ar/schedule.ts` lines 67-83
- ✅ Alternates between 15th and end-of-month correctly

**Verdict**: ✅ **FULLY IMPLEMENTED & CORRECT**

---

### ❌ 4. Invoice Financing (Weekly) - NOT IMPLEMENTED

**What the Excel does (from transcription 2:32:43):**

```
"Invoice, weekly yung computation ng invoice. So, ang payment niya, 
start ng 827 sa first week, next week."

"Weekly yung singilan hanggang 3 months. Sa first month, 1% lang 
ang interest niya weekly. So, 1% dito. Sa second month, 2% ang 
interest. Pagdating dito, 2.5%."

"Hanggang 3 months lang ang maximum term. Pagdating sa ika-4 month, 
wala na. Ang susunod sisinginin sa'yo itong principal plus 5% penalty."
```

**Business Rules:**
1. **Weekly interest charges** (not monthly)
2. **Escalating rates**:
   - Month 1: 1% per week
   - Month 2: 2% per week  
   - Month 3: 2.5% per week
3. **Maximum 3 months** of interest-only payments
4. **Month 4**: Full principal becomes due + penalty
5. **No add-on months** allowed
6. **First payment**: 1 week after release

**Example Calculation:**
- Release: Aug 20
- First payment: Aug 27 (1 week later)
- If not paid by Aug 27: 1% interest charged
- Week 2: Another 1% charged
- Week 3, 4: Another 1% each
- **Total Month 1**: 4 weeks × 1% = 4% interest
- Month 2: If still unpaid, rate increases to 2% per week
- Month 3: Rate increases to 2.5% per week
- Month 4: Principal + accumulated interest + 5% penalty

**What your system has:**
- ❌ Nothing. No weekly payment frequency exists
- ❌ No escalating rate logic
- ❌ No 3-month term limit enforcement

**What needs to be built:**
```typescript
// New file: src/lib/computation/invoice.ts
export function computeInvoiceLoan(input: {
  principal: number;
  terms: number; // Must be max 3 months
  releaseDate: Date;
}) {
  // Validation: terms <= 3
  if (terms > 3) throw new Error("Invoice financing max 3 months");
  
  // Weekly schedule with escalating rates
  const weeklyRates = {
    month1: 0.01, // 1%
    month2: 0.02, // 2%
    month3: 0.025, // 2.5%
  };
  
  // Generate weekly installments
  // Each week = principal × weeklyRate
  // After 3 months, principal becomes due
}
```

**Verdict**: ❌ **COMPLETELY MISSING**

---

### ❌ 5. Bi-Monthly (Every 15 Days) - NOT IMPLEMENTED

**What the Excel does (from transcription 2:45:00-2:48:30):**

```
"BI-MONTHLY. Ibig sabihin ng BI-MONTHLY, parang one month computation. 
Pero, babayaran niya yung loan ng 1530. Dalawang beses sa isang buwan 
siya magbabayad. Hatiin mo lang."

"Ang first mong payment is magbilang ka ng 15 days after release. 
First payment mo, 820 plus 15. Next payment, 9-5. Tapos, sumunod 
is 9-20. Ang amortisation, hatiin mo lang din ng dalawa."
```

**Business Rules:**
1. **Payment Frequency**: Every 15 days (NOT 15th/30th like Salary)
2. **Calculation**: Same as SME (monthly computation)
3. **Amortization**: Monthly amount ÷ 2
4. **First Payment**: Release date + 15 days
5. **Second Payment**: Release date + 30 days
6. **Pattern continues**: +15 days each time

**Example:**
- Release: Aug 20
- Monthly amortization: ₱20,000
- **Payment 1**: Sep 4 (20+15 days) = ₱10,000
- **Payment 2**: Sep 19 (20+30 days) = ₱10,000
- **Payment 3**: Oct 4 (20+45 days) = ₱10,000
- **Payment 4**: Oct 19 (20+60 days) = ₱10,000

**Key Difference vs Salary Loan:**
- **Salary**: Fixed on 15th and 30th (calendar-based)
- **Bi-Monthly**: Every 15 days from release (rolling)

**What your system has:**
- ❌ Nothing. Only "monthly" and "semi_monthly" exist
- ❌ No 15-day rolling schedule logic

**What needs to be built:**
```typescript
// In src/lib/ar/schedule.ts
export function generateBiMonthlySchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: Date;
}) {
  const installments = [];
  const biMonthlyAmount = monthlyAmortization / 2;
  const totalInstallments = terms * 2; // 6 months = 12 payments
  
  for (let i = 0; i < totalInstallments; i++) {
    const dueDate = addDays(releaseDate, (i + 1) * 15);
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDate(dueDate),
      amountDue: biMonthlyAmount,
    });
  }
  
  return installments;
}
```

**Verdict**: ❌ **COMPLETELY MISSING**

---

### ❌ 6. Quarterly (Every 3 Months) - NOT IMPLEMENTED

**What the Excel does (from transcription 2:50:22-2:53:37):**

```
"2 months tsaka quarterly. 2 months siya. Divisible lang siya ng 2 ang 
allowed. Every 2 months. Ang lalabas sa biller ay interest lang sa unang 
mga buwan. Sa ikatlong month, interest plus principal."

"Pag quarterly, divisible by threes. Per quarter yan. Ang due date niya, 
per quarter din. Yung last na quarter, piniyak lang din yung principal 
interest."
```

**Business Rules:**

#### **2-Month Frequency:**
1. **Payment**: Every 2 months
2. **Terms**: Must be divisible by 2 (4, 6, 8, 10, 12 months)
3. **First N-1 payments**: Interest only
4. **Last payment**: Interest + Principal (separated as 2 checks)
5. **First payment**: Release date + 2 months

**Example (6-month loan):**
- Release: Aug 20
- **Payment 1**: Oct 20 (2 months) = Interest only
- **Payment 2**: Dec 20 (4 months) = Interest only
- **Payment 3**: Feb 20 (6 months) = Interest + Principal (2 checks)

#### **Quarterly (3-Month) Frequency:**
1. **Payment**: Every 3 months
2. **Terms**: Must be divisible by 3 (6, 9, 12, 15 months)
3. **First N-1 payments**: Interest only
4. **Last payment**: Interest + Principal
5. **First payment**: Release date + 3 months

**Example (12-month loan):**
- Release: Aug 20
- **Payment 1**: Nov 20 (Q1) = Interest only
- **Payment 2**: Feb 20 (Q2) = Interest only
- **Payment 3**: May 20 (Q3) = Interest only
- **Payment 4**: Aug 20 (Q4) = Interest + Principal

**What your system has:**
- ❌ Nothing. No quarterly or 2-month frequencies

**What needs to be built:**
```typescript
// In src/lib/ar/schedule.ts
export function generateQuarterlySchedule(input: {
  terms: number;
  principal: number;
  interestRate: number;
  releaseDate: Date;
  frequencyMonths: 2 | 3, // 2-month or Quarterly
}) {
  // Validate terms divisible by frequency
  if (terms % frequencyMonths !== 0) {
    throw new Error(`Terms must be divisible by ${frequencyMonths}`);
  }
  
  const numPayments = terms / frequencyMonths;
  const interestOnly = (principal * interestRate * frequencyMonths);
  
  const installments = [];
  for (let i = 0; i < numPayments; i++) {
    const dueDate = addMonths(releaseDate, (i + 1) * frequencyMonths);
    
    if (i < numPayments - 1) {
      // Interest-only payment
      installments.push({
        installmentNo: i + 1,
        dueDate: formatDate(dueDate),
        amountDue: interestOnly,
        type: 'interest_only',
      });
    } else {
      // Last payment: Interest + Principal as 2 separate line items
      installments.push(
        {
          installmentNo: i + 1,
          dueDate: formatDate(dueDate),
          amountDue: interestOnly,
          type: 'interest',
        },
        {
          installmentNo: i + 1,
          dueDate: formatDate(dueDate),
          amountDue: principal,
          type: 'principal',
        }
      );
    }
  }
  
  return installments;
}
```

**Verdict**: ❌ **COMPLETELY MISSING**

---

### ❌ 7. Daily Interest - NOT IMPLEMENTED

**What the Excel does (from transcription 2:53:38-2:55:33):**

```
"Ito daily. Arawan yung interest. Pero, parang 7 days. So, after 7 days, 
bayaran na siya. Yung, 7 days ang sisingilan ko ng interest. Daily 
interest yung pagbilang ng interest."

"Payment date, 8.20. Babayaran sa 8.25. So, 5 days ang lalagyan niya 
ng interest. Parang one month payment lang din to. Isang payment lang siya."
```

**Business Rules:**
1. **Interest calculation**: Based on **actual number of days**
2. **Payment date**: Manual/known in advance
3. **Interest formula**: `Principal × Daily Rate × Actual Days`
4. **Daily Rate**: `Monthly Rate ÷ 30`
5. **One-time payment**: Single payment after agreed period
6. **Typical use**: 7-30 days

**Example:**
- Principal: ₱100,000
- Monthly rate: 3%
- Daily rate: 3% ÷ 30 = 0.1% per day
- Release: Aug 20
- Payment: Aug 25 (5 days)
- **Interest**: ₱100,000 × 0.1% × 5 = ₱500
- **Total payment**: ₱100,500

**What your system has:**
- ❌ Nothing. Only monthly interest calculation exists

**What needs to be built:**
```typescript
// In src/lib/computation/daily.ts
export function computeDailyInterestLoan(input: {
  principal: number;
  monthlyRate: number;
  releaseDate: Date;
  paymentDate: Date;
}) {
  // Calculate actual days
  const days = daysBetween(releaseDate, paymentDate);
  
  // Daily rate = monthly rate ÷ 30
  const dailyRate = monthlyRate / 30;
  
  // Interest = principal × daily rate × days
  const interest = principal * dailyRate * days;
  
  // Single payment
  const totalDue = principal + interest;
  
  return {
    principal,
    days,
    dailyRate,
    interest,
    totalDue,
    dueDate: paymentDate,
  };
}
```

**Verdict**: ❌ **COMPLETELY MISSING**

---

### ⚠️ 8. Auto Loan & REM - PARTIALLY DIFFERENT

**What the Excel does (from transcription 2:39:44-2:44:53):**

```
"Auto is same lang ng SME. Ang due date niya parehas kung kailan siya 
na-release."

"Ang computation, long desire, 100,000. 100,000 ang principal. Hindi 
siya nag-add on. Yung pinagkukuhaan ng initial, yun ang principal. 
Deduct lahat ng deduction."

"Auto tsaka REM yun apply. Kung ano yung loan desire mo, doon magbase 
lahat. Principal. Yung processing fee mo, dito siya kukunin. Kasi ito 
yung principal."
```

**Key Difference: Net Method vs Gross-Up Method**

**SME (Gross-Up):**
```
Loan Desired: 100,000
PF Bundle (10%): 10,000
Principal: 110,000  ← Gross-up

Deductions calculated from Principal:
- Processing Fee: From 110,000
- Doc Stamp: 0.75% of 110,000 = 825
- Interest: 110,000 × 3% × 6 months
```

**Auto/REM (Net Method):**
```
Loan Desired: 100,000
Principal: 100,000  ← Same as loan desired (no gross-up!)

Deductions calculated from Principal:
- Processing Fee: From 100,000
- Doc Stamp: 0.75% of 100,000 = 750
- Interest: 100,000 × 3% × 6 months

Net Released = 100,000 - (all deductions)
```

**What your system has:**
- ✅ Net method calculation exists in SF engine (`src/lib/computation/sf.ts`)
- ⚠️ BUT: Auto/REM are treated as **collateral types**, not separate loan products
- ⚠️ They currently use SME calculation (gross-up), not net method

**What needs to be fixed:**
```typescript
// In src/lib/csa/computation.ts
// Detect if collateral type is car_refinancing or real_estate
// Use net method calculation instead of SME gross-up

if (collateralType === 'car_refinancing' || collateralType === 'real_estate') {
  // Use net method (SF-style calculation)
  result = computeNetMethodLoan({
    amount: input.amount,
    terms: input.terms,
    // ... other params
  });
} else {
  // Use gross-up method (SME calculation)
  result = computeSmeLoan({
    loanDesired: input.amount,
    // ... other params
  });
}
```

**Verdict**: ⚠️ **PARTIALLY IMPLEMENTED** - Structure exists but using wrong calculation method

---

## 📋 IMPLEMENTATION PRIORITY MATRIX

| Feature | Business Impact | Technical Complexity | Priority |
|---------|----------------|---------------------|----------|
| **Invoice Financing** | HIGH (separate product line) | MEDIUM | 🔴 P1 |
| **Auto/REM Net Method Fix** | HIGH (wrong calculations) | LOW | 🔴 P1 |
| **Bi-Monthly** | MEDIUM | LOW | 🟡 P2 |
| **Quarterly/2-Month** | MEDIUM | MEDIUM | 🟡 P2 |
| **Daily Interest** | LOW (niche use case) | LOW | 🟢 P3 |

---

## 🎯 RECOMMENDED IMPLEMENTATION PLAN

### Phase 1: Fix Auto/REM (P1 - 2 days)
1. Add collateral type detection in `persistComputation`
2. Route to net method calculation for car_refinancing/real_estate
3. Test with sample Auto loan vs SME loan

### Phase 2: Invoice Financing (P1 - 5 days)
1. Create `src/lib/computation/invoice.ts`
2. Implement weekly schedule generation
3. Implement escalating rate logic (1% → 2% → 2.5%)
4. Add 3-month term validation
5. Add UI selector for Invoice type

### Phase 3: Bi-Monthly (P2 - 3 days)
1. Add `generateBiMonthlySchedule()` to `schedule.ts`
2. Add 15-day rolling schedule logic
3. Add payment_frequency: 'bi_monthly' to database
4. Add UI selector

### Phase 4: Quarterly/2-Month (P2 - 4 days)
1. Add `generateQuarterlySchedule()` to `schedule.ts`
2. Implement interest-only vs principal+interest logic
3. Add term divisibility validation
4. Add dual-check generation for final payment

### Phase 5: Daily Interest (P3 - 2 days)
1. Create `src/lib/computation/daily.ts`
2. Add manual payment date input
3. Calculate actual days between dates
4. Add daily rate conversion (monthly ÷ 30)

---

## 🔍 VERIFICATION CHECKLIST

For each payment type, verify:
- [ ] Computation matches Excel output
- [ ] Date calculation matches business rules
- [ ] Schedule generation is correct
- [ ] Database schema supports payment frequency
- [ ] UI allows selection of payment type
- [ ] Document generation works for each type
- [ ] Test with sample loan from transcription

---

## 📝 NOTES

1. **Calculator Sheet Structure**: The Excel has one "SME" sheet but uses the first word of the rate name (C4 cell) to determine payment logic
2. **Rate Lookup**: `I31 = LEFT(C4, FIND(" ")-1)` extracts the type: "Invoice", "Auto", "QUARTERLY", etc.
3. **Remapping**: Excel remaps some names: "2months" → "quarterly", "refinancing" → "auto"
4. **Your Advantage**: Cleaner separation - loan type selected at application time, not embedded in rate name

---

**Audit completed**: 2026-08-28  
**Next action**: Review with client and prioritize implementation
