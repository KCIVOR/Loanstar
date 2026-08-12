# CIG — `/cig/callbacks` (scheduled callbacks)

## Status

Phase 0 audit complete, 2026-08-12. Found a real defect while auditing this page, not just a styling gap: **`callbacks.resolved_at` is never written anywhere in the codebase.** `/cig/history`'s "Callbacks Resolved" tab (item 8, already shipped) queries exactly the right column but will always render empty since nothing produces that data. **User decision 2026-08-12: add a real "Mark resolved" action** (mirrors `/cig/denials`' "Borrower informed" → `informed_at` pattern exactly) — this also retroactively fixes item 8's dead tab, no changes needed there once real rows start existing.

**Phase 1 complete, 2026-08-12** — `markCallbackResolved` + `POST .../callback-resolved`, `getCigScheduledCallbacks` widened to full unresolved backlog with `isOverdue`, list helpers exported for Phase 2/3. `getCigQueue` untouched. History resolve query unchanged.

**Phase 2 complete, 2026-08-12** — `/cig/callbacks` rewritten to full denials-style chrome: shell always mounted, Upcoming/Overdue KPIs, Status chips, search via `cigRecentMatchesSearch`, Due sort, ViewModeToggle, page-size + Pagination, skeleton loading, Open kept, Mark resolved → ConfirmDialog → POST → `load()` refetch. `getCigQueue` untouched.

**Phase 3 complete, 2026-08-12** — `src/lib/cig/__tests__/callbacks-list.test.mts` covers overdue, status filter, sort, KPIs, page-size clamp. `cigRecentMatchesSearch` not re-tested.

**Phase 4 complete, 2026-08-12** — Code-path verification only (no History code changes). `markCallbackResolved` writes `resolved_at`; `getCigCallbacksResolvedHistory` already filters `.not("resolved_at","is",null)`; History tab fetches `/api/cig/history/callbacks-resolved`. Live DB at verify time: `resolved=0`, `unresolved=1` — History tab stays empty until a callback is marked resolved in the UI (manual smoke still recommended). Tracker not marked Done.

**All 4 phases implemented, awaiting human validation.**

## Phase 0 audit findings

