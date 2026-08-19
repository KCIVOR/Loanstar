# Feature — AI Executive Insights (LoanBot brief + trend skills)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Run **one phase at a time** and review the summary before starting the next.

**Goal:** Give the CEO and Committee an AI-generated executive brief at `/reports/insights` covering the seven capabilities in the approved proposal, and make the existing chat drawer able to answer trend, bottleneck, and staff-performance questions it cannot answer today.

**Core architecture decision:** The model never emits a number. Skills produce an evidence bundle (real pesos, percentages, trend arrays). The model receives that bundle and returns **only judgment** — headline, per-section verdict, prose, ranked recommendations — conforming to a strict JSON schema via OpenAI structured outputs. Every figure, table, chart, and delta arrow on screen is rendered by React from the evidence bundle. A hallucinated peso figure becomes structurally impossible rather than something we prompt against.

**Tech stack:** Next.js App Router, existing `config_settings` AI config, `createServiceClient()`, OpenAI Chat Completions with `response_format: json_schema`, recharts primitives already in `src/components/dashboard/charts`, node:test (`.mts`).

---

## Ground rules (apply to every phase)

- **Closed allowlist.** Each phase has **Allow** and **Do not touch**. If a file is not on Allow, do not edit it. Importing is fine. If another file is required, stop and flag.
- After each phase, `git status` — every changed path must be on that phase's Allow list.
- Do not rename, refactor, or clean up adjacent code except the exact behavior the phase names.
- Reuse `@/components/ui` and `@/components/dashboard/charts`. Do not add a charting or AI SDK dependency.
- Fetch/compute split: every module exposes a **pure** compute function over already-fetched rows, plus a thin fetch wrapper. Tests target the pure function with fixtures. This matches `src/lib/dashboard/buckets.ts`.
- `npx tsc --noEmit` no worse than known pre-existing errors; `npm test` green after every phase.
- **Do not commit** unless the user explicitly asks.
- Migrations go through Supabase MCP `apply_migration`, then copy the stamped file into **both** `supabase/migrations/` and `loanstar/supabase/migrations/`.

## Global freeze (no phase may edit unless its Allow list names the file)

- `src/components/reports/{MoneyPanel,RiskPanel,StaffPanel,OriginationPanel}.tsx`
- `src/lib/reports/metrics/{money,risk,origination,registry,types}.ts` — import only
- `src/lib/reports/{aggregates,scope,triggers,csv,period,registers,register-queries,collections-register}.ts` — import only
- `src/lib/dashboard/**`, `src/components/dashboard/**` — import only
- `src/middleware.ts`, `src/lib/permissions/server.ts`
- Collector / AR / CSA / Committee / CIG / LRA / Remedial pages and APIs
- `src/app/reports/page.tsx` — the Snapshot page keeps its current layout and drawer

## Out of scope (do not build)

- Anthropic / Gemini / multi-provider switch. OpenAI only.
- Streaming tokens, vector RAG, ML forecasting.
- Skills that write data, run SQL, or read individual committee votes.
- Server-side PDF generation. Print uses the existing `window.print()` + `no-print` path.
- Scheduled or emailed briefs.
- Rewriting the chat drawer UI. Phase 5 fixes the truncation defect behind it, nothing visual.

---

## Audit (verified 2026-08-19 against live project via Supabase MCP)

### The gap this plan fills

| Proposal capability | Exists today | Missing |
|---|---|---|
| Portfolio performance trends | `buildCashInTrend` (monthly collections, UI only, not exposed to the AI) | Every other trend |
| Collection performance analysis | Period KPIs, `list_collections`, collector scorecard | Efficiency over time; staff figures are all-time, not period-scoped |
| Delinquency risk indicators | PAR30/90, aging, vintage — all "as of now" | PAR over time, roll rates |
| Approval trend monitoring | Single all-time `origination.approvalRate` | Approval rate over time |
| Operational bottlenecks | Origination stuck files, TAT vs target | CIG, LRA, negotiations, holds, AR queue |
| Executive summary dashboards | `/reports` Snapshot + `get_snapshot` | No composed narrative artifact |
| Actionable recommendations | Prompt asks for a "bottom line" | No grounded recommendation structure |

**Root cause:** all eight existing skills are point-in-time snapshots. Only five money metrics carry a prior-period comparison (`computeMoneyMetrics` calls `priorPeriod` + `computeDelta`; risk and origination hardcode `prior: null`).

