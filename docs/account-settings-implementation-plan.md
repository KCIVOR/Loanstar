# Account Settings (Full) — Implementation Plan

> **For agentic workers:** Execute phase-by-phase. Do not skip ahead. Each phase must leave the app green (existing flows untouched). Prefer TDD where helpers/APIs are new. Use checkbox tracking below.

**Goal:** Give every authenticated user a shared **Account Settings** surface (name, phone, avatar, preferences, notifications) without breaking borrower KYC profile, admin user management, RLS, or portal routing.

**Architecture:** Keep **account identity** (`profiles` + Auth) separate from **loan applicant profile** (`borrowers` + `/borrower/profile`). Add a shared `/account` route (with `AppShell` layout) for all roles. Self-updates go through a dedicated API with column allowlists. Sync `profiles.full_name` ↔ Auth `user_metadata.full_name`. Notifications are additive (new table + writers); never change loan workflow triggers until channel prefs are consulted as soft filters.

**Tech stack:** Next.js App Router, Supabase Auth + Postgres RLS, Storage buckets, existing Resend/Twilio send helpers, Meridian UI (`Avatar`, `Toggle`, `PhoneInput`, `Alert`).

**Feasibility:** Yes — possible on current stack. Not a header redirect alone; requires schema, RLS, APIs, and UI. Estimated effort: medium for Phases 0–4; larger for Phase 5–6 (real notifications).

**Plan validation:** Re-checked against live DB + codebase on 2026-07-19. Corrections from that pass are incorporated below (layout file, trigger/`auth.uid()` rules, reminder→`user_id` lookup, channel-toggle footgun, file-map/`SelfPermissions`, Header vs PortalNav facts).

---

## Audit summary (read-only, 2026-07-19)

### What exists

| Area | Finding |
|------|---------|
| `profiles` | `id`, `email`, `full_name`, `is_active`, timestamps only. Created by `handle_new_user` on signup. |
| RLS | Users can **SELECT** own profile. **UPDATE** is admin/`auth_admin:edit` only — **no self-update**. |
| Display name | Header uses `/api/permissions/me` → Auth `user_metadata.full_name`. Admin PATCH updates `profiles.full_name` only → **dual source of truth / drift**. |
| Header | Profile → hardcoded `/borrower/profile` (wrong for staff). Settings → disabled “Coming soon”. Bell → static empty stub. |
| Sidebar / PortalNav | No Profile/Settings nav item for borrower or staff — account entry is **Header-only** today. `/borrower/profile` is reached via direct URL / borrower flows, not PortalNav. |
| Borrower profile | `/borrower/profile` = SF/KYC form on `borrowers`. Must stay. |
| Storage | `loan-documents` (private) + `branding` (public). Upload pattern in `src/lib/documents/storage.ts`. No avatars bucket. |
| Notifications | No table/API. Email (Resend) + SMS (Twilio) exist for transactional/reminders only. `reminder_log` is loan-reminder audit, not user inbox. |
| Reminder contacts | `src/lib/collector/reminders.ts` sends to `borrowers.email` / `borrowers.mobile_phone` (KYC), **not** `profiles.phone`. Channel prefs (Phase 6) must resolve `borrowers.user_id` → `profiles.preferences`. |
| Middleware | Path allowlist; `/account` not listed yet → would be unprotected shell unless added. |
| Portal layouts | Every portal has `layout.tsx` wrapping `AppShell`. `/account` needs the same. |
| Reusable UI | `PhoneInput`, `Toggle`, `Avatar` (initials only — no `src`), `FileDropzone`, form primitives. |

### Hard boundaries (do not break)

1. **Never merge** account phone/avatar with `borrowers.mobile_phone` / KYC form fields.
2. **Never** expose `is_active` or role assignment on self-service settings.
3. **Do not** replace `/borrower/profile` — borrowers may keep Application Profile + Account Settings.
4. **Do not** change committee/CSA/LRA workflow triggers in early phases; notification writers are additive.
5. Admin Users page must keep working; **in Phase 2**, admin name edits must also sync Auth `user_metadata.full_name`.
6. SMS/email reminder jobs must keep working if prefs are empty / keys missing (**fail-open**) until Phase 6 explicitly gates channels.
7. **Do not persist channel toggles** (`notifications.email` / `notifications.sms`) to the DB before Phase 6 — avoids writing `sms: false` on first Account save and silently killing reminders later.

### Risks to mitigate

