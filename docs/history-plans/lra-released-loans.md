# LRA (Release) — Released Loans (step-by-step)

Part of the module history/closed-records rollout. See `loanstar/docs/history-closed-records-tracker.md` for the workflow rules, all four standing requirements, and overall status across all 7 modules.

**Goal:** once a loan file is closed out and transmitted to AR, LRA staff have no way to look it back up — the active queue (`release_queue`) only shows in-progress files. This adds a read-only **Released Loans** history page at `/lra/history`, plus a redesign of the existing `/lra` active-release-queue page.

## Phase 0 — Audit findings (evidence, verified 2026-08-12)

**No migration needed — unlike AR, LRA already has a proper event log.** `release_events` (`supabase/migrations/20260706160000_p6_lra_release.sql:69-81`: `id, release_file_id, event_type CHECK IN ('check_released','cash_released','transmitted','closed'), notes, signed_voucher_document_id, acted_by, acted_at DEFAULT now()`) already gets a `'closed'` row inserted, with a real `acted_at` timestamp, at the exact moment `closeRelease()` finishes (`src/lib/lra/release-service.ts:769-784`). No `closed_at`-style column needs adding to any table — just query this existing event log.

**The correct "left the queue" marker is `release_files.status = 'closed'`, not `loan_applications.status`.** This is the one genuinely tricky part of this module: `loan_applications.status` keeps moving *after* LRA is done — `recordRelease()` sets it to `"released"`, `closeRelease()` moves it to `"closed"` **and** upserts an `ar_queue` row, then AR's own explicit "receive" action (`POST /api/ar/queue/[id]/receive`, a *different module's* user action, `src/lib/ar/masterlist.ts:179-182`) moves it again to `"loan_active"`, and later to `"paid_off"` once AR/Collector work continues. So by the time a loan is genuinely history-worthy from LRA's perspective, `loan_applications.status` may already say something else entirely (confirmed via code comment, `release-service.ts:791-793`: *"AR hand-off stops here... The masterlist account is created when AR explicitly receives the file, not automatically at close."*). **`release_files.status`, once `'closed'`, is never written again by any code path** — that's the stable, LRA-owned terminal marker to query on, exactly the same lesson AR's audit surfaced about `account_status`.

**Base table for History is `release_files`, not `release_events`.** Query `release_files WHERE status = 'closed'`, with `release_events` embedded (`!inner`, filtered to `event_type = 'closed'`) purely to source the `acted_at` timestamp — since exactly one `'closed'`-type event exists per closed file (the close flow only runs once; no code path re-closes an already-closed file), this embedding is a clean 1:1 join, not a fan-out. This differs from Committee's model (one row per *action event*, since an application can be decided on multiple times) — LRA's release pipeline is linear per file, so History is one row per *closed file*, same "per-entity, not per-event" shape as CSA's.

**Amount comes from a direct FK, not a "latest active version" lookup.** `release_files.computation_id` is a scalar FK pinned to the exact computation version that was actually used for that release (`release-service.ts:49-53` and used throughout, e.g. `release-service.ts:277`). This is **more correct** for a closed historical record than CSA/Committee/AR's "latest active computation" pattern (which exists because those modules query computations by `loan_application_id` with no natural 1:1 pin) — for LRA, just join `computations` directly on `release_files.computation_id`, no version-picking logic needed at all.

**Search needs the same multi-step approach as Committee's**, since `release_files` has neither `application_no` nor a borrower relation directly, only `loan_application_id`: (1) `borrowers` → matching ids, (2) `loan_applications` → `.select("id").or("application_no.ilike...,borrower_id.in.(...)")` → matching ids, (3) main `release_files` query `.in("loan_application_id", ids)`.

**Release path (`with_pdc` / `without_pdc`) is worth a filter dimension** — `release_files.release_path` (set at `release-service.ts:123`, values confirmed via grep: `"with_pdc"` / `"without_pdc"`) is already a meaningful, already-shown column on the active queue (`src/app/lra/page.tsx:525-531`, labelled "Path"). Unlike AR's `default`/`dcr.rejected` (confirmed dead), this one is real and populated on every release file — include it as a simple filter group, not a bucketed/derived one.

**PDC physical collection is a sub-step, not a separate history event.** `confirmPdcCollected()` (`src/lib/lra/pdc-collect.ts:102-165`) only stamps `release_files.pdc_collected_at`/`pdc_collected_by`, doesn't change `status`, and is a hard precondition for `closeRelease()` on `with_pdc` files (`assertPdcCollectedForClose`, `release-service.ts:719-722`) — every closed `with_pdc` row is guaranteed to have it set. Surface it as a **column** on the history row (e.g. "PDC collected: [date]" for `with_pdc` rows), not a separate filterable event.

