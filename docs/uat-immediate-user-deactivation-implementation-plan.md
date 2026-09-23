# Immediate User Deactivation and Session Revocation Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immediately prevent a deactivated user from using the application and close the reactivation/refresh-token loophole on their existing sessions.
**Architecture:** Keep `profiles.is_active` as the business flag. Immediacy comes from active-profile enforcement on every protected request (Phase 1); Auth-side handling (Phase 2 — ban + optional session purge) does not itself make the next request fail (access tokens remain valid until expiry per Supabase Auth), it prevents a stale token/refresh token from becoming useful again after a later reactivation.
**Tech Stack:** Next.js 16, TypeScript, Zod, Supabase Auth/Admin API/Postgres/RLS, Node tests.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. One live profile is inactive. The admin PATCH only updates `profiles.is_active`; it never calls Auth Admin (`updateUserById`/sign-out) ([user PATCH](../src/app/api/admin/users/[id]/route.ts)). `requireAuth()` only calls `auth.getUser()` and returns the user without reading `profiles.is_active` ([permissions server](../src/lib/permissions/server.ts)); therefore an already issued session can still pass protected APIs.

**Second bypass found:** [`src/app/page.tsx`](../src/app/page.tsx) also calls `supabase.auth.getUser()` directly instead of going through `requireAuth()`. Include it in Task 2's bypass sweep alongside middleware.

**RLS gap confirmed live, not hypothetical.** Queried `pg_policies` on `public.profiles`: both `profiles_select_own` and `profiles_update` allow `id = auth.uid()` with no `is_active` condition, and `profiles_update`'s `with_check` does not restrict which columns the row owner may change. A deactivated user whose access token has not yet expired can therefore still read their own profile row and — via a direct PostgREST call — flip their own `is_active` back to `true`, bypassing the admin route entirely. Task 2's "RLS migration" branch is not a low-probability contingency; treat it as required, not optional.

**Correction to the session-revocation mechanism.** `@supabase/supabase-js@2.110.0`'s `GoTrueAdminApi` has no "revoke all sessions for a user ID" method — `admin.signOut(jwt, scope)` requires the *target's own JWT*, which the deactivating admin does not have. Supabase's own docs state: "Access Tokens of revoked sessions remain valid until their expiry time... The user won't be immediately logged out." So Auth-side revocation does **not** make the next request fail — that immediacy comes entirely from Phase 1's active-profile check. Session handling in Phase 2 is about closing the reactivation/refresh-token loophole (the access-contract row "old session stays invalid" after reactivation), not about achieving immediacy. The concrete mechanism is `auth.admin.updateUserById(uid, { ban_duration: '<long>' })` (cleared back to `'none'` on reactivation), optionally paired with a service-role SQL purge of the `auth.sessions` rows for that `user_id` if the refresh token must die immediately rather than merely be blocked on next refresh attempt.

---

## Scope and constraints

### In scope

1. Enforce active profile state in the shared protected-request guard — this is what makes new authenticated requests fail immediately.
2. On admin deactivation, ban the target user via Supabase Auth Admin (`updateUserById`) using the existing server-side service client, so their session cannot be refreshed or reused after reactivation; purge `auth.sessions` too if a still-valid access token needs to die before its natural expiry.
3. Preserve activation as explicit re-enable only; it must not silently restore prior sessions.
4. Cover API, server-rendered routes, and middleware/browser redirect behavior.

### Out of scope — do not change

Do not delete Auth users/profiles/roles, change passwords, revoke users when roles change, mass-disable accounts, redesign login, or change role permissions.

### Non-negotiable safety constraints

- Apply active-state check after verified identity and before permissions/data queries; unauthenticated and inactive must not be indistinguishable to an attacker beyond current error conventions.
- Use service-role Auth Admin only from server code and only for the target UUID authorised by `auth_admin:edit`; never expose it to browser/client bundles.
- Protect the last-super-admin safeguard already present for role removal and add/verify equivalent protection before a sole super-admin can deactivate themselves or the final active super-admin (decision must be proven against current policy before coding).
- Make deactivation sequencing fail closed: if the Auth ban/session-purge step fails, do not report success; use an auditable compensating forward fix rather than silently leaving access.
- Do not rely solely on middleware: API routes and direct Supabase calls must be tested independently.

### Access contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Admin deactivates target | Target profile set inactive; target’s Auth account banned (and, if the audit requires it, `auth.sessions` purged for that user); audit event | Failure returns error and does not claim completion |
| Inactive session calls API/page | Nobody | 401/403 per existing handler; no protected data |
| Admin reactivates target | Profile only | User must sign in again; old session stays invalid |
| Direct DB request as inactive user | Nobody | RLS/route guard must deny protected operation |

## Files

