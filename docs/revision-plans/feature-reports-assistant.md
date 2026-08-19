# Feature — Reports assistant (tool-calling agent)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Let staff with `reports:view` (including Committee) type a question in the existing Report assistant drawer and get an answer grounded in Reports metrics. Super Admin turns it on and pastes the OpenAI API key on `/admin/config`.

**Architecture:** Question → `POST /api/reports/assistant` → `reports:view` gate → load OpenAI key via **service client** from `config_settings` → model may call allowlisted skills only → each skill runs existing `compute*` / `METRICS` helpers (no SQL from the model) → model narrates from tool JSON or refuses. No new tables. No npm AI SDK — `fetch` to OpenAI, same pattern as Twilio in `src/lib/sms/send.ts`.

**Tech Stack:** Next.js App Router, `config_settings` + existing `SECRET_KEYS` mask, `createServiceClient()`, OpenAI Chat Completions tools API, node:test (`.mts`).

---

**Ground rules (apply to every phase):**
- **Closed allowlist.** Each phase has **Allow** and **Do not touch**. If a file is not on Allow, do not edit it. Importing is fine. If another file is required, stop and flag.
- After each phase, `git diff --stat` / `git status` — every changed path must be on that phase's Allow list. Revert anything else before reporting done.
- Do not rename, refactor, or clean up adjacent code except the exact behavior the phase names.
- Reuse `@/components/ui`. Do not add `openai`, `ai`, or `@ai-sdk/*`.
- Execute phases in order. `npx tsc --noEmit` no worse than known pre-existing test-file errors; `npm test` green.
- **Do not commit** unless the user explicitly asks.
- Migrations go through Supabase MCP `apply_migration`, then copy the stamped file into **both** `supabase/migrations/` and `loanstar/supabase/migrations/`.
- At the end of all runnable phases, output one combined summary.

