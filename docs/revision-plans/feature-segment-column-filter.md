# Feature — Segment (SF/SME) column + filter across all staff-facing list pages

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change" for that phase. If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Execute phases **in order, 1 through 23**. Each phase is one full page (backend select + backend filter + frontend column + frontend filter chip), fully working and tested, before the next phase starts. Do not batch multiple phases into one pass.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- Where a phase note says "confirm before implementing," actually check the live behavior/shape first — do not assume and do not skip the check.
- The new column is always labeled **"Segment"** and rendered as a `Badge` (`variant="teal" dot` "Seafarer" / `variant="navy" dot` "SME") — never plain text, never merged into an existing column.
- Segment filters always combine via **AND** with whatever filters already exist on that page (status/work/aging/severity/date range/search) — never replace or reset another filter.
- Where a page already has server-side pagination (`totalCount` driven by a real query), the segment filter **must** be applied server-side too — a client-only filter would silently corrupt `totalCount`. Only the explicitly-noted small/unpaginated working lists (payments-based Collector pages, AR/Collector DCR pages, briefings) get a client-side filter.
- At the end of all 23 phases, output one combined summary: files changed per phase, tests run/result, and anything flagged/skipped per a "confirm before implementing" note.

## Background (from conversation, decided scope)

User asked for every staff-facing list/queue page to show a new "Segment" column (Seafarer vs SME) and a matching filter, so staff can see and filter loan applications by SF/SME at a glance. Originally scoped as six separate portal plans (CSA, CIG, Committee, LRA, AR, Collector+Remedial+Agent); combined here into one file, phases numbered continuously 1–23 in portal order, per the user's request to keep everything in a single document.

`loan_applications.segment` and `masterlist.segment` already exist and are populated (`"seafarer" | "sme"`) — this whole feature is additive UI/query work, not a schema change.

---

# Part A — CSA (Phases 1–2)

## Audit findings (verified 2026-08-15)

- **`src/lib/csa/queue.ts`** (`getCsaQueue`) selects from `loan_applications` (`:208-227`) but does not select `segment`; no filter for it.
- **`src/lib/csa/history.ts`** — same shape, no `segment` in `CsaHistoryRow`, no filter.
- **`src/app/api/csa/applications/route.ts`** parses `search`/`work`/`range`/`from`/`to`/`sortKey`/`sortDir`/`page`/`pageSize` from `searchParams`, validates each against a `Set`, and passes through to `getCsaQueue`. This is the pattern every new `segment` param must follow.
- **`src/app/api/csa/history/route.ts`** — same shape for history.
- **Naming collision to avoid**: `src/app/csa/page.tsx` already has a column literally labeled `<Th>Type</Th>` (`:664`) showing `"Reloan" | "New loan"` (from `isReloan`) — a *different* concept from Segment. Do not rename, repurpose, or merge this column.
- **`/csa/leads`** (`src/app/csa/leads/page.tsx`, backed by `src/app/api/csa/leads/route.ts`) is **out of scope for this whole plan** — confirmed its query has `.is("application_id", null)`, meaning every row on this page by definition has no linked application yet, so segment is always undetermined for 100% of rows. Do not add a column or filter here, in any phase.

---

## Phase 1 — CSA queue (`/csa`)

**Goal:** The active intake queue shows a Segment column and a Segment filter (All / Seafarer / SME) that combines via AND with the existing work filter, search, and sort — without changing pagination behavior or any existing column.

### Files to change

1. **`src/lib/csa/queue.ts`**
   - Add `segment` to the `select(...)` in `getCsaQueue` (alongside `application_no`, `status`, etc.).
   - Add `segment?: "all" | "seafarer" | "sme"` to `getCsaQueue`'s params type; when not `"all"`, apply `.eq("segment", segmentFilter)` to the query — same style as the existing `.in("status", ...)` filtering already in this function. Combine with AND (do not replace the existing work-filter `.in`/`.or` logic).
   - Add `segment: "sme" | "seafarer" | null` to the row mapping returned by `getCsaQueue`.
   - Do not touch `getCsaQueueKpiCounts` or any exported function unrelated to this.

2. **`src/app/api/csa/applications/route.ts`**
   - Add a `SEGMENT_FILTERS` `Set(["all", "seafarer", "sme"])`, parse `searchParams.get("segment") ?? "all"`, validate against the set (same pattern as `WORK_FILTERS`), pass through to `getCsaQueue`.
   - Do not change any other query param handling.

3. **`src/app/csa/page.tsx`**
   - `QueueItem` type: add `segment: "sme" | "seafarer" | null`.
   - `buildQueueQuery`: add `segment` param + `qs.set("segment", params.segment)`.
   - Add `const [segmentFilter, setSegmentFilter] = useState<"all" | "seafarer" | "sme">("all")`, include it in the `load` dependency array and the page-reset `useEffect` (alongside `workFilter`).
   - Add a small chip group next to the existing `WORK_CHIPS` row (same `fchip`/`cn(...)` pattern already used for `workFilter`, see lines ~551 and ~397-421) with three options: All / Seafarer / SME.
   - Add `<Th>Segment</Th>` as a **new** column (do not touch the existing `<Th>Type</Th>`) in both table renderings on this page (`:571-577` and `:663-687`) — keep both in sync.
   - Do not touch the existing "Type" column, `WORK_CHIPS`, date range filter, sort logic, or any other part of this page.