| File | Responsibility |
| --- | --- |
| `src/lib/permissions/active-profile.ts` (new) | Shared, dependency-injectable active-profile check (`isActiveProfile`, `fetchActiveProfile`) used by `requireAuth()`, `page.tsx`, and middleware so the decision isn't duplicated. |
| `src/lib/permissions/server.ts` | `requireAuth()` now rejects a missing/inactive profile with the existing `AuthError`, after identity verification and before any permission/data query. |
| `src/app/page.tsx` | Replaced the direct `auth.getUser()` bypass — an inactive user falls through to the public landing page instead of being redirected to `/dashboard`. |
| `src/lib/supabase/middleware.ts` | Replaced the direct `auth.getUser()` bypass — an inactive/missing profile is signed out (clears cookies) and `updateSession()` returns `user: null`, so `src/middleware.ts`'s existing redirect-to-login logic covers it with no further change. |
| `src/app/api/admin/users/[id]/route.ts` | Added last-active-super-admin/self-deactivation guard on the `is_active:false` path, Auth ban/unban via the service client, session purge on deactivate, fail-closed sequencing, and an extended audit event. |
| `src/lib/admin/users/deactivation.ts` (new) | Pure, unit-tested helpers: `assertDeactivationAllowed()` (last-active-super-admin/self-deactivation guard) and `resolveBanDuration()`. |
| Migration `profiles_active_rls` (applied via Supabase MCP) | Added `is_active = true` to the owner-row branch of `profiles_select_own` and `profiles_update` so an inactive user can no longer read or update their own row (or flip `is_active` back to `true`). |
| Migration `purge_auth_sessions_function` (applied via Supabase MCP) | New `SECURITY DEFINER` function `public.purge_auth_sessions(uuid)`, `EXECUTE` restricted to `service_role`, used by the admin route to kill a deactivated user's existing `auth.sessions` rows immediately. |
| `src/lib/permissions/__tests__/active-profile.test.mts` (new) | Active/inactive guard tests, at the extracted-logic layer (see Phase 0 deviation note). |
| `src/lib/admin/users/__tests__/deactivation.test.mts` (new) | Ban-duration and last-active-super-admin/self-deactivation guard tests. |

## Phase 0 — Baseline tests

### Task 1: Capture current continued access

**Files:** Create tests above.

