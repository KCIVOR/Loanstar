# Collector — `/collector/dcr` (DCR builder + recent DCRs)

## Status

Phase 0 audit complete, 2026-08-12. Phase 1 frontend (Recent DCRs section) **Done** 2026-08-12. Phase 2 helper tests (`dcr-list.test.mts`) landed with Phase 1.

**Phase 0 gap (same category as `/cig/denials`/`/cig/callbacks`)**: the backend already fetched a collector's full DCR history (`GET /api/collector/dcr`, all statuses, `dcr_items` embedded) — but the frontend only ever used that response to locate the current draft (`dcrs.find(d => d.status === "draft")`); the rest of the list was fetched and silently discarded. Phase 1 renders that history in a read-only **Recent DCRs** section below the builder (`limit=100`, drafts excluded from KPIs/filters).

**This page is a hybrid, not a pure list** — unlike items 9–12, `/collector/dcr` is primarily an active *builder* workspace (start a draft, add confirmed payments, submit), not a browsable list. **Plan: keep the builder workflow untouched**, add a new **"Recent DCRs"** section below it, full pattern, using data the backend already provides.

**Confirmed not overlapping with AR's existing history** (item 3, already Done): AR's "Reconciled DCRs" tab (`getReconciledDcrHistory`, `src/lib/ar/history.ts:270+`) is `postings`-based (one row per account posted within a DCR), org-wide, **reconciled only** — a collector can't see their own `submitted`-but-not-yet-reconciled DCRs there, and (see below) rejected ones wouldn't show at all regardless. Different audience, different grain — additive, not duplicate, scope.

## Phase 0 audit findings

