# Collector — `/collector/briefings` (pre-release briefings)

## Status

**All phases implemented, awaiting human validation.**

Phase 0 audit complete, 2026-08-12. **Phase 1 complete, 2026-08-12** — full-pattern UI redesign of `/collector/briefings` (KPI + Filters waiting buckets + ViewModeToggle + pagination); helpers in `src/lib/collector/briefings.ts`; acknowledge ConfirmDialog + `load({ silent: true })` unchanged. **No backend defect this time** (unlike `/cig/denials`'/`/cig/callbacks`' concurrency/missing-write-path issues) — the write action here is real and complete: acknowledging a briefing correctly transitions `release_files.status` from `awaiting_briefing` → `ready_release`, which naturally removes the row from this page's query. That transition already feeds LRA's own History page (item 4, already Done, sourced from `release_events`) — briefing acknowledgment doesn't need its own separate history entry, it's a real intermediate step already captured by the existing audit log and LRA's release pipeline. **This plan is pure UI redesign**, full pattern from the start per the item-9 correction (KPI cards, Filters, `ViewModeToggle`, pagination) — same "small operational worklist" shape as `/cig/denials`/`/cig/callbacks`.

**Phase 2 complete, 2026-08-12** — `src/lib/collector/__tests__/briefings.test.mts` mirrors `denials.test.mts` (page-size clamp, daysWaiting, waiting buckets, search, sort, KPIs).

## Phase 0 audit findings

- **Page**: `src/app/collector/briefings/page.tsx` (211 lines). Client component, single bulk `fetch("/api/collector/briefings")` on mount, full-page `<Spinner/>` while loading (`page.tsx:106`). No search, no sort, no filter, no pagination, no KPI cards. Columns: Borrower, Path (With PDC / Without PDC badge), Signed since (`updated_at`), Conduct briefing (opens `ConfirmDialog` with the briefing checklist).
- **Backend**: `GET /api/collector/briefings` (`src/app/api/collector/briefings/route.ts:1-78`) — queries `release_files` where `status = 'awaiting_briefing'`, joined `loan_applications`/`borrowers`/`briefings`, ordered `updated_at asc`. No `.limit()` — unbounded, but inherently small (files handed off by LRA awaiting a briefing, drains as Collector works it — same bounded-backlog shape as the two CIG worklists already redesigned). **Judgment call, consistent with item 9/10's reasoning: no server-side pagination needed, pagination chrome added for visual consistency only.**
- **Action**: "Conduct briefing" → `ConfirmDialog` (shows the briefing checklist) → `POST /api/collector/briefings/[releaseFileId]` (`route.ts:1-39`) → `acknowledgeBriefing()` (`src/lib/lra/release-service.ts:475-560+`) — sets `briefings.acknowledged_at`/`acknowledged_by`, then (via service-role client, since collectors can't write `release_files` directly under RLS) transitions `release_files.status` to `ready_release`. **Already refetches correctly** (`page.tsx:98`, `load({ silent: true })`) — no concurrency gap to fix here, unlike `/cig/denials`' original splice bug.
- **Where this feeds downstream**: once `ready_release`, the file continues through LRA's release flow — LRA's already-Done History page (item 4, `history-plans/lra-released-loans.md`) captures the final `'closed'`-type `release_events` row. Confirmed no separate "briefing history" is needed.
- **Permission**: `requireModulePermission("collection", "view")` for GET, `"collection", "execute_trigger")` for acknowledge — consistent with Collector's other pages, org-wide-scoped for this particular query (`release_files.status='awaiting_briefing'` has no per-officer filter, unlike Collector's own `/collector/accounts` which is `assignments.collector_user_id`-scoped) — confirmed by re-reading `route.ts:10-35`, no `assignments`/`collector_user_id` filter anywhere in this query. Any collector can see and act on any file awaiting briefing, not just their own book — matches the operational reality (briefings happen in-branch, not tied to a specific collector's portfolio).
- **Detail page**: none of the columns need one — the action happens inline via the modal, same as the two CIG worklists.

## Phase 1 — Frontend: full pattern ✅

Rewrite `src/app/collector/briefings/page.tsx`, mirroring `/cig/denials`' final (Phase 3) shape closely:
- **Outer shell always mounted** — no gate that unmounts the card on empty.
- **KPI cards**: "Awaiting briefing" (count) + "Oldest waiting" (days since `updated_at` for the oldest row) — same two-metric discipline as `/cig/denials`, using `updated_at` as the "became awaiting_briefing at" proxy (confirmed at `release-service.ts:459-461`, stamped exactly when the file enters this status).
- **Collapsible Filters panel**: a "Waiting" bucket chip set (All / 1–3 / 4–7 / 8+ days), identical mechanics to `/cig/denials`' Phase 3 — reuse the same day-bucket helper shape (`daysWaiting`/`waitingBucketFilterSpec`/`passesWaitingBucket`), don't reimplement the bucketing logic from scratch, extract to a shared location if convenient (or duplicate the small pure functions into `lib/collector/briefings.ts` if a shared cross-module helper isn't a clean fit — judgment call for whoever implements, either is fine).
- **`ViewModeToggle`** (list/grid/compact) — grid cards: borrower, path badge, signed-since date, waiting-days, "Conduct briefing" button at the bottom.
- **Search**: borrower name / application no / borrower no — client-side over the fetched set (same reasoning as the CIG worklists: small bounded backlog).
- **Sort**: "Signed since" column (asc/desc).
- **Page-size pagination** — `Select` + `Pagination`, always mounted.
- **Skeleton loading** gated on `loading` alone (replace `if (loading) return <Spinner/>`).
- Keep the existing acknowledge flow exactly as-is (`ConfirmDialog` with checklist, refetch via `load({silent:true})`) — already correct, don't touch.

New pure helpers, e.g. `src/lib/collector/briefings.ts`: `daysWaiting`, `waitingBucketFilterSpec`/`passesWaitingBucket` (mirror `/cig/denials`), `briefingSearchPredicate`, `sortBriefingsByUpdatedAt`, `computeBriefingListKpis`, page-size clamp.

## Phase 2 — Tests ✅

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/collector/__tests__/briefings.test.mts` — mirror `denials.test.mts`'s structure exactly (same shape of problem, same helpers).

## Explicitly out of scope

- Any backend/write-path change — the acknowledge flow is already correct and complete, confirmed by tracing it all the way through to LRA's release pipeline.
- A separate "briefings history" page — LRA's existing History page already captures the file's ultimate release event; a briefing-acknowledged event on its own isn't a distinct closure worth its own page.
- Server-side pagination — same judgment call as the two CIG worklists, chrome only.
