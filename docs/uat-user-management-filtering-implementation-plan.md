# User Management Search, Role Filter, and Pagination Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Admin Users usable at scale with server-side search, role/status filtering, and pagination.
**Architecture:** Preserve user creation/editing and role membership; replace the current unbounded list response with the document-template page’s proven query/metadata pattern.
**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase Postgres/RLS, Node tests.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. There are 62 profiles, one inactive profile, and role membership is many-to-many. Current GET `/api/admin/users` selects all profiles then role rows without query parameters; its page fetches that full list ([route](../src/app/api/admin/users/route.ts), [page](../src/app/admin/users/page.tsx)). The document-template API already implements bounded `limit`, `offset`, search, filters, count metadata, and a matching UI ([template route](../src/app/api/admin/document-templates/route.ts), [template page](../src/app/admin/document-templates/page.tsx)).

---

## Scope and constraints

### In scope

1. Query parameters and server-side search by name/email.
2. Role, account-status, and audience filters; audience values are `all`, `staff`, and `borrower` defined by actual role membership after audit.
3. Bounded pagination with total count, page reset when filters/search change, and accessible empty/loading/error states.

### Out of scope — do not change

Do not change user creation, editing, role assignment, activation, password flows, role definitions, borrower registration, or data model. Do not introduce client-side filtering over a downloaded full directory.

### Non-negotiable safety constraints

- Keep `requireModulePermission('auth_admin','view')` for GET; leave the existing `auth_admin:create` (POST) and `auth_admin:edit` (PATCH) checks on mutation routes untouched — this plan does not modify mutation routes at all.
- Parse/validate every query parameter server-side; clamp limit to the observed document-template maximum (100) and reject invalid role UUID/filter values.
- A user with multiple roles must appear once, not once per role join.
- Never return passwords, Auth metadata, session fields, or unfiltered user directory data.
- Preserve existing response fields for current page mutation paths until UI changes consume the paginated shape; coordinate route/page deployment in one release.

### User-list contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Admin views page | `auth_admin:view` actor | 403 otherwise |
| Search/filter/page request | Same actor; server computes result set | Empty `items: []`, correct `total: 0` |
| Role filter | User has at least that selected role | No duplicate result for multi-role user |
| Staff/borrower audience | Defined from audited role-slug classification | Do not guess ambiguous users; document rule in code/test |

## Files

| File | Responsibility |
| --- | --- |
| `src/lib/users/service.ts` (create) | Owns query/filter/count logic against `profiles`/`user_roles`/`roles`, mirroring [`listTemplates`](../src/lib/documents/templates/service.ts:92)'s `count: 'exact'` + range + `.or()` search pattern. Returns `{ items, total, limit, offset }`. |
| `src/app/api/admin/users/route.ts` | Thin wrapper: `requireModulePermission`, parse/validate query with Zod, delegate to the service, return its result. No query logic in the route itself. |
| `src/app/admin/users/page.tsx` | Controls, debounced state request (component state, matching the document-templates page — not URL query params), pagination and states. |
| `src/lib/users/__tests__/service.test.mts` (create) | Filtering, dedup, count, and audience-classification tests against the service function directly. |

