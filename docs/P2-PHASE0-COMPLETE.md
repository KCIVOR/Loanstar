# P2 Phase 0 Implementation Complete ✅
**Priority**: 2 Phase 0 (Payment Frequency Plumbing)  
**Date**: 2026-08-28  
**Status**: IMPLEMENTED - READY FOR TESTING

---

## Summary

Successfully implemented the foundational plumbing that enables CSA to explicitly select payment frequency instead of deriving it from loan type. This is the **critical prerequisite** for P2-P5 (Invoice/Bi-Monthly/Quarterly/Two-Monthly/Daily frequencies).

### What Changed
- ✅ Added `paymentFrequency` field to `PersistComputationInput` type
- ✅ Replaced hardcoded derivation with explicit-wins/fallback pattern
- ✅ Added payment frequency selector to CSA UI (ComputationPanel)
- ✅ Threaded `paymentFrequency` through CSA and Committee APIs
- ✅ Maintained backward compatibility (existing code gets identical behavior)

---

## Why This Matters

**Before P2 Phase 0:**
- Payment frequency was **derived**: `salary → semi_monthly`, else `monthly`
- No way to select Invoice (weekly), Bi-Monthly, Quarterly, etc.
- New frequencies couldn't be added without schema changes

**After P2 Phase 0:**
- Payment frequency can be **explicitly selected** by CSA
- Falls back to derived value when not set (backward compatible)
- New frequencies can be added by:
  1. Extending enum in types
  2. Adding option to UI selector
  3. Implementing schedule generation function
- Ready for P2-P5 implementation

---

## Files Modified

### 1. `src/lib/csa/computation.ts` ✅

#### Added `paymentFrequency` to Type Definition (Line ~40)
```typescript
/** Payment frequency — when explicitly set, overrides the derived default.
 * Default derivation: "semi_monthly" if individualLoanType === "salary",
 * else "monthly". Invoice/Bi-Monthly/Quarterly/2-Month/Daily all require
 * explicit selection (cannot be derived from segment/loan type). */
paymentFrequency?:
  | "monthly"
  | "semi_monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily"
  | null;
```

#### Replaced Hardcoded Derivation (Line ~335)
```typescript
// BEFORE (hardcoded):
const paymentFrequency: "monthly" | "semi_monthly" =
  input.individualLoanType === "salary" ? "semi_monthly" : "monthly";

// AFTER (explicit-wins/fallback):
const paymentFrequency =
  input.paymentFrequency ??
  (input.individualLoanType === "salary" ? "semi_monthly" : "monthly");
```

**Why**: Explicit selection wins; omitting it preserves backward-compatible behavior.

---

### 2. `src/app/api/csa/applications/[id]/computation/route.ts` ✅

#### Added to Schema Validation (Line ~100)
```typescript
/** Payment frequency — when set, overrides the derived default (salary → semi_monthly, else monthly). */
paymentFrequency: z
  .enum([
    "monthly",
    "semi_monthly",
    "weekly",
    "bi_monthly",
    "quarterly",
    "two_monthly",
    "daily",
  ])
  .optional(),
```

#### Added to persistComputation Call (Line ~386)
```typescript
const saved = await persistComputation(supabase, {
  loanApplicationId: id,
  segment,
  individualLoanType,
  collateralType: ...,
  loanTypeId: loanType.id,
  // ... other fields
  dueDay: body.dueDay,
  paymentFrequency: body.paymentFrequency, // NEW
  originationDiscounts: body.originationDiscounts,
  monthlyIncome,
  computedBy: user.id,
});
```

---

### 3. `src/components/csa/ComputationPanel.tsx` ✅

#### Added State Variable (Line ~485)
```typescript
// Payment frequency — when unset, defaults to derived value (salary → semi_monthly, else monthly).
// P2 Phase 0: plumbing for explicit selection (Invoice/Bi-Monthly/etc require explicit choice).
const [paymentFrequency, setPaymentFrequency] = useState<
  | "monthly"
  | "semi_monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily"
  | ""
>("");
```

#### Added to Computation Type (Line ~110)
```typescript
export type Computation = {
  id: string;
  inputMode: string;
  // ... other fields
  dueDay?: number | null;
  paymentFrequency?: string | null; // NEW
  originationDiscounts?: Array<{ installmentNo: number; percent: number }> | null;
  // ... rest
};
```