### Validation checklist — Phase 1

- [ ] `Segment` column renders a badge for every row (Seafarer or SME, never blank).
- [ ] Selecting "Seafarer" or "SME" reduces `totalCount`/pagination correctly (confirm via network response) and combines correctly with an active work filter and search term at the same time.
- [ ] Existing "Type" column is untouched and still correct.
- [ ] Existing work filter, search, sort, date range, and pagination all still behave exactly as before when Segment filter is left on "All."
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 2 — CSA history (`/csa/history`)

**Goal:** Same Segment column + filter on the endorsed/closed history view, mirroring Phase 1's pattern exactly.

### Files to change

1. **`src/lib/csa/history.ts`**
   - Add `segment: "sme" | "seafarer" | null` to `CsaHistoryRow`.
   - Add `segment` to the underlying select and to `CsaHistoryQueryParams` (`"all" | "seafarer" | "sme"`), apply as an additional `.eq` filter when not `"all"`, combined with the existing `statusGroup`/date-range filtering via AND.
   - Do not touch `IN_PROGRESS_STATUSES`, `RELEASED_STATUSES`, or any status-bucketing logic.

2. **`src/app/api/csa/history/route.ts`**
   - Same `SEGMENT_FILTERS` Set + parse + pass-through pattern as Phase 1.

3. **`src/app/csa/history/page.tsx`**
   - Same additions as Phase 1's frontend: type field, query-string param, filter chip group, new `<Th>Segment</Th>` column. Do not touch the existing `loanTypeName` field if present — that's the loan product name, a different concept from Segment.

### Validation checklist — Phase 2

- [ ] Segment column + filter work identically to Phase 1, on the history view.
- [ ] Combines correctly with the existing status-group filter (in progress/denied/released) and date range.
- [ ] `loanTypeName` (loan product) column, if present, is untouched.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

# Part B — CIG (Phases 3–6)

## Audit findings (verified 2026-08-15)

- **Architectural difference from CSA/Committee/LRA/AR/Collector**: CIG's active queue does **not** filter/paginate via Supabase `.eq()`/`.range()`. `getCigQueue` (`src/lib/cig/queue.ts:230`) fetches the full classified superset from `loan_applications` (revision routing and callback overdue/hidden status are computed, not plain columns), and `src/app/api/cig/applications/route.ts` does the actual filter/sort/paginate **in JS** — `applications.filter((row) => inEndorsedAtBounds(...) && passesWorkFilter(row, workFilter) && cigQueueSearchPredicate(row, search))`, then `sortCigQueue`, then `.slice(...)` for pagination.
- The new Segment filter must be added as **another predicate in that same `.filter(...)` chain** (a new `passesSegmentFilter(row, segmentFilter)` function in `src/lib/cig/queue.ts`, mirroring `passesWorkFilter`) — **not** a Supabase-level `.eq()`.
- `src/lib/cig/history.ts` is a single file backing **four distinct list views**, each with its own row type and query-params type: `CigForwardedHistoryRow`/`CigForwardedQueryParams` (`/cig/history`, forwarded-to-committee tab), `CigReturnedHistoryRow`/`CigReturnedQueryParams` (`/cig/history`, returned-by-committee tab), `CigDenialCallsHistoryRow`/`CigDenialCallsQueryParams` (`/cig/denials`), `CigCallbacksResolvedHistoryRow`/`CigCallbacksResolvedQueryParams` (`/cig/callbacks`, resolved tab). Before editing any of these, confirm which underlying query function backs each type — do not assume they share one query path.
- `/cig/callbacks`'s **active** (not-yet-resolved) list comes from `getCigScheduledCallbacks` in `cig/history.ts`, called by `src/app/api/cig/callbacks/route.ts`.
- No naming collisions found on CIG pages (Borrower/Status/Callback/Endorsed/Waiting/Next action).

---

## Phase 3 — CIG active queue (`/cig`)

**Goal:** Segment column + filter on the active verification queue, implemented as an in-JS predicate matching this queue's existing architecture — not a Supabase query filter.

### Files to change

1. **`src/lib/cig/queue.ts`**
   - Add `segment: "sme" | "seafarer" | null` to `CigQueueItem` and to the `select(...)` in `getCigQueue` (`:235-249`) and its row mapping.
   - Add `export function passesSegmentFilter(row: CigQueueItem, segment: "all" | "seafarer" | "sme"): boolean` mirroring `passesWorkFilter`'s shape (`:69`).
   - Do not touch `passesWorkFilter`, `workFilterSpec`, `cigQueueSearchPredicate`, `inEndorsedAtBounds`, `sortCigQueue`, `computeCigQueueKpis`, or the revision/callback classification logic.

