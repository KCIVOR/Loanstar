# AR (Accounting) — Posting History (step-by-step)

Part of the module history/closed-records rollout. See `loanstar/docs/history-closed-records-tracker.md` for the workflow rules, all four standing requirements, and overall status across all 7 modules.

**Goal:** two things, both genuinely missing today: (1) a chronological "accounts we've closed out" view — Masterlist already lets AR staff *see* paid-off accounts via its Status filter, but has no closure timestamp at all, so there's no way to answer "what closed this month" the way CSA answers "what did I endorse this month"; (2) a "reconciled DCRs" log — once a DCR is posted, it vanishes from the only DCR view (which filters to `submitted` only) with zero replacement anywhere. Both land on one page, `/ar/history`, as two tabs — following the existing tabbed-history precedent already in this codebase (`src/app/collector/history/page.tsx`, `HistoryTab = "dcrs" | "payments"`), since AR's two event types have genuinely different shapes and don't belong forced into one table. Plus the usual `/ar` (Masterlist) active-queue redesign.

**Scope decision, 2026-08-12 (user confirmed)**: build both the DCR history and a real closure-history view — not just point AR staff at Masterlist's existing Status filter.

## Phase 0 — Audit findings (evidence, verified 2026-08-12)

**Masterlist already shows closed accounts today — this is not the same starting condition as CSA/Committee.** `GET /api/ar/masterlist` (`src/app/api/ar/masterlist/route.ts:13-22`) has **zero status filtering** — every `account_status` comes back in one query, and RLS (`supabase/migrations/20260707000001_p7_rls.sql:37-57`, `20260710090000_fix_masterlist_collector_rls.sql:8-29`) grants `accounting_ar:view` unconditional SELECT regardless of status. The UI already has a Status filter dropdown (`src/app/ar/page.tsx:274-280`) that includes `paid`. **What's missing is chronology, not visibility** — no `closed_at`/`paid_off_at` column exists on `masterlist` (DDL confirmed, `supabase/migrations/20260707000000_p7_ar_collection.sql:15-52`, only `created_at`/`updated_at`), so "closed in the last 30 days" can't be answered today.

**`account_status` lifecycle** (CHECK constraint `'active','paid','default','remedial'`, `20260707000000_p7_ar_collection.sql:47-48`):
- `'paid'` is set in exactly two places: `markPaidOff()` (`src/lib/ar/masterlist.ts:274-278`, **guarded** — only writes if not already `"paid"`) and `reconcileAndPostDcr()` (`src/lib/ar/posting.ts:311-317`, **unguarded** — every posted payment rewrites `account_status` to `"active"` or `"paid"` unconditionally, even against an account already `"paid"`, once per DCR item in a loop that can touch many accounts).
- `'default'` is **never written anywhere** — defined in the CHECK constraint, dead in application code (confirmed via full-codebase grep). Don't build a "Defaulted" filter group for it; if this changes later, that's a separate, deliberate addition, not something to guess at now.
- `'remedial'` is set by `assignRemedial()` (`src/lib/ar/masterlist.ts:303-310`) and by the automatic aging-refresh routine (`src/lib/ar/posting.ts:187-197`, flips to `"remedial"` when `agingBucket === "91+"`, **one-way** — never resets back to `"active"` on its own). **`account_status = 'remedial'` is not the authoritative routing signal** — `remedial_flag` (boolean, same table) is what every other query/RLS policy actually keys off (`src/app/api/collector/accounts/route.ts:41`, `src/app/api/remedial/accounts/route.ts:71`, both RLS files above), and `account_status`/`remedial_flag` can drift out of sync (the aging-refresh routine sets `remedial_flag` in more cases than it updates `account_status` to match).
- **Scoping decision**: "moved to Remedial" is **out of scope for this plan**. It's a hand-off between two other modules (AR → Remedial), not a "posting" AR staff did, `account_status='remedial'` is unreliable as a source of truth, and Remedial gets its own module/history pass later in this rollout (tracker items `6`/`6.1`) — that's the more correct place to build a "remedial handoff" history view (there's already a `remedial_turnovers` table, `src/lib/ar/masterlist.ts:320-327`, with `confirmed_at`, that a future Remedial-module plan should use, but it doesn't capture the *automatic* aging-based flips, only AR-confirmed turnovers — a gap for that future plan to account for, not this one).

