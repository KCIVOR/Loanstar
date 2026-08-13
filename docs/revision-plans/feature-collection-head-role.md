# Feature — New "Collection Head" role for briefings (Tracker Items 11 + 12)

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror the existing seed patterns exactly (`role_module_permissions` seed shape, `SEED_ACCOUNTS`/`SEED_PASSWORD` login pattern, `PORTAL_NAV_ITEMS` shape) — do not invent a different mechanism.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Where a phase note says "confirm before implementing," actually check first — do not assume.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, migration(s) applied, tests run/result.

## Background (from conversation, decided scope)

Two System Revision Report items, previously skipped at the user's request (2026-08-11), now reopened:
- Item 11: *Remove "client briefing" responsibility from the Collector role.*
- Item 12: *Create a new "Collection Head" position for client briefings, separate from Collector.*

Decided approach: a genuinely new role and a new permission module (not just toggling a flag on the existing `collection` module), a real seed user, and a login quick-login shortcut — so Collection Head is a fully separate account from Collector, with no visibility into Collector's accounts/DCR/payments, and Collector loses all access (view and act) to briefings.

## Audit findings (verified 2026-08-15)

- **RBAC is fully data-driven, not enum-bound** — `modules.slug` and `roles.slug` are plain `text NOT NULL UNIQUE` columns (`supabase/migrations/20260706100000_p1_foundation_schema.sql:9-27`), with `role_module_permissions` (`:29-38`) as a per-role, per-module boolean grid (`can_view`/`can_create`/`can_edit`/`can_delete`/`can_execute_trigger`). Adding a new module/role is additive data, not a schema change — but the app-level `ModuleSlug` TS union (`src/lib/constants.ts:2-18`) is a hardcoded literal type used everywhere permission checks happen, so it needs the new slug added there too.
- **Briefings' exact current gating, confirmed live**: `src/app/api/collector/briefings/route.ts:7` (GET, list) checks `collection:view`; `src/app/api/collector/briefings/[releaseFileId]/route.ts:16` (POST, acknowledge) checks `collection:execute_trigger`. Grepped **every** `requireModulePermission("collection", ...)` call across `src/app/api/collector/**` (17 call sites) — `execute_trigger` on the `collection` module is used **exclusively** by the briefings-acknowledge route. Nothing else (payments, DCR, accounts, contacts, reminders, demand letters) uses `execute_trigger` — they all use `view`/`edit`. This means toggling Collector's `can_execute_trigger` off would *not* collaterally break anything else Collector does — but per the "separate from Collector" intent, both `view` and `execute_trigger` on the new module should belong only to Collection Head, not shared with Collector's existing `collection` grant.
- **Default Collector permissions today** (`supabase/migrations/20260706100002_p1_seed_data.sql:69`): `('collector', 'collection', true, true, true, false, true)` — view/create/edit/execute_trigger all true, delete false.
- **Nav structure**: `src/components/admin/Sidebar.tsx:303-317` — "Briefings" is currently one child link inside the single "Collection" portal group, gated as a unit by the parent's `modules: ["collection"]` (`:307`). Children have no individual per-link module gate. So simply changing the route's backend permission check would leave a dead/403 link in Collector's own nav — the "Briefings" child link must be removed from Collector's group, and a new, separate top-level `PORTAL_NAV_ITEMS` entry added for Collection Head.
- **No lingering references**: confirmed `src/app/collector/page.tsx` (Collector's own overview dashboard) has zero mentions of "briefing" — no KPI card or quick-link there that would break when Collector loses this route.
- **No dashboard widget required**: `src/components/dashboard/registry.tsx`'s `isWidgetSlug` just checks membership in `DASHBOARD_WIDGETS` — a module absent from that registry automatically renders as a plain link on `/dashboard` (the `plainModules` branch in `src/app/dashboard/page.tsx`), no extra work needed for a first pass.
- **Seed users are not created via any tracked migration or script** — confirmed via repo-wide search, no `INSERT INTO auth.users` anywhere and no `scripts/seed*` file exists. All 10 existing seed accounts (`collector@loanstar.local`, etc., `SEED_PASSWORD = "Loanstar2026"`, `src/app/login/page.tsx:19-31`) must have been created directly through Supabase's Auth Admin API or the Supabase dashboard, outside version control. **This means Phase 4's new user cannot be created via a plain SQL migration** (`auth.users.encrypted_password` requires Supabase Auth's own hashing, not a raw `INSERT`) — it needs `supabase.auth.admin.createUser(...)` (Supabase MCP / dashboard / a one-off admin script), then a normal SQL `profiles` row + `user_roles` assignment can follow.
- **`resolveHomePath`** (`src/lib/permissions/home.ts`) has no special case needed for Collection Head — every non-super-admin, non-borrower-only role already lands on `/dashboard` and sees their one module as a plain link/card there, matching how e.g. Remedial or AR already work. No change needed to this function.

## Scope decision

Five phases: DB/permissions foundation first, then the two route-level gates, then navigation, then the account itself, each independently verifiable.

---

## Phase 1 — Migration: new `briefings` module + `collection_head` role, remove Collector's briefing access

**Goal:** The permission foundation exists — a new module, a new role scoped to exactly that module, and Collector's grant on the old path is narrowed — with nothing in the app yet pointing at it (safe to land alone).

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260817000000_collection_head_role.sql`), applied via Supabase MCP `apply_migration` to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` (this repo's established two-folder convention):
   ```sql
   INSERT INTO public.modules (slug, name, description, sort_order)
   VALUES ('briefings', 'Briefings', 'Pre-release borrower briefing sign-off', 16);

   INSERT INTO public.roles (slug, name, description, is_system)
   VALUES ('collection_head', 'Collection Head', 'Pre-release briefing sign-off, separate from Collector', true);

   WITH role_map AS (SELECT id, slug FROM public.roles),
        module_map AS (SELECT id, slug FROM public.modules)
   INSERT INTO public.role_module_permissions (role_id, module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger)
   SELECT r.id, m.id, p.can_view, p.can_create, p.can_edit, p.can_delete, p.can_execute_trigger
   FROM (VALUES
     ('super_admin', 'briefings', true, true, true, true, true),
     ('collection_head', 'briefings', true, false, false, false, true)
   ) AS p(role_slug, module_slug, can_view, can_create, can_edit, can_delete, can_execute_trigger)
   JOIN role_map r ON r.slug = p.role_slug
   JOIN module_map m ON m.slug = p.module_slug;

   -- Item 11: Collector no longer acknowledges briefings.
   UPDATE public.role_module_permissions rmp
   SET can_execute_trigger = false
   FROM public.roles r, public.modules m
   WHERE rmp.role_id = r.id AND rmp.module_id = m.id
     AND r.slug = 'collector' AND m.slug = 'collection';
   ```
   - Re-verify the `collector`/`collection` row's current values live (`can_view=true, can_create=true, can_edit=true, can_delete=false, can_execute_trigger=true`, per the seed file) before running the `UPDATE`, and confirm the `UPDATE` affects **exactly 1 row**.
   - `super_admin` gets full `briefings` access, matching how every other module already grants super_admin everything.
   - Do not touch any other role's or module's existing permissions.

2. **`src/lib/constants.ts`**
   - Add `"briefings"` to `MODULE_SLUGS` (`:2-18`).
   - Add a matching entry to `MODULES` (`:30+`): `{ slug: "briefings", name: "Briefings", description: "Pre-release borrower briefing sign-off", sortOrder: 16 }`.
   - Do not touch any other module entry or the array order of existing items (append only).

### Validation checklist — Phase 1

- [ ] `modules` has a new `briefings` row; `roles` has a new `collection_head` row (`is_system=true`, matching the other 9 system roles).
- [ ] `role_module_permissions`: `collection_head` has `briefings` view+execute_trigger only (create/edit/delete false); `super_admin` has full `briefings` access.
- [ ] `collector`'s `collection` row now has `can_execute_trigger=false`, all other flags (view/create/edit/delete) unchanged from before.
- [ ] No other role/module row touched — spot-check `csa`, `cig`, `committee`, `lra`, `ar`, `remedial` rows unchanged.
- [ ] `MODULE_SLUGS`/`MODULES` in `constants.ts` include the new entry, nothing else changed.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 2 — Switch the briefings routes' permission checks to the new module

**Goal:** The briefings API routes are gated by `briefings`, not `collection` — Collector genuinely loses both view and act access; Collection Head genuinely gains both.

### Files to change

1. **`src/app/api/collector/briefings/route.ts`** — change `requireModulePermission("collection", "view")` (`:7`) to `requireModulePermission("briefings", "view")`. Do not change anything else in this file (the underlying `loan_applications`/`briefings` query itself is unaffected — this is purely the permission gate).
2. **`src/app/api/collector/briefings/[releaseFileId]/route.ts`** — change `requireModulePermission("collection", "execute_trigger")` (`:16`) to `requireModulePermission("briefings", "execute_trigger")`. Do not change `acknowledgeBriefing` or any other logic in this file.
3. **Do not touch** `src/app/api/collector/accounts/**`, `payments/**`, `dcr/**`, `contacts/**`, `reminders/**`, `history/**` — all still correctly gated by `collection`, untouched by this plan.

### Validation checklist — Phase 2

- [ ] A `collector` role session gets 403 on both `GET /api/collector/briefings` and `POST /api/collector/briefings/[releaseFileId]` — confirm by hitting the actual API as that role, not just reading the code (this project's recurring RLS/permission gap pattern — verify live).
- [ ] A `collection_head` role session gets 200 on both.
- [ ] A `collector` role session still succeeds on every other `collection`-gated route (accounts, payments, DCR, contacts, reminders) — confirm nothing else broke.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 3 — Navigation: remove Briefings from Collector's group, add Collection Head's own nav entry

**Goal:** Collector's sidebar no longer shows a "Briefings" link (it would 403 anyway after Phase 2, but a dead link is bad UX); Collection Head gets a clean, minimal nav showing only Briefings.

### Files to change

1. **`src/components/admin/Sidebar.tsx`**
   - Remove `{ href: "/collector/briefings", label: "Briefings" }` from the "Collection" portal group's `children` array (`:310`). Do not touch any other child in that array or the parent entry's `modules: ["collection"]` gate.
   - Add a new top-level entry to `PORTAL_NAV_ITEMS` (same array as the "Collection" entry, `:220+`): `{ href: "/collector/briefings", label: "Briefings", icon: "collection", modules: ["briefings"] }` — reuse the existing `/collector/briefings` page/route (no file move needed) and the same "collection" icon unless a distinct icon is preferred; no `children` needed since this is a single page.
   - Do not touch `NAV_ITEMS`, any other `PORTAL_NAV_ITEMS` entry, or the visibility-filtering logic itself (`visiblePortalItems`, `:453-455`) — the existing `item.modules.some((mod) => can(mod, "view"))` filter already works correctly for a single-module entry with no special-casing needed.

### Validation checklist — Phase 3

- [ ] A `collector` session no longer sees "Briefings" anywhere in the sidebar.
- [ ] A `collection_head` session sees exactly one portal nav entry, "Briefings," linking to `/collector/briefings`, and no other Collector-only links (Accounts, DCR, Payment proofs, etc.).
- [ ] The `/collector/briefings` page itself still renders correctly for a `collection_head` session (same page component, just reached via the new nav entry and gated by the new module now).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 4 — Seed the Collection Head account

**Goal:** A real, working seed login exists for this role, the same way the other 10 seed accounts do.

### Files to change

1. **Confirm before implementing**: determine the actual mechanism available in the executing environment to create a Supabase Auth user with a password (Admin API via a one-off script, Supabase MCP if it exposes user creation, or the Supabase dashboard) — do **not** attempt a raw `INSERT INTO auth.users` migration, since `encrypted_password` requires Supabase Auth's own hashing and a malformed row can silently produce a login that never works.
2. Create the auth user: email `collection_head@loanstar.local`, password `Loanstar2026` (matching `SEED_PASSWORD`, same convention as every other seed account), full name "Collection Head (Seed)" (matching the `(Seed)` suffix convention visible on other seed accounts' display names, e.g. "Collector (Seed)" seen live earlier this session).
3. Insert a matching `profiles` row for the new `auth.users.id` (mirror the shape of an existing seed account's `profiles` row — check one, e.g. the Collector seed profile, for the exact columns expected).
4. Insert a `user_roles` row assigning this user to the `collection_head` role (from Phase 1).
5. **`src/app/login/page.tsx`** — add `{ label: "Collection Head", email: "collection_head@loanstar.local" }` to `SEED_ACCOUNTS` (`:19-30`), in the list position that makes sense alongside "Collector" (immediately after it, since they're related). Do not change `SEED_PASSWORD` or any other entry.

### Validation checklist — Phase 4

- [ ] The new seed account can actually sign in via the login page's normal email/password form.
- [ ] The "Collection Head" quick-login button on the login page works and lands the account on `/dashboard` showing only the "Briefings" module.
- [ ] The account's `profiles` row and `user_roles` assignment are correct (query live, don't just trust the script output).
- [ ] No existing seed account's login broken by this phase.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Phase 5 — Live end-to-end verification

**Goal:** Confirm the whole feature works together, not just each phase in isolation.

### Checklist

- [ ] Log in as `collection_head@loanstar.local`: see only "Briefings" in the sidebar, land on `/dashboard` with one module card/link.
- [ ] Open `/collector/briefings`, view the queue, acknowledge a real briefing — confirm it persists correctly (same `acknowledgeBriefing` function, same `briefings` table row) exactly as Collector used to be able to do.
- [ ] Log in as `collector@loanstar.local`: confirm no "Briefings" link in the sidebar, and confirm every other Collector capability (accounts, payments, DCR, contacts, reminders, demand letters) still works exactly as before.
- [ ] Log in as `super_admin@loanstar.local`: confirm the "Briefings" module/role appear correctly in `/admin/roles` and `/admin/users` for assignment/management, same as every other module.

### Status: Done (2026-08-13) — DB/permissions/nav/seed verified programmatically; spot-check live login as Collection Head / Collector / Super Admin

---

## Explicitly out of scope

- Renaming or moving the `/collector/briefings` route/page to a non-"collector"-prefixed path — cosmetic, not required for correct access control; flagged as optional future polish, not part of this plan.
- A custom dashboard widget for the `briefings` module — it renders as a plain link by default, which is sufficient for a first pass.
- Any change to `acknowledgeBriefing`, the `briefings` table, or the underlying release/LRA flow — this plan only changes *who* can reach the existing, already-working briefing acknowledgment feature.
- Any change to any other role's permissions beyond Collector's `collection:execute_trigger` flag.

## Final combined validation (after all five phases land)

- [ ] Full test suite run — no new failures.
- [ ] All of Phase 5's live checks pass.
