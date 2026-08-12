# Remedial — Closed Cases

## Status

**Item 6 (History page) is Skipped, not deferred-silently — user decision 2026-08-12.** Phase 0 audit found Remedial has no "closed case" concept anywhere in the codebase to build a History page around:

- Zero write actions exist under `/api/remedial/**` — both `src/app/api/remedial/accounts/route.ts` and `src/app/api/remedial/accounts/[id]/route.ts` are `GET`-only. Nothing lets an officer explicitly resolve, cure, restructure, write off, or return a case to Collector.
- The only thing that ever flips `masterlist.remedial_flag` back to `false` is the aging-refresh cron (`refresh_one_masterlist_aging()`, latest definition in `supabase/migrations/20260807090000_sme_phase5_penalty_segment.sql:227`) recomputing the aging bucket — silent, no actor/reason/timestamp logged anywhere.
- `remedial_turnovers` (`supabase/migrations/20260707000000_p7_ar_collection.sql:155-164`) is entry-log-only: `from_collector_id`, `to_remedial_user_id`, `confirmed_by`, `turnover_reason`, `confirmed_at`, `created_at` — records going *into* remedial, no resolution/status column at all.
- Byproduct bug found (out of scope for this plan, noted for the tracker/user): `reconcileAndPostDcr` (`src/lib/ar/posting.ts:300-317`) sets `account_status: 'paid'` on full payoff but never touches `remedial_flag`/`aging_bucket`, and the aging cron (`src/app/api/collector/accounts/route.ts:11-15,29`, and the SQL cron's `WHERE account_status IN ('active','remedial')`) never revisits an account once it's assigned to remedial. Net effect: a fully paid-off remedial account never leaves the *active* Remedial queue.

Building History today would mean faking a "closed" signal off that undocumented cron flip (no actor/reason, and doesn't even fire for the common "paid off" case) or shipping an empty page. User chose to skip it rather than ship something misleading. **If real resolve/return-to-collector actions get built into Remedial later, revisit this file and add a History phase on top of that new event log — do not retrofit it onto `remedial_flag` alone.**

**Item 6.1 (queue redesign) proceeds on its own** — it doesn't depend on a "closed" concept, only on the existing active `/remedial` queue. This file covers 6.1 only.

## Phase 0 audit findings (re-verified 2026-08-12, evidence-only)

- **`src/app/remedial/page.tsx`** (current queue) — fully client-side. Single `fetch("/api/remedial/accounts")` on mount (`page.tsx:141`), then `useMemo` search/severity-filter (`page.tsx:169-188`), `useMemo` sort (`page.tsx:190-212`), and a manual `PAGE_SIZE=10` client-side slice (`page.tsx:214-216`) — the exact "bulk fetch + client filter" pattern the server-side standing requirement exists to replace.
- **Columns**: Borrower (name + SME badge + secondary identity [manning agency/vessel] + borrower_no), Account (`loan_account_no`), Severity badge + aging-bucket badge, Outstanding, DPD, Next due (date + amount), Turned over (date + "from {collector name}").
- **KPIs** (`page.tsx:271-291`): Assigned (`accounts.length`), Critical (severity==='critical' count), Avg DPD, Outstanding (sum) — currently computed from the full unfiltered `accounts` array, i.e. **not** affected by the severity chip or search — this must be preserved when moving server-side (KPI query/computation independent of the row filters, same rule CSA/Committee/AR/LRA/Agent followed for their KPI cards).
- **Search** (`page.tsx:169-188`): borrower name, borrower_no, loan_account_no, secondary identity (manning agency/vessel) — all case-insensitive substring.
- **Sort keys** (`page.tsx:190-212`): `priority` (severity rank then balance desc, default), `balance`, `dpd`, `borrower`, `turned`.
- **Severity filter chips** (`page.tsx:330-356`): all / critical / elevated / watch.
- **No date-range filter exists today** — this redesign adds one, scoped to `turnedOverAt` (the closest analog to "when did this enter the active queue," matching the standing default of **All time**, not Last 30 days — an active queue must not hide old-but-still-open items).
- **Backend** (`src/app/api/remedial/accounts/route.ts`) — `GET` only, no query params read at all today. Scoped by `requireModulePermission("remedial", "view")` (`route.ts:27`) plus `.eq("assignments.remedial_user_id", user.id)` and `.eq("remedial_flag", true)` (`route.ts:70-71`) — **this queue is inherently per-officer** (each remedial user only ever sees their own assigned caseload), unlike every other module's queue which is module-wide. This bounds the realistic row count per request to one officer's personal caseload (tens, not thousands), which matters for the fallback pattern below.
- **Severity and DPD are computed values, not stored columns.** `remedialDaysPastDue()` and `remedialSeverity()` (`src/lib/remedial/desk.ts`, imported at `route.ts:4-7`) derive from `amortization_schedules` fetched per-row (`route.ts:53-60,116-126`) — there is no SQL column to `.order()`/`.eq()` on for the `priority`/`dpd` sort keys or the severity filter chip. This is the same shape of problem LRA hit with `isCompletedLraQueueItem` and Agent hit with `leadPipelineStage()` — **both were resolved with an explicitly-authorized fetch-superset-then-filter/sort/paginate-in-the-route-handler fallback**, never shipped to the client as a bulk array. Given this queue's per-officer scoping already bounds volume tightly (tighter than LRA's or Agent's module-wide queues were), the same fallback applies here and is pre-authorized by this plan: fetch the officer's full assigned+flagged set in the route handler (unchanged query shape from today), compute `severity`/`dpd`/`turnedOverAt` server-side exactly as today, then filter (search, severity chip, date range) + sort + paginate **in the route handler**, returning only the requested page to the client — not client-side `useMemo` as today. Document this choice in a code comment, same as LRA/Agent did, rather than silently picking it.
- **Detail page** `src/app/remedial/accounts/[id]/page.tsx` — exists, pure display, no status guard blocking access (confirmed in Phase 0 research). Not part of this redesign (no History "View" action needed here since item 6 is skipped) — left untouched.
- **Sidebar** (`src/components/admin/Sidebar.tsx:316-329`) — already has one child (`Recovery queue`, pointing at `/remedial`). **No sidebar change in this plan** — since item 6 (History) is skipped, there's no second child to add. Leave as-is.

## Phase 1 — Backend: query-param-driven `GET /api/remedial/accounts`

**Status: implemented, awaiting validation.**

Rewrite `src/app/api/remedial/accounts/route.ts` to read query params and do filtering/sorting/pagination server-side, per the fallback justified in Phase 0:

`GET /api/remedial/accounts?search=&severity=all|critical|elevated|watch&range=30d|90d|all|custom&from=&to=&sortKey=priority|balance|dpd|borrower|turned&sortDir=asc|desc&page=1&pageSize=10`

- Keep the existing Supabase query exactly as-is (`route.ts:30-72`, including the `assignments!inner` + `remedial_flag=true` scoping and the `remedial_turnovers` join for `turnedOverAt`/`turnoverReason`/`fromCollectorName`) — this fetch is the "superset" for one officer's caseload, unchanged.
- Keep the existing per-row mapping (severity, dpd, next due, turnover fields) exactly as today (`route.ts:116-188`).
- Add, after mapping, in the route handler (not the client):
  - **Date range**: filter mapped rows by `turnedOverAt` using `resolveDateBounds` from `@/components/history` (same helper every other module's route imports — confirm it has no `"use client"` pragma, already verified true for prior modules) with default preset `"all"`.
  - **Search**: case-insensitive substring over borrower name, borrower_no, loan_account_no, and `masterlistSecondaryIdentity` (manning agency/vessel) — same fields as today's client-side search (`page.tsx:169-188`), just moved server-side. Use the existing `sanitizeSearchTerm` pattern (strip `%_,()`) even though this is JS `.includes()` not a Postgres `.ilike()` — keep behavior consistent with other modules' search-sanitization intent.
  - **Severity filter**: `all | critical | elevated | watch` exact match, same as today's chips.
  - **Sort**: same 5 keys/logic as `page.tsx:190-212`, moved into the route.
  - **Pagination**: `page`/`pageSize` (allowlist page sizes matching other modules — reuse `AGENT_LEADS_QUEUE_PAGE_SIZES`-style constant, i.e. `[10, 20, 30, 50, 100]`, clamp invalid to 10), slice the filtered+sorted array, return only that page's rows.
- **KPI values** (`assigned`, `critical`, `avgDpd`, `outstanding`) computed from the **full unfiltered mapped set** (before search/severity/date-range are applied), matching today's behavior where KPIs don't move when the severity chip changes — do not scope KPI to the row filters.
- Response shape: `{ rows, totalCount, kpi: { assigned, critical, avgDpd, outstanding } }`.
- Add a short code comment at the fetch site explaining the fetch-superset-then-filter-in-route choice and why (computed severity/dpd fields, per-officer-bounded volume) — same transparency LRA's and Agent's implementations used.

## Phase 2 — Shared pure filter-spec helpers + tests

**Status: implemented and validated.** Route delegates sort/search/KPI/page-size to `lib/remedial/queue.ts`; helpers match Phase 1 semantics; tests cover clamp, severity chips, search, 5 sort keys, KPI, and `severityRank` agreement. No Critical findings.

New file `src/lib/remedial/queue.ts` (module doesn't have a `queue.ts` yet — only `desk.ts` for severity/dpd calc):
- `RemedialQueuePageSize` allowlist + `clampRemedialQueuePageSize()`.
- `severityFilterSpec(raw)` → `{mode:"all"} | {mode:"eq", severity}`.
- `passesSeverity(severity, spec)`.
- `remedialSearchPredicate(row, term)` — pure function over the mapped row shape, testable without Supabase.
- `sortRemedialQueue(rows, sortKey, sortDir)` — pure, extracted from `page.tsx:190-212` logic.
- Route (`route.ts`) imports and uses these instead of inlining filter/sort logic, matching how every other module's route delegates to its `lib/<module>/queue.ts`.

New test file `src/lib/remedial/__tests__/queue.test.mts` — mirror the structure of `src/lib/agent/__tests__/queue.test.mts` (page-size clamp table, filter-spec mapping for every chip the page exposes, sort correctness for all 5 keys, agreement checks against `severityRank`/`remedialDaysPastDue` from `desk.ts` rather than reimplementing).

## Phase 3 — Frontend: `/remedial` queue redesign

**Status: implemented.** `src/app/remedial/page.tsx` is query-param-driven against `GET /api/remedial/accounts` (`{ rows, totalCount, kpi }`), with 300ms debounced search, collapsible Filters + `DateRangeFilter` (default `"all"`), `.active-pill-row`, `ViewModeToggle` + `.gcard`, always-mounted page-size/Pagination, KPI+table skeletons (no full-page Spinner), and two-tier empty states. Icon `Kpi` cards, PageHeader, critical banner, severity chips, and original columns (plus Open) preserved.

Rewrite `src/app/remedial/page.tsx` to be query-param-driven against the new route, matching the shared pattern from every prior `N.1`:
- Collapsible **Filters panel** (`.filter-panel`) containing: `DateRangeFilter` (default "All time"), severity filter (keep as chips or move into the panel — follow CSA/Agent precedent of keeping quick-filter chips outside the panel for the most common facet, here severity, and using the panel for the date range only).
- Active-filter pill row uses `.active-pill-row` (never `.filter-bar`, which has `width:100%` and breaks one-line toolbars — the CSA bug, must not reoccur).
- `ViewModeToggle` (list/grid/compact) — reuse unchanged from `@/components/history`.
- Search input debounced ~300ms before triggering a re-fetch.
- Page-size `Select` + `Pagination` — **always mounted**, never hidden during a refetch.
- **Skeleton loading**: replace the current `if (loading) return <Spinner />` (`page.tsx:233`, blanks the whole page) with the standing pattern — static shell (PageHeader, toolbar, filters) always rendered, `Skeleton variant="kpi"` for the 4 KPI cards and `Skeleton variant="line"` table-body rows (via `Td colSpan`) whenever `loading` is true, on **every** refetch, not just first load.
- Two-tier empty state: `kpi.assigned === 0` → "No accounts assigned" (real empty caseload) vs. `totalCount === 0` with `kpi.assigned > 0` → "No matching accounts" (filters excluded everything) — same distinction CSA/Committee established, gated on `loading` so it never flashes with stale/zeroed data.
- Keep the existing `critical > 0` warning banner (`page.tsx:248-269`) — unrelated to this redesign, don't remove.
- Keep existing icon-based KPI cards (`Kpi` component, `page.tsx:90-110`) as-is — standing rule: don't restyle to History's plain style, only add missing pieces (there's nothing missing here since item 6 doesn't exist).

## Phase 4 — Tests

**Status: implemented.** `npm test` 650/650 pass, 0 fail (desk tests unchanged; queue helper tests included). Count grew from 624 after Agent by this item's new tests plus any intervening modules.

- `src/lib/remedial/__tests__/queue.test.mts` (Phase 2, above).
- Confirm existing `src/lib/remedial/__tests__/desk.test.mts` (severity/dpd calc), if it exists, still passes unchanged — this plan doesn't touch `desk.ts`.
- Run full `npm test`, confirm total count only grows by this phase's new tests (currently 624 after Agent), no regressions elsewhere.

## Explicitly out of scope for this plan

- Item 6 (History page) — skipped per the Status section above.
- The `reconcileAndPostDcr`/aging-cron `remedial_flag` desync bug found during Phase 0 — flagged to the user, not fixed here (would need its own scoped plan: likely stamping `remedial_flag=false` and a resolution timestamp directly in `reconcileAndPostDcr` when payoff clears an account that was in remedial, or extending the aging cron to also revisit `remedial`-assigned accounts). Revisit if/when the user wants Remedial resolution actions built (which would also unblock item 6).
- Any new write action (`resolve`, `return-to-collector`, etc.) — not requested by the user's decision for this round.
