# Minimalist Restricted-Access Blocker Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in users a clear, calm blocker page when they reach a page they do not have permission to use.
**Architecture:** Preserve server/API authorization exactly; add a shared presentation route for authenticated 403 navigation, not a client-side access control system.
**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase SSR/Auth, existing design system, Node/Playwright tests.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. Middleware currently redirects unauthenticated protected paths to login but does not make module-permission decisions ([middleware](../src/middleware.ts)). Server API authorization throws `ForbiddenError`, which the common handler returns as JSON 403 ([permissions](../src/lib/permissions/server.ts), [API handler](../src/lib/api/handler.ts)). UAT-094 identifies an error page when restricted navigation occurs; no verified shared authenticated 403 page exists.

---

## Scope and constraints

### In scope

1. A minimalist, accessible authenticated restricted-access page with safe return/home action.
2. A standard server-page/layout redirect/render path for known permission denials.
3. Tests for unauthenticated, authorised, unauthorised, and direct API behavior.

### Out of scope — do not change

Do not alter module permissions, route map/home routing, API JSON errors, login/signup, browser history globally, or show implementation/security details on the blocker.

### Non-negotiable safety constraints

- The blocker is presentation only: every page/API must retain server authorization; never replace guards with redirect checks.
- Unauthenticated users still go to login, not blocker. Invalid/external return targets are ignored to prevent open redirects.
- API/fetch callers retain JSON 401/403 rather than receiving HTML redirects.
- Do not reveal whether a resource exists, which module grants it, user role names, or internal stack errors.
- Follow current Next 16 route/error conventions only after reading installed documentation during execution.

### Navigation contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Signed-in user denied page access | Blocker page | Safe home/back action only |
| Signed-out protected navigation | Login | Preserve current safe redirect behavior |
| Direct denied API call | API client | Existing JSON 403 |
| Authorised page | User | Original page unchanged |

## Files

| File | Responsibility |
| --- | --- |
| `src/app/access-denied/page.tsx` (create) | Minimalist responsive blocker UI and safe links. |
| `src/lib/permissions/navigation.ts` (create only if no existing shared mapper) | Narrow page-denial redirect helper; no permission decision logic. |
| Affected protected page/layout files discovered by a route-guard audit | Convert known server `ForbiddenError` handling to shared navigation outcome only. |
| `src/app/access-denied/__tests__/page.test.tsx` (create if supported) | Content/accessibility and safe return tests. |
| `e2e/access-denied.spec.ts` (create) | Browser navigation matrix. |

## Phase 0 — Baseline tests

### Task 1: Audit and reproduce actual page-level denial paths

**Files:** Create e2e test; no production changes.

- [ ] Inventory every protected `src/app` page/layout and record whether it uses `requireAuth`, `requireModulePermission`, client fetch, or no guard; cite each destination in implementation notes.
- [ ] Write Playwright cases: signed-out protected route→login; signed-in user without module→current error/restriction; authorised user→page; denied API fetch→JSON 403.
- [ ] Run: `npm run test:e2e -- access-denied`; Expected: FAIL for missing blocker presentation.

**Phase constraints:** Do not assume middleware knows permissions. Do not convert APIs to navigation responses.

## Phase 1 — Create the blocker as a pure UI route

### Task 2: Build the minimal, safe page

**Files:** Create blocker page and tests.

- [ ] Use existing app shell/design tokens; include plain heading, one-sentence explanation, Home action resolved by existing `resolveHomePath`, and safe Back action only if current navigation API supports it.
- [ ] Do not accept arbitrary `next` URL. If query state is needed, permit only same-origin app paths from a strict allowlist.
- [ ] Add semantic heading, keyboard focus, contrast, and mobile layout tests.
- [ ] Run focused page test; Expected: PASS.

**Phase constraints:** No raw error text, policy details, or module names; no new role lookup in client UI.

## Phase 2 — Route only authenticated page denials to it

### Task 3: Integrate after the full guard audit

**Files:** Modify only confirmed page/layout guard sites and shared helper if needed.

- [ ] For each audited server-rendered page denial, catch/translate only `ForbiddenError` into `/access-denied`; rethrow unexpected failures so monitoring/error handling stays intact.
- [ ] Keep API routes using `handleApiError`. Keep middleware’s unauthenticated redirect behavior.
- [ ] Do not redirect a resource-specific 404 or validation error to blocker.
- [ ] Run focused e2e; Expected: PASS.
- [ ] Manual/live checks: 1. Agent opens admin page. 2. Borrower opens committee path. 3. Anonymous opens protected route. 4. Authorised admin opens admin path. 5. API caller receives JSON 403.

**Phase constraints:** Files table is deliberately conditional until Phase 0 identifies every actual page guard; do not make broad catch-all changes or change app-wide error boundary behavior.

## Phase 3 — Regression verification and rollout

- [ ] Run: `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e -- access-denied`; Expected: PASS.

| Case | Expected result |
| --- | --- |
| Signed-in forbidden page | Minimal blocker, safe home action |
| Signed-out protected page | Login flow unchanged |
| Denied API | JSON 403 unchanged |
| Unknown route/server error | Existing 404/500 behavior |
| Authorised page | No blocker |

- [ ] Pre-production checklist: verify blocker contains no resource/role leakage and only audited page guard files are staged.

## Rollback

1. Revert affected page navigation translations if a valid route is blocked; server authorization remains intact.
2. Revert blocker UI independently if visual/accessibility issue appears.
3. No database, RLS, or session data changes exist to roll back.

## Self-review

This plan addresses a verified navigation experience gap without pretending it is authorization. It requires an explicit route-by-route audit before integration, keeps unauthenticated/API flows separate, and deliberately excludes any permission or routing redesign.
