# Implementation Plan — Add Special Payment Schedules to Borrower Dashboard

**Status**: Proposed  
**Author**: Antigravity Assistant  
**Date**: 2026-09-18  
**Scope**: Borrower Dashboard (`/borrower`) & Borrower Application Start API (`/api/borrower/applications/reloan`)

---

## 1. Context & Background

On 2026-09-04, the system was updated (`supabase/migrations/20260904010000_add_special_payment_schedule.sql`) to introduce two special loan payment schedules for clients requiring interest-only regular payments with full principal on the final installment:
- **`quarterly_special`** ("Quarterly (Special)")
- **`two_monthly_special`** ("Two-monthly (Special)")

These options were added to:
- Database CHECK constraints on `loan_applications.payment_schedule` and `computations.payment_frequency`.
- Staff CSA Intake (`/csa/applications/new` and `createApplicationSchema`).
- Computation Panel (`ComputationPanel.tsx`), Committee override, PDC generation, AR ledger, and Move of Payment.

**The Gap**:
The Borrower Dashboard's "Start application" / "Apply for reloan" / "Apply for another loan" modal (`src/app/borrower/page.tsx`) and its corresponding backend endpoint (`src/app/api/borrower/applications/reloan/route.ts`) were never updated. Consequently:
1. Borrowers applying for clean SME or Individual loans only see the legacy 8 schedule options; the two Special schedules are invisible in the dropdown.
2. Even if sent, the backend route's `VALID_PAYMENT_SCHEDULES` whitelist discards the values and silently resets the schedule to `"monthly"`.

---

## 2. Hard Constraints & Boundaries

1. **Surgical Scope**: Touch **only** the 2 target files:
   - `src/app/borrower/page.tsx`
   - `src/app/api/borrower/applications/reloan/route.ts`
2. **Zero Breaking Changes**:
   - Existing schedules (`monthly`, `mpl`, `salary`, `weekly`, `bi_monthly`, `quarterly`, `two_monthly`, `daily`) must remain completely unchanged.
   - Collateral locking must be preserved: when collateral (`car_refinancing` or `real_estate`) is selected, the schedule must still lock strictly to `monthly`.
   - Seafarer loans must remain strictly locked to `monthly`.
3. **Exact Naming Convention**:
   - Enum values: strictly `quarterly_special` and `two_monthly_special` (snake_case).
   - Display labels: strictly `Quarterly (Special)` and `Two-monthly (Special)` (matching CSA's UI labels).
4. **No Side Effects**:
   - Do not refactor surrounding state, handlers, or table presentation.
   - Do not modify database schemas or migrations (the database constraint is already migrated and active).

---

## 3. Phase-by-Phase Implementation Plan

### Phase 1: Update Borrower API Endpoint Validation & Types
**File**: `src/app/api/borrower/applications/reloan/route.ts`

- **Line 73-82**: Extend `VALID_PAYMENT_SCHEDULES` set to include `"quarterly_special"` and `"two_monthly_special"`:
  ```typescript
  const VALID_PAYMENT_SCHEDULES = new Set([
    "mpl",
    "salary",
    "monthly",
    "weekly",
    "bi_monthly",
    "quarterly",
    "two_monthly",
    "daily",
    "quarterly_special",
    "two_monthly_special",
  ]);
  ```
- **Line 175-197**: Extend the TypeScript union type for `paymentSchedule`:
  ```typescript
  const paymentSchedule:
    | "mpl"
    | "salary"
    | "monthly"
    | "weekly"
    | "bi_monthly"
    | "quarterly"
    | "two_monthly"
    | "daily"
    | "quarterly_special"
    | "two_monthly_special" =
    (segment === "sme" || segment === "individual") &&
    body.paymentSchedule &&
    VALID_PAYMENT_SCHEDULES.has(body.paymentSchedule)
      ? (body.paymentSchedule as
          | "mpl"
          | "salary"
          | "monthly"
          | "weekly"
          | "bi_monthly"
          | "quarterly"
          | "two_monthly"
          | "daily"
          | "quarterly_special"
          | "two_monthly_special")
      : "monthly";
  ```
- **Safety check**: Note that `validateCollateralPaymentSchedule(collateralType, paymentSchedule)` already runs immediately after this (line 198) and enforces that any non-monthly schedule with collateral returns a 400 error.

---

### Phase 2: Update Borrower Dashboard UI & Types
**File**: `src/app/borrower/page.tsx`

- **Line 83-91**: Extend `StartPaymentSchedule` type:
  ```typescript
  type StartPaymentSchedule =
    | "mpl"
    | "salary"
    | "monthly"
    | "weekly"
    | "bi_monthly"
    | "quarterly"
    | "two_monthly"
    | "daily"
    | "quarterly_special"
    | "two_monthly_special";
  ```
- **Line 1084-1098**: Add the two option elements to `<Select id="start-schedule-type">` when not collateral-locked, in the identical position and phrasing as CSA:
  ```tsx
  <Select
    id="start-schedule-type"
    value={pickerPaymentSchedule}
    disabled={pickerPaymentScheduleLocked}
    onChange={(e) =>
      setPickerPaymentSchedule(e.target.value as StartPaymentSchedule)
    }
  >
    <option value="monthly">Regular (Monthly)</option>
    {!pickerPaymentScheduleLocked ? (
      <>
        <option value="mpl">MPL (Multi-Purpose Loan)</option>
        <option value="salary">Salary (semi-monthly)</option>
        <option value="weekly">Invoice Financing (Weekly)</option>
        <option value="bi_monthly">Bi-monthly (every 15 days)</option>
        <option value="quarterly">Quarterly</option>
        <option value="quarterly_special">Quarterly (Special)</option>
        <option value="two_monthly">Two-monthly</option>
        <option value="two_monthly_special">Two-monthly (Special)</option>
        <option value="daily">Daily</option>
      </>
    ) : null}
  </Select>
  ```

---

### Phase 3: Verification & Regression Testing

1. **Automated Unit Tests**:
   - Run `npm test` to ensure zero regressions across existing borrower and computation test suites.
   - Add/verify test coverage for `reloan` route schedule validation.
2. **Typecheck**:
   - Run Next.js build / TypeScript typecheck to guarantee zero typing mismatches or unhandled union cases.
3. **Manual Verification**:
   - Open Borrower Dashboard (`/borrower`) as a test borrower.
   - Click "Start application" (or "Apply for reloan").
   - Select `SME (Small & Medium Enterprise)` or `Individual`, with `Clean (no collateral)`.
   - Confirm dropdown contains:
     - `Quarterly`
     - `Quarterly (Special)`
     - `Two-monthly`
     - `Two-monthly (Special)`
   - Select `Quarterly (Special)` and click Continue.
   - Verify draft application is created with `payment_schedule: 'quarterly_special'`.
   - Switch collateral to `Car Refinancing` or `Real Estate` and verify schedule locks to `Regular (Monthly)`.

---

## 4. Rollback Strategy
Because this change is purely additive (expanding the allowed string union in 2 client/server files), rollback is instantaneous and safe: reverting the two file diffs restores prior behavior with zero database schema alterations needed.
