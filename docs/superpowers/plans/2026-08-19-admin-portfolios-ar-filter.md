# Configurable AR portfolios + queue filter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Super Admin can add, rename, and deactivate investor portfolios on `/admin/config`. AR can filter the live masterlist queue by portfolio (including Unset).

**Architecture:** Keep the existing `public.portfolios` table (do **not** copy rows into `config_settings`). Super Admin mutates via `GET/POST/PATCH /api/admin/portfolios` gated `system_config`. AR assign dropdown stays **active rows only**. AR queue filter uses `masterlist.portfolio_id`. **Remove = deactivate** (`is_active = false`): loans keep their tag; the name still shows on the account; the assign dropdown hides it.

**Tech Stack:** Next.js App Router, existing `portfolios` RLS, `requireModulePermission`, node:test (`.mts`). No new npm packages. No migration — the table already has `name UNIQUE` and `is_active`.

---

**Ground rules (every phase):**
- Closed **Allow** / **Do not touch**. If another file is required, stop and flag.
- After each phase, `git diff --stat` — every changed path must be on that phase's Allow list.
- Do not commit unless the user explicitly asks.
- `npx tsc --noEmit` no worse than known pre-existing test-file errors; `npm test` green after each phase.
- One phase at a time.

**Global freeze:**
- `config_settings` / `src/app/api/admin/config/route.ts` — do not add a `portfolios` JSON key
- Reports / LoanBot / `src/lib/reports/**`
- Collector / Remedial / CSA / Committee / CIG / LRA pages
- `src/app/ar/history/**`, `src/app/ar/dcr/**`, masterlist CSV `POST /api/ar/masterlist`
- Seed `20260706100002_p1_seed_data.sql` and `20260707000000_p7_ar_collection.sql`
- `src/middleware.ts`, `src/lib/permissions/server.ts`

**Out of scope:**
- Hard-delete of a portfolio that still has loans
- Splitting Reports KPIs by Portfolio A/B
- AR History / DCR / CSV filters
- Changing `ON DELETE SET NULL` on `masterlist.portfolio_id`

**Live audit (2026-08-19):** Portfolio A = 13 accounts, Portfolio B = 1, 17/31 masterlist rows unassigned. Lookups already `.eq("is_active", true)`. RLS `portfolios_write` already allows super admin or `accounting_ar:edit`; the admin API still gates on `system_config` so Committee/AR cannot manage the list from Config.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/ar/queue.ts` | `portfolioFilterSpec` + apply `.eq` / `.is` in `getMasterlistQueue` |
| `src/lib/ar/__tests__/queue.test.mts` | Spec tests |
| `src/app/api/admin/portfolios/route.ts` | GET all + POST create |
| `src/app/api/admin/portfolios/[id]/route.ts` | PATCH name / investor_label / `is_active` |
| `src/app/admin/config/page.tsx` | Portfolios card (own fetch/save, **outside** the big config form) |
| `src/app/api/ar/lookups/route.ts` | Return `is_active`; include inactive rows |
| `src/app/ar/masterlist/[id]/page.tsx` | Assign Select: active only |
| `src/app/ar/page.tsx` | Filter chips + query param `portfolio` |
| `src/app/api/ar/masterlist/route.ts` | Parse `portfolio` and pass into `getMasterlistQueue` |

---

## Phase 1 — Queue filter spec (no UI)

**Allow:**
- Modify: `src/lib/ar/queue.ts`
- Modify: `src/lib/ar/__tests__/queue.test.mts`

**Do not touch:** APIs, pages, admin config.

- [ ] Add to `src/lib/ar/queue.ts` next to `birStatusFilterSpec` (after the `BirStatusFilterSpec` block ~lines 109–119):

```ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PortfolioFilterSpec =
  | { mode: "all" }
  | { mode: "unset" }
  | { mode: "eq"; portfolioId: string };