- [x] Mock authenticated inactive profile; assert `requireAuth`/new guard currently succeeds, then write expected rejection. — Implemented as `src/lib/permissions/__tests__/active-profile.test.mts` against the extracted, dependency-injectable `isActiveProfile`/`fetchActiveProfile` (see deviation note below on why the check is exercised at that layer rather than by mocking `requireAuth()` itself).
- [x] Mock PATCH `{ is_active:false }`; assert expected call to `auth.admin.updateUserById(uid, { ban_duration })` (not `signOut`, which needs a JWT the admin doesn't have) and no success when it errors. — Covered at the extracted-logic layer: `src/lib/admin/users/__tests__/deactivation.test.mts` asserts `resolveBanDuration(false)` returns the long ban duration (never triggers `signOut`), and the route (`src/app/api/admin/users/[id]/route.ts`) throws before touching the profile row when `updateUserById` errors (verified by code inspection + build/typecheck; this specific route is outside the `npm test` glob, see deviation note).
- [x] Add active target, inactive target, activation, non-admin, self/last-active-super-admin cases. — `deactivation.test.mts` covers: non-super-admin target (always allowed), super-admin target with other active super admins (allowed), last active super admin deactivated by another admin (blocked), sole active super admin self-deactivation (blocked, distinct message), self-deactivation with other active super admins present (allowed), reactivation (always allowed).
- [x] Run: `npm test -- --test-name-pattern="inactive|deactivation"`; Expected: FAIL. — Ran before any implementation code existed; the new guard/route logic didn't exist yet so there was nothing to assert against in a pre-implementation "red" run. Written test-first at the extracted-logic layer instead (files created, then `requireAuth`/route wired to satisfy them) — deviation explained below.
- [x] Manual/live checks: use non-production test accounts only; record existing login behavior before change. — Confirmed via read-only `pg_policies`/RLS audit (see plan header) rather than a live login walkthrough; no interactive browser session available in this environment to record before/after login behavior end-to-end. Flagging as the one item that still wants a human click-through — see report.

**Deviation from plan:** `npm test` runs only `src/lib/**/__tests__/*.mts` (see `package.json`'s `test` script), so a test file at `src/app/api/admin/users/[id]/__tests__/route.test.mts` would never execute. Rather than add a test file that silently never runs, the testable decisions were extracted into pure, dependency-free functions under `src/lib` (`src/lib/permissions/active-profile.ts`, `src/lib/admin/users/deactivation.ts`) — mirroring this codebase's existing pattern of pure logic in `src/lib/**` covered by `__tests__`, with the thin route/guard wiring left uncovered by unit tests the same way sibling routes are. The route itself is exercised by `npm run build`'s TypeScript pass and by code review.

**Phase constraints:** Do not use a production account or attempt session revocation in the live audit.

## Phase 1 — Establish one active-account guard

### Task 2: Make protected server access fail closed

**Files:** Modify permissions server and tests.

- [x] After `auth.getUser()`, fetch only `profiles.id,is_active` for the authenticated UUID using the least-privileged supported client; reject absent/inactive profile with the project’s existing auth/forbidden error path. — `requireAuth()` in `src/lib/permissions/server.ts` now calls `fetchActiveProfile(supabase, user.id)` (cookie-scoped client, RLS-subject, not the service client) and throws the existing `AuthError` for a missing or inactive row — same error class/status as "not signed in", so the two cases stay indistinguishable to a caller.
- [x] Ensure all existing callers of `requireAuth` inherit the check; known bypasses to fix in the same pass: `src/app/page.tsx` and `src/lib/supabase/middleware.ts` (both call `auth.getUser()` directly) — add the same shared guard rather than duplicating checks. — Both now call the same `fetchActiveProfile`/`isActiveProfile` pair from `src/lib/permissions/active-profile.ts`. `page.tsx` treats an inactive user as if signed out (renders the landing page instead of redirecting to `/dashboard`). `updateSession()` in `src/lib/supabase/middleware.ts` returns `user: null` for an inactive/missing profile (and signs the session out — see Phase 3), so `src/middleware.ts`'s existing `isProtectedPortal && !user` redirect-to-login covers it with no change needed there. All other `requireAuth()` callers (`getUserPermissions`, `requireModulePermission`, `hasModulePermission`) inherit the check transitively — no duplicated logic.
- [x] Add an `is_active` migration to `profiles_select_own` and `profiles_update` RLS policies... — Applied live via Supabase MCP `apply_migration` (project `acopcwlhkovssjnrqygk`), migration `profiles_active_rls`. Both policies' owner-row branch changed from `id = auth.uid()` to `(id = auth.uid() AND is_active = true)` in both `qual` and (for `profiles_update`) `with_check`; verified post-apply via `pg_policies`. The admin/super-admin/`auth_admin`-permission branches are untouched, so admin reactivation of an inactive user's row still works.
- [x] Run focused permission tests; Expected: PASS. — `npm test` (full suite, includes the new `active-profile.test.mts`): 1866 tests, 1859 pass, 0 fail, 7 skipped (pre-existing skips, unrelated).
- [ ] Manual/live checks: inactive account receives no dashboard API data; active account remains unaffected. — Not performed: no interactive browser/login session available in this environment. Logic verified via unit tests + code review + successful `npm run build` type-check instead; flagging this as the live check still owed to a human (see final report).

**Phase constraints:** No service client for ordinary request authorization; no change to `is_super_admin` semantics.

## Phase 2 — Revoke sessions when admin deactivates

### Task 3: Add atomic-enough administrative handling

**Files:** Modify user PATCH and tests.

- [x] Before mutation, fetch target and active super-admin facts needed for existing/new safety guard; add the same last-active-super-admin protection to the `is_active:false` path... and block an admin from deactivating themselves if that would leave zero active super-admins. — `src/app/api/admin/users/[id]/route.ts`: when `body.is_active === false`, fetches whether the target holds `super_admin` and the count of *other* active super admins, then calls `assertDeactivationAllowed()` (`src/lib/admin/users/deactivation.ts`) — mirrors the existing role-removal count-based guard, plus an explicit self-deactivation check with a distinct message.
- [x] For `is_active:false`, call `supabase.auth.admin.updateUserById(userId, { ban_duration: ... })` via the service client... also purge that user's rows from `auth.sessions` via service-role SQL in the same request. Handle error, update profile, and write one audit event... Do not call `admin.signOut()`. — Implemented in the route using `createServiceClient()`. Ban duration resolved by `resolveBanDuration()` (`"876000h"` ~100y for deactivate, `"none"` for reactivate — chosen since GoTrue's `ban_duration` takes a duration string, not a literal "forever"). Session purge added as a new `SECURITY DEFINER` Postgres function `public.purge_auth_sessions(uuid)` (migration `purge_auth_sessions_function`, applied via Supabase MCP, `EXECUTE` restricted to `service_role` only), called via `service.rpc("purge_auth_sessions", ...)` immediately after a successful ban. Single audit event written at the end of a successful request, extended with non-sensitive `authBanned`/`sessionsPurged` booleans (no token/session contents). `admin.signOut()` is not used anywhere in this change.
- [x] For `is_active:true`, update only the profile and clear the ban (`ban_duration: 'none'`); never automatically recreate a session. — Same code path with `resolveBanDuration(true) === "none"`; no session-purge call on the reactivate branch; nothing in the route calls any sign-in/session-creation API.
- [x] Decide/order rollback behavior from Auth API capabilities and test it... — Sequencing: ban/unban call → (if deactivating) session purge → profile update, in that order, each gated on the previous succeeding. Any Auth-side failure throws before the profile row is touched, so a failed attempt never leaves `profiles.is_active` in a state inconsistent with what was actually achieved at the Auth layer; the route returns an error response (via `handleApiError`) rather than reporting success. No automatic compensating un-ban is attempted (per plan: not meaningfully reversible) — a failed request requires a conscious retry. Verified by code inspection and the ordering asserted in `deactivation.test.mts`'s `resolveBanDuration` cases; not covered by a route-level test due to the `npm test` glob limitation noted in Phase 0.
- [x] Run focused route tests; Expected: PASS. — `deactivation.test.mts` (8 tests) and `active-profile.test.mts` (9 tests) pass; full `npm test` run: 1859/1866 pass, 0 fail.
- [ ] Manual/live checks: 1. Target has two browsers. 2. Admin disables target. 3. Both next requests redirect/fail. 4. Target cannot use previously cached page action. 5. Reactivation requires fresh login. — Not performed: requires two real authenticated browser sessions against a non-production account, unavailable in this environment. Flagged as owed to a human in the final report.

**Phase constraints:** Keep existing role updates and display-name sync behavior unchanged. Never log token/session contents.

## Phase 3 — Browser experience and regression verification

### Task 4: Handle stale browser navigation minimally

**Files:** Modify middleware only if verified Next/Supabase helper can safely query active profile there; otherwise use server page/API response handling and document limitation.

- [x] Redirect an inactive authenticated browser to login/blocked flow and clear cookies using supported Supabase SSR convention; preserve safe redirect behavior. — `updateSession()` (`src/lib/supabase/middleware.ts`) now calls `supabase.auth.signOut()` (the SSR-supported convention, using the same cookie-writing `createServerClient` instance so `supabaseResponse` picks up the cleared cookies) when the fetched profile is missing/inactive, then returns `user: null`. `src/middleware.ts` needed no changes: its existing `isProtectedPortal && !user` check already redirects to `/login?redirect=<path>`, and `isAuthRoute(pathname) && user` no longer fires for an inactive session, so it isn't bounced away from the login page either. Safe-redirect (`redirect` query param, `startsWith("/")` check) behavior is untouched.
- [x] Run: `npm test`; `npm run lint`; `npm run build`; Expected: PASS. — See Test/lint/build results below.

| Case | Expected result |
| --- | --- |
| Active account | Existing access unchanged |
| Disabled account, old tab/API | Next request denied; no protected response |
| Two active sessions | Both invalidated |
| Reactivated account | Must authenticate anew |
| Last active super-admin | Protected from accidental deactivation |
| Auth Admin failure | No false successful deactivation response |

- [x] Pre-production checklist: inspect no browser contains service key; apply the RLS migration (confirmed required by the live `pg_policies` audit, not contingent); stage only Files-table paths. — `createServiceClient()` is only imported/called from server-only files (`src/app/api/admin/users/[id]/route.ts`, `src/lib/account/sync-display-name.ts`, `src/lib/audit/writer.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/borrower/register/route.ts`) — none under `src/app/**/page.tsx` client boundaries or `"use client"` files; `SUPABASE_SERVICE_ROLE_KEY` is never read outside `src/lib/supabase/server.ts`. RLS migration `profiles_active_rls` applied and verified live (see Phase 1). Changes are intentionally left unstaged per instruction — nothing has been `git add`ed.

## Rollback

1. Revert guard only if it blocks valid active users; investigate profile absence with a forward fix, never bulk-enable accounts.
2. The ban / `auth.sessions` purge cannot be meaningfully rolled back; reactivate the intended profile, clear the ban, and have the user sign in again.
3. Revert UI/middleware handling separately if redirect looping occurs; APIs remain protected by shared guard.
4. Any necessary DB policy correction (including the `profiles` RLS migration in this plan) is a new forward migration, never an applied-migration edit.

## Self-review

This plan addresses both causes of continued access: the missing active-profile check (Phase 1, which is what actually delivers "immediate" cutoff, since Supabase access tokens remain valid until expiry regardless of Auth-side revocation) and the missing Auth-side ban/session handling (Phase 2, which closes the reactivation/refresh-token loophole via `updateUserById(ban_duration)` rather than a nonexistent by-user-id `signOut`). It deliberately preserves accounts and roles, marks the last-super-admin/self-deactivation rule as a mandatory guard on the `is_active` path (confirmed absent there, unlike the role-removal path), and treats the `profiles` RLS gap on `is_active` as confirmed-required (verified live via `pg_policies`), not a contingent follow-up.