2. **`src/app/api/cig/applications/route.ts`**
   - Parse `searchParams.get("segment") ?? "all"`, validate against `Set(["all", "seafarer", "sme"])`.
   - Add `passesSegmentFilter(row, segmentFilter)` as an additional `&&` clause in the existing `applications.filter(...)` call (`:69-74`) — combine with AND.
   - Do not change `inEndorsedAtBounds`/`passesWorkFilter`/`cigQueueSearchPredicate`/sort/pagination logic itself.

3. **`src/app/cig/page.tsx`**
   - Add `segment` to the local row type, filter state + query string param, a filter chip group (All/Seafarer/SME) next to the existing filter controls, and a new `<Th>Segment</Th>` column with the Badge convention.

### Validation checklist — Phase 3

- [ ] Segment column renders correctly for every row.
- [ ] Segment filter correctly narrows `totalCount` and combines via AND with the existing work filter, date range, and search — verify by checking the actual filtered count in the API response, not just visible rows.
- [ ] Revision-routing and callback overdue/hidden classification are unaffected.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 4 — CIG history (`/cig/history`)

**Goal:** Segment column + filter on both the "Forwarded" and "Returned" tabs of this page.

### Files to change

1. **`src/lib/cig/history.ts`**
   - Add `segment` to `CigForwardedHistoryRow` + `CigForwardedQueryParams`, and to `CigReturnedHistoryRow` + `CigReturnedQueryParams`. For each, find its backing query function (grep the type name to locate it) and add `segment` to its select + apply as an `.eq()` filter (or JS predicate, matching whichever mechanism that specific function already uses — confirm before assuming).
   - Do not touch the Denial-calls or Callbacks-resolved types/functions in this phase — those are Phases 5 and 6.

2. **Route file backing `/cig/history`** (confirm the exact route file before editing) — same query-param pattern.

3. **`src/app/cig/history/page.tsx`** — same additions as Phase 3's frontend, applied to both tabs.

### Validation checklist — Phase 4

- [ ] Segment column + filter work on both Forwarded and Returned tabs.
- [ ] Combines correctly with each tab's existing filters.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 5 — CIG denials (`/cig/denials`)

**Goal:** Segment column + filter on the denial-calls history list.

### Files to change

1. **`src/lib/cig/history.ts`** — add `segment` to `CigDenialCallsHistoryRow` + `CigDenialCallsQueryParams` and its backing query function.
   - Also check `src/lib/cig/denials.ts` (`denial_notices` joined to `loan_applications`, confirmed live at `:31-33`) — if this file (not `history.ts`) is what actually backs `/cig/denials`'s row data, add `segment` there instead. Confirm which file actually backs this page before editing either.
2. **Route file backing `/cig/denials`** — same query-param pattern.
3. **`src/app/cig/denials/page.tsx`** — same column + filter additions.

### Validation checklist — Phase 5

- [ ] Segment column + filter work on the denials list.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 6 — CIG callbacks (`/cig/callbacks`)

**Goal:** Segment column + filter on both the active (not-yet-resolved) callback queue and the resolved-callbacks history tab, if this page has one.

### Files to change

1. **`src/lib/cig/history.ts`**
   - `getCigScheduledCallbacks` — add `segment` to its `loan_applications` select and row mapping.
   - `CigCallbacksResolvedHistoryRow` + `CigCallbacksResolvedQueryParams` and its backing function, if this page has a resolved-history tab.
2. **`src/app/api/cig/callbacks/route.ts`** and whichever route backs the resolved tab (if separate) — same query-param pattern.
3. **`src/app/cig/callbacks/page.tsx`** — same column + filter additions, on whichever tab(s) this page actually renders.

### Validation checklist — Phase 6

- [x] Segment column + filter work on the active callback queue.
- [x] Segment column + filter work on the resolved tab too, if one exists. *(N/A — `/cig/callbacks` has no resolved tab; resolved history lives on `/cig/history` “Callbacks Resolved” via `getCigCallbacksResolvedHistory` / `/api/cig/history/callbacks-resolved`. Left untouched per confirm-before-implementing / files-to-change scope.)*
- [x] `npx tsc --noEmit` clean. *(Pre-existing errors only — none in Phase 6 files; includes older `cig/__tests__/queue.test.mts` missing `segment` from Phase 3.)*
- [x] Existing test suite still passes. (`npm test` — 887/887 pass)

### Status: Done (2026-08-13)

**Confirm note (2026-08-13):** `/cig/callbacks` renders a single active scheduled-callbacks list only (no tabs). Resolved callbacks are on `/cig/history` (callbacks tab), not this page — so `CigCallbacksResolved*` / that route / history UI were not edited in this phase.

---

# Part C — Committee (Phases 7–8)

## Audit findings (verified 2026-08-15)

