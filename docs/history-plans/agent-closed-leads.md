# Agent (Leads) — Closed Leads (step-by-step)

Part of the module history/closed-records rollout. See `loanstar/docs/history-closed-records-tracker.md` for the workflow rules, all four standing requirements, and overall status across all 7 modules.

**Goal:** once an agent's lead converts into a real CSA application, it's indistinguishable from an open lead in the agent's own pipeline view — no way to look back at "which leads did I convert, and when." This adds a read-only **Closed Leads** history page at `/agent/history`, plus a redesign of the existing `/agent` active-pipeline page.

## Phase 0 — Audit findings (evidence, verified 2026-08-12)

**No migration needed — `leads.updated_at` is a reliable proxy for "converted at."** `leads` (DDL `supabase/migrations/20260706120000_p2_borrower_agent_documents.sql:58-68`) has no `converted_at`/`closed_at` column, only `created_at`/`updated_at`, with a generic auto-touch trigger (`leads_updated_at`, same migration file line 127, `EXECUTE FUNCTION public.set_updated_at()`). Traced **every** write path to the table (`grep` for `.from("leads")` + `.update(` across the full codebase, 7 files reference the table, only 2 ever call `.update()`):
- `src/app/api/agent/leads/route.ts:122-125` — only fires during lead **creation** (POST), immediately after insert, while `status` is still `"open"`. Not relevant to converted rows.
- `src/app/api/csa/leads/[id]/convert/route.ts:42-53` — the **only** place `status` ever becomes `"converted"`, a single atomic update (with an optimistic-concurrency guard, `.is("application_id", null).eq("status", "open")`) setting `borrower_id`, `application_id`, `status: "converted"` together.
- **No other route ever calls `.update()` on `leads`** — the documents route (`src/app/api/agent/leads/[id]/documents/route.ts:26-34`) only `.select()`s a lead for permission/linkage checks, never writes to it.

So for any row where `status = 'converted'`, `updated_at` was stamped exactly once, at conversion time, and nothing has touched it since — safe to use directly as `convertedAt`, no trigger/migration needed (same lucky situation as LRA, unlike AR).

**`"converted"` is the only real terminal status — `"dropped"`/`"lost"`/`"closed"` are confirmed dead.** `leads.status` has **no CHECK constraint** at all (unconstrained free text, `DEFAULT 'open'`) — full-codebase grep for any write of a status besides `"open"`/`"converted"` found nothing. `leadStatusVariant()` (`src/lib/agent/pipeline.ts:63-71`) has dead defensive branches for `"won"`/`"closed"`/`"lost"` (styling only, never written by any code path) — **the earlier design draft's "Dropped" status chip was speculative, same mistake already caught and corrected once for CSA's History (draft had a fabricated "Withdrawn" status there too).** Build only one real KPI/filter group: converted. No status-group dimension needed at all — same shape as AR's Closed Accounts tab and LRA's History (one KPI card, no filter chips besides date range).

**Search needs no join at all — simplest of every module so far.** `borrower_name`/`business_name` are denormalized directly on `leads` (DDL lines 61-62), so search is a single same-table `.or()`, no multi-step borrower/application lookup like every other module needed. Sorting by borrower is also a plain column order — **no client-current-page-only caveat needed for borrower here**, unlike CSA/Committee/AR/LRA where borrower name lived on a joined table.

**A "Contact"/phone column speculated in the earlier design draft is confirmed NOT on this table.** `leads`' full column list is exactly `id, agent_user_id, borrower_name, business_name, borrower_id, application_id, status, created_at, updated_at` — no phone/email field. Don't add a Contact column; if one's wanted later, it'd require joining `borrowers` (only meaningful for leads with `borrower_id` populated) — that's a separate, explicit ask, not something to guess at now.

**Linked application is worth showing as a light join, not a full lookup.** Converting a lead sets `leads.application_id` (confirmed, `convert/route.ts:46`) — join `loan_applications(application_no)` via that FK for display ("became APP-XXXXX"). This is a single scalar FK, same simplicity as LRA's `computation_id` pin — no "latest version" logic needed.

**View target: the agent's own lead workspace, not the CSA application.** `/agent/leads/[id]/page.tsx` has no status guard (confirmed — the backing route `src/app/api/agent/leads/[id]/route.ts` only checks `agent_user_id === user.id`, no status check) and stays fully functional post-conversion, rendering the lead status badge, pipeline banner, and document checklist as normal. **Every other module's History page links to a detail page within its own module** (CSA → `/csa/applications`, not `/cig/...`; Committee → `/committee/applications`, not `/ar/...`) — same principle here: link to `/agent/leads/{id}`, not to the CSA application the lead became. Staying within the Agent portal is the consistent choice, not a hard technical requirement (the application page RLS is also open to `leads:view`, confirmed below, so linking there would work as a fallback if the user prefers it — flag as a decision if this default is unwanted).

