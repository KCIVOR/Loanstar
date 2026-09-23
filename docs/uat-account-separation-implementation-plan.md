# Borrower and Staff Account Separation Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators clearly identify and filter borrower, staff, mixed-role, and unassigned accounts without changing anyone’s access.
**Architecture:** Preserve `user_roles`/`roles` as the source of truth and add a derived, non-persistent account-group read model on top of the User Management pagination contract.
**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres/RLS, Node tests.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. Live data has 62 profiles and role membership is a separate many-to-many `user_roles` relation; `profiles` has no `account_type` column. The current Admin Users GET independently fetches profiles and roles ([route](../src/app/api/admin/users/route.ts)). Therefore a stored borrower/staff flag would duplicate the authoritative membership model and fails to represent zero or multiple roles.

---

## Scope and constraints

### In scope

1. A derived `accountGroup` displayed as a badge and filter on the Admin Users page.
2. Exact groups: `borrower`, `staff`, `mixed`, `unassigned`.
3. Correct combined account-group/search/status/role pagination, after the User Management Search, Role Filter, and Pagination plan is implemented.

### Out of scope — do not change

Do not add a profile column, duplicate users/roles, split tables, move borrower records, change user access, modify registration, or make separate borrower/staff management pages.

### Non-negotiable safety constraints

- Classification is computed from the complete current role-slug set: `[] → unassigned`; exactly `{borrower} → borrower`; `borrower` plus any other role → mixed`; all other non-empty sets → staff`.
- Each profile appears once; a mixed account is never duplicated in borrower and staff lists.
- Filtering must occur before total/pagination metadata calculation, not after the current page is returned.
- Role slugs—not display names—and only active role state determine classification; audit exact borrower slug before coding.
- It is a display/filter field only: no authorization check may consult `accountGroup`.

### Account-group contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Admin requests `accountGroup=staff` | Each profile whose complete active role set maps to staff | Empty list and zero total |
| Admin changes roles | Same profile | Next reload re-derives group |
| Multi-role borrower + agent | One profile | `mixed`, never two rows |
| Non-admin request | None | Existing 403/no user-directory disclosure |

## Files

| File | Responsibility |
| --- | --- |
| `src/app/api/admin/users/route.ts` | Extend audited paginated response/query pipeline with derived group filter/result field. |
| `src/app/admin/users/page.tsx` | Add group filter and per-row badge to the upgraded Users page. |
| `src/app/api/admin/users/__tests__/route.test.mts` | Group algorithm, filtering-before-count, role-edit refresh tests. |
| `src/lib/admin/account-group.ts` (create) | Pure classification function only if no equivalent exists after audit. |
| `src/lib/admin/__tests__/account-group.test.mts` (create if helper created) | Exhaustive role-set truth table. |

## Phase 0 — Baseline tests

### Task 1: Lock the classification truth table

**Files:** Create pure helper test (if helper required) and route tests.

- [ ] Add literal cases: `[]`, `['borrower']`, `['agent']`, `['agent','committee']`, `['borrower','agent']`, duplicate/join-order role rows, inactive role excluded.
- [ ] Add paginated query cases proving account group is applied before `total`; a mixed record appears once.
- [ ] Run: `npm test -- --test-name-pattern="account group|admin users"`; Expected: FAIL.
- [ ] Manual/live checks: first verify the real borrower role slug and role-active semantics, then substitute that verified literal in implementation/tests.

**Phase constraints:** This phase depends on the Users pagination API contract; do not add a UI-only filter over a partial page.

## Phase 1 — Add the read-model field to paginated users

### Task 2: Derive and filter exactly once

**Files:** Modify users route; create helper only if justified; tests.

- [ ] Reuse the full role data already needed by the filtering plan; derive `accountGroup` only after a complete role set is known for each profile.
- [ ] Add validated query enum `all|borrower|staff|mixed|unassigned`; apply before count/range using the smallest correct query strategy established by Phase 0.
- [ ] Return `accountGroup` with each public user item while preserving existing roles list and mutations.
- [ ] Run: `npm test -- --test-name-pattern="account group|admin users"`; Expected: PASS.
- [ ] Manual/live checks: role edit causes group change after reload; page total neither loses nor duplicates profile.

**Phase constraints:** No writes to `profiles`, `user_roles`, `roles`, or `borrowers`; no authorization changes.

## Phase 2 — Present the separation without splitting data

### Task 3: Add one filter and one badge

**Files:** Modify Users page and any supported UI test.

- [ ] Add choices All accounts, Borrowers, Staff, Mixed roles, Unassigned; reset offset on change.
- [ ] Render exactly one accessible badge per row and retain roles as the authoritative editable column.
- [ ] Compose group with existing search/status/role controls; refresh results after role mutations.
- [ ] Run: `npm run lint`; Expected: PASS.
- [ ] Manual/live checks: filter each group; combine group + q + status; edit borrower+agent to agent-only then refresh; observe one staff row.

**Phase constraints:** Do not introduce side-by-side separate tables or tabs that cause a mixed profile to appear twice.

## Phase 3 — Regression verification and rollout

- [ ] Run: `npm test`; `npm run lint`; `npm run build`; Expected: PASS.

| Case | Expected result |
| --- | --- |
| Borrower only | borrower badge/filter |
| Agent/staff only | staff badge/filter |
| Borrower + agent | one mixed row |
| No active roles | unassigned row |
| Group plus pagination | total and pages correct |
| Non-admin | current 403 behavior |

- [ ] Pre-production checklist: verify zero migration/RLS/access changes and stage only Files-table paths. Implement after, not instead of, the pagination plan.

## Rollback

1. Revert response field/filter/badge together if query behavior fails.
2. Forward-fix classification mapping if audited slug differs; do not alter users or roles to fit UI categories.
3. No database/data rollback exists because the field is never stored.

## Self-review

This plan treats account separation as a derived administrative view over the verified many-to-many role model. It covers multi-role/null edge cases and pagination ordering, while explicitly excluding duplicated data, permission changes, and separate account systems.
