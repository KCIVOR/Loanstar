# CIG — Application History

## Status

**All 7 phases implemented, awaiting human validation** (2026-08-12). Phase 0 audit found a real defect, not just a cosmetic gap: CIG already has a `/cig/history` page — the user flagged it needs **fixing**. The audit found the fix is real on two independent axes, not just cosmetic:

1. **Data coverage gap (the actual defect):** `/cig/history` only ever showed one of CIG's four real event types (CI-report forwarded to Committee). The other three — returned to CSA, denial call completed, callback resolved — happen in real code paths but are surfaced **nowhere in the entire `/cig/*` tree**, not just missing from history. A file CIG returns to CSA, or a denial call CIG completes, simply vanishes from CIG's world with no trace anywhere.
2. **Missing the now-standard rollout pattern** (server-side pagination, KPI cards, `ViewModeToggle`, skeleton, date-range filter, sort) — same gap every other module had before its own redesign.

**Architecture decision — four-tab page, mirroring AR's/Collector's precedent for genuinely distinct event types** (not one merged feed): the four CIG event types have different shapes (a return has a note but no finding; a denial call has a phone-call actor; a callback has a schedule) — same reasoning AR split DCR-vs-Masterlist and Collector split Paid-vs-Turned-Over into tabs rather than one table.

**Architecture decision — a new read-only SQL view for "returned to CSA," not a new table.** `returnToCsa()` (`src/lib/cig/receipt.ts:105-108`) doesn't write to a dedicated table — it appends `{status, at, actorId, note}` into `loan_applications.status_history`, a **JSONB array column** (`src/lib/applications/status.ts:82-119`, `appendStatusHistory`). There's no reliable PostgREST way to filter/sort/paginate JSONB-array entries by nested content. Phase 1 adds a `security_invoker` view that flattens matching entries out of `status_history` into real rows, queryable exactly like any other table — additive, read-only, no new write path, and (per `security_invoker`) still enforces `loan_applications`' own existing RLS for the querying user rather than bypassing it.

## Phase 0 audit findings (evidence-only, 2026-08-12)

- **`/cig/history`** (`src/app/cig/history/page.tsx`, 324 lines) — old pre-rollout pattern: single bulk `fetch("/api/cig/history")` with no query params, `useMemo` client-side filter, client `.slice()` pagination (`HISTORY_PAGE_SIZE=10`), full-page `<Spinner/>`, no KPI cards, no `ViewModeToggle`, no `DateRangeFilter`, no sort. Search and a finding filter (positive/negative) exist but are client-side. View action already exists and is correct (`Link href="/cig/applications/${id}"`) — keep this pattern, don't rebuild it.
- **Backing route** `src/app/api/cig/history/route.ts` (17 lines) — no query params, calls `getCigRecentVerifications(supabase)` (`src/lib/cig/history.ts:80-142`), which queries `verifications` filtered `.not("forwarded_at", "is", null)`, **hard-capped at `RECENT_LIMIT=100`** (`history.ts:32,82`) with no way to page past it — a real data-access ceiling, not just missing pagination chrome.
- **Four real CIG event types, only one currently surfaced anywhere:**
  1. **CI-report forwarded to Committee** — `forwardToCommittee()` (`src/lib/cig/forward.ts:29-106`) sets `verifications.forwarded_at`/`completed_at`/`completed_by` (lines 63-73). **Currently the only thing `/cig/history` shows.** Reuse the existing query shape, just made server-side/paginated.
  2. **Returned to CSA** — `returnToCsa()` (`src/lib/cig/receipt.ts:86-109`) sets `loan_applications.blocker` (line 94) and appends a `status_history` entry via `appendStatusHistory(supabase, applicationId, "submitted", { actorId, note: "Returned to CSA by CIG — ..." })` (lines 105-108). **Not surfaced anywhere.** `status_history` shape confirmed at `src/lib/applications/status.ts:99-104`: `{ status, at, actorId, note }`, appended to a JSONB array column on `loan_applications`, no separate table.
  3. **Denial call completed** — `markDenialInformed()` (`src/lib/cig/denials.ts:74-98`) sets `denial_notices.informed_at`/`informed_by`. `/cig/denials` only ever shows *pending* calls (`.is("informed_at", null)`, `denials.ts:21-43`) and removes a row client-side once handled (`src/app/cig/denials/page.tsx:64-66`) — **completed calls are permanently invisible everywhere**, including `/cig/history`.
  4. **Callback resolved** — `callbacks.resolved_at` (table confirmed: `callbacks`, columns `id, scheduled_at, notes, loan_application_id, resolved_at`, per `getCigScheduledCallbacks`, `src/lib/cig/history.ts:147-179`). `/cig/callbacks` only shows unresolved future callbacks (`.is("resolved_at", null).gt("scheduled_at", now)`) — **resolved callbacks are invisible everywhere.**