**Detail page is safe to link to.** `/lra/applications/[id]/page.tsx` (1438 lines) has no `redirect`/`notFound`/status guard — a closed file just shows a green "Closed" banner instead of the workflow action cards; computation summary, documents, PDC schedule all remain visible. Same precedent as every other module.

**RLS needs no changes** — `release_lra:view` already has unconditional SELECT on `loan_applications` (shared staff-portals policy, same as every module), `release_files`, and `release_events` (all confirmed in `supabase/migrations/20260706160001_p6_rls.sql`, no status predicates anywhere).

**Sidebar** is currently a flat entry (`Sidebar.tsx:271`, no `children`) — needs the same `children` treatment as every other module.

**The active `/lra` queue page is architecturally different from every other module's pre-redesign queue** — it's not driven by a status filter on `loan_applications`, it's driven by membership in a separate `release_queue` table (`listLraQueue`, `src/lib/lra/release-service.ts:797-864`), joined to `loan_applications`/`borrowers`/`release_files`, with **no query-level status filter at all** — every row ever queued is returned, and a client-side `scopeFilter` (`active` / `completed` / `all`) plus `isCompletedLraQueueItem()` (`src/lib/lra/queue-classify.ts:23-42`: complete when `release_files.status ∈ {released,closed}` OR `loan_applications.status ∈ {paid_off,closed}` OR blocker starts with `"Released"`) does the active/completed split in the browser. The redesign (Phase 5/6) needs to replicate this classification server-side, not just bolt on the standard toolbar — this queue is closer to AR's in complexity than to Committee's.
- Already has more toolbar than most pre-redesign queues: search, a Scope dropdown, and a dynamically-populated Status dropdown (`src/app/lra/page.tsx:308-448`) — but no date range, no view modes, no collapsible Filters panel, no page-size selector, fully client-side.
- KPIs (icon-based, keep unchanged per standing precedent): Active in queue, Setup/encoding, Awaiting briefing, Ready to release — computed via `lraQueueBucket` classification, from the *active* subset only.
- `release_queue.queued_at` is the natural date-range field (parallels CSA's `created_at`, Committee's `forwarded_at`) — default preset `"all"`, per the standing rule.

## Explicitly out of scope for this plan