| Risk | Mitigation |
|------|------------|
| Staff hit 403 on Profile link | Phase 2: point Header Profile/Settings to `/account` |
| User self-updates `is_active` | Column allowlist in API + DB trigger that blocks non-admin changes to `is_active`/`email` |
| Trigger blocks admin/service updates | Allow when `auth.uid()` is null (service role) **or** `is_super_admin()` / `has_module_permission('auth_admin','edit')` |
| Name drift Header vs Admin | Single write path that updates both `profiles` and Auth metadata (Phase 2) |
| Avatar in private bucket | Prefer public `avatars` bucket with path `{user_id}/…` + write RLS |
| Channel-toggle footgun | Phases 2–5: UI may show read-only “coming in Phase 6” or omit email/SMS toggles; only timezone/locale (and later in-app) persist early |
| Reminder prefs wrong target | Phase 6: look up prefs via `borrowers.user_id`; if `user_id` null or prefs key missing → **allow send** |
| Notification spam / wrong recipients | Phase 5 inbox first (in-app only); Phase 6 prefs gate email/SMS |
| Middleware gap | Add `/account` to protected prefixes |
| Missing shell | Add `src/app/account/layout.tsx` with `AppShell` |

---

## Recommended source of truth

| Field | Canonical | Also sync |
|-------|-----------|-----------|
| Login email | `auth.users.email` | Keep `profiles.email` updated on change (optional later) |
| Display name | `profiles.full_name` | Auth `user_metadata.full_name` on every write |
| Account phone | `profiles.phone` (new) | — (not used for loan reminders; KYC phone stays on `borrowers`) |
| Avatar | `profiles.avatar_url` (new) | — |
| Prefs | `profiles.preferences` jsonb (new) | — |
| In-app notifications | `notifications` table (new) | — |
| Channel prefs | inside `preferences.notifications` | Consulted by send helpers **only after Phase 6** |

`/api/permissions/me` should prefer `profiles.full_name` (fallback Auth metadata → email) so Header matches Admin list. Extend `SelfPermissions` when adding `avatarUrl`.

### Fail-open rule (channel prefs)

`shouldSendChannel` (Phase 6) must treat these as **ALLOW**:

- No `profiles` row
- `preferences` empty / null
- `preferences.notifications` missing
- Specific key (`email` / `sms`) **missing** (not set)

Only an **explicit** `false` after Phase 6 UI persist may skip that channel.

---

## File map (planned)

| Path | Responsibility |
|------|----------------|
| `supabase/migrations/YYYYMMDDHHMMSS_account_settings_profiles.sql` | Columns + self-update RLS + protect `is_active`/`email` |
| `supabase/migrations/YYYYMMDDHHMMSS_avatars_bucket.sql` | Storage bucket + policies |
| `supabase/migrations/YYYYMMDDHHMMSS_notifications.sql` | `notifications` table + RLS |
| `src/app/api/account/route.ts` | GET/PATCH own account |
| `src/app/api/account/avatar/route.ts` | Signed upload / set / clear avatar |
| `src/app/api/account/notifications/route.ts` | List / mark read |
| `src/lib/account/types.ts` | Types + zod schemas |
| `src/lib/account/sync-display-name.ts` | Sync profiles ↔ Auth metadata |
| `src/lib/account/preferences.ts` | Defaults + merge helpers (channel keys not written until Phase 6) |
| `src/lib/notifications/write.ts` | Insert in-app notification (service) |
| `src/lib/notifications/should-send-channel.ts` | Fail-open channel gate (Phase 6) |
| `src/app/account/layout.tsx` | `AppShell` wrapper (required; mirrors other portals) |
| `src/app/account/page.tsx` | Shared settings UI |
| `src/middleware.ts` | Protect `/account` |
| `src/components/admin/Header.tsx` | Links + optional avatar img + bell feed |
| `src/components/ui/Avatar.tsx` | Optional `src` prop (Phase 3) |
| `src/app/api/permissions/me/route.ts` | Read display name (and later `avatarUrl`) from `profiles` |
| `src/lib/permissions/types.ts` | Extend `SelfPermissions` (`avatarUrl?`) |
| `src/app/api/admin/users/[id]/route.ts` | Sync Auth metadata on admin rename |
| **Do not modify** | `src/app/borrower/profile/*`, `ApplicantProfileFields` KYC meaning, loan workflow endorse/vote/release logic |

---

## Phase 0 — Prep & contracts (no user-facing change)

**Goal:** Lock contracts and tests so later phases stay surgical.

