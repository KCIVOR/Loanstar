# Implementation Prompt for P3, P4, P5 (Remaining Payment Frequencies)

**Context**: P1 (Auto/REM fix) and P2 (Invoice Financing) are complete. This prompt covers the remaining payment frequencies: Bi-Monthly, Quarterly/Two-Monthly, and Daily.

**Status of Current Implementation**:
- ✅ P1 Complete: Auto/REM net-method fix
- ✅ P2 Complete: Invoice Financing (weekly)
- ⏳ P3: Bi-Monthly (every 15 days)
- ⏳ P4: Quarterly / Two-Monthly (dual-line)
- ⏳ P5: Daily

---

## 🟡 P3: Bi-Monthly (Every 15 Days)

### Overview
Bi-monthly frequency generates payments every 15 days from release date, creating 2 installments per calendar month. This is simpler than Invoice because it uses the existing computation engines (SME/SF) - only the schedule generation changes.

### Business Requirements
- **Frequency**: Every 15 days (not twice-monthly on specific dates like Salary)
- **Installment Count**: `terms × 2` (6-month loan = 12 installments)
- **Amount**: `monthlyAmortization / 2` per installment
- **Date Calculation**: Release + (N × 15) days
- **Target Products**: SME/Individual loans needing faster payment cadence

### Implementation Steps

#### Step 1: Add `generateBiMonthlySchedule()` function to `src/lib/ar/schedule.ts`

**Location**: After the `generateAmortizationSchedule()` function

**Code to add**:
```typescript
/**
 * Bi-monthly schedule — payment every 15 days (not twice-monthly on specific dates).
 * Creates 2 installments per calendar month: terms × 2 total rows.
 * 
 * Example (6-month loan, release Sep 1):
 * - Installment 1: Sep 16 (release + 15)
 * - Installment 2: Oct 1 (release + 30)
 * - Installment 3: Oct 16 (release + 45)
 * - Installment 4: Oct 31 (release + 60)
 * - ...continues every 15 days
 */
export function generateBiMonthlySchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  totalLoan?: number;
}): AmortizationInstallment[] {
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const count = input.terms * 2;
  const half = halfUp(input.monthlyAmortization / 2);
  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < count; i += 1) {
    const due = new Date(release);
    due.setDate(due.getDate() + (i + 1) * 15);
    
    let amountDue = half;
    // Last installment: adjust for rounding (same pattern as monthly/semi-monthly)
    if (i === count - 1 && input.totalLoan != null) {
      const prior = halfUp(half * (count - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(due),
      amountDue,
    });
  }
  
  return installments;
}
```

#### Step 2: Wire into `generateAmortizationSchedule()` dispatch

**Location**: Inside `generateAmortizationSchedule()`, before the `semi_monthly` check

**Code to add**:
```typescript
export function generateAmortizationSchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  addonMonths?: number;
  dueDay?: number;
  totalLoan?: number;
  firstPaymentDate?: string;
  paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly";
}): AmortizationInstallment[] {
  // ADD THIS BRANCH BEFORE SEMI_MONTHLY:
  if (input.paymentFrequency === "bi_monthly") {
    return generateBiMonthlySchedule({
      terms: input.terms,
      monthlyAmortization: input.monthlyAmortization,
      releaseDate: input.releaseDate,
      totalLoan: input.totalLoan,
    });
  }

  if (input.paymentFrequency === "semi_monthly") {
    // existing semi-monthly logic...
  }
  
  // existing monthly fallthrough...
}
```

#### Step 3: Update type unions to include `"bi_monthly"`

**Files to update**:
- `src/lib/ar/schedule.ts` - in `generateAmortizationSchedule()` input type
- All other files already support it from P2 Phase 0 (no changes needed)

#### Step 4: Create unit tests

