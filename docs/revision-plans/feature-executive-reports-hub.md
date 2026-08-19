# Feature — Executive Reports Hub (snapshot + named registers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Turn `/reports` into an executive hub: a corrected Snapshot plus four named register pages (Accounts, Past due, Collections, Pipeline), sharing one tab bar and one date range.

**Architecture:** Keep the existing metric registry and `createServiceClient()` reads. Add a client `ReportsChrome` in the reports layout (period query string + five in-page tabs). New list pages fetch dedicated `/api/reports/*` routes. Do not add sidebar children, a chart library, an AI assistant, a Staff tab, or new tables.

**Tech Stack:** Next.js App Router, existing `@/components/ui`, existing reports metric helpers, Supabase service-role reads, Node test runner (`node --import tsx --test`).

---

**Ground rules (apply to every phase):**
- **Closed allowlist.** Each phase has two lists: **Allow** (create/modify) and **Do not touch**. If a file is not on **Allow**, you may not edit it. Importing it is fine. If you believe another file is required, **stop and flag it** — do not edit it.
- After each phase, run `git diff --stat` (or `git status`) and confirm every changed path is on that phase's **Allow** list. If anything else appears, revert it before reporting the phase done.
- Do not rename, refactor, or clean up adjacent code, even inside an allowed file, except the exact behavior the phase names.
- Reuse existing UI primitives (`@/components/ui`) and the reports chart kit. Do not add a charting library.
- Execute phases in order. Each phase must leave `npx tsc --noEmit` no worse than the known pre-existing test-file errors, and `npm test` green.
- **Do not commit** unless the user explicitly asks.
- Where a note says "confirm before implementing," check the live code/schema first — do not assume this document is still current if you are running it days later.
- Migrations (Phase 8 only) go through Supabase MCP `apply_migration`, then the stamped file is copied into **both** `supabase/migrations/` and `loanstar/supabase/migrations/`.
- At the end of all phases, output one combined summary: files changed, migration(s) applied, tests run/result, everything deliberately left alone.