- **Page**: `src/app/cig/callbacks/page.tsx` (221 lines). Client component, single bulk `fetch("/api/cig/callbacks")` on mount, full-page `<Spinner/>` while loading (`page.tsx:88`). Has: client-side search (`cigRecentMatchesSearch`, reused from `lib/cig/history.ts` — a cross-module import worth keeping, not duplicating), client-side pagination (`CALLBACK_PAGE_SIZE=5`, `page.tsx:34`). No sort, no KPI cards, no Filters panel, no `ViewModeToggle`. Columns: Borrower, Due (`scheduled_at`), Notes, Open (links to `/cig/applications/[id]`).
- **Backend**: `GET /api/cig/callbacks` → `getCigScheduledCallbacks(supabase)` (`src/lib/cig/history.ts:399-465`) — queries `callbacks` where `resolved_at IS NULL AND scheduled_at > now()`, ordered `scheduled_at asc`, joined `loan_applications`/`borrowers`, **filtered to `status IN ('for_verification','for_revision')`** (`history.ts:433`, drops rows whose application moved on). **Only shows future callbacks — overdue ones (`scheduled_at <= now`, still `resolved_at IS NULL`) are excluded from this list entirely.**
- **Where overdue callbacks actually surface today**: `getCigQueue()` (`src/lib/cig/queue.ts:231-335`) queries the same `callbacks` table (`.is("resolved_at", null)`, no `scheduled_at` bound) and splits it into `hiddenIds` (future — excluded from the queue) and `overdueTimes` (past/due — kept visible, flagged `callbackOverdueAt` on the row, `queue.ts:299-309`). So today, an overdue callback is only visible as a badge on the main `/cig` queue row — **there is no dedicated place to review the full callback backlog (upcoming + overdue) together, and no way to mark one done from anywhere.**
- **Write paths on `callbacks`, full grep, confirmed exhaustive**:
  - `POST /api/cig/applications/[id]/callback` (`src/app/api/cig/applications/[id]/callback/route.ts:17-59`) — the only INSERT, creates a new callback with `scheduled_at`/`notes`/`recorded_by`. Never sets `resolved_at` (correct, it's a new row).
  - **No UPDATE anywhere.** `callbacks_update` RLS policy exists (`supabase/migrations/20260706140001_p4_rls.sql:52-60`, requires `verification:edit`) — the permission layer was built for a resolve action that was never wired into the UI.
  - Table DDL (`supabase/migrations/20260706140000_p4_cig_verification.sql:27-35`): `id, loan_application_id, scheduled_at, notes, recorded_by, resolved_at, created_at`. **No `resolved_by` column** — unlike `denial_notices.informed_by`. Don't add one (no migration needed for this plan) — use `writeAuditEvent` for actor traceability instead, same as the callback-creation route already does.
- **Impact on item 8** (already flagged on the tracker): once this plan wires up the write, `getCigCallbacksResolvedHistory`'s query (`src/lib/cig/history.ts:895-1002`, already correct) starts returning real rows — no changes needed there.
- **Permission**: `requireModulePermission("verification", "view")` for GET, `"verification", "edit")` for creation — same slug, org-wide RLS, consistent with the rest of CIG.
- **Detail page**: `/cig/applications/[id]` exists and is already linked via the "Open" button — keep.

## Phase 1 — Backend: resolve action ✅

New route `POST /api/cig/applications/[id]/callback-resolved` (mirrors `.../denial-informed` exactly):
- `requireModulePermission("verification", "edit")`.
- `markCallbackResolved(supabase, applicationId, callbackId)` (new function in `src/lib/cig/history.ts` or a small addition near `getCigScheduledCallbacks`) — `UPDATE callbacks SET resolved_at = now() WHERE id = :callbackId AND loan_application_id = :applicationId AND resolved_at IS NULL`, mirroring `markDenialInformed`'s `.is("informed_at", null)` idempotency guard exactly (`.is("resolved_at", null)` in the `WHERE`, `.select("id").maybeSingle()`, throw if no row updated).
- `writeAuditEvent` on success (`moduleSlug: "verification"`, `action: "execute_trigger"`, `entityType: "callback"`) — same pattern as the denial-informed route and the callback-creation route.

**Widen `getCigScheduledCallbacks`'s scope** (`src/lib/cig/history.ts:399-465`): drop the `.gt("scheduled_at", now)` bound so the page can show the **full unresolved backlog** (upcoming + overdue), not just upcoming — the whole point of adding a resolve action is to give CIG one place to work through it. Add a computed `isOverdue` (or reuse the existing `callbackOverdueAt` naming convention from `queue.ts` for consistency) to each returned row so the frontend can badge/filter by it. **Do not change `getCigQueue`'s own callback logic** (`queue.ts:289-309`) — the main queue's hidden/overdue badge behavior is correct and independent of this page; both read the same table, no conflict.

## Phase 2 — Frontend: full pattern ✅

Rewrite `src/app/cig/callbacks/page.tsx`:
- **Outer shell always mounted** (learned from item 9 — no `showX && <div>...` gate that unmounts the whole card on empty).
- **KPI cards**: Upcoming (count where `scheduled_at > now`), Overdue (count where `scheduled_at <= now`) — two real, useful operational numbers, same "don't pad with filler stats" discipline as item 9's Pending/Oldest-waiting pair.
- **Collapsible Filters panel**: a "Status" chip set (All / Upcoming / Overdue) — the one real filter dimension here, same chip-in-panel pattern as item 9's Waiting buckets.
- **Search**: keep `cigRecentMatchesSearch` (already reused from `history.ts`, don't reimplement).
- **Sort**: Due column (asc/desc) — matches item 9's single-sortable-column precedent.
- **`ViewModeToggle`** (list/grid/compact) — grid cards: borrower, due date + Upcoming/Overdue badge, notes, "Open" + new "Mark resolved" buttons at the bottom.
- **Page-size pagination** — `Select` + `Pagination`, always mounted (replace the current fixed `CALLBACK_PAGE_SIZE=5` client slice).
- **Skeleton loading** gated on `loading` alone (replace `if (loading) return <Spinner/>`).
- **New action**: "Mark resolved" button per row (list + grid) → `ConfirmDialog` (mirror `/cig/denials`' exact copy pattern: "Confirm you [handled/called about] this callback...") → `POST .../callback-resolved` → refetch (not optimistic splice — same concurrency reasoning as item 9's fix).
- Keep the existing "Open" button per row, unchanged target.

## Phase 3 — Tests

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/cig/__tests__/callbacks-list.test.mts` — `callbackIsOverdue`, `callbackStatusFilterSpec` / `passesCallbackStatusFilter`, `sortCallbacksByDue`, `computeCallbackListKpis`, `clampCallbackListPageSize`. Mirror the structure of `denials.test.mts` (item 9). `cigRecentMatchesSearch` already covered in `history.test.mts` — not re-tested.

## Phase 4 — Fix item 8's dead tab (verification only, no code change expected)

### Status: Verified by Cursor 2026-08-12 — awaiting human smoke test

Contract check (no History code changes needed):
- Write: `markCallbackResolved` → `UPDATE callbacks SET resolved_at = now()` with `.is("resolved_at", null)` (`history.ts`).
- Read: `getCigCallbacksResolvedHistory` → `.not("resolved_at", "is", null)` (`history.ts`); page tab "Callbacks Resolved" → `GET /api/cig/history/callbacks-resolved`.
- Live DB snapshot at verify: `unresolved=1`, `resolved=0` — History tab correctly empty until an officer uses Mark resolved. Manual UI smoke still recommended before marking tracker Done.

## Explicitly out of scope

- Adding a `resolved_by` column / migration — use `writeAuditEvent` for actor traceability instead, no schema change needed.
- Changing `getCigQueue`'s existing hidden/overdue callback logic on the main `/cig` queue — correct and untouched.
- Server-side pagination for the bulk fetch — same judgment as item 9 (small backlog), only the pagination *chrome* is added for visual consistency.