**File**: `src/lib/ar/__tests__/schedule.test.ts` (or create if doesn't exist)

**Test cases needed**:
```typescript
describe("generateBiMonthlySchedule", () => {
  it("generates 12 installments for 6-month term", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
      totalLoan: 120_000,
    });
    
    expect(result).toHaveLength(12); // 6 months × 2
    expect(result[0].dueDate).toBe("2026-09-16"); // release + 15
    expect(result[1].dueDate).toBe("2026-10-01"); // release + 30
    expect(result[11].dueDate).toBe("2027-02-16"); // release + 180
  });

  it("splits monthly amount in half", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
    });
    
    // Each installment is half of monthly (with rounding)
    expect(result[0].amountDue).toBe(10_000); // halfUp(20000 / 2)
  });

  it("adjusts last installment for total loan", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
      totalLoan: 120_000,
    });
    
    const total = result.reduce((sum, row) => sum + row.amountDue, 0);
    expect(total).toBe(120_000);
  });
});
```

#### Step 5: Create migration

**File**: `supabase/migrations/20260828140000_add_bi_monthly_payment_frequency.sql`

**Content**:
```sql
-- Add 'bi_monthly' payment frequency (P3)
-- Bi-monthly = every 15 days (2 payments per calendar month)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly (Salary), weekly (Invoice 1-3mo), bi_monthly (every 15 days)';
```

### Testing P3
- [ ] Create 6-month bi-monthly loan in UI
- [ ] Verify computation uses existing SME/SF logic (not Invoice)
- [ ] Verify schedule shows 12 installments (6 × 2)
- [ ] Verify dates are 15 days apart
- [ ] Verify amounts are half of monthly
- [ ] Release loan and check AR masterlist

### Files to Modify (P3)
1. `src/lib/ar/schedule.ts` - Add function + wire into dispatch
2. `src/lib/ar/__tests__/schedule.test.ts` - Add tests
3. `supabase/migrations/20260828140000_add_bi_monthly_payment_frequency.sql` - Migration

**Total: 3 files**

---

## 🔴 P4: Quarterly / Two-Monthly (Dual-Line)

### Overview
Quarterly and Two-Monthly loans have **dual-line installments**: each "calendar month" payment is split into two rows - one for interest, one for principal. This requires a new `line_type` column in `amortization_schedules`.

### Business Requirements
- **Quarterly**: 4 payments over 12 months (1 per quarter)
- **Two-Monthly**: 6 payments over 12 months (1 every 2 months)
- **Dual-Line Structure**: Each payment = 2 rows (interest + principal)
- **Total Rows**: Quarterly = 8 (4 × 2), Two-Monthly = 12 (6 × 2)
- **Same Due Date**: Both lines have same `due_date`, different `line_type`

### ⚠️ SCHEMA CHANGE REQUIRED

This is the **highest risk priority** - needs a new database column.

#### Step 1: Add `line_type` column to `amortization_schedules`

**File**: `supabase/migrations/20260828150000_add_line_type_column.sql`

**Content**:
```sql
-- Add line_type column for dual-line payment structures (P4)
-- Quarterly and Two-Monthly loans split each payment into interest + principal rows

-- Add column (nullable for backward compatibility)
ALTER TABLE amortization_schedules 
  ADD COLUMN line_type text DEFAULT 'standard';

-- Add constraint
ALTER TABLE amortization_schedules
  ADD CONSTRAINT amortization_schedules_line_type_check
  CHECK (line_type = ANY (ARRAY['standard'::text, 'interest'::text, 'principal'::text]));

-- Add index for queries that filter by line_type
CREATE INDEX idx_amortization_schedules_line_type 
  ON amortization_schedules(line_type);

-- Update existing rows
UPDATE amortization_schedules SET line_type = 'standard' WHERE line_type IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE amortization_schedules ALTER COLUMN line_type SET NOT NULL;

COMMENT ON COLUMN amortization_schedules.line_type IS
  'Payment line type: standard (single row), interest (dual-line interest), principal (dual-line principal)';
```

**⚠️ WARNING**: Run this migration BEFORE deploying P4 code. Test in staging first.

#### Step 2: Update `AmortizationInstallment` type

**File**: `src/lib/ar/schedule.ts`

**Change**:
```typescript
export type AmortizationInstallment = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  lineType?: "standard" | "interest" | "principal"; // ADD THIS
};
```

#### Step 3: Create `generateQuarterlySchedule()` function

**File**: `src/lib/ar/schedule.ts`

**Code to add**:
```typescript
/**
 * Quarterly schedule — 4 payments over 12 months, dual-line (interest + principal).
 * Each quarter's payment is split into two rows with the same due date.
 * 
 * Example (12-month loan, ₱120,000 total, ₱10,000 interest):
 * - Q1 (month 3): Interest ₱2,500 + Principal ₱27,500 = ₱30,000
 * - Q2 (month 6): Interest ₱2,500 + Principal ₱27,500 = ₱30,000
 * - Q3 (month 9): Interest ₱2,500 + Principal ₱27,500 = ₱30,000
 * - Q4 (month 12): Interest ₱2,500 + Principal ₱27,500 = ₱30,000
 * Total: 8 rows (4 quarters × 2 lines)
 */
export function generateQuarterlySchedule(input: {
  terms: number; // Must be 12 (1 year)
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms !== 12) {
    throw new Error("Quarterly loans must be 12-month terms");
  }

  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const dueDay = input.dueDay ?? 10;
  const principal = input.totalLoan - input.totalInterest;

  // 4 quarters, each pays: totalLoan / 4
  const quarterlyPayment = halfUp(input.totalLoan / 4);
  const quarterlyInterest = halfUp(input.totalInterest / 4);
  const quarterlyPrincipal = halfUp(quarterlyPayment - quarterlyInterest);

  const installments: AmortizationInstallment[] = [];
  let installmentNo = 1;

  // Quarters: month 3, 6, 9, 12
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const monthOffset = quarter * 3;
    const dueDate = new Date(release);
    dueDate.setMonth(dueDate.getMonth() + monthOffset);
    dueDate.setDate(dueDay);
    
    const dueDateStr = formatDateLocal(dueDate);
    
    // Interest row
    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: quarterlyInterest,
      lineType: "interest",
    });
    
    // Principal row (adjust last for rounding)
    let principalAmount = quarterlyPrincipal;
    if (quarter === 4) {
      const priorPrincipal = halfUp(quarterlyPrincipal * 3);
      principalAmount = halfUp(principal - priorPrincipal);
    }
    
    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: principalAmount,
      lineType: "principal",
    });
  }

  return installments;
}
```

#### Step 4: Create `generateTwoMonthlySchedule()` function

**File**: `src/lib/ar/schedule.ts`

**Code to add**:
```typescript
/**
 * Two-monthly schedule — 6 payments over 12 months, dual-line (interest + principal).
 * Each payment occurs every 2 months, split into two rows with the same due date.
 * 
 * Example (12-month loan, ₱120,000 total, ₱10,000 interest):
 * - Payment 1 (month 2): Interest ₱1,667 + Principal ₱18,333 = ₱20,000
 * - Payment 2 (month 4): Interest ₱1,667 + Principal ₱18,333 = ₱20,000
 * - ... continues every 2 months
 * Total: 12 rows (6 payments × 2 lines)
 */
export function generateTwoMonthlySchedule(input: {
  terms: number; // Must be 12 (1 year)
  totalLoan: number;
  totalInterest: number;
  releaseDate: string | Date;
  dueDay?: number;
}): AmortizationInstallment[] {
  if (input.terms !== 12) {
    throw new Error("Two-monthly loans must be 12-month terms");
  }

  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  const dueDay = input.dueDay ?? 10;
  const principal = input.totalLoan - input.totalInterest;

  // 6 payments, each pays: totalLoan / 6
  const payment = halfUp(input.totalLoan / 6);
  const interestPerPayment = halfUp(input.totalInterest / 6);
  const principalPerPayment = halfUp(payment - interestPerPayment);

  const installments: AmortizationInstallment[] = [];
  let installmentNo = 1;

  // Payments: month 2, 4, 6, 8, 10, 12
  for (let paymentNum = 1; paymentNum <= 6; paymentNum += 1) {
    const monthOffset = paymentNum * 2;
    const dueDate = new Date(release);
    dueDate.setMonth(dueDate.getMonth() + monthOffset);
    dueDate.setDate(dueDay);
    
    const dueDateStr = formatDateLocal(dueDate);
    
    // Interest row
    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: interestPerPayment,
      lineType: "interest",
    });
    
    // Principal row (adjust last for rounding)
    let principalAmount = principalPerPayment;
    if (paymentNum === 6) {
      const priorPrincipal = halfUp(principalPerPayment * 5);
      principalAmount = halfUp(principal - priorPrincipal);
    }
    
    installments.push({
      installmentNo: installmentNo++,
      dueDate: dueDateStr,
      amountDue: principalAmount,
      lineType: "principal",
    });
  }

  return installments;
}
```

#### Step 5: Wire into `generateAmortizationSchedule()` dispatch

**Location**: Inside `generateAmortizationSchedule()`

**Code to add**:
```typescript
export function generateAmortizationSchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  addonMonths?: number;
  dueDay?: number;
  totalLoan?: number;
  firstPaymentDate?: string;
  paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly";
  totalInterest?: number; // ADD THIS for quarterly/two-monthly
}): AmortizationInstallment[] {
  // ADD THESE BRANCHES:
  if (input.paymentFrequency === "quarterly") {
    if (!input.totalLoan || !input.totalInterest) {
      throw new Error("Quarterly loans require totalLoan and totalInterest");
    }
    return generateQuarterlySchedule({
      terms: input.terms,
      totalLoan: input.totalLoan,
      totalInterest: input.totalInterest,
      releaseDate: input.releaseDate,
      dueDay: input.dueDay,
    });
  }

  if (input.paymentFrequency === "two_monthly") {
    if (!input.totalLoan || !input.totalInterest) {
      throw new Error("Two-monthly loans require totalLoan and totalInterest");
    }
    return generateTwoMonthlySchedule({
      terms: input.terms,
      totalLoan: input.totalLoan,
      totalInterest: input.totalInterest,
      releaseDate: input.releaseDate,
      dueDay: input.dueDay,
    });
  }

  // existing bi_monthly, semi_monthly, monthly...
}
```

#### Step 6: Update `initializeArAccount()` call

**File**: `src/lib/ar/masterlist.ts`

**Change**: Add `totalInterest` to the call

```typescript
const schedule =
  computation.paymentFrequency === "weekly"
    ? invoiceScheduleToInstallments(/* ... */)
    : generateAmortizationSchedule({
        terms: computation.terms,
        monthlyAmortization: computation.monthlyAmortization,
        releaseDate,
        addonMonths: computation.addonMonths,
        dueDay: computation.dueDay ?? 10,
        totalLoan: computation.totalLoan,
        totalInterest: computation.totalInterest, // ADD THIS
        firstPaymentDate: computation.firstPaymentDate,
        paymentFrequency: computation.paymentFrequency,
      });
```

#### Step 7: Update insert to include `line_type`

**File**: `src/lib/ar/masterlist.ts`

**Change**: In the `amortization_schedules` insert

```typescript
const { error: schedError } = await supabase.from("amortization_schedules").insert(
  schedule.map((row) => {
    // existing discount logic...
    return {
      masterlist_id: masterlist.id,
      installment_no: row.installmentNo,
      due_date: row.dueDate,
      amount_due: row.amountDue,
      discount_amount: discountAmount,
      line_type: row.lineType ?? "standard", // ADD THIS
      status: "pending",
    };
  }),
);
```

#### Step 8: Create migrations

**File 1**: `supabase/migrations/20260828150000_add_line_type_column.sql` (see Step 1)

**File 2**: `supabase/migrations/20260828150001_add_quarterly_two_monthly_frequencies.sql`

```sql
-- Add 'quarterly' and 'two_monthly' payment frequencies (P4)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text,
    'quarterly'::text,
    'two_monthly'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly, weekly, bi_monthly, quarterly (4 payments/year), two_monthly (6 payments/year)';
```

### Testing P4
- [ ] Run `line_type` migration in staging FIRST
- [ ] Verify existing loans still work (line_type = 'standard')
- [ ] Create 12-month quarterly loan
- [ ] Verify 8 rows (4 quarters × 2 lines)
- [ ] Verify interest/principal split
- [ ] Create 12-month two-monthly loan
- [ ] Verify 12 rows (6 payments × 2 lines)
- [ ] Test AR screens handle dual-line rows correctly

### Files to Modify (P4)
1. `src/lib/ar/schedule.ts` - Type + 2 functions + dispatch
2. `src/lib/ar/masterlist.ts` - Add totalInterest + line_type
3. `src/lib/ar/__tests__/schedule.test.ts` - Add tests
4. `supabase/migrations/20260828150000_add_line_type_column.sql` - Schema change
5. `supabase/migrations/20260828150001_add_quarterly_two_monthly_frequencies.sql` - Constraint

**Total: 5 files (2 migrations)**

---

## 🟢 P5: Daily Payment Frequency

### Overview
Daily frequency is the simplest - generates one payment per day for the loan term. Useful for very short-term loans or specific business models.

### Business Requirements
- **Frequency**: One payment per day
- **Installment Count**: `terms × 30` (approximate, calendar-based)
- **Amount**: `totalLoan / installmentCount`
- **Date Calculation**: Release + N days
- **Use Case**: Short-term micro-loans (e.g., 1-month = 30 daily payments)

### Implementation Steps

#### Step 1: Add `generateDailySchedule()` function

**File**: `src/lib/ar/schedule.ts`

**Code to add**:
```typescript
/**
 * Daily schedule — one payment per day for the loan term.
 * Approximates 30 days per month: terms × 30 total payments.
 * 
 * Example (1-month loan, ₱30,000 total):
 * - Day 1: ₱1,000
 * - Day 2: ₱1,000
 * - ... 30 days total
 */
export function generateDailySchedule(input: {
  terms: number;
  totalLoan: number;
  releaseDate: string | Date;
}): AmortizationInstallment[] {
  const release =
    input.releaseDate instanceof Date ? input.releaseDate : new Date(input.releaseDate);
  
  // Approximate: 30 days per month
  const count = input.terms * 30;
  const daily = halfUp(input.totalLoan / count);
  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < count; i += 1) {
    const due = new Date(release);
    due.setDate(due.getDate() + i + 1);
    
    let amountDue = daily;
    // Last installment: adjust for rounding
    if (i === count - 1) {
      const prior = halfUp(daily * (count - 1));
      const last = halfUp(input.totalLoan - prior);
      if (last > 0) amountDue = last;
    }
    
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(due),
      amountDue,
    });
  }
  
  return installments;
}
```

#### Step 2: Wire into `generateAmortizationSchedule()` dispatch

**Code to add**:
```typescript
export function generateAmortizationSchedule(input: {
  // ... existing params
  paymentFrequency?: "monthly" | "semi_monthly" | "weekly" | "bi_monthly" | "quarterly" | "two_monthly" | "daily";
}): AmortizationInstallment[] {
  // ADD THIS BRANCH:
  if (input.paymentFrequency === "daily") {
    if (!input.totalLoan) {
      throw new Error("Daily loans require totalLoan");
    }
    return generateDailySchedule({
      terms: input.terms,
      totalLoan: input.totalLoan,
      releaseDate: input.releaseDate,
    });
  }

  // existing quarterly, two_monthly, bi_monthly, semi_monthly, monthly...
}
```

#### Step 3: Create migration

**File**: `supabase/migrations/20260828160000_add_daily_payment_frequency.sql`

**Content**:
```sql
-- Add 'daily' payment frequency (P5)
-- Daily = one payment per day (30 per month × terms)

ALTER TABLE computations DROP CONSTRAINT IF EXISTS computations_payment_frequency_check;

ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY[
    'monthly'::text,
    'semi_monthly'::text,
    'weekly'::text,
    'bi_monthly'::text,
    'quarterly'::text,
    'two_monthly'::text,
    'daily'::text
  ]));

COMMENT ON CONSTRAINT computations_payment_frequency_check ON computations IS
  'Payment frequency: monthly, semi_monthly, weekly, bi_monthly, quarterly, two_monthly, daily (30/month × terms)';
```

#### Step 4: Create unit tests

**File**: `src/lib/ar/__tests__/schedule.test.ts`

**Test cases needed**:
```typescript
describe("generateDailySchedule", () => {
  it("generates 30 installments for 1-month term", () => {
    const result = generateDailySchedule({
      terms: 1,
      totalLoan: 30_000,
      releaseDate: new Date("2026-09-01"),
    });
    
    expect(result).toHaveLength(30); // 1 month × 30 days
    expect(result[0].dueDate).toBe("2026-09-02"); // release + 1
    expect(result[29].dueDate).toBe("2026-10-01"); // release + 30
  });

  it("divides total loan by day count", () => {
    const result = generateDailySchedule({
      terms: 1,
      totalLoan: 30_000,
      releaseDate: new Date("2026-09-01"),
    });
    
    expect(result[0].amountDue).toBe(1_000); // 30000 / 30
  });

  it("adjusts last installment for total loan", () => {
    const result = generateDailySchedule({
      terms: 1,
      totalLoan: 30_000,
      releaseDate: new Date("2026-09-01"),
    });
    
    const total = result.reduce((sum, row) => sum + row.amountDue, 0);
    expect(total).toBe(30_000);
  });

  it("generates 60 installments for 2-month term", () => {
    const result = generateDailySchedule({
      terms: 2,
      totalLoan: 60_000,
      releaseDate: new Date("2026-09-01"),
    });
    
    expect(result).toHaveLength(60); // 2 months × 30 days
  });
});
```

### Testing P5
- [ ] Create 1-month daily loan
- [ ] Verify 30 installments
- [ ] Verify amounts divide evenly
- [ ] Verify dates are consecutive
- [ ] Release loan and check AR masterlist
- [ ] Monitor database performance (30-180 rows per loan)

### Files to Modify (P5)
1. `src/lib/ar/schedule.ts` - Add function + wire into dispatch
2. `src/lib/ar/__tests__/schedule.test.ts` - Add tests
3. `supabase/migrations/20260828160000_add_daily_payment_frequency.sql` - Migration

**Total: 3 files**

---

## 📋 Complete Migration Order

Run migrations in this exact order:

1. ✅ **Already created**: `20260828130000_add_weekly_payment_frequency.sql` (P2)
2. ⏳ `20260828140000_add_bi_monthly_payment_frequency.sql` (P3)
3. ⏳ `20260828150000_add_line_type_column.sql` (P4 - schema change, run first!)
4. ⏳ `20260828150001_add_quarterly_two_monthly_frequencies.sql` (P4 - after line_type)
5. ⏳ `20260828160000_add_daily_payment_frequency.sql` (P5)

**Total: 5 migrations** (1 already created in this session)

---

## 🎯 Implementation Priority Order

Recommended order based on complexity and risk:

### 1. P3 (Bi-Monthly) - LOW RISK ✅
- Simplest remaining priority
- No schema changes
- Uses existing computation engines
- Just schedule generation

### 2. P5 (Daily) - LOW RISK ✅
- Simple iteration
- No schema changes
- Uses existing computation engines
- Just schedule generation

### 3. P4 (Quarterly/Two-Monthly) - MEDIUM RISK ⚠️
- Requires schema change (`line_type` column)
- Needs testing of AR screens
- More complex logic (dual-line)
- Run last to minimize risk

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] P3: `generateBiMonthlySchedule()` - 12 installments for 6-month
- [ ] P4: `generateQuarterlySchedule()` - 8 rows (4 × 2 lines)
- [ ] P4: `generateTwoMonthlySchedule()` - 12 rows (6 × 2 lines)
- [ ] P5: `generateDailySchedule()` - 30 installments for 1-month

