# CSA — Application History (step-by-step)

Part of the module history/closed-records rollout. See `loanstar/docs/history-closed-records-tracker.md` for the workflow rules and overall status across all 7 modules.

**Goal:** CSA (Intake) staff currently lose all visibility on an application the moment they endorse it to CIG — there is no way to look it back up. This adds a read-only **Application History** page at `/csa/history`, using the approved list-pattern design (`design/LoanStar Design System/reference/drafts/history-list-pattern.html`): KPI quick-filter cards, a collapsible Filters panel with a date-range picker (presets + custom), search, a sortable table, list/grid/compact view modes, and page-size pagination.

**Scope expanded 2026-08-11:** every module's plan now also brings its **original active-queue page** up to the same design (collapsible Filters, date range, view modes, page-size pagination), reusing the exact shared components/CSS from Phase 1 — not just the new History page. Phase 6 below covers this for CSA's `/csa` queue page. This is now a standing requirement for all 7 modules' plans (see `loanstar/docs/history-closed-records-tracker.md`).

**This is the first of 7 module plans.** Phase 1 of this file builds two small shared components (`DateRangeFilter`, `ViewModeToggle`) and shared CSS specifically so the other 6 modules' plans (Committee, AR, LRA, Agent, Remedial, Collector Accounts) can reuse them as-is instead of re-implementing the same toolbar per module. Keep Phase 1 generic — no CSA-specific logic in those two components.

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. **After all phases are implemented, produce one final combined summary report covering every phase** (all files changed, tests run, anything deliberately left alone).

**Ground rules (apply to every phase in this file):**
- Touch only the files listed for that phase's "Files to change." If you notice something related but unlisted, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Run existing tests after each phase; don't delete or weaken a test to make it pass.
- Output a summary at the end of each phase: files changed, tests run/result, anything deliberately left alone.

---

## Phase 0 — Audit findings (evidence, verified 2026-08-11)

- **No RLS/migration work is needed.** `loan_applications` SELECT is already unconditional for any role with `intake:view` — see `supabase/migrations/20260710030000_fix_applications_select_staff_portals.sql:14`: `OR public.has_module_permission('intake', 'view')`, with no status restriction. `computations` SELECT is likewise open to `intake:view` with no status restriction (`supabase/migrations/20260706130001_p3_rls.sql:80-93`). This confirms a read-only history query needs no new policy — reuse existing SELECT access.
- **The "left the queue" marker already exists**: `loan_applications.endorsed_at` / `endorsed_by`, set exactly once, in `src/app/api/csa/applications/[id]/endorse/route.ts:41-47`, at the moment CSA endorses to CIG. This is the same pattern CIG's own history page uses (`src/lib/cig/history.ts:104`, filtering on `verifications.forwarded_at is not null`) — so History = `endorsed_at IS NOT NULL`, ordered by `endorsed_at desc`. An application that later bounces back to CSA for revision (`for_revision`, which re-enters the CSA active queue per `src/app/api/csa/applications/route.ts:37-46`) will still show in History (it was endorsed at least once) — this is correct and intentional, matching how CIG's history page also doesn't hide entries that later got revised.
- **The active-queue statuses** CSA already excludes are in `src/app/api/csa/applications/route.ts:37-46`: `registered, documents_pending, submitted, on_hold, for_revision, approved, awaiting_confirmation, negotiating_terms`. History does **not** need to duplicate/maintain this list — filtering on `endorsed_at IS NOT NULL` is simpler and self-maintaining as the lifecycle evolves.
- **There is no "withdrawn" status anywhere in this codebase** (confirmed via full-codebase search) — the earlier design draft's "Withdrawn" status chip was speculative and must be dropped. The real terminal/downstream statuses reachable after endorsement are: `for_verification` (at CIG), `for_approval`/`committee_hold` (at Committee), `approved`, `denied` (Committee only, `src/lib/committee/actions.ts:51`), `for_revision` (bounced back), `negotiating_terms`, `awaiting_confirmation`, `lra_pending`, `release_signing`, `release_briefing`, `release_ready`, `released`, `closed`, `loan_active`, `paid_off`. For the History page's Status filter, group these into 4 chips that map to what a CSA user actually cares about: **All / In Progress (anything not denied and not closed-out) / Denied / Released** — see Phase 2 for the exact grouping function, kept in one small pure helper so it's easy to adjust later without touching the query.
- **A computation is guaranteed to exist** for every endorsed application — `getEndorseReadiness` (`src/lib/csa/application.ts:227`) requires a signed computation before endorsement is allowed, and `getActiveComputation` (`src/lib/csa/computation.ts:252-272`) is the existing pattern for fetching the latest active row (`is_active = true`, `order by version desc`, `limit 1`). History will batch-fetch computations for all returned application IDs in one query and reduce to latest-active-per-application in JS (not N+1 queries).
- **Existing sortable-column pattern** to mirror exactly: `src/app/csa/page.tsx:183-191` (`toggleSort`), `:260-263` (`sortArrow`), and the `<Th className="sortable" onClick={...}>{label}{sortArrow(key)}</Th>` markup used in that same file's table head. Reuse this pattern verbatim in the new page rather than inventing a different one.
- **`formatDate` already exists** at `src/lib/csa/format.ts:1-7`; there is no `formatMoney` in that file yet (other domains keep their own copy — e.g. `src/lib/collector/format.ts`, `src/lib/documents/format.ts` — this codebase does not have one shared top-level formatter, so adding one to `csa/format.ts` matches convention).
- **Sidebar structure**: `src/components/admin/Sidebar.tsx:228-242`, the `csa` entry in `PORTAL_NAV_ITEMS`, currently has two children (`Intake list`, `Leads list`). A third child needs to be added. No new icon is needed — child links use a plain dot (`side-link-dot`), not the parent's icon (see `NavLink`, `Sidebar.tsx:315-356`).
- **No new CSS primitives exist yet** for the approved draft design — confirmed `grep` for `.seg`, `.date-row`, `.date-field`, `.active-pill`, `.filter-panel`, `.gcard` in `src/app/globals.css` returns nothing. `.gsearch`, `.fchip`, `.tbl-toolbar`, `.table-wrap`/`.tbl`, `.pager`/`.pg`, `.badge*` already exist (used by `collector/history/page.tsx`, `cig/history` etc.) and must be reused as-is, not redefined.
- **`KpiCard` exists** (`src/components/ui/KpiCard.tsx`) but is not clickable/toggleable — it renders a static `.card.stat`. The draft's KPI cards double as quick-filters (clickable, with an active outline). Rather than modifying the shared `KpiCard` (used elsewhere as a passive stat, e.g. dashboards — changing it risks unrelated regressions), Phase 1 adds a **new, additive** CSS modifier class `.stat.is-clickable` / `.stat.is-on` and Phase 4 renders the KPI row as plain `<button className="card stat ...">` elements (same visual classes `KpiCard` already relies on: `.card`, `.stat`, `.k`, `.v`), not by extending the `KpiCard` component itself.

## Explicitly out of scope for this plan

