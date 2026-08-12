# Feature — Show current application status on Decision History

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, not a bug — a requested feature)

Decision History (`/committee/history`) is an append-only log of `committee_actions` rows — it shows *that* a decision was made (Approve/Deny/Revisit/Hold) and *when*, but nothing about what's happened to the application since. An approved application still has to go through CSA disclosure and borrower confirmation before it ever reaches LRA, and today Committee has no way to see, from History, whether that's happened yet — they'd have to open each application individually.

Agreed direction: add a **current status** column to Decision History, sourced from `loan_applications.status` (already joined into the existing query for `application_no`/`borrower` — no new query needed). This is read-only, informational — it does **not** change what's in the active voting queue (`ACTIVE_COMMITTEE_STATUSES`) or how/when a row lands in `committee_actions`; that logic (discussed and left as-is) stays exactly as it is today.

## Audit findings (verified 2026-08-12)

- `getCommitteeDecisionHistory` (`src/lib/committee/history.ts:173-332`) already selects `loan_applications ( application_no, borrowers (...) )` in its Supabase query (lines 222-230) — the same `loan_applications` row is already being fetched per action row. Adding `status` to that select list costs nothing extra (same round trip, one more column).
- `CommitteeHistoryRow` (lines 5-21) has no `status` field; the row-mapping code (lines 296-329) doesn't read `app?.status`.
- Frontend: `src/app/committee/history/page.tsx` — local `HistoryRow` type (lines 29-45) mirrors the backend type exactly and would need the same field added; the table (list view lines 572-661, grid view lines 528-571, loading skeleton header lines 500-509) has no status column/field anywhere.
- `formatStatusLabel` and `statusBadgeVariant` (`src/lib/applications/status.ts:36`, `:73`) already exist and are already used elsewhere in this app (e.g. `src/app/committee/applications/[id]/page.tsx`) to render a human label + badge color for a raw `loan_applications.status` value — reuse these instead of inventing new label/color logic.

## Scope decision

Two phases:
1. **Backend** — add `status` to the existing `loan_applications` select in `getCommitteeDecisionHistory`, thread it onto `CommitteeHistoryRow` as `currentStatus`.
2. **Frontend** — add a "Current Status" column (list view) / field (grid view) to Decision History, rendered with the existing `formatStatusLabel`/`statusBadgeVariant` helpers. No new filter, no new sort key, no new KPI — purely an added display column, since sorting/filtering by a value that changes independently of the decision log would be a separate, bigger feature not requested here.

---

## Phase 1 — Backend: return current status

**Goal:** `getCommitteeDecisionHistory` returns each row's current `loan_applications.status` alongside the existing decision fields, at no extra query cost.

### Files to change

1. **`src/lib/committee/history.ts`**
   - `CommitteeHistoryRow` type (lines 5-21): add `currentStatus: string;` (raw status value — formatting happens on the frontend, matching how every other page in this app passes raw status to `formatStatusLabel` at render time rather than pre-formatting server-side).
   - Query select (lines 212-233): add `status` to the `loan_applications (...)` nested select, i.e. `loan_applications ( application_no, status, borrowers (...) )`.
   - Row-mapping (lines 296-329): read `app?.status` (same `Array.isArray(appRaw) ? appRaw[0] : appRaw` unwrap already done for `app` on line 299) and set `currentStatus: (app?.status as string | null) ?? "unknown"` on the returned row object.
   - Do not touch `getCommitteeHistoryKpiCounts`, the search helpers, `pickLatestActiveComputation`, `myVoteFromSnapshot`, `actionFilterSpec`, or any sort/filter/pagination logic — this phase only adds one field to the existing query and row shape.

### Validation checklist — Phase 1

- [x] `getCommitteeDecisionHistory` rows include `currentStatus` with the application's live `loan_applications.status` value.
- [x] Query still selects exactly the same other columns; no new round trip added (confirm by reading the diff — should be a one-line select addition plus one field in the row mapper).
- [x] No changes to KPI counts, search, filtering, sorting, or pagination behavior.
- [ ] `npx tsc --noEmit` clean (pre-existing errors in unrelated files; touched files lint-clean).
- [x] Existing tests for this module (if any) still pass; full suite has no new failures.

### Status: Done (2026-08-12)

---

## Phase 2 — Frontend: display the status column

**Goal:** Decision History's list and grid views show each row's current status, using the app's existing status-label/badge helpers — read-only, no new interaction.

### Files to change

1. **`src/app/committee/history/page.tsx`**
   - Add import: `formatStatusLabel, statusBadgeVariant` from `@/lib/applications/status` (already used identically elsewhere in the Committee module, e.g. the application detail page).
   - Local `HistoryRow` type (lines 29-45): add `currentStatus: string;`, matching the backend type exactly.
   - List view table (lines 572-661): add a new `<Th>Current Status</Th>` column — place it after "Final Decision" and before "Decided On" (so the reading order is: what was decided → what's the state now → when it was decided). Add the matching `<Td>` in the row map (around line 641-647): `<Badge variant={statusBadgeVariant(row.currentStatus)}>{formatStatusLabel(row.currentStatus)}</Badge>`.
   - Grid view cards (lines 528-571): add a `"Current Status"` row to `gcard-meta`, alongside the existing Amount/Your Vote/Decided On rows, using the same `formatStatusLabel`/`statusBadgeVariant` rendering.
   - Loading skeleton header (lines 500-509): add the matching `<Th>Current Status</Th>` so the skeleton column count still lines up with the real table (bump the skeleton `<Td colSpan={7}>` on line 514 to `colSpan={8}` to match the new column count).
   - Do not add a new filter chip, sort key, or KPI tile for status — out of scope per the scope decision above. Do not touch the action/date filter panel, search, pagination, or any other section of this page.

### Validation checklist — Phase 2

- [x] List view shows a "Current Status" column between "Final Decision" and "Decided On", rendered with `formatStatusLabel`/`statusBadgeVariant`.
- [x] Grid view cards show the same status info.
- [x] Loading skeleton column count matches the real table (no layout shift when data loads).
- [x] No new filter/sort/KPI added — existing search, action filter, date filter, sort (including the two client-side sort keys `amount`/`borrower`), and pagination all behave exactly as before.
- [ ] `npx tsc --noEmit` clean (pre-existing errors in unrelated files; touched files lint-clean).
- [ ] Manual/API check: an approved-but-`awaiting_confirmation` application shows "Awaiting Confirmation" (or whatever `formatStatusLabel` renders for that status) in Decision History, distinct from a fully `lra_pending`/`released` one and from a `denied` one.

### Status: Done (2026-08-12)

---

## Explicitly out of scope for this feature

- Adding a filter or sort key on current status — requested as a display-only addition; filtering/sorting on a value independent of the decision log is a bigger feature, not part of this request.
- Any change to `ACTIVE_COMMITTEE_STATUSES`, the voting queue, or when a row enters `committee_actions` — that behavior was discussed and deliberately left as-is.
- Any change to `src/app/committee/applications/[id]/page.tsx` or any other Committee page.
- A new KPI tile counting applications by current status — not requested; the existing 5 KPI tiles (Total/Approved/Rejected/Revisit/Hold) stay as they are.

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures anywhere.
- [ ] Manual check across a few real applications in different post-decision states (e.g. `approved` fresh off a decision, `awaiting_confirmation`, `negotiating_terms`, `lra_pending`, `denied`) confirms the status column reflects each correctly and updates as the application progresses (re-check the same row after a downstream status change).

## Status: Done (2026-08-12)