- **`/cig` active queue** (`src/app/cig/page.tsx`, 595 lines) — a hybrid, ahead of `/cig/history` but still short of the standard pattern: already has KPI cards (`Kpi`/`kpi-grid`, lines 84-122, 362-395: "In queue", "Revisions", "Callback overdue", "Endorsed today" — keep these, standing rule against restyling existing icon KPIs applies) and client-side sort (4 keys). Still missing: server-side pagination (single bulk `fetch("/api/cig/applications")`, `useMemo`/`.slice()`), `ViewModeToggle`, skeleton loading (`if (loading) return <Spinner/>`), date-range filter. Has CIG-specific extras out of scope to touch: a "Meridian verification desk" banner strip (lines 286-320) and an attention banner (lines 322-360).
- **RLS — confirmed org-wide, not per-officer** (unlike Remedial/Collector): `verification:view` grants broad SELECT on `verifications` (`supabase/migrations/20260706140001_p4_rls.sql:11`), `denial_notices` (`supabase/migrations/20260710100000_cig_flow_alignment.sql:30-36`, also allows `committee:view`), `callbacks` (`20260706140001_p4_rls.sql:38-43`), and `loan_applications` itself (`20260710030000_fix_applications_select_staff_portals.sql:16`, among others). **No new RLS policy needed** for any of the three real tables. The new `status_history`-flattening view (Phase 1) inherits `loan_applications`' existing policy via `security_invoker` — also no new RLS grant needed, just the view definition itself.
- **Detail page** `src/app/cig/applications/[id]/page.tsx` — exists, no hard status-guard (`editable` is a boolean flag in the response, not a blocking redirect — `src/app/api/cig/applications/[id]/route.ts:249`). Confirmed safe, matches the pattern already used by every other module. View action for the two new "no application detail relevance beyond the app itself" tabs (denial calls, callbacks) still routes to the same `/cig/applications/[id]`.
- **Sidebar** (`src/components/admin/Sidebar.tsx:254-269`) — `/cig` entry has 4 children: Verification queue, Denial calls, Scheduled callbacks, and History (labeled **"Recent verifications"**, pointing at `/cig/history`). Since the page now covers more than "recent verifications" (all 4 event types), rename the label to **"History"** for consistency with how every other module's History child is labeled — cosmetic, not a defect, but worth doing since the old label actively undersells the new scope. Path stays `/cig/history` (no URL change).

## Phase 1 — Migration: `status_history` return-to-CSA view

**Status: implemented, awaiting validation.** Applied via MCP as `cig_return_to_csa_view`. Live: `reloptions = {security_invoker=true}`, `LIKE` prefix (`~~ 'Returned to CSA by CIG%'`), borrower columns embedded, `GRANT SELECT` to authenticated. Zero matching events in this environment (view queryable).

**Status: migration written, awaiting MCP apply.** File: `supabase/migrations/20260812110000_cig_return_to_csa_view.sql`. Not applied yet (parent applies via MCP). Authorized extensions vs the baseline: LEFT JOIN `borrowers` (avoid Phase 2 N+1), stable composite `id` via `WITH ORDINALITY`, `GRANT SELECT` to `authenticated` (first view in this repo; PostgREST needs it), `CROSS JOIN LATERAL` + `COALESCE` so null `status_history` does not error.