#### Added UI Selector (Line ~1333)
```typescript
<div className="sm:col-span-2">
  <Label htmlFor="paymentFrequency">
    Payment frequency
    <span className="text-ink-400 ml-1 text-xs">(optional, auto-detected)</span>
  </Label>
  <Select
    id="paymentFrequency"
    value={paymentFrequency}
    onChange={(e) => setPaymentFrequency(e.target.value as ...)}
  >
    <option value="">Auto (salary → semi-monthly, else monthly)</option>
    <option value="monthly">Monthly</option>
    <option value="semi_monthly">Semi-monthly (Salary)</option>
    {isRateEditableSegment ? (
      <>
        <option value="weekly">Weekly (Invoice Financing)</option>
        <option value="bi_monthly">Bi-monthly (every 15 days)</option>
        <option value="quarterly">Quarterly</option>
        <option value="two_monthly">Two-monthly</option>
        <option value="daily">Daily</option>
      </>
    ) : null}
  </Select>
  {paymentFrequency === "weekly" && (
    <p className="text-xs text-ink-500 mt-1">
      Invoice: 1-3 month terms only, weekly interest-only payments
    </p>
  )}
</div>
```

**UI Design Decisions**:
- ✅ Shows "Auto" option by default (preserves current behavior)
- ✅ New frequencies only shown for SME/Individual (`isRateEditableSegment`)
- ✅ Seafarer keeps monthly/semi-monthly only (appropriate for segment)
- ✅ Helper text for Invoice frequency (1-3 month terms constraint)

#### Added to Form Submission (Line ~1130)
```typescript
body: JSON.stringify({
  inputMode,
  amount: Number(amount),
  terms: Number(terms),
  addonMonths: Number(addonMonths),
  loanTypeId: selectedLoanTypeId || loanTypeId,
  ...(isSeafarer ? { dueDay: Number(dueDay) } : {}),
  ...(paymentFrequency ? { paymentFrequency } : {}), // NEW
  originationDiscounts: originationDiscountsPayload,
  // ... rest
}),
```

#### Added to Hydration Logic (Line ~590)
```typescript
if (computation.paymentFrequency) {
  setPaymentFrequency(
    computation.paymentFrequency as
      | "monthly"
      | "semi_monthly"
      | "weekly"
      | "bi_monthly"
      | "quarterly"
      | "two_monthly"
      | "daily",
  );
}
```

---

### 4. `src/lib/negotiation/service.ts` ✅

#### Added to OverrideInput Type (Line ~335)
```typescript
/** Payment frequency — when set, overrides the derived default (salary → semi_monthly, else monthly).
 * Same explicit-wins/omission-preserves-existing rule as the fields above. */
paymentFrequency?:
  | "monthly"
  | "semi_monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily";
```

#### Added to persistComputation Call (Line ~470)
```typescript
const saved = await persistComputation(supabase, {
  loanApplicationId: applicationId,
  segment,
  collateralType,
  loanTypeId: loanType.id,
  // ... other fields
  dueDay: resolvedDueDay,
  paymentFrequency: input.paymentFrequency, // NEW
  originationDiscounts: resolvedOriginationDiscounts,
  // ... rest
});
```

---

### 5. `src/app/api/committee/applications/[id]/override/route.ts` ✅

#### Added to Schema Validation (Line ~35)
```typescript
dueDay: z.number().int().min(1).max(28).optional(),
/** Payment frequency — when set, overrides the derived default. */
paymentFrequency: z
  .enum([
    "monthly",
    "semi_monthly",
    "weekly",
    "bi_monthly",
    "quarterly",
    "two_monthly",
    "daily",
  ])
  .optional(),
originationDiscounts: z
```

**Note**: The `body` object is already passed through to `committeeOverrideAmount()` and `committeeAdjustPreDecision()`, so no additional changes needed in the route handler.

---

## Compilation Status

✅ **All files compile without errors**

Verified with `get_diagnostics`:
- `src/lib/csa/computation.ts` - No diagnostics
- `src/app/api/csa/applications/[id]/computation/route.ts` - No diagnostics
- `src/components/csa/ComputationPanel.tsx` - No diagnostics
- `src/lib/negotiation/service.ts` - No diagnostics
- `src/app/api/committee/applications/[id]/override/route.ts` - No diagnostics

---

## Backward Compatibility

### ✅ Existing Behavior Preserved

**When `paymentFrequency` is NOT set:**
- Salary loans → `semi_monthly` (unchanged)
- All other loans → `monthly` (unchanged)
- Exact same database values as before
- No impact on existing computations

**When `paymentFrequency` IS set:**
- Explicitly selected value is used
- Overrides the derived default
- New functionality, doesn't affect existing code paths