- [x] **0.1** Document field allowlist for self PATCH: `fullName`, `phone`, `preferences` (partial merge — **non-channel keys only** until Phase 6). `avatar_url` only via avatar API (Phase 3). Forbidden: `is_active`, `email`, `id`. Implemented in `src/lib/account/preferences.ts` + `types.ts`.
- [x] **0.2** Define default `preferences` shape (in-memory defaults; do not force-write channel keys on every save):

```ts
{
  timezone?: string;           // e.g. "Asia/Manila"
  locale?: string;             // e.g. "en-PH"
  notifications?: {
    inApp?: boolean;           // default true when read; may persist from Phase 4/5
    email?: boolean;           // default true when read; **persist only from Phase 6**
    sms?: boolean;             // default true when read for fail-open parity with reminders; **persist only from Phase 6**
  }
}
```

- [x] **0.3** Product decisions (recorded in `src/lib/account/types.ts`):
  - **Decision A:** Channel keys absent ⇒ send (fail-open). Explicit `false` ⇒ skip. (`isChannelSendAllowed`)
  - **Decision B:** After Phase 6 UI, default toggles when first shown: email **on**, SMS **on** for borrowers (match today’s reminder behavior); staff operational emails remain ungated unless product asks later.
- [x] **0.4** Unit tests for preference merge + allowlist + fail-open “key missing” (TDD) in `src/lib/account/__tests__/preferences.test.mts` (11 tests).

**Exit:** Defaults and allowlist agreed; no production behavior change.

---

## Phase 1 — Schema + self-update safety (DB first)

**Goal:** DB can store account fields; users can update only safe columns; admins still can.

- [x] **1.1** Migration: add to `profiles`:
  - `phone text null`
  - `avatar_url text null`
  - `preferences jsonb not null default '{}'::jsonb`
  - File: `supabase/migrations/20260719120000_account_settings_profiles.sql` (applied via MCP `account_settings_profiles`)
- [x] **1.2** Replace/extend `profiles_update` RLS:
  - Keep admin/`auth_admin:edit` full update.
  - Add: authenticated may `UPDATE` where `id = auth.uid()`.
- [x] **1.3** Add trigger **`profiles_protect_sensitive_columns`** (BEFORE UPDATE):
  - If `NEW.is_active IS DISTINCT FROM OLD.is_active` OR `NEW.email IS DISTINCT FROM OLD.email`, allow only when:
    - `auth.uid() IS NULL` (service role / bypass), **OR**
    - `public.is_super_admin()`, **OR**
    - `public.has_module_permission('auth_admin', 'edit')`
  - Otherwise `RAISE EXCEPTION`.
  - Self-updates to `full_name` / `phone` / `avatar_url` / `preferences` remain allowed under RLS.
- [x] **1.4** Do **not** yet change Header or create UI. (Honored — no UI/Header changes.)
- [x] **1.5** Verify via SQL/MCP:
  - Service can update `phone` / `preferences`
  - Simulated non-admin JWT **blocked** from flipping `is_active` (row stayed active)
  - Service can deactivate and restore `is_active`

**Exit:** Schema ready; existing app still works (new columns unused).

**Rollback:** Drop columns / restore old RLS policy migration.

---

## Phase 2 — Account API + `/account` page (MVP)

**Goal:** Fix wrong Profile redirect; read/edit name + phone + safe prefs (timezone/locale only); sync display name.

- [x] **2.1** `src/lib/account/sync-display-name.ts` — updates `profiles.full_name` + Auth `user_metadata.full_name` (service helper; admin uses metadata-only sync after profiles write).
- [x] **2.2** `GET/PATCH /api/account` — `requireAuth()` only (no module permission). GET returns `{ fullName, email, phone, avatarUrl, preferences, roles }`. PATCH allowlisted fields; merge preferences **without writing `notifications.email` / `notifications.sms`**; sync name.
- [x] **2.3** Change `/api/permissions/me` to load `profiles.full_name` (fallback metadata → email via `resolveDisplayName`). **Do not** remove roles logic.
- [x] **2.4** Admin `PATCH /api/admin/users/[id]`: when `full_name` changes, also sync Auth `user_metadata.full_name`.
- [x] **2.5** Add `src/app/account/layout.tsx` — `<AppShell title="Account">{children}</AppShell>` (required).
- [x] **2.6** `src/app/account/page.tsx` — sections: Identity (name, read-only email), Phone (`PhoneInput`), Preferences (**timezone / locale only**). Channel toggles omitted with note for later phase.
- [x] **2.7** `middleware.ts` — protect `/account` prefix like other portals.
- [x] **2.8** `Header.tsx`:
  - Profile → **Account** `/account`.
  - Settings → `/account#preferences`.
  - `/borrower/profile` left intact for KYC.