```sql
CREATE VIEW public.cig_return_to_csa_events
WITH (security_invoker = true) AS
SELECT
  la.id::text || ':' || hist.ordinality::text AS id,
  la.id AS application_id,
  la.application_no,
  la.borrower_id,
  b.borrower_no,
  b.first_name,
  b.last_name,
  b.email,
  (hist.entry->>'at')::timestamptz AS returned_at,
  hist.entry->>'note' AS note
FROM public.loan_applications la
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(la.status_history, '[]'::jsonb))
  WITH ORDINALITY AS hist(entry, ordinality)
LEFT JOIN public.borrowers b ON b.id = la.borrower_id
WHERE hist.entry->>'note' LIKE 'Returned to CSA by CIG%';

GRANT SELECT ON public.cig_return_to_csa_events TO authenticated;
```

`security_invoker = true` is load-bearing — without it, a Postgres view defaults to running with the view-creator's privileges for row visibility, which would silently bypass `loan_applications`' own RLS policy. With it, the view enforces the exact same RLS the querying user already has on `loan_applications` (confirmed at `20260710030000_fix_applications_select_staff_portals.sql:16` includes `verification:view`). The explicit `GRANT SELECT … TO authenticated` is still required so PostgREST can see the view object; it does not replace RLS. Verify live via Supabase MCP after applying: confirm the view exists with `security_invoker=true` (query `pg_views`/`pg_class.reloptions`), and confirm a `verification:view`-holding user can SELECT from it while an unrelated role cannot — same rigor used for every prior migration in this rollout.

`LIKE` not `ILIKE` — `returnToCsa()`'s note is always machine-written with an exact prefix (`receipt.ts:107`), no need for case-insensitivity; keeps the view's `WHERE` sargable.

## Phase 2 — Backend: `lib/cig/history.ts` rewrite + four API routes

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Additive rewrite of `src/lib/cig/history.ts` (existing `getCigRecentVerifications` / `getCigScheduledCallbacks` / client-filter helpers kept). Four routes under `/api/cig/history/{forwarded,returned,denial-calls,callbacks-resolved}`; old `GET /api/cig/history` untouched. Module slug is `verification`, not `cig`.

Query approach per tab:
- **Forwarded** — `verifications` `.not("forwarded_at","is",null)`; two-query identity search (`loan_applications.application_no` + `borrowers` name/email/borrower_no → `.in("loan_application_id")`); finding `.eq` on parent `verifications.finding`; `borrower` sort falls back to `forwarded_at` (2-hop PostgREST).
- **Returned** — `cig_return_to_csa_events` view directly (borrower columns already on the view); same-table `.or()` search; same-table `last_name` sort.
- **Denial calls** — `denial_notices` `.not("informed_at","is",null)`; two-query identity search then `.in("loan_application_id")`; `deniedAt` = `created_at`; `borrower` sort falls back to `informed_at`.
- **Callbacks resolved** — `callbacks` `.not("resolved_at","is",null)`; two-query identity search then `.in("loan_application_id")`; sort keys are parent/1-hop only.