**Global freeze (no phase may edit these unless that phase's Allow list names the file):**
- `src/components/admin/Sidebar.tsx`
- `src/components/reports/{MoneyPanel,RiskPanel,StaffPanel,OriginationPanel}.tsx`
- `src/lib/reports/metrics/{money,risk,origination,staff,registry,types}.ts` — import only
- `src/lib/reports/{aggregates,scope,triggers,csv,period}.ts` — import only
- `src/app/api/reports/dashboard/route.ts` and `src/app/api/reports/metrics/route.ts` — leave as-is (skills call `compute*` directly, they do not HTTP these routes)
- `src/lib/dashboard/**`, `src/components/dashboard/**`
- Collector / AR / CSA / Committee / CIG / LRA / Remedial pages and APIs
- `src/middleware.ts`, `src/lib/permissions/server.ts`
- `supabase/migrations/20260706100002_p1_seed_data.sql`

**Out of scope (do not build):**
- Anthropic / Gemini / multi-provider switch (OpenAI only).
- Streaming tokens, persisted chat history table, vector RAG.
- Skills that write data, run SQL, open a committee file, read votes/comments, or export CSV.
- Building the hub register APIs (`/api/reports/accounts` etc.) — those belong to `feature-executive-reports-hub.md`. `list_*` skills stay unimplemented until that hub ships (Phase 8, blocked).
- Fixing Snapshot bugs (active-loans count, approval-rate definition). The assistant inherits whatever `compute*` returns today.
- Changing live Committee `reports` create/edit flags (see audit flag).

This plan **does** edit `AssistantDrawer.tsx`. That file is frozen in the hub plan; this file is the one that unfreezes it.

**Do not run this plan in parallel with hub phases that rewrite `src/app/reports/page.tsx` or move the drawer.** Hub Phase work that introduces `ReportsChrome` will conflict with assistant Phase 7. Finish one plan’s `page.tsx` edits, then rebase the other.

---

## Validation (2026-08-19, against live code — plan is **not** 100% as first written)

Architecture (tool-calling agent, service-client key, `config_settings`, no SDK) is correct. These defects would make “paste a key and it works” fail or make the executor ship a broken OpenAI loop. They are patched in the phases below.

| Severity | Finding | Fix in this file |
|---|---|---|
| **Critical** | Chat Completions requires the **assistant message that contains `tool_calls`** to be appended **before** `role: "tool"` results. Plan originally said only “append a tool message.” OpenAI returns 400 without that echo. | Phase 6 loop rules |
| **Critical** | Test route used `GET /v1/models`. Project/restricted keys often cannot list models but **can** chat. Test would fail, drawer would work (or the reverse). | Phase 4: tiny `chat/completions` call using the **saved** model |
| **Important** | `get_snapshot` omitted `pipeline`. Committee asking “how many files at committee?” would have no skill data. `buildExecutiveSummary` already returns `pipeline`. | Snapshot shape |
| **Important** | `METRICS` has no staff defs (`registry.ts` is money/risk/origination only). Dropping `computeStaffMetrics` is right, but the prompt must say the staff scorecard is out of reach. | System prompt |
| **Important** | Sample route threw OpenAI errors into `handleApiError` → **500**, not 502. | Phase 6 catch |
| **Important** | Test connection reads **DB**, not the password box. Unsaved key → “Save an API key first.” | Phase 4 copy |
| **Minor** | Phase 7 claimed `/reports` layout 403s without `reports:view`. False: `layout.tsx` is AppShell only; `middleware.ts` only requires login; Sidebar hides the nav item; **dashboard/assistant APIs** 403. | Phase 7 checks |
| **Minor** | File map said page passes `messages` into the drawer. Messages live in drawer state. | File map |
| **Minor** | Empty model input + `z.string().min(1)` fails Save. Default state `"gpt-4o-mini"`. | Phase 4 |

Still true after this patch: enable **and** key **and** OpenAI billing **and** outbound HTTPS. Not “key only.”

---

## Audit (verified 2026-08-19, live project via Supabase MCP + codebase)

Evidence-only. Do not re-derive from memory.

### What already exists

| Piece | Evidence |
|---|---|
| Placeholder drawer, UI only, input disabled | `src/components/reports/AssistantDrawer.tsx:28–42`, `:169–172` (`Coming soon` / `disabled`) |
| Drawer mounted on Reports page with period state | `src/app/reports/page.tsx:7`, `:73`, `:140–163`, `:369` |
| Metric catalog (AI-facing defs, no values) | `GET /api/reports/metrics` → `METRICS` from `src/lib/reports/metrics/registry.ts` |
| Dashboard values + prior period | `GET /api/reports/dashboard` (`src/app/api/reports/dashboard/route.ts`) — `requireModulePermission("reports","view")` then `createServiceClient()` |
| Metric ids | money: `released`, `receivable`, `collected`, `outstanding`, `collectionEfficiency`, `penaltyIncome`, `avgDaysToCollect`, `projected30/60/90`. risk: `par30`, `par90`, `top10Concentration`, `remedialRecoveryRate`, `rolloverCount`. origination: `conversionRate`, `approvalRate`, `avgTimeToDecision`, `slaBreaches`, `avgApprovedAmount`, `avgTerm`. |
| Superadmin config store | `config_settings` (`key` PK, `value` jsonb). Live RLS: `config_select` = `is_super_admin() OR has_module_permission('system_config','view')`; `config_write` = same with `'edit'`. |
| Secret mask pattern | `SECRET_KEYS` in `src/app/api/admin/config/route.ts:40` (`twilio_auth_token`, `cron_secret`, `smtp_password`); GET masks via `maskTwilioAuthToken`; PATCH skips masked echo via `shouldApplySecretPatch`. |
| Admin UI | `/admin/config` → `src/app/admin/config/page.tsx`; SMS card + Email (SMTP) card are the templates. |
| Server read of secrets for a role that lacks `system_config` | `createServiceClient()` — `src/lib/email/send.ts:35–36`, `src/lib/sms/send.ts:23`, `src/lib/committee/committee-size.ts:31–42`. **Must copy this.** A session-scoped read as Committee returns zero rows. |
| External API with no SDK | `src/lib/sms/send.ts` `fetch` to Twilio. |
| Reports APIs today | **Only** `dashboard` and `metrics`. No `/api/reports/accounts`, past-due, collections, or pipeline list routes. No hub register pages under `src/app/reports/` except `page.tsx` + `layout.tsx`. |
| LLM packages | **NOT FOUND** in `package.json` or `src/`. |
| AI config keys | **NOT FOUND** in live `config_settings` (22 keys; none named `reports_ai_*`). |

### Live permissions that matter

| Role | `reports` | `system_config` |
|---|---|---|
| `committee` | `view=true`, **also `create=true`, `edit=true`** | all false |
| `ar` | view-only | — |
| `super_admin` | all true | all true |
| `csa` / `borrower` | reports view false | — |

Assistant gate is `reports:view` only. Do not require create/edit. Do not grant Committee `system_config`.

**Flag (do not fix in this plan):** Committee `reports` is not view-only in live DB. Hub Phase 8 intended view-only. Leave it.

### What is missing (this plan fills)

- `config_settings` keys for enable + API key + model
- Admin Config card
- Skill runners
- `POST /api/reports/assistant`
- Live chat in the drawer

---

## Agreed loop (do not change without flagging)

```
Committee types a question
  → POST /api/reports/assistant { messages, period }
  → 401/403 if not reports:view
  → 503 if reports_ai_enabled=false or API key blank
  → Load key+model via service client (never send key to the browser)
  → Model: final answer OR call one allowlisted skill
  → Server runs the skill, appends JSON (numbers + formula)
  → Repeat until final answer, or 4 OpenAI HTTP calls (1 first + up to 3 tool follow-ups)
  → Reply JSON { reply, skillsUsed }
  → Audit: actor, truncated question, period, skillsUsed — never the API key
```

Period is the date range already on the Reports page. The model does not guess “last quarter.”

---

## Skills

**v1 active (Phase 5–7):** `get_catalog`, `get_snapshot`, `get_metric`.

**Defined, not active (Phase 8, blocked on hub):** `list_accounts`, `list_past_due`, `list_collections`, `list_pipeline`.

Do not add `run_sql`, `get_application`, `get_votes`, `get_borrower`.

### `get_catalog`

No args. Returns `{ definitions: MetricDef[] }` — same objects as `METRICS`.

### `get_snapshot`

No args (period comes from the request, not the model). Returns a **compact** payload — **not** chart `series` (too many tokens):

```ts
{
  period: Period;
  prior: Period;
  metrics: Array<MetricValue & { label: string; unit: string; formula: string }>;
  pipeline: PipelineReport; // status → count from buildExecutiveSummary; no borrower names
  aging: AgingReport;
  income: IncomeReport;
  collection: CollectionReport;
  activeLoans: number;
  tat: Array<{ label: string; averageDays: number | null; sampleCount: number }>;
  stuckFiles: Array<Pick<StuckFile, "applicationNo" | "status" | "daysInStatus" | "targetDays">>;
}
```

Omit `stuckFiles[].borrowerName` and `applicationId` in the skill result (Committee must not get a CSA deep-link from the assistant). Hub page may still show names on OriginationPanel; the assistant is stricter.

### `get_metric`

Args: `{ id: string }`. If unknown id → `{ error: "unknown_metric", id }`. Else `{ def: MetricDef, value: MetricValue }`.

### `list_*` (Phase 8 only)

When activated, each takes the same filters the hub list route will take. Until then they must not appear in the OpenAI `tools` array.

---

## File map

| File | Responsibility |
|---|---|
| Migration `reports_ai_config_settings` | Seed three `config_settings` keys |
| `src/lib/reports/assistant/config.ts` | Load/parse enable + key + model (service client) |
| `src/lib/reports/assistant/skills.ts` | Allowlisted skill runners |
| `src/lib/reports/assistant/loop.ts` | OpenAI tools loop |
| `src/lib/reports/assistant/prompt.ts` | System prompt |
| `src/app/api/reports/assistant/route.ts` | POST, auth, audit |
| `src/app/api/admin/reports-ai/test/route.ts` | Superadmin key test |
| `src/app/api/admin/config/route.ts` | Allowlist + mask + PATCH |
| `src/app/admin/config/page.tsx` | Config card |
| `src/components/reports/AssistantDrawer.tsx` | Real chat |
| `src/app/reports/page.tsx` | Pass `period={activePeriod}` into the drawer. Chat messages stay in drawer state. |

---

## Phase 1 — Seed config keys

**Allow:**
- Create stamped migration (both migration folders after MCP apply)
- MCP `apply_migration` name: `reports_ai_config_settings`

**Do not touch:** admin API/UI (Phase 3–4), assistant runtime.

- [x] Apply via Supabase MCP `apply_migration`:

```sql
INSERT INTO public.config_settings (key, value, description) VALUES
  ('reports_ai_enabled', 'false'::jsonb, 'Enable the Reports assistant (OpenAI tool-calling). Off until an API key is saved.'),
  ('reports_ai_api_key', '""'::jsonb, 'OpenAI API key (masked on GET)'),
  ('reports_ai_model', '"gpt-4o-mini"'::jsonb, 'OpenAI Chat Completions model id')
ON CONFLICT (key) DO NOTHING;
```

- [x] Copy the stamped file into `supabase/migrations/` **and** `loanstar/supabase/migrations/`.
- [x] Confirm live: `SELECT key FROM config_settings WHERE key LIKE 'reports_ai_%';` → three rows. `reports_ai_enabled` is JSON `false`.
- [x] `npm test` still green (no code change).

**Done when:** keys exist; assistant still a placeholder; `/admin/config` does not show them yet.

---

## Phase 2 — Config loader + tests

**Allow:**
- Create: `src/lib/reports/assistant/config.ts`
- Create: `src/lib/reports/assistant/__tests__/config.test.mts`

**Do not touch:** API routes, UI.

- [x] Write tests first (`src/lib/reports/assistant/__tests__/config.test.mts`):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReportsAiConfig, type ConfigRow } from "../config";