### Live data depth (informs what will actually render)

| Source | Range | Months | Rows |
|---|---|---|---|
| `postings` | 2025-10-07 → 2026-08-18 | 11 | 182 |
| `masterlist.release_date` | 2025-09-15 → 2026-08-18 | 12 | 31 |
| `leads` | 2025-09-07 → 2026-08-20 | 12 | 63 |
| `amortization_schedules.due_date` | 2025-10-10 → 2028-07-10 | 34 | 324 |
| **`loan_applications`** | **2026-07-23 → 2026-08-19** | **2** | 64 |
| **`committee_actions`** | **2026-07-23 → 2026-08-18** | **2** | 39 |

**Consequence:** money, collections, PAR and release trends have real 11–12 month depth. Approval and pipeline trends have **two months**. Every trend module must return a `coverage` field so the brief states this rather than drawing a line through empty months.

### Bottleneck tables confirmed to exist and hold data

`verifications` 17, `checks_recorded` 86, `release_files` 33, `release_queue` 14, `negotiations` 36, `file_holds` 5, `ar_queue` 12, `briefings` 13, `callbacks` 4. None are read by the reports module today.

### Reusable assets confirmed

| Need | Reuse |
|---|---|
| Time bucketing | `bucketByMonth`, `bucketByWeek`, `averageDays`, `SeriesPoint` from `src/lib/dashboard/buckets.ts` — pure, no Supabase |
| Charts | `LineMini`, `BarMini`, `DonutMini`, `RankedBarMini`, `SparkMini` from `src/components/dashboard/charts` (recharts 3.9.2). `SparkMini` is defined but unused anywhere — ready to wire |
| UI | `KpiCard`, `Card`, `Table`/`Th`/`Td`, `Badge`, `Alert`, `EmptyState`, `Spinner`, `PageHeader` from `src/components/ui` |
| Print | `globals.css` `@media print` hides `aside`, `header`, `.no-print`. `window.print()` button pattern on `src/app/reports/page.tsx` |
| Tab registration | Append to `REPORT_TABS` in `src/lib/reports/tabs.ts`; `ReportsChrome` reads it dynamically and preserves `from`/`to` |
| RLS pattern | `supabase/migrations/20260819002122_reports_assistant_threads.sql` |

### Known defect this plan must fix

`cap()` in `src/lib/reports/assistant/loop.ts` slices `JSON.stringify(result)` at 8,000 chars mid-object, producing invalid JSON with no marker. Measured today: `get_catalog` is 6,677 chars (83% of budget), a 50-row `list_accounts` is 15,851 chars. Trend arrays make this worse, so Phase 5 must fix it.

---

## Data flow

```
CEO opens /reports/insights, clicks Generate
  → POST /api/reports/insights { period }
  → reports:view gate; 503 if AI disabled or key missing
  → buildEvidenceBundle(): runs trends + bottlenecks + staff + snapshot skills
  → ONE OpenAI call, response_format json_schema strict, temperature 0.2
  → model returns judgment only (headline, verdicts, prose, recommendations)
  → server validates every recommendation cites a real evidence key
  → persist { period, evidence, brief } to reports_insight_briefs
  → page renders numbers from evidence, prose from brief
```