- [x] **2.9** Optional copy-only: skipped — no borrower “Edit profile” button present.
- [x] **2.10** Tests: `display-name.test.mts` + existing preferences allowlist/merge (channel keys not written).
- [ ] **2.11** Manual: login as CSA → Account saves name → Header updates; borrower still uses `/borrower/profile`; admin deactivate still works.

**Exit:** Every role can open Account Settings; staff no longer sent to borrower KYC page.

---

## Phase 3 — Avatar

**Goal:** Upload/display avatar without touching loan-documents.

- [x] **3.1** Migration: public bucket `avatars` (image mime types, 2MB). Policies: write/delete only under folder `auth.uid()`; public read. File: `20260719130000_avatars_bucket.sql` (applied).
- [x] **3.2** Extend `Avatar` UI component with optional `src` (keep initials fallback).
- [x] **3.3** `POST/DELETE /api/account/avatar` — server upload; set/clear `profiles.avatar_url`.
- [x] **3.4** Account page: avatar upload/remove.
- [x] **3.5** Header: show image when `avatarUrl` present — `/api/permissions/me` + `SelfPermissions.avatarUrl`.
- [ ] **3.6** Manual: upload as staff; hard-refresh; document uploads still use `loan-documents` only.

**Exit:** Avatars work; document uploads unaffected.

---

## Phase 4 — Preferences polish (still no send-path changes)

**Goal:** Stable prefs helpers + UI for **safe** keys only.

- [x] **4.1** Harden merge helper (deep merge; ignore unknown keys; **strip/forbid** persisting `notifications.email` / `notifications.sms` until Phase 6).
- [x] **4.2** Account UI: timezone / locale + **in-app** toggle (`notifications.inApp`). Email/SMS toggles still omitted.
- [x] **4.3** Read-path defaults via `preparePreferencesResponse` / `preferencesResolved` on GET — **no** channel-key backfill into DB.
- [x] **4.4** Unit tests in `preferences-phase4.test.mts` (+ existing Phase 0 suite).

**Exit:** Prefs stored for safe keys; send paths still ignore prefs (explicit).

---

## Phase 5 — In-app notifications (inbox)

**Goal:** Bell becomes real; no change to email/SMS sending yet.

- [x] **5.1** Migration `notifications` applied (`20260719140000_notifications.sql`) — RLS select/update own; insert via service role.
- [x] **5.2** `src/lib/notifications/write.ts` — `notifyUser` / `notifyBorrowerForApplication` (honors in-app pref; never throws).
- [x] **5.3** `GET/PATCH /api/account/notifications` — list + unread count + mark one/all read.
- [x] **5.4** Header bell: live list, unread badge, mark all read, link to `/account#notifications`.
- [x] **5.5** Surgical writers:
  1. Borrower: endorse → CIG; CIG forward → committee; approve / deny
  2. Agent: lead converted
- [x] **5.6** Unit tests in `inbox.test.mts`. Manual bell smoke left open.

**Exit:** In-app inbox works; email/SMS unchanged.

---

## Phase 6 — Wire channel prefs (email / SMS) carefully

**Goal:** Respect prefs without breaking production reminders.

- [x] **6.0** Confirm Phase 0.3 decisions are recorded (Decision A fail-open; Decision B defaults email/SMS on).
- [x] **6.1** Add `src/lib/notifications/should-send-channel.ts` — `shouldSendChannel` / `evaluateChannelPreference` with **fail-open** when profile/prefs/key missing.
- [x] **6.2** Reminder integration (`src/lib/collector/reminders.ts`):
  - Contact from `borrowers.email` / `borrowers.mobile_phone` (unchanged).
  - Prefs via `borrowers.user_id` → `profiles.preferences`.
  - Null `user_id` → **allow**; explicit `false` → skip with reason (not logged as sent).
- [x] **6.3** Denial email path: gates on `borrower.user_id` prefs; fail-open if missing; audits skip reason.
- [x] **6.4** Admin “test SMS” remains admin-forced (**bypass** prefs) — no gate added to `/api/admin/sms/test`.
- [x] **6.5** Do **not** gate internal staff operational emails (honored).
- [x] **6.6** Account UI persists `notifications.email` / `notifications.sms`; PATCH uses `allowChannelKeys: true`. Defaults on = fail-open parity.
- [ ] **6.7** Manual matrix: explicit off → skip + log reason; on → send; missing key / null `user_id` → send (legacy).
- [x] **6.8** Pref-blocked channels are skipped **before** send and do **not** write `reminder_log` (only successful sends log).

