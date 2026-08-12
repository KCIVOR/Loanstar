# CIG — `/cig/denials` (pending denial calls)

## Status

Phases 1–2 **Done**, validated 2026-08-12, 733/733 tests. **Reversed 2026-08-12: user wants full pattern parity with every other list/queue page**, not the lightweight treatment — my Phase 0 judgment call (skip KPI grid/Filters panel/`ViewModeToggle`/pagination) is retracted for this page. **Phases 3–4 implemented by Cursor 2026-08-12 — awaiting validation.** Shell always mounted; KPI grid + Filters + `ViewModeToggle` + client pagination chrome landed; fetch stays bulk `GET /api/cig/denials`.

## Phase 0 audit findings

- **Page**: `src/app/cig/denials/page.tsx` (177 lines). Client component, single bulk `fetch("/api/cig/denials")` on mount, no query params. Full-page `<Spinner/>` while loading (`page.tsx:80`) — blanks the whole page including the header, same issue every other module had before its skeleton fix. No search, no sort, no filter, no pagination, no KPI cards.
- **Backend**: `GET /api/cig/denials` (`src/app/api/cig/denials/route.ts`) → `getPendingDenialCalls(supabase)` (`src/lib/cig/denials.ts:21-72`) — queries `denial_notices` where `informed_at IS NULL`, ordered `created_at asc`, joined to `loan_applications`/`borrowers`. **No `.limit()`** — unbounded, but the underlying set is inherently small: only files Committee has denied that CIG hasn't yet called, which drains as CIG works through it (a backlog, not an ever-growing history). This is not the same shape as the module-wide queues (CSA/CIG-verification/AR/etc.) that motivated the server-side-pagination standing rule — that rule targeted datasets that grow without bound. **Judgment call: leave the fetch as a single bulk request, don't add server-side pagination** — revisit only if this page is ever observed to actually carry a large backlog in practice.
- **Action**: "Borrower informed" → `ConfirmDialog` → `POST /api/cig/applications/[id]/denial-informed` (`src/app/api/cig/applications/[id]/denial-informed/route.ts`) → `markDenialInformed()` (`src/lib/cig/denials.ts:74-98`) sets `informed_at`/`informed_by`. On success the page **optimistically splices the row out client-side** (`page.tsx:64-66`) rather than refetching — works today, but drifts if two CIG officers are both working the list concurrently (each only sees their own optimistic removal, not the other's). Real gap: not in scope to leave silently, worth fixing in this pass since it's a one-line change (refetch instead of splice).
- **Now that CIG's History page exists** (item 8, already Done): the "Denial Calls" tab there shows *completed* calls (`informed_at IS NOT NULL`) — this page and that tab are correctly complementary (pending vs completed), no overlap to reconcile.
- **Permission**: `requireModulePermission("verification", "view")` for GET, `"verification", "edit")` for the informed-action — matches the rest of CIG, org-wide RLS (already confirmed in the CIG History audit).
- **No detail page relevant** — the action happens inline via the existing modal; nothing to add a View button for.

## Phase 1 — Frontend polish

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Rewrite `src/app/cig/denials/page.tsx` landed:
- **Skeleton loading**: `PageHeader` always renders; `Skeleton variant="line"` in `Td colSpan` rows while `loading` (including refetch after inform). No full-page `Spinner` gate.
- **Search**: client-side over the fetched set via `denialCallMatchesSearch` (borrower name / applicationNo / applicationId).
- **Sort**: Denied column only — `sortDenialCallsByDeniedAt`; default stays API order until the user clicks (then toggles asc/desc).
- **Concurrency**: successful "Borrower informed" clears `informTarget` and `await load()` (refetch, not splice). Errors still surface via `Alert`.
- **Pending count**: `N pending` appended to `PageHeader` description (not a kpi-grid).
- **Two-tier empty**: no pending vs no matching search.
- Helpers extracted to `src/lib/cig/denials.ts` for Phase 2 tests. Explicitly not added: KPI grid, `ViewModeToggle`, server-side pagination, DateRangeFilter, collapsible Filters, View/detail link.

Rewrite `src/app/cig/denials/page.tsx`:
- **Skeleton loading**: replace `if (loading) return <Spinner/>` with the standard pattern — static `PageHeader` always renders, `Skeleton variant="line"` table-body rows (via `Td colSpan`) while `loading`, gated on `loading` alone so it reappears on every refetch too.
- **Search**: add a simple client-side search box (borrower name / application no) over the already-fetched small set — no new query params needed, this isn't a server-side-pagination case (see Phase 0 rationale).
- **Sort**: add a "Denied" column sort toggle (asc/desc) — the one column worth sorting; skip building a generic multi-key sort framework for a 3-column list.
- **Fix the concurrency gap**: after a successful "Borrower informed" confirm, call `load()` (refetch) instead of splicing the row out of local state — small change, closes the multi-officer drift gap noted in Phase 0.
- **Explicitly not adding**: KPI cards (a single "N pending" count fits better as a line in the `PageHeader` description or a small badge, not a 4-card `kpi-grid`), `ViewModeToggle` (a 4-column worklist doesn't benefit from grid/compact views), collapsible Filters panel / date-range filter (nothing here is date-scoped browsing — it's "what's pending right now").

## Phase 2 — Tests

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/cig/__tests__/denials.test.mts` covers pure helpers in `src/lib/cig/denials.ts`:
- `denialCallMatchesSearch` — empty term matches all; case-insensitive first/last name and applicationNo; rejects non-matches; null borrower still matches applicationNo.
- `sortDenialCallsByDeniedAt` — asc/desc by `deniedAt`; does not mutate input; equal timestamps preserve relative order.

Does **not** mock Supabase or exercise `getPendingDenialCalls` / `markDenialInformed`.

## Phase 3 — Full pattern parity (supersedes the Phase 1 "explicitly not adding" list)

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Rewrite `src/app/cig/denials/page.tsx` landed:
- **Outer shell always mounted.** Card + toolbar + (collapsed) Filters panel render unconditionally; only the body region (skeleton / empty-state / rows) varies. Fixes the Phase 1 `showSearch` unmount UX bug.
- **KPI cards** (`kpi-grid`, 2 icon `Kpi`s): Pending (`denials.length`), Oldest waiting (`oldestWaitingDays` as `Nd` or `0`). `Skeleton variant="kpi"` while loading.
- **Collapsible Filters panel** (`.filter-panel`, `.active-pill-row`, Filters button with count badge — not `.filter-bar`): **Waiting** chips All / 1–3 days / 4–7 days / 8+ days (`fchip`). Search stays in the toolbar.
- **`ViewModeToggle`** list/grid/compact; grid cards show borrower, contact, denied date, waiting days, **Borrower informed** at bottom. Compact uses `is-compact` on the table. No View/detail link.
- **Page-size + Pagination** always mounted (loading/empty/data). Client filter pipeline: search → waiting bucket → sort Denied → paginate. Page resets to 1 on search / waiting / pageSize / sort change.
- Keep Phase 1: skeleton on every `loading` (incl. refetch after inform), refetch-after-inform (not splice), ConfirmDialog, two-tier empty (`kpi.pending===0` vs filtered empty).

Helpers in `src/lib/cig/denials.ts`: `daysWaiting` (wraps `daysSince`), `waitingBucketFilterSpec` / `waitingBucketForDays` / `passesWaitingBucket`, `computeDenialListKpis`, `clampDenialListPageSize` / `DENIAL_LIST_PAGE_SIZES` / `DENIAL_WAITING_BUCKETS`.

User decision 2026-08-12: match the standard chrome used everywhere else in the app, rather than the lightweight treatment. Rewrite `src/app/cig/denials/page.tsx` again:

- **Outer shell always mounted.** Remove the `showSearch` gate (`page.tsx:95`) that currently unmounts the whole toolbar/table card when `denials.length === 0` and search is empty — this reads as a broken page, not an empty one. The card, toolbar, and (collapsed) Filters panel render unconditionally; only the body region (skeleton / empty-state / rows) varies.
- **KPI cards** (`kpi-grid`, 2 cards — there's only one real dimension here, don't invent filler metrics):
  - **Pending** — `denials.length` (date-scoped is meaningless here, this is a live backlog count).
  - **Oldest waiting** — days since the oldest pending item's `deniedAt` (0 if none) — genuinely useful operationally (tells CIG how stale the backlog is), not a padding stat.
- **Collapsible Filters panel** (`.filter-panel`, `.active-pill-row`, `Filters` button with a count badge — same chrome as every other module, not `.filter-bar`): holds a **"Waiting" quick filter** (chips: All / 1–3 days / 4–7 days / 8+ days, computed client-side from `deniedAt` — same style as Remedial's severity chips) in addition to the existing search box. Search stays in the toolbar row (not inside the panel), matching the CSA/Remedial/Collector toolbar layout.
- **`ViewModeToggle`** (list/grid/compact) — reuse unchanged from `@/components/history`. Grid cards: borrower name, contact, denied date, waiting-days, the same "Borrower informed" button at the bottom (same placement convention as every other module's grid cards).
- **Page-size pagination** — `Select` + `Pagination`, always mounted (not hidden during loading/empty), even though typical volume is small; for visual/structural consistency with every other list page, not because this page needs it at scale.
- **Sort** stays client-side (unchanged reasoning — small fetched set); extend to also apply after the new waiting-bucket filter.
- Keep everything from Phase 1 that isn't being reversed: skeleton loading gated on `loading` alone, refetch-after-inform (not splice), the search/sort pure helpers already tested in Phase 2.

New pure helper in `src/lib/cig/denials.ts`: `daysWaiting(deniedAt, asOf)` and `waitingBucketFilterSpec`/`passesWaitingBucket` (mirrors `agingFilterSpec`/`passesAgingFilter` pattern from `lib/collector/queue.ts` and `lib/remedial/queue.ts`).

## Phase 4 — Tests (Phase 3 additions)

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Extended `src/lib/cig/__tests__/denials.test.mts` (kept existing search/sort tests):
- `daysWaiting` — same day → 0; next day → 1; invalid/missing → null
- `waitingBucketFilterSpec` / `passesWaitingBucket` — all chips + unknown → all; day 0/null only pass `"all"`
- `waitingBucketForDays` bucket mapping
- `computeDenialListKpis` empty → `{0,0}`; mixed fixture for pending + oldestWaitingDays
- `clampDenialListPageSize` allowlist + invalid → 10

Extend `src/lib/cig/__tests__/denials.test.mts`: `daysWaiting` boundary cases, `waitingBucketFilterSpec`/`passesWaitingBucket` chip mapping (mirroring the existing `agingFilterSpec` test patterns in Collector/Remedial's `queue.test.mts`), and confirm the KPI "Oldest waiting" computation.

## Explicitly out of scope

- Server-side pagination — page-size `Pagination`/`Select` chrome is added for visual consistency (Phase 3), but the underlying fetch stays a single bulk client-side request; not query-param-driven. Revisit only if this page is ever observed to actually carry a large backlog in practice.
- Any change to `markDenialInformed`/`getPendingDenialCalls`'s query shape — only client-side behavior changes.