export function portfolioFilterSpec(filter: string): PortfolioFilterSpec {
  if (!filter || filter === "all") return { mode: "all" };
  if (filter === "unset") return { mode: "unset" };
  if (UUID_RE.test(filter)) return { mode: "eq", portfolioId: filter };
  return { mode: "all" };
}
```

- [ ] Extend `MasterlistQueueQueryParams` with `portfolioFilter?: string`.

- [ ] In `getMasterlistQueue`, destructure `portfolioFilter = "all"` and after the segment filter block (~line 216) apply:

```ts
  const portfolioSpec = portfolioFilterSpec(portfolioFilter);
  if (portfolioSpec.mode === "eq") {
    query = query.eq("portfolio_id", portfolioSpec.portfolioId);
  } else if (portfolioSpec.mode === "unset") {
    query = query.is("portfolio_id", null);
  }
```

- [ ] Add tests in `src/lib/ar/__tests__/queue.test.mts`. Import `portfolioFilterSpec`. Add:

```ts
describe("portfolioFilterSpec", () => {
  it("maps all / empty / unset / uuid / junk", () => {
    assert.deepEqual(portfolioFilterSpec(""), { mode: "all" });
    assert.deepEqual(portfolioFilterSpec("all"), { mode: "all" });
    assert.deepEqual(portfolioFilterSpec("unset"), { mode: "unset" });
    assert.deepEqual(
      portfolioFilterSpec("30afcd77-b1d5-4933-9fb6-710baa736249"),
      { mode: "eq", portfolioId: "30afcd77-b1d5-4933-9fb6-710baa736249" },
    );
    assert.deepEqual(portfolioFilterSpec("Portfolio A"), { mode: "all" });
  });
});
```

- [ ] Run: `npx tsx --test src/lib/ar/__tests__/queue.test.mts` — expected pass.
- [ ] Run: `npm test` — expected green.

**Done when:** `getMasterlistQueue` can filter by `portfolio_id` / null; invalid values behave as All.

---

## Phase 2 — Admin portfolios API

**Allow:**
- Create: `src/app/api/admin/portfolios/route.ts`
- Create: `src/app/api/admin/portfolios/[id]/route.ts`

**Do not touch:** `src/app/api/admin/config/route.ts`, AR pages, queue.ts.

Gate GET with `requireModulePermission("system_config", "view")` and POST/PATCH with `"edit"`. Use `createClient()` (session) so `portfolios_write` RLS applies — do **not** use the service client. Super Admin already passes `is_super_admin()` on that policy.

- [ ] Create `src/app/api/admin/portfolios/route.ts` with GET (list + `accountCount` from `masterlist.portfolio_id`) and POST (`name` required, `investorLabel` optional). Unique-name conflict (`error.code === "23505"`) → **409** `"A portfolio with that name already exists."` Audit `create` / `entityType: "portfolio"`.

- [ ] Create `src/app/api/admin/portfolios/[id]/route.ts` with PATCH `{ name?, investorLabel?, isActive? }`. Empty body → 400. Missing row → `NotFoundError`. Same 409 on unique name. Audit `update` with before/after.

There is **no DELETE handler**. Remove in the UI is `PATCH { isActive: false }`. Restore is `PATCH { isActive: true }`.

POST create schema:

```ts
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  investorLabel: z.string().trim().max(80).optional().nullable(),
});
```

PATCH schema:

```ts
const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  investorLabel: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
});
```

GET JSON shape:

```ts
{
  portfolios: Array<{
    id: string;
    name: string;
    investorLabel: string | null;
    isActive: boolean;
    createdAt: string;
    accountCount: number;
  }>;
}
```

- [ ] `npm test` green.

**Done when:** Super Admin GET lists A and B with account counts; POST creates; PATCH deactivates without clearing `masterlist.portfolio_id`.

---

## Phase 3 — `/admin/config` card

**Allow:**
- Modify: `src/app/admin/config/page.tsx` only

**Do not touch:** admin config PATCH route, AR pages.

Place the card **after** the closing `</form>` (after Save configuration, ~line 790) so Add / Deactivate are not swallowed by the penalty/SMS save. Do not put portfolio fields into `handleSubmit`.

- [ ] State: `portfolios`, `newPortfolioName`, `newInvestorLabel`, `savingPortfolioId`.
- [ ] In `load()`, also `GET /api/admin/portfolios`. If that fails after settings loaded, `setError("Could not load portfolios")`.
- [ ] Helpers: `refreshPortfolios`, `addPortfolio` (POST), `savePortfolio` (PATCH name/label), `setPortfolioActive` (PATCH `isActive`). Button labels **Deactivate** / **Restore** — never Delete.
- [ ] Card title `Portfolios`. Help text: `Used when AR assigns a loan to an investor book (Portfolio A / B today). Deactivate hides it from the assign dropdown; existing loans keep the tag.` Show `accountCount` as muted text.
- [ ] Append `and Portfolios` to the Config `PageHeader` description.
- [ ] Manual: Super Admin sees A and B, deactivates B, refreshes — B listed inactive with accountCount 1. Committee cannot open Config (existing gate).
- [ ] `npm test` green.

**Done when:** Super Admin can add / rename / deactivate / restore without using Save configuration.

---

## Phase 4 — AR lookups + queue filter

**Allow:**
- Modify: `src/app/api/ar/lookups/route.ts`
- Modify: `src/app/ar/masterlist/[id]/page.tsx`
- Modify: `src/app/api/ar/masterlist/route.ts`
- Modify: `src/app/ar/page.tsx`

**Do not touch:** admin portfolios API, history, DCR, CSV POST.

### Lookups

- [ ] Change the portfolios query to select `id, name, investor_label, is_active` and **drop** `.eq("is_active", true)`. Order by name. Keep snake_case `investor_label` as this route already does.

### Account assign dropdown

- [ ] Widen `Lookup.portfolios` with `is_active?: boolean`. Options: `.filter((p) => p.is_active !== false)`. If the current `portfolioId` is inactive, add a disabled extra option `{name} (inactive)` so the Select does not go blank.

### Queue API

- [ ] Parse `searchParams.get("portfolio") ?? "all"` and pass `portfolioFilter` into `getMasterlistQueue`. Junk values already map to all via `portfolioFilterSpec`.

### AR list page

- [ ] State `portfolioFilter` default `"all"` and `portfolios` from `/api/ar/lookups`.
- [ ] `buildQueueQuery`: `qs.set("portfolio", params.portfolioFilter)`. Include in load deps.
- [ ] Active-filter count `+ (portfolioFilter !== "all" ? 1 : 0)`.
- [ ] Active pill next to segment: Unset or portfolio name, clear → `"all"`.
- [ ] Filter group **after Segment, before Created date**: All · Unset · one chip per portfolio (`(inactive)` suffix when `is_active === false`).

Inactive portfolios stay on the **filter** (find tagged loans) but not on the **assign** dropdown.

- [ ] KPIs (`getMasterlistQueueKpiCounts`) stay whole-book.

- [ ] Run `npx tsx --test src/lib/ar/__tests__/queue.test.mts` then `npm test`.

**Manual:** `/ar` Unset ≈ untagged rows; Portfolio A ≈ 13; deactivate B in Config → B still filterable as `(inactive)`; assign dropdown omits B; an account already on B still shows B.

**Done when:** AR can filter All / Unset / each portfolio; assign only lists active books.

---

## Combined summary (executor, after Phase 4)

Files changed, tests run/result, leftover (History/DCR/CSV/Reports still unfiltered; no hard delete).

---

## Spec coverage

| Decision | Phase |
|---|---|
| Do not store portfolios in `config_settings` | 2–3 |
| Remove = `is_active false` | 2–3 |
| Restore = `is_active true` | 2–3 |
| Unique name → 409 | 2 |
| AR queue filter + Unset | 1 + 4 |
| Assign dropdown active-only | 4 |
| History / Reports / CSV | Out of scope |

## Placeholder / consistency check

- No TBD. `portfolioFilterSpec` junk → `all` matches segment’s invalid fallback.
- No DELETE route. No service client on admin portfolios.
- Lookups grow by `is_active` only; existing `name` consumers keep working.
- Admin GET uses session client: Super Admin can SELECT portfolios + masterlist; AR cannot hit this route.
