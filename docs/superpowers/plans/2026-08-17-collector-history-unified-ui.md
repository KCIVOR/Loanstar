# Collector History Unified UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/collector/history` to match the system's unified history-page design while preserving its DCRR and Payments tabs.

**Architecture:** Keep data fetching and tab data in the existing page. Add a small pure helper module for tab-specific KPI counts, filtering, date sorting, and allowed page sizes, then render both tabs through the same history chrome used by `/collector/dcr/history`.

**Tech Stack:** Next.js, React, TypeScript, existing Loanstar UI/history components, Node test runner

---

### Task 1: Define and test history behavior

**Files:**
- Create: `src/lib/collector/collection-history-ui.ts`
- Create: `src/lib/collector/__tests__/collection-history-ui.test.mts`
- Modify: `src/lib/collector/__tests__/record-payment-page.test.mts`

- [x] Write failing unit tests for page-size clamping, DCRR/payment KPI counts, date sorting, and date-range matching.
- [x] Add failing source assertions that `/collector/history` imports `CollectorKpi`, `ViewModeToggle`, `Skeleton`, and `Select`, and renders `kpi-grid`, `filter-panel`, grid cards, compact tables, and pagination summaries.
- [x] Run the focused tests and confirm failure because the helper and unified page chrome do not exist.
- [x] Implement the pure helper exports with fixed status sets and non-mutating sort behavior.
- [x] Re-run helper tests and confirm the helper assertions pass while page-source assertions remain red.

### Task 2: Apply the unified history chrome

**Files:**
- Modify: `src/app/collector/history/page.tsx`

- [x] Import and render `CollectorKpi`, `ViewModeToggle`, `Select`, and `Skeleton`.
- [x] Preserve DCRR/Payments tabs and existing API calls.
- [x] Add tab-specific KPI cards and loading skeletons.
- [x] Replace the loose chip rows with the standard bordered filter card: search, active pills, Clear action, view toggle, Filters button, and collapsible filter panel.
- [x] Render list, compact, and grid versions for both tabs.
- [x] Preserve payment uploader attribution in list, compact, and grid modes.
- [x] Add standard page-size controls and pagination summary.
- [x] Re-run focused tests and confirm all assertions pass.

### Task 3: Verify locally

- [x] Run ESLint on changed files and distinguish pre-existing diagnostics from new ones. (Clean — no output from `npx eslint` on both changed files.)
- [x] Run IDE diagnostics on changed files. (`tsc --noEmit` — zero errors in `collector/history/page.tsx` or `collection-history-ui.ts`; the 5 repo-wide errors are all pre-existing, in unrelated test files.)
- [x] Run the complete test suite. (1007/1007 passing, including the 8 focused collection-history-ui tests.)
- [x] Manually verify both tabs at `/collector/history`: KPIs, search, filters, active pills, view modes, sorting, page size, pagination, empty states, and uploader attribution. (Verified live via seeded Collector login — DCRRs tab: KPIs + sortable date column + 30-record pagination across 3 pages; Payments tab: KPIs, search filtering "Juan" correctly to 9/9 results, filter panel with Status/Segment/Date chips, grid view cards with uploader attribution, no console errors.)
- [x] Do not commit; report changed files and testing instructions.