- **`src/lib/committee/queue.ts`** selects from `loan_applications` directly (`:171-191`) with DB-level `.eq()`/`.in()` filtering and `{ count: "exact" }` for pagination — same architecture as CSA. Add `segment` to the select and apply an `.eq("segment", segmentFilter)` alongside the existing `statusFilterSpec`-driven `.eq("status", ...)`.
- **`src/lib/committee/history.ts`** — single `CommitteeHistoryRow`/`CommitteeHistoryQueryParams` shape (`:5`, `:30`), also DB-filtered against `loan_applications` (`:145`). Same treatment.
- **`src/app/committee/page.tsx`** (Application/Status/CIG finding/TAT/Forwarded — no collision; reloan status shown inline as `" · Reloan"` text at `:650`, not a column — leave untouched).

---

## Phase 7 — Committee queue (`/committee`)

**Goal:** Segment column + filter on the active decision queue.

### Files to change

1. **`src/lib/committee/queue.ts`**
   - Add `segment` to the `select(...)` (`:171-191`).
   - Add a `segment` param (`"all" | "seafarer" | "sme"`), apply `.eq("segment", segmentFilter)` when not `"all"`, combined via AND with the existing status filter.
   - Add `segment: "sme" | "seafarer" | null` to the mapped row output.
   - Do not touch `verificationEmbed`, sort logic, or KPI counting.

2. **`src/app/api/committee/applications/route.ts`** — add `segment` query-param parse/validate (`Set(["all", "seafarer", "sme"])`) + pass-through.

3. **`src/app/committee/page.tsx`** — add `segment` to the row type, filter state + query-string param, a filter chip group, and a new `<Th>Segment</Th>` column in both table renderings (`:530-534` and `:616-624`). Do not touch the existing inline `" · Reloan"` text.

### Validation checklist — Phase 7

- [ ] Segment column renders for every row.
- [ ] Segment filter correctly narrows `totalCount` and combines via AND with the existing status filter and search.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 8 — Committee history (`/committee/history`)

**Goal:** Same Segment column + filter on the decision history view.

### Files to change

1. **`src/lib/committee/history.ts`** — add `segment` to `CommitteeHistoryRow`, `CommitteeHistoryQueryParams`, the select, and the `.eq()` filter, same pattern as Phase 7. Do not touch action/date filtering logic.
2. **Route file backing `/committee/history`** — same query-param pattern.
3. **`src/app/committee/history/page.tsx`** — same column + filter additions.

### Validation checklist — Phase 8

- [ ] Segment column + filter work on the history view, combine correctly with existing filters (action/date range).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

# Part D — LRA (Phases 9–10)

## Audit findings (verified 2026-08-15)

- **`src/lib/lra/queue.ts`** — hybrid architecture (per the existing code comment at `:396`: *"Date/search in SQL; scope + status + sort + pagination in JS after map"*). `getLraQueue` (`:399`) fetches a superset via `fetchQueueSuperset` (`:361-366`, date-bounded in SQL), then applies `scope`/`status` filtering **in JS** via `superset.filter((item) => passesScope(item, scopeSpec) && passesStatusFilter(item, statusSpec))` (`:440-443`), sorts, then slices for pagination.
  - The new Segment filter must follow the **JS predicate** pattern here (mirror `passesStatusFilter`, `:305`, and `statusFilterSpec`, `:140`) — not a Supabase `.eq()`.
  - `QUEUE_SELECT` (`:94`) needs `segment` added to its nested `loan_applications` fields; `LraQueueItem` (`:37`) needs a `segment` field; `mapQueueRow` needs to map it through.
- **`src/lib/lra/history.ts`** — different architecture, standard DB-level `.eq()` filtering against `loan_applications` (confirmed `:197-198`, `:305-306`). `ReleasedLoanRow`/`ReleasedLoansQueryParams` (`:5`, `:24`) — add `segment` here the standard way.
- **`src/app/lra/page.tsx`** (Borrower/Status/Stage-blocker/Path/Queued — "Path" means release-adjudication path, unrelated to Segment; no naming collision, but do not confuse the two).

---

## Phase 9 — LRA queue (`/lra`)

**Goal:** Segment column + filter on the active release queue, implemented as an in-JS predicate matching this queue's existing scope/status-filtering architecture.

### Files to change

1. **`src/lib/lra/queue.ts`**
   - Add `segment` to `QUEUE_SELECT`'s nested `loan_applications` fields (`:94`).
   - Add `segment: "sme" | "seafarer" | null` to `LraQueueItem` (`:37`) and thread it through `mapQueueRow`.
   - Add `export function passesSegmentFilter(item: LraQueueItem, segment: "all" | "seafarer" | "sme"): boolean`, mirroring `passesStatusFilter` (`:305`).
   - In `getLraQueue` (`:399-451`), add a `segmentFilter` param to `LraQueueQueryParams`, resolve it the same way `statusFilter` is resolved, and add `passesSegmentFilter(item, segmentSpec)` as an additional `&&` clause in the existing `superset.filter(...)` call (`:440-443`) — combine with AND.
   - Do not touch `fetchQueueSuperset`, `findBorrowerIdsForSearch`, `findLoanApplicationIdsForSearch`, `compareQueueItems`, or KPI counting.