**`closed_at` needs a DB trigger, not an app-code stamp.** Since `'paid'` is written from two call sites, one of them unguarded and looping over potentially many accounts per DCR, a naive app-code timestamp write at either call site would either miss the DCR-posting path entirely (if only added to `markPaidOff`) or re-stamp `closed_at` on every subsequent posting against an already-closed account (if added to `posting.ts:315` without a transition guard). A trigger firing only on the actual OLD→NEW transition into `'paid'` is correct regardless of how many call sites exist today or get added later.

**Reconciled-DCR history should be built from `postings`, not `dcr`/`dcr_items`.** The `postings` table (`20260707000000_p7_ar_collection.sql:134-143`: `dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at`) is already one row per (DCR × masterlist account × payment), inserted inside `reconcileAndPostDcr`'s per-item loop (`src/lib/ar/posting.ts:264-272`) — the one-DCR-can-touch-many-accounts expansion problem is already solved by this table's shape. Building History from `dcr`+`dcr_items` instead would mean re-deriving the same expansion by hand.
- `dcr.status = 'rejected'` is, like `account_status='default'`, defined in the CHECK constraint (`dcr` DDL, same migration, lines ~112-124) but **never written anywhere** — no reject route/action exists in this codebase today (confirmed: `src/app/api/ar/dcr/route.ts` is `GET`-only querying `submitted`; `src/app/api/ar/dcr/[id]/reconcile/route.ts` only reconciles). Don't build a "Rejected" filter group for the DCR tab. This is unlike Committee's `hold`/`revisit`, which **are** real, implemented, non-terminal actions that legitimately belong in history — DCR rejection has no equivalent implemented action to log.
- `dcr` already has a real `reconciled_at timestamptz` column (`20260707000000_p7_ar_collection.sql`, set at `posting.ts:325`) — but since one DCR can post to multiple accounts, `postings.posted_at` (effectively the same moment, stamped per-row) is the more useful per-row timestamp for a row-per-account-posting history table.
- RLS on `dcr` for `accounting_ar:view` is unconditional (`20260707000001_p7_rls.sql:165-171`, no status predicate) — same needs checking for `postings` (see "Files to change," Phase 1, for the exact policy check to run before assuming this is also already open).

**Detail pages are safe to link to.** `/ar/masterlist/${id}` (`src/app/ar/masterlist/[id]/page.tsx`) has no `notFound()`/`redirect()` guard (confirmed via grep). Both History tabs' View action can link here — the Closed Accounts tab obviously (same account), and the Reconciled DCRs tab too (`postings.masterlist_id` → the account that posting affected), since there's no dedicated per-DCR detail page in this codebase to link to instead.

**Sidebar** already has `children` on the `/ar` entry (`Sidebar.tsx:273-286`: `Masterlist`, `DCR queue`) — needs a third child added, same shape as CSA's.