### Testing Backward Compatibility
```typescript
// Test 1: Omit paymentFrequency (should derive as before)
persistComputation(supabase, {
  loanApplicationId: "...",
  segment: "individual",
  individualLoanType: "salary",
  // paymentFrequency: undefined
  // ... other fields
});
// Expected: paymentFrequency = "semi_monthly" (derived)

// Test 2: Explicit override
persistComputation(supabase, {
  loanApplicationId: "...",
  segment: "individual",
  individualLoanType: "salary",
  paymentFrequency: "weekly", // NEW: explicit override
  // ... other fields
});
// Expected: paymentFrequency = "weekly" (explicit)
```

---

## Migration Status

### ✅ NO MIGRATION REQUIRED YET

P2 Phase 0 uses existing enum values:
- `monthly` (already exists)
- `semi_monthly` (already exists)
- New values (`weekly`, `bi_monthly`, etc.) are defined in TypeScript but **not written to DB yet**

**Migration will be needed** when P2-P5 actually USE the new frequencies:
- P2 Phase 1+ (Invoice): Add `'weekly'` to constraint
- P3 (Bi-Monthly): Add `'bi_monthly'` to constraint
- P4 (Quarterly/2-Month): Add `'quarterly'`, `'two_monthly'` to constraint
- P5 (Daily): Add `'daily'` to constraint

Each migration is:
```sql
ALTER TABLE computations DROP CONSTRAINT computations_payment_frequency_check;
ALTER TABLE computations ADD CONSTRAINT computations_payment_frequency_check
  CHECK (payment_frequency = ANY (ARRAY['monthly', 'semi_monthly', 'weekly', ...]::text[]));
```

---

## What This Enables

### P2 Phase 1+: Invoice Financing (Weekly)
- CSA can now select "Weekly (Invoice Financing)" from dropdown
- Next step: Implement `computeInvoiceLoan()` engine
- Next step: Wire into `initializeArAccount()`

### P3: Bi-Monthly (Every 15 Days)
- CSA can now select "Bi-monthly (every 15 days)" from dropdown
- Next step: Implement `generateBiMonthlySchedule()` function
- Next step: Add branch to `generateAmortizationSchedule()`

### P4: Quarterly / Two-Monthly (Dual-Line)
- CSA can now select "Quarterly" or "Two-monthly" from dropdown
- Next step: Add `line_type` column to `amortization_schedules`
- Next step: Implement dual-line schedule generation

### P5: Daily
- CSA can now select "Daily" from dropdown
- Next step: Implement `generateDailySchedule()` function
- Next step: Add branch to `generateAmortizationSchedule()`

---

## Testing Requirements

### Unit Tests
- [ ] `persistComputation()` with `paymentFrequency` set → uses explicit value
- [ ] `persistComputation()` with `paymentFrequency` omitted → uses derived value
- [ ] Derived value: `individualLoanType: "salary"` → `"semi_monthly"`
- [ ] Derived value: `individualLoanType: "mpl"` → `"monthly"`
- [ ] Derived value: `segment: "sme"` → `"monthly"`
- [ ] Derived value: `segment: "seafarer"` → `"monthly"`

### Integration Tests
- [ ] CSA creates loan with "Auto" frequency → correct derivation
- [ ] CSA creates loan with explicit "Monthly" → stores `"monthly"`
- [ ] CSA creates loan with explicit "Semi-monthly" → stores `"semi_monthly"`
- [ ] Existing loan (no paymentFrequency in DB) → UI shows "Auto", behaves correctly
- [ ] Committee overrides with explicit frequency → stores new frequency

### UI Tests
- [ ] Dropdown shows correct options for Seafarer (monthly/semi-monthly only)
- [ ] Dropdown shows all options for SME/Individual
- [ ] "Auto" option preserves existing behavior
- [ ] Helper text appears when "Weekly" selected
- [ ] Existing computation hydrates frequency correctly

### Regression Tests
- [ ] Existing Salary loans still get `semi_monthly` (when frequency not set)
- [ ] Existing MPL loans still get `monthly` (when frequency not set)
- [ ] Existing SME loans still get `monthly` (when frequency not set)
- [ ] Existing Seafarer loans still get `monthly` (when frequency not set)

---

## Known Limitations

### UI Behavior
- New frequencies (weekly/bi_monthly/etc.) shown in UI but **not yet implemented**
- Selecting them will:
  - ✅ Pass validation (schema allows them)
  - ✅ Store in database (type is `text` not enum)
  - ❌ Fail at schedule generation (no schedule function exists yet)
  - ❌ Fail at release (no amortization rows created)