2. **`src/app/api/lra/queue/route.ts`** — add `segment` query-param parse/validate (`Set(["all", "seafarer", "sme"])`) + pass-through, mirroring the existing `scope`/`status` handling.

3. **`src/app/lra/page.tsx`** — add `segment` to the row type, filter state + query-string param, a filter chip group, and a new `<Th>Segment</Th>` column in both table renderings (`:602-606` and `:691-700`). Do not touch the existing "Path" column.

### Validation checklist — Phase 9

- [ ] Segment column renders for every row.
- [ ] Segment filter correctly narrows `totalCount` and combines via AND with the existing scope and status filters and search.
- [ ] `fetchQueueSuperset`'s date-range SQL filtering is untouched; scope/status classification still correct.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 10 — LRA history (`/lra/history`)

**Goal:** Same Segment column + filter on the released-loans history view, using the standard DB-level filter pattern.

### Files to change

1. **`src/lib/lra/history.ts`** — add `segment` to `ReleasedLoanRow`, `ReleasedLoansQueryParams`, the select, and apply as an `.eq("segment", segmentFilter)` filter, combined via AND with the existing `release_path`/status filtering (`:197-202`, `:305-306`). Do not touch `release_events`/`event_type` filtering logic.
2. **Route file backing `/lra/history`** — same query-param pattern.
3. **`src/app/lra/history/page.tsx`** — same column + filter additions.

### Validation checklist — Phase 10

- [x] Segment column + filter work on the history view, combine correctly with existing release-path/status filters.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

# Part E — AR (Phases 11–13)

## Audit findings (verified 2026-08-15)

- `masterlist.segment` is a real, persisted column (set at AR-receive time — `src/lib/ar/masterlist.ts:79`). Every masterlist-based query below can read it directly with no join.
- **`src/lib/ar/queue.ts`** (`MasterlistQueueRow`, `:37-50`) **already selects `segment`**. `src/app/ar/page.tsx:453` already renders it, but only as a conditional `{row.segment === "sme" ? <Badge variant="navy">SME</Badge> : null}` inline next to the borrower name — no Seafarer indicator, no column, no filter. Phase 11 is a **promotion**, not new plumbing.
- Filtering is standard DB-level `.eq()` against `masterlist` (`src/lib/ar/queue.ts:179-189`).
- **`src/lib/ar/history.ts`** backs two views on `/ar/history`: `ClosedAccountRow` (from `masterlist` directly, `:123-136`) and `ReconciledPostingRow`/`ReconciledDcrRow` (from `postings`/`dcr`, `:253-303`). Confirmed live: `postings.masterlist_id` is a real FK column, so the reconciled-postings query can join `masterlist ( segment )` directly.
- **`/ar/dcr`** — `src/app/api/ar/dcr/route.ts:26` already nests `masterlist ( borrower_name, loan_account_no )`; add `segment` to that same nested select. No search/pagination params on this route — a segment filter here can be **client-side**.

---

## Phase 11 — AR masterlist queue (`/ar`) — promote existing badge

**Goal:** Convert the existing SME-only inline badge into a real Segment column showing both Seafarer and SME, and add a matching filter — segment data is already fetched, this is UI + filter-param work only.

### Files to change