> **Why the service lives in `src/lib`, not the route:** `npm test` runs `node --import tsx --test "src/lib/**/__tests__/*.mts"` ([package.json:10](../package.json:10)) — it does not glob `src/app/**` at all. Every existing test in the repo (34 `__tests__` directories, all under `src/lib/`) follows this. A test file placed under `src/app/api/admin/users/__tests__/` would match zero test files and `npm test` would exit 0 without ever running it — Phase 0's "Expected: FAIL" and Phase 1's "Expected: PASS" would both be false positives. There is also no precedent in this codebase for testing a route handler directly (it would require mocking `requireModulePermission`'s live Supabase auth session, which nothing here does) — the established pattern is to keep query/filter logic in a `src/lib` service and unit-test that, letting the route stay a thin, untested pass-through. There is no component-test runner in this project (no vitest/jest/testing-library in `package.json`), so no `page.test.tsx` is planned; page behavior is covered by the manual/live checks in Phase 2.

## Phase 0 — Baseline tests

### Task 1: Specify the server contract before UI work

**Files:** Create `src/lib/users/service.ts` (empty/stub export) and `src/lib/users/__tests__/service.test.mts`; modify no other production code.

- [ ] Add literal cases: `?limit=20&offset=0` equivalent options; name/email case-insensitive search; active/inactive; role UUID; no-match total zero; two roles still one row; `limit=101` rejected/clamped per agreed validation.
- [ ] Cover authorization for the route wrapper (403 for a non-`auth_admin:view` actor) as a route-level note in the test file's comments/TODO, since it cannot run under `npm test`'s glob — verify it manually against the running app in Phase 2 instead.
- [ ] Run: `npm test -- --test-name-pattern="users service"`; Expected: FAIL because the service does not exist yet / ignores filters.
- [ ] Manual/live checks: inspect actual role slugs before defining staff/borrower classification; record exact slugs in the test names/comments, not production user details.

**Phase constraints:** No client query logic before a stable, tested service function exists.

## Phase 1 — Add bounded server querying

### Task 2: Implement safe filtering and total metadata

**Files:** Implement `src/lib/users/service.ts`; modify `src/app/api/admin/users/route.ts` to delegate to it; `src/lib/users/__tests__/service.test.mts`.

- [ ] Use Zod search params in the route: `q` trimmed/max length, `roleId` UUID optional, `status` enum `all|active|inactive`, `audience` enum only after audited mapping, `limit` 1–100, `offset` non-negative integer; pass parsed values into the service.
- [ ] In the service, query the profile base set with `count: 'exact'` and range; apply name/email OR search safely using the project's existing Supabase escaping convention (see `listTemplates`' `.or()` usage).
- [ ] Fetch/match role data without multiplying records; apply role/audience membership server-side and return `{ items, total, limit, offset }` plus existing public user/roles fields.
- [ ] Preserve consistent ordering (verify current page expectation; add explicit deterministic order such as newest first only if source proves it).
- [ ] Run: `npm test -- --test-name-pattern="users service"`; Expected: PASS.
- [ ] Manual/live checks: role filter matching a multi-role account shows one record; page beyond total shows empty results without false count; hit `/api/admin/users` as a non-admin and confirm 403 (this route-level permission check is not covered by `npm test`).

**Phase constraints:** Keep RLS-authenticated client and permission call in the route. Do not load every profile then slice in browser. Do not put filter/count logic in the route itself — the service owns it, per the Files table above.

## Phase 2 — Upgrade the list page

### Task 3: Adopt the established template-page interaction model

**Files:** Modify users page; optional existing UI test.

- [ ] Follow the existing document-template page’s debounce, loading and pagination components/conventions; do not copy unrelated template-management actions.
- [ ] Add search, role dropdown populated from existing `/api/admin/roles`, status/audience filters, page size, and previous/next controls.
- [ ] Reset offset to zero whenever q/role/status/audience/limit changes; cancel or ignore stale requests.
- [ ] Retain create/edit/activate controls and refresh current page after a mutation; if deletion/mutation empties a page, request previous valid offset.
- [ ] Run: `npm run lint`; Expected: PASS.
- [ ] Manual/live checks: 1. Search then clear. 2. Combine role + inactive. 3. Navigate pages. 4. Create/activate user and confirm refresh. 5. No-result and network-error states are understandable.

**Phase constraints:** Filters refine only the admin list; no change to users’ permissions or the borrower portal.

## Phase 3 — Regression verification and rollout

- [ ] Run: `npm test`; Expected: PASS.
- [ ] Run: `npm run lint`; Expected: PASS.
- [ ] Run: `npm run build`; Expected: PASS.

| Case | Expected result |
| --- | --- |
| Admin + q | Correct name/email matches with total |
| Role multi-membership | One user row only |
| Active/inactive | Exact profile state only |
| Page offset | Stable slice and correct controls |
| No matches | Empty state, total zero |
| Non-admin | 403/no directory leakage |

- [ ] Pre-production checklist: verify no migration, RLS/policy change, or client full-directory request; stage only Files-table paths.

## Rollback

1. Revert route and page together to the prior unpaginated contract if release errors occur.
2. If a filter is incorrect, forward-fix query parsing/mapping; do not edit profiles/roles to make results fit.
3. No data migration or data rollback exists for this UI/API-only item.

## Self-review

This plan is limited to an audited GET/list usability problem and uses the existing document-template interaction as a behavioral reference, not a copied feature set. It explicitly preserves user edits and role logic, and requires role-audience classification to be verified before an implementer encodes it.