**Global freeze (no phase may edit these unless that phase's Allow list names the file):**
- `src/components/admin/Sidebar.tsx` — Reports stays one nav item, no children
- `src/components/reports/{MoneyPanel,RiskPanel,StaffPanel,AssistantDrawer}.tsx` — except Phase 6 (OriginationPanel extract) and Phase 7 (`RiskPanel` `par30Href` only)
- `src/lib/reports/metrics/{money,risk,staff}.ts` — import only
- `src/lib/reports/{scope,triggers,csv,period}.ts` — import only (`period.ts` is already correct)
- `src/lib/dashboard/**`, `src/components/dashboard/**` — dashboard hub is out of scope
- `src/lib/ar/posting.ts` — import `daysPastDue` from `schedule.ts` only; do not change posting
- `src/app/api/reports/dashboard/route.ts` and `src/app/api/reports/metrics/route.ts` — leave as-is
- Collector / AR / CSA / Committee / CIG / LRA / Remedial pages and APIs
- `supabase/migrations/20260706100002_p1_seed_data.sql` — do not rewrite seed; Phase 8 adds a new migration
- `src/middleware.ts`, `src/lib/permissions/server.ts`

**Out of scope (do not build):**
- Staff as a sixth tab (scorecard stays on Snapshot).
- Cash-forecast installment list, manning-agency concentration, write-off pack, AI assistant.
- Collector/remedial role scoping (`src/lib/reports/scope.ts` stays unused).
- Operational queues (DCRR encode, proofs, CIG).
- Linking Committee users into CSA/AR portals they cannot open.

---

## Audit (verified 2026-08-19, live project via Supabase MCP)

Evidence-only. Do not re-derive these from memory.

### What already exists

| Path | Role |
|---|---|
| `src/app/reports/page.tsx` | Client Snapshot: period presets, 4 top KPIs, Money/Risk/Origination/Staff panels, then **legacy** pipeline/aging/income/collection/TAT cards |
| `src/app/reports/layout.tsx` | `<AppShell title="Reports">` only — no tab bar, no period chrome |
| `src/app/api/reports/dashboard/route.ts` | `requireModulePermission("reports","view")` + `createServiceClient()` |
| `src/lib/reports/metrics/{money,risk,origination,staff}.ts` | Theme calculators |
| `src/lib/reports/period.ts` | `parsePeriod`, `presetPeriod`, `priorPeriod`, `PERIOD_PRESETS` |
| `src/components/admin/Header.tsx` | Optional `links` underline tabs — **hidden below `sm`**, already crowded with breadcrumbs |
| `src/components/admin/Sidebar.tsx:203` | Single `{ href: "/reports", label: "Reports", module: "reports" }` — no children |

### Live schema used by this plan (information_schema, not guessed)

`masterlist`: `id`, `loan_application_id`, `borrower_id` (NOT NULL), `loan_account_no`, `borrower_no`, `borrower_name`, `total_loan`, `outstanding_balance`, `aging_bucket`, `account_status`, `remedial_flag`, `segment`, `release_date`, `terms`, `manning_agency`, `closed_at`.

Live `account_status` values: `active` (20), `paid` (9), `remedial` (2).

Live `aging_bucket` values: `current`, `1-30`, `31-60`, `61-90`, `91+`.

`assignments`: `masterlist_id`, `collector_user_id`, `remedial_user_id`.

`postings`: `masterlist_id`, `amount`, `posted_at`.

`dcr`: `collector_user_id`, `status` (`draft` / `submitted` / `reconciled` / `rejected`), `submitted_at`, `reconciled_at`.

`amortization_schedules`: `masterlist_id`, `due_date`, `status` (`pending` / `overdue` / `paid` / `rolled`), `amount_due`, `amount_paid`.

`borrowers`: `id`, `borrower_no`, `first_name`, `last_name`.

`loan_applications`: `id`, `status`, `status_history` jsonb `[{status, at}]`, `segment`.

`profiles`: `id`, `full_name`, `email` — RLS own-row only; staff names must use the service client (already the pattern in `staff.ts`).

Aging days-past-due is **not** a column. AR derives it in `src/lib/ar/posting.ts` from the oldest unpaid non-`rolled` schedule with `daysPastDue(due_date) > 0`, then `computeAgingBucket` in `src/lib/ar/schedule.ts`.

### Snapshot bugs (live numbers)

| Bug | Code | Live effect 2026-08-19 |
|---|---|---|
| Approval rate uses **current** `status === 'approved'\|'denied'` | `origination.ts` ~233–287 | **40%** (2/5). 24 `loan_active` + 7 `paid_off` + 1 `released` + 1 `release_signing` are ignored. |
| Active loans = `COUNT(*)` on all `masterlist` | `aggregates.ts:243` | **31** including 9 `paid`. Unpaid (`active`+`remedial`) = **22**. |
| Top "Posted collections" ignores period | `page.tsx` uses `data.income.totalPosted` from all-time `buildIncomeReport` | Changing MTD/YTD does not move that tile. |
| Legacy cards duplicate new panels | `page.tsx` from the "Pipeline by stage" grid through the TAT card | Aging as **account counts** vs Risk panel pesos. |
| Period ignored by risk/staff/most origination | `computeRiskMetrics(supabase)` / `computeStaffMetrics(supabase)` take no period | Documented as snapshot metrics — do not silently period-scope them in this plan. |

### Permissions

Seed (`20260706100002_p1_seed_data.sql`) grants `reports:view` only to `super_admin` and `ar`.

Live `role_module_permissions` for `reports`:

| role | can_view | can_create | can_edit |
|---|---|---|---|
| super_admin | true | true | true |
| ar | true | false | false |
| committee | true | true | true |
| borrower, csa | false | false | false |

Committee's live `create`/`edit` on reports is **not** in any migration. Phase 8 persists **view-only** (same shape as AR). No new tables. Latest applied migration as of this audit: `20260818030032_dcr_items_per_item_reconciliation`.

### Drill-through destinations that actually exist

- AR account: `/ar/masterlist/[id]` (requires `accounting_ar` view).
- Collector has **no** account overview page — only `/collector/accounts/[id]/case-file` and `record-payment`.
- CSA application: `/csa/applications/[id]` (requires `intake`).

Committee has `reports:view` and neither AR nor intake. Row names on registers must be **plain text** unless `can("accounting_ar","view")`.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/reports/approval-rate.ts` | Pure: committee approval vs denial from status + history |
| `src/lib/reports/registers.ts` | Pure: filter/sort/page loan rows, group borrowers, past-due filter |
| `src/lib/reports/register-queries.ts` | Service-role fetches for the three list APIs |
| `src/components/reports/ReportsChrome.tsx` | Period bar + tab row wrapping every reports page |
| `src/app/reports/layout.tsx` | Mount chrome |
| `src/app/api/reports/accounts/route.ts` | Loans + borrowers JSON |
| `src/app/api/reports/past-due/route.ts` | Past-due JSON |
| `src/app/api/reports/collections/route.ts` | Period collections JSON |
| `src/app/reports/accounts/page.tsx` | Loans \| Borrowers register |
| `src/app/reports/past-due/page.tsx` | PAR list |
| `src/app/reports/collections/page.tsx` | Cash-in vs due + DCRR quality |
| `src/app/reports/pipeline/page.tsx` | Existing OriginationPanel on its own route |

---

## Phase 1 — Snapshot correctness (no new pages)

**Goal:** The four headline numbers and approval rate stop lying. Legacy duplicate cards come off Snapshot.

### Allow (only these)
- Create: `src/lib/reports/approval-rate.ts`
- Create: `src/lib/reports/__tests__/approval-rate.test.mts`
- Modify: `src/lib/reports/metrics/origination.ts` — replace the current-status approval count with `approvalRatePct`; update that metric's `formula` string. Do not change funnel, TAT, stuck files, or other metric ids.
- Modify: `src/lib/reports/aggregates.ts` — the `activeLoans` query inside `buildExecutiveSummary` only. Do not change `buildAgingReport` / `buildIncomeReport` / `buildCollectionReport` / TAT helpers.
- Modify: `src/app/reports/page.tsx` — top KPI "Posted collections" binding; delete the legacy pipeline/aging/income/collection/TAT cards. Do not restyle Money/Risk/Origination/Staff panels.

### Do not touch this phase
- `origination.test.mts` — keep funnel tests as they are; new tests live in `approval-rate.test.mts`
- `src/app/reports/layout.tsx`, Header, Sidebar
- `src/lib/reports/metrics/{money,risk,staff}.ts`
- `src/lib/dashboard/aggregates.ts` (it imports `buildExecutiveSummary`; the count change flows through automatically)

### Active loans (do not guess statuses)

Count `masterlist` rows where `account_status IN ('active','remedial')`. Live that is 20+2=22. Do **not** use `account_status <> 'paid'` only if a fourth status appears later — stick to the two unpaid statuses observed **and** already used as live values: `active` and `remedial`. If you find a new `account_status` in live data when implementing, stop and flag it.

In `buildExecutiveSummary`, replace the unfiltered count:

```ts
supabase
  .from("masterlist")
  .select("id", { count: "exact", head: true })
  .in("account_status", ["active", "remedial"]),
```

### Approval rate

Do **not** count `status === 'approved'` only. A file that moved on is still an approval.

Create `src/lib/reports/approval-rate.ts`:

```ts
export type ApprovalInput = {
  status: string;
  status_history: Array<{ status: string; at: string }> | null;
};

/** Current statuses that can only exist after Committee approved.
 *  Taken from APPLICATION_STATUSES that the origination funnel already
 *  treats as post-approval, plus live statuses observed 2026-08-19
 *  (`release_signing`). Denied/cancelled/draft/etc. are not in this set. */
const POST_APPROVAL_STATUSES = new Set([
  "approved",
  "negotiating_terms",
  "awaiting_confirmation",
  "lra_pending",
  "release_signing",
  "release_briefing",
  "release_ready",
  "released",
  "closed",
  "loan_active",
  "paid_off",
]);

function historyStatuses(app: ApprovalInput): string[] {
  return (app.status_history ?? []).map((e) => e.status);
}

export function isCommitteeApproved(app: ApprovalInput): boolean {
  if (app.status === "denied" || app.status === "cancelled") return false;
  if (POST_APPROVAL_STATUSES.has(app.status)) return true;
  return historyStatuses(app).includes("approved");
}

export function isCommitteeDenied(app: ApprovalInput): boolean {
  if (app.status === "denied") return true;
  const hist = historyStatuses(app);
  return hist.includes("denied") && !hist.includes("approved") && !POST_APPROVAL_STATUSES.has(app.status);
}

export function approvalRatePct(apps: ApprovalInput[]): number {
  const approved = apps.filter(isCommitteeApproved).length;
  const denied = apps.filter(isCommitteeDenied).length;
  const decided = approved + denied;
  return decided > 0 ? (approved / decided) * 100 : 0;
}
```

If `negotiating_terms` / `awaiting_confirmation` turn out pre-approval when you grep `src/lib/committee` and `src/lib/negotiation` **during this phase**, remove them from the set and flag it. Confirm before shipping: search those two folders for `status: "negotiating_terms"` / `"awaiting_confirmation"`.

Tests (`src/lib/reports/__tests__/approval-rate.test.mts`):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalRatePct,
  isCommitteeApproved,
  isCommitteeDenied,
} from "../approval-rate";

test("loan_active with approved in history counts as approved", () => {
  assert.equal(
    isCommitteeApproved({
      status: "loan_active",
      status_history: [
        { status: "for_approval", at: "2026-01-01T00:00:00Z" },
        { status: "approved", at: "2026-01-02T00:00:00Z" },
        { status: "loan_active", at: "2026-01-10T00:00:00Z" },
      ],
    }),
    true,
  );
});

test("current approved still counts", () => {
  assert.equal(isCommitteeApproved({ status: "approved", status_history: [] }), true);
});

test("denied current status counts as denied, not approved", () => {
  const app = {
    status: "denied",
    status_history: [
      { status: "for_approval", at: "2026-01-01T00:00:00Z" },
      { status: "denied", at: "2026-01-02T00:00:00Z" },
    ],
  };
  assert.equal(isCommitteeApproved(app), false);
  assert.equal(isCommitteeDenied(app), true);
});

test("draft with empty history is neither", () => {
  const app = { status: "draft", status_history: [] };
  assert.equal(isCommitteeApproved(app), false);
  assert.equal(isCommitteeDenied(app), false);
});

test("rate uses approved+denied only — live-shaped mix is not 40%", () => {
  const apps = [
    { status: "approved", status_history: [] },
    { status: "approved", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "loan_active", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
    { status: "loan_active", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
    { status: "paid_off", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
  ];
  // 2 current approved + 3 later-stage approved = 5; 3 denied; 5/8 = 62.5
  assert.equal(approvalRatePct(apps), 62.5);
});
```

In `computeOriginationMetrics`, replace the current-status counts with:

```ts
import { approvalRatePct } from "@/lib/reports/approval-rate";
// ...
metric("origination.approvalRate", approvalRatePct(apps)),
```

Update `ORIGINATION_METRIC_DEFS` formula for `origination.approvalRate` to:

`COUNT(applications Committee approved, including those that later moved to LRA/release/active/paid off) ÷ COUNT(those + denied)`

Keep `description` as the human sentence; it already matches.

### Top KPI "Posted collections"

In `src/app/reports/page.tsx`, bind that tile to `data.metrics` id `money.collected` (period-scoped), not `data.income.totalPosted`.

Look up with the same `metrics.find((m) => m.id === "money.collected")` pattern MoneyPanel already uses. If missing, show `0.00`.

Leave "Pipeline applications" and "Portfolio outstanding" as snapshots (`pipelineTotal`, `data.aging.totalOutstanding`). `buildAgingReport` already excludes `account_status = 'paid'`.

### Remove legacy cards

Delete from `page.tsx` the grid that starts at heading "Pipeline by stage" through the TAT card (including the `overdue91` badge that hangs off TAT). Keep Money, Risk, Origination, Staff panels. Drop now-unused locals (`maxAging`, `overdue91`, `formatStatusLabel` if unused).

OriginationPanel stays on Snapshot until Phase 6 moves it.

### Verify
- [x] `npx tsx --test src/lib/reports/__tests__/approval-rate.test.mts`
- [x] `npm test`
- [x] `npx tsc --noEmit`
- [x] `git diff --stat` shows only this phase's Allow list
- [ ] Log in as `super_admin`: Active loans = 22 (or live unpaid count); approval rate is not 40% with the current book; changing period moves Posted collections; the four leftover cards are gone.

---

## Phase 2 — Shared chrome (tabs + period in the URL)

**Goal:** Every `/reports/*` page shares one period bar and an in-page tab row. Sidebar stays a single Reports link.

### Allow (only these)
- Create: `src/components/reports/ReportsChrome.tsx`
- Create: `src/lib/reports/tabs.ts`
- Create: `src/lib/reports/__tests__/tabs.test.mts`
- Modify: `src/app/reports/layout.tsx` — wrap `{children}` in `<ReportsChrome>` only. Do not pass `links=` into `AppShell`.
- Modify: `src/app/reports/page.tsx` — remove the in-page period Card; read `from`/`to` from `useSearchParams`. Do not move or restyle Money/Risk/Origination/Staff.
- Modify: `src/components/admin/Header.tsx` — add four keys to `SEGMENT_LABELS` only (`accounts`, `past-due`, `collections`, `pipeline`). Do not change Header `links` rendering, breadcrumbs logic, or any other `SEGMENT_LABELS` entry.

### Do not touch this phase
- `src/components/admin/Sidebar.tsx`
- `src/components/admin/AppShell.tsx`
- `src/lib/reports/period.ts` (import `presetPeriod` / `PERIOD_PRESETS`; do not edit)
- Any new `/reports/*` page (those come in later phases)

### Tab list

Only render tabs whose routes exist. After this phase, only Snapshot exists. Later phases append to `REPORT_TABS`.

```ts
// src/lib/reports/tabs.ts
export type ReportTab = {
  href: string;
  label: string;
  exact?: boolean;
};

export const REPORT_TABS: ReportTab[] = [
  { href: "/reports", label: "Snapshot", exact: true },
  // Phases 3–6 push: Accounts, Past due, Collections, Pipeline
];

export function isReportTabActive(pathname: string, tab: ReportTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}
```

Test exact vs prefix: `/reports` must not mark `/reports/accounts` as Snapshot.

### Chrome behavior

`ReportsChrome` is `"use client"`. It:
1. Reads `from`/`to` from `useSearchParams()`. If missing, uses `presetPeriod("mtd")` and does **not** rewrite the URL until the user changes period (avoids a first-load redirect loop).
2. Renders the existing `SegmentedControl` + custom date inputs (copy the markup from current `page.tsx` period Card).
3. On preset/custom change, `router.replace` the **current pathname** with `?from=&to=` (preserve other params).
4. Renders the tab row under the period bar: `Link` per tab, teal bottom border when active, `className="no-print"`. Horizontal scroll on small screens (`overflow-x-auto`), **visible on mobile** (do not copy Header's `hidden sm:flex`).
5. Tab hrefs must include the current `from`/`to` so switching Snapshot → Accounts keeps MTD.
6. Wraps `{children}` below.

Print/Assistant stay on Snapshot `PageHeader` actions, not in chrome.

Layout:

```tsx
import { AppShell } from "@/components/admin/AppShell";
import { ReportsChrome } from "@/components/reports/ReportsChrome";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Reports">
      <ReportsChrome>{children}</ReportsChrome>
    </AppShell>
  );
}
```

Snapshot `load()` must keep using `activePeriod` from the URL after this move: read `from`/`to` via `useSearchParams` (same source as chrome) instead of local `preset` state. If both chrome and the page owned period state, they would drift.

### Verify
- [ ] `npx tsx --test src/lib/reports/__tests__/tabs.test.mts`
- [ ] Snapshot still loads; period control appears once (not twice).
- [ ] Changing MTD → YTD still refetches the dashboard.
- [ ] Resize below `sm`: tabs still visible.

---

## Phase 3 — Accounts register (Loans | Borrowers)

**Goal:** `/reports/accounts` is the list behind outstanding. Inner `SegmentedControl`: Loans | Borrowers.

### Allow (only these)
- Create: `src/lib/reports/registers.ts`
- Create: `src/lib/reports/register-queries.ts`
- Create: `src/lib/reports/__tests__/registers.test.mts`
- Create: `src/app/api/reports/accounts/route.ts`
- Create: `src/app/reports/accounts/page.tsx`
- Modify: `src/lib/reports/tabs.ts` — append `{ href: "/reports/accounts", label: "Accounts" }` only. Do not reorder Snapshot.

### Do not touch this phase
- `src/app/reports/page.tsx` (no KPI links yet — Phase 7)
- `src/lib/reports/metrics/**`, `aggregates.ts`, `staff.ts`
- `src/app/ar/masterlist/[id]/page.tsx` — link *to* it; do not edit AR
- `src/lib/reports/csv.ts` — import `downloadCsv` only

### Loan row shape (columns that exist)

```ts
export type LoanRegisterRow = {
  masterlistId: string;
  loanAccountNo: string | null;
  borrowerId: string;
  borrowerName: string;
  segment: "seafarer" | "sme" | null;
  accountStatus: "active" | "remedial" | "paid" | string;
  agingBucket: "current" | "1-30" | "31-60" | "61-90" | "91+" | string;
  outstanding: number;
  totalLoan: number;
  releaseDate: string | null;
  collectorName: string | null;
  remedialName: string | null;
};
```

`segment` on live masterlist is only `seafarer` | `sme` (nullable in schema; live has no nulls). Keep `null` in the type.

### Query (service role)

`register-queries.ts` `fetchLoanRegister(supabase)`:
1. `masterlist.select("id, loan_application_id, borrower_id, loan_account_no, borrower_name, segment, account_status, aging_bucket, outstanding_balance, total_loan, release_date")`
2. `assignments.select("masterlist_id, collector_user_id, remedial_user_id")`
3. Resolve collector/remedial names via `profiles` on the **same** service client (do not import `createServiceClient` inside a module that client components import — copy the `resolveNames` pattern from `staff.ts` but keep it in `register-queries.ts` only).
4. Default list: `account_status IN ('active','remedial')`. Query param `status=all` includes `paid`. Query param `status=paid` is paid only.

### Borrower grouping (pure, unit-tested)

```ts
export type BorrowerRegisterRow = {
  borrowerId: string;
  name: string;
  loanCount: number;
  outstanding: number;
  worstAging: string; // first of 91+, 61-90, 31-60, 1-30, current that appears
  segment: string | null; // "mixed" if loans disagree
};

const AGING_RANK = ["91+", "61-90", "31-60", "1-30", "current"];

export function groupLoansByBorrower(rows: LoanRegisterRow[]): BorrowerRegisterRow[] {
  // group by borrowerId; sum outstanding; max rank aging; segment mixed if not unique
}
```

Test with two loans same `borrowerId` (live has 3 repeat borrowers / 27 people with loans).

### API

`GET /api/reports/accounts?view=loans|borrowers&segment=all|seafarer|sme&status=unpaid|paid|all&aging=all|current|1-30|31-60|61-90|91+`

- Gate: `requireModulePermission("reports","view")`.
- Client: `createServiceClient()`.
- Filter in process after fetch (31 live rows; do not add SQL pagination in this phase).
- Return `{ view, rows, kpis: { count, outstanding } }`.

Invalid `view` → 400 `{ error: "..." }`.

### Page UX

- `PageHeader` title "Accounts", description "Every live loan, or one row per borrower."
- Actions: Export CSV (`downloadCsv` from `src/lib/reports/csv.ts`).
- Inner `SegmentedControl`: Loans | Borrowers (drives `view`; also `?view=` in the URL).
- Filter chips (same visual pattern as collector accounts): segment All/Seafarer/SME; aging chips; status Unpaid/Paid/All (Loans view only).
- KPIs: count of rows, sum outstanding (from response `kpis`).
- Table columns:
  - Loans: Account no. | Borrower | Segment | Status | Aging | Outstanding | Collector
  - Borrowers: Name | Loans | Outstanding | Worst aging | Segment
- Sort outstanding desc by default.
- Pagination: page sizes `[10, 20, 30, 50, 100]`, clamp helper in `registers.ts`.
- Account no. / borrower name: if `can("accounting_ar","view")` then `Link` to `/ar/masterlist/${masterlistId}` (borrower view: link the largest loan's id). Else plain text. Use `usePermissions().can`.

Do not use `window.prompt`. Reuse `Table`, `Th`, `Td`, `Badge`, `EmptyState`, `Pagination`, `Select`.

### Verify
- [x] `npx tsx --test src/lib/reports/__tests__/registers.test.mts`
- [ ] Unpaid loans KPI outstanding matches Snapshot portfolio outstanding (₱12,357,225.40 on 2026-08-19 data, or whatever live unpaid sum is that day).
- [ ] Committee user: names not clickable; data still non-zero (service role).
- [ ] AR user: name opens masterlist.
- [ ] Accounts tab visible; period query string survives Snapshot → Accounts.

---

## Phase 4 — Past due register

**Goal:** `/reports/past-due` is the names behind PAR > 30. Default chip: all non-current aging.

### Allow (only these)
- Modify: `src/lib/reports/registers.ts` — add past-due filter helpers only
- Modify: `src/lib/reports/__tests__/registers.test.mts` — add past-due cases only
- Modify: `src/lib/reports/register-queries.ts` — add `fetchPastDueRegister` only; do not change `fetchLoanRegister`
- Create: `src/app/api/reports/past-due/route.ts`
- Create: `src/app/reports/past-due/page.tsx`
- Modify: `src/lib/reports/tabs.ts` — append `{ href: "/reports/past-due", label: "Past due" }` only

### Do not touch this phase
- `src/lib/ar/posting.ts`, `src/lib/ar/schedule.ts` — import `daysPastDue`; do not edit AR aging
- `src/lib/reports/metrics/risk.ts` — PAR formula stays; this page *lists* the same buckets
- `src/app/reports/page.tsx`, `src/components/reports/RiskPanel.tsx`

### Who is past due

`account_status IN ('active','remedial')` AND `aging_bucket IN ('1-30','31-60','61-90','91+')`.

Do **not** include the paid `91+` row (AN300018, outstanding ₱0) — `paid` is excluded by the status filter. That is the same rule `buildAgingReport` uses.

### Days past due

Not a column. Reuse the AR definition from `src/lib/ar/posting.ts` (oldest unpaid non-`rolled` schedule with `daysPastDue(due_date) > 0`). Import `daysPastDue` from `@/lib/ar/schedule` — do not copy the formula.

`fetchPastDueRegister`:
1. Loan rows as in Phase 3, filtered to past due.
2. `amortization_schedules.select("masterlist_id, due_date, status").in("masterlist_id", ids).neq("status","paid")`.
3. Per account, drop `rolled`, pick earliest `due_date` with `daysPastDue > 0`, set `daysLate`.

Amount column = `outstanding_balance` (the PAR numerator), not a separately invented "overdue installment sum".

### API

`GET /api/reports/past-due?aging=all|1-30|31-60|61-90|91+`

`aging=all` means the four non-current buckets. Default `all`.

Return `{ rows, kpis: { count, outstanding } }` where each row is a `LoanRegisterRow` plus `daysLate: number`.

### Page UX

- Header: "Past due".
- Chips: All past due | 1–30 | 31–60 | 61–90 | 91+.
- KPIs: accounts, outstanding (this is the PAR dollars for the chip).
- Table: Borrower | Account | Aging | Days late | Outstanding | Owner (collector, or remedial name if `account_status === 'remedial'`).
- Same AR link rule as Accounts.
- CSV export.
- Snapshot `risk.par30` tile (Phase 7) will deep-link here with `?aging=all` excluding 1–30? **PAR>30 in `risk.ts` is buckets `31-60`,`61-90`,`91+` only.** So the PAR>30 KPI must link to past-due **without** the 1–30 chip — add query `aging=par30` that means those three buckets. Implement `aging=par30` in this phase so Phase 7 does not invent a new API.

### Verify
- [ ] Paid 91+ AN300018 is absent.
- [ ] Sum outstanding for `aging=par30` matches Snapshot PAR>30 dollars (live 2026-08-19: ₱294,547.73 across the two remedial rows).
- [ ] 1–30 chip shows the 4 active 1–30 accounts (₱618,268.70 that day).

---

## Phase 5 — Collections pack

**Goal:** `/reports/collections` answers "did we collect what was due this period?"

### Allow (only these)
- Create: `src/lib/reports/collections-register.ts`
- Create: `src/lib/reports/__tests__/collections-register.test.mts`
- Modify: `src/lib/reports/register-queries.ts` — add period posting/DCR fetchers only; do not change loan/past-due fetchers
- Create: `src/app/api/reports/collections/route.ts`
- Create: `src/app/reports/collections/page.tsx`
- Modify: `src/lib/reports/tabs.ts` — append `{ href: "/reports/collections", label: "Collections" }` only

### Do not touch this phase
- `src/lib/reports/metrics/money.ts` — **call** `computeMoneyMetrics`; do not edit it
- `src/lib/reports/metrics/staff.ts` — do not period-scope the Snapshot scorecard
- `src/components/reports/MoneyPanel.tsx`, `StaffPanel.tsx`
- `src/app/reports/page.tsx`

### Period

Use `parsePeriod` from search params (`from`/`to`), same as dashboard. Chrome already puts those on the URL.

### Metrics (reuse money helpers where they already exist)

From `computeMoneyMetrics` you already have `money.collected`, `money.collectionEfficiency`, `money.penaltyIncome`. Call `computeMoneyMetrics(supabase, period)` in this route rather than rewriting posting sums.

Plus a **list** the money panel does not have:

DCRRs in period: `dcr` where `submitted_at` in `[fromT00:00:00.000Z, toT23:59:59.999Z]`, exclude `status === 'draft'` (same skip as `staff.ts`).

Per collector (service-role `profiles` names):
- `dcrsSubmitted`, `dcrsReconciled`, `dcrsRejected`, `amountCollected` (sum of `postings.amount` in period joined via `assignments.collector_user_id` — same join as `staff.ts`, but postings **filtered to the period**).

Segment filter: if `segment=seafarer|sme`, restrict postings to masterlist rows with that `segment`. Confirm before implementing: `postings` has no `segment` column — join `masterlist_id → masterlist.segment`.

### API

`GET /api/reports/collections?from=&to=&segment=all|seafarer|sme`

Return:

```ts
{
  period: { from, to },
  metrics: MetricValue[], // money.collected, collectionEfficiency, penaltyIncome only
  collectors: Array<{
    collectorUserId: string;
    name: string;
    amountCollected: number;
    dcrsSubmitted: number;
    dcrsReconciled: number;
    dcrsRejected: number;
    rejectionRatePct: number;
  }>;
}
```

### Page UX

- Header: "Collections".
- Segment chips: All / Seafarer / SME.
- Three KPIs from `metrics` (peso / pct format via existing `peso`/`pct` in `src/components/dashboard/widgets/format.ts` or `formatMoney` in `src/lib/ar/format.ts` — pick one and use it consistently; AR `formatMoney` includes the ₱ sign).
- Table: Collector | Collected | Submitted | Reconciled | Rejection rate.
- CSV of the collector table.
- Empty collectors: `EmptyState`.

### Verify
- [ ] MTD collected KPI equals Snapshot Money "Collected" for the same period.
- [ ] Staff panel on Snapshot stays all-time; this table is period-scoped — they may disagree, and that is correct. Do not "fix" staff in this phase.

---

## Phase 6 — Pipeline page

**Goal:** Origination funnel / stuck files live at `/reports/pipeline`. Snapshot keeps the six origination KPI tiles and a text link, not the heavy tables.

### Allow (only these)
- Create: `src/app/api/reports/pipeline/route.ts`
- Create: `src/app/reports/pipeline/page.tsx`
- Modify: `src/components/reports/OriginationPanel.tsx` — extract the six KPI tiles into an exported `OriginationKpis` (or equivalent) so Snapshot and Pipeline can share them. Do not change funnel/stuck-file/TAT markup except to use that extract.
- Modify: `src/app/reports/page.tsx` — remove `<OriginationPanel />`; render `OriginationKpis` plus a text link to `/reports/pipeline`. Do not restyle Money/Risk/Staff.
- Modify: `src/lib/reports/tabs.ts` — append `{ href: "/reports/pipeline", label: "Pipeline" }` only

### Do not touch this phase
- `src/lib/reports/metrics/origination.ts` (already fixed in Phase 1)
- `src/app/api/reports/dashboard/route.ts`
- Stuck-file destination routes under `/csa/**`

### API

```ts
export async function GET(request: Request) {
  await requireModulePermission("reports", "view");
  const supabase = createServiceClient();
  const period = parsePeriod(new URL(request.url).searchParams);
  const origination = await computeOriginationMetrics(supabase, period);
  return jsonOk({
    period,
    metrics: origination.metrics,
    series: origination.series,
    stuckFiles: origination.stuckFiles,
  });
}
```

Do not call `buildExecutiveSummary` here.

### Page

Reuse `OriginationPanel` as-is (`metrics`, `series`, `stuckFiles`). Stuck-file links today go to `/csa/applications/${id}`. Leave that link — it is useful for CSA/super_admin. Committee will 403 on the destination; do not build a reports application detail in this plan. Optional one-line note under the table: "Opening a file requires Intake access." Only add that sentence if the panel is easy to extend without a redesign; otherwise flag and skip.

### Snapshot after the move

Keep origination KPI tiles (conversion, approval, time to decision, SLA, avg amount, avg term) on Snapshot so the cover page still answers "is origination healthy?" Duplicate the six `OriginationKpi` usages from `OriginationPanel` or extract a tiny `OriginationKpis` in `src/components/reports/OriginationPanel.tsx` and use it on both pages. Prefer extract over copy.

### Verify
- [ ] `/reports/pipeline` shows stuck files + funnel.
- [ ] Snapshot no longer has the stuck-files table or funnel chart.
- [ ] Approval rate on both pages matches Phase 1.

---

## Phase 7 — Snapshot KPI drill-through

**Goal:** Clicking a headline number opens the matching register with the current period.

### Allow (only these)
- Modify: `src/app/reports/page.tsx` — wrap the Snapshot tiles listed below in `Link`. No other Snapshot edits.
- Modify: `src/components/reports/RiskPanel.tsx` — add optional `par30Href?: string` and wrap the PAR > 30 `KpiCard` when it is passed. Do not change PAR math, aging chart, vintage, or recovery.

### Do not touch this phase
- Accounts / past-due / collections pages (they already exist)
- `KpiCard.tsx` — wrap from the outside; do not add an `href` prop to the primitive

Wrap (or nest `Link` around the label/value) these tiles. `KpiCard` has no `href` prop — wrap the card in `Link` with `className="block no-underline"`:

| Tile | Destination |
|---|---|
| Portfolio outstanding | `/reports/accounts?view=loans&status=unpaid` + current from/to |
| Posted collections | `/reports/collections` + current from/to |
| PAR > 30 (in `RiskPanel`) | `/reports/past-due?aging=par30` + from/to |
| Active loans | `/reports/accounts?view=loans&status=unpaid` |

Do not link Pipeline applications (that is a snapshot count of all statuses, not a register we built).

### Verify
- [ ] Click outstanding → Accounts unpaid list, period preserved.
- [ ] Click PAR > 30 → Past due without 1–30.
- [ ] Committee can open the register pages (API 200) even though masterlist links are inert.

---

## Phase 8 — Persist Committee `reports:view` (the only migration)

**Goal:** Committee's reports access survives a reseed. Match AR: view-only.

### Confirm before applying
Re-run:

```sql
SELECT r.slug, rmp.can_view, rmp.can_create, rmp.can_edit, rmp.can_delete, rmp.can_execute_trigger
FROM role_module_permissions rmp
JOIN roles r ON r.id = rmp.role_id
JOIN modules m ON m.id = rmp.module_id
WHERE m.slug = 'reports'
ORDER BY r.slug;
```

If committee is already view-only, still apply the upsert so seed drift cannot return.

### MCP

`apply_migration` name: `committee_reports_view_only`

```sql
INSERT INTO public.role_module_permissions (
  role_id, module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger
)
SELECT r.id, m.id, true, false, false, false, false
FROM public.roles r
CROSS JOIN public.modules m
WHERE r.slug = 'committee' AND m.slug = 'reports'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  can_execute_trigger = EXCLUDED.can_execute_trigger;
```

**Confirm before implementing:** `role_module_permissions` unique constraint. Live schema from `list_tables` / foundation migration `20260706100000` defines uniqueness on `(role_id, module_id)`. If `ON CONFLICT` fails, stop and flag — do not guess a constraint name.

After MCP stamps the version, copy the file into **both** `supabase/migrations/` and `loanstar/supabase/migrations/` with the **exact** stamped filename from `list_migrations`.

### Allow (only these)
- Create: the MCP-stamped migration file, then copy that **same** filename into `supabase/migrations/` and `loanstar/supabase/migrations/` (two copies, no other migration files)
- Modify: `src/lib/reports/rbac-matrix.ts` — append one `EXPECTED_DEFAULT_RBAC` row:
  `{ role: "committee", module: "reports", view: true, create: false, edit: false, delete: false, executeTrigger: false }`
- Modify: `src/lib/reports/__tests__/rbac-matrix.test.mts` — add the test below. Do not change the existing three tests.

### Do not touch this phase
- `supabase/migrations/20260706100002_p1_seed_data.sql` (and the loanstar copy)
- `src/lib/permissions/**`
- Any reports UI or API from Phases 1–7

The existing rbac test ("9 operational roles") does not assert reports rows; add:

```ts
test("committee and ar can view reports, view-only", () => {
  for (const role of ["ar", "committee"] as const) {
    const row = EXPECTED_DEFAULT_RBAC.find((p) => p.role === role && p.module === "reports");
    assert.ok(row, `${role} missing reports`);
    assert.equal(row!.view, true);
    assert.equal(row!.create, false);
    assert.equal(row!.edit, false);
    assert.equal(row!.delete, false);
    assert.equal(row!.executeTrigger, false);
  }
});
```

### Verify
- [ ] Re-run the permissions SQL: committee `can_view=true`, others false.
- [ ] Log in as `committee@loanstar.local`: `/reports` loads, collections non-zero, Accounts list non-zero.
- [ ] `npx tsx --test src/lib/reports/__tests__/rbac-matrix.test.mts`

---

## Phase 9 — End-to-end check

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
- [ ] Five tabs: Snapshot, Accounts, Past due, Collections, Pipeline.
- [ ] Period survives every tab change.
- [ ] Sidebar still has **one** Reports item.
- [ ] Combined summary: files changed, migration name/version, tests, leftover (Staff still on Snapshot, `scope.ts` unused, Assistant still placeholder, legacy `aggregates` income/collection functions still used by the dashboard widget in `src/lib/dashboard/aggregates.ts` — do not delete them).

---

## Spec coverage

| Decision | Phase |
|---|---|
| Fix approval rate, active loans, period on posted collections | 1 |
| Remove leftover snapshot cards | 1 |
| In-page 5-tab chrome, not header tabs, not sidebar children | 2 |
| Accounts = Loans \| Borrowers | 3 |
| Past due = PAR names, exclude paid | 4 |
| Collections pack period-scoped | 5 |
| Pipeline pulled off Snapshot | 6 |
| KPI → register | 7 |
| Committee reports:view in schema | 8 |
| Staff tab / AI / forecast list / agency pack | Out of scope |

---

## Placeholder / consistency check

- No TBD. `POST_APPROVAL_STATUSES` has a confirm-before-ship note for negotiation statuses.
- `aging=par30` is defined in Phase 4 so Phase 7 does not invent it.
- Service-role + `reports:view` on every new route, matching `dashboard/route.ts`.
- `createServiceClient` stays out of modules imported by client pages (type-only imports only).
