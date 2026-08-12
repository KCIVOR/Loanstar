# CSA — `/csa/leads` (open agent referrals)

## Status

Phase 0 audit complete, 2026-08-12. **No defect** — the convert flow (`POST /api/csa/leads/[id]/convert`) is already correctly idempotent: guards on `status='open' AND application_id IS NULL`, uses `.maybeSingle()` and throws `"Lead was converted by another request"` if the race is lost (already matches the pattern this batch has been adding elsewhere — this one had it from the start). **Both downstream event types already have real history coverage elsewhere** — no new history page needed. Pure UI redesign, full pattern from the start.

## Phase 0 audit findings

- **Page**: `src/app/csa/leads/page.tsx` (97 lines). Client component, single bulk `fetch("/api/csa/leads")` on mount, full-page `<Spinner/>` (`page.tsx:41`). Bare `<ul>` list, no search, no sort, no filter, no pagination, no KPI cards, no `ViewModeToggle`. One action per row: "Start application" (`Link` to `/csa/applications/new?leadId=...&name=...`, not a direct API call from this page — the actual conversion happens when that form is submitted, via the convert route below).
- **Backend**: `GET /api/csa/leads` (`src/app/api/csa/leads/route.ts:1-67`) — `requireModulePermission("intake", "view")`, queries `leads` where `application_id IS NULL AND status='open'`, ordered `created_at desc`, then re-filters through `isOpenUnlinkedLead()` (`src/lib/csa/leads.ts` — a pure guard, reused not duplicated) as a defensive double-check. Joins agent display names via a service-role `profiles` lookup. No `.limit()` — small bounded backlog (open referrals not yet started), same shape as this batch's other worklists.
- **Convert action**: `POST /api/csa/leads/[id]/convert` (`route.ts:16-99`) — creates the CSA application (`createCsaApplication`), then updates the lead's `status='converted'`/`application_id`/`borrower_id` guarded by `.eq("status","open").is("application_id", null).maybeSingle()` — **already race-safe**, throws a clear error if lost. Notifies the originating agent. Writes an audit event.
- **Where the two downstream events already surface, confirmed, no gap**:
  1. **Lead converted** (`leads.status='converted'`) — already shown in Agent's own History (item 5, already Done, `/agent/history` "Closed Leads"), which is keyed off exactly this status transition (confirmed during item 5's own audit: `updated_at` reliably proxies "converted at", only `open`/`converted` are real statuses).
  2. **The resulting application** — once created, it's a normal CSA application, fully covered by CSA's own Application History (item 1, already Done).
  So there is nothing left uncaptured by converting a lead here — this page only needs the standard active-worklist chrome, not a new history destination.
- **Permission**: `requireModulePermission("intake", "view"/"create")` — consistent with the rest of CSA.
- **Detail/View**: none needed — a lead has no independent detail page, "Start application" is the only meaningful action, and it already routes correctly.

## Phase 1 — Frontend: full pattern

Rewrite `src/app/csa/leads/page.tsx`:
- **Outer shell always mounted.**
- **KPI cards**: "Open leads" (count) + "Oldest waiting" (days since `createdAt` for the oldest row) — same two-metric discipline used throughout this batch.
- **Collapsible Filters panel**: Waiting bucket chips (All / 1–3 / 4–7 / 8+ days) — the fifth near-identical copy of this helper shape across this batch (`cig/denials.ts`, `cig/history.ts` for callbacks, `collector/briefings.ts`, `ar/dcr-list.ts`, now this). Worth a real shared extraction at this point rather than a sixth copy if a future page needs it — judgment call for whoever implements, not mandatory for this phase.
- **`ViewModeToggle`** (list/grid/compact) — this page's rows are simple enough (borrower, agent, date, one button) that grid/compact fit naturally, unlike `/ar/dcr`'s form-embedded cards.
- **Search**: borrower name / agent name — client-side over the fetched set.
- **Sort**: "Referred" (createdAt) column, asc/desc.
- **Page-size pagination** — `Select` + `Pagination`, always mounted.
- **Skeleton loading** gated on `loading` alone.
- Keep "Start application" exactly as-is (same `href` construction, same target page) — the conversion flow is correct and untouched.

New pure helpers, e.g. `src/lib/csa/leads-list.ts`: waiting-bucket helpers (mirror the established shape), search predicate, sort-by-createdAt, KPI computation, page-size clamp.

## Phase 2 — Tests

`src/lib/csa/__tests__/leads-list.test.mts` — mirror `briefings.test.mts`'s structure.

## Explicitly out of scope

- Any change to the convert flow or `isOpenUnlinkedLead` — confirmed correct and already race-safe.
- A new history page for lead conversion — already covered by Agent's Closed Leads (item 5) and CSA's own Application History (item 1).