**Exit:** Prefs affect channels; users who never set channel keys behave as before.

**Note:** Phase 5 inbox was completed after Phase 6; channel gates remain independent of the bell.

---

## Phase 7 — Hardening & cleanup

- [x] **7.1** Audit events for account PATCH + avatar upload/remove (`module_slug = account_settings`).
- [x] **7.2** Avatar upload rate limit: 5 per 10 minutes (audit-backed count via service client; 429 when exceeded).
- [x] **7.3** Copy pass: Header **Account**; `/borrower/profile` titled **Application profile**.
- [x] **7.4** Docs: `ADMIN_GUIDE.md` section + manual E2E “Account settings smoke” table.
- [ ] **7.5** Full loan happy-path regression — manual (see `manual-e2e-test-journey.md` + Account smoke A.1–A.6).

**Exit:** Feature complete; no workflow regressions.

---

## Explicit non-goals (this plan)

- Borrower↔AM chat
- Push/web-push
- 2FA / passkeys (can be a later plan)
- Changing loan coverage, endorse, or committee rules
- Merging KYC phone into account phone
- Using `profiles.phone` as the reminder SMS destination (reminders stay on `borrowers.mobile_phone`)
- Replacing Auth email confirmation with anything new

---

## Phase dependency graph

```text
Phase 0 (contracts)
    → Phase 1 (DB/RLS)
        → Phase 2 (API + /account layout + Header fix)  ← first user-visible value
            → Phase 3 (avatar)
            → Phase 4 (prefs polish — no channel persist)
                → Phase 5 (in-app notifications)
                    → Phase 6 (email/SMS prefs + reminder/denial gates)
                        → Phase 7 (hardening)
```

Ship after Phase 2 if you want a thin MVP; Full Settings = through Phase 6+.

---

## Verification checklist (before calling Full Settings done)

- [x] Staff click Profile/Settings → `/account`, not borrower KYC *(code)*
- [x] `/account` uses `AppShell` (layout present) and is middleware-protected *(code)*
- [x] Borrower can still open `/borrower/profile` and save SF form *(code; titled Application profile)*
- [x] Self cannot set `is_active` or change `email` via profiles *(Phase 1 trigger)*
- [x] Admin deactivate still works (trigger allows admin/service) *(Phase 1 verified)*
- [ ] Rename (self or admin) updates Header and Admin Users list *(manual)*
- [x] Avatar upload does not write to `loan-documents` *(separate `avatars` bucket)*
- [x] Channel keys persist only via Phase 6 Account UI (`allowChannelKeys`)
- [x] Prefs key missing or `borrowers.user_id` null ⇒ reminders still send (fail-open) *(code)*
- [x] Explicit prefs email/SMS off ⇒ those channels skip for that user *(code)*
- [x] Bell shows real notifications for wired events *(code; manual confirm)*
- [ ] Unit tests green + manual smoke of loan happy path + Account A.1–A.6

---

## Validation changelog (2026-07-19)

| Issue | Fix in this plan |
|-------|------------------|
| Missing `account/layout.tsx` | Added to file map + Phase 2.5 |
| “PortalNav Profile” claim wrong | Clarified Header-only; no PortalNav Profile item |
| Admin sync listed under Phase 1 boundary | Moved to Phase 2.4 / hard boundary #5 |
| Trigger could block service/admin | Phase 1.3 allows null `auth.uid()` + admin helpers |
| Reminder contact vs prefs unclear | Documented KYC contact + `user_id` → preferences lookup |
| Channel toggles in Phase 2 could break reminders | No channel persist until Phase 6; fail-open on missing keys |
| `SelfPermissions` omitted | Added to file map + Phase 2.3 / 3.5 |
| Phase 2.8 “Edit profile” may not exist | Marked skip-if-absent |

---

## Sign-off

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| 0 Prep | Done | 2026-07-19 | Helpers + 11 unit tests |
| 1 Schema/RLS | Done | 2026-07-19 | Migration applied + verified |
| 2 Account MVP | Done | 2026-07-19 | API + /account + Header; manual smoke left open |
| 3 Avatar | Done | 2026-07-19 | Bucket + API + UI; manual smoke open |
| 4 Prefs | Done | 2026-07-19 | Merge hardened; inApp toggle; no send-path changes |
| 5 In-app notif | Done | 2026-07-19 | Inbox + bell + surgical writers; manual smoke open |
| 6 Channel prefs | Done | 2026-07-19 | Reminders + denial gated |
| 7 Hardening | Done | 2026-07-19 | Audit + rate limit + docs; full E2E smoke still manual |
