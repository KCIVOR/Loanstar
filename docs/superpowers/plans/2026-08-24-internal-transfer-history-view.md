# Internal Transfer History View Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Fix known-issue **#3** from `2026-08-21-internal-transfer-known-issues.md`: `listPendingInternalTransfers` only ever returns `status = 'pending'` rows, so once AR resolves a transfer (confirm or reject) it disappears from `/ar/internal-transfers` with nowhere to look at it again. A posted transfer is at least visible afterward as a credit line in the account's ledger — but a **rejected** transfer (the reason, who rejected it, when) leaves no visible trace anywhere in the UI, even though it's saved in the database.

---

## Audit — existing precedent and exact gap

1. **The AR module already has a dedicated history page for exactly this purpose**: `/ar/history` (`src/app/ar/history/page.tsx`), reached from the sidebar as "Posting history" (`src/components/admin/Sidebar.tsx:300`). It's built as a `SegmentedControl` with two tabs today — "Closed accounts" and "Reconciled DCRRs" — each a self-contained panel (own search/segment-filter/date-range/sort/pagination/grid-or-list view state), backed by its own `GET /api/ar/history/*` route and its own query function in `src/lib/ar/history.ts` (`getClosedAccountsHistory`/`getReconciledDcrHistory`, alongside a third existing pattern `getRoundingWriteoffHistory` used by the separate `/ar/rounding-writeoffs` page). **This plan adds a third tab to the same page, following the exact same pattern** — not a new top-level nav item, not a tab bolted onto the working `/ar/internal-transfers` pending-queue page.
2. **`internal_transfers` already has everything needed for a history row**: `status` (`posted`/`rejected`), `reviewed_by`, `reviewed_at`, `rejection_reason`, plus the same `source_loan_application_id`/`source_masterlist_id`/`target_masterlist_id`/`transfer_type`/`months`/`amount`/`created_at` columns `listPendingInternalTransfers` already reads. No schema change needed — this is a read-only query addition, exactly like the other three history functions.
3. **`resolvePerformerNames`** (`src/lib/ar/history.ts:515-535`) already resolves a `performed_by`/`reviewed_by`-style actor id to a display name via `profiles` — used today by `getRoundingWriteoffHistory`. It's currently a private (unexported) helper; this plan exports it for reuse rather than duplicating it, matching how `findMasterlistIdsForSearch` is already shared across `getReconciledDcrHistory` and `getRoundingWriteoffHistory`.
4. **Search reach**: both `source_masterlist_id` and `target_masterlist_id` point at real `masterlist` rows in production (confirmed via `release-service.ts:1012-1014`, `createPendingInternalTransfers` always sets both) — `source_masterlist_id` is nullable in the schema only as a defensive column default, not a real gap. Reusing `findMasterlistIdsForSearch` against **either** FK covers borrower/account search across both sides of a transfer.
5. **Nothing about `postInternalTransfer`/`rejectInternalTransfer` or the two live SQL functions changes** — this is a pure read addition sitting beside the existing `listPendingInternalTransfers`, using the same tables, same joins style, same service-role read pattern the pending-queue route already uses (`src/app/api/ar/internal-transfers/route.ts:9-11`, `createServiceClient()` because the join crosses RLS boundaries staff policies don't uniformly cover).

---

## Architecture

- **`src/lib/ar/history.ts`**: add `InternalTransferHistoryRow`, `InternalTransferSortKey` (`"borrower" | "amount" | "reviewedAt"`), `InternalTransferHistoryQueryParams`, `InternalTransferKpiCounts` types, plus `getInternalTransferHistory(...)` and `getInternalTransferKpiCounts(...)` — modeled directly on `getReconciledDcrHistory`/`getReconciledDcrKpiCounts` (same pagination/sort/search/date-bound shape). Query `internal_transfers` where `status in ('posted', 'rejected')`, joined to `loan_applications` (source application no.), `masterlist!internal_transfers_source_masterlist_id_fkey` and `masterlist!internal_transfers_target_masterlist_id_fkey` (same named-FK join syntax `listPendingInternalTransfers` already uses). `reviewed_by` resolved to a display name via the newly-exported `resolvePerformerNames`. Export `resolvePerformerNames` (drop the missing `export` keyword — no logic change).
- **`src/app/api/ar/history/internal-transfers/route.ts`** (new): `GET`, mirrors `src/app/api/ar/history/dcr/route.ts`'s **param-parsing shape only** (`search`/`segment`/`range`/`from`/`to`/`sortKey`/`sortDir`/`page`/`pageSize`) — call the two new functions, return `{ rows, totalCount, kpi }`. `requireModulePermission("accounting_ar", "view")`. **Deliberately does NOT copy the DCR route's client choice**: the DCR route uses `createClient()` (RLS-bound, fine there since it only joins one `masterlist` relation), but this route needs `createServiceClient()` — same reasoning as point 5 above (loan_applications + two separate masterlist joins is the exact shape `listPendingInternalTransfers`'s route already needed service-role for).
- **`src/app/ar/history/page.tsx`**: add `"internal-transfers"` to the `HistoryTab` union and `TAB_OPTIONS`, add a new `InternalTransfersHistoryPanel()` component copied from `DcrHistoryPanel`'s structure (search/segment-filter/date-range/sort/pagination/grid-view), with columns: Source loan (link to `/lra/applications/[id]`), Target account (link to `/ar/masterlist/[id]`), Type (`Badge`: Other Loan / Offset (N mo)), Amount, **Status** (`Badge`: Posted = `variant="success"`, Rejected = `variant="danger"` — confirmed against the actual `Badge` component, which only supports `success/warning/danger/info/navy/teal/neutral/solid/gold/pending/inactive`; there is no `danger-soft` Badge variant, that name only exists on `Button`), Resolved by, Resolved on (sortable, default sort), and Reason (rejection reason, `—` for posted rows). Mount it as a third `hidden={tab !== "internal-transfers"}` panel, same pattern as the other two.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the verification specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.
- This plan makes **no database changes** — no migration, no confirmation gate needed for that reason. (Standard file-change review still applies.)

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `src/app/ar/internal-transfers/page.tsx`, its API routes (`confirm`/`reject`), and `src/lib/ar/internal-transfers.ts` — the working pending-queue/confirm/reject flow is untouched. This plan only adds a read-only history view elsewhere.
- `post_internal_transfer`/`reject_internal_transfer` SQL functions — no DB changes at all in this plan.
- `getClosedAccountsHistory`/`getReconciledDcrHistory`/`getRoundingWriteoffHistory` and their existing panels/routes — only read, never modified. The new tab is additive.
- `AccountsHistoryPanel`/`DcrHistoryPanel` component bodies — used as a structural reference to copy from, not edited in place.

### Touch With Extreme Care
- `resolvePerformerNames` — only change is adding the `export` keyword. No behavior change.
- `src/app/ar/history/page.tsx`'s shared state (`HistoryTab` type, `TAB_OPTIONS`, top-level `ArHistoryPage` component) — additive only (one new union member, one new array entry, one new panel mount); the two existing tabs' behavior must be unaffected.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Third tab on the existing `/ar/history` page**, not a new nav item and not grafted onto the pending-queue page. |
| 2 | **Posted and rejected shown together**, distinguished by a Status badge — one list, sorted by resolution date (`reviewedAt`) by default, matching how the other two tabs default-sort by their own "when it happened" column. |
| 3 | **Full parity with the existing tabs**: search, segment filter (by target account), date range (on `reviewedAt`), sort, pagination, list/grid view — no stripped-down version, so the new tab looks and behaves identically to its siblings. |
| 4 | **Read-only** — no new mutations, no changes to the confirm/reject flow or the SQL functions. |

---

## Phase 1: Backend — Query Functions & API Route

### Scope
Add the two new query functions and the new API route. No frontend changes yet.

### Allow List
- `src/lib/ar/history.ts`
- `src/app/api/ar/history/internal-transfers/route.ts` (new file)

### Tasks
- [x] Export `resolvePerformerNames` (add `export` keyword, no other change).
- [x] Add `InternalTransferHistoryRow`, `InternalTransferSortKey`, `InternalTransferHistoryQueryParams`, `InternalTransferKpiCounts` types.
- [x] Add `getInternalTransferHistory(supabase, params)` — `internal_transfers` where `status in ('posted','rejected')`, joined to `loan_applications` (source app no.) and both `masterlist` FKs (source + target, aliased `source_masterlist`/`target_masterlist`). Search resolves against masterlist ids from either FK. Date bounds on `reviewed_at`. Paginated.
- [x] Add `getInternalTransferKpiCounts(supabase, bounds)` — `{ totalResolved, totalPostedAmount }` exactly as specified, reusing `sumPostingAmounts`.
- [x] Add `src/app/api/ar/history/internal-transfers/route.ts` — mirrors the DCR route's param-parsing shape, uses `createServiceClient()` as planned.
- [x] **Two real defects found and fixed during live verification (not anticipated at planning time):**
  1. **Segment filter was a silent no-op.** `.eq("target_masterlist.segment", segmentFilter)` on a plain (non-`!inner`) embedded relation doesn't actually filter in PostgREST — it's silently ignored. Fixed by marking the join `masterlist!internal_transfers_target_masterlist_id_fkey!inner(...)` (safe since `target_masterlist_id` is `NOT NULL`, so the inner join never drops a legitimate row). **This means the two sibling functions this pattern was copied from (`getReconciledDcrHistory`'s and `getRoundingWriteoffHistory`'s segment filters, both using the same non-`!inner` `.eq("masterlist.segment", ...)` pattern) likely have the same silent bug in production.** Out of scope to fix here (Hard Constraint), but flagged to the user as a follow-up.
  2. **Borrower-name sort was also a silent no-op**, for a different reason: PostgREST's `foreignTable`/`referencedTable` order option only reorders rows *within* a one-to-many embed — it does not (and, per empirical testing against the live API with both option names, cannot) reorder top-level rows by a many-to-one embedded column. Confirmed via a raw isolated query test (same result with either option name; a plain top-level column sort worked fine in the same query shape, isolating the bug to the embedded-order path specifically). **Fixed for this function** by fetching everything matching the current filters (capped at 2000 rows — generous for this feature's realistic volume of a few dozen/hundred resolved transfers, not thousands) and sorting by borrower name in JS instead of at the DB level, only for `sortKey === "borrower"`; `amount`/`reviewedAt` sorts stay fully DB-side/paginated as originally planned. **The same sibling functions' "borrower" sort option likely has this identical silent-no-op bug too** — also flagged as a follow-up, not fixed here.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] Live DB check using the actual exported functions (not just hand-checked SQL), via a throwaway `tsx` script against real `createServiceClient()` — inserted one `posted` and one `rejected` test transfer (different segments, different target accounts, real `reviewed_by`), then asserted: row shape/joins/name-resolution correctness, search scoping, **segment filter actually restricts results** (post-fix), **borrower sort actually reorders in both directions** (post-fix), amount sort (worked correctly from the start, confirms the bug was isolated to the embedded-relation path). All assertions passed after the two fixes. Test data and scratch script fully cleaned up (0 leftover rows).
- [x] `git diff --stat` — only the two Allow-listed files touched (`src/lib/ar/history.ts` modified, `src/app/api/ar/history/internal-transfers/route.ts` new).

---

## Phase 2: Frontend — History Tab

### Scope
Add the third tab to `/ar/history`.

### Allow List
- `src/app/ar/history/page.tsx`

### Tasks
- [x] Add `"internal-transfers"` to `HistoryTab` and a `{ value: "internal-transfers", label: "Internal transfers" }` entry in `TAB_OPTIONS`.
- [x] Add `InternalTransfersHistoryPanel()`, structured like `DcrHistoryPanel()`: same search/segment-filter/date-range/sort/pagination/view-mode state and toolbar, fetching `GET /api/ar/history/internal-transfers`. Two KPI cards: "Total resolved" and "Total amount posted". Table/grid columns: Source loan, Target account, Type, Amount, Status, Resolved by, Resolved on, Reason.
- [x] Mount the third panel alongside the other two.
- [x] **Real defect caught and fixed before verification**: the "Resolved by" column header was wired to `toggleSort("borrower")`, but the `borrower` sort key sorts by the *target account's* borrower name (per Phase 1's design), not the reviewer's name — clicking that header would have silently sorted by an unrelated field. Fixed by moving the sortable/`toggleSort("borrower")` wiring to the "Target account" header instead, where it actually matches what it sorts by; "Resolved by" is now correctly non-sortable (no sort key exists for it, matching the plan's three sort keys).

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in the touched file.
- [x] `npm run test` — 1335 passed, 0 failures.
- [x] Lint on the touched file — 6 `react-hooks/set-state-in-effect` findings, confirmed via `git stash` diff to be 4 pre-existing + exactly 2 new, matching the identical pattern the two existing panels already use (not a new issue class, same style as the rest of the page).
- [ ] Manual walkthrough note (needs live browser): attempted via the preview tooling — the dev server started, but the browser tab lost connection immediately on navigate (`serverId` became invalid), the same failure this session has hit every time it's been tried. **Left open for the user to check manually** — open `/ar/history`, switch to the "Internal transfers" tab, confirm it renders and the links work.
- [x] Update `2026-08-21-internal-transfer-known-issues.md` — check off **#3**.