Chat drawer keeps its own loop and reads the same skill layer, so Phases 1–5 improve it for free.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/reports/trends/inputs.ts` | One batched read of masterlist / schedules / postings / committee_actions |
| `src/lib/reports/trends/portfolio.ts` | Pure: outstanding, released, active loans by month |
| `src/lib/reports/trends/collections.ts` | Pure: collected vs due, efficiency by month |
| `src/lib/reports/trends/delinquency.ts` | Pure: PAR30 / PAR90 / aging reconstructed by month |
| `src/lib/reports/trends/approvals.ts` | Pure: approval rate and decision volume by month |
| `src/lib/reports/trends/index.ts` | `buildTrendBundle(supabase, months)` |
| `src/lib/reports/bottlenecks/sources.ts` | Fetch the six queue sources |
| `src/lib/reports/bottlenecks/rank.ts` | Pure: normalize + severity rank |
| `src/lib/reports/bottlenecks/index.ts` | `buildBottleneckReport(supabase)` |
| `src/lib/reports/metrics/staff.ts` | Add period scoping + agent / CIG / LRA / remedial scorecards |
| `src/lib/reports/assistant/skills/` | Split of today's `skills.ts` + `get_trends`, `get_bottlenecks`, per-skill budgets |
| `src/lib/reports/insights/evidence.ts` | Assemble the numeric bundle |
| `src/lib/reports/insights/schema.ts` | Strict JSON schema + TS types |
| `src/lib/reports/insights/generate.ts` | Single structured-output model call + grounding validation |
| `src/app/api/reports/insights/route.ts` | POST generate, GET latest/list. `maxDuration` set |
| `src/app/reports/insights/page.tsx` | The page |
| `src/components/reports/insights/*.tsx` | BriefView, SectionCard, RecommendationList, TrendChart |
| `src/lib/reports/tabs.ts` | Register the tab |
| Migration `reports_insight_briefs` | Persistence |

---

## Phase 1 — Trend inputs + portfolio and collections series

**Allow:** create `src/lib/reports/trends/{inputs,portfolio,collections}.ts`, `src/lib/reports/trends/types.ts`, `src/lib/reports/trends/__tests__/{portfolio,collections}.test.mts`

**Do not touch:** skills, API routes, UI.

- [ ] `types.ts`: `TrendPoint = { month: string; label: string; value: number | null }`, `TrendSeries = { id, label, unit, points: TrendPoint[], coverage: Coverage }`, `Coverage = { requestedMonths: number; monthsWithData: number; firstMonth: string | null; note: string | null }`.
- [ ] `inputs.ts`: `fetchTrendInputs(supabase)` returns `{ loans, schedules, postings, decisions }` in one `Promise.all`. Select only the columns the pure modules need. Paginate with `.range()` in 1,000-row pages so this does not silently cap (the defect flagged in the code review).
- [ ] `portfolio.ts`: pure `computePortfolioTrend(inputs, months, now)`. Released-in-month from `release_date`; outstanding at month end as cumulative released minus cumulative postings, matching the approach already used by `buildArWidget`; active loan count at month end.
- [ ] `collections.ts`: pure `computeCollectionTrend(inputs, months, now)`. Collected-in-month from `posted_at`; due-in-month from `due_date` using `amount_due + penalty_amount`; efficiency = collected ÷ due, null when due is 0.
- [ ] Tests use inline fixture rows and a fixed `now`, following `src/lib/reports/metrics/__tests__/origination.test.mts`. Cover: empty input returns all-null points with `monthsWithData: 0`; a month with no postings yields 0 collected not null; efficiency is null when nothing was due.

**Done when:** `npm test` green. Nothing else in the app imports these yet.

## Phase 2 — Delinquency reconstruction + approval trend

**Allow:** create `src/lib/reports/trends/{delinquency,approvals,index}.ts` and their tests.

**Do not touch:** everything from Phase 1's freeze.

- [ ] `delinquency.ts`: pure `computeDelinquencyTrend(inputs, months, now)`. For each month end `M`, a schedule is overdue when `due_date <= M` and `sum(postings where posted_at <= M) < amount_due + penalty_amount`. Days late = `M - due_date`. Bucket into `1-30 / 31-60 / 61-90 / 91+`, then PAR30 = overdue balance more than 30 days late ÷ outstanding at `M`, PAR90 likewise. This is the reconstruction that makes PAR history possible without a snapshot table.
- [ ] `approvals.ts`: pure `computeApprovalTrend(decisions, months, now)`. Approval rate per month from `committee_actions.action`; carry `decisions` count per point. Coverage note must read like `"Committee decisions exist only from July 2026 (2 of 6 months)."`
- [ ] `index.ts`: `buildTrendBundle(supabase, months)` fetches once and returns all four series plus a combined `coverage`.
- [ ] Tests: a schedule paid late shows overdue in the month it was late and clean afterwards; a fully paid schedule never appears; PAR is null when outstanding is 0; approval coverage reports the true first month.

**Done when:** `npm test` green; `buildTrendBundle` returns four series against the live DB when called from a scratch script (delete the script afterwards).

## Phase 3 — Bottlenecks

**Allow:** create `src/lib/reports/bottlenecks/{sources,rank,index}.ts` + tests.

- [ ] `rank.ts`: pure `rankBottlenecks(entries)` over a normalized `BottleneckEntry = { stage, label, count, oldestDays, targetDays, breached, source }`. Severity orders by `breached` first, then `oldestDays` relative to `targetDays`.
- [ ] `sources.ts`: fetch and normalize six sources — origination stuck files (reuse `computeOriginationMetrics().stuckFiles`), CIG `verifications` incomplete, LRA `release_files` + `release_queue` by status age, `negotiations` unresolved, `file_holds` open, `ar_queue` pending. Reuse `TAT_PAIRS` targets from `aggregates.ts` where a stage maps to one; otherwise define the target in `sources.ts` next to the query and comment why.
- [ ] `index.ts`: `buildBottleneckReport(supabase)` returns `{ entries, worst, totalBreached }`.
- [ ] Tests cover `rank.ts` only (pure). Source fetching is exercised in Phase 6.

**Done when:** `npm test` green.

## Phase 4 — Staff breadth and period scoping

**Allow:** `src/lib/reports/metrics/staff.ts`, `src/lib/reports/metrics/__tests__/staff.test.mts`

**Do not touch:** other metric modules, `StaffPanel.tsx`.

- [ ] Add an optional `period` parameter to `computeStaffMetrics`. Collector `amountCollected` currently sums **all-time** postings regardless of the selected period — scope it when `period` is passed, and keep the unscoped total as `amountCollectedAllTime` so `StaffPanel` keeps working unchanged.
- [ ] Add scorecards: agents (from `leads.agent_user_id` + conversion), CIG (from `verifications` completion time and `checks_recorded` pass rate), LRA (from `release_files` throughput and approval-to-release days), remedial (from `assignments.remedial_user_id` + `remedial_turnovers` recovery).
- [ ] Extract each scorecard into its own exported pure builder over fetched rows so the file stays navigable and testable.
- [ ] Tests for the pure builders with fixtures.

**Done when:** `npm test` green and `/reports` Staff panel renders identically to before.

## Phase 5 — Skill layer: split, extend, fix truncation

**Allow:** create `src/lib/reports/assistant/skills/` (`index.ts`, `defs.ts`, `budget.ts`, `handlers/*.ts`); delete `src/lib/reports/assistant/skills.ts`; update `src/lib/reports/assistant/loop.ts`, `prompt.ts`, and the assistant tests.

**Do not touch:** `route.ts`, the drawer, `threads.ts`, `config.ts`.

- [ ] Move today's eight handlers into `handlers/` unchanged in behavior. `index.ts` re-exports every symbol `skills.ts` exported so existing test imports keep resolving.
- [ ] `budget.ts`: `fitToBudget(payload, budget)` trims **rows** and returns `{ payload, omitted }` with valid JSON, replacing the string slice in `loop.ts`. Each skill declares its own budget. Skill results carry an explicit `omitted` count the model can report.
- [ ] Remove `cap()` from the tool-result path in `loop.ts`. Keep it for the final reply text only.
- [ ] Add `get_trends` — args `{ series: "portfolio" | "collections" | "delinquency" | "approvals", months?: number }`, months default 6 and clamped to 12. Returns the series plus `coverage`.
- [ ] Add `get_bottlenecks` — no args. Returns ranked entries.
- [ ] Update `prompt.ts`: move per-skill routing hints out of the prose and into each tool `description` (they duplicate and have already drifted — the prompt claims all `list_*` take `q` but `list_collections` does not). Prompt keeps voice and format rules only. Replace `"Never say you are an AI"` with a rule against architecture talk and filler hedging, which is the actual intent.
- [ ] Lower `temperature` to 0.2 in `loop.ts`.
- [ ] Tests: `fitToBudget` keeps JSON parseable and reports the right `omitted`; tool defs still equal `ACTIVE_SKILL_NAMES`; the new skills appear in `openaiToolDefs()`.

**Done when:** `npm test` green and the chat drawer answers a trend question end to end.

## Phase 6 — Brief generator

**Allow:** create `src/lib/reports/insights/{evidence,schema,generate}.ts` + tests.

- [ ] `schema.ts`: TS types and the matching JSON Schema, `strict: true`, `additionalProperties: false` throughout.

```ts
type ExecutiveBrief = {
  headline: string;
  sections: Array<{
    id: "portfolio" | "collections" | "delinquency" | "approvals" | "bottlenecks" | "staff";
    title: string;
    verdict: "good" | "watch" | "action";
    summary: string;
    highlights: string[];
  }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    why: string;
    evidenceKeys: string[];
  }>;
  dataNotes: string[];
};
```

- [ ] `evidence.ts`: `buildEvidenceBundle(supabase, period)` composes snapshot + four trend series + bottlenecks + staff into a flat, addressable map so `evidenceKeys` can reference real entries (for example `trend.delinquency.par30`, `bottleneck.cig`, `staff.collectors`). Include every `coverage` note.
- [ ] `generate.ts`: one OpenAI call at temperature 0.2 with the bundle as a system-supplied JSON document. Then `validateGrounding(brief, bundle)` drops any recommendation whose `evidenceKeys` do not all exist in the bundle, and records the drop. A recommendation that is not grounded in a real number never reaches the page.
- [ ] Tests: schema round-trips; `validateGrounding` drops an ungrounded recommendation and keeps a grounded one; a stubbed `fetch` returning malformed JSON surfaces a clean error rather than throwing.

**Done when:** `npm test` green.

## Phase 7 — Persistence + API

**Allow:** MCP `apply_migration` named `reports_insight_briefs`; both migration folders; create `src/app/api/reports/insights/route.ts`.

- [ ] Migration, mirroring the threads table but **shared** rather than per-user, since a brief is a company artifact:

```sql
CREATE TABLE public.reports_insight_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_from date NOT NULL,
  period_to date NOT NULL,
  model text NOT NULL,
  evidence jsonb NOT NULL,
  brief jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_insight_briefs_created
  ON public.reports_insight_briefs (created_at DESC);

ALTER TABLE public.reports_insight_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_insight_briefs_select ON public.reports_insight_briefs
  FOR SELECT TO authenticated
  USING (is_super_admin() OR has_module_permission('reports', 'view'));
```

Writes go through `createServiceClient()` from the route, matching the threads pattern.

- [ ] Copy the stamped file into both migration folders.
- [ ] Route: `export const maxDuration = 60` (no reports route sets this today and generation takes 10–25s). `POST` gates on `reports:view`, returns 503 when AI is disabled or unkeyed, generates, persists, audits with `writeAuditEvent`. `GET` returns the latest brief for the period plus the last 20 for history.

**Done when:** POST returns a validated brief and a row exists.

## Phase 8 — Page and components

**Allow:** create `src/app/reports/insights/page.tsx`, `src/components/reports/insights/*.tsx`; edit `src/lib/reports/tabs.ts`; edit `src/lib/reports/__tests__/tabs.test.mts`.

**Do not touch:** `ReportsChrome.tsx`, `src/app/reports/page.tsx`, the drawer.

- [ ] Register `{ href: "/reports/insights", label: "Insights" }` in `REPORT_TABS` and update the tabs test.
- [ ] `page.tsx`: `PageHeader` with Generate, Print and Export CSV actions (all `no-print`). Loads the latest brief for the period on mount; Generate triggers POST. `Spinner` while generating, `Alert` on error, `EmptyState` before the first brief.
- [ ] `SectionCard.tsx`: verdict drives `Card` variant and a `Badge` — good/watch/action. Renders the model's `summary` and `highlights` as prose, then the section's numbers as `KpiCard`s, then its chart.
- [ ] `TrendChart.tsx`: thin wrapper over `LineMini` mapping a `TrendSeries` to recharts data. Renders a `coverage` caption whenever `monthsWithData < requestedMonths`, so a two-month approval trend says so on the chart.
- [ ] `RecommendationList.tsx`: priority `Badge`, action, why, and the evidence it rests on.
- [ ] `BriefView.tsx` composes headline, sections, recommendations, data notes, and a generated-at footer.
- [ ] Numbers are formatted by shared helpers, never by the model.

**Done when:** the page renders a full brief, prints cleanly with app chrome hidden, and exports section tables to CSV.

## Phase 9 — Verification

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` no worse than the known pre-existing baseline.
- [ ] `npm run lint`.
- [ ] Manual: `/reports` Snapshot, Accounts, Past due, Collections, Pipeline all render unchanged; chat drawer still answers a snapshot question; Insights generates, prints, and reloads from history.
- [ ] Confirm no route outside this plan changed.

---

## Test plan for the user

1. `/reports/insights` — click Generate. Expect a headline, six verdict-colored sections with charts, and ranked recommendations.
2. Change the period in the tab bar and regenerate. Numbers must move; the approval section should state that only two months of decision history exist.
3. Print. App chrome and buttons disappear; sections stay.
4. Reload the page. The last brief loads without regenerating.
5. Open the chat drawer on `/reports` and ask "how has PAR moved over the last 6 months" — it should call `get_trends` and answer from real reconstructed history.
6. Ask "where are we bottlenecked" — it should call `get_bottlenecks` and name CIG, LRA or negotiations, not just origination.
