# Committee — Decision History (step-by-step)

Part of the module history/closed-records rollout. See `loanstar/docs/history-closed-records-tracker.md` for the workflow rules, all four standing requirements, and overall status across all 7 modules.

**Goal:** once the committee votes on an application, it disappears from their queue with no way to look back at it. This adds a read-only **Decision History** page at `/committee/history`, plus a redesign of the existing `/committee` active-voting-queue page — both built server-side-driven from day one (search/filter/sort/pagination all in the API, not a client-side bulk fetch), with skeleton loading on every load, and a View action per row. This is the **second** module in the rollout (after CSA, which is the reference implementation every phase below follows) — the shared components (`DateRangeFilter`, `ViewModeToggle`) and CSS already exist from CSA's Phase 1, so this plan only adds Committee-specific backend/page work.

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. **After all phases are implemented, produce one final combined summary report covering every phase.**

**Ground rules (apply to every phase in this file):**
- Touch only the files listed for that phase's "Files to change." If you notice something related but unlisted, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Run existing tests after each phase; don't delete or weaken a test to make it pass.
- Output a summary at the end of each phase: files changed, tests run/result, anything deliberately left alone.

---

## Phase 0 — Audit findings (evidence, verified 2026-08-11)

**No RLS/migration needed.** All four tables a Decision History page touches already grant unconditional (status-independent) SELECT to `committee:view`:
- `loan_applications` — `supabase/migrations/20260710030000_fix_applications_select_staff_portals.sql:5-23` (same policy CSA relies on — `committee` is one of the OR'd module checks).
- `committee_votes` — `supabase/migrations/20260706150001_p5_rls.sql:9-14`.
- `committee_actions` — `supabase/migrations/20260706150001_p5_rls.sql:30-35`.
- `computations` — `supabase/migrations/20260710100001_fix_computations_select_committee.sql:6-21`.

**The "left the queue" marker is `committee_actions`, not a timestamp column on `loan_applications`.** There is no `decided_at`-style column on `loan_applications` (confirmed absent from `supabase/migrations/20260706120000_p2_borrower_agent_documents.sql:41-56`). Every final committee action (approve/deny/revisit/hold) inserts one row into `committee_actions` (`src/lib/committee/actions.ts:159-169`, columns: `id, loan_application_id, action, comment, acted_by, acted_at DEFAULT now(), votes_snapshot jsonb`, DDL `supabase/migrations/20260706150000_p5_committee_negotiation.sql:14-22`).

**Decision History = one row per `committee_actions` entry, not one row per application.** This is a deliberate departure from CSA's model (which was one row per application, since `endorsed_at` is set exactly once). An application can receive **multiple** committee actions over time — e.g. `hold` (from `for_approval`), then later `approve` — each is a real, separate decision event with its own date, its own vote snapshot, and its own outcome. Treating `committee_actions` as an append-only decision log (query it directly, no per-application dedup) is both simpler to implement and more correct than trying to force a "latest decision per application" model: a genuine audit trail should show that the committee held a file on one date and approved it on another, as two entries, not collapse them into one.
- **Consequence**: `committee_hold` decisions **will** appear in History even though `committee_hold` is *also* still one of the active-queue statuses (`for_approval, negotiating_terms, committee_hold` — `src/app/api/committee/applications/route.ts:35`) — i.e. a held file shows in both the active queue *and* History simultaneously. This exactly mirrors the precedent already established for CSA (`for_revision` applications appear in History despite being back in CSA's active queue) — same principle, not a new inconsistency.
- `votes_snapshot` is a `VoteRecord[]` (`{ id, voterId, vote, votedAt, comment }[]`, see `src/lib/committee/actions.ts:77-84,131`) captured **at the moment of that specific action** — this is the correct source for a History row's "Your Vote" column, **not** a live query against current `committee_votes` (which reflects the *current* state, wrong for a decision made weeks ago if votes changed since — though in practice votes are locked after a final action; using the snapshot is still the semantically correct source and avoids relying on that being true).
- **Override does not create a new "decided at" event** — `src/app/api/committee/applications/[id]/override/route.ts:30-45` only fires for `for_approval` (pre-decision amount tweak) or `negotiating_terms` (post-approval amount renegotiation), never inserts into `committee_actions`, and is gated on `committee:edit` not a final-action flow. Not relevant to History's row set.

**"Amount" comes from `computations`, latest active version — same pattern as CSA.** `pickLatestActiveComputation` (`src/lib/csa/history.ts:99-113`, query shape `src/lib/csa/history.ts:282-286`: `.from("computations").select("loan_application_id, loan_type_name, principal, version").in("loan_application_id", ids).eq("is_active", true)`, reduce to highest `version` per id in JS) is the exact logic needed here too. **Do not cross-import it from `@/lib/csa/history`** — that file is CSA-specific by location and importing from it here would create an odd cross-module coupling for what is really a generic small helper. Duplicate the ~15-line pure function into `src/lib/committee/history.ts` (same as CSA duplicated its own copy rather than sharing one). If a third module needs this exact logic, that's the point to extract a shared `src/lib/computations/` helper — not before (avoid premature abstraction for a 2-instance duplication).

**Search needs one more hop than CSA's, because the base table differs.** CSA's History queried `loan_applications` directly (which has `application_no` and an embeddable `borrowers` relation) — a 2-step search (borrowers → ids → main query `.or()`) was enough. Committee's History queries `committee_actions` as the base table, which has neither `application_no` nor a borrower relation, only `loan_application_id`. Search therefore needs **3 steps** when a term is present:
1. `borrowers` → matching borrower ids (identical to CSA's step 1).
2. `loan_applications` → `.select("id").or("application_no.ilike.<pattern>,borrower_id.in.(<borrowerIds>)")` (or plain `.ilike("application_no", pattern)` if step 1 found zero borrower matches, same fallback CSA uses) → matching loan_application ids.
3. Main `committee_actions` query → `.in("loan_application_id", <ids from step 2>)`, combined with the other filters.
When no search term is present, skip straight to a single query (steps 1–2 only run when `search` is non-empty) — same conditional-cost principle CSA's search already uses.

**Decision groups map directly onto `committee_actions.action`** — no bucketing function needed (unlike CSA's `csaHistoryStatusGroup`, which had to group 15 raw statuses into 3 buckets). The 4 action values (`approve`, `deny`, `revisit`, `hold`) *are* the filter/KPI groups, labelled **Approved / Rejected / Revisit / Hold** for the UI.

**Detail page is safe to link to, unconditionally.** `src/app/committee/applications/[id]/page.tsx` (1589 lines) has no `notFound()`/`redirect()`/status-based hard guard anywhere — status only toggles which action buttons/sections are interactive (`canVote`, `isCommitteeHold`, `data.application.canDecide`/`canOverride`/`canAdjustPreDecision`, lines 495, 497, 1096, 1239, 1274, 1337). A decided application (status `approved`/`denied`/`for_revision`) still renders the full read-only view (CI report, computation, votes, latest committee action card) with no action buttons — same "hide affordances, don't block the page" pattern as CSA's `editable` flag. Safe to link `/committee/applications/${id}` directly from every History row.

**Permission**: module slug `"committee"`, action `"view"` for all reads (`src/app/api/committee/applications/route.ts:8`, `[id]/route.ts:22`).

**Sidebar** currently has **no `children`** on the committee entry (`src/components/admin/Sidebar.tsx:261`, single flat `{ href: "/committee", label: "Committee", icon: "committee", modules: ["committee"] }`) — needs a `children` array added, same shape as CSA's (`Sidebar.tsx:229-243`).

**The active `/committee` queue page (full read, `src/app/committee/page.tsx`, 494 lines) is simpler than CSA's queue was even before its own redesign** — no server-side anything (single unparameterized `fetch("/api/committee/applications")`, all search/status-filter/sort/pagination done client-side, `page.tsx:140,186-238`), a single-select `DropdownMenu` status filter instead of a collapsible Filters panel (no date range, no grid/list view toggle, no page-size selector), and the same local icon-based `Kpi`/`KPI_TONES` component pattern CSA's queue used (`page.tsx:95-122`) — **keep this icon style per the already-confirmed project-wide decision** (CSA precedent: keep icons, add only the missing pieces — collapsible Filters, date range, view modes, page size).
- Existing KPIs to preserve: In queue (total), Needs decision (`for_approval` count), On hold (`committee_hold` count), In negotiation (`negotiating_terms` count), **TAT overdue (5d+)** (`tatDays >= 5` count — `computeTatDays`/`tatTone`, `src/lib/committee/votes.ts:50-68`, thresholds: warning ≥5 days, danger ≥10 days since `verifications.forwarded_at`). 5 KPI cards, one more than CSA's queue had — that's fine, no code reason to drop TAT.
- Existing table columns to preserve: Application (name + app no/borrower no + reloan flag), Status (sortable), CIG finding badge (positive/negative/pending), TAT (sortable, `tatTone`-colored badge), Forwarded (sortable, `verifications.forwarded_at`), Review button → `/committee/applications/${id}`.
- **The active queue's meaningful "arrived" date is `verifications.forwarded_at`, not `loan_applications.created_at`** — unlike CSA where "Filed" (intake date) was the natural date-range field, an application entering *committee's* queue is meaningfully dated by when CIG forwarded it, not when the borrower originally applied (which could be weeks earlier). Use `verifications.forwarded_at` as the queue's date-range field, default preset **"All time"** per the standing rule (must not hide an old-but-still-pending file).
- TAT-overdue as a server-side KPI count needs `.lte("verifications.forwarded_at", <now - 5 days>)` — a plain AND-style comparison filter on an embedded table via `verifications!inner(...)`, which (unlike `.or()` across an embedded table) is reliably supported by PostgREST/Supabase-js — no fragility concern here, this is a different case from the search `.or()` issue CSA's audit flagged.

## Explicitly out of scope for this plan

- `src/app/committee/applications/[id]/route.ts`, `[id]/page.tsx` (the detail page/route) — read from, not modified.
- `src/app/api/committee/applications/[id]/{action,assessment,checklist,decision-email,override,vote}/route.ts` — untouched, this plan is read-only history + queue-listing work.
- `src/lib/committee/actions.ts` (`executeFinalAction` etc.) — read from for the audit above, not modified.
- CSA's files (`src/lib/csa/*`, `src/app/csa/*`) — reference only, not touched.

---

## Phase 1 — Backend: `lib/committee/history.ts` + `GET /api/committee/history`

### Files to change

1. **`src/lib/committee/format.ts`** (new file, same shape as `src/lib/csa/format.ts`): `formatDate` (en-PH, short month) and `formatMoney` (₱, 2 decimals) — copy CSA's implementations verbatim, this module doesn't have either yet.
2. **`src/lib/committee/history.ts`** (new file)
   - `export type CommitteeDecisionAction = "approve" | "deny" | "revisit" | "hold";`
   - `export type CommitteeHistoryRow = { id (committee_actions.id), applicationId, applicationNo, borrower: {...} | null, action: CommitteeDecisionAction, comment: string | null, myVote: "approve" | "deny" | null, loanTypeName: string | null, principal: number | null, actedAt: string }`
   - `export const COMMITTEE_DECISION_PAGE_SIZES = [10, 20, 30, 50, 100] as const;`
   - Duplicate `pickLatestActiveComputation` (pure, same shape as CSA's — see Phase 0 note on why it's duplicated not imported).
   - `export function myVoteFromSnapshot(snapshot: Array<{voterId: string; vote: "approve"|"deny"}>, userId: string): "approve" | "deny" | null` — pure, easy to unit test.
   - `export async function getCommitteeDecisionHistory(supabase, userId, params: { search?, action?: CommitteeDecisionAction | "all", from?, to?, sortKey?: "applicationNo"|"borrower"|"action"|"actedAt", sortDir?, page, pageSize }): Promise<{ rows: CommitteeHistoryRow[]; totalCount: number }>` — implements the 3-step search from Phase 0 (only when `search` is non-empty), `.eq("action", ...)` when `action !== "all"`, `.gte`/`.lte` on `acted_at` (same inclusive-bound helpers as CSA — `T00:00:00`/`T23:59:59.999`), sort (`applicationNo`/`borrower` via the embedded `loan_applications`/`borrowers` relation — confirm `{ foreignTable: "..." }` syntax works two levels deep, i.e. sorting `committee_actions` by a column on `loan_applications.borrowers`; if Supabase-js doesn't support a 2-hop foreign-table order, fall back to sorting by `loan_applications.application_no`'s *direct* foreign table only for `applicationNo`, and treat `borrower` sort as client-current-page-only like CSA's `amount` — verify this during implementation and note in the phase report which one it ended up being, don't guess in this plan), `action`/`actedAt` sort directly on `committee_actions`, `.range()`, `{count:"exact"}`. Batch-fetch `computations` for the returned rows' `loan_application_id`s exactly like CSA. Reuse `sanitizeSearchTerm` (same defensive stripping of `%_,()` CSA's history/queue both use — copy it, don't import, same duplication rationale as `pickLatestActiveComputation`).
   - `export async function getCommitteeHistoryKpiCounts(supabase, { from, to }): Promise<{ total, approve, deny, revisit, hold }>` — 5 parallel `head:true,count:"exact"` queries on `committee_actions`, scoped by `acted_at` date range only (not action filter, not search) — same "KPIs ignore the filter that shares their own row, only respect date" principle as CSA.
3. **`src/app/api/committee/history/route.ts`** (new file) — `requireModulePermission("committee", "view")`, parse/allowlist-validate query params (mirror `src/app/api/csa/history/route.ts` exactly: `search`, `action` (renamed from CSA's `status`), `range`/`from`/`to` via `resolveDateBounds`, `sortKey`, `sortDir`, `page`, `pageSize`), `Promise.all` the two queries, return `{ rows, totalCount, kpi }`. Default `range` = `"30d"` (History pages default to 30 days, per the established CSA precedent — this is a *History* page, not the active queue).

### Explicitly out of scope

No RLS/migration (Phase 0). No changes to `src/lib/csa/*` (reference only).

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 2 — Frontend: `/committee/history` page

### Files to change

1. **`src/app/committee/history/page.tsx`** (new file, `"use client"`) — follow `src/app/csa/history/page.tsx` **exactly** as the template (it's the validated, corrected-through-13-phases reference): query-string-driven `load()` with 300ms-debounced search, `loading`-gated (not `hasLoaded`) `Skeleton variant="kpi"` ×5 KPI row and `Skeleton variant="line"` ×6 skeleton table rows (`colSpan` = column count), `Pagination`/page-size `Select` rendered unconditionally outside the loading/empty/content branch, `EmptyState` gated behind `loading` alongside the skeleton (single `loading ? skeleton : totalCount === 0 ? empty : content` chain — Committee's History has only **one** empty state, not the queue's two-tier one, so this is simpler than Phase 6/7 below).
   - KPI row: 5 plain `.card.stat.is-clickable` buttons (Total / Approved / Rejected / Revisit / Hold), same markup pattern as CSA History's KPI buttons — **not** the icon style (that's reserved for queue pages per the established split).
   - Toolbar: `.gsearch` (placeholder "Search borrower, application no…"), `.active-pill-row` (not `.filter-bar` — the bug already fixed once for CSA, don't reintroduce it), `ViewModeToggle`, Filters toggle button with active-count badge, collapsible `.filter-panel` with two `.filter-group`s: "Decision" (4 action chips) and "Decided date" (`DateRangeFilter`).
   - Table columns (list/compact): Application No. (mono, primary, sortable), Borrower (sortable or not — per Phase 1's note on whether 2-hop foreign-table sort works), Amount (num, mono, teal-when->0, **not** sortable server-side — client-current-page-only, same as CSA's Amount), Your Vote (plain text "Approve"/"Reject"/"—", not sortable), Final Decision (badge — variant mapping: `approve→success`, `deny→danger`, `revisit→warning`, `hold→neutral`), Decided On (mono date, sortable, default sort desc), trailing View action column.
   - Grid view: `.gcard` per row — top row app-no + decision badge, borrower name, meta rows for Amount/Your Vote/Decided On.
   - View button: `<Link href={`/committee/applications/${row.applicationId}`}><Button variant="secondary" size="sm">View</Button></Link>` in both table and grid (per the standing "View action" requirement — confirmed safe target in Phase 0).
   - `PageHeader` title "Decision History", description "Applications you and the committee have already decided on."

### Explicitly out of scope

`src/app/committee/page.tsx` (the active queue — Phase 6/7), `src/app/committee/applications/[id]/page.tsx` — untouched.

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 3 — Sidebar wiring

### Files to change

1. **`src/components/admin/Sidebar.tsx`** — change the committee entry (`Sidebar.tsx:261`) from a flat item to one with `children`, same shape as CSA's:
   ```ts
   {
     href: "/committee",
     label: "Committee",
     icon: "committee",
     modules: ["committee"],
     children: [
       { href: "/committee", label: "Voting queue", exact: true },
       { href: "/committee/history", label: "Decision history" },
     ],
   },
   ```

### Explicitly out of scope

No other `PORTAL_NAV_ITEMS` entry touched.

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 4 — Tests (History backend)

### Files to change

1. **`src/lib/committee/__tests__/history.test.mts`** (new file) — unit tests for `myVoteFromSnapshot` (found/not-found/empty snapshot), `pickLatestActiveComputation` (same coverage shape as CSA's copy — highest version wins, no-match returns null), and whatever pure "build the `.in()`/`.eq()` filter spec" helper Phase 1 extracts for the action-group filter (mirror CSA's `statusesForHistoryGroup`/`workFilterSpec` pattern — Phase 1 should already have produced something testable here; if it didn't, that's a gap to flag before writing this phase, not silently work around).

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 5 — Backend: `/api/committee/applications` (active queue) becomes query-param-driven

### Files to change

1. **`src/lib/committee/queue.ts`** (new file) — `getCommitteeQueue(supabase, params: { search?, statusFilter?: "all"|"for_approval"|"committee_hold"|"negotiating_terms", from?, to?, sortKey?: "status"|"tat"|"forwarded", sortDir?, page, pageSize }): Promise<{ rows, totalCount }>`. Base filter `.in("status", ["for_approval","negotiating_terms","committee_hold"])` (export this list as a named constant, `ACTIVE_COMMITTEE_STATUSES`, same convention as CSA's `ACTIVE_QUEUE_STATUSES`). Date range on `verifications.forwarded_at` (embedded `!inner` join, plain `.gte`/`.lte`, per Phase 0's note this is reliable — not the `.or()` fragility case). Search: same 2-step pattern as CSA's queue (this table — `loan_applications` — has `application_no` directly, no extra hop needed, matches CSA's queue shape not History's). Sort: `status`/`forwarded` (`verifications.forwarded_at`, needs the same embedded-order-by check as Phase 1's borrower sort — verify and report) server-side; `tat` is a **computed** value (`now - forwarded_at`) — sort by `verifications.forwarded_at` as the server proxy (monotonically equivalent to sorting by TAT, same trick CSA used for "waiting" → `updated_at`), not a real "tat" column. `priority` (the page's default) stays client-current-page-only, same scoping principle as CSA.
   - `getCommitteeQueueKpiCounts(supabase): Promise<{ total, needsDecision, onHold, inNegotiation, tatOverdue }>` — 5 parallel counts over the active-status universe, **not** date-scoped (same "preserve existing behavior" rule CSA's queue KPIs followed — this page's KPIs were never date-filtered before, don't introduce that now). `tatOverdue` = active-status count `.lte("verifications.forwarded_at", <now minus 5 days>)`.
2. **`src/app/api/committee/applications/route.ts`** — rewrite `GET` to parse/allowlist-validate the same param shape as Phase 1's route (`search`, `status` (single value, not `statusGroup`, matching this page's existing single-select semantics — not a checkbox-group), `range`/`from`/`to` default `"all"`, `sortKey`, `sortDir`, `page`, `pageSize`), call both functions via `Promise.all`, return `{ rows, totalCount, kpi }`.

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 6 — Frontend: `/committee` (queue) calls the backend, gets the full toolbar

### Files to change

1. **`src/app/committee/page.tsx`** — same restructuring CSA's Phase 6+10+11+13 collectively did, but in one pass since we're not retrofitting:
   - Query-string-driven `load()`, 300ms-debounced search, `totalCount`/`kpi` from the response.
   - Keep the existing icon `Kpi`/`KPI_TONES` component and its 5 cards untouched **visually** — just source `value` from `kpi.*` instead of local `.filter().length`.
   - Add: collapsible `.filter-panel` (replace the single `DropdownMenu` status filter with `.fchip`s for the 4 status options, plus a "Forwarded date" `DateRangeFilter` group, default `"all"`), `ViewModeToggle` (grid needs a `.gcard` layout: app no/borrower top row + status badge, meta rows for CIG finding / TAT / Forwarded), page-size `Select`.
   - `loading`-gated skeleton (KPI row → 5× `Skeleton variant="kpi"`, table body → ~6 skeleton rows `colSpan` = column count) on **every** load, not just first — `Pagination`/page-size `Select` rendered unconditionally, never hidden during a refetch. Empty state (`totalCount === 0`, single-tier — Committee's queue doesn't have CSA's "queue is clear vs no matches" split unless you want to add one; if `kpi.total === 0` is worth its own message ("No files pending committee decision," matching the current copy at `page.tsx:288-289`) vs a filtered-to-zero "No matching applications" — **do add the two-tier split**, matching CSA's queue precedent, since the current empty-state copy already implies a "genuinely empty" message distinct from "no matches").
   - `sortKey === "priority"` (default) stays the exact existing client comparator (`page.tsx:217-234`), applied to the fetched page only.

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Phase 7 — Tests (queue backend)

### Files to change

1. **`src/lib/committee/__tests__/queue.test.mts`** (new file) — unit tests for whatever pure filter-spec helper Phase 5 extracts (mirror CSA's `workFilterSpec` test pattern: assert the active-status subset property, assert agreement with any existing pure matcher function if one exists/is extracted).

### Status: Implemented by Cursor 2026-08-11 — awaiting validation

---

## Overall item status: Phases 1–7 implemented, awaiting validation