- **Page**: `src/app/collector/dcr/page.tsx` (419 lines). Two sections: "Draft line items" (the in-progress draft) and "Confirmed payments" (available to add) — a real builder tool, correctly working (create draft → add items → submit). `dcrs` state is populated from the API but **only consumed to find `status === "draft"`** (`page.tsx:84-92`) — every submitted/reconciled DCR in the response is fetched and thrown away.
- **Backend**: `GET /api/collector/dcr` (`src/app/api/collector/dcr/route.ts:27-51`) — `requireModulePermission("collection", "view")`, queries `dcr` (`*, dcr_items(*)`) `.eq("collector_user_id", user.id)`, ordered `created_at desc`, `limit` query param (default 50, capped 200). **Already exactly the right query for a "my DCRs" list** — no new endpoint needed, just render what's already being fetched.
- **`dcr.status` CHECK constraint**: `'draft' | 'submitted' | 'reconciled' | 'rejected'` (`supabase/migrations/20260707000000_p7_ar_collection.sql:115-116`). **`'rejected'` has zero write sites anywhere in the codebase** (grepped `src/lib/ar/posting.ts` and the full `src/lib/ar` tree) — dead/unused, same category as Remedial's `'default'` and Collector's `masterlist.account_status`. **Do not build a Rejected KPI/filter chip around it** — real statuses in practice are only `draft`/`submitted`/`reconciled`.
- **Write actions** (`route.ts:53-99`, `src/lib/ar/posting.ts`): `createDcrDraft`, `addPaymentToDcr`, `submitDcr` — all correctly implemented, already used by the builder section, refetch via `load({silent:true})` after each. **No changes needed to any of these.**
- **Reconciliation** (setting `status='reconciled'`, `reconciled_by`, `reconciled_at`) happens on the **AR side** (`reconcileAndPostDcr`, referenced in AR's own history work) — outside Collector's permission scope, correctly not actionable from this page. The new Recent-DCRs list is read-only, matching that boundary.
- **Detail/view target**: no per-DCR detail page exists anywhere (`/collector/dcr/[id]` — NOT FOUND) — same "no detail page" situation as Collector's Closed Accounts (item 7), where the View action was omitted by prior user decision. Follow the same precedent here: **no View action**, the Recent-DCRs row itself (status, item count, total, dates) is the whole picture; a rejected/reconciled DCR's items aren't independently actionable by the collector anyway.
- **Permission**: `requireModulePermission("collection", "view"/"edit")` — same slug as the rest of Collector, per-officer-scoped (`collector_user_id = user.id`), consistent with `/collector/accounts`.

## Phase 1 — Frontend: add the Recent DCRs section — **Done** (2026-08-12)

Add a new section to `src/app/collector/dcr/page.tsx`, below the existing "Confirmed payments" section, **full pattern**:
- **KPI cards**: "Submitted" (count, `status==='submitted'`) + "Reconciled" (count, `status==='reconciled'`) — two real statuses, not the dead `'rejected'` one. If a `'rejected'` row is ever actually observed in practice (shouldn't happen per the audit), still render it correctly in the list/badge — just don't build a KPI/filter chip that assumes it's a normal case.
- **Collapsible Filters panel**: Status chips (All / Submitted / Reconciled) in the panel, `.active-pill-row` for the active one — consistent with item 12's pattern.
- **`ViewModeToggle`** (list/grid/compact) — grid cards: DCR id (short), status badge, item count, total amount, created/submitted date.
- **Sort**: Created/Submitted date column (asc/desc).
- **Page-size pagination** — `Select` + `Pagination`, always mounted. The underlying fetch (`limit` query param on `GET /api/collector/dcr`) already supports a real limit — raise the default page's fetch to a sane bound (e.g. keep `limit=50` as already used, or make it match the largest page-size option) rather than inventing new pagination plumbing; client-side paginate over that fetched set, same judgment call as the rest of this batch (small-ish per-officer dataset).
- **Skeleton loading** for this new section specifically (the builder section above already has its own loading state via the shared `loading` flag — keep that, just make sure the new section's skeleton is consistent, not a second full-page spinner).
- **No search** (small per-officer dataset, no obviously useful free-text field beyond what status/sort already cover) and **no View action** (no detail page, per Phase 0) — both deliberate, not oversights.
- Reuse the existing `dcrItemTotal` helper (`src/lib/collector/desk.ts`, already imported) for each row's total — don't reimplement.

New pure helpers, e.g. `src/lib/collector/dcr-list.ts`: status-filter-spec/predicate, sort-by-date, KPI computation, page-size clamp — same shape as the rest of this batch.

## Phase 2 — Tests — **Done** (2026-08-12)

`src/lib/collector/__tests__/dcr-list.test.mts` — mirror `proofs.test.mts`'s structure.

## Phase 3 — Split Recent DCRs into its own page — **Done** (2026-08-12)

**Reopened 2026-08-12 — user decision after reviewing the shipped page**: `/collector/dcr` was left as a single page mixing an active builder workspace (Draft line items + Confirmed payments) with a full browsable list (KPI cards, Filters, `ViewModeToggle`, pagination) underneath it — the one page in this whole rollout where active-work and look-back were merged, unlike every other module (CSA, Committee, AR, LRA, Agent, CIG, and Collector's own `/collector/history`), which always keeps them as separate pages/routes. Correcting that inconsistency.

- **New route**: `src/app/collector/dcr/history/page.tsx` — move the entire Recent DCRs section (KPI cards, Filters panel, `ViewModeToggle`, sort, pagination, skeleton, empty states) from `src/app/collector/dcr/page.tsx` to this new page, unchanged in behavior. Reuses the exact same `GET /api/collector/dcr` fetch and the existing `src/lib/collector/dcr-list.ts` helpers — no backend change.
- **`src/app/collector/dcr/page.tsx`**: remove the Recent DCRs section entirely, back to just the two original builder sections (Draft line items + Confirmed payments). Add a link to the new history page in the `PageHeader`'s `actions` slot (same placement pattern already used by `/collector/proofs`' "Go to DCR" link) — e.g. "DCR history" linking to `/collector/dcr/history`.
- **Sidebar** (`src/components/admin/Sidebar.tsx:312-314`): add a new child after the existing `"DCR"` entry: `{ href: "/collector/dcr/history", label: "DCR history" }`, before `"History"` (which is the pre-existing DCR/Payments tab page, a different thing — don't confuse the two, keep both distinctly labeled).
- Tests (`dcr-list.test.mts`) need no changes — they test pure helpers, not page location.

## Explicitly out of scope

- Any change to the builder workflow (create/add/submit) — already correct, untouched.
- A `'rejected'`-status Reconciled/Rejected filter framing — dead status, don't build around it.
- A per-DCR detail page or View action — none exists, same precedent as Collector's Closed Accounts (item 7).
- Reconciliation itself — AR-side action, out of Collector's permission scope.
- Any change to the Recent DCRs section's own behavior in Phase 3 — this is a pure relocation, not a redesign.
