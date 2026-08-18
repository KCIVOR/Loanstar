# Collector History Unified UI

**Date:** 2026-08-17
**Status:** Approved

## Goal

Align `/collector/history` with the system's unified history-page design, using `/collector/dcr/history` as the primary reference while preserving both DCRR and Payments tabs and all existing data behavior.

## Layout

The page follows the standard history order:

1. `PageHeader`
2. DCRRs / Payments tab chips
3. Tab-specific `CollectorKpi` cards with loading skeletons
4. A bordered filter card containing:
   - search
   - active filter pills and clear action
   - `ViewModeToggle`
   - Filters button with active count
   - collapsible filter panel
5. list, grid, or compact results
6. page-size selector and pagination summary

## Tab behavior

### DCRRs

- KPIs: Submitted, Reconciled, Rejected.
- Search: DCRR ID or status.
- Filters: status and date range (`Recent (30d)` or `All`).
- Draft DCRRs remain visible because the current page already includes them.

### Payments

- KPIs: Pending, Confirmed, Posted, Rejected.
- Search: borrower, account number, reference, or status.
- Filters: payment status, segment, and date range.
- The existing `Recorded by {name}` attribution remains visible in every view.

## Views and pagination

- `list` uses the current full tables.
- `compact` uses the same tables with compact density.
- `grid` uses history cards containing the same core row information.
- Page sizes use the standard `[10, 20, 30, 50, 100]` options.
- Changing tab, filters, search, sort, view-relevant data, or page size returns pagination to page 1.
- Date sorting is available in list and compact modes.

## Scope

- No API, database, permission, or route changes.
- No change to DCRR/payment definitions or status transitions.
- No refactor of other history pages.
- Reuse existing shared UI components and history CSS classes.

## Testing

Add source-level UI assertions for the unified components and unit tests for tab-specific filtering, KPIs, sorting, and pagination helpers. Verify the full existing test suite.