**Mitigation**: 
- Don't deploy to production until P2-P5 schedule functions implemented
- OR: Hide new frequencies in UI until ready (comment out options)
- OR: Add runtime validation that rejects unimplemented frequencies

### Migration Timing
- Type system allows all frequencies
- Database constraint only allows `monthly` and `semi_monthly`
- Attempting to save a new frequency will fail with constraint violation
- Must run migration **before** deploying code that uses new frequencies

---

## Rollback Plan

### Simple Rollback (Git)
```bash
git revert <commit-hash>
```

### What Reverts
- ✅ TypeScript types (no new DB values written)
- ✅ UI selector (removes new options)
- ✅ API schema validation (back to no paymentFrequency field)
- ✅ Derivation logic (back to hardcoded)

### What Doesn't Revert
- ❌ No database changes to revert (none were made)
- ❌ No data migration to reverse (none was run)

**Safe to rollback**: P2 Phase 0 is pure plumbing with zero database impact.

---

## Next Steps

### Immediate (Don't Deploy Yet)
1. ✅ P2 Phase 0 complete (this)
2. ⏳ Decide: Continue to P2 Phase 1 (Invoice) or test Phase 0 first?

### Option A: Continue to P2 Phase 1 (Invoice)
1. Create `src/lib/computation/invoice.ts`
2. Implement `computeInvoiceLoan()` engine
3. Wire into `initializeArAccount()`
4. Run migration to add `'weekly'` to constraint
5. Test end-to-end Invoice loan flow

### Option B: Test P2 Phase 0 Thoroughly
1. Unit test the explicit-wins/fallback logic
2. Integration test CSA UI selector
3. Verify backward compatibility
4. Then proceed to P2 Phase 1

### After P2 Complete
- P3 (Bi-Monthly) - straightforward, similar to semi-monthly
- P4 (Quarterly/2-Month) - requires new `line_type` column
- P5 (Daily) - simplest, pure iteration

---

## Success Criteria

✅ **Code Changes Complete**:
- All 5 files modified correctly
- No compilation errors
- Type safety preserved
- Backward compatibility maintained

⏳ **Testing Pending**:
- Unit tests pass
- Regression tests pass
- UI behavior verified

⏳ **Business Validation Pending**:
- CSA can select frequency from UI
- "Auto" option works as expected
- Explicit override works correctly

---

## Related Documentation

- **P1 Implementation**: `docs/P1-IMPLEMENTATION-COMPLETE.md`
- **Implementation Plan**: `docs/payment-frequency-implementation-plan.md` (P2 Phase 0 section)
- **Verification Report**: `docs/VERIFICATION-COMPLETE.md`
- **Business Requirements**: `docs/transcription.md`

---

## Architecture Notes

### Why Explicit-Wins/Fallback Pattern?

**Pattern**:
```typescript
const paymentFrequency = input.paymentFrequency ?? derivedDefault;
```

**Benefits**:
1. **Backward Compatible**: Omitting field gives exact same behavior as before
2. **Explicit Control**: Setting field overrides default (needed for Invoice/etc)
3. **No Breaking Changes**: Existing API calls don't need updates
4. **Future Proof**: Easy to add new frequencies without touching derivation logic
5. **Clear Intent**: Code clearly shows "explicit wins, else fallback"

**Alternative (Rejected)**:
```typescript
// Always derive from loan type (no explicit selection)
const paymentFrequency = 
  input.individualLoanType === "salary" ? "semi_monthly" : "monthly";
```
**Problem**: Can't select Invoice/Bi-Monthly/etc (they don't map to loan types)

---

## Questions Answered

### ✅ Should we derive or select payment frequency?
**BOTH** - Derive as fallback, allow explicit selection to override.

### ✅ How to maintain backward compatibility?
Explicit-wins/fallback pattern: `input.paymentFrequency ?? derived`

### ✅ Which segments get new frequencies?
SME/Individual get all options. Seafarer keeps monthly/semi-monthly only.

### ✅ When to run migration?
When P2-P5 actually USE the new frequencies (not yet - Phase 0 is plumbing only).

---

**IMPLEMENTATION STATUS: COMPLETE ✅**  
**TESTING STATUS: PENDING ⏳**  
**DEPLOYMENT STATUS: NOT DEPLOYED ⏳**

---

**Ready to proceed with P2 Phase 1 (Invoice Computation Engine)?**

Or would you prefer to:
- Test P2 Phase 0 first?
- Continue with P3-P5 instead?
- Review changes before proceeding?
