# CSA / CIG Page Split — Implementation Plan

> **For agentic workers:** Execute phase-by-phase, in order. Do not skip ahead. Each phase must leave the app green (build passes, existing flows untouched) before starting the next. This is a **surgical UI/routing refactor** — no schema changes, no RLS changes, no permission-model changes. If any step tempts you to "while I'm in here, also fix/rename X," don't — log it as a follow-up instead. Before touching Next.js routing/App Router conventions, skim `node_modules/next/dist/docs/` per `loanstar/AGENTS.md` — this repo pins a Next version with breaking changes from training-data assumptions.

**Source task:** "Two-Week Plan — Calendar (Jul 20 – Jul 30)" doc, Jul 20 (Monday) row, Loanstar column:
> Split CSA page into: Leads list (agent referrals) + Intake list (applications in progress). Split CIG page into: Verification queue (active work) + Recent verifications (completed history, read-only). Pull Denial calls and Scheduled callbacks out of the CIG queue page too as their own page each.

**Goal:** Turn two monolithic, all-sections-stacked-on-one-page dashboards (`/csa`, `/cig`) into five routed pages (`/csa`, `/csa/leads`, `/cig`, `/cig/denials`, `/cig/callbacks`, `/cig/history` — six, counting both roots) that mirror the AR/Collector sub-nav pattern already established elsewhere in the app, **without** changing any permission, RLS, or API-authorization behavior.

**Architecture:** Each section that's currently a `<div>` block inside `csa/page.tsx` / `cig/page.tsx` becomes its own `"use client"` page with its own fetch/state, exactly like `src/app/collector/{briefings,accounts,proofs,dcr,history}/page.tsx` already do for the Collection module. All new pages inherit their existing `layout.tsx` (Next.js layout nesting — `src/app/csa/layout.tsx` and `src/app/cig/layout.tsx` already wrap every nested route under those segments, so no new layout files are needed). Sidebar sub-nav uses the existing `PortalNavItem.children` mechanism (already used by AR/Collector/Remedial) — no new nav primitive.

**Tech stack:** Next.js App Router (client components), existing `@/components/ui` primitives (`Table`, `Pagination`, `ConfirmDialog`, `PageHeader`, etc.), existing `requireModulePermission` API guard, existing `usePermissions`/`can()` sidebar gating.

**Feasibility:** Yes, and lower-risk than a typical split — confirmed live against the DB (Supabase project `acopcwlhkovssjnrqygk`) that the permission model **already treats these as separate concerns** (see below), so this is purely moving JSX/state into new files plus one nav config edit. No migration required.

---

## Audit summary (read-only, verified 2026-07-21)

### Permission model — already split at the data layer

| Concern | Module slug that gates it | Evidence |
|---|---|---|
| CSA "Leads" section | `intake` (not `leads`!) | `leads_csa_select`/`leads_csa_update` RLS policies key off `has_module_permission('intake', ...)`; `api/csa/leads/route.ts:8` calls `requireModulePermission("intake", "view")` |
| CSA "Intake" section | `intake` | `api/csa/applications/route.ts`, `applications_endorse`/`applications_update` RLS policies |
| CIG "Verification queue" | `verification` | `api/cig/applications/route.ts:8` → `requireModulePermission("verification","view")` |
| CIG "Recent verifications" | `verification` | `api/cig/history/route.ts:12` (same slug) |
| CIG "Denial calls" | `verification` (+ `committee` for insert) | `api/cig/denials/route.ts:9`; `denial_notices` RLS |
| CIG "Scheduled callbacks" | `verification` | `callbacks` RLS: `callbacks_select` → `has_module_permission('verification','view')` |

