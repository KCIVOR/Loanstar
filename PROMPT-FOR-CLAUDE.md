# Implementation Task: Payment Frequency Features

## Your Role

You are a senior full-stack developer tasked with implementing missing payment frequency features in the Loanstar loan management system. You will conduct a comprehensive audit, then create a detailed, phase-by-phase implementation plan.

---

## Context Documents (Read These First)

You have been provided with two context documents that explain the business requirements:

1. **`docs/payment-frequencies-context.md`** - Narrative explanation of what needs to be built and why (READ THIS FIRST)
2. **`docs/payment-frequency-implementation-brief.md`** - Technical implementation details with code examples

Please read both documents carefully before starting your audit.

---

## Your Task

### Phase 1: Comprehensive Audit

Conduct a thorough audit of the current system to understand:

1. **Database Schema Audit** (using Supabase MCP tools):
   - Query the `loan_applications` table schema to see current fields
   - Query the `computations` table schema to understand how calculations are stored
   - Query the `amortization_schedules` table schema to see how payment schedules are stored
   - Check the `payment_frequency` enum type to see what values currently exist
   - Look for any `collateral_type` fields that might be used for Auto/REM detection

2. **Codebase Audit**:
   - Read `src/lib/computation/sme.ts` - Understand the SME gross-up calculation
   - Read `src/lib/computation/sf.ts` - Understand the Seafarer net calculation  
   - Read `src/lib/csa/computation.ts` - Understand the current routing logic (THIS IS KEY)
   - Read `src/lib/ar/schedule.ts` - Understand how payment schedules are currently generated
   - Read `src/lib/computation/release-date.ts` - Understand date calculation utilities
   - Check if any "invoice", "quarterly", "bi-monthly", or "daily" logic exists anywhere

3. **Current Flow Analysis**:
   - Trace the complete flow: Application → Computation → Schedule Generation → Database Storage
   - Identify where collateral type is captured and stored
   - Identify where payment frequency is selected and used
   - Find all the touch points that will need modification

4. **Risk Assessment**:
   - Identify which files will need modification for each priority
   - Identify files that should NOT be modified (to avoid breaking existing features)
   - Assess dependencies between files
   - Identify potential breaking changes

### Phase 2: Create Implementation Plan

Based on your audit findings, create a **detailed, surgical, phase-by-phase implementation plan** for each priority:

#### 🔴 Priority 1: Auto/REM Fix (2-3 days)
- **Audit findings**: Where is collateral_type stored? How is it accessed?
- **Implementation plan**:
  - Exact files to modify (with line numbers from your audit)
  - Exact code changes needed (show before/after)
  - Database migrations needed (if any)
  - Test cases to verify
  - Rollback plan if something breaks

#### 🔴 Priority 2: Invoice Financing (5-7 days)
- **Audit findings**: Does any weekly logic exist? What's the current payment_frequency enum?
- **Implementation plan**:
  - New files to create (with structure/exports)
  - Existing files to modify (with specific changes)
  - Database migration for weekly payment frequency
  - UI changes needed
  - Integration points with existing code
  - Test cases to verify
  - Phased rollout steps

#### 🟡 Priority 3: Bi-Monthly (3 days)
- **Audit findings**: How does semi_monthly currently work? Can we follow the same pattern?
- **Implementation plan**:
  - Files to modify
  - New function to add to schedule.ts
  - Database migration
  - Test cases

#### 🟡 Priority 4: Quarterly/2-Month (4 days)
- **Audit findings**: How are installments stored? Can we store 2 line items with same due date?
- **Implementation plan**:
  - Files to modify
  - Validation logic for term divisibility
  - Dual line item generation logic
  - Database considerations
  - Test cases

#### 🟢 Priority 5: Daily Interest (2 days)
- **Audit findings**: Are there existing date utilities? How to store one-time payment?
- **Implementation plan**:
  - New file to create
  - Integration points
  - UI for payment date selection
  - Test cases

---

## CRITICAL Constraints

### 🚫 DO NOT Modify These Without Explicit Reason:

1. **Core Computation Files**:
   - `src/lib/computation/sme.ts` - SME calculation is correct, don't touch
   - `src/lib/computation/sf.ts` - Seafarer calculation is correct, don't touch
   - Only modify if absolutely necessary, and explain why

2. **Existing Payment Frequencies**:
   - Monthly payment logic must continue working exactly as-is
   - Semi-monthly (salary) logic must continue working exactly as-is
   - DO NOT modify existing schedule generation code unless adding new branches

3. **Database Tables**:
   - DO NOT drop or rename existing columns
   - DO NOT change existing enum values (only ADD new ones)
   - DO NOT modify existing data

4. **Unrelated Features**:
   - Do not modify authentication code
   - Do not modify document generation (unless adding new frequency support)
   - Do not modify payment collection logic
   - Do not modify borrower portal code

### ✅ Surgical Modification Principles:

1. **Add, Don't Replace**: Add new code paths rather than replacing existing ones
   ```typescript
   // ❌ BAD: Replacing existing logic
   if (segment === "sme") {
     return newLogic();  // This breaks existing SME loans!
   }
   
   // ✅ GOOD: Adding new branch
   if (collateralType === "auto") {
     return newLogic();
   } else if (segment === "sme") {
     return existingLogic();  // Existing loans still work
   }
   ```

2. **Extend, Don't Modify**: Extend enums and types rather than changing them
   ```sql
   -- ❌ BAD: Replacing enum
   DROP TYPE payment_frequency;
   CREATE TYPE payment_frequency AS ENUM ('weekly', 'bi_monthly');
   
   -- ✅ GOOD: Extending enum
   ALTER TYPE payment_frequency ADD VALUE 'weekly';
   ALTER TYPE payment_frequency ADD VALUE 'bi_monthly';
   ```

