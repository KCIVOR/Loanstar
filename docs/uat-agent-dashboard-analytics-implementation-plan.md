# Agent-Scoped Dashboard Analytics Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure an Agent visiting `/dashboard` sees analytics for only their own leads and applications, never totals for all agents.
**Architecture:** Preserve staff/super-admin aggregate widgets; pass authenticated identity into the existing Leads widget and apply explicit agent ownership filters for the Agent dashboard path.
**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase RLS/Postgres, Node tests.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. The live Agent role has two active members. `/api/dashboard/widgets` authenticates user and computes permissions, but calls every builder with only `supabase` ([widgets route](../src/app/api/dashboard/widgets/route.ts)). `buildLeadsWidget` selects all leads and all non-draft applications with no `agent_user_id` predicate ([aggregates](../src/lib/dashboard/aggregates.ts)). RLS can still allow agent-owned rows, but this plan does not rely on RLS for metric scope because permission-role changes can broaden visibility.

---

## Scope and constraints

### In scope

1. An explicit dashboard data-scope contract for Agent leads widget requests.
2. Agent-only filtering of leads and applications by `agent_user_id = authenticated user.id`.
3. Tests proving Agent A cannot receive Agent B’s totals/recent entries/funnel while staff aggregate behavior remains unchanged.

### Out of scope — do not change

Do not change `/agent`, lead ownership, RLS policies, dashboard widget membership, staff/super-admin aggregate semantics, reporting pages, or historic unassigned application attribution.

### Non-negotiable safety constraints

- Identity comes only from `requireAuth`, never request query/body/user ID.
- Scope decision must be role/permission-aware and explicit; do not infer “agent” merely from a leads permission if other roles legitimately share it without completing the role audit.
- Filter both lead rows and application funnel rows. Filtering one is a data leak/incorrect conversion metric.
- Unassigned historic applications do not belong to any agent; do not include them in an Agent funnel or backfill them.
- Retain staff aggregate queries byte-for-byte where practical; agent filter must be an added narrow branch.

### Analytics contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Agent A opens `/dashboard` | Only rows `agent_user_id = A` | Zero counts/recent list if none |
| Staff/super-admin opens dashboard | Existing permitted aggregate scope | No behavior change |
| Agent A requests API with Agent B ID | No such input accepted | Still only A’s scope |
| Unassigned application | No Agent dashboard | Excluded |

## Files

| File | Responsibility |
| --- | --- |
| `src/lib/permissions/server.ts` | Extend `getUserPermissions` to also return `roleSlugs: string[]` (active roles only) — the query already loads `roles`, add `slug` to the existing select. No new query, no behavior change to existing callers. |
| `src/lib/dashboard/scope.ts` (new) | Pure, dependency-free `resolveDashboardScope(permissions: UserPermissions): DashboardScope` — the single audited rule: super admin or no `agent` role slug → `{ kind: 'aggregate' }`; active `agent` role slug and not super admin → `{ kind: 'agent', userId }`. No Supabase/Next.js imports, so it is unit-testable under the existing `src/lib/**/__tests__` glob without mocking `next/headers`. |
| `src/app/api/dashboard/widgets/route.ts` | Call `resolveDashboardScope` after `getUserPermissions`. Call `WIDGET_BUILDERS[slug](supabase)` unchanged for every slug except `leads`; for `leads`, call `buildLeadsWidget(supabase, scope)` directly instead of going through the generic map, so no other builder's signature or the `WIDGET_BUILDERS` record type needs to change. |
| `src/lib/dashboard/aggregates.ts` | Add a required second parameter `scope: DashboardScope` to `buildLeadsWidget` only; add `.eq('agent_user_id', scope.userId)` to both queries when `scope.kind === 'agent'`. Every other builder function and the `WIDGET_BUILDERS` record type/signature stays byte-for-byte unchanged. |
| `src/lib/dashboard/types.ts` | Add `export type DashboardScope = { kind: 'agent'; userId: string } \| { kind: 'aggregate' }`. Keep `WidgetsResponse` and all other widget types unchanged — expose no identity field in the response. |
| `src/lib/dashboard/__tests__/scope.test.mts` (new) | Unit tests for `resolveDashboardScope`: super admin → aggregate; active `agent` role → agent scope with that user's id; staff role with no `agent` role slug → aggregate; user with both `agent` and another role → agent scope (never silently drops the narrower scope). |
| `src/lib/dashboard/__tests__/aggregates.test.mts` (create or extend existing test location) | Agent A/B/unassigned/staff query-result tests, calling `buildLeadsWidget(mockSupabase, scope)` directly with each `DashboardScope` variant. |

**Note on the route-level test originally planned as `src/app/api/dashboard/widgets/__tests__/route.test.mts`:** `npm test` runs `node --test "src/lib/**/__tests__/*.mts"` only — a test file under `src/app` is never discovered or run, and this repo has no existing pattern for mocking `requireAuth`/`createClient` (both depend on `next/headers`) to unit-test a route handler directly. Do not create that file. Pushing the trusted-scope decision into `resolveDashboardScope` in `src/lib/dashboard/scope.ts` moves the logic that actually needs testing into a plain function the existing test glob already covers, so no route-level test or test-glob change is needed for this plan.

## Phase 0 — Baseline tests

### Task 1: Lock the leakage regression

**Files:** Create/modify `src/lib/dashboard/__tests__/aggregates.test.mts`.