- Any change to `recordRelease`/`closeRelease`/`confirmPdcCollected` business logic — read from, not modified.
- `src/app/lra/applications/[id]/page.tsx`, its API route — untouched.
- `src/app/api/ar/queue/**` — reference only (confirms AR's hand-off is a separate later event), not touched.
- `release_queue` table's own DDL was not directly re-confirmed against a `CREATE TABLE` statement in the audit (only inferred from usage) — if Phase 1/5 implementation finds its actual schema differs from what `listLraQueue`'s query assumes, stop and report rather than guessing further.

---

## Phase 1 — Backend: `lib/lra/history.ts` + `GET /api/lra/history`

### Files to change

1. **`src/lib/lra/format.ts`** (new file) — `formatDate`/`formatMoney`, same shape as every other module's.
2. **`src/lib/lra/history.ts`** (new file)
   - `export type ReleasedLoanRow = { id (release_files.id), applicationId, applicationNo, borrower: {...} | null, releasePath: "with_pdc"|"without_pdc"|null, loanTypeName: string|null, netReleased: number|null, pdcCollectedAt: string|null, closedAt: string }`.
   - `export type ReleasedLoansQueryParams = { search?, releasePath?: "with_pdc"|"without_pdc"|"all", from?, to?, sortKey?: "applicationNo"|"borrower"|"closedAt", sortDir?, page, pageSize }`.
   - `export async function getReleasedLoansHistory(supabase, params): Promise<{ rows: ReleasedLoanRow[]; totalCount: number }>` — base `.from("release_files").select("id, loan_application_id, release_path, computation_id, pdc_collected_at, loan_applications(application_no, borrowers(borrower_no,first_name,last_name,email)), computations(loan_type_name, net_released), release_events!inner(acted_at)", { count: "exact" }).eq("status","closed").eq("release_events.event_type","closed")`, plus `.eq("release_path", ...)` when filtered, `.gte`/`.lte` on the embedded `release_events.acted_at` (plain AND-filter on an embedded column — same reliably-supported case as Committee's TAT-overdue KPI, not the fragile `.or()` case), the 3-step search from Phase 0 when a term is present, `.order()` + `.order("id", {ascending:true})` tiebreaker (per AR's validated precedent — don't skip this, it prevents inconsistent pagination when many rows share a timestamp) + `.range()`.
   - `export async function getReleasedLoansKpiCounts(supabase, {from,to}): Promise<{ total: number }>` — one count, date-scoped only (no status-group dimension here, same as AR's Closed Accounts tab — every row is equally "closed").
   - Reuse the same `sanitizeSearchTerm`/`toInclusiveStart`/`toInclusiveEnd` helpers pattern (duplicate, don't cross-import — same rationale as every prior module).
3. **`src/app/api/lra/history/route.ts`** (new file) — `requireModulePermission("release_lra","view")`, parse/allowlist params (`search`, `releasePath`, `range`/`from`/`to` default `30d`, `sortKey`, `sortDir`, `page`, `pageSize`), `Promise.all`, return `{ rows, totalCount, kpi }`.

### Status: DONE (2026-08-12)

Implemented:
- `src/lib/lra/format.ts` — `formatDate` / `formatMoney`
- `src/lib/lra/history.ts` — `getReleasedLoansHistory` / `getReleasedLoansKpiCounts`, `releasePathFilterSpec`, `clampReleasedLoansPageSize`, `RELEASED_LOANS_PAGE_SIZES`
- `src/app/api/lra/history/route.ts` — `requireModulePermission("release_lra","view")`, default range `30d`, `{ rows, totalCount, kpi }`

---

## Phase 2 — Frontend: `/lra/history` page

### Files to change

1. **`src/app/lra/history/page.tsx`** (new file, `"use client"`) — follow `src/app/csa/history/page.tsx` as the template (query-string `load()`, 300ms-debounced search, `loading`-gated skeleton on every load, `Pagination`/page-size `Select` rendered unconditionally, single-tier empty state).
   - KPI row: 1 plain `.card.stat` ("Total released") — no click-to-filter grid, same treatment as AR's Closed Accounts tab (nothing to filter *to* besides all/one release path, which gets its own chip below).
   - Toolbar: search, `.active-pill-row` (not `.filter-bar`), `ViewModeToggle`, Filters button → collapsible panel with two groups: "Release path" (All / With PDC / Without PDC chips) and "Closed date" (`DateRangeFilter`).
   - Table columns: Application No. (mono, primary, sortable), Borrower (sortable), Loan Type, Net Released (num, mono, teal-when->0, client-current-page-only sort — computations join here isn't a 1:1-orderable server column the same reliable way `application_no`/`borrower` are, treat it the same cautious way CSA treated Amount), PDC Collected (date or "—", only meaningful for `with_pdc` rows), Closed On (sortable, default desc). Trailing View action → `/lra/applications/${row.applicationId}`.
   - Grid view: standard `.gcard` pattern.
   - `PageHeader` title "Released Loans", description "Loans you've already released and closed out."

### Status: DONE (2026-08-12)

Implemented:
- `src/app/lra/history/page.tsx` — query-string `load()` to `/api/lra/history`, 300ms debounced search, plain "Total released" KPI, Release path + Closed date filters, list/grid/compact views, client-page sort for borrower/netReleased, `loading`-gated skeletons, Pagination always mounted

---

## Phase 3 — Sidebar wiring

### Files to change

1. **`src/components/admin/Sidebar.tsx`** — change the flat `/lra` entry (`Sidebar.tsx:271`) to:
   ```ts
   {
     href: "/lra",
     label: "Release (LRA)",
     icon: "release",
     modules: ["release_lra"],
     children: [
       { href: "/lra", label: "Release queue", exact: true, matchPrefixes: ["/lra/applications"] },
       { href: "/lra/history", label: "Released loans" },
     ],
   },
   ```

### Status: DONE (2026-08-12)

Implemented:
- `src/components/admin/Sidebar.tsx` — LRA entry now nests "Release queue" (`exact` + `matchPrefixes: ["/lra/applications"]`) and "Released loans" (`/lra/history`)

---

## Phase 4 — Tests

### Files to change

1. **`src/lib/lra/__tests__/history.test.mts`** (new file) — unit tests for whatever pure filter-spec helper Phase 1 extracts for `releasePath`, and for the page-size clamp helper, following the established pattern from every prior module's Phase-1 tests.

### Status: DONE (2026-08-12)

Implemented:
- `src/lib/lra/__tests__/history.test.mts` — `releasePathFilterSpec`, `clampReleasedLoansPageSize`, `RELEASED_LOANS_PAGE_SIZES`

---

## Phase 5 — Backend: `/api/lra/queue` becomes query-param-driven

### Files to change

1. **`src/lib/lra/queue.ts`** (new file) — port `listLraQueue`'s query (`release-service.ts:797-864`) and `isCompletedLraQueueItem`/`lraQueueBucket` classification (`src/lib/lra/queue-classify.ts`) into a parameterized `getLraQueue(supabase, params: { search?, scope?: "active"|"completed"|"all", statusFilter?, from?, to?, sortKey?, sortDir?, page, pageSize })`. **Read `queue-classify.ts` in full before writing this** — the completed/active split logic must be replicated exactly (it's an OR of three different conditions across two tables plus a blocker-string prefix check, not a simple status `.in()`), and doing it server-side may require restructuring as an embedded-column filter or, if that proves unreliable for a 3-way OR across two joined tables, fetching a superset and filtering the scope split in application code after the DB round-trip (acceptable fallback — flag which approach was used in the phase report, don't silently pick one without noting the tradeoff). Date range on `release_queue.queued_at`, default `"all"`.
   - `getLraQueueKpiCounts(supabase)` — mirror the existing 4 KPI buckets (Active/Setup/Briefing/Ready), computed over the *active* scope only, not date-scoped (preserve current behavior).
2. **`src/app/api/lra/queue/route.ts`** — rewrite `GET` to the standard param-driven shape.

### Status: DONE_WITH_CONCERNS (2026-08-12)

Implemented:
- `src/lib/lra/queue.ts` — `getLraQueue` / `getLraQueueKpiCounts`; imports `isCompletedLraQueueItem` + `lraQueueBucket` from `queue-classify.ts` (not reimplemented). Date/search in SQL; **scope + application status filtered in JS** after map (PostgREST left-join embed `.eq` on `loan_applications.status` does not filter parent rows — fixed 2026-08-12). Sort + paginate in JS; `totalCount` = post-scope/status length. Search is multi-step (borrowers → applications → `loan_application_id.in`). KPI keys: `{ active, setup, briefing, ready }` over active scope only, not date-scoped. `listLraQueue` left intact in `release-service.ts`.
- `src/app/api/lra/queue/route.ts` — param-driven GET → `{ rows, totalCount, kpi }`. **`/lra` page breaks until Phase 6** (still expects `{ queue }`).

Tradeoff: fetching the date/search/status-filtered set then JS scope+paginate is acceptable while that set stays modest (typical for LRA); pages walked in `QUEUE_FETCH_PAGE` (1000) chunks to avoid silent truncation.

---

## Phase 6 — Frontend: `/lra` (queue) calls the backend, gets the full toolbar

### Files to change

1. **`src/app/lra/page.tsx`** — same restructuring pattern as every other queue redesign: query-string `load()`, debounced search, icon KPIs sourced from `kpi.*` (unchanged visually), collapsible Filters panel replacing the Scope+Status dropdowns (chips instead), "Queued date" `DateRangeFilter` (default `"all"`), `ViewModeToggle` + grid `.gcard` layout (Path / Status / Queued meta rows), page-size `Select`, `loading`-gated skeleton on every load, `Pagination`/`Select` always mounted. Priority sort (the default) stays client-current-page-only, same bucket-rank comparator already in the file.

### Status: Implemented by Cursor 2026-08-12 — spec-reviewed ✅ (awaiting human browser validation)

**Notes (Phase 6):**
- `src/app/lra/page.tsx` — query-string `load()` to `/api/lra/queue`, 300ms debounced search, icon KPIs from `kpi.active|setup|briefing|ready`, collapsible Filters (Scope + Status chips + Queued date `DateRangeFilter` default `"all"`), `ViewModeToggle` + grid `.gcard` (Path / Status / Queued; blocker when present), page-size `Select`, loading skeletons every load, Pagination always mounted, two-tier empty (`kpi.active===0` on default active scope vs filtered), priority sort client-page-only via `lraQueueBucket`. Preserved: Open links, Stage/blocker badges, Path column, datetime Queued.
- Spec review 2026-08-12: all Critical/Important checklist items ✅; no code fixes required.

---

## Phase 7 — Tests (queue backend)

### Files to change

1. **`src/lib/lra/__tests__/queue.test.mts`** (new file) — mirror the established pattern; specifically test the scope/completed classification logic against the exact same cases `isCompletedLraQueueItem` already covers, to guard against the server-side port drifting from the original.

### Status: Implemented by Cursor 2026-08-12 — DONE

**Notes (Phase 7):**
- `src/lib/lra/__tests__/queue.test.mts` — `scopeFilterSpec` / `statusFilterSpec` / `clampLraQueuePageSize` / page-size allowlist / `matchesLraQueueSearch`; critical `passesScope` ↔ `isCompletedLraQueueItem` agreement over the same cases as `queue-classify.test.mts`.
- `passesScope` exported from `queue.ts` so the agreement test hits the real server-side filter (not a reimplemented copy). Existing `queue-classify.test.mts` untouched.

---

## Overall item status: IN PROGRESS (Phases 1–7 implemented; awaiting human validation)
