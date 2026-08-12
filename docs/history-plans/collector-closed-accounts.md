# Collector — Closed Accounts

## Status

All 7 phases implemented, awaiting human validation.

Phase 0 audit complete, 2026-08-12. Unlike Remedial, Collector **does** have real, distinct "left the active queue" events to build a History page around — two of them, not one, so this page follows AR's two-tab precedent rather than a single-table one. Two decisions were made with the user before writing phases (see below); both apply across every phase in this file.

**Decision 1 — View action: omitted.** Collector's active queue has no per-account detail page anywhere (`/collector/accounts/[id]` does not exist — row actions are modals, not a page). Building one is real scope beyond this plan. History rows in this module will **not** have a View button, unlike every prior module — this is a deliberate, user-confirmed exception to the standing "View" requirement (tracker doc, "every History page row/card gets a View action"), justified by there being no existing target to link to.

**Decision 2 — RLS gap: fixed with a small migration.** Collectors currently have no RLS SELECT access to `remedial_turnovers` (only `accounting_ar:view`/`remedial:view` do). Phase 1 adds a policy scoped to `from_collector_id = auth.uid()` so a collector can read their own outgoing turnover rows (`turnover_reason`, `confirmed_at`, `confirmed_by`) — not org-wide, matching the narrow per-officer pattern the rest of Collector's RLS already uses.

## Phase 0 audit findings (evidence-only, 2026-08-12)