**Masterlist page today** (`src/app/ar/page.tsx`, full read): client-side-only search/sort/pagination over an unbounded fetch (same pre-redesign shape CSA's queue had), KPI strip (Accounts/Active/Needs attention/Outstanding — `page.tsx:264-272,431-446`), Status + Aging dropdown filters built dynamically from whatever values are present in the data (`page.tsx:274-280,485-591`), columns Borrower/Loan account/Portfolio/Outstanding/Monthly/Aging/Status/Assignment. Permission: `requireModulePermission("accounting_ar", "view")`.

## Explicitly out of scope for this plan

- "Moved to Remedial" as a History event (see scoping decision above — belongs to a future Remedial-module plan).
- Any `account_status='default'` or `dcr.status='rejected'` filter/KPI group (both confirmed dead code paths).
- Any change to `markPaidOff`/`reconcileAndPostDcr` application logic beyond what's needed to keep the trigger correct — this plan reads from those, doesn't change their business logic.
- `src/app/ar/masterlist/[id]/page.tsx`, `src/app/ar/dcr/page.tsx`, `src/app/api/ar/dcr/[id]/reconcile/route.ts` — untouched.

---

## Phase 1 — Migration: `masterlist.closed_at`

### Files to change

1. **New migration file** (`supabase/migrations/<timestamp>_ar_masterlist_closed_at.sql`) — apply via Supabase MCP, not `db push` (per this project's established convention, see `loanstar/docs/document-template-system-plan.md` gotcha notes):
   - `ALTER TABLE public.masterlist ADD COLUMN IF NOT EXISTS closed_at timestamptz;`
   - A trigger function that stamps `closed_at = now()` when a row's `account_status` transitions **into** `'paid'` from something else, and clears it back to `NULL` if it transitions **out** of `'paid'` (defensive symmetry, in case a closed account is ever reopened — e.g. a correction):
     ```sql
     CREATE OR REPLACE FUNCTION public.stamp_masterlist_closed_at()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $$
     BEGIN
       IF NEW.account_status = 'paid' AND OLD.account_status IS DISTINCT FROM 'paid' THEN
         NEW.closed_at := now();
       ELSIF NEW.account_status <> 'paid' AND OLD.account_status = 'paid' THEN
         NEW.closed_at := NULL;
       END IF;
       RETURN NEW;
     END;
     $$;

     CREATE TRIGGER masterlist_stamp_closed_at
       BEFORE UPDATE ON public.masterlist
       FOR EACH ROW
       WHEN (NEW.account_status IS DISTINCT FROM OLD.account_status)
       EXECUTE FUNCTION public.stamp_masterlist_closed_at();
     ```
   - Also check (via `list_tables`/RLS query, not assumption) whether `postings` has an RLS SELECT policy granting `accounting_ar:view` — Phase 0 confirmed this for `dcr` but not explicitly for `postings` itself. If missing, add it in this same migration: `CREATE POLICY postings_select ON public.postings FOR SELECT TO authenticated USING (public.is_super_admin() OR public.has_module_permission('accounting_ar', 'view'));` — but only if actually missing; don't add a duplicate/conflicting policy if one already exists.

### Explicitly out of scope

No backfill of `closed_at` for already-paid accounts in this phase — that's a data question for the user (do they want historical accounts that were already paid off before this migration to show a closure date, and if so, what date — `updated_at` would be a guess, not a fact). Flag this as a decision needed before Phase 2 ships, don't silently backfill with a guessed value.

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

---

## Phase 2 — Backend: `lib/ar/history.ts` + `GET /api/ar/history/accounts` + `GET /api/ar/history/dcr`

### Files to change

1. **`src/lib/ar/format.ts`** (new file) — `formatDate`/`formatMoney`, same shape as CSA's/Committee's.
2. **`src/lib/ar/history.ts`** (new file)
   - `export type ClosedAccountRow = { id, loanAccountNo, borrowerName, borrowerNo, outstandingBalance, portfolioName, closedAt }` — from `masterlist WHERE account_status = 'paid' AND closed_at IS NOT NULL`.
   - `export async function getClosedAccountsHistory(supabase, params: { search?, from?, to?, sortKey?: "borrower"|"account"|"closedAt", sortDir?, page, pageSize }): Promise<{ rows: ClosedAccountRow[]; totalCount: number }>` — search directly on `masterlist` (it already has `borrower_name`/`borrower_no`/`loan_account_no` as plain columns per `src/app/ar/page.tsx:34-40` — **no borrower-table hop needed here**, unlike CSA/Committee, since Masterlist denormalizes borrower identity onto itself already; confirm this by reading the `masterlist` DDL's borrower columns before writing the query, don't assume), `.gte`/`.lte` on `closed_at`, `.order()`, `.range()`, `{count:"exact"}`.
   - `export async function getClosedAccountsKpiCounts(supabase, {from,to}): Promise<{ total: number }>` — just one count (no status-group breakdown needed — "closed" is a single event type here, unlike CSA's 3-group/Committee's 4-group history). Date-scoped only, same principle as the other modules.
   - `export type ReconciledPostingRow = { id (postings.id), dcrId, masterlistId, loanAccountNo, borrowerName, borrowerNo, amount, depositReference, postedAt }` — from `postings` joined to `masterlist` (identity) and `dcr` (`deposit_reference`).
   - `export async function getReconciledDcrHistory(supabase, params: { search?, from?, to?, sortKey?: "borrower"|"amount"|"postedAt", sortDir?, page, pageSize }): Promise<{ rows: ReconciledPostingRow[]; totalCount: number }>` — same shape, `.gte`/`.lte` on `posted_at`, search on `masterlist` columns (again, no borrower-table hop) plus `dcr.deposit_reference` (needs `dcr!inner(...)` embed for that filter to be reliable — same "plain AND-filter on embedded column, not `.or()`" reasoning Committee's TAT-overdue KPI relied on, not the fragile `.or()` case).
   - `export async function getReconciledDcrKpiCounts(supabase, {from,to}): Promise<{ total: number; totalAmount: number }>` — `totalAmount` is a **sum**, not a count — Supabase JS doesn't have a `.sum()` aggregate helper the way it has `count`; fetch just the `amount` column for the date-bounded rows and sum in JS (bounded by the same date range, should be a reasonably sized result set — if this turns out to be a performance concern at real data volume, that's a follow-up, not a blocker for this phase; note the row-count ceiling you observe when implementing).
3. **`src/app/api/ar/history/accounts/route.ts`** (new file) — `requireModulePermission("accounting_ar","view")`, parse/allowlist params (`search`, `range`/`from`/`to` default `30d`, `sortKey`, `sortDir`, `page`, `pageSize`), `Promise.all` the two functions, return `{ rows, totalCount, kpi }`.
4. **`src/app/api/ar/history/dcr/route.ts`** (new file) — same shape, calling the DCR-history pair.

### Explicitly out of scope

No single merged/tabbed API route — two independent endpoints, matching Collector's existing dual-fetch precedent (`src/app/collector/history/page.tsx` fetches `/api/collector/payments?scope=history` and `/api/collector/dcr?limit=100` separately, in parallel). Don't invent a `tab` query param on one shared route.

### Status: Implemented by Cursor — awaiting validation

---

## Phase 3 — Frontend: `/ar/history` page (tabbed)

### Files to change

1. **`src/app/ar/history/page.tsx`** (new file, `"use client"`) — top-level tab state (`"accounts" | "dcr"`, default `"accounts"`), each tab independently holding its own search/date-range/sort/page/pageSize/viewMode state and its own `load()` (two separate debounced-search + query-param-driven fetchers, following `src/app/csa/history/page.tsx` as the template for each tab's internals — KPI row, collapsible Filters panel, `loading`-gated skeleton on every load [not `hasLoaded`], `Pagination`/page-size `Select` rendered unconditionally, View action per row).
   - **Accounts tab**: 1 KPI card ("Total closed") — since there's no status-group dimension, this can just be a plain `.card.stat` without click-to-filter behavior (nothing to filter *to* besides "all"), or omit the clickable/KPI-as-filter pattern for this tab entirely and just show it as a simple stat next to the tab label — **use judgement here matching the spirit of the pattern (a page shouldn't feel bare), but don't force a fake 4-card grid when there's only one real number to show.**
   - Columns: Account No. (mono, primary), Borrower, Outstanding (should read ₱0.00 for every row, since these are all fully closed — still show it for consistency with other modules' Amount columns, don't omit it), Portfolio, Closed On (sortable, default sort desc). Trailing View action → `/ar/masterlist/${row.id}`.
   - **DCR tab**: 2 stat cards ("Total postings," "Total amount" — money-formatted). Columns: Reference (DCR deposit reference, mono), Borrower/Account, Amount (num, mono), Posted On (sortable, default desc). Trailing View action → `/ar/masterlist/${row.masterlistId}`.
   - Grid view for both tabs follows the established `.gcard` pattern.
   - `PageHeader` title "AR Posting History", description "Closed accounts and reconciled DCRs." Tab switcher below the header, above the KPI row (visually similar to Collector's `tab === "dcrs" ? ... : ...` chip pair, `collector/history/page.tsx:169-199`, but reuse the `.mod-btn`/segmented-tab visual style already established elsewhere in this codebase rather than Collector's specific `fchip`-as-tab hack — check `src/app/globals.css` for the cleanest existing tab-switcher class before picking one).

### Explicitly out of scope

`src/app/collector/history/page.tsx` — reference only, not touched.

### Status: Implemented by Cursor — awaiting validation

---

## Phase 4 — Sidebar wiring

### Files to change

1. **`src/components/admin/Sidebar.tsx`** — add a third child to the `/ar` entry (`Sidebar.tsx:273-286`):
   ```ts
   children: [
     { href: "/ar", label: "Masterlist", exact: true, matchPrefixes: ["/ar/masterlist"] },
     { href: "/ar/dcr", label: "DCR queue" },
     { href: "/ar/history", label: "Posting history" },
   ],
   ```

### Status: Implemented awaiting validation

---

## Phase 5 — Tests

### Files to change

1. **`src/lib/ar/__tests__/history.test.mts`** (new file) — unit tests for whatever pure filter/sort-spec helpers Phase 2 extracts (mirror the `statusFilterSpec`/`actionFilterSpec` pattern), and for the JS-side `totalAmount` summation helper if it's factored out as its own function (it should be, for testability — don't inline a `.reduce()` directly in the route handler if it's meaningful enough to unit test in isolation).

### Status: Implemented awaiting validation

---

## Phase 6 — Backend: `/api/ar/masterlist` (active queue) becomes query-param-driven

### Files to change

1. **`src/lib/ar/queue.ts`** (new file) — `getMasterlistQueue(supabase, params: { search?, statusFilter?, agingFilter?, from?, to?, sortKey?, sortDir?, page, pageSize })`. **Read `src/app/ar/page.tsx`'s existing client-side filter logic first** (Status/Aging dropdowns, priority sort) and preserve its exact semantics — same "keep existing behavior, add the missing pieces" rule as every other queue redesign in this rollout. Date-range field: `created_at` (Masterlist rows represent loan accounts from origination — there's no more specific "arrived at AR" event the way Committee had `forwarded_at`; confirm this is the right call by checking whether Masterlist rows get created at a specific AR-relevant moment, e.g. at loan release, not at CSA intake — if so, prefer that timestamp instead of guessing `created_at` is right).
   - `getMasterlistQueueKpiCounts(supabase)` — mirror the existing KPI set (`page.tsx:264-272`), not date-scoped (preserve current behavior).
2. **`src/app/api/ar/masterlist/route.ts`** — rewrite `GET` to the standard query-param-driven shape.

### Status: Implemented awaiting validation

**Notes (Phase 6):**
- Date field: `created_at` (confirmed — rows inserted at AR receive / loan enrollment in `createMasterlistFromRelease`).
- `needsAttention`: `remedial_flag` OR aging bucket neither `"current"` nor empty (case-insensitive), exported from `src/lib/ar/queue.ts`.
- Filter-spec helpers + pure KPI helpers covered in `src/lib/ar/__tests__/queue.test.mts` (Phase 8 can expand).
- `/ar` page still expects `{ masterlist }` — will break until Phase 7 rewires the frontend (expected).

---

## Phase 7 — Frontend: `/ar` (Masterlist) calls the backend, gets the full toolbar

### Files to change

1. **`src/app/ar/page.tsx`** — same restructuring pattern as every other queue redesign in this rollout: query-string `load()`, debounced search, `loading`-gated skeleton on every load, `Pagination`/page-size `Select` always mounted, existing KPI strip/Status+Aging filters preserved (moved into the standard collapsible Filters panel + `DateRangeFilter`), `ViewModeToggle` added, existing priority sort kept client-current-page-only.

### Status: Implemented awaiting validation

**Notes (Phase 7):**
- `GET /api/ar/masterlist?...` → `{ rows, totalCount, kpi }`; receive queue still via `GET /api/ar/queue`.
- Status/aging fixed-enum `.fchip`s in `.filter-panel`; `DateRangeFilter` on `created_at` (default `"all"`); `ViewModeToggle` list/grid/compact.
- KPI strip sourced from `kpi.total` / `activeCount` / `attentionCount` / `totalOutstanding`; priority sort client-current-page-only via `needsAttention` from `@/lib/ar/queue`.
- Preserved: Export CSV (POST), Receive queue Card, Open → `/ar/masterlist/[id]`. Assign/remedial remain on the detail page (separate APIs).

---

## Phase 8 — Tests (queue backend)

### Files to change

1. **`src/lib/ar/__tests__/queue.test.mts`** (new file) — mirror the established pattern (filter-spec helper tests, active-status-subset check if applicable).

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

**Notes (Phase 8):**
- File was created in Phase 6; Phase 8 verified coverage and added page-chip agreement tests (every `/ar` Status + Aging chip id through `statusFilterSpec`/`agingFilterSpec`, and `needsAttention` vs priority-sort aging buckets).
- No `ACTIVE_*_STATUSES` subset constant — Masterlist queue intentionally includes all CHECK statuses (incl. `paid`); Committee-style active-subset check N/A.
- Also covered from Phase 6: page-size allowlist/`clampMasterlistQueuePageSize`, `sumOutstandingBalances`, `needsAttention` remedial/current/empty cases.

---

## Overall item status: Phases 1–8 implemented, awaiting human validation

**Open decision (carried):** no backfill of `closed_at` for already-paid accounts — Phase 2 queries require `account_status = 'paid' AND closed_at IS NOT NULL`, so pre-migration paid rows stay excluded until they re-transition.