function rows(partial: Record<string, unknown>): ConfigRow[] {
  return Object.entries(partial).map(([key, value]) => ({ key, value }));
}

describe("parseReportsAiConfig", () => {
  it("disabled when reports_ai_enabled is false even if a key is present", () => {
    const cfg = parseReportsAiConfig(
      rows({
        reports_ai_enabled: false,
        reports_ai_api_key: "sk-test",
        reports_ai_model: "gpt-4o-mini",
      }),
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.ready, false);
    assert.equal(cfg.apiKey, "sk-test");
  });

  it("ready only when enabled and key non-empty", () => {
    const cfg = parseReportsAiConfig(
      rows({
        reports_ai_enabled: true,
        reports_ai_api_key: "sk-live",
        reports_ai_model: "gpt-4o-mini",
      }),
    );
    assert.equal(cfg.ready, true);
    assert.deepEqual(cfg.incomplete, []);
  });

  it("incomplete includes reports_ai_api_key when enabled and blank", () => {
    const cfg = parseReportsAiConfig(
      rows({ reports_ai_enabled: true, reports_ai_api_key: "", reports_ai_model: "gpt-4o-mini" }),
    );
    assert.equal(cfg.ready, false);
    assert.ok(cfg.incomplete.includes("reports_ai_api_key"));
  });

  it("defaults model to gpt-4o-mini when missing", () => {
    const cfg = parseReportsAiConfig(rows({ reports_ai_enabled: true, reports_ai_api_key: "sk-x" }));
    assert.equal(cfg.model, "gpt-4o-mini");
  });
});
```

- [x] Run: `node --import tsx --test src/lib/reports/assistant/__tests__/config.test.mts` — expect FAIL (module missing).
- [x] Implement `src/lib/reports/assistant/config.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asConfigBoolean,
  asConfigString,
} from "@/lib/sms/config-mask";