Rewrite `src/lib/cig/history.ts` to add server-side, query-param-driven functions for all four tabs (keep `getCigScheduledCallbacks` as-is for `/cig/callbacks`' own unresolved-list use — these are new, separate functions, not a replacement):

- `getCigForwardedHistory(supabase, params)` — rebuilds `getCigRecentVerifications` as server-side search/date-range/sort/pagination over `verifications` (same `.not("forwarded_at","is",null)` base filter, same join shape), replacing the `RECENT_LIMIT=100` cap with real `.range()` pagination and `{count:"exact"}`.
- `getCigReturnedHistory(supabase, params)` — queries the new `cig_return_to_csa_events` view, joined/enriched with `loan_applications`/`borrowers` for display (either via a second lookup keyed by `application_id`, or extend the view to embed borrower fields directly — prefer extending the view with a join in Phase 1 if straightforward, to avoid an N+1 lookup; decide during implementation and document which was used).
- `getCigDenialCallsHistory(supabase, params)` — `denial_notices` where `informed_at IS NOT NULL`, date-scoped on `informed_at`.
- `getCigCallbacksResolvedHistory(supabase, params)` — `callbacks` where `resolved_at IS NOT NULL`, date-scoped on `resolved_at`.
- Each with a matching `get*KpiCounts` (date-scoped only, per the standing KPI rule), `sanitizeSearchTerm`, and secondary `.order("id")` pagination tiebreaker, matching the pattern every prior module's `history.ts` used.
- Four routes: `GET /api/cig/history/forwarded`, `.../returned`, `.../denial-calls`, `.../callbacks-resolved` — each `search/range/from/to/sortKey/sortDir/page/pageSize` query-param-driven, `requireModulePermission("verification", "view")`.

## Phase 3 — Frontend: `/cig/history` four-tab redesign

**Status: Implemented by Cursor 2026-08-12 — awaiting validation**

Rewrite of `src/app/cig/history/page.tsx` landed: four `fchip` tabs (Forwarded to Committee / Returned to CSA / Denial Calls / Callbacks Resolved), panels kept mounted via `hidden` so per-tab filters/sort/page persist. Each panel fetches its own Phase 2 route (`/forwarded`, `/returned`, `/denial-calls`, `/callbacks-resolved`) — old `GET /api/cig/history` is no longer called. One date-scoped `{ total }` KPI + `Skeleton variant="kpi"` while loading; collapsible Filters with `DateRangeFilter` default `"30d"`; finding chips on Forwarded (no `.filter-bar`); search debounce 300ms; sortable table; `ViewModeToggle`; page sizes `[10,20,30,50,100]`; pagination always mounted; two-tier empty (`kpi.total===0` vs `totalCount===0`). **View** on every list row and grid card → `/cig/applications/${id}` (forwarded uses `row.id`; other tabs use `row.applicationId`). Borrower sort: Forwarded + Denial send the date column and client-sort the current page; Returned sends `sortKey=borrower`; Callbacks has no API borrower key — UI still sorts the current page and sends `resolvedAt`.

Rewrite `src/app/cig/history/page.tsx`: tab switcher (Forwarded to Committee / Returned to CSA / Denial Calls / Callbacks Resolved), each tab its own panel kept mounted via `hidden` (not unmount/remount, per Collector's precedent) so per-tab filters/sort/page persist. Each panel: KPI card(s), collapsible Filters panel with `DateRangeFilter` (History default, e.g. `30d`, per the original History-page convention — not the active-queue "All time" rule), search, sortable table, `ViewModeToggle`, page-size pagination, `Skeleton` on every load/refetch, two-tier empty state. **View action**: forwarded/returned/denial-call/callback rows all route to `/cig/applications/[id]` (same detail page, confirmed safe in Phase 0) — unlike Collector, CIG does have a detail page, so the standing View requirement applies normally here.

## Phase 4 — Sidebar

**Status: Implemented by Cursor 2026-08-12**

Renamed the existing `/cig` child label in `src/components/admin/Sidebar.tsx` from `"Recent verifications"` to `"History"`. Path unchanged (`/cig/history`). Other modules' sidebar entries were not touched.

## Phase 5 — Tests (History)

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/cig/__tests__/history.test.mts` — filter-spec/sort/date-bound helpers for all four tabs, KPI counts, and the `cig_return_to_csa_events` view's note-matching logic (test the exact `LIKE` pattern against real `returnToCsa()` note strings, not a hand-rolled approximation).

**Notes (Phase 5):**
- Exported `CIG_RETURN_TO_CSA_NOTE_PREFIX` / `CIG_RETURN_TO_CSA_NOTE_LIKE` and `isCigReturnToCsaNote()` (SQL `LIKE` prefix, case-sensitive, null/empty → false).
- Coverage kept: `cigRecentMatchesSearch` / `cigRecentMatchesFinding` / `cigRecentMatchesStatus`, page-size allowlist/`clampCigHistoryPageSize`, `sanitizeCigHistorySearch`, inclusive date bounds.
- New: notes built the same way `returnToCsa()` writes (`Returned to CSA by CIG — ${note}`) must match; blocker `Returned by CIG: ${note}` must not; lowercase / unrelated / null / `""` must not; migration SQL must contain `LIKE '${CIG_RETURN_TO_CSA_NOTE_LIKE}'`.
- Forwarded finding chips stay on `cigRecentMatchesFinding` (no separate exported filter-spec helper). Sort is PostgREST `.order()`, not a JS helper.
- KPI `{ total }` is date-scoped only — documented in the test file; not mocked.

## Phase 6 — `N.1`: `/cig` queue redesign

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Standing requirements apply. Lighter than most modules since KPI cards and sort already exist (keep both, don't restyle) — needs: server-side query-param-driven `GET /api/cig/applications` (search/filter/sort/pagination), `ViewModeToggle`, skeleton loading (replace `if (loading) return <Spinner/>`), `DateRangeFilter` (default **All time**). Keep the "Meridian verification desk" banner and attention banner untouched — CIG-specific, out of scope. `lib/cig/queue.ts` — pure filter-spec/sort helpers extracted from the current `page.tsx` `useMemo`/`toggleSort` logic (4 existing sort keys, `WORK_CHIPS` filter set).

**Notes (Phase 6):**
- `getCigQueue` classification unchanged (for_verification | CIG-routed for_revision; future callbacks hidden; due/overdue flagged). Route fetches that superset then filter/sort/paginate in JS (documented justification, same as Remedial/Collector).
- Helpers in `queue.ts`: `clampCigQueuePageSize`, `workFilterSpec`/`passesWorkFilter` (delegates to `cigMatchesWorkFilter`), `cigQueueSearchPredicate`, `inEndorsedAtBounds` (inclusive on `endorsedAt`; null fails once bounded), `sortCigQueue` (priority ignores `sortDir`), `computeCigQueueKpis` over full mapped set (includes `needsAttention` for the attention banner).
- `GET /api/cig/applications` → `{ rows, totalCount, kpi }`; permission slug `"verification"`. Only consumer is `/cig` page.
- Frontend: Meridian + attention banners kept; existing clickable icon `Kpi` unchanged; Filters + `.active-pill-row` + `ViewModeToggle` + skeleton on every load; page-size `Select` + `Pagination` always mounted; two-tier empty (`kpi.inQueue===0` vs `totalCount===0`); Verify → `/cig/applications/[id]` on list/grid/compact.
- Phase 7 tests written in a follow-up pass (`queue.test.mts`).

## Phase 7 — Tests (`N.1`)

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/cig/__tests__/queue.test.mts` — page-size clamp, `WORK_CHIPS` filter-spec, sort correctness for all 4 existing keys.

**Notes (Phase 7):**
- Helpers covered: `CIG_QUEUE_PAGE_SIZES` / `clampCigQueuePageSize`, `workFilterSpec` (all 4 `WORK_CHIPS` + unknown → all), `passesWorkFilter` agrees with desk `cigMatchesWorkFilter` on shared fixtures (does not reimplement), `cigQueueSearchPredicate` (name / borrowerNo / email / applicationNo / empty term), `inEndorsedAtBounds` (null bounds pass; null endorsedAt fails once bounded; inclusive from/to), `sortCigQueue` (priority: needs-attention first then endorsedAt asc — `sortDir` does not reverse; endorsed / waiting / status honor `sortDir`; waiting treats null endorsedAt as -1), `computeCigQueueKpis` (zeros on empty; inQueue / revisions / callbackOverdue / endorsedToday / needsAttention on a mixed fixture with injected `asOf`).
- Does not mock `getCigQueue` / live Supabase. Does not duplicate `cigMatchesWorkFilter` / `cigNeedsAttention` suites already in `desk.test.mts`.

## Explicitly out of scope for this plan

- Any new write action — this plan only makes existing events (already written by `forwardToCommittee`/`returnToCsa`/`markDenialInformed`/callback resolution) visible; it doesn't add new ones.
- The "Meridian verification desk" banner and attention banner on `/cig` — CIG-specific pre-existing features, untouched.
- Backfilling history for status_history entries predating this plan — the view reads existing JSONB data as-is, no backfill needed (unlike AR's `closed_at`, which needed a trigger because the column didn't exist before).