### Integration Tests (in staging)
- [ ] P3: Create bi-monthly loan → verify schedule
- [ ] P4: Create quarterly loan → verify dual-line rows
- [ ] P4: Create two-monthly loan → verify dual-line rows
- [ ] P5: Create daily loan → verify consecutive dates

### Regression Tests
- [ ] Existing monthly loans still work
- [ ] Existing semi-monthly loans still work
- [ ] Existing weekly loans still work (P2)
- [ ] All existing loans have line_type = 'standard' (P4)

### End-to-End Tests
- [ ] CSA can select all frequencies from UI
- [ ] Computation calculates correctly for each frequency
- [ ] Committee can override with different frequencies
- [ ] Release creates correct schedule rows
- [ ] AR masterlist displays all frequencies correctly

---

## 📊 Summary of Remaining Work

### P3 (Bi-Monthly)
- **Files to modify**: 3
- **New functions**: 1 (`generateBiMonthlySchedule`)
- **Migrations**: 1
- **Schema changes**: None
- **Risk level**: Low
- **Estimated time**: 1-2 hours

### P4 (Quarterly/Two-Monthly)
- **Files to modify**: 5
- **New functions**: 2 (`generateQuarterlySchedule`, `generateTwoMonthlySchedule`)
- **Migrations**: 2 (one schema change)
- **Schema changes**: Yes (`line_type` column)
- **Risk level**: Medium
- **Estimated time**: 3-4 hours

