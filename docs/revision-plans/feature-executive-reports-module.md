# Feature — Executive Reporting & Analytics Module

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- **Reuse the existing chart kit** (`src/components/dashboard/charts`) and the existing UI primitives (`@/components/ui`). Do NOT add a charting library — Recharts is already installed and themed.
- Execute phases in order. Each phase must leave the app green (`npx tsc --noEmit` clean, existing tests passing) before the next starts.
- Migrations are applied via Supabase MCP `apply_migration`, then the local file is **renamed to match `list_migrations` output exactly** (the MCP stamps its own apply-time version), and copied into **both** `supabase/migrations/` and `loanstar/supabase/migrations/` (this repo's two-folder convention — both are currently in sync at 115 files as of 2026-08-17).
- Where a phase note says "confirm before implementing," actually check first — do not assume.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, migration(s) applied, tests run/result.

---

## Background (decided scope)

The Reports module is to be upgraded from a static four-panel summary into an executive-level analytics dashboard, ahead of a client/management presentation. An AI layer will be integrated into this page in the near future.

Decisions taken before this plan was written:
- **Demo data will be rescaled and reseeded first** (full option: amounts, names, date spread, and a realistic aging distribution).
- **All four executive themes are in scope**: money & collections, risk & portfolio quality, origination funnel & speed, staff productivity.
- The AI integration is a *design constraint now*, not a later phase: metrics must be defined in a typed registry with machine-readable definitions and period-over-period deltas, so an LLM can narrate and drill through without re-deriving anything.

---

## Audit findings (verified 2026-08-17, against live project `acopcwlhkovssjnrqygk`)

### Current state of the module

| File | Lines | What it does |
|---|---|---|
| `src/app/reports/page.tsx` | 239 | Client page: 4 KPI tiles + 4 card panels (pipeline, aging, income, collection) + TAT list. CSS `prog` bars only. |
| `src/app/api/reports/dashboard/route.ts` | 15 | `GET`, gated `requireModulePermission("reports","view")`, delegates to `buildExecutiveSummary`. |
| `src/lib/reports/aggregates.ts` | 227 | `buildAgingReport` / `buildPipelineReport` / `buildIncomeReport` / `buildCollectionReport` / `computeTatFromHistories` / `buildExecutiveSummary`. |
| `src/lib/reports/rbac-matrix.ts` | 41 | Static reference data (expected RBAC grid). Not used by the dashboard route. |
| `src/lib/reports/triggers.ts` | 186 | Static workflow-trigger catalog. Not used by the dashboard route. |

No date filtering, no period-over-period comparison, no export, no drill-through, no role scoping. Everything is all-time and unfiltered.

### 1. Recharts is ALREADY installed, themed, and in use — do not add a library

`package.json` includes `recharts: ^3.9.2`. A complete Meridian-themed chart kit already exists at **`src/components/dashboard/charts/index.tsx`**, exporting:

- `BarMini` (vertical bars, optional stacking, optional line overlay)
- `HBarMini` (horizontal stacked bars, one row per category)
- `LineMini` (single/multi-line trend)
- `DonutMini` (named slices)
- `SparkMini` (axis-less sparkline for KPI rows)

with the palette and axis/tooltip tokens in `src/components/dashboard/charts/theme.ts` (`CHART`, `CATEGORY_COLORS`, `AXIS_TICK`, `TOOLTIP_STYLE`). Already consumed by `src/components/dashboard/widgets/{money,pipeline,system}.tsx`.

**Consequence:** every chart in this plan is built from these five primitives. Any new primitive needed (see Phase 2, the one exception) is added *to this kit*, not to the reports folder.

### 2. LIVE BUG — Committee sees silent ₱0.00 on the existing reports page

Verified via `pg_policies` and `role_module_permissions`:

```
postings_select  → is_super_admin() OR has_module_permission('accounting_ar','view')
                                    OR has_module_permission('collection','view')
                                    OR <borrower-owns-row>
penalties_select → is_super_admin() OR accounting_ar|collection|remedial 'view'
```

The `reports` module slug is **not** in either policy. Roles holding `reports:view`:

| role | reports:view | has ar/collection/remedial view? | result today |
|---|---|---|---|
| `super_admin` | ✅ | (RLS bypass) | correct |
| `ar` | ✅ | ✅ `accounting_ar` | correct |
| `committee` | ✅ | ❌ none | **₱0.00 posted collections and ₱0.00 penalties, no error** |

`buildIncomeReport` uses `createClient()` (the caller's token), so RLS silently returns zero rows rather than erroring. This is the same silent-RLS-read class of bug already fixed this month for CIG, Committee, and the AR DCRR queue.

**Decision for this plan:** the reports aggregates are read-only, already gated at the app layer by `requireModulePermission("reports","view")`, and are aggregate-only (never row-level PII lists without an explicit drill-through permission check). They must therefore run under **`createServiceClient()`**, not the caller's token. Per-row RLS is the wrong tool for a portfolio aggregate. Role scoping (e.g. a collector seeing only their own accounts) is applied explicitly in the query layer in Phase 6, not left to RLS.

### 3. The demo data is unusable for an executive presentation — this is the #1 risk

| Check | Value | Why it breaks the demo |
|---|---|---|
| Portfolio outstanding | **₱1,048,924,862.35** across 28 accounts | ₱45M average loan. Obviously fake. |
| Largest accounts | `Demo30 Seafarer` **₱354,750,000** ×3, tagged `segment: sme` | Absurd amount; name/segment contradict each other. |
| Typical seafarer loan | **₱12,900,000** ×~20 accounts | A seafarer OFW loan is realistically ₱50k–₱500k — 25–250× too large. |
| Borrower names | `Demo15 Seafarer` … `Demo37 Seafarer` | Reads as placeholder data on screen. |
| Date spread | All activity in Jul–Aug 2026; **~95% in Aug** | Trend line = 2 bars. **Vintage analysis is impossible** (2 cohorts, one has 1 loan). |
| Aging distribution | 27 `current`, 1 `91+` **with ₱0.00 balance** | PAR = 0%. Entire risk section renders empty. |
| Thin tables | `penalties` 2, `leads` 6, `remedial_turnovers` 2 | Penalty income, funnel top, recovery rate all near-blank. |

Row counts overall: `audit_events` 1042, `amortization_schedules` 238, `borrowers` 62, `loan_applications` 60, `postings` 48, `payments` 45, `dcr` 36, `masterlist` 28, `committee_votes` 23, `leads` 6, `remedial_turnovers` 2, `penalties` 2.

### 4. The existing chart palette FAILS accessibility validation

`CATEGORY_COLORS` in `charts/theme.ts` is `[#0D9488, #23539E, #178A50, #B96A00, #C2362F, #B9CBE7]`. Run through the palette validator against a light surface:

```
[FAIL] Lightness band      #B9CBE7 at L 0.838 — outside band
[FAIL] Chroma floor        #B9CBE7 chroma 0.044 — reads as gray
[FAIL] CVD separation      #B96A00 ↔ #178A50  ΔE 6.0 (protanopia)
[FAIL] Normal-vision floor #C2362F ↔ #B96A00  ΔE 11.6 — below 15
[WARN] Contrast vs surface #B9CBE7 at 1.6:1
```

Two of these matter enormously here. `#B96A00` (warning) ↔ `#178A50` (success) are near-identical to a protanope — roughly 1 in 12 men. And `#C2362F` (danger) ↔ `#B96A00` (warning) at ΔE 11.6 are hard to separate **even with full colour vision** — which is exactly the amber/red pairing an aging or risk panel leans on.

A reordered six-slot palette passes every check:

```
#0D9488  teal    (brand primary, unchanged)
#B96A00  amber
#23539E  blue
#C2362F  red
#7C3AED  violet   (new — replaces the unusable #B9CBE7)
#178A50  green
```

```
[PASS] Lightness band      all 6 inside L 0.43–0.77
[PASS] Chroma floor        all 6 >= 0.1
[PASS] CVD separation      worst adjacent ΔE 13.9 (protan) · 11.5 (tritan)
[PASS] Normal-vision floor worst adjacent ΔE 21.3
[PASS] Contrast vs surface all 6 >= 3:1
→ ALL CHECKS PASS
```

The fix is ordering plus one substitution — the brand teal stays in slot 1 and no existing dashboard widget changes colour identity for its first two series. The app has **no dark mode** (zero `prefers-color-scheme` / `[data-theme]` rules in `src/app/globals.css`), so only the light surface needs validating. If dark mode is ever added, `#23539E` must be re-stepped lighter.

### 5. `amortization_schedules` supports genuine forecasting

`amortization_schedules(id, masterlist_id, installment_no, due_date, amount_due, penalty_amount, amount_paid, status, paid_at, rolled_at, rolled_into_installment_no)` — 238 rows. Future-dated unpaid installments are directly summable into a projected-inflow figure. **This is the single most impressive panel available** and nothing else in the demo can be faked from a spreadsheet.

### 6. Exact column names for the tables this plan touches

```
postings                 id, dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at
assignments              id, masterlist_id, collector_user_id, assigned_by, assigned_at, remedial_user_id, remedial_assigned_at
committee_votes          id, loan_application_id, voter_id, vote, voted_at, comment
denial_notices           id, loan_application_id, committee_action_id, created_at, informed_at, informed_by
application_cancellations id, loan_application_id, reason, cancelled_by, created_at
remedial_turnovers       id, masterlist_id, from_collector_id, to_remedial_user_id, confirmed_by, turnover_reason, confirmed_at, created_at
penalties                id, masterlist_id, amortization_schedule_id, amount, rate_applied, calculated_at, notes
leads                    id, agent_user_id, borrower_name, business_name, borrower_id, application_id, status, created_at, updated_at
```

Note `denial_notices` carries **no reason text** — only `committee_action_id`. **Confirm before implementing** whether `committee_actions` holds a usable denial reason; if not, denial reasons come from `committee_votes.comment` and the panel must be labelled accordingly.

### 7. `profiles` RLS gap applies to every staff-name lookup

`profiles_select_own` only permits reading your own row. Any staff scorecard resolving `collector_user_id` / `voter_id` / `posted_by` → display name **must** go through `createServiceClient()`. This has already bitten CIG, Committee, and the AR DCRR queue; do not repeat it.

---

## Scope decision

Eight phases. Phase 0 is the highest-value work and must land first — every later panel renders Phase 0's output. Phases 2–5 are independently shippable and can be reordered if the presentation date forces triage; if only two can land, ship **Phase 2 (money)** and **Phase 4 (origination)**, which have the strongest data behind them.

---

## Phase 0 — Demo data remediation

**Goal:** every peso figure, name, and date on the dashboard is credible, and the aging/vintage/trend panels have something real to show.

### Critical safety constraints

1. **Never touch real accounts.** Preserve at minimum `rvckmlnrmsnt@gmail.com` and `rovickromasanta.startuplab@gmail.com` and their applications/masterlist rows (including account `AN300004`, borrower "rovick romasanta"). Scope every write to rows whose `borrowers.first_name`/`masterlist.borrower_name` matches `Demo%`. Print an explicit affected-row count and require confirmation before writing.
2. **This is a one-off data script, NOT a migration.** Put it at `scripts/reseed-demo-data.ts`, run with `npx tsx scripts/reseed-demo-data.ts`. It must never run against production automatically. (`tsx` is already a devDependency; there is no `scripts/` folder yet — create it.)
3. **The reseed must be derivational, not a column-by-column `UPDATE`.** This is the trap that will silently break the demo: if you rewrite `masterlist.total_loan` without regenerating everything downstream, the borrower's account-ledger page — which currently works correctly — will start contradicting the dashboard. For each demo account, in order:
   1. pick a realistic principal for the segment,
   2. regenerate `amortization_schedules` from it (installments, `due_date`, `amount_due`),
   3. mark a plausible number of early installments paid, generating matching `payments` + `dcr`/`dcr_items` + `postings` rows with `posted_at` on believable dates,
   4. set `masterlist.outstanding_balance = total_loan − SUM(postings.amount)`,
   5. derive `aging_bucket` from the oldest unpaid `due_date` — do not set it independently.

### Target shape

| Dimension | Target |
|---|---|
| Seafarer principal | ₱50,000 – ₱500,000 |
| SME principal | ₱500,000 – ₱5,000,000 |
| Borrower names | Realistic Filipino names; drop the `Demo##` prefix. Keep `segment` consistent with the name/profile. |
| Release dates | Spread across **≥12 months** ending at the current month — this is what unlocks trend + vintage. |
| Aging spread | Roughly 70% `current`, 12% `1-30`, 8% `31-60`, 5% `61-90`, 5% `91+`, each with a **non-zero** balance. |
| Penalties | Generate rows for genuinely overdue installments so penalty income is non-trivial. |
| Leads | Seed ~40–60 so the funnel's top stage isn't 6. |
| Remedial turnovers | ~4–6 with partial post-turnover recovery, so recovery rate is computable. |

**Verify at the end of Phase 0:** total portfolio outstanding lands in a believable range (low tens of millions, not ₱1.05B); `SELECT` the account ledger for two reseeded borrowers via the existing borrower page and confirm the schedule, payments, and balance agree.

---

## Phase 1 — Metric registry + period plumbing (the AI-ready foundation)

**Goal:** one typed, testable, machine-readable definition of every number the dashboard shows. No UI change yet.

### Files to change

1. **New `src/lib/reports/metrics/types.ts`**

```ts
export type MetricUnit = "php" | "count" | "percent" | "days";
export type MetricDirection = "up_good" | "down_good" | "neutral";
export type MetricTheme = "money" | "risk" | "origination" | "staff";

/** Static, human- and LLM-readable definition. Never contains a value. */
export type MetricDef = {
  id: string;            // stable dot-namespaced key, e.g. "money.collected"
  label: string;         // UI label
  description: string;   // ONE plain sentence — this is what the AI reads
  formula: string;       // plain-English derivation, e.g. "SUM(postings.amount) in period"
  unit: MetricUnit;
  direction: MetricDirection;
  theme: MetricTheme;
};

/** A computed value for one period, with its own prior-period comparison. */
export type MetricValue = {
  id: string;
  value: number;
  prior: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;   // null when prior is 0 or null — never Infinity
};

export type Period = { from: string; to: string }; // inclusive ISO dates
```

2. **New `src/lib/reports/metrics/registry.ts`** — `export const METRICS: MetricDef[]`, the single source of truth. Every metric added in Phases 2–5 registers here. Export `getMetric(id)` and `metricsByTheme(theme)`.

3. **New `src/lib/reports/period.ts`** — pure helpers, unit-tested:
   - `parsePeriod(searchParams): Period` (default: current month-to-date)
   - `priorPeriod(p: Period): Period` — same length, immediately preceding
   - `computeDelta(value, prior): { deltaAbs, deltaPct }` — must return `deltaPct: null` when `prior` is `0` or `null`, never `Infinity` or `NaN`

4. **New `src/lib/reports/__tests__/period.test.mts`** — cover month boundaries, leap day, single-day periods, and the divide-by-zero delta case. Follow the existing `.test.mts` + `node:test` style already used in `src/lib/reports/__tests__/`.

**Do not** delete `aggregates.ts` in this phase — Phases 2–5 migrate its functions across one theme at a time, so the page keeps working throughout.

---

## Phase 2 — Money & collections

**Goal:** the money story, including the forecast panel.

### Metrics to register

| id | Derivation | Unit |
|---|---|---|
| `money.released` | `SUM(masterlist.total_loan)` for accounts released in period | php |
| `money.receivable` | `SUM(amortization_schedules.amount_due + penalty_amount)` | php |
| `money.collected` | `SUM(postings.amount)` where `posted_at` in period | php |
| `money.outstanding` | `SUM(masterlist.outstanding_balance)` | php |
| `money.collectionEfficiency` | `collected in period ÷ due in period` (due = schedules with `due_date` in period) | percent |
| `money.penaltyIncome` | `SUM(penalties.amount)` where `calculated_at` in period | php |
| `money.avgDaysToCollect` | mean(`postings.posted_at − amortization_schedules.due_date`) | days |
| `money.projected30` / `projected60` / `projected90` | `SUM(amount_due + penalty_amount − amount_paid)` for `status <> 'paid'` and `due_date` within N days of today | php |

### Chart forms

- **Released → receivable → collected → outstanding**: four hero stat tiles in a row, plus **one** `HBarMini` showing collected vs outstanding as segments of total receivable. Do **not** build a floating-waterfall component — there is no primitive for it and a stacked bar tells the same story honestly.
- **Cash-in trend**: `LineMini`, monthly buckets, single series. Requires Phase 0's date spread.
- **Collection efficiency**: hero percentage + `SparkMini` beneath it.
- **Projected inflow 30/60/90**: three stat tiles. Three ordered values is not a chart.

> **Hard rule — no dual-axis.** Do not overlay collection-efficiency % onto the cash-in peso trend. Two measures on two y-scales is the single most common charting error. Ship two adjacent charts instead.

### Files to change

- `src/lib/reports/metrics/money.ts` (new) — one exported `computeMoneyMetrics(supabase, period)` plus its series builders.
- `src/lib/reports/metrics/registry.ts` — register the money defs.
- `src/app/api/reports/dashboard/route.ts` — switch to `createServiceClient()`, accept `?from=&to=`, return `{ period, metrics, series, generatedAt }`.
- `src/components/reports/MoneyPanel.tsx` (new).
- `src/app/reports/page.tsx` — mount the panel; leave the other legacy cards untouched this phase.

---

## Phase 3 — Risk & portfolio quality

### Metrics

| id | Derivation |
|---|---|
| `risk.par30` | `SUM(outstanding_balance)` where `aging_bucket IN ('31-60','61-90','91+')` ÷ total outstanding. **Document the convention in `formula`** — PAR>30 means more than 30 days late, so the `1-30` bucket is excluded. |
| `risk.par90` | same for `aging_bucket = '91+'` |
| `risk.top10Concentration` | `SUM(top 10 outstanding_balance)` ÷ total outstanding |
| `risk.remedialRecoveryRate` | `SUM(postings.amount` after `remedial_turnovers.confirmed_at)` ÷ outstanding at turnover |
| `risk.rolloverCount` | `COUNT(amortization_schedules WHERE rolled_at IS NOT NULL)` |

Plus **vintage analysis**: cohort by `to_char(release_date,'YYYY-MM')`, x-axis = months on book, y = % of cohort not `current`. Cap at 6 cohorts (`LineMini` multi-series); older ones fold into "Other" — never generate a 7th hue.

### Chart forms — important correction

**Aging buckets are ordered severity, not categorical identity.** Do not paint them from `CATEGORY_COLORS`. Use a **single-hue sequential ramp, light → dark**, across the five ordered buckets, and **direct-label every bar** with its bucket name and value. Reserve red for the PAR headline number alone.

This sidesteps the amber↔red failure in finding 4 entirely: the ordering is carried by lightness (which every viewer sees identically, including monochrome print), and the labels mean colour is never the only channel.

- Aging: `HBarMini`, sequential ramp, direct-labelled.
- Top 10 exposures: `HBarMini`, ranked. **Colour follows the entity, not the rank** — re-filtering must not repaint the survivors.
- Concentration by `manning_agency` / `portfolio_id` / `segment`: `DonutMini` when ≤5 slices, else `HBarMini`.
- Vintage: `LineMini`, one line per cohort, legend present.

---

## Phase 4 — Origination funnel & speed

### Metrics

- `origination.conversionRate` — released ÷ leads created, in period
- `origination.approvalRate` — approved ÷ (approved + denied)
- `origination.avgTimeToDecision` — extend the existing `computeTatFromHistories`
- `origination.slaBreaches` — count of applications exceeding target per stage
- `origination.avgApprovedAmount`, `origination.avgTerm`

### Panels

- **Funnel**: ordered `HBarMini` — leads → draft → submitted → documents_pending → for_verification → for_approval → approved → lra_pending → released → loan_active, each row direct-labelled with count **and drop-off % from the prior stage**. The drop-off number is the insight; the bar is only its shape.
- **TAT vs target**: `HBarMini` per stage with a target reference line. Reuse `TAT_PAIRS` from `aggregates.ts` — do not redefine the stage pairs.
- **Stuck files**: a `Table` of applications whose time-in-current-status exceeds target, with a drill-through link to the application. This table is the one panel management will actually act on — put it above the fold of the origination section.
- **Denial & cancellation reasons**: `HBarMini`. Confirm the `denial_notices` reason source first (finding 6).
- **Mix**: segment and loan type — `DonutMini`.

---

## Phase 5 — Staff productivity

### Panels

- **Collector scorecard** (`Table`): accounts held (`assignments.collector_user_id`), amount collected (`postings` → `masterlist` → `assignments`), DCRRs submitted vs reconciled, mean submit→reconcile cycle time, and **DCRR rejection rate** (`dcr.status = 'rejected'` ÷ all non-draft) — this last one is newly meaningful now that AR can reject a DCRR and the rejection is recorded with `rejected_at` and a reason.
- **Committee participation** (`Table`): votes cast per `voter_id`, mean turnaround from the application entering `for_approval` (via `status_history`) to `voted_at`.
- **Proof-verification backlog** (`HBarMini`): `payments` in `pending_verification`, bucketed by age from `created_at` (0–1d / 2–3d / 4–7d / 7d+).

Many dimensions per row → **these are tables, not charts.** Do not force a scorecard into a bar chart.

> **`profiles` RLS:** resolve every staff display name through `createServiceClient()` (finding 7). A scorecard of blank names is the failure mode if this is missed.

---

## Phase 6 — Dashboard shell: filters, deltas, export, drill-through, scoping

- **Global date-range filter** in a single row above the charts, with presets (MTD, QTD, YTD, last 12 months, custom). Drives `?from=&to=` on the API.
- **Period-over-period deltas** rendered on every KPI tile from `MetricValue.prior` — arrow + percentage, coloured by `MetricDirection` (never assume up = good; `risk.par30` rising is bad).
- **CSV export** per panel, and **PDF export** of the whole dashboard. `pdfmake` is already a dependency and the document-template system already renders PDFs server-side — reuse that path, and heed the existing `serverExternalPackages` + PDF-determinism gotchas noted in `docs/document-template-system-plan.md`.
- **Drill-through**: every KPI links to the underlying filtered list. Where the destination is a row-level list of accounts or applications, it must re-check module permission at the destination route — the aggregate's service-role read does not authorise the detail view.
- **Role scoping**: a collector opening `/reports` sees only their assigned accounts. Implement as an explicit `WHERE` in the query layer keyed off the caller's role — not by reverting to the caller's token, which would reintroduce the finding-2 silent-zero bug.
- **Accessibility**: every chart with ≥2 series ships a legend; ≤4 series are also direct-labelled; each panel offers a table view. Identity must never be colour-alone.

---

## Phase 7 — AI-facing endpoint

**Goal:** an LLM can answer "how did collections do last quarter and why" without touching SQL or re-deriving anything.

- **New `GET /api/reports/metrics`** → `{ definitions: MetricDef[] }`. The static catalog: id, label, description, formula, unit, direction, theme. This is the semantic layer.
- **Extend `GET /api/reports/dashboard`** → also return `{ period, prior, metrics: MetricValue[] }` so every number arrives with its comparison already computed.
- Keep `description` and `formula` written for a reader who has never seen the schema. They are the prompt context; vague text here is what makes an AI narration wrong.
- Gate both behind `requireModulePermission("reports","view")`.

Deliberately **out of scope**: no LLM calls from this codebase yet, no natural-language query parsing. This phase only makes the data legible to whatever is integrated later.

---

## Palette change (applies from Phase 2 onward)

In `src/components/dashboard/charts/theme.ts`, reorder `CATEGORY_COLORS` and replace the unusable `#B9CBE7`:

```ts
export const CATEGORY_COLORS = [
  CHART.gold,     // #0D9488 teal — brand primary, slot 1 unchanged
  CHART.warning,  // #B96A00 amber
  CHART.info,     // #23539E blue
  CHART.danger,   // #C2362F red
  "#7C3AED",      // violet — replaces #B9CBE7 (failed lightness, chroma, contrast)
  CHART.success,  // #178A50 green
];
```

**Confirm before implementing:** this reorders series colours for the three existing dashboard widgets (`money.tsx`, `pipeline.tsx`, `system.tsx`). Slots 1–2 keep teal-then-warm so single- and two-series widgets are visually unchanged; check any widget using 3+ series and flag it rather than silently restyling it.

Add alongside it a sequential ramp for ordered/severity scales (aging, backlog age), single hue, light → dark — Phase 3 depends on this existing.

---

## Verification checklist (run before declaring done)

1. `npx tsc --noEmit` — clean apart from the 5 known pre-existing test-file errors (`preferences-phase4`, `preferences`, `claim` ×2, `cig/queue`).
2. All `src/lib/reports/__tests__/*.test.mts` pass.
3. Log in as **`committee@loanstar.local`** and confirm posted collections and penalties are **non-zero** — this is the regression test for finding 2.
4. Log in as `ar@loanstar.local` and `super_admin@loanstar.local`; confirm figures agree across all three roles.
5. Open a reseeded borrower's account ledger and confirm the schedule/payments/balance agree with the dashboard's portfolio totals.
6. Screenshot the dashboard at 1280px and at mobile width — check for label collisions and horizontal overflow. The validator checks colour, not layout.