1. **`src/lib/ar/queue.ts`**
   - Add a `segmentFilter?: "all" | "seafarer" | "sme"` to `MasterlistQueueQueryParams` (`:25-35`), apply `.eq("segment", segmentFilter)` when not `"all"` (mirror `statusFilterSpec`/`agingFilterSpec`'s pattern at `:182-189`), combined via AND. `MasterlistQueueRow.segment` already exists — no select change needed.
   - Do not touch `statusFilterSpec`, `agingFilterSpec`, sort, or KPI-counting logic.

2. **`src/app/api/ar/masterlist/route.ts`** — add `segment` query-param parse/validate (`Set(["all", "seafarer", "sme"])`) + pass-through, mirroring the existing `status`/`aging` handling.

3. **`src/app/ar/page.tsx`**
   - Add filter state + query-string param, a filter chip group next to the existing aging/status filter chips.
   - Replace the conditional badge at `:453` with a real `<Th>Segment</Th>` column rendering a Badge for every row, and remove the now-redundant inline badge next to the borrower name.
   - Do not touch the small `ar_queue`-backed "documents pending receipt" table on this same page (`fetch("/api/ar/queue")` at `:307`).

### Validation checklist — Phase 11

- [x] Segment column renders correctly for every row (both Seafarer and SME visible, not just SME).
- [x] The old inline SME-only badge next to the borrower name is removed.
- [x] Segment filter correctly narrows `totalCount` and combines via AND with the existing status/aging filters and search.
- [x] The separate "documents pending receipt" table is untouched.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 12 — AR history (`/ar/history`)

**Goal:** Segment column + filter on both the closed-accounts view and the reconciled-DCR-postings view.

### Files to change

1. **`src/lib/ar/history.ts`**
   - `ClosedAccountRow`/`ClosedAccountsQueryParams` (`:3-25`) — add `segment` to the select (`masterlist.segment` directly, `:123-136`) and as an `.eq()` filter.
   - `ReconciledPostingRow`/`ReconciledDcrQueryParams` (`:29-53`) — add a nested `masterlist ( segment )` to the `postings` select (`:253-303`, via the confirmed `postings.masterlist_id` FK) and apply the filter against the joined value, matching whatever filtering approach this specific query already uses.
   - Do not touch `postings`/`dcr` reconciliation logic itself.

2. **Route file backing `/ar/history`** — same query-param pattern for both views/tabs.

3. **`src/app/ar/history/page.tsx`** — same column + filter additions on both tabs.

### Validation checklist — Phase 12

- [x] Segment column + filter work on the closed-accounts tab.
- [x] Segment column + filter work on the reconciled-DCR-postings tab.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 13 — AR DCR (`/ar/dcr`)

**Goal:** Segment column on the DCR reconciliation working list. No server-side pagination exists here — a client-side filter is acceptable.

### Files to change

1. **`src/app/api/ar/dcr/route.ts`** — add `segment` to the existing nested `masterlist ( borrower_name, loan_account_no )` select (`:26`). Do not add server-side filter params — out of scope for this small phase.
2. **`src/app/ar/dcr/page.tsx`** — add a `<Th>Segment</Th>` column to the draft/confirmed line-item table(s), and a client-side filter chip group that filters the already-fetched array in memory.

### Validation checklist — Phase 13

- [x] Segment column renders for every DCR line item.
- [x] Client-side filter correctly shows/hides rows without breaking "Add to DCR"/submit actions.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

# Part F — Collector, Remedial, Agent (Phases 14–23)

## Audit findings (verified 2026-08-15)

- **`/collector/accounts`** — `CollectorQueueMappedRow` (`src/lib/collector/queue.ts:24-39`) **already has `segment`**, and `src/app/api/collector/accounts/route.ts:121` already selects it. `src/app/collector/accounts/page.tsx:275` already renders it as a conditional SME-only badge — same promotion pattern as AR.
- **`/remedial`** — same promotion pattern: `RemedialQueueMappedRow.segment` (`src/lib/remedial/queue.ts:16`) already populated, `src/app/api/remedial/accounts/route.ts:94` already selects it, `src/app/remedial/page.tsx:303` has the same SME-only inline badge to promote.
- **`/collector/proofs`, `/collector/dcr`, `/collector/dcr/history` (payments tab), `/collector/history`** all share one data source: `PAYMENT_SELECT` in `src/app/api/collector/payments/route.ts:18-33`, which already nests `masterlist ( borrower_name, loan_account_no )`. Add `segment` to that one nested select and every page reading from it gets the data. This route has **no server-side pagination/filter params** — a client-side filter per page is acceptable.
  - `/collector/dcr`'s "Draft line items" table cross-references the already-fetched payments array by `payment_id` — once `PAYMENT_SELECT` includes `segment`, that cross-reference carries it through automatically.
  - `/collector/dcr/history` fetches `/api/collector/dcr?limit=100` only (confirmed — does **not** fetch `/api/collector/payments`) and appears to render DCR-level summary rows, not per-borrower rows. **Confirm before implementing** in Phase 21.
- **`/collector/closed-accounts`** has two tabs, both from `src/lib/collector/history.ts`: `CollectorClosedAccountRow` (from `masterlist` directly, `:125-139`) and `CollectorTurnedOverRow` (from `remedial_turnovers`, `:292-309` — confirmed `remedial_turnovers.masterlist_id` is a real FK column).
- **`/collector/briefings`** — `src/app/api/collector/briefings/route.ts:18` already nests `loan_applications ( ... )`.
- **`/agent`** (leads queue) — `LEAD_SELECT` (`src/lib/agent/queue.ts:86-87`) only selects `application_id`, no join. Confirmed (`src/app/api/agent/leads/route.ts:47` comment) this queue **does** include leads that already have a linked application (unlike `/csa/leads`). Genuinely **partial**: only rows with `application_id` set can show a segment. This queue fetches in an offset-loop pattern (`:230-237`) — read that loop fully before touching it.
- **`/agent/history`** — `src/lib/agent/history.ts:88` already nests `loan_applications ( application_no )` — add `segment` alongside it.
- **`/csa/leads`** — confirmed fully out of scope (Part A).

---

## Phase 14 — Collector accounts (`/collector/accounts`) — promote existing badge

**Goal:** Convert the existing SME-only inline badge into a real Segment column + filter.

### Files to change

1. **`src/lib/collector/queue.ts`** — add `segmentFilter?: "all" | "seafarer" | "sme"` handling wherever `agingFilterSpec`-style filtering is applied (likely alongside `agingFilterSpec`, `:71-80`).
2. **`src/app/api/collector/accounts/route.ts`** — add `segment` query-param parse/validate + `.eq("segment", segmentFilter)`, combined via AND with the existing `remedial_flag`/`account_status`/aging filters (`:137-138`).
3. **`src/app/collector/accounts/page.tsx`** — replace the conditional badge at `:275` with a real `<Th>Segment</Th>` column, remove the redundant inline badge, add a filter chip group next to the existing aging filter chips.

### Validation checklist — Phase 14

- [x] Segment column shows both Seafarer and SME; old inline badge removed.
- [x] Filter narrows `totalCount` correctly, combines via AND with the existing aging filter and search.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 15 — Remedial (`/remedial`) — promote existing badge

**Goal:** Same promotion as Phase 14, on the remedial accounts queue.

### Files to change

1. **`src/app/api/remedial/accounts/route.ts`** — add `segment` query-param parse/validate + `.eq("segment", segmentFilter)`, combined via AND with the existing `remedial_flag`/severity filters (`:126-127`).
2. **`src/lib/remedial/queue.ts`** — add the segment-filter-spec helper if this file (rather than the route directly) is where filter specs live — confirm by checking where `SeverityFilterSpec` (`:39`) is applied.
3. **`src/app/remedial/page.tsx`** — replace the conditional badge at `:303` with a real `<Th>Segment</Th>` column + filter chip group.

### Validation checklist — Phase 15

- [x] Segment column shows both Seafarer and SME; old inline badge removed.
- [x] Filter narrows `totalCount` correctly, combines via AND with the existing severity filter and search.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

**Confirm note (2026-08-13):** `SeverityFilterSpec` / `severityFilterSpec` / `passesSeverity` live in `src/lib/remedial/queue.ts` and are applied in the route’s JS filter chain (severity is computed, not a SQL column). Added matching `segmentFilterSpec` / `passesSegmentFilter` there; route also applies SQL `.eq("segment", …)` alongside `remedial_flag` when not `"all"`, plus the JS predicate ANDed with severity/search/date.
---

## Phase 16 — Payments data source (`PAYMENT_SELECT`) — shared by Phases 17–19

**Goal:** Add `segment` once to the shared payments select so `/collector/proofs`, `/collector/dcr`, and `/collector/history`'s payment tab all get it for free.

### Files to change

1. **`src/app/api/collector/payments/route.ts`** — add `segment` to the nested `masterlist ( borrower_name, loan_account_no )` at `PAYMENT_SELECT` (`:31-33`) → `masterlist ( borrower_name, loan_account_no, segment )`. Do not add filter params to this route.

### Validation checklist — Phase 16

- [x] `/api/collector/payments` response (any `scope`) includes `segment` inside the `masterlist` object for every row.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 17 — Collector proofs (`/collector/proofs`)

**Goal:** Segment column + client-side filter on the payment-proofs list.

### Files to change

1. **`src/app/collector/proofs/page.tsx`** — add `segment` to the local payment row type, add a `<Th>Segment</Th>` column, add a client-side filter chip group filtering the already-fetched array.

### Validation checklist — Phase 17

- [x] Segment column renders for every payment row.
- [x] Client-side filter shows/hides correctly without breaking existing verify/reject actions.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 18 — Collector DCR (`/collector/dcr`)

**Goal:** Segment column + client-side filter on both "Draft line items" and "Confirmed payments" tables.

### Files to change

1. **`src/app/collector/dcr/page.tsx`** — add `segment` to the local payment row type (flows through from Phase 16), add a `<Th>Segment</Th>` column to both tables, add a client-side filter chip group filtering both tables consistently. The allocation modal is out of scope — do not touch `AllocationModalState`/the modal UI.

### Validation checklist — Phase 18

- [x] Segment column renders on both "Draft line items" and "Confirmed payments."
- [x] Client-side filter works on both without breaking "Add to DCR"/"Submit DCR" actions or the allocation modal.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 19 — Collector history — payments tab (`/collector/history`)

**Goal:** Segment column + client-side filter on the payment-history table (the DCR-history table on the same page is a separate concern — Phase 21).

### Files to change

1. **`src/app/collector/history/page.tsx`** — add `segment` to the payment row type, add a `<Th>Segment</Th>` column to the payment-history table (`:345-349` region), add a client-side filter chip. Do not touch the DCR-history table on the same page (`:285-290` region) in this phase.

### Validation checklist — Phase 19

- [x] Segment column + filter work on the payment-history table.
- [x] DCR-history table on the same page is untouched.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 20 — Collector closed accounts (`/collector/closed-accounts`)

**Goal:** Segment column + filter on both the "Closed accounts" and "Remedial turnovers" tabs.

### Files to change

1. **`src/lib/collector/history.ts`**
   - `CollectorClosedAccountRow`/`CollectorClosedAccountsQueryParams` (`:5-16`) — add `segment` to the select against `masterlist` (`:125-139`) and as an `.eq()` filter.
   - `CollectorTurnedOverRow`/`CollectorTurnedOverQueryParams` (`:30-42`) — add a nested `masterlist ( segment )` to the `remedial_turnovers` select (`:292-309`) and filter against the joined value.
2. **`src/app/api/collector/history/closed-accounts/route.ts`** and the equivalent remedial-turnovers route — same query-param pattern for both.
3. **`src/app/collector/closed-accounts/page.tsx`** — same column + filter additions on both tabs.

### Validation checklist — Phase 20

- [x] Segment column + filter work on both tabs independently.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 21 — Collector DCR history (`/collector/dcr/history`)

**Goal:** Segment visibility on the DCR-history page, if the existing rows render at a per-borrower granularity.

### Files to change

1. **Confirm before implementing**: read `src/app/collector/dcr/history/page.tsx` fully and check whether any rendered row shows a single borrower/payment (per-item), or whether every row is a DCR-level aggregate (submitted date, item count, total) with no borrower breakdown. This page only fetches `/api/collector/dcr?limit=100` today.
2. **If per-item rows exist**: fetch payments the same way `/collector/dcr` already does and add a `<Th>Segment</Th>` column + client-side filter, consistent with Phases 17–19.
3. **If only DCR-level aggregates render**: do not force a Segment column at the wrong granularity. Note this explicitly in the final phase summary as "not applicable — page has no per-borrower rows."

### Validation checklist — Phase 21

- [x] The granularity question above is explicitly answered and documented in the summary, either with a working column+filter or a clear "not applicable" note.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13) — N/A: DCR-level aggregates only, no per-borrower rows.