### P5 (Daily)
- **Files to modify**: 3
- **New functions**: 1 (`generateDailySchedule`)
- **Migrations**: 1
- **Schema changes**: None
- **Risk level**: Low
- **Estimated time**: 1-2 hours

**Total remaining**: 11 files, 4 functions, 4 migrations

---

## 🚀 Quick Start Commands

For each priority, follow this workflow:

```bash
# 1. Create branch
git checkout -b feature/p3-bi-monthly

# 2. Implement code (follow steps above)

# 3. Run tests
npm test -- schedule.test.ts

# 4. Check types
npm run type-check

# 5. Commit
git add .
git commit -m "feat(P3): implement bi-monthly payment frequency"

# 6. Push
git push origin feature/p3-bi-monthly

# 7. Run migration in staging
# (use your Supabase CLI or dashboard)

# 8. Test in staging

# 9. Merge to main

# 10. Deploy to production
```

---

## 📝 Reference Documents

All implementation details are in:
- `docs/payment-frequency-implementation-plan.md` - Full implementation plan
- `docs/VERIFICATION-COMPLETE.md` - Code verification results
- `docs/P1-IMPLEMENTATION-COMPLETE.md` - P1 (Auto/REM) details
- `docs/P2-COMPLETE.md` - P2 (Invoice) details
- `docs/transcription.md` - Business requirements (lines 900-970)