export const REPORTS_AI_CONFIG_KEYS = [
  "reports_ai_enabled",
  "reports_ai_api_key",
  "reports_ai_model",
] as const;

export type ConfigRow = { key: string; value: unknown };

export type ParsedReportsAiConfig = {
  enabled: boolean;
  apiKey: string;
  model: string;
  incomplete: string[];
  /** enabled && apiKey present — safe to call OpenAI */
  ready: boolean;
};

export function parseReportsAiConfig(rows: ConfigRow[]): ParsedReportsAiConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = asConfigBoolean(map.get("reports_ai_enabled"), false);
  const apiKey = asConfigString(map.get("reports_ai_api_key")).trim();
  const model = asConfigString(map.get("reports_ai_model")).trim() || "gpt-4o-mini";
  const incomplete: string[] = [];
  if (!apiKey) incomplete.push("reports_ai_api_key");
  return {
    enabled,
    apiKey,
    model,
    incomplete,
    ready: enabled && incomplete.length === 0,
  };
}

export async function loadReportsAiConfig(
  supabase: SupabaseClient,
): Promise<ParsedReportsAiConfig> {
  const { data, error } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", [...REPORTS_AI_CONFIG_KEYS]);
  if (error) throw new Error(`Failed to load reports AI config: ${error.message}`);
  return parseReportsAiConfig(data ?? []);
}
```

- [x] Re-run the test file — PASS.
- [x] `npm test` green.

**Done when:** parser tests pass; nothing is wired to Config UI yet.

---

## Phase 3 — Admin config API (mask + save)

**Allow:**
- Modify: `src/app/api/admin/config/route.ts`

**Do not touch:** `page.tsx` (Phase 4).

- [x] Add to `CONFIG_KEYS` (after `smtp_from`): `"reports_ai_enabled"`, `"reports_ai_api_key"`, `"reports_ai_model"`.
- [x] Add `"reports_ai_api_key"` to `SECRET_KEYS`.
- [x] Add to `patchConfigSchema`:

```ts
reports_ai_enabled: z.boolean().optional(),
reports_ai_api_key: z.string().optional(),
reports_ai_model: z.string().min(1).max(80).optional(),
```

- [x] PATCH pushes, mirroring SMTP:

```ts
if (body.reports_ai_enabled !== undefined) {
  updates.push({ key: "reports_ai_enabled", value: body.reports_ai_enabled });
}
if (shouldApplySecretPatch(body.reports_ai_api_key)) {
  updates.push({ key: "reports_ai_api_key", value: body.reports_ai_api_key!.trim() });
}
if (body.reports_ai_model !== undefined) {
  updates.push({ key: "reports_ai_model", value: body.reports_ai_model.trim() });
}
```

Existing audit `afterData` already redacts `SECRET_KEYS` — the new key is covered once it is in the set.

- [x] `npx tsc --noEmit` no worse; `npm test` green.

**Done when:** GET as super_admin returns the three keys; `reports_ai_api_key` is `•••` / `•••last4`; PATCH with a masked echo does not wipe the stored key. Confirm by reading `shouldApplySecretPatch` behavior — do not log the raw key.

---

## Phase 4 — `/admin/config` card + test-connection

**Allow:**
- Modify: `src/app/admin/config/page.tsx`
- Create: `src/app/api/admin/reports-ai/test/route.ts`

**Do not touch:** reports drawer, assistant loop.

- [x] On the config page, add state: `reportsAiEnabled` (false), `reportsAiApiKey` (""), `reportsAiModel` (`"gpt-4o-mini"` — never start as `""`, or Save hits `z.string().min(1)`), `testingReportsAi`.
- [x] In `load()`, map the three keys (same as SMTP password → masked string into the password input). If model row is missing, keep `"gpt-4o-mini"`.
- [x] Include them in the PATCH body.
- [x] New **Card** after Email (SMTP), before the Save button. Mirror the SMS card field layout (checkbox, password input, secondary test button) — do not invent a new card chrome.

  - Title: `Reports assistant (OpenAI)`
  - Blurb: **Save before Test connection** — the test reads the key from the database, not the unsaved input. Enable only after a key works. Key is masked after save — leave the masked value to keep the existing key. Committee and other `reports:view` roles never see the key.
  - Checkbox: Enable reports assistant
  - Password input: API key
  - Text input: Model (placeholder `gpt-4o-mini`)
  - Button: Test connection (type=button, does not submit the form)

- [x] Update `PageHeader` description to mention the reports assistant.

- [x] Test route `POST /api/admin/reports-ai/test` — **do not** call `GET /v1/models` (restricted keys often cannot list models). Hit the same Chat Completions API the assistant will use:

```ts
const user = await requireModulePermission("system_config", "edit");
const supabase = createServiceClient();
const cfg = await loadReportsAiConfig(supabase);
if (!cfg.apiKey) {
  return NextResponse.json(
    { error: "Save an OpenAI API key first, then test." },
    { status: 400 },
  );
}
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: cfg.model,
    messages: [{ role: "user", content: "Reply with the single word pong." }],
    max_tokens: 8,
    temperature: 0,
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) {
  const body = await res.text();
  return NextResponse.json(
    { error: `OpenAI error HTTP ${res.status}: ${body.slice(0, 200)}` },
    { status: 400 },
  );
}
await writeAuditEvent({
  actorId: user.id,
  moduleSlug: "system_config",
  action: "execute_trigger",
  entityType: "reports_ai_test",
  afterData: { ok: true, model: cfg.model },
});
return jsonOk({ ok: true, model: cfg.model });
```

Do **not** require `reports_ai_enabled` for the test — Superadmin must verify a key before turning the assistant on. Do not call `sendSms`-style skip-when-disabled.

- [x] Wire the Test connection button to that POST; show success/error in the existing `message` / `error` alerts.

**Done when:** Superadmin saves key+model, then Test connection succeeds (or shows OpenAI's error). Enable can stay off during the test. Reload shows masked key.

---

## Phase 5 — Skill runners + tests (no LLM yet)

**Allow:**
- Create: `src/lib/reports/assistant/skills.ts`
- Create: `src/lib/reports/assistant/__tests__/skills.test.mts`

**Do not touch:** OpenAI loop, drawer, dashboard route.

- [x] Export:

```ts
export const ACTIVE_SKILL_NAMES = ["get_catalog", "get_snapshot", "get_metric"] as const;