**Confirm note (2026-08-13):** `/collector/dcr/history` fetches `/api/collector/dcr?limit=100` and renders DCR-level rows only (id, status, item count, total, created/submitted). No Segment column or filter added.

---

## Phase 22 — Collector briefings (`/collector/briefings`)

**Goal:** Segment column on the pre-release briefing queue. No pagination/filter params exist on this route — a client-side filter is acceptable.

### Files to change

1. **`src/app/api/collector/briefings/route.ts`** — add `segment` to the nested `loan_applications ( ... )` select (`:18-27`) and thread it through the response mapping (`:51-57`).
2. **`src/app/collector/briefings/page.tsx`** — add a `<Th>Segment</Th>` column + client-side filter chip.

### Validation checklist — Phase 22

- [x] Segment column + client-side filter work correctly.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 23 — Agent leads (`/agent`, partial) and Agent history (`/agent/history`)

**Goal:** Segment column + filter on `/agent/history` (full — every history row has a real application). On `/agent` (partial — only converted leads have a segment; unconverted leads show "—" and are excluded from Seafarer/SME filter matches, included under "All").

### Files to change

1. **`src/lib/agent/history.ts`** — add `segment` alongside `application_no` in the existing nested `loan_applications ( application_no )` select (`:88`), thread through to the row type and filter.
2. **Route file backing `/agent/history`** — same query-param pattern.
3. **`src/app/agent/history/page.tsx`** — same column + filter additions.
4. **`src/lib/agent/queue.ts`** — add a nested `loan_applications ( segment )` to `LEAD_SELECT` (`:86-87`); a lead with `application_id IS NULL` naturally returns a null embed — render "—" for those rows. Read the offset-loop batching (`:230-237`) fully before touching this function; do not change its batching behavior or `QUEUE_FETCH_PAGE` size.
5. **`src/app/api/agent/leads/route.ts`** — add `segment` query-param parse/validate; unconverted leads never match a non-"all" segment filter, which is correct behavior.
6. **`src/app/agent/page.tsx`** — add a `<Th>Segment</Th>` column rendering the Badge for converted leads and a neutral "—" for unconverted ones, plus a filter chip group with the caveat above.