**RLS needs no changes.** `leads_select` (`supabase/migrations/20260706120001_p2_rls_storage.sql:86-92`) grants unconditional SELECT to `leads:view` regardless of status — no predicate on `status`. `loan_applications` SELECT is also open to `leads:view` (`supabase/migrations/20260710030000_fix_applications_select_staff_portals.sql:15`), confirming the application-number join is safe without any new grant.

**Sidebar** is currently flat, no `children` (`Sidebar.tsx:222-227`) — needs the same treatment as every other module.

**The active `/agent` queue page is fully client-side-bulk-fetch** (`src/app/agent/page.tsx:152-165`, no query params sent at all — same pre-redesign shape CSA's queue had before its own retrofit), filtered/sorted/paginated entirely in `useMemo`. Its filter dimension is a **derived pipeline stage** (`awaiting_link`/`gathering_docs`/`docs_ready`, computed from `applicationId` + checklist completion, not the raw `status` column) — `leadPipelineStage()`, referenced but not fully read in this audit; **read it in full before Phase 5**, since the server-side port needs to replicate it exactly, not guess at its branches. Today the queue shows **both open and converted leads with no distinction** (a converted lead just lands in `gathering_docs`/`docs_ready` like any other in-progress lead) — **preserve this behavior by default** (same "don't silently change existing scope" rule AR/LRA followed), but add a `status` filter chip (All/Open/Converted) as an available option, not a default exclusion.

## Explicitly out of scope for this plan

- `src/app/api/csa/leads/[id]/convert/route.ts`, `createCsaApplication` — read from, not modified.
- `src/app/agent/leads/new/page.tsx`, `src/app/agent/leads/[id]/page.tsx`, its API route — untouched.
- Any change to what counts as "converted" — purely additive read-only history.

---

## Phase 1 — Backend: `lib/agent/history.ts` + `GET /api/agent/history`

### Files to change

1. **`src/lib/agent/format.ts`** (new file) — `formatDate`, same shape as every other module's (no `formatMoney` needed — leads carry no amount field).
2. **`src/lib/agent/history.ts`** (new file)
   - `export type ClosedLeadRow = { id, borrowerName, businessName: string|null, applicationId: string|null, applicationNo: string|null, convertedAt: string }`.
   - `export type ClosedLeadsQueryParams = { search?, from?, to?, sortKey?: "borrower"|"business"|"convertedAt", sortDir?, page, pageSize }`.
   - `export async function getClosedLeadsHistory(supabase, userId, params): Promise<{ rows: ClosedLeadRow[]; totalCount: number }>` — `.from("leads").select("id, borrower_name, business_name, application_id, updated_at, loan_applications(application_no)", {count:"exact"}).eq("agent_user_id", userId).eq("status", "converted")`, plain same-table `.or()` search on `borrower_name`/`business_name` (no join needed, per Phase 0), `.gte`/`.lte` on `updated_at`, `.order()` + `.order("id",{ascending:true})` tiebreaker (established precedent, don't skip it) + `.range()`. **Scope to the requesting agent's own leads** (`agent_user_id = userId`) — confirm this matches the existing `/api/agent/leads` GET's own scoping (`route.ts:52`, `.eq("agent_user_id", user.id)`) rather than showing every agent's converted leads; a `leads:view`-holding admin/manager role seeing all agents' history is a different, broader feature not asked for here — flag as a question if that's actually wanted.
   - `export async function getClosedLeadsKpiCounts(supabase, userId, {from,to}): Promise<{ total: number }>` — one count, scoped the same way, date-scoped only.
3. **`src/app/api/agent/history/route.ts`** (new file) — `requireModulePermission("leads","view")`, parse/allowlist params (`search`, `range`/`from`/`to` default `30d`, `sortKey`, `sortDir`, `page`, `pageSize`), `Promise.all`, return `{ rows, totalCount, kpi }`.

### Status: Done (2026-08-12)

---

## Phase 2 — Frontend: `/agent/history` page

### Files to change

1. **`src/app/agent/history/page.tsx`** (new file, `"use client"`) — follow `src/app/csa/history/page.tsx` as template. 1 plain `.card.stat` KPI ("Total converted," no click-to-filter grid — nothing to filter to besides the single group). Toolbar: search, `.active-pill-row`, `ViewModeToggle`, Filters button → collapsible panel with just "Converted date" (`DateRangeFilter` — no second filter group, there's no status-group dimension here). Table columns: Borrower (sortable), Business (not sortable — secondary field, same treatment as CSA's "Loan Type"), Linked Application (application_no or "—", not sortable), Converted On (sortable, default desc). Trailing View action → `/agent/leads/${row.id}`. Grid view: standard `.gcard`. `loading`-gated skeleton on every load, `Pagination`/page-size `Select` always mounted, single-tier empty state. `PageHeader` title "Closed Leads", description "Leads that converted into applications."

### Status: Done (2026-08-12)

---

## Phase 3 — Sidebar wiring

### Files to change

1. **`src/components/admin/Sidebar.tsx`** — change the flat `/agent` entry (`Sidebar.tsx:222-227`) to:
   ```ts
   {
     href: "/agent",
     label: "Leads",
     icon: "leads",
     modules: ["leads"],
     children: [
       { href: "/agent", label: "Leads pipeline", exact: true, matchPrefixes: ["/agent/leads"] },
       { href: "/agent/history", label: "Closed leads" },
     ],
   },
   ```

### Status: Done (2026-08-12)

---

## Phase 4 — Tests

### Files to change

1. **`src/lib/agent/__tests__/history.test.mts`** (new file) — unit tests for the page-size clamp helper and any pure spec function Phase 1 extracts, following the established pattern.

### Status: Done (2026-08-12)

---

## Phase 5 — Backend: `/api/agent/leads` becomes query-param-driven

### Files to change

1. **`src/lib/agent/queue.ts`** (new file) — **read `src/lib/agent/pipeline.ts`'s `leadPipelineStage()` in full first** (Phase 0 flagged this as unread) and port it faithfully, same "must not reimplement, must replicate exactly" rule as every prior queue redesign. `getAgentLeadsQueue(supabase, userId, params: { search?, stageFilter?, statusFilter?: "all"|"open"|"converted", from?, to?, sortKey?, sortDir?, page, pageSize })` — scoped to `agent_user_id = userId` (matches existing route), date range on `created_at` (the lead's own creation date — there's no separate "arrival" event the way other modules had), default preset `"all"`. If `leadPipelineStage()`'s classification can't be expressed as a reliable SQL filter (it depends on the same `get_checklist_flags` RPC the current GET already calls per-row, `route.ts:26-39,59-61`), use the same honest fetch-then-classify-in-JS fallback LRA's Phase 5 used — don't force it into fragile SQL, and say clearly in the phase report which approach was taken.
   - `getAgentLeadsQueueKpiCounts(supabase, userId)` — mirror the existing 3 KPI buckets (awaitingLink/gathering/ready), not date-scoped (preserve current behavior).
2. **`src/app/api/agent/leads/route.ts`** — rewrite `GET` to the standard param-driven shape; leave `POST` (lead creation) completely untouched.

### Status: Done (2026-08-12) — GET is param-driven `{ rows, totalCount, kpi }`; POST untouched. Stage filter is JS after checklist RPC (documented in `queue.ts`). Phase 6 wired `/agent` to query params.

---

## Phase 6 — Frontend: `/agent` (pipeline) calls the backend, gets the full toolbar

### Files to change

1. **`src/app/agent/page.tsx`** — same restructuring pattern as every other queue redesign: query-string `load()`, debounced search, `loading`-gated skeleton on every load, `Pagination`/page-size `Select` always mounted, existing pipeline-stage KPIs/filters preserved (moved into the standard collapsible Filters panel), plus a new Status chip group (All/Open/Converted, default All — preserving today's "shows everything" behavior), "Created date" `DateRangeFilter` (default `"all"`), `ViewModeToggle` + grid `.gcard`, existing priority/sort logic kept client-current-page-only where it already was.

### Status: Done (2026-08-12) — implemented, awaiting validation

---

## Phase 7 — Tests (queue backend)

### Files to change

1. **`src/lib/agent/__tests__/queue.test.mts`** (new file) — mirror the established pattern; cross-check whatever pipeline-stage-classification helper Phase 5 extracts against `leadPipelineStage()`'s existing behavior, same "agreement test" shape as LRA's `passesScope ↔ isCompletedLraQueueItem` test.

### Status: Done (2026-08-12) — implemented, awaiting validation

---

## Overall item status: IMPLEMENTED — awaiting validation (Phases 1–7)