- **Active queue**: `src/app/collector/accounts/page.tsx` — fully client-side, single `fetch("/api/collector/accounts")` on mount, `useMemo` filter/sort/paginate (`PAGE_SIZE=10`). No detail page exists (`src/app/collector/accounts/[id]/page.tsx` — NOT FOUND); row actions are modals (`ContactLogModal`, `DemandLetterModal`). Columns: Borrower, Account, Balance, Aging badge, Next due, Last contact. No KPI cards today. Search: borrower name/loan account no/secondary identity. Filter: aging-bucket chips only, no status/date-range filter. Sort: `priority` (callback-due first, then aging, then balance desc, default), `balance`, `borrower`, `due`.
- **Backend**: `src/app/api/collector/accounts/route.ts:1-76`. `requireModulePermission("collection", "view")`. Query: `assignments.eq("collector_user_id", user.id).is("remedial_user_id", null)` → ids → `masterlist.in("id", ids).eq("remedial_flag", false).order("first_payment_date")` → `collector_contacts.in("masterlist_id", ids)`. **No `account_status` filter and no `closed_at` filter** — a fully paid-off account is not excluded and stays visible in the active queue indefinitely (see Phase 5).
- **Existing Collector History page** (`/collector/history`, `src/app/collector/history/page.tsx`, backed by `src/app/api/collector/payments/route.ts` and `src/app/api/collector/dcr/route.ts`) — confirmed strictly DCR + Payment records, zero references to `masterlist`/`account_status`/`closed_at`/`remedial_flag`/`assignments` anywhere in the page or its routes. This new page is additive, not overlapping, scope.
- **Two real closure events, both with genuine write paths**:
  1. **Paid off** — `account_status='paid'` set by `reconcileAndPostDcr` (`src/lib/ar/posting.ts:311-317`) or `markPaidOff` (`src/lib/ar/masterlist.ts:277`), stamped with `closed_at` by the existing `stamp_masterlist_closed_at` trigger (`supabase/migrations/20260812010000_ar_masterlist_closed_at.sql:7-27`, already live from AR's module — column-generic, needs no new migration). Directly reusable the same way AR's own `getClosedAccountsHistory` (`src/lib/ar/history.ts:102-193`) already queries it — same `account_status='paid' AND closed_at IS NOT NULL` shape, scoped to this collector's own book instead of org-wide.
  2. **Turned over to Remedial** — `remedial_flag=true`, `account_status='remedial'` set by `assignRemedial()` (`src/lib/ar/masterlist.ts:291-328`), with a real audit row in `remedial_turnovers` (`from_collector_id`, `to_remedial_user_id`, `confirmed_by`, `confirmed_at`, `turnover_reason`). Note: the aging-refresh cron can also silently flip `remedial_flag`/`account_status` to `'remedial'` without a matching `remedial_turnovers` row (no `assignRemedial()` call) — **left-join `remedial_turnovers`, don't inner-join**, and fall back to `assignments.remedial_assigned_at` (already selected in the existing query, `route.ts` pattern) with a "System (aging threshold)" label when no turnover row exists, exactly mirroring the fallback the current `/api/remedial/accounts` route already does for its own `turnedOverAt` field.
  3. **No other closure path is real** — `account_status` CHECK constraint allows `'active'|'paid'|'default'|'remedial'` (`supabase/migrations/20260707000000_p7_ar_collection.sql:47-48`), but `'default'` has zero write sites anywhere in the codebase (confirmed by full grep) — it is dead/unused, read only once for a dashboard widget bucket (`src/lib/dashboard/aggregates.ts:425`). Do not build any UI/filter around `'default'` — it never gets written.
  4. **Reassignment to a different collector** (`assignMasterlist()`, `src/lib/ar/masterlist.ts:187-217`) changes whose book an account is in, not a closure — confirmed not to be treated as one.
- **RLS**: `masterlist_ar_select` (`supabase/migrations/20260710090000_fix_masterlist_collector_rls.sql:8-29`) scopes collectors to `assignments.collector_user_id = auth.uid() AND masterlist.remedial_flag = false` — **narrow, per-officer, same shape as Remedial's own RLS**, not org-wide like CSA/Committee/AR/LRA/Agent. A Collector's Closed Accounts page will only ever show that collector's own closed/turned-over accounts, never an org-wide book — this is correct/expected given the existing RLS shape, not a gap to fix.
- **`remedial_turnovers` RLS gap**: current SELECT policy (`supabase/migrations/20260707000001_p7_rls.sql:278-284`) grants `accounting_ar:view`/`remedial:view` only — no `collection:view` clause. Fixed in Phase 1 (Decision 2 above).
- **Module permission slug**: `"collection"` (confirmed at `route.ts:8`), not `"collector"` — use this exact slug in all new routes.
- **Sidebar** (`src/components/admin/Sidebar.tsx:302-314`) — six existing children: Overview, Briefings, Accounts, Payment proofs, DCR, History (the last already occupies `/collector/history` for DCR/Payments — the new page needs a distinct label, e.g. "Closed accounts", and a distinct path, e.g. `/collector/closed-accounts`, not nested under the existing History page).

## Phase 1 — Migration: `remedial_turnovers` RLS for collectors

**Status: implemented, awaiting validation.** Applied via MCP as `collector_remedial_turnovers_rls`. Existing `remedial_turnovers_select` left intact. Empirical check: `masterlist_ar_select` collector branch still requires `remedial_flag = false`, so a collector join to a turned-over account would be empty — additive `masterlist_collector_turned_over_select` included in the same migration (authorized by this phase's risk note).

New migration, e.g. `supabase/migrations/<timestamp>_collector_remedial_turnovers_rls.sql`:

```sql
CREATE POLICY remedial_turnovers_collector_select ON public.remedial_turnovers
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('collection', 'view')
    AND from_collector_id = auth.uid()
  );
```

Additive only — does not touch or replace `remedial_turnovers_select` (the existing `accounting_ar:view`/`remedial:view` policy stays as-is; Postgres RLS policies are OR'd together). Apply via Supabase MCP (`apply_migration`), not `db push`, per the established `p8`-migration convention from the document-template-system work. After applying, verify live via `execute_sql`: confirm the policy exists and its definition matches this file exactly, and confirm a test query as a collector role can now read their own `from_collector_id` rows (same verification rigor used for AR's `closed_at` migration).

## Phase 2 — Backend: `lib/collector/history.ts` + two API routes

### Status: Implemented by Cursor — awaiting validation

Turned-over search uses the standing two-query pattern (same-table masterlist `.or()` → `.in("masterlist_id")`), not embed `.or()` and not JS-after-fetch. Aging-cron flips with no `remedial_turnovers` row are documented as invisible; no extra RLS.

New file `src/lib/collector/history.ts` (module doesn't have a `history.ts` yet):
- `getCollectorClosedAccountsHistory(supabase, collectorId, params)` — Paid-off tab: query `masterlist` scoped to `assignments.collector_user_id = collectorId`, `account_status = 'paid'`, `closed_at IS NOT NULL`, with search/date-range/sort/pagination server-side (`.eq`/`.gte`/`.lte`/`.order`/`.range`, `{count:"exact"}`, secondary `.order("id")` tiebreaker per the standing pagination-stability rule).
- `getCollectorTurnedOverHistory(supabase, collectorId, params)` — Turned-over tab: query `masterlist` scoped to `assignments.collector_user_id`... **caution**: once `remedial_flag=true`, RLS's collector clause (`remedial_flag = false`) no longer grants access via that branch — the *only* way a collector can still see a turned-over account is through `remedial_turnovers.from_collector_id = auth.uid()` (Phase 1) joined back to `masterlist`/`assignments`, not through the collector's own masterlist RLS branch (which requires `remedial_flag = false`, the opposite of what this tab needs). **Source this tab primarily from `remedial_turnovers` (`from_collector_id = collectorId`), left-joining `masterlist` for account details** — confirm during implementation that `masterlist` is still readable through this join (Postgres RLS applies per-row on the joined table too; a collector reading a `remedial_turnovers` row they own does not automatically get `masterlist` access unless one of `masterlist_ar_select`'s *other* branches also matches — the `remedial_user_id = auth.uid()` branch won't match either, since the collector isn't the remedial assignee). **This is a real risk to verify empirically in Phase 1's live-migration check, not assume** — if the masterlist join comes back null/blocked under RLS for a collector's turned-over accounts, this phase needs a matching masterlist-RLS addendum (e.g. `OR EXISTS (remedial_turnovers rt WHERE rt.masterlist_id = masterlist.id AND rt.from_collector_id = auth.uid())`) added to Phase 1's migration rather than shipping a tab that silently returns partial/empty rows.
- `getCollectorHistoryKpiCounts(supabase, collectorId)` — cheap `head:true` counts per tab, scoped to date range only (not the other tab's filters), per the standing KPI rule.
- `sanitizeSearchTerm` — same strip-`%_,()` pattern as every other module.
- Two API routes, mirroring AR's `ar/history/accounts` + `ar/history/dcr` split (same "two distinct targets, two routes" precedent — do not force one combined endpoint):
  - `GET /api/collector/history/closed-accounts?search=&range=&from=&to=&sortKey=&sortDir=&page=&pageSize=`
  - `GET /api/collector/history/remedial-turnovers?search=&range=&from=&to=&sortKey=&sortDir=&page=&pageSize=`
  - Both call `requireModulePermission("collection", "view")`.

## Phase 3 — Frontend: `/collector/closed-accounts` history page

### Status: Implemented by Cursor — awaiting validation

New page `src/app/collector/closed-accounts/page.tsx`, two-tab layout (Paid Off / Turned Over to Remedial) matching `/collector/history`'s existing tab-switcher pattern for visual consistency within the module, but its own separate route (not merged into the existing DCR/Payments history page, per the tracker's own framing of this as a distinct deliverable):
- **No View action** — per Decision 1, omit the trailing Actions column / grid button every other module's History page has.
- KPI quick-filter cards per tab (count, e.g. total closed / total turned over, date-scoped).
- Collapsible Filters panel: `DateRangeFilter` (default preset — for a History page this should still default sensibly per the original History-page convention, e.g. `"30d"` or `"all"`; follow CSA's History-page default, not the *active-queue* "All time" rule, since this is item 7 not 7.1).
- Search, sortable table, `ViewModeToggle` (list/grid/compact), page-size pagination, `Skeleton` loading on every load/refetch, two-tier empty state.
- Paid-off tab columns: Borrower, Account, Balance (at closure), Closed date, (no View).
- Turned-over tab columns: Borrower, Account, Turned-over date, Reason (`turnover_reason`, or "System (aging threshold)" fallback per Phase 2's left-join note), (no View).

## Phase 4 — Sidebar

### Status: Implemented by Cursor — awaiting validation

Add a 7th child to the existing `/collector` entry (`src/components/admin/Sidebar.tsx:302-314`):
```
{ href: "/collector/closed-accounts", label: "Closed accounts" },
```
Placed after the existing `"History"` child, matching the order other modules used (queue first, then history-type pages last).

## Phase 5 — Tests (History, `N`)

### Status: Implemented by Cursor — awaiting validation

`src/lib/collector/__tests__/history.test.mts` — pure helpers only (no PostgREST mock; AR/Agent history tests don't either).

**Notes (Phase 5):**
- Exported `sanitizeCollectorHistorySearch` (strip `%_,()`, trim, collapse whitespace), `toInclusiveStart` / `toInclusiveEnd` (`T00:00:00` / `T23:59:59.999`).
- Coverage: page-size allowlist/`clampCollectorHistoryPageSize`, sanitize, inclusive date bounds, `turnoverReasonLabel` + `SYSTEM_TURNOVER_REASON` left-join fallback (null/empty/whitespace → "System (aging threshold)").
- KPI `{ total }` is date-scoped only (ignores search) — documented in the test file; not mocked.
- No status filter spec: paid-off is always `account_status=paid AND closed_at IS NOT NULL`; turned-over is always `from_collector_id`. Sort is PostgREST `.order()`, not a JS helper.

## Phase 6 — `N.1`: `/collector/accounts` queue redesign

### Status: Implemented by Cursor — awaiting validation

Standing requirements apply (collapsible Filters, `DateRangeFilter` default **All time**, `ViewModeToggle`, page-size pagination, skeleton on every load, server-side search/filter/sort/pagination via query-param-driven `GET /api/collector/accounts`).

**Also fixes the bug found in Phase 0**: the current query has no `account_status`/`closed_at` filter, so a paid-off account never actually leaves the active queue (it stays visible indefinitely alongside the new Closed Accounts history page showing the same account as closed — a visible inconsistency if left unfixed). Add `.eq("account_status", "active")` (or equivalently `.is("closed_at", null)`) to `/api/collector/accounts`'s query, in addition to the existing `remedial_flag=false` exclusion — this is an in-scope bugfix for this redesign phase, not a separate ask, since shipping the new History page without it would make the active queue visibly wrong by comparison.

- Backend: rewrite `src/app/api/collector/accounts/route.ts` to be query-param-driven (search/aging/date-range/sort/page/pageSize), add the `account_status='active'` exclusion above.
- `lib/collector/queue.ts` — pure filter-spec/sort helpers extracted from the current `page.tsx` `useMemo` logic (aging-bucket filter spec, `priority`/`balance`/`borrower`/`due` sort, matching the existing behavior exactly aside from the bugfix).
- Frontend: rewrite `src/app/collector/accounts/page.tsx` per the standing pattern — Filters panel, `ViewModeToggle`, skeleton, always-mounted pagination/page-size. Keep existing modal-based row actions (`ContactLogModal`, `DemandLetterModal`) unchanged — out of scope for this redesign.
- Add basic KPI cards (this queue currently has none) — follow the pattern other modules use (e.g. Assigned count, Callback-due count, Aging-critical count, Total balance), matching the icon-based `Kpi` component style already used elsewhere in Collector (Remedial's `page.tsx` `Kpi` component is a close visual precedent).

**Notes (Phase 6):**
- Date filter is on `first_payment_date` (existing default order column; queue had no date filter). Inclusive `T00:00:00` / `T23:59:59.999`; date-only values are normalized to start-of-day so the from/to calendar day is included. All time → no bound.
- Paid-off exclusion is **SQL-only** on the route: `.eq("account_status", "active")` plus existing `.eq("remedial_flag", false)`. Exported `COLLECTOR_QUEUE_ACCOUNT_STATUS = "active"`. Helpers assume the mapped set is already active — they do not re-filter `account_status`. Phase 7 cannot hit PostgREST from pure helpers; assert the constant + that `computeCollectorQueueKpis` / sort / search run on the post-SQL mapped set (paid rows never arrive). Do not accept `closed_at IS NULL` as a substitute.
- Overview consumer adapted to `{ rows, totalCount, kpi }`: fetches `?range=all&sortKey=priority&page=1&pageSize=10`, uses `kpi.assigned` / `kpi.agingCritical` for Assigned / Needs attention, top-5 from returned `rows`.
- Aging refresh (`refreshMasterlistAging` under service role, loop on assigned ids **before** the masterlist select) is unchanged.
- `ContactLogModal` / `DemandLetterModal` kept as list/grid/compact row actions; no `/collector/accounts/[id]` page.

## Phase 7 — Tests (`N.1`)

### Status: Implemented by Cursor — awaiting validation

`src/lib/collector/__tests__/queue.test.mts` — page-size clamp, aging-filter spec, sort correctness, and a dedicated test asserting the `account_status='active'` exclusion behavior (paid accounts must not appear in queue results) since this is a behavior change from today, not just a redesign.

**Notes (Phase 7):**
- Paid exclusion is SQL-only: asserts `COLLECTOR_QUEUE_ACCOUNT_STATUS === "active"`, reads `src/app/api/collector/accounts/route.ts` as text, and checks `.eq("account_status", COLLECTOR_QUEUE_ACCOUNT_STATUS)` plus `.eq("remedial_flag", false)`. Asserts the route does **not** use `.is("closed_at"` as a substitute.
- Helpers covered: page-size allowlist/`clampCollectorQueuePageSize`, `agingFilterSpec`/`passesAgingFilter` (all + each AR chip + unknown → all), `sanitizeSearchTerm`, `collectorSearchPredicate`, `callbackDue` (null/future/past with injected `now`), `inFirstPaymentBounds` (null bounds pass; null date fails once bounded; date-only YYYY-MM-DD inclusive), `sortCollectorQueue` (priority: callback-due → agingNeedsAttention → balance desc; `sortDir` does not reverse priority; balance / borrower / due with null due → `"9999"`), `computeCollectorQueueKpis` (zeros on empty; assigned / callbackDue / agingCritical / totalBalance on a mixed fixture).

## Explicitly out of scope for this plan

- Building a `/collector/accounts/[id]` detail page (Decision 1 — View action omitted instead).
- Any new write action (explicit "resolve"/"write off" beyond the existing `'paid'`/`'remedial'` transitions).
- Merging this new page into the existing `/collector/history` (DCR/Payments) page — kept separate per the tracker's own framing.
- The `'default'` account_status value — confirmed dead code, not built around.