3. **Branch, Don't Rewrite**: Add conditional branches rather than rewriting functions
   ```typescript
   // ✅ GOOD: Adding new branch to existing function
   export function generateSchedule(input) {
     if (input.frequency === 'bi_monthly') {
       return generateBiMonthlySchedule(input);  // New branch
     }
     
     // Existing logic untouched below this point
     if (input.frequency === 'semi_monthly') {
       return generateSemiMonthlySchedule(input);
     }
     
     return generateMonthlySchedule(input);
   }
   ```

4. **Test Boundaries**: Every modification must have tests that verify existing functionality still works
   - Add regression tests for monthly loans
   - Add regression tests for salary loans
   - Add regression tests for seafarer loans

---

## Required Audit Checklist

Before creating your implementation plan, answer these questions:

### Database Audit
- [ ] What is the current `payment_frequency` enum? What values exist?
- [ ] Where is `collateral_type` stored? What are the possible values?
- [ ] How is `segment` stored? (seafarer, sme, individual)
- [ ] What fields exist in the `computations` table?
- [ ] What fields exist in the `amortization_schedules` table?
- [ ] Are there any existing migrations that add payment frequencies?

### Code Audit
- [ ] How does `persistComputation()` currently route to sme vs sf calculations?
- [ ] What parameters does `computeSmeLoan()` accept?
- [ ] What parameters does `computeSfLoan()` accept?
- [ ] How does `generateAmortizationSchedule()` determine monthly vs semi-monthly?
- [ ] Are there any existing references to "invoice", "quarterly", "bi-monthly", or "daily"?
- [ ] What UI component lets CSA select payment frequency?

### Integration Points Audit
- [ ] Where does the collateral_type get captured in the borrower application?
- [ ] Where does it flow through to the computation?
- [ ] Is it available in `persistComputation()` input?
- [ ] How does the committee override flow work? Does it preserve payment frequency?
- [ ] Does document generation use payment frequency? Where?

### Risk Audit
- [ ] What happens to existing loans if we modify `payment_frequency` enum?
- [ ] What happens if we change routing logic in `persistComputation()`?
- [ ] Are there any hard-coded assumptions about "monthly" being the only frequency?
- [ ] What breaks if we add a new computation file?

---

## Deliverable Format

### Part 1: Audit Report

Provide a structured audit report with these sections:

```markdown
# Audit Report: Payment Frequency Implementation

## Database Findings
- Current payment_frequency enum values: ...
- Collateral type storage: ...
- Relevant table schemas: ...

## Code Findings
- Current routing logic: ...
- Existing payment frequency handling: ...
- Integration points identified: ...

## Risk Assessment
- High Risk Areas: ...
- Medium Risk Areas: ...
- Low Risk Areas: ...

## Existing Functionality to Preserve
- Monthly loans: How they currently work
- Salary loans: How they currently work
- Seafarer loans: How they currently work
```

### Part 2: Implementation Plan (For Each Priority)

For each priority (P1, P2, P3, P4, P5), provide:

```markdown
## Priority X: [Feature Name]

### Audit Summary
- What exists: ...
- What's missing: ...
- Dependencies: ...

### Phase-by-Phase Implementation

#### Phase 1: [Description]
**Goal**: ...
**Duration**: X hours
**Files to Modify**:
- `path/to/file.ts` (lines X-Y) - Add [specific change]
  - Before: [code]
  - After: [code]
  - Why: [explanation]

**Files to Create**:
- `path/to/newfile.ts` - [purpose]
  - Exports: [list functions]
  - Imports from: [dependencies]

**Database Changes**:
- Migration: [SQL]
- Why: [explanation]

**Testing**:
- [ ] Test case 1: [description]
- [ ] Test case 2: [description]
- [ ] Regression test: Verify monthly loans still work

**Rollback Plan**:
- If this phase fails: [steps to undo]

#### Phase 2: [Description]
[Same structure as Phase 1]

### Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] No existing tests broken

### Deployment Steps
1. Step 1
2. Step 2
3. Verify step

### Monitoring After Deployment
- Watch for: [specific errors]
- Check logs: [specific log entries]
- Verify: [specific behavior]
```

---

## Important Notes

1. **Be Specific**: Don't say "modify computation.ts" - say "modify src/lib/csa/computation.ts lines 259-286 to add collateral type detection before the segment check"

2. **Show Your Work**: Include code snippets showing before/after for every modification

3. **Think Surgical**: Every change should be minimal and targeted. If you find yourself rewriting entire functions, stop and think of a less invasive approach.

4. **Test Boundaries**: For every modification, specify exactly which tests prove existing functionality still works

5. **Database Migrations**: Be explicit about enum extensions, new columns, etc. Show the exact SQL.

6. **Phased Rollout**: Break large features (like Invoice Financing) into deployable phases. Don't require everything to be done before deploying anything.

---

## Start Your Audit Now

Begin by:

1. **Reading the context documents** (payment-frequencies-context.md and payment-frequency-implementation-brief.md)

2. **Using Supabase MCP tools** to query the database schema:
   - List all tables related to loans
   - Get the payment_frequency enum definition
   - Get the computations table schema
   - Get the amortization_schedules table schema

3. **Reading the key source files**:
   - src/lib/csa/computation.ts (MOST IMPORTANT)
   - src/lib/computation/sme.ts
   - src/lib/computation/sf.ts
   - src/lib/ar/schedule.ts

4. **Creating your audit report** with findings

5. **Creating surgical implementation plans** for each priority

Remember: **Preserve existing functionality at all costs. Add, don't replace. Extend, don't modify.**

Good luck! 🚀