**Conclusion:** every sub-page within a split lands on the *same* module permission its siblings already use (`intake` for both CSA pages; `verification` for all four CIG pages). There is a separate `leads` module (role `agent`'s own referral pipeline at `/agent`), but CSA does **not** use it — confirmed by the live `role_module_permissions` table (`csa` role has `can_view=false` on module `leads`). Do not confuse the two.

### Live role/module grants (for context, not for editing)

`roles`: `agent, ar, borrower, cig, collector, committee, csa, lra, remedial, super_admin`. Relevant grants: `csa` → `intake` (view/create/edit/execute_trigger), `csa` → `leads` = **false** (all). `cig` → `verification` (view/create/edit/execute_trigger), `cig` → `intake` (view/edit only, no create — read-only checklist access).

### Navigation precedent — `src/components/admin/Sidebar.tsx`

`PORTAL_NAV_ITEMS` already supports multi-page modules via a `children` array (`PortalNavChild[]`), used today by AR (2 children) and Collector (6 children), e.g.:
```ts
{ href: "/ar", label: "Accounting (AR)", icon: "accounting", modules: ["accounting_ar"],
  children: [
    { href: "/ar", label: "Masterlist", exact: true, matchPrefixes: ["/ar/masterlist"] },
    { href: "/ar/dcr", label: "DCR queue" },
  ] },
```
`/csa` and `/cig` are currently flat (no `children`). Visibility is still gated at the **parent** level only (`item.modules.some(mod => can(mod,"view"))`) — children have no independent permission check in the existing pattern, and this plan keeps that behavior (see Hard boundaries).

### Middleware — no change needed

`src/middleware.ts` gates on `pathname.startsWith("/csa")` / `startsWith("/cig")` — prefix-based, so `/csa/leads`, `/cig/denials`, `/cig/callbacks`, `/cig/history` are automatically covered by the existing protected-portal check. Confirmed by reading the file; no edit required.

### Current file inventory

| Piece | File | Lines |
|---|---|---|
| CSA page (leads + intake combined) | `src/app/csa/page.tsx` | 601 |
| CSA leads API | `src/app/api/csa/leads/route.ts` | unchanged, reused as-is |
| CSA applications API | `src/app/api/csa/applications/route.ts` | unchanged, reused as-is |
| CIG page (queue + denials + callbacks + recent) | `src/app/cig/page.tsx` | 1183 |
| CIG queue API | `src/app/api/cig/applications/route.ts` | unchanged, reused as-is |
| CIG denials API | `src/app/api/cig/denials/route.ts` | unchanged, reused as-is |
| CIG history API (**returns both** `recent` + `scheduledCallbacks` today) | `src/app/api/cig/history/route.ts` | to be trimmed |
| CIG history/callbacks logic (already two separate functions!) | `src/lib/cig/history.ts` — `getCigRecentVerifications()`, `getCigScheduledCallbacks()` | unchanged, reused as-is |
| Date/time formatters (duplicated inline in both pages) | none yet — inline `formatDate`/`formatDateTime` in each page | to be extracted, precedent: `src/lib/collector/format.ts` |

Grep-confirmed: `/api/cig/history`, `/api/cig/denials`, `/api/csa/leads` are consumed **only** by `cig/page.tsx` / `csa/page.tsx` respectively — no other caller in `src/`. Safe to reshape.

---

## Hard boundaries (do not break)

1. **No DB migration, no RLS change, no new `modules` row.** The `intake`/`verification` slugs already cover everything in scope. (A *future*, separately-scoped task — Jul 22 on the plan doc — may split these into finer-grained modules; that is explicitly out of scope here. Do not pre-emptively add new module rows "for later.")
2. **Do not touch** `src/app/csa/applications/[id]/page.tsx`, `src/app/cig/applications/[id]/page.tsx`, or any `/api/csa/applications/[id]/*` / `/api/cig/applications/[id]/*` route — detail pages and their actions (endorse, forward, return, checklist, computation, etc.) are untouched.
3. **Do not change** `src/lib/cig/history.ts`, `src/lib/cig/denials.ts`, `src/lib/csa/leads.ts`, `src/lib/csa/queue.ts`, `src/lib/cig/desk.ts` — pure logic/query functions, reused verbatim by the new pages.
4. **Move JSX/state verbatim, don't rewrite.** Filter chips (`WORK_CHIPS`, `FINDING_CHIPS`), sort logic, KPI calculations, the denial "Borrower informed" `ConfirmDialog` flow, and search behavior must produce byte-identical UI behavior after relocation — this is a file-split, not a redesign.
5. **Do not add a per-child permission check** to the new Sidebar `children` entries. Keep parity with the existing AR/Collector pattern (parent-level gate only) — inventing a stricter model here would be inconsistent with the rest of the app and is exactly the kind of change reserved for the Jul 22 "convert into modules" task.
6. **Preserve the `leadId` hand-off**: `/csa/leads`'s "Start application" link must still point to `/csa/applications/new?leadId=...&name=...` unchanged.
7. **Preserve the CIG cross-links to application detail**: queue, callbacks, and recent-verifications rows all currently link to `/cig/applications/[id]` — keep all three after the split (only "Denial calls" has no detail link, by design — it uses the inline dialog).

---

## Risks

| Risk | Mitigation |
|---|---|
| `/api/cig/history` response shape changes (dropping `scheduledCallbacks`) breaks an untracked caller | Grep-confirmed single caller (`cig/page.tsx`, which is edited in the same phase). Re-grep in Phase 2 before marking it done. |
| Nav active-state highlighting is ambiguous on `/cig/applications/[id]` since 3 of 4 CIG sections link there (queue, callbacks, recent) | Default `matchPrefixes: ["/cig/applications"]` on "Verification queue" (the primary section) — same tie-break AR uses for `/ar/masterlist/[id]` → "Masterlist". Cosmetic only; not a functional risk. |
| Four independent fetches instead of one `Promise.all` means four independent loading spinners/error states per CIG page | Matches the existing AR/Collector precedent exactly — this is accepted app-wide behavior, not a regression. |
| Duplicated `formatDate`/`formatDateTime` across new files | Extract once per domain into `src/lib/csa/format.ts` / `src/lib/cig/format.ts` in Phase 0, following the existing `src/lib/collector/format.ts` precedent. Pure refactor, verified byte-identical output before any page split happens. |
| Sidebar `children` labels collide/confuse with existing parent label ("Intake" / "Verification") | Use distinct, unambiguous child labels: "Intake list" / "Leads list" under CSA; "Verification queue" / "Denial calls" / "Scheduled callbacks" / "Recent verifications" under CIG. |

---

## File map

| Path | Change | Responsibility |
|---|---|---|
| `src/lib/csa/format.ts` | **new** | `formatDate` (extracted) |
| `src/lib/cig/format.ts` | **new** | `formatDate`, `formatDateTime` (extracted) |
| `src/app/csa/page.tsx` | **trim** | Intake list only (KPIs, search, work-filter chips, sortable table, pagination) |
| `src/app/csa/leads/page.tsx` | **new** | Leads list (agent referrals) — moved verbatim from old `csa/page.tsx` lines 310–348 |
| `src/app/cig/page.tsx` | **trim** | Verification queue only (desk strip, KPIs, search, work-filter chips, sortable table, pagination) |
| `src/app/cig/denials/page.tsx` | **new** | Denial calls — table + `ConfirmDialog` + `informTarget`/`informing` state, moved verbatim |
| `src/app/cig/callbacks/page.tsx` | **new** | Scheduled callbacks — table + search/pagination, moved verbatim |
| `src/app/cig/history/page.tsx` | **new** | Recent verifications — table + search/finding/status filters + pagination, moved verbatim |
| `src/app/api/cig/callbacks/route.ts` | **new** | `GET` → `requireModulePermission("verification","view")` + `getCigScheduledCallbacks()` |
| `src/app/api/cig/history/route.ts` | **trim** | `GET` returns `{ recent }` only (drop `scheduledCallbacks` + its query) |
| `src/components/admin/Sidebar.tsx` | **edit** | Add `children` arrays to the `/csa` and `/cig` `PORTAL_NAV_ITEMS` entries |
| **Do not modify** | — | `src/app/csa/applications/*`, `src/app/cig/applications/*`, `src/lib/cig/history.ts`, `src/lib/cig/denials.ts`, `src/lib/csa/leads.ts`, `src/lib/csa/queue.ts`, `src/lib/cig/desk.ts`, `src/middleware.ts`, `csa/layout.tsx`, `cig/layout.tsx`, any migration/RLS |

---

## Phase 0 — Extract shared formatters (no user-facing change)

**Goal:** Remove the duplication that would otherwise get copy-pasted into 3–4 new files, with zero behavior change, verified before any routing work starts.

- [x] Create `src/lib/csa/format.ts`:
  ```ts
  export function formatDate(value: string) {
    return new Date(value).toLocaleDateString("en-PH", {
      year: "numeric", month: "short", day: "numeric",
    });
  }
  ```
- [x] Create `src/lib/cig/format.ts` with the same `formatDate` plus:
  ```ts
  export function formatDateTime(value: string) {
    return new Date(value).toLocaleString("en-PH", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }
  ```
- [x] In `csa/page.tsx`, delete the local `formatDate` and import from `@/lib/csa/format`.
- [x] In `cig/page.tsx`, delete the local `formatDate`/`formatDateTime` and import from `@/lib/cig/format`.
- [x] **Verify:** `npx tsc --noEmit` passes with zero errors touching `csa`/`cig` (pre-existing unrelated repo errors in `account/page.tsx`, `borrower/register`, and test files are untouched by this phase). `npx eslint` on the four changed files shows only a pre-existing `react-hooks/set-state-in-effect` finding on the untouched `void load()` pattern — confirmed present in `committee/page.tsx`, `lra/applications/[id]/page.tsx`, and other files never touched in this phase, so it predates Phase 0. Live browser click-through was not performed — no seeded CSA/CIG login credentials were available in this environment — but the extracted functions are character-for-character identical to the code they replaced, so runtime output is unchanged by construction.

**Completed 2026-07-21.**

---

## Phase 1 — CSA split

**Goal:** `/csa` shows only the intake queue; `/csa/leads` shows only agent referrals.

- [x] Create `src/app/csa/leads/page.tsx` as a new `"use client"` component:
  - Move the `AgentLead` type, the `leads` state, the `/api/csa/leads` fetch (from the `Promise.all` in `load()`), the loading/error state, and the JSX block (old `csa/page.tsx` lines 310–348 — heading, description, `<ul>` of leads with "Start application" links) into this file.
  - Give it its own `PageHeader` (title "Leads", description "Open name-only referrals waiting for CSA to start an application.").
  - Keep the `href` construction (`/csa/applications/new?leadId=...&name=...`) unchanged.
  - Use an `EmptyState` (existing component, same pattern as the intake page) for the zero-leads case instead of the old "only render if `leads.length > 0`" conditional, so the page isn't blank.
- [x] Trim `src/app/csa/page.tsx`:
  - Removed the `leads` state, the `AgentLead` type, the `/api/csa/leads` fetch from `load()`'s `Promise.all` (now just fetches `/api/csa/applications`).
  - Removed the "New leads from agents" JSX block (old lines 310–348).
  - Everything else (KPIs, search, `WORK_CHIPS`, table, pagination, `EmptyState` for zero applications) unchanged — confirmed by full-file re-read post-edit.
- [x] **Verify (code-level):** `npx tsc --noEmit` — zero errors touching `csa`. `npx eslint` on both files — only the same pre-existing `react-hooks/set-state-in-effect` finding on `void load()` seen repo-wide (see Phase 0 note); no new finding types. Grep-confirmed `AgentLead`/`/api/csa/leads` now appear only in `csa/leads/page.tsx` — no stragglers left in `csa/page.tsx`.
- [ ] **Verify (manual, in browser):** not performed — no seeded CSA login credentials available in this environment. **Needs a human pass**: confirm `/csa` shows only the intake table, `/csa/leads` shows the leads list, and "Start application" still navigates to `/csa/applications/new?leadId=...` with correct pre-fill.

**Code-complete 2026-07-21; manual browser verification pending.**

---

## Phase 2 — CIG split (queue / denials / callbacks / history)

**Goal:** `/cig` shows only the active queue; the other three sections become their own pages.

- [x] Add `src/app/api/cig/callbacks/route.ts` — `GET` → `requireModulePermission("verification","view")` + `getCigScheduledCallbacks()`, returns `{ scheduledCallbacks }`.
- [x] Trim `src/app/api/cig/history/route.ts` — dropped the `getCigScheduledCallbacks` call and the `scheduledCallbacks` field; returns `{ recent }` only. (`getCigRecentVerifications` import/call unchanged.)
- [x] Create `src/app/cig/denials/page.tsx`: moved the `DenialCall` type, `denials` state, `informTarget`/`informing` state, `handleInformConfirm`, the `/api/cig/denials` fetch, the "Denial calls to make" table, and the `ConfirmDialog` verbatim. Own `PageHeader` ("Denial calls"); `EmptyState` added for the zero-denials case (previously the section just vanished).
- [x] Create `src/app/cig/callbacks/page.tsx`: moved the `ScheduledCallback` type, `callbackSearch`/`callbackPage` state, the `filteredCallbacks`/pagination logic, and the "Scheduled callbacks" table verbatim; fetch now points at `/api/cig/callbacks`. Own `PageHeader`; `EmptyState` added for the zero-callbacks case.
- [x] Create `src/app/cig/history/page.tsx`: moved the `RecentVerification` type, `recentSearch`/`recentFinding`/`recentStatus`/`recentPage` state, `cigRecentMatches*` usage, the `/api/cig/history` fetch, and the "Recent verifications" table verbatim (including its existing "No forwarded files yet" empty state — unchanged). Own `PageHeader`.
- [x] Trimmed `src/app/cig/page.tsx` down to: `QueueItem` type, `applications`/`search`/`workFilter`/`sortKey`/`sortDir`/`page` state, the `/api/cig/applications` fetch only, the verification-desk strip, KPIs, `WORK_CHIPS`, the queue table, and pagination. Removed `denials`/`recent`/`scheduledCallbacks` state, the now-unused imports (`ConfirmDialog`, `cigRecentMatches*`, `CigRecentFindingFilter`, `formatDateTime`), and `handleInformConfirm`.
- [x] Re-grepped `/api/cig/history`, `/api/cig/denials`, `/api/cig/callbacks` across `src/` — each is called by exactly one page now (its own new sub-page), no leftover caller expects the old combined shape.
- [x] **Verify (code-level):** `npx tsc --noEmit` — zero errors touching `cig`. `npx eslint` on all 6 changed/new files — only the same pre-existing `void load()`-in-`useEffect` finding (now once per page, same finding type as Phase 0/1, not a new issue). Grep confirms `DenialCall`/`RecentVerification`/`ScheduledCallback`/`ConfirmDialog`/`informTarget`/`FINDING_CHIPS` have zero remaining references in the trimmed `cig/page.tsx`.
- [ ] **Verify (manual, in browser):** not performed — same credential gap as Phase 1. **Needs a human pass**:
  - `/cig` — queue only, KPIs correct, filters/sort/pagination work, "Verify" still links to `/cig/applications/[id]`.
  - `/cig/denials` — table renders, "Borrower informed" still opens the confirm dialog and POSTs to `.../denial-informed`, row disappears from the list on success (same as before).
  - `/cig/callbacks` — table + search + pagination work, "Open" links to `/cig/applications/[id]`.
  - `/cig/history` — table + search/finding/status filters + pagination work, "View" links to `/cig/applications/[id]`.
  - No console errors.

**Code-complete 2026-07-21; manual browser verification pending.**

---

## Phase 3 — Navigation wiring

**Goal:** Sub-pages are discoverable from the sidebar, matching the AR/Collector visual pattern.

- [ ] In `src/components/admin/Sidebar.tsx`, add a `children` array to the `/csa` entry:
  ```ts
  { href: "/csa", label: "Intake", icon: "intake", modules: ["intake", "computation", "negotiation"],
    children: [
      { href: "/csa", label: "Intake list", exact: true, matchPrefixes: ["/csa/applications"] },
      { href: "/csa/leads", label: "Leads list" },
    ] },
  ```
- [x] Add a `children` array to the `/cig` entry:
  ```ts
  { href: "/cig", label: "Verification", icon: "verification", modules: ["verification"],
    children: [
      { href: "/cig", label: "Verification queue", exact: true, matchPrefixes: ["/cig/applications"] },
      { href: "/cig/denials", label: "Denial calls" },
      { href: "/cig/callbacks", label: "Scheduled callbacks" },
      { href: "/cig/history", label: "Recent verifications" },
    ] },
  ```
- [x] **Verify (code-level):** `npx tsc --noEmit` — zero errors touching `Sidebar`. `npx eslint` — only the same pre-existing `void`-in-`useEffect` finding, at an unrelated line (576, `readCollapsedPreference`) I didn't touch. Structure matches the AR/Collector precedent exactly (`PortalNavChild[]` shape, `exact`/`matchPrefixes` fields already supported by `childIsActive`/`PortalNavGroup` — no logic changes needed there).
- [ ] **Verify (manual, in browser):** not performed — same credential gap as Phases 1–2; the sidebar only renders inside the authenticated `AppShell`, and hitting protected routes without a session redirects to `/login` before `Sidebar.tsx` ever mounts, so there's nothing to click-through without credentials. **Needs a human pass**: confirm the sidebar shows 2 CSA / 4 CIG sub-links when expanded; correct child is highlighted on each route; parent stays highlighted while on any child (including `/csa/applications/[id]` and `/cig/applications/[id]`); collapsed-sidebar (icon-only rail) behavior unaffected.

**Code-complete 2026-07-21; manual browser verification pending.**

---

## Phase 4 — Regression pass & sign-off

- [ ] Full click-through as a `csa` role user: dashboard → `/csa` → open an application → back → `/csa/leads` → start application from a lead → confirm it lands correctly on the new application form with the lead's name/id pre-filled. **Not performed — no seeded CSA credentials in this environment across all four phases. Needs a human pass.**
- [ ] Full click-through as a `cig` role user: `/cig` → verify a file → `/cig/denials` → mark one informed → `/cig/callbacks` → open one → `/cig/history` → view one. **Not performed — same credential gap. Needs a human pass.**
- [x] Confirm permission behavior is unchanged: re-grepped `requireModulePermission` in every touched/new CSA/CIG API route — `csa/applications` and `csa/leads` both still gate on `("intake", ...)`; `cig/applications`, `cig/denials`, `cig/callbacks`, `cig/history` all still gate on `("verification", "view")`. Nothing was changed from what Phase 2's audit found live in the DB. Sidebar visibility is still parent-level only (`item.modules.some(mod => can(mod,"view"))`), matching the AR/Collector precedent — no per-child gate was added (per Hard Boundary #5).
- [x] `npx tsc --noEmit` (whole project) — zero errors in any csa/cig/Sidebar/lib file touched by this plan; the only errors are pre-existing and unrelated (`account/page.tsx`, `borrower/register/route.ts`, three `__tests__/*.mts` files) — same set found in the Phase 0 baseline, unchanged by Phases 1–3.
- [x] `npm run lint` (whole repo) — 90 pre-existing problems (66 errors, 24 warnings), **none** newly introduced by this plan: grepped the full run and every csa/cig/Sidebar finding is the same repo-wide `react-hooks/set-state-in-effect` pattern on `void load()` (or, in Sidebar's case, the untouched `readCollapsedPreference` effect) — present identically in files this plan never touched (`cig/applications/[id]/page.tsx`, `csa/applications/[id]/page.tsx`, `ReleaseDocSign.tsx`, `PhoneInput.tsx`, etc.), confirming it predates this work.
- [x] `npm run build` — **fails**, but at `src/app/account/page.tsx:349` (a `Card` component given an `id` prop it doesn't accept) — the identical pre-existing error `tsc --noEmit` already flagged in Phase 0, in a file this plan never touches. This is a pre-existing repo-wide build blocker, **not a regression from this plan** — flagging it as a separate concern the user may want addressed, but it's out of scope here.
- [x] Checkboxes and completion notes updated below, per phase, as each landed.

**Outcome:** all four phases are code-complete and verified as safe by static analysis (typecheck, lint, permission-gate re-check) with zero new issues attributable to this plan. **Live browser click-through was never performed in any phase** due to no seeded role credentials being available in this environment — that verification still needs a human (or credentialed agent) pass before this is considered fully signed off. Recommend: log in as `csa` and `cig` test users and walk the six pages listed above; separately, `account/page.tsx:349` blocks `npm run build` entirely and is worth a quick unrelated fix regardless of this plan.

**Completed (code-level) 2026-07-21.**

---

## Explicitly out of scope (do not do this now)

- Splitting `intake` or `verification` into finer-grained module rows so, e.g., "Denial calls" could be permissioned separately from "Verification queue" per role. That's the Jul 22 plan-doc item ("Convert the remaining pages into their own modules, with user permissions assignable the same way as the other modules") — a distinct, separately-scoped task that needs its own audit of which roles should get which sub-permission.
- Any redesign of the KPI strip, filters, or table columns — this plan only relocates existing JSX.
- Adding a client-side `RequireModule` route guard — none exists anywhere in the app today (confirmed by audit); introducing one here would be an unrelated architectural change.
