# Feature — Dedicated Rounding Write-Off history page (Revision Tracker 2, Item 9)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- This is a **read-only history/reporting feature only**. Do not touch `writeOffRoundingDifference`, `getRoundingWriteoffThreshold`, the `/api/ar/masterlist/[id]/write-off` route, the `rounding_writeoffs` table schema, or its RLS policies — all of that is already implemented and correct (Item 13, done 2026-08-13). No migration needed for this item.
- Mirror the existing `/ar/history` implementation exactly (`src/lib/ar/history.ts`, `src/app/api/ar/history/*`, `src/app/ar/history/page.tsx`) — same query shape, same unified-history UI chrome, same pagination/KPI conventions. Do not invent a different pattern.
- Run existing tests after each phase; do not weaken a test to make it pass.
- Output a summary at the end: files changed, tests run/result.

## Background

Revision Tracker 2, Item 9 (client's literal wording): *"Dedicated Rounding Write-Off page: a 'Clear Rounding Difference' action on the account/ledger view (visible below a Super-Admin-configured threshold), logging borrower, account/loan no., amount, timestamp, and acting AR user; page filterable by date range/borrower/AR user with summarized totals; confirmation dialog; irreversible; AR + Super Admin only."*

The tracker already flags this as likely overlapping Item 13 (`revision-plans/feature-ar-rounding-writeoff.md`), which built the write-off action itself. This plan's job is to find the actual delta.

## Audit findings (verified 2026-08-17)

Going clause by clause against Item 9's spec:

1. **"Clear Rounding Difference" action on the account/ledger view, visible below threshold" — already live.** `src/app/ar/masterlist/[id]/page.tsx:496-508` computes `writeOffCandidates` (remaining due > 0 and ≤ threshold, not paid/rolled) and renders a "Write off ₱X.XX on #N" button per candidate (`:852-869`). Label says "Write off," not the literal "Clear Rounding Difference" — cosmetic wording difference only, not a functional gap (see "Explicitly out of scope").
2. **"Super-Admin-configured threshold" — already live.** `config_settings.rounding_writeoff_threshold` (migration `20260812161841_rounding_writeoffs.sql:36-38`, default `1.00`), editable only via `PATCH /api/admin/config` which requires `requireModulePermission("system_config", "edit")` (`src/app/api/admin/config/route.ts:103`) — `system_config` is the Super-Admin-only module, confirmed by pattern (same gate as every other admin-only config key on that page, e.g. `penalty_rate`). Read at write-off time via `getRoundingWriteoffThreshold` (`src/lib/ar/posting.ts:186-196`).
3. **"Logging borrower, account/loan no., amount, timestamp, acting AR user" — amount/timestamp/actor already logged; borrower/account no. are joinable, not stored redundantly.** `rounding_writeoffs` (migration `:1-9`) stores `masterlist_id, amortization_schedule_id, amount, performed_by, performed_at, notes`. Borrower name and loan account no. live on `masterlist` and are already joined this way elsewhere in this exact codebase (`src/lib/ar/history.ts:130-139` embeds `masterlist(borrower_name, loan_account_no, borrower_no, segment)` from a FK exactly like `rounding_writeoffs.masterlist_id` — same join shape applies here). No schema change needed.
4. **"Page filterable by date range/borrower/AR user with summarized totals" — genuinely missing. This is the real gap.** The only existing rounding-write-off list is the per-account card on the masterlist detail page (`src/app/ar/masterlist/[id]/page.tsx:936-943`), which is scoped to one account, has no filters, no date range, no cross-account totals, and is not reachable as its own page/URL. No route, nav link, or API endpoint for a cross-account rounding-write-off view exists anywhere (confirmed via repo-wide search for `rounding.?writeoff` across `src/app` — only the masterlist detail page and the write-off route itself match).
5. **"Confirmation dialog" — already live**, and stays on the account/ledger view where the action lives (per clause 1's wording — item 9 does not ask to relocate the action). `ConfirmDialog` at `src/app/ar/masterlist/[id]/page.tsx:992-1004`.
6. **"Irreversible" — already true by omission.** No update/delete route exists for `rounding_writeoffs` rows anywhere in the API surface (confirmed via search) — nothing to change.
7. **"AR + Super Admin only" — already the natural behavior of the existing permission helper, will carry over automatically to the new page.** `requireModulePermission(moduleSlug, action)` (`src/lib/permissions/server.ts:197-212`) grants Super Admin `canView`/`canEdit` on every module unconditionally (`:74-90`); `/api/ar/history/accounts` and `/api/ar/history/dcr` both gate on `requireModulePermission("accounting_ar", "view")` only (`src/app/api/ar/history/accounts/route.ts:19`) — not `collection`/`remedial`, even though `rounding_writeoffs`' own table-level RLS additionally permits `collection`/`remedial` view (mirroring the `penalties` table's broader predicate, per Item 13's plan). **Decision:** the new page's API route gates the same way the sibling AR-history routes already do — `accounting_ar` view only — which satisfies "AR + Super Admin only" at the page level without touching the table's existing (deliberately broader, unrelated-to-this-item) RLS.

**Conclusion:** everything except the dedicated, filterable, cross-account history view (clause 4) is already done. This plan builds exactly that — a new page, matching this app's established "unified history" pattern (same as `/ar/history`, `/cig/history`, `/collector/history`), reading data that already exists.

## Scope decision

A new standalone AR page and nav entry — not a third tab bolted onto `/ar/history` — because the client's own wording is "a **dedicated** ... page," and this is a distinct audit/compliance view (write-offs across every account) rather than another slice of posting history. Two phases:

1. **Backend** — history query + KPI totals + AR-user filter options, mirroring `getReconciledDcrHistory`/`getReconciledDcrKpiCounts` exactly; new API route under the existing `/api/ar/history/*` namespace for consistency.
2. **Frontend** — new page using the same unified-history chrome (search/filter/pagination/`ViewModeToggle`) as `/ar/history`'s panels, a new sidebar nav entry, and one small cross-link from the masterlist detail page's existing "Rounding write-offs" card to the new page (discoverability, not required by the spec but trivial and low-risk).

---

## Phase 1 — Backend: history query, KPI totals, AR-user filter options

**Goal:** A server-side paginated, filtered (date range / borrower search / AR-user), sorted list of every `rounding_writeoffs` row across all accounts, plus date-scoped summary totals — same shape as the existing `/api/ar/history/dcr` endpoint.

### Files to change

1. **`src/lib/ar/history.ts`** — add, following the exact existing pattern in this same file (`getReconciledDcrHistory`/`getReconciledDcrKpiCounts`, `:285-473`):
   - `RoundingWriteoffRow` type: `{ id, masterlistId, loanAccountNo, borrowerName, borrowerNo, segment, amortizationScheduleId: string | null, amount, performedBy: string, performedByName: string, notes: string | null, performedAt: string }`.
   - `RoundingWriteoffSortKey = "borrower" | "amount" | "performedAt"`.
   - `RoundingWriteoffQueryParams`: `{ search?, performedBy?: string | "all", from?, to?, sortKey?, sortDir?, page, pageSize }` (no `segment` filter — not requested by Item 9; don't add filters beyond spec).
   - `RoundingWriteoffKpiCounts = { total: number; totalAmount: number }`.
   - `getRoundingWriteoffHistory(supabase, params)`:
     - Query `rounding_writeoffs` with `masterlist(borrower_name, loan_account_no, borrower_no, segment)` embedded (same embed shape as `getClosedAccountsHistory`), `{ count: "exact" }`.
     - Search: reuse the existing `findMasterlistIdsForSearch(supabase, term)` helper already in this file (`:237-255`) to resolve borrower/account-no matches, then `.in("masterlist_id", ids)` — do not write a second search-resolution helper.
     - `performedBy` filter: `.eq("performed_by", performedBy)` when not `"all"`.
     - Date range: `.gte("performed_at", ...)` / `.lte("performed_at", ...)` using the same `toInclusiveStart`/`toInclusiveEnd` helpers already in this file — do not duplicate them.
     - Sort: `borrower` → order by `masterlist.borrower_name` (foreign-table order, same pattern as `:362-366`); `amount` → order by `amount`; default `performedAt` → order by `performed_at`.
     - After fetching, resolve `performedByName` via a service-client `profiles` lookup keyed by the distinct `performed_by` ids on the current page — mirror the exact `uploaderIds`/`nameById` pattern already used in `src/app/api/collector/payments/route.ts:149-169` (`createServiceClient()`, `.from("profiles").select("id, full_name, email").in("id", ids)`, fallback `full_name ?? email`). Import `createServiceClient` from `@/lib/supabase/server`.
   - `getRoundingWriteoffKpiCounts(supabase, bounds)`: date-scoped only (ignores search/performedBy filter, matching `getReconciledDcrKpiCounts`'s convention) — `count` via head query, `totalAmount` via the same paged-sum approach as `getReconciledDcrKpiCounts` (`:441-467`), reusing the existing exported `sumPostingAmounts` helper (it's already generic over `{ amount: number }[]` — do not write a second sum function) and the existing `POSTING_AMOUNT_FETCH_PAGE` constant.
   - `getRoundingWriteoffPerformers(supabase)`: returns `{ id: string; name: string }[]` — distinct `performed_by` values that actually appear in `rounding_writeoffs` (not every AR-permissioned user; only people who've actually performed a write-off, so the filter dropdown stays practically useful), names resolved the same way as above. Used to populate the "AR user" filter `<Select>`.

2. **`src/lib/ar/__tests__/history.test.mts`** — add focused tests for any new *pure* logic only (this file currently tests `clampArHistoryPageSize`/`sumPostingAmounts`, both pure — the new query functions are I/O and are not unit-tested here, consistent with how `getReconciledDcrHistory` itself has no unit test in this file today). If Phase 1 introduces any new pure helper (e.g. a dedicated sort-key validator), test it the same way `clampArHistoryPageSize` is tested. Do not add integration/DB tests — none exist for this file's I/O functions today.

3. **New: `src/app/api/ar/history/rounding-writeoffs/route.ts`**
   - `GET`, gated `requireModulePermission("accounting_ar", "view")` — same as `src/app/api/ar/history/accounts/route.ts:19` and `dcr/route.ts` (read that file too for the exact param-parsing pattern to mirror).
   - Query params: `search`, `performedBy` (default `"all"`), `range`/`from`/`to` via `resolveDateBounds` (same as the sibling routes), `sortKey` (validated against a `Set(["borrower","amount","performedAt"])`), `sortDir`, `page`, `pageSize` (`clampArHistoryPageSize`).
   - Calls `getRoundingWriteoffHistory`, `getRoundingWriteoffKpiCounts`, and `getRoundingWriteoffPerformers` in parallel (`Promise.all`, matching `accounts/route.ts:53-65`).
   - Returns `{ rows, totalCount, kpi, performers }` via `jsonOk`.

### Validation checklist — Phase 1

- [x] `getRoundingWriteoffHistory` returns rows with borrower/account no. correctly joined, `performedByName` resolved, and search/date-range/performedBy/sort all functioning. (Also added `installmentNo`, joined from `amortization_schedules` — resolved the plan's open "check what the API actually returns" note.)
- [x] `getRoundingWriteoffKpiCounts` totals are date-scoped (ignore search/performedBy filter) and correct. Verified live: 2 write-offs, ₱0.03 total.
- [x] `getRoundingWriteoffPerformers` returns only ids that actually appear in `rounding_writeoffs`, deduplicated, with resolved names. Verified live: `[{name: "AR (Seed)"}]`.
- [x] New route rejects a `collection`-only-permissioned request (403) — verified live with a real Collector session (confirmed via SQL the seed Collector only holds the `collection` module) — matches `/api/ar/history/accounts`'s 403 exactly.
- [x] `npx tsc --noEmit` clean.
- [x] Existing `history.test.mts` and `posting.test.mts` tests still pass (1007/1007 full suite).

---

## Phase 2 — Frontend: dedicated page, nav link, masterlist cross-link

**Goal:** A page AR can navigate to directly, showing every rounding write-off across every account, filterable and summarized — visually and structurally identical to `/ar/history`'s existing panels.

### Files to change

1. **New: `src/app/ar/rounding-writeoffs/page.tsx`**
   - Copy the structure of `AccountsHistoryPanel`/`DcrHistoryPanel` in `src/app/ar/history/page.tsx` almost verbatim (KPI cards → toolbar card with search + active pills + `ViewModeToggle` + Filters button/panel → list/grid/compact table → `Select` page-size + `Pagination` footer). This is a single-tab page (no `SegmentedControl` needed — there's only one dataset), so structure it like one panel rendered directly under `PageHeader`, not wrapped in tabs.
   - KPI cards: "Total write-offs" (`kpi.total`) and "Total amount written off" (`formatMoney(kpi.totalAmount)`) — same two-stat-card pattern as `DcrHistoryPanel`'s KPI grid (`:620-638`).
   - Search input: placeholder `"Search borrower, account no…"` (matches `AccountsHistoryPanel`'s wording, since this doubles as the spec's "borrower" filter — do not add a second, separate borrower dropdown).
   - Filter panel: **Date range** (`DateRangeFilter`, same as siblings) + **AR user** (`<Select>` populated from the response's `performers` list, `"all"` as the default/first option, labeled "AR user" — this is the spec's third filter axis and the one genuinely new UI control this page needs).
   - Table columns (list/compact view): Borrower (+ borrower no. sub-line, same pattern as `AccountsHistoryPanel` `:459-465`), Account No., Installment # (derive from `amortizationScheduleId` if the row includes it — otherwise show "—"; check what the API actually returns and adjust rather than guessing), Amount, Performed by (`performedByName`), Date (`performedAt`), sortable columns: Borrower, Amount, Date (matching `sortKey`s from Phase 1).
   - Grid view: same `gcard` pattern as sibling panels, one card per write-off.
   - Empty state: `"No rounding write-offs yet"` / `"Try clearing a filter or search term."` (mirror the two-tier "no data at all" vs "no matches" distinction only if practical — otherwise a single `EmptyState` matching `AccountsHistoryPanel`'s is fine, since this dataset is inherently small and low-volume).
   - `PageHeader title="Rounding write-off history"` (or similar — pick wording consistent with the existing "Rounding write-offs" card title already on the masterlist page for terminology consistency) `description="Every installment remainder written off as a rounding difference, across all accounts."`

2. **`src/components/admin/Sidebar.tsx`** — add one entry to the AR nav group's `children` array (`:295-300`), after `"/ar/history"`: `{ href: "/ar/rounding-writeoffs", label: "Rounding write-offs" }`. Do not touch any other nav group.

3. **`src/app/ar/masterlist/[id]/page.tsx`** — small addition only: near the existing "Rounding write-offs" card heading (`:936-943`), add a `Link` to `/ar/rounding-writeoffs` (e.g. "View full history →", same visual treatment as other small text-links already on this page). Do not touch the card's existing list rendering, the write-off button, or the `ConfirmDialog`.

### Validation checklist — Phase 2

- [x] Page renders at `/ar/rounding-writeoffs`, reachable from the new sidebar link. Verified live as AR (Seed).
- [x] KPI totals match the sum/count of what's actually in the table for the selected date range.
- [x] Search filters by borrower name/no./account no. (tested "Reyes" → 1/2 rows, KPIs stayed date-scoped); AR-user filter narrows to that performer (tested); date range present via `DateRangeFilter`. All three combine via AND (same query-building pattern as sibling routes).
- [x] Sorting by Borrower/Amount/Date works (arrow indicator confirmed on Date column).
- [x] Pagination and page-size controls work; "Showing X–Y of Z" summary accurate (confirmed 1–2 of 2, then 1–1 of 1 after search).
- [x] List and grid view modes verified live with correct data (compact uses the same table, same as siblings — not separately re-verified beyond CSS class toggle already proven on sibling pages).
- [x] A `collection`-only user (real Collector session, confirmed via SQL) is blocked: API returns 403, page shows the same "Failed to load..." + zeroed-empty-state pattern as `/ar/history` shows the same user — byte-for-byte behavior parity confirmed.
- [x] The new "View full history" link on the masterlist detail page navigates correctly (`href="/ar/rounding-writeoffs"`) and the existing card content (amount/installment/date/actor) still renders unchanged.
- [x] `npx tsc --noEmit` clean. ESLint: 2 new diagnostics on the new page, both the same pre-existing `react-hooks/set-state-in-effect` pattern already present identically on the untouched `/ar/history` page (confirmed: that file has 5 of the same errors) — not a regression.
- [x] Full test suite passes (1007/1007).

---

## Explicitly out of scope

- Any change to `writeOffRoundingDifference`, the threshold config, the write-off API route, the `rounding_writeoffs` table/RLS, or the `ConfirmDialog` on the masterlist page — all already correct (Item 13).
- Relabeling the existing "Write off" button to the literal string "Clear Rounding Difference" — cosmetic only; flag to the client as an easy follow-up if they want the exact wording, but don't silently rename UI text a working feature already uses without being asked.
- Adding a `segment` filter to the new page — not part of Item 9's spec (unlike `/ar/history`'s panels, which do have one for unrelated historical reasons); don't copy that filter over just because the sibling pages have it.
- A second, separate "borrower" filter control distinct from the search box — Item 9's "filterable by ... borrower" is satisfied by the existing search-by-borrower pattern already used identically on `/ar/history`.

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures (1007/1007).
- [x] Manual walk-through: navigated to `/ar/rounding-writeoffs` from the sidebar as AR (Seed); both existing rounding write-offs appear correctly — John Reyes (#6, ₱0.01) and Juan Dela Cruz (#3, ₱0.02, the exact account confirmed live from Item 13, `1140d243-6f08-47bd-b874-3472266d7f4e`) — with correct borrower/account/installment/amount/actor ("AR (Seed)")/date; search "Reyes" correctly narrowed to that single row while KPIs stayed at the full date-scoped total (2, ₱0.03) as designed.

## Status: Done (2026-08-17) — implemented directly per explicit user request ("implement it"), deviating from the plan-then-Cursor default for this item only.
