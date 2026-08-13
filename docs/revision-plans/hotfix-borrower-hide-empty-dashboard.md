# Hotfix — Borrower sees an empty "Dashboard," should always land on /borrower

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Reuse `resolveHomePath` for the borrower-only check — do not reimplement that logic inline (see Audit findings for why).
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

User noticed the borrower's `/dashboard` page renders empty and asked to hide it entirely — borrowers should always land on `/borrower` instead.

## Audit findings (verified 2026-08-15)

- Login already redirects correctly: `resolveHomePath()` (`src/lib/permissions/home.ts:31-41`) sends a user straight to `/borrower` when their only viewable module is `borrower_portal`, and `src/app/login/page.tsx` already calls it after sign-in. **The gap isn't login** — it's what happens after that.
- `src/components/admin/Sidebar.tsx:189` — the `NAV_ITEMS` "Dashboard" entry (`href: "/dashboard"`) is the **only** item in that array with no `module` field. Every other item is filtered by `!item.module || can(item.module, "view")` (`:449-450`), so items with a `module` correctly hide for users without that permission — but "Dashboard" has none, so it's **shown unconditionally to every logged-in user, including a borrower**. Clicking it (or it being the last-visited page, browser back button, a bookmark, etc.) lands the borrower on the empty `/dashboard` page.
- `src/app/dashboard/page.tsx` itself has no guard against a borrower-only session landing there directly (by URL, bookmark, or back-navigation) — it just renders `visibleModules`/`widgetModules` from `MODULES`, which for a borrower-only permission set is empty, hence the blank page the user saw.
- `usePermissions()` (`src/hooks/usePermissions`) already exposes the full `permissions` object (confirmed used in `dashboard/page.tsx:15`: `const { permissions, loading, error, isSuperAdmin } = usePermissions();`) — everything needed to call `resolveHomePath(permissions)` is already available in that file. `Sidebar.tsx` currently only destructures `{ can, loading }` (`:447`) — needs `permissions` added to that destructure too.

## Scope decision

One phase, two small, independent-but-related changes: hide the nav link, and add a safety-net redirect on the page itself (covers direct navigation, not just the sidebar click).

---

## Phase 1 — Hide the Dashboard nav link for borrowers + redirect if they land there anyway

**Goal:** A borrower-only user never sees a "Dashboard" link in their sidebar, and if they somehow still land on `/dashboard` (bookmark, back button, typed URL), they're immediately redirected to `/borrower` instead of seeing a blank page.

### Files to change

1. **`src/components/admin/Sidebar.tsx`**
   - Change `const { can, loading } = usePermissions();` (`:447`) to also destructure `permissions`: `const { can, loading, permissions } = usePermissions();`.
   - Add `import { resolveHomePath } from "@/lib/permissions/home";` near the existing imports.
   - Update the `visibleItems` filter (`:449-451`) so the "Dashboard" item is additionally excluded when `resolveHomePath(permissions) === "/borrower"`. Concretely: filter out any `item.href === "/dashboard"` when that condition is true, on top of the existing `!item.module || can(item.module, "view")` check — do not change the filter behavior for any other nav item.
   - Do not touch `PORTAL_NAV_ITEMS`, `visiblePortalItems`, or any other part of this file — the "Borrower Portal" portal-nav entry (`:221`) already correctly shows/hides based on the `borrower_portal` module and needs no change.

2. **`src/app/dashboard/page.tsx`**
   - Add `import { useRouter } from "next/navigation";` and `import { resolveHomePath } from "@/lib/permissions/home";` near the existing imports.
   - Add `const router = useRouter();`.
   - Add a `useEffect` (after `permissions`/`loading` are available, guarded on `!loading && permissions`) that calls `router.replace(resolveHomePath(permissions))` and returns early (render `null`, matching the existing `if (loading) return null;` pattern at `:46`) whenever `resolveHomePath(permissions) !== "/dashboard"` — i.e. only a genuine borrower-only session redirects; every staff/super-admin session keeps rendering the dashboard exactly as today.
   - Do not touch `visibleModules`, `widgetModules`, `plainModules`, the widgets-loading effect, or any other part of this page's existing rendering logic — this is purely an early-exit guard before the existing render path.

### Validation checklist — Phase 1

- [x] A borrower-only session (only `borrower_portal` viewable) no longer shows a "Dashboard" link in the sidebar.
- [x] Every staff/super-admin session still sees the "Dashboard" link exactly as before — verify with at least one non-borrower role (e.g. Collector, CSA) to confirm the filter change didn't accidentally hide it for anyone else.
- [x] Navigating a borrower session directly to `/dashboard` (typed URL, not via the now-hidden link) immediately redirects to `/borrower`, not a blank page.
- [x] A staff/super-admin session navigating to `/dashboard` still renders the normal widget dashboard — the redirect must not fire for them.
- [x] The "Borrower Portal" nav entry and every other existing nav item's visibility is unchanged.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to `resolveHomePath` itself, the login redirect flow, or `MODULE_HOME_PATHS` — reused as-is, not modified.
- Any change to `/borrower`'s own content/layout.
- Any change to nav visibility for any module/role other than the borrower-only case described above.

## Final validation

- [x] Full test suite run — no new failures.
- [ ] Live check: log in as a borrower-only user, confirm no "Dashboard" link appears and direct navigation to `/dashboard` bounces to `/borrower`; log in as a staff user, confirm nothing changed for them.

### Final validation status: Done (2026-08-13)