export type SkillName = (typeof ACTIVE_SKILL_NAMES)[number];

export type SkillResult = { ok: true; name: SkillName; data: unknown } | { ok: false; name: string; error: string };

export function openaiToolDefs(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return [
    {
      type: "function",
      function: {
        name: "get_catalog",
        description:
          "Return every metric definition (id, label, description, formula, unit). Use when the user asks what a number means.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "get_snapshot",
        description:
          "Return KPIs, pipeline status counts, aging, TAT, and stuck-file statuses for the request period. No chart series, no borrower names.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "get_metric",
        description:
          "Return one metric's definition plus its value/prior/delta. id must be a catalog id such as money.collected.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export async function runSkill(
  name: string,
  argsJson: string,
  ctx: { supabase: SupabaseClient; period: Period },
): Promise<SkillResult>
```

- [x] `get_catalog`: `{ definitions: METRICS }`.
- [x] `get_snapshot`: `Promise.all` of `buildExecutiveSummary`, `computeMoneyMetrics`, `computeRiskMetrics`, `computeOriginationMetrics` — dashboard route calls those at `src/app/api/reports/dashboard/route.ts:23–26` (do **not** call `computeStaffMetrics` on line 27). **Drop** all `series`. Include `pipeline` from the summary (status counts only). Map metrics through `getMetric(id)` for label/unit/formula. Call `priorPeriod(period)` from `period.ts`. Strip stuck file `borrowerName` / `applicationId`.
- [x] `get_metric`: `JSON.parse` `argsJson` inside try/catch. If parse fails or `id` is not a string → `{ ok: false, error: "invalid_args" }`. Then `getMetric(id)`; if missing, `{ ok: false, error: "unknown_metric" }`. Else find the value in the same three `compute*` metric arrays (call all three, find by id).
- [x] Unknown skill name → `{ ok: false, error: "unknown_skill" }` — never throw into OpenAI as a crash. Never `JSON.parse` without try/catch (malformed tool arguments are common).
- [x] Tests (pure, no DB): `openaiToolDefs()` names equal `ACTIVE_SKILL_NAMES`; `runSkill("nope", "{}", …)` unknown_skill; `runSkill("get_catalog", "{}", { supabase: fake, period })` — for catalog you can call it with a dummy client because it does not query. For `get_metric` unknown id, mock is optional: unit-test a small helper `findMetricValue(metrics, id)` instead of hitting Supabase.

Add helper in `skills.ts` (test this; keep `runSkill` thin):

```ts
export function findMetricValue(
  metrics: MetricValue[],
  id: string,
): MetricValue | undefined {
  return metrics.find((m) => m.id === id);
}
```

Tests: finds `money.collected`; undefined for `money.nope`. `get_catalog` returns every `METRICS` id.

- [x] `node --import tsx --test src/lib/reports/assistant/__tests__/skills.test.mts` PASS; `npm test` green.

**Done when:** skills are callable from TypeScript; nothing calls OpenAI yet.

---

## Phase 6 — Agent loop + `POST /api/reports/assistant`

**Allow:**
- Create: `src/lib/reports/assistant/prompt.ts`
- Create: `src/lib/reports/assistant/loop.ts`
- Create: `src/lib/reports/assistant/__tests__/loop.test.mts`
- Create: `src/app/api/reports/assistant/route.ts`

**Do not touch:** drawer UI (Phase 7). Config files except imports.

### System prompt (`prompt.ts`)

Keep it short. Must include:

- You are the LoanStar Reports assistant. Answer only from skill results.
- Period is `{from}`–`{to}` (inject at runtime). Prior period is computed server-side; use `get_snapshot` / `get_metric` deltas, do not invent a comparison window.
- Cite metric **id** and **formula** when stating a number.
- If a skill errors or a metric is unknown, say you do not have that number. Never invent.
- You do not approve/deny loans, comment on a named applicant's credit file, or fetch votes.
- You have three skills: `get_catalog`, `get_snapshot`, `get_metric`. Named account registers are not available.
- The staff scorecard (collector names, committee votes-cast, proof backlog) is **not** in these skills. If asked, say you can only answer portfolio / origination / risk metrics on this page, not the staff panel.
- `get_snapshot.pipeline` is status → count only (no applicant names).

### Loop (`loop.ts`)

No SDK. `fetch("https://api.openai.com/v1/chat/completions")`.

```ts
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantLoopResult = {
  reply: string;
  skillsUsed: string[];
};

export async function runReportsAssistant(input: {
  apiKey: string;
  model: string;
  period: Period;
  messages: ChatMessage[];
  supabase: SupabaseClient;
}): Promise<AssistantLoopResult>
```

Rules:
- Send `system` + last **8** `input.messages` (ignore extra).
- `tools: openaiToolDefs()`, `tool_choice: "auto"`.
- Max **4** OpenAI HTTP calls total (the first completion + up to **3** follow-ups after tools). A single completion that returns N parallel `tool_calls` counts as **one** call. After the cap, if the model still wants a tool, stop and return: `I could not finish looking that up. Try a narrower question.`
- When `choices[0].message.tool_calls` is present, you **must** append that assistant message **unchanged** (it must include `tool_calls` with ids) **then** one `role: "tool"` message per call with matching `tool_call_id`. Skipping the assistant echo makes OpenAI return 400. Then `runSkill(name, arguments, { supabase, period })` for each call. Stringify skill JSON; cap each tool result at **8000** characters.
- `temperature: 0.2`. Timeout **30s** per HTTP call (`AbortSignal.timeout(30_000)`).
- If OpenAI HTTP fails, throw `Error` with status + truncated body — the **route** must catch this and return **502**, not fall through `handleApiError` (that is 500).
- Parse assistant `content`; if empty after stop, reply `I did not get an answer back. Try again.` Cap `reply` at **8000** characters (drawer follow-ups send history back through zod).

**Tests for the loop:** mock `globalThis.fetch`. One test: model returns content with no tools → reply is that content, `skillsUsed` `[]`. One test: first fetch returns a `tool_calls` for `get_catalog`, second fetch returns a sentence → `skillsUsed` is `["get_catalog"]`. Assert the second fetch body includes an assistant message with `tool_calls` **and** a `role: "tool"` message. Do not hit the network.

### Route

```ts
// POST /api/reports/assistant
const user = await requireModulePermission("reports", "view");
const body = z.object({
  period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8000),
  })).min(1).max(8),
}).parse(await request.json());