### Validation checklist — Phase 23

- [x] `/agent/history`: Segment column + filter work fully, every row has a segment.
- [x] `/agent`: converted leads show a Segment badge, unconverted leads show "—" and are correctly excluded from non-"all" segment filters without erroring.
- [x] The offset-loop batching in the leads queue function is unchanged in behavior.
- [x] `npx tsc --noEmit` clean. Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this entire plan

- `/csa/leads` — confirmed not applicable (every row has `application_id IS NULL` by query design).
- The DCR allocation modal, any DCR reconciliation/posting logic, remedial-turnover confirmation logic, or briefing acknowledgment logic.
- Any change to how `segment` is assigned/persisted anywhere — this plan only reads/filters the existing column.
- Any change to `is_reloan`/"Type" columns, `loanTypeName` (loan product) fields, or the LRA "Path" column — all distinct concepts from Segment, must stay untouched and unconfused with it.

## Final combined validation (after all 23 phases land)

- [x] Full test suite run — no new failures.
- [x] Every page in this plan shows a working Segment column and filter (or an explicitly documented "not applicable" for Phase 21 if that's the outcome), verified against live data for at least one Seafarer and one SME row where applicable.

**Final note (2026-08-13):** Phase 21 N/A — `/collector/dcr/history` is DCR-level aggregates only (no per-borrower rows); no Segment column/filter added. All other phases 1–23 landed.