---

## ❓ Questions to Ask if Unclear

1. **P4 Terms Validation**: Should quarterly/two-monthly be restricted to 12-month terms only? Or allow other terms with proportional payments?

2. **P4 AR Display**: Do AR collection screens need updates to show "Interest" vs "Principal" labels for dual-line rows?

3. **P5 Day Count**: Should daily use exact calendar days or always 30 days per month? (Current: 30 days per month)

4. **Origination Discounts**: Should discounts work with weekly/bi-monthly/daily frequencies? (Current: monthly installments only)

5. **Segment Restrictions**: Should any frequencies be restricted to specific segments? (Current: SME/Individual get all, Seafarer gets monthly/semi-monthly only)

---

## ✅ Success Criteria

### P3 Complete When:
- [x] `generateBiMonthlySchedule()` function works
- [x] Wired into dispatch correctly
- [x] Migration run successfully
- [x] Unit tests passing
- [x] Integration test: 6-month loan → 12 installments
- [x] AR masterlist shows bi-monthly loans correctly

### P4 Complete When:
- [x] `line_type` column added to schema
- [x] `generateQuarterlySchedule()` function works
- [x] `generateTwoMonthlySchedule()` function works
- [x] Both wired into dispatch correctly
- [x] Migration run successfully
- [x] Unit tests passing
- [x] Integration test: quarterly → 8 rows, two-monthly → 12 rows
- [x] AR screens handle dual-line rows correctly

### P5 Complete When:
- [x] `generateDailySchedule()` function works
- [x] Wired into dispatch correctly
- [x] Migration run successfully
- [x] Unit tests passing
- [x] Integration test: 1-month loan → 30 installments
- [x] Performance acceptable for daily frequency

---

**Good luck with implementation! All the details you need are above. Copy this entire document to your other IDE and follow step by step.**