const admin = createServiceClient();
const cfg = await loadReportsAiConfig(admin);
if (!cfg.enabled) {
  return NextResponse.json(
    { error: "Report assistant is turned off. Ask Super Admin to enable it in System Config." },
    { status: 503 },
  );
}
if (!cfg.ready) {
  return NextResponse.json(
    { error: "Report assistant is not configured (missing API key)." },
    { status: 503 },
  );
}

try {
  const result = await runReportsAssistant({
    apiKey: cfg.apiKey,
    model: cfg.model,
    period: body.period,
    messages: body.messages,
    supabase: admin,
  });

  await writeAuditEvent({
    actorId: user.id,
    moduleSlug: "reports",
    action: "ask",
    entityType: "reports_assistant",
    afterData: {
      period: body.period,
      question: body.messages.filter((m) => m.role === "user").at(-1)?.content.slice(0, 500),
      skillsUsed: result.skillsUsed,
    },
  });

  return jsonOk(result);
} catch (error) {
  const message = error instanceof Error ? error.message : "Assistant failed";
  if (
    message.startsWith("OpenAI") ||
    /\bHTTP [45]\d\d\b/.test(message) ||
    error instanceof DOMException
  ) {
    return NextResponse.json({ error: message }, { status: 502 });
  }
  throw error; // outer handleApiError
}
```

The route's outer `try/catch` must (1) `z.ZodError` → 400, same as `src/app/api/admin/config/route.ts:250–252`, (2) catch the inner `throw error` via `handleApiError`. `AbortSignal.timeout` rejection is a 502.

Seed Committee login **does exist**: `committee@loanstar.local` on `src/app/login/page.tsx:24`. Use it for the 403/200 check.

**Done when:** POST as a `reports:view` user with enable=false → 503; with enable+key, a question returns `{ reply, skillsUsed }`. Committee must not 403 on this route. Confirm `requireModulePermission("reports","view")` only — do not add a second permission.

---

## Phase 7 — Wire the drawer

**Allow:**
- Modify: `src/components/reports/AssistantDrawer.tsx`
- Modify: `src/app/reports/page.tsx`

**Do not touch:** admin config, skill files except if a type must be exported (prefer importing `ChatMessage` from `loop.ts` only in the route — keep the drawer types local and identical).

- [x] Drawer props become:

```ts
{
  open: boolean;
  onClose: () => void;
  period: Period;
}
```

- [x] Remove “Coming soon”. Enable the input. Keep the same layout (header, scroll body, composer).
- [x] State: `messages: Array<{ role: "user" | "assistant"; content: string }>`, `draft`, `busy`, `error`.
- [x] On send: append user message (trim; reject empty; cap the user text at 2000 in the UI). POST `/api/reports/assistant` with `{ period, messages: last 8 including the new user turn }`. Append assistant `reply` or set `error` from `{ error }`.
- [x] Empty state copy: `Ask about the numbers on this page for the selected period.` Example placeholder: `Why did collections change?`
- [x] 503 body message is shown in the thread (not a silent disable).
- [x] `page.tsx` passes `period={activePeriod}`.
- [x] Do not auto-open the drawer.

**Done when:** Superadmin enables the key, Committee (or super_admin) opens Reports, picks a period, asks “What is collection efficiency?”, and the answer cites `money.collectionEfficiency` with the formula from the catalog.

Manual checks:
- [ ] `reports:view` user — drawer works.
- [ ] Role without reports: Sidebar hides Reports (`Sidebar.tsx` `can(module, "view")`). Hitting `/reports` still renders AppShell (middleware only requires login). Dashboard fetch and assistant POST both 403. Do **not** add a new layout gate in this plan.
- [ ] Print view: drawer still `no-print`.

---

## Phase 8 — `list_*` skills (blocked)

**Do not start** until `GET /api/reports/accounts`, past-due, collections, and pipeline exist and are gated `reports:view`.

Then: implement runners that call those list helpers (not raw SQL), add names to `ACTIVE_SKILL_NAMES`, extend the system prompt, keep borrower names off unless `can("accounting_ar","view")` — same rule as the hub plan.

---

## Combined summary (executor, after the last runnable phase)

List: files changed, migration name, tests run/result, everything left alone (dashboard route, metric formulas, Sidebar, Committee vote APIs).