- Any change to the CSA **active** queue (`src/app/csa/page.tsx`, `src/app/api/csa/applications/route.ts`) — untouched.
- Any change to `endorse/route.ts` or endorsement logic — untouched, only read from.
- The `KpiCard` component itself — not modified (see Phase 0 note above).
- Any RLS/migration file — none needed (see Phase 0).
- The other 6 modules — separate plan files, written after this one is validated.

---

## Phase 1 — Shared UI primitives: `DateRangeFilter`, `ViewModeToggle`, and shared CSS

These two components are intentionally generic (no CSA-specific text or imports) so every later module plan (Committee, AR, LRA, Agent, Remedial, Collector Accounts) imports them unchanged.

### Files to change

1. **`src/app/globals.css`** — append a new section (after the existing `/* ---- advanced table ---- */` block, around line 2610, following the file's existing section-comment convention) with these **additive-only** rules (do not modify any existing rule):
   ```css
   /* ---- history/closed-records pattern: filter panel, date picker, view toggle, KPI buttons ---- */
   .filter-panel { display:none; border-top:1px solid var(--line-soft); padding:14px; animation:panelIn .22s ease; }
   .filter-panel.is-open { display:block; }
   @keyframes panelIn { from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
   .filter-group { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
   .filter-group:last-child { margin-bottom:0; }
   .filter-group-label { font-family:var(--font-mono); font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-400); }

   .date-row { display:none; align-items:flex-end; gap:10px; flex-wrap:wrap; margin-top:10px; padding:12px; background:var(--surface-2); border:1px solid var(--line-soft); border-radius:var(--r-md); }
   .date-row.is-open { display:flex; }
   .date-field { display:flex; flex-direction:column; gap:5px; }
   .date-field label { font-size:11.5px; font-weight:600; color:var(--ink-700); }
   .date-field input { height:34px; padding:0 10px; border-radius:var(--r-sm); border:1px solid var(--line); background:#fff; font-family:var(--font-mono); font-size:12.5px; color:var(--ink-900); }
   .date-field input:focus { outline:none; border-color:var(--teal-600); box-shadow:0 0 0 3px var(--teal-100); }
   .date-sep { font-size:12px; color:var(--ink-400); padding-bottom:9px; }
   .date-quick { display:flex; gap:6px; margin-left:auto; padding-bottom:1px; }
   .date-quick button { height:28px; padding:0 10px; border-radius:var(--r-sm); border:1px solid var(--line); background:#fff; font-size:11.5px; font-weight:600; color:var(--ink-700); cursor:pointer; font-family:var(--font-body); }
   .date-quick button:hover { border-color:var(--navy-600); color:var(--navy-700); }

   .active-pill { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 6px 0 10px; border-radius:var(--r-full); background:var(--navy-50); border:1px solid var(--navy-100); color:var(--navy-800); font-size:11.5px; font-weight:600; }
   .active-pill button { border:none; background:rgba(18,48,97,.08); color:var(--navy-700); width:16px; height:16px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:11px; line-height:1; }
   .active-pill button:hover { background:rgba(18,48,97,.18); }
   .clear-link { border:none; background:none; color:var(--ink-500); font-size:11.5px; font-weight:600; cursor:pointer; font-family:var(--font-body); text-decoration:underline; text-underline-offset:2px; }
   .clear-link:hover { color:var(--danger); }

   .seg { display:inline-flex; padding:3px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--r-md); gap:2px; }
   .seg button { border:none; background:transparent; width:32px; height:29px; border-radius:var(--r-sm); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-500); transition:background .15s,color .15s,box-shadow .15s; }
   .seg button svg { width:15px; height:15px; }
   .seg button:hover { color:var(--navy-800); }
   .seg button.is-on { background:#fff; color:var(--navy-900); box-shadow:var(--sh-1); }

   .card.stat.is-clickable { cursor:pointer; text-align:left; transition:border-color .15s,box-shadow .15s,transform .15s; }
   .card.stat.is-clickable:hover { border-color:var(--navy-200); box-shadow:var(--sh-2); transform:translateY(-1px); }
   .card.stat.is-clickable.is-on { border-color:var(--navy-600); box-shadow:0 0 0 3px var(--navy-50); }

   .gcard { background:#fff; border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--sh-1); padding:15px; display:flex; flex-direction:column; gap:11px; transition:border-color .15s,box-shadow .15s,transform .15s; }
   .gcard:hover { border-color:var(--navy-200); box-shadow:var(--sh-2); transform:translateY(-2px); }
   .gcard-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
   .gcard-id { font-family:var(--font-mono); font-size:12px; font-weight:600; color:var(--ink-500); }
   .gcard-name { font-family:var(--font-display); font-size:15px; font-weight:600; color:var(--navy-900); line-height:1.3; }
   .gcard-meta { display:flex; flex-direction:column; gap:7px; border-top:1px dashed var(--line); padding-top:11px; }
   .gcard-meta .row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
   .gcard-meta .k { font-size:11.5px; color:var(--ink-500); }
   .gcard-meta .v { font-size:12.5px; font-weight:600; color:var(--ink-900); text-align:right; }
   .gcard-meta .v.mono { font-family:var(--font-mono); }
   .grid-view { display:grid; grid-template-columns:repeat(auto-fill,minmax(258px,1fr)); gap:12px; }
   ```
   Do not touch any existing rule in this file — this is a pure append.

2. **`src/components/history/DateRangeFilter.tsx`** (new file/new directory)
   - A controlled component, generic across modules:
     ```tsx
     export type DateRangeValue = {
       preset: "30d" | "90d" | "all" | "custom";
       from: string; // "" or YYYY-MM-DD
       to: string;
     };
     export function DateRangeFilter({
       value,
       onChange,
     }: {
       value: DateRangeValue;
       onChange: (next: DateRangeValue) => void;
     }) { /* ... */ }
     ```
   - Renders 4 `.fchip` buttons ("Last 30 days" / "Last 90 days" / "All time" / "Custom", the last with a small calendar icon), reusing the existing `.fchip`/`.fchip.is-on` classes already defined in `globals.css` (do not redefine `.fchip`).
   - When `preset === "custom"`, renders the `.date-row.is-open` block: two native `<input type="date">` fields (From/To) wrapped in `.date-field`, plus 4 quick-set buttons (`Last 7d`, `Last 30d`, `This month`, `This year`) in `.date-quick` that set `from`/`to` and switch `preset` to `"custom"`.
   - Pure/presentational — no data fetching, no knowledge of any module. Export a pure helper alongside it:
     ```ts
     export function resolveDateBounds(value: DateRangeValue, today: Date): { from: string | null; to: string | null }
     ```
     (`"30d"`/`"90d"` → `from = today - N days`, `to = null`; `"all"` → both `null`; `"custom"` → `value.from || null`, `value.to || null`). Keep this pure and exported so it's unit-testable without rendering React.

3. **`src/components/history/ViewModeToggle.tsx`** (new file)
   - A controlled, generic 3-way icon toggle:
     ```tsx
     export type HistoryViewMode = "list" | "grid" | "compact";
     export function ViewModeToggle({
       value,
       onChange,
     }: {
       value: HistoryViewMode;
       onChange: (mode: HistoryViewMode) => void;
     }) { /* ... */ }
     ```
   - Renders the `.seg` container with 3 icon buttons (list/grid/compact — reuse the exact inline SVGs from the approved draft's `#viewSeg` block in `design/LoanStar Design System/reference/drafts/history-list-pattern.html`), toggling `.is-on` on the active one.

4. **`src/components/history/index.ts`** (new file) — barrel export: `export * from "./DateRangeFilter"; export * from "./ViewModeToggle";`

### Explicitly out of scope for this phase

- No CSA-specific code in any file touched this phase.
- `src/components/ui/KpiCard.tsx` — not modified.
- No page or API route yet — that's Phases 2–4.

### Validation checklist

- [ ] `globals.css` has only additions, no modified/removed existing rules (diff should be pure insertions).
- [ ] `DateRangeFilter` and `ViewModeToggle` compile standalone, take no CSA-specific props, and are exported from `src/components/history/index.ts`.
- [ ] `resolveDateBounds` is a pure function (no React, no fetch) covering all 4 presets.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 2 — Backend: `lib/csa/history.ts` + `GET /api/csa/history`

### Files to change

1. **`src/lib/csa/format.ts`** — add, alongside the existing `formatDate`:
   ```ts
   export function formatMoney(value: number) {
     return "₱" + value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
   }
   ```
   (Same numeric formatting `src/lib/collector/format.ts` already uses — match it exactly for consistency.) Do not change the existing `formatDate` export.

2. **`src/lib/csa/history.ts`** (new file, mirrors the shape of `src/lib/cig/history.ts`)
   - `export type CsaHistoryStatusGroup = "in_progress" | "denied" | "released";`
   - `export function csaHistoryStatusGroup(status: string): CsaHistoryStatusGroup` — pure function: `"denied"` → `"denied"`; `"released" | "closed" | "loan_active" | "paid_off"` → `"released"`; everything else (`for_verification`, `for_approval`, `committee_hold`, `approved`, `for_revision`, `negotiating_terms`, `awaiting_confirmation`, `lra_pending`, `release_signing`, `release_briefing`, `release_ready`) → `"in_progress"`. Keep this exhaustive-by-default (unknown/future statuses fall into `"in_progress"`, not silently dropped).
   - `export type CsaHistoryRow = { id, applicationNo, status, statusGroup, borrower: {...} | null, loanTypeName: string | null, principal: number | null, endorsedAt: string }`
   - `export async function getCsaApplicationHistory(supabase: SupabaseClient, limit = 200): Promise<CsaHistoryRow[]>`:
     - Query `loan_applications` (`id, application_no, status, endorsed_at, borrowers(borrower_no, first_name, last_name, email)`) `.not("endorsed_at", "is", null)` `.order("endorsed_at", { ascending: false })` `.limit(limit)` — mirror `src/lib/cig/history.ts:84-106`'s query shape and null-safety pattern for the `borrowers` embed (handle both array and object forms exactly as that file does at lines 118-121).
     - Batch-fetch `computations` for the returned application IDs in one query: `.select("loan_application_id, loan_type_name, principal, version").in("loan_application_id", ids).eq("is_active", true)`, then reduce in JS to the highest `version` per `loan_application_id` (mirror the "prefer latest version" comment/logic in `src/lib/csa/computation.ts:256-265`, just applied to a batch instead of a single id).
     - Map each application row to `CsaHistoryRow`, attaching `loanTypeName`/`principal` from the matching computation (`null` if somehow missing — should not happen per Phase 0's endorse-readiness finding, but don't throw if it does).
   - `export function csaHistoryMatchesSearch(row: {applicationNo, borrower}, term: string): boolean` — same shape/logic as `cigRecentMatchesSearch` (`src/lib/cig/history.ts:36-59`), reused pattern not reused code (different row shape).

3. **`src/app/api/csa/history/route.ts`** (new file, mirrors `src/app/api/cig/history/route.ts` exactly):
   ```ts
   import { handleApiError, jsonOk } from "@/lib/api/handler";
   import { getCsaApplicationHistory } from "@/lib/csa/history";
   import { requireModulePermission } from "@/lib/permissions/server";
   import { createClient } from "@/lib/supabase/server";

   export async function GET() {
     try {
       await requireModulePermission("intake", "view");
       const supabase = await createClient();
       const history = await getCsaApplicationHistory(supabase);
       return jsonOk({ history });
     } catch (error) {
       return handleApiError(error);
     }
   }
   ```

### Explicitly out of scope for this phase

- No new migration/RLS policy (see Phase 0 — already covered by existing `intake:view` grants).
- No changes to `src/lib/csa/computation.ts` (`getActiveComputation`) — read-only reference for the pattern, not imported/modified.
- No changes to `src/app/api/csa/applications/route.ts` (the active queue) — untouched.

### Validation checklist

- [ ] `GET /api/csa/history` requires `intake:view` (401/403 without it — same as every other CSA route).
- [ ] Returns only applications with non-null `endorsed_at`, newest first.
- [ ] Each row's `loanTypeName`/`principal` comes from the **latest active** computation, not an arbitrary one, and batch-fetched (not N+1 queries per application).
- [ ] `csaHistoryStatusGroup` correctly buckets every status in `APPLICATION_STATUSES` (`src/lib/constants.ts:124-146`) reachable after endorsement into `in_progress` / `denied` / `released` — no status silently unhandled.
- [ ] `formatMoney` added to `src/lib/csa/format.ts` without touching the existing `formatDate`.

### Status: Ready for Cursor (not yet implemented) — send after Phase 1 lands and is validated

---

## Phase 3 — Sidebar wiring

### Files to change

1. **`src/components/admin/Sidebar.tsx`**
   - In `PORTAL_NAV_ITEMS`, the `csa` entry's `children` array (currently at `Sidebar.tsx:233-241`):
     ```ts
     children: [
       {
         href: "/csa",
         label: "Intake list",
         exact: true,
         matchPrefixes: ["/csa/applications"],
       },
       { href: "/csa/leads", label: "Leads list" },
       { href: "/csa/history", label: "Application history" },
     ],
     ```
     Add only the third line — the first two entries are untouched.

### Explicitly out of scope for this phase

- No other `PORTAL_NAV_ITEMS` group touched (Committee, AR, etc. — separate plans).
- No icon changes — children use the plain dot, not a new icon.

### Validation checklist

- [ ] "Application history" appears under Intake in the sidebar, only for users with `intake:view`.
- [ ] Existing "Intake list" and "Leads list" entries unchanged (same hrefs, same `exact`/`matchPrefixes`).
- [ ] Clicking it navigates to `/csa/history` and highlights correctly (uses the existing `childIsActive` logic, `Sidebar.tsx:307-313` — no changes needed there since this is a plain non-`exact` child, same as "Leads list").

### Status: Ready for Cursor (not yet implemented) — can run in parallel with Phase 2

---

## Phase 4 — Frontend: `/csa/history` page

### Files to change

1. **`src/app/csa/history/page.tsx`** (new file, `"use client"`)
   - Imports: `Alert, Badge, EmptyState, PageHeader, Pagination, Select, Spinner, Table, Td, Th, cn` from `@/components/ui`; `DateRangeFilter, ViewModeToggle, resolveDateBounds` from `@/components/history`; `formatDate, formatMoney` from `@/lib/csa/format`; `csaHistoryMatchesSearch, csaHistoryStatusGroup` types/fns re-declared client-side (the API returns plain JSON, so duplicate the tiny pure `csaHistoryStatusGroup`/search-match logic client-side the same way `collector/history/page.tsx` keeps its filter logic in the page component — do not try to import server-only `src/lib/csa/history.ts` into a client component).
   - State: `history` (fetched once on mount from `/api/csa/history`), `search`, `statusGroup` (`"all" | "in_progress" | "denied" | "released"`), `dateRange: DateRangeValue`, `viewMode: HistoryViewMode`, `pageSize` (10/20/30/50/100, default 10), `page`, `sortKey`/`sortDir` (default `endorsedAt` desc), `filterPanelOpen`.
   - KPI row: "Total records" (count of rows within the current date range, ignoring status filter) + one button per status group (In Progress / Denied / Released), each `<button className={cn("card stat is-clickable", statusGroup === X && "is-on")}>` with `.k`/`.v` divs — mirrors `KpiCard`'s markup exactly (see Phase 0 note) without importing the component itself.
   - Toolbar: `.toolbar-card` > `.toolbar-row` with `.gsearch` input (placeholder "Search borrower, application no…"), active-filter `.active-pill`s (status group + date range, each removable), `<ViewModeToggle>`, and a Filters `.btn.btn-outline` toggling `.filter-panel.is-open` containing status `.fchip` group + `<DateRangeFilter>` — mirror the exact toolbar structure/classes from the approved draft (`design/LoanStar Design System/reference/drafts/history-list-pattern.html`, `.toolbar-card`/`.toolbar-row`/`.filter-panel` sections).
   - Table (list/compact view): columns Application No. (mono, primary), Borrower, Loan Type, Amount (num, mono, teal when > 0), Status (badge), Endorsed On (mono date) — sortable headers using the exact `toggleSort`/`sortArrow` pattern from `src/app/csa/page.tsx:183-191,260-263` (copy the pattern, adapted to this page's `sortKey` type, not a shared import — that file's version stays private to it).
   - Grid view: `.grid-view` of `.gcard`s (id + status badge on top row, borrower name, then Loan Type/Amount/Endorsed On as `.gcard-meta` rows) — same shape as the approved draft's card markup.
   - Status badge variant mapping: reuse the existing `Badge` component's `variant` prop (`success`/`warning`/`danger`/`teal`/`neutral` — see `src/components/ui/Badge.tsx:7-19`); a small local `statusVariant(status: string)` function in this page file maps: `denied` → `danger`; `approved | released | closed | loan_active | paid_off` → `success`; `for_revision | committee_hold` → `warning`; everything else → `teal`.
   - Page-size select: `<Select>` with options 10/20/30/50/100, plus `<Pagination page={} pageCount={} onPageChange={} summary={"Showing X–Y of Z"}>` (existing component, `src/components/ui/Pagination.tsx` — no changes to it).
   - Empty state: `<EmptyState title="No matching records" description="Try clearing a filter or search term." showMark={false} />` when the filtered set is empty; loading via `<Spinner />`; fetch errors via `<Alert>`.
   - `PageHeader` title "Application History", description "Applications you endorsed, once they leave your active queue." — matches the approved draft's copy.

### Explicitly out of scope for this phase

- No changes to `src/app/csa/page.tsx` (the active queue) — its `toggleSort`/`sortArrow` pattern is copied, not imported or modified.
- No changes to `src/components/ui/Pagination.tsx`, `Select.tsx`, `Badge.tsx`, `EmptyState.tsx` — used as-is.

### Validation checklist

- [ ] Page loads at `/csa/history`, gated behind `intake:view` the same way every other CSA page is (via the existing sidebar/permission-hook pattern — `usePermissions()` hiding, API enforcing).
- [ ] KPI cards filter by status group when clicked, and show an active outline; "Total records" always reflects the date range only.
- [ ] Filters panel collapses/expands; Custom date range shows the picker and updates the active pill with a formatted range.
- [ ] Search matches borrower name, borrower no., email, or application no.
- [ ] List/Grid/Compact view modes all render the same filtered/sorted/paginated row set.
- [ ] Column sort works both directions on Application No., Borrower, Amount, Status, Endorsed On.
- [ ] Page size selector changes rows-per-page and resets to page 1.
- [ ] Empty state shows correctly when filters produce zero rows.

### Status: Ready for Cursor (not yet implemented) — send after Phases 1–3 land and are validated

---

## Phase 5 — Tests

### Files to change

1. **`src/lib/csa/__tests__/history.test.mts`** (new file, mirrors `src/lib/cig/__tests__/history.test.mts`'s structure)
   - Unit tests for `csaHistoryStatusGroup` — covering every status name from `APPLICATION_STATUSES` (`src/lib/constants.ts:124-146`) that's reachable post-endorsement, asserting the correct group.
   - Unit tests for `csaHistoryMatchesSearch` — name/borrower-no/email/application-no matching, case-insensitivity, empty-term-matches-all.
   - Unit test for the "latest active computation per application" reduction logic used inside `getCsaApplicationHistory` — extract it as its own small pure function first if it isn't already (e.g. `pickLatestActiveComputation(rows, applicationId)`), so it's testable without a live Supabase client, same way `computeTatDays` etc. are unit-tested elsewhere.
2. **`src/components/history/__tests__/date-range.test.mts`** (new file) — unit tests for `resolveDateBounds` covering all 4 presets against a fixed `today`.

### Explicitly out of scope for this phase

- No e2e/Playwright test added — out of scope unless the user asks for one separately.
- No test changes to any existing file.

### Validation checklist

- [ ] `npm test` (or the project's existing test command) passes, including the new files.
- [ ] No existing test file modified.

### Status: Ready for Cursor (not yet implemented) — send after Phase 4 lands and is validated

---

## Phase 6 — Redesign `/csa` (active queue) to match the History design

### Audit findings (evidence, verified 2026-08-11)

- **Decision confirmed with user**: keep the existing icon-based KPI cards (`Kpi` component, `KPI_TONES`, `src/app/csa/page.tsx:86-124`) as-is — do **not** restyle them to History's plain `.card.stat` cards. CIG (`src/app/cig/page.tsx`), Committee, AR, and LRA queue pages all share this same icon-KPI pattern (confirmed via `grep` for `sortable` across `src/app`, all 5 files use the same family of components) — changing CSA alone would make it the odd one out until those modules get their own passes later. Only the **gaps** are in scope here.
- **What `/csa` already has**, matching History: a `.tbl-toolbar` row with `.gsearch` search input and `.fchip` work-filter chips (`WORK_CHIPS`, `page.tsx:128-133,395-406`), a sortable `Table`/`Th`/`Td` with the same `toggleSort`/`sortArrow` pattern History copied from it (`page.tsx:183-191,260-263`), and `Pagination` (`page.tsx:515-526`).
- **What's missing**, matching History's design (all built in this file's Phase 1, ready to reuse):
  1. The Filters panel isn't collapsible — `WORK_CHIPS` renders inline, always visible, no `Filters` toggle button. History's `.filter-panel`/`.filter-group` pattern doesn't exist here yet.
  2. No date-range filter on "Filed" (`createdAt`) — `DateRangeFilter`/`resolveDateBounds` (built in Phase 1) aren't used.
  3. No view-mode toggle — `ViewModeToggle` (Phase 1) isn't used; there's only the list/table view.
  4. No page-size selector — `PAGE_SIZE` is a hardcoded constant (`page.tsx:48`), not a user-facing `<Select>`.
  5. **The exact toolbar-wrap bug already fixed in History exists here too, latently**: the active work-filter chips currently render in a plain `<div className="flex flex-wrap gap-1.5">` (`page.tsx:395`), not the buggy `.filter-bar`, so it isn't currently broken — but once the Filters panel becomes collapsible and an "active pill" row is added next to the search box (to show the selected work filter chip when the panel is closed), it must use the new `.active-pill-row` class from Phase 4's fix, not `.filter-bar`, or the same row-wrapping bug will reappear.
- **Default date range must NOT be "Last 30 days"** the way History defaults — this is an *active* queue, and an application filed 45 days ago that's still stuck in documents-pending is exactly the kind of thing CSA needs to see, not hide by default. Default preset for this page: **"All time"**.
- **Grid view** needs a card layout for queue items — reuse `.gcard`/`.gcard-meta` (Phase 1), showing: application no./borrower id top row + status badge, borrower name, then Type / Blocker / Filed / Waiting as meta rows.
- **Compact view** needs `Table`'s `className="is-compact"` passed through exactly as Phase 4 does it (remember: this lands on `.table-wrap`, not `.tbl` — Phase 4's CSS fix (`.table-wrap.is-compact table.tbl`) already covers this generically, no new CSS needed here).
- `src/lib/csa/queue.ts` already has everything needed: `CsaWorkFilter`, `csaMatchesWorkFilter`, `csaNeedsAttention`, `daysInQueue`, `formatBlockerLabel` — all pure, all reusable as-is, no changes needed.

### Files to change

1. **`src/app/csa/page.tsx`**
   - Add state: `dateRange: DateRangeValue` (default `{ preset: "all", from: "", to: "" }`), `viewMode: HistoryViewMode` (default `"list"`), `pageSize` (default 10, options 10/20/30/50/100), `filterPanelOpen` (default `false`).
   - Import `DateRangeFilter`, `ViewModeToggle`, `resolveDateBounds`, `type DateRangeValue`, `type HistoryViewMode` from `@/components/history`; `Select` from `@/components/ui`.
   - Filter applications by `resolveDateBounds(dateRange, new Date())` against `createdAt` (the "Filed" date) **before** the existing `csaMatchesWorkFilter`/search filtering — same layering as History's `inDateRange` → `filtered` chain.
   - Restructure the toolbar row (`page.tsx:365-407`) to match History's exact structure: `.gsearch` search input, then an `.active-pill-row` (not `.filter-bar`) showing the active work-filter chip (if not "all") and active date-range pill (if not "all time"), each removable, then a `.sp` block with `<ViewModeToggle>` and the `Filters` toggle button (with active-count badge, same markup/style as `src/app/csa/history/page.tsx:408-450` — copy that block's structure, adapting the count to `(workFilter !== "all" ? 1 : 0) + (dateRange.preset !== "all" ? 1 : 0)`).
   - Move `WORK_CHIPS` rendering into a `.filter-panel`/`.filter-group` (label "Work filter"), toggled by `filterPanelOpen`, plus a second `.filter-group` (label "Filed date") containing `<DateRangeFilter value={dateRange} onChange={setDateRange} />` — same two-group layout as `history/page.tsx:453-473`.
   - Add grid view: when `viewMode === "grid"`, render `.grid-view` of `.gcard`s per the audit findings above, instead of the `Table`. Reuse `borrowerName`-equivalent inline (this page already has the borrower-name-or-"Unknown borrower" expression inline at `page.tsx:462-464` — extract it to a small local helper `queueBorrowerName(app)` used by both table and grid rendering, to avoid duplicating the ternary).
   - Pass `className={viewMode === "compact" ? "is-compact" : undefined}` to the existing `<Table>` for compact mode — no other table markup changes.
   - Add the page-size `<Select>` next to `<Pagination>`, same layout as `history/page.tsx:603-627`.
   - Do **not** touch: the `Kpi`/`KPI_TONES`/icon components, the `needsAttention` warning banner (`page.tsx:285-316`), the existing sort logic/`SortKey` type, `csaMatchesWorkFilter`/`WORK_CHIPS` semantics, the "New application" button/link, or the outer bordered wrapper div (`page.tsx:364`, `rounded-[var(--r-lg)] border...`) — only what's inside it changes.

### Explicitly out of scope for this phase

- `Kpi` component and `KPI_TONES` — untouched (per confirmed decision).
- `src/lib/csa/queue.ts` — untouched, reused as-is.
- `src/app/csa/applications/[id]/page.tsx`, `src/app/csa/applications/new/page.tsx`, `src/app/csa/leads/page.tsx` — not part of "the active queue page," untouched.
- Any other module's active-queue page (CIG, Committee, AR, LRA, Collector, Agent, Remedial) — separate future passes, tracked per-module in `history-closed-records-tracker.md`.

### Validation checklist

- [ ] `/csa` KPI cards unchanged visually (icons, tones, click-to-filter behavior all still work).
- [ ] Toolbar: search box, active pills (when any filter is active), view toggle, and Filters button all share one row at normal desktop width — with 0 active filters and with 1–2 active filters (mirrors the same check done for History Phase 4's fix).
- [ ] Filters panel collapses/expands; contains Work filter chips + Filed date range.
- [ ] Default view on page load: date range = "All time" (not 30 days) — an old-but-still-active application must not disappear by default.
- [ ] List/Grid/Compact view modes all render the same filtered/sorted/paginated row set; existing sort-by-Status/Filed/Waiting still works in all 3 modes.
- [ ] Page-size selector changes rows-per-page and resets to page 1.
- [ ] `needsAttention` warning banner and its "Show attention queue" shortcut still work unchanged.
- [ ] Empty state (no applications at all) and "no matching applications" (filtered to zero) both still render correctly.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 7 — Add a "View" action to each History row/card

### Audit findings (evidence, verified 2026-08-11)

- `/csa/applications/[id]/page.tsx` (`src/app/csa/applications/[id]/page.tsx:514`) already derives `const editable = isCsaEditableStatus(data.application.status);` and uses it only to conditionally hide edit affordances (`:782,887,931,1040,1105,1178,1264`) — there is **no redirect/`notFound`/hard guard** blocking a non-editable-status application from being viewed. Safe to link every History row straight to this existing page — no changes needed to the detail page itself.
- `src/app/csa/history/page.tsx` currently imports `Alert, Badge, EmptyState, PageHeader, Pagination, Select, Spinner, Table, Td, Th, cn` from `@/components/ui` — no `Link` (from `next/link`) or `Button` yet; both need adding.
- The exact "View"-button pattern already exists on the redesigned `/csa` queue page (Phase 6) — table: `<Link href={...}><Button variant="secondary" size="sm">Open</Button></Link>` in a trailing `<Td>` (`src/app/csa/page.tsx:719-724`); grid: same Link+Button at the bottom of each `.gcard` (`page.tsx:614-618`). Copy this pattern (labelled "View" instead of "Open," since History is read-only), not reinvent it.

### Files to change

1. **`src/app/csa/history/page.tsx`**
   - Add imports: `Link` from `next/link`, `Button` from `@/components/ui`.
   - List/compact table: add a trailing, non-sortable `<Th>{""}</Th>` header (same empty-label pattern as `csa/page.tsx:654`) and a matching trailing `<Td>` per row containing `<Link href={`/csa/applications/${row.id}`}><Button variant="secondary" size="sm">View</Button></Link>`.
   - Grid view: add the same `Link`+`Button` ("View") at the bottom of each `.gcard`, same position as `csa/page.tsx`'s grid cards.
   - No other changes — sorting, filtering, KPI logic, all untouched.

### Explicitly out of scope for this phase

- `src/app/csa/applications/[id]/page.tsx` — not modified, already safe to link to as-is.
- `src/app/csa/page.tsx` (the queue page) — already has its own "Open" button from Phase 6, untouched here.

### Validation checklist

- [ ] Every row (list, compact, and grid) has a "View" button.
- [ ] Clicking it navigates to `/csa/applications/{id}` and the page renders read-only (no edit affordances) for a non-editable-status application.
- [ ] No changes to sorting, filtering, search, KPI cards, or pagination.

### Status: Ready for Cursor (not yet implemented)

---

## Phases 8–12 — Move search/filter/sort/pagination to the backend

**User decision, 2026-08-11**: retrofit CSA rather than leave it client-side, so all 7 modules end up architecturally consistent. See the standing requirement in `loanstar/docs/history-closed-records-tracker.md` for the general rule these 5 phases implement.

### Audit findings (evidence, verified 2026-08-11)

- **Current state, both pages**: `getCsaApplicationHistory`/`/api/csa/applications` each return a bounded list in one shot (`HISTORY_LIMIT = 200` in `src/lib/csa/history.ts:87`; no limit at all in `/api/csa/applications/route.ts`), and both `src/app/csa/history/page.tsx` and `src/app/csa/page.tsx` do search/status/date-range filtering, sorting, and pagination client-side via `useMemo` chains. This is what's being replaced.
- **Pagination precedent already in this codebase**: `src/app/api/admin/audit/route.ts:13-20` — `.select(..., { count: "exact" }).order(...).range(offset, offset + limit - 1)`, returning `{ events, total: count, limit, offset }`. Reuse this exact primitive.
- **Cross-table search precedent**: `src/app/api/agent/borrowers/search/route.ts` uses a Postgres RPC (`search_borrower_names`) rather than a raw PostgREST `.or()` across an embedded table — because filtering embedded/joined columns via `.or()` is fragile. **We are not adding a new RPC/migration for this** (higher cost than justified here) — instead, use a **two-query** approach that stays within plain same-table filters:
  1. If `search` is non-empty, query `borrowers` alone: `.select("id").or("first_name.ilike.%term%,last_name.ilike.%term%,email.ilike.%term%,borrower_no.ilike.%term%").limit(500)` → array of matching `id`s.
  2. Build the main `loan_applications` query with `.or(\`application_no.ilike.%term%,borrower_id.in.(${ids.join(",")})\`)` (or, if step 1 returns zero ids and the term doesn't match any application_no either, the query naturally returns zero rows — no special-casing needed) combined with the other filters.
- **`resolveDateBounds` (`src/components/history/DateRangeFilter.tsx`) has no `"use client"` pragma** — it's a plain pure function in a file that also happens to export a component. Safe to import directly into a server-side API route (`import { resolveDateBounds } from "@/components/history"`) — don't reimplement date-bound math server-side.
- **Status-group → status-list mapping must not drift from `csaHistoryStatusGroup`** (`src/lib/csa/history.ts:32-43`) — export a companion constant `IN_PROGRESS_STATUSES` (the 11 statuses that function already enumerates) from the same file, and build the `.in("status", [...])` filter from that constant, not a re-typed list.
- **Sorting by "Amount"/"Loan Type" (History) can't cleanly go server-side** — `principal`/`loanTypeName` come from a separate `computations` query batch-fetched per result page, not a 1:1 joined column `.order()` can reach. **Scoping decision**: `applicationNo` / `borrower` (via `.order("last_name", { foreignTable: "borrowers" })`) / `status` / `endorsedAt` sort **server-side**; `amount` sorts **client-side on the current page only** (10–100 rows, cheap) after fetch. State this in the API's behavior, don't silently half-implement it.
- **Same scoping issue, queue page's default "priority" sort**: it's a compound client-derived rule (`csaNeedsAttention` flag first, then recency) not a plain column — `.order()` can't express it directly without a view/RPC. **Scoping decision**: `status` / `filed` (`created_at`) / `waiting` (`updated_at` — monotonically equivalent to `daysInQueue`) sort **server-side**; `priority` (the default) sorts **client-side on the current page only**, same principle as Amount above.
- **Queue KPI counts are currently NOT date-scoped** (unlike History's, which are) — `src/app/csa/page.tsx`'s `total`/`needsAttention`/`documentsPending`/`inNegotiation` are computed from the full `applications` array, before `inDateRange` is applied. **Preserve this existing behavior exactly** when moving to backend counts — queue KPIs scope to the active-status universe only, not the date filter. Don't accidentally "fix" this inconsistency while retrofitting; if it should change, that's a separate decision for the user.
- **Queue's "attention" work-filter** (`ATTENTION_STATUSES` = `on_hold`/`for_revision`, **or** a non-empty `blocker`) needs an `.or()` on the base table: `.or("status.in.(on_hold,for_revision),blocker.not.is.null")` — no join involved, straightforward.
- `borrower_id` on `loan_applications` is `NOT NULL` (`supabase/migrations/20260706120000_p2_borrower_agent_documents.sql:43`) — safe to use `borrowers!inner(...)` in both routes' selects (needed for the `{ foreignTable: "borrowers" }` order-by to work reliably).

### Phase 8 — Backend: `/api/csa/history` becomes query-param-driven

**Files to change:**
1. **`src/lib/csa/history.ts`**
   - Export `IN_PROGRESS_STATUSES` (the 11-status array already implicit in `csaHistoryStatusGroup`'s fallthrough) and `RELEASED_STATUSES` (`["released","closed","loan_active","paid_off"]`) as named constants; rewrite `csaHistoryStatusGroup` to check against these constants instead of individual string literals (behavior-identical, just no more duplicated status lists).
   - Rewrite `getCsaApplicationHistory` to accept a params object: `{ search?, statusGroup?: CsaHistoryStatusGroup | "all", from?: string | null, to?: string | null, sortKey?: "applicationNo"|"borrower"|"status"|"endorsedAt", sortDir?: "asc"|"desc", page: number, pageSize: number }`, returning `{ rows: CsaHistoryRow[], totalCount: number }`. Implements: two-step search (per audit findings), `.in("status", IN_PROGRESS_STATUSES | RELEASED_STATUSES | ["denied"])` for `statusGroup`, `.gte("endorsed_at", from)`/`.lte("endorsed_at", to)` (append `T00:00:00`/`T23:59:59.999` to the date-only strings for correct inclusive bounds against the `timestamptz` column), `.order(...)` per `sortKey` (borrower via `{ foreignTable: "borrowers" }`), `.range(...)`, `{ count: "exact" }` on the select. Still batch-fetches `computations` for the returned page's ids exactly as before (Phase 2's `pickLatestActiveComputation`, untouched).
   - Add `getCsaHistoryKpiCounts(supabase, { from, to }): Promise<{ total: number; in_progress: number; denied: number; released: number }>` — 4 `head: true, count: "exact"` queries, each `.not("endorsed_at","is",null).gte(...).lte(...)` plus the relevant `.in("status", ...)`, scoped by date range only (matches existing History KPI behavior — unchanged from Phases 4/5).
2. **`src/app/api/csa/history/route.ts`**
   - Parse query params from `request.url` (mirror `admin/audit/route.ts`'s `new URL(request.url).searchParams` pattern): `search`, `status` (maps to `statusGroup`), `range`/`from`/`to` (resolve via `resolveDateBounds`), `sortKey`, `sortDir`, `page` (default 1), `pageSize` (default 10, clamp to the same `[10,20,30,50,100]` set the frontend offers — reject/clamp anything else).
   - Call `getCsaApplicationHistory` and `getCsaHistoryKpiCounts` (can run in parallel via `Promise.all`), return `jsonOk({ rows, totalCount, kpi })`.

**Explicitly out of scope:** `pickLatestActiveComputation`, `csaHistoryMatchesSearch` (now unused server-side but keep it — Phase 9's client Amount-sort-on-current-page doesn't need search matching, but don't delete a function without checking Phase 12's tests still reference it correctly), any RLS/migration (still not needed, per Phase 0).

**Status: Ready for Cursor (not yet implemented) — send after Phase 7 lands and is validated**

---

### Phase 9 — Frontend: `/csa/history` calls the backend instead of filtering a bulk fetch

**Files to change:**
1. **`src/app/csa/history/page.tsx`**
   - Replace the one-time `fetch("/api/csa/history")` + `useMemo` filter/sort chain with: a `load()` that builds a query string from current `{ search, statusGroup, dateRange, sortKey, sortDir, page, pageSize }` state and fetches `/api/csa/history?...`, storing the response's `rows`/`totalCount`/`kpi` directly in state (no more client-side `inDateRange`/`filtered`/`kpiCounts` `useMemo`s — the server now does this).
   - Debounce `search`: don't fire a new fetch on every keystroke — use a local `useEffect` with a 300ms `setTimeout`/`clearTimeout` before triggering `load()` when `search` changes; other filter changes (status, date, sort, page, pageSize) trigger `load()` immediately.
   - Keep the `sortKey === "amount"` case special: after receiving `rows` from the server, if `sortKey === "amount"`, sort the received page in place before rendering (client-side, current-page-only, per Phase 8's scoping decision); for every other `sortKey`, render server order as-is.
   - `Pagination`'s `pageCount` becomes `Math.ceil(totalCount / pageSize)`; the summary string uses `totalCount`.
   - KPI cards render `kpi.total`/`kpi.in_progress`/`kpi.denied`/`kpi.released` from the response instead of a locally-computed object.

**Explicitly out of scope:** the View-button work from Phase 7 (already landed) — don't touch that markup beyond what's needed to keep it working with the new data shape.

**Status: Ready for Cursor (not yet implemented) — send after Phase 8 lands and is validated**

---

### Phase 10 — Backend: `/api/csa/applications` (active queue) becomes query-param-driven

**Files to change:**
1. **`src/lib/csa/queue.ts`**
   - Add `getCsaQueue(supabase, { search?, workFilter?: CsaWorkFilter, from?, to?, sortKey?: "borrower"|"type"|"status"|"filed"|"waiting", sortDir?, page, pageSize }): Promise<{ rows: QueueItem[]; totalCount: number }>` (the query-building logic currently inline in `src/app/api/csa/applications/route.ts:12-47` moves here, parameterized). Active-status filter (`registered, documents_pending, submitted, on_hold, for_revision, approved, awaiting_confirmation, negotiating_terms`) stays a base condition on every call, same list as today, exported as a named constant so it can't drift. `workFilter` adds `.in("status", DOCUMENT_STATUSES)` / `.in("status", NEGOTIATION_STATUSES)` / the attention `.or(...)` per the audit findings, reusing the existing `DOCUMENT_STATUSES`/`NEGOTIATION_STATUSES`/`ATTENTION_STATUSES` constants already in this file (export them if not already). Same two-step search approach as Phase 8. `sortKey` "borrower" via `{ foreignTable: "borrowers" }`; "filed" → `created_at`; "waiting" → `updated_at` (server-equivalent ordering to `daysInQueue`); no `sortKey` for "priority" — that's the client-only default (see audit findings).
   - Add `getCsaQueueKpiCounts(supabase): Promise<{ total, needsAttention, documentsPending, inNegotiation }>` — 4 `head:true` count queries over the active-status universe, **not** date-scoped (preserves existing behavior — see audit findings).
2. **`src/app/api/csa/applications/route.ts`**
   - `GET`: parse the same param shape as Phase 8's route, call `getCsaQueue` + `getCsaQueueKpiCounts` in parallel, return `jsonOk({ rows, totalCount, kpi })`. Leave the existing `POST` handler (`createCsaApplication`) completely untouched.

**Explicitly out of scope:** `POST /api/csa/applications`, `src/lib/csa/create-application.ts` — untouched.

**Status: Ready for Cursor (not yet implemented) — send after Phase 9 lands and is validated**

---

### Phase 11 — Frontend: `/csa` (queue) calls the backend instead of filtering a bulk fetch

**Files to change:**
1. **`src/app/csa/page.tsx`**
   - Same restructuring as Phase 9: query-string-driven `load()`, 300ms-debounced search, server-side `totalCount`/`kpi` from the response, `pageCount = Math.ceil(totalCount / pageSize)`.
   - `sortKey === "priority"` (the default) stays a client-side sort of the current page's rows after fetch (attention-flag first, then recency — exact same comparator already in `sorted` today, just applied to the fetched page instead of the whole dataset); every other `sortKey` trusts server order.
   - KPI cards (`Kpi`/`KPI_TONES`, unchanged visually) read from the response's `kpi` object instead of `applications.filter(...).length`.

**Explicitly out of scope:** `Kpi` component, `KPI_TONES`, the `needsAttention` warning banner's rendering — only its `needsAttention` **count source** changes (from local `.filter().length` to `kpi.needsAttention`), the banner markup itself is untouched.

**Status: Ready for Cursor (not yet implemented) — send after Phase 10 lands and is validated**

---

### Phase 12 — Tests

**Files to change:**
1. **`src/lib/csa/__tests__/history.test.mts`** — add tests for `IN_PROGRESS_STATUSES`/`RELEASED_STATUSES` (used by both `csaHistoryStatusGroup` and the new query-builder — assert they still agree), and for the query-parameter-building logic in `getCsaApplicationHistory` if it's practical to unit-test without a live Supabase client (e.g. extract the "build the status `.in()` list for a given statusGroup" step as its own small pure function first, same pattern as `pickLatestActiveComputation`).
2. **`src/lib/csa/__tests__/queue.test.mts`** (new or existing — check first) — same treatment for the queue's work-filter → status-list mapping.

**Explicitly out of scope:** no e2e/integration test against a live Supabase instance — out of scope unless the user asks separately.

**Status: Ready for Cursor (not yet implemented) — send after Phase 11 lands and is validated**

---

## Phase 13 — Skeleton loading instead of full-page Spinner, on every load (`/csa/history` and `/csa`)

**User decision, 2026-08-11**: do this after Phase 12 (tests), not before. See the standing requirement in `loanstar/docs/history-closed-records-tracker.md` for the general rule. **Corrected 2026-08-11**: skeleton applies to **every** `loading` state — the debounced search firing, changing a status/date filter, clicking a KPI quick-filter, sorting, changing page/page size — not just the very first load. The rule's earlier draft ("only the initial load, refetches keep existing behavior") is retracted.

### Audit findings (evidence, verified 2026-08-11)

- Both pages currently have `if (!hasLoaded && loading) return <Spinner />;` (`src/app/csa/history/page.tsx:253`, `src/app/csa/page.tsx:328`) — this return happens **before** `PageHeader`/toolbar/filters render, so the whole page is blank-then-spinner-then-content on first load, and does nothing at all on refetches (which is exactly what needs to change).
- `src/components/ui/Skeleton.tsx` already exports `variant="kpi"` (matches the `.card.stat` shape our KPI buttons use) and `variant="list-row"`/`variant="line"` — no new component needed, this phase is pure reuse.
- **History table** has 7 columns (Application No., Borrower, Loan Type, Amount, Status, Endorsed On, + trailing action column from Phase 7) — a skeleton row needs `colSpan={7}`.
- **Queue table** has 7 columns too (Borrower, Type, Status, Blocker, Filed, Waiting, + trailing action column) — `colSpan={7}`.
- **Queue page has a two-tier empty state** (`kpi.total === 0` → "Queue is clear"; `totalCount === 0` → "No matching applications"). Both checks need to sit **behind** the `loading` gate, not just behind `hasLoaded` — otherwise, after the first load, a refetch (e.g. typing a search term) will briefly show stale/zeroed state or flash the wrong empty state while the new response is in flight.
- **History page has one empty state** (`totalCount === 0` → "No matching records"), same requirement.
- **Pagination/page-size controls must stay visible and mounted through every refetch**, not hidden during `loading` — a page/sort/filter change is frequently *triggered by* clicking something in that row (e.g. "next page," a page-size option). Hiding `Pagination`/`Select` while `loading` is true would remove the very control the user just interacted with and cause a layout jump on every single filter/sort/page action. Only the KPI row and the table/grid body swap to skeletons; the toolbar, filter panel, and pagination/page-size controls stay rendered and interactive throughout (harmless to show them during the very first-ever load too — worst case a brief "Showing 0–0 of 0," not worth special-casing away).
- Once `loading` (not `!hasLoaded`) is the single gate for both the skeleton and the empty-state checks, **`hasLoaded` may become dead state** in both files — check whether it's referenced anywhere else in each page (it isn't, per the current file contents) before removing it, and remove it if genuinely unused rather than leaving an unused `useState`.

### Files to change

1. **`src/app/csa/history/page.tsx`**
   - Remove `if (!hasLoaded && loading) return <Spinner />;` and, if nothing else references `hasLoaded`/`setHasLoaded`, remove that state entirely (don't leave dead state).
   - Add `Skeleton` to the existing `@/components/ui` import (check `src/components/ui/index.ts` first — it should already be exported).
   - KPI row: when `loading`, render 4× `<Skeleton variant="kpi" />` in place of the 4 real KPI buttons (same `.kpi-grid` wrapper); otherwise render the real cards as today.
   - Body region: restructure to `loading ? <skeletonBody/> : totalCount === 0 ? <EmptyState/> : <realContent/>`. `skeletonBody`: the real `<Table>` with its real `<thead>` (headers aren't data-dependent) but a `<tbody>` of ~6 rows, each `<tr><Td colSpan={7}><Skeleton variant="line" /></Td></tr>`.
   - `Pagination` and the page-size `Select`: move them **outside** the `loading ? ... : ...` branching (or otherwise ensure they render unconditionally alongside both the skeleton and real-content branches) so they never disappear during a refetch.
2. **`src/app/csa/page.tsx`**
   - Same treatment: remove the `Spinner` early-return (and dead `hasLoaded` state, if applicable), `Skeleton variant="kpi"` ×4 in the KPI row whenever `loading`.
   - Body region: `loading ? <skeletonBody/> : kpi.total === 0 ? <EmptyState title="Queue is clear".../> : totalCount === 0 ? <EmptyState title="No matching applications".../> : <realContent/>` — both empty-state branches, and the skeleton, all gated on the same `loading` flag.
   - Same pagination/page-size-stays-mounted requirement as the History page.

### Explicitly out of scope for this phase

- `src/components/ui/Skeleton.tsx` — not modified, used as-is.
- Every other module's pages — not built yet, but their plans will use this same "skeleton on every load" pattern from the start.

### Validation checklist

- [ ] On first visit to `/csa/history` and `/csa`, the page header/toolbar/filters render immediately (not blank), with KPI-shaped and table-row-shaped skeletons in place of real data.
- [ ] Typing a search term (after the 300ms debounce fires), changing a status/date filter, clicking a KPI quick-filter, sorting a column, and changing page or page size **all** re-show the skeleton body/KPI row while the new response is in flight — not just the first load.
- [ ] Pagination and the page-size selector remain visible and clickable throughout every refetch — never disappear or flash away.
- [ ] Neither page flashes an incorrect `EmptyState` during any load, first or subsequent.
- [ ] Once each load completes, real KPI cards and rows render exactly as before (Phases 1–11 behavior unchanged).
- [ ] Queue's two-tier empty state (`kpi.total === 0` vs `totalCount === 0`) still resolves correctly — this phase must not merge or break that distinction validated in Phase 11.
- [ ] `Spinner` import and `hasLoaded` state removed from both files if genuinely no longer referenced (verify first, don't assume).

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Overall item status: Phases 1–12 DONE (validated 2026-08-11, 561/561 tests); Phase 13 implemented, awaiting validation