- [ ] Build fixtures: A-owned lead/app, B-owned lead/app, null-owned historical app, an `{ kind: 'aggregate' }` scope, an `{ kind: 'agent', userId: A }` scope.
- [ ] Call `buildLeadsWidget(mockSupabase, scope)` directly (not through the route) for each scope.
- [ ] Assert Agent A scope gives `totalLeads=1`, recent list excludes B, conversion/funnel exclude B and null; assert aggregate scope retains the combined total (today's behavior, unchanged).
- [ ] Run: `npm test -- --test-name-pattern="leads widget"`; Expected: FAIL because `buildLeadsWidget` does not yet accept or apply a scope.
- [ ] Manual/live checks: verify fixtures use fake UUIDs and the test client records ownership predicates.

**Phase constraints:** Do not make tests depend on live totals or bypass builder through a mock that cannot record filters.

## Phase 1 — Define a trusted scope

### Task 2: Add `resolveDashboardScope` and extend `getUserPermissions`

**Files:** `src/lib/permissions/server.ts`, `src/lib/dashboard/types.ts`, `src/lib/dashboard/scope.ts` (new), `src/lib/dashboard/__tests__/scope.test.mts` (new).

- [ ] Add `slug` to the existing `roles!inner(...)` select in `getUserPermissions` and collect active role slugs into a new `roleSlugs: string[]` field on `UserPermissions`. No new query; no change to the shape existing callers rely on (additive field only).
- [ ] Add `DashboardScope` to `types.ts`: `{ kind: 'agent'; userId: string } | { kind: 'aggregate' }`.
- [ ] Write `resolveDashboardScope(permissions: UserPermissions): DashboardScope` in `scope.ts`: `isSuperAdmin` → aggregate; `roleSlugs.includes('agent')` (and not super admin) → `{ kind: 'agent', userId: permissions.userId }`; anything else → aggregate. This is the one audited rule — record it as a comment on the function, not scattered across call sites.
- [ ] Unit-test all four branches in `scope.test.mts`, including a user holding `agent` plus another role (must still resolve to agent scope, never silently widen to aggregate).
- [ ] Run: `npm test -- --test-name-pattern="resolveDashboardScope"`; Expected: PASS.

**Phase constraints:** `scope.ts` must not import Supabase or Next.js request context — it takes only the already-computed `UserPermissions` object, so it needs no mocking beyond a plain object literal.

## Phase 2 — Apply the scope to every Lead metric input

### Task 3: Filter underlying queries, not computed output

**Files:** `src/lib/dashboard/aggregates.ts`, `src/app/api/dashboard/widgets/route.ts`, `src/lib/dashboard/__tests__/aggregates.test.mts`.

- [ ] Add a required second parameter `scope: DashboardScope` to `buildLeadsWidget` only. For `scope.kind === 'agent'`, add `.eq('agent_user_id', scope.userId)` to both the `leads` query and the `loan_applications` funnel query before aggregation. For `scope.kind === 'aggregate'`, run the two queries exactly as today.
- [ ] Keep `.neq('status','draft')` in the application funnel query exactly as current behavior, for both scope branches.
- [ ] In `route.ts`, call `resolveDashboardScope(permissions)` once, then call `buildLeadsWidget(supabase, scope)` directly for the `leads` slug instead of routing it through the generic `WIDGET_BUILDERS[slug](supabase)` map call. Every other slug keeps calling `WIDGET_BUILDERS[slug](supabase)` unchanged — do not touch the `WidgetBuilder` type or any other builder's signature.
- [ ] Verify `recentLeads`, weekly series, conversion rate, and funnel all derive only filtered rows for agent scope.
- [ ] Run focused tests; Expected: PASS.
- [ ] Manual/live checks: Agent A/B separately observe own totals; staff/super-admin observes aggregate; agent with no work gets zeros, not error.

**Phase constraints:** No post-query JavaScript filtering, no RLS policy edit, no filtering on `leads.application_id` alone, no signature change to any builder other than `buildLeadsWidget`.

## Phase 3 — Regression verification and rollout

- [ ] Run: `npm test`; `npm run lint`; `npm run build`; Expected: PASS.

| Case | Expected result |
| --- | --- |
| Agent A | Only A-owned lead/application metrics |
| Agent B | Only B-owned metrics |
| No-owned Agent | Zero/empty widget |
| Null historic app | Excluded from every Agent metric |
| Staff | Existing aggregate numbers |
| Forged user identifier | Ignored/not accepted |

- [ ] Pre-production checklist: query review confirms both tables use trusted UUID filter only for agent scope; no migration/RLS change; stage only Files-table paths.

## Rollback

1. Revert scope argument and filter branch together if staff dashboards regress.
2. If Agent numbers are wrong, forward-fix filter/query tests; never bulk assign historic null applications to repair metrics.
3. No data or migration rollback is required.

## Self-review

This plan corrects the proven cause—an identity-free builder querying both tables broadly—and covers every metric source, not only the headline count. It intentionally leaves `/agent`, RLS, and historical ownership untouched.

**Revision note (2026-09-23):** an earlier draft planned a route-level test file under `src/app` that `npm test`'s glob (`src/lib/**/__tests__/*.mts`) would never run, and left unspecified how a scoped `buildLeadsWidget` signature would coexist with the uniformly-typed `WIDGET_BUILDERS` record. Both are resolved above by extracting the scope decision into a pure, glob-covered `resolveDashboardScope` function and by special-casing only the `leads` slug at the route call site instead of changing the shared builder type.
