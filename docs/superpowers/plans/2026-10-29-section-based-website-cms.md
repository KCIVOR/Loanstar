# Section-Based Website CMS Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan phase by phase with verification checkpoints. Do not start implementation from this planning request. Checkboxes track implementation work, not work completed while writing this document.

**Goal:** Give administrators a section-based content editor for the landing, login and registration pages, with one shared website release and Super Admin-only publishing.

**Architecture:** Typed content bundles separate presentation from existing authentication and registration behavior. Drafts and media remain private; one immutable revision supplies the published content for all three pages and public branding. Database transactions govern publication, history, conflict checks and critical audit writes.

**Tech Stack:** Existing Next.js 16.2.10 App Router, React 19, TypeScript, Zod, Supabase Postgres/Auth/Storage, current permission framework, Node tests and Playwright. No external CMS or deployment service is required.

**Environment:** Local application on `staging`; database changes only on Supabase `ddsvqjaknuniekygpbdr`. Never target production `acopcwlhkovssjnrqygk` under this plan.

**Execution update (2026-10-30):** Feature phases 1–8 are implemented and reviewed. Four CMS migrations are applied and verified on staging. Final local production build, focused lint, 29 unit/navigation tests, eight mocked browser regressions and the extended real staging browser flow (concurrent save/publish, all three previews, publication and audited restore) have passed. The local development server remains on port 3000. Phase 9 and Phase 10 verification evidence and remaining limits are tracked in `docs/website-cms-final-verification.md`. Original Phase 0 screenshots were not recovered; individual checkboxes below remain an explicit checklist rather than being blanket-marked complete. No production deployment is claimed.

---

## Confirmed decisions and planning defaults

Confirmed by the user:

- Landing, login **and registration** publish together as one website release.
- Only Super Admin may publish.
- Work locally; save/apply/verify development migrations on staging. No Vercel work.
- Implement section-based editing, not a free-form page builder.

Implementation defaults defined by this plan, rather than claimed as pre-existing requirements:

- Initially all CMS tools are Super Admin-operated. Register a separate `website_content` module to allow explicit future draft/preview delegation; grant no new permissions to existing staff automatically.
- Restore also requires Super Admin because it changes the published site.
- One instance of each existing landing section type. Optional sections can be hidden/reordered, list items added/removed/reordered. Header/footer stay fixed and hero stays first.
- Login/registration forms remain mandatory and fixed; their surrounding marketing blocks can be hidden. Functional system/validation messages stay in code.
- Public branding changes apply to these three pages, not every portal/document/email.
- Plain text and constrained emphasis; no raw HTML/CSS/scripts, new legal pages, scheduling or localization.
- Retain revision history and referenced assets. Automated cleanup and hard deletion are excluded.

If a default is changed, revise its schema/tests before implementing dependent phases. Do not silently broaden scope.

## Audit basis and registration supplement

Read alongside `docs/section-based-cms-development-audit-2026-10-29.md` and `docs/landing-login-cms-audit-2026-10-29.md`. This plan supersedes their two-page release assumption.

Registration source inspected specifically for this plan:

- `src/app/register/page.tsx`: client state/form, marketing/testimonial, confirmation-result view, password visibility, and post-success login navigation.
- `src/app/api/borrower/register/route.ts`: Zod payload validation, normalized email, Supabase signUp with implicit flow, confirmation redirect, borrower insertion, role assignment, rollback and service audit.
- `src/app/borrower/register/page.tsx`: legacy redirect to `/register`.
- `src/proxy.ts`: `/signup` and `/borrower/register` aliases, authenticated redirects.
- `src/components/ui/PhoneInput.tsx`: existing phone-country/E.164 behavior.

Verified registration details that must survive extraction:

| Behavior | Current contract |
|---|---|
| Submission | POST `/api/borrower/register` |
| UI payload | firstName, optional middleName, lastName, email, password, optional mobilePhone/dateOfBirth/civilStatus |
| Password | HTML minLength 8 and server minimum 8 |
| Confirmation | API returns confirmationSent/requiresEmailConfirmation; UI does not auto-sign-in |
| Success | Two explanation branches based on confirmationSent; login button goes to `/login?redirect=/borrower` |
| Auth redirect | signUp supplies `${origin}/login?redirect=/borrower` |
| Backend effects | Auth signup, borrower row, borrower role, failure cleanup, creation audit |
| Civil status | Six existing options and values remain in application code |
| Optional fields | Existing optionality and empty-to-undefined/null handling retained |

The API accepts additional optional profile fields not currently shown on the page. Do not expose them through CMS configuration or narrow the existing API schema.

## Non-negotiable surgical constraints

1. **Do not edit** `src/app/api/borrower/register/route.ts`, account security routes, Auth configuration, role/profile triggers, existing borrower tables, registration field semantics, or confirmation/recovery behavior to implement page editing.
2. Do not change form IDs/types/autocomplete/required/minLength, event ordering, credential handling, payload keys, endpoints, redirects or role routing. CMS values never define executable form behavior.
3. Do not fix borrower-ID login or Remember me during this task. They are separately reported existing issues; preserve them during extraction and log separately.
4. Do not modify existing email/document templates, loan calculations, their publishing algorithm, operational settings or existing global audit semantics.
5. No credentials, passwords, form input values or tokens in CMS payloads, logs, snapshots or history. A page preview must not submit authentication/registration requests.
6. No broad CSS replacement. Keep public changes under website-specific classes; retain current breakpoints and public layout initially. Portal/header/sidebar styling must remain unchanged.
7. No service key in client modules/props. Public reads use a publishable key and a published-only table. Admin mutations authorize before constructing privileged operations.
8. Only new reviewed migrations apply to staging. Do not replay all historical migrations, repair historical version numbers, overwrite seed accounts, reset passwords, or copy production data.
9. Preserve all pre-existing tracked/untracked work. Stage exact implementation files; never `git add .` in this workspace.
10. Each phase has a stop gate. Failed checks require investigation before dependent phases; distinguish pre-existing failures from regressions with baseline evidence.

## File ownership map

New files:

| Path | Responsibility |
|---|---|
| `src/lib/website/schema.ts` | Strict versioned content schemas/types |
| `src/lib/website/default-content.ts` | Exact baseline from the three current pages |
| `src/lib/website/sections.ts` | Known IDs/types and ordering/visibility constraints |
| `src/lib/website/links.ts` | Known routes and stable-anchor validation |
| `src/lib/website/public-reader.ts` | Server-only anonymous published read/fallback |
| `src/lib/website/admin-service.ts` | Authorized server draft/publish/restore workflow |
| `src/lib/website/assets.ts` | Decoded-image validation/storage preparation |
| `src/lib/website/errors.ts` | Conflict/validation/storage error mapping |
| `src/components/website/LandingPageView.tsx` | Shared landing renderer |
| `src/components/website/LoginPageView.tsx` | Shared login composition |
| `src/components/website/RegisterPageView.tsx` | Shared registration composition |
| `src/components/website/LoginForm.tsx` | Extracted current login client logic |
| `src/components/website/RegisterForm.tsx` | Extracted current registration client logic |
| `src/components/website/WebsiteLogo.tsx` | Published public-only branding |
| `src/components/website/sections/*.tsx` | Hero, Products, Process, BenefitsStatement, ClosingCta renderers |
| `src/components/admin/website/WebsiteEditor.tsx` | Tabs, saved/dirty state, live revision, save/publish controls |
| `src/components/admin/website/SectionList.tsx` | Keyboard-accessible ordering and visibility |
| `src/components/admin/website/SectionFields.tsx` | Typed section forms |
| `src/components/admin/website/AssetPicker.tsx` | Private upload, validation errors and selection |
| `src/components/admin/website/RevisionHistory.tsx` | Paginated history, release summary and restore |
| `src/app/admin/website/page.tsx` | Admin screen |
| `src/app/website-preview/[page]/page.tsx` | Authorized preview outside admin shell |
| `src/app/website-preview/layout.tsx` | Preview metadata and noindex |
| `src/app/api/admin/website/**/route.ts` | Exact API routes defined in Phase 4 |
| `src/lib/website/__tests__/*.test.mts` | Schema/service/reader/media contract tests |
| `e2e/website-cms.spec.ts` | CMS and public-content browser tests |
| `e2e/website-auth-regression.spec.ts` | Extraction/auth/registration regression tests |
| `scripts/verify-website-cms.mjs` | Explicit-target, read-only staging verification |
| `docs/website-cms-runbook.md` | Migration/release/recovery instructions |

Existing permitted edits: `src/app/{page.tsx,login/page.tsx,register/page.tsx}`, `src/lib/constants.ts`, `src/lib/permissions/{navigation.ts,home.ts}`, `src/components/admin/Sidebar.tsx`, `src/proxy.ts`, `src/lib/audit/labels.ts`, related tests, narrowly scoped `src/app/globals.css`. Edit package/lockfile only for a directly needed decoder. Edit next.config only if selecting next/image. Root portal branding stays unchanged.

### Enforceable change boundary

| Shared existing file | Only permitted change | Explicitly forbidden |
|---|---|---|
| constants.ts | Append website_content slug and module display record | Rename/reorder existing modules or change their metadata |
| permissions/navigation.ts | Add exact website admin/preview access rules | Change existing portal rules, redirect resolution or unknown-route defaults |
| permissions/home.ts | Add website_content -> /admin/website mapping | Change borrower/staff post-login routing |
| admin/Sidebar.tsx | Add Website Content entry and its own icon if needed | Restructure existing groups, filtering, links or collapse behavior |
| proxy.ts | Protect the exact /website-preview path family; CMS-preview-only response headers | Change AUTH_ROUTES, signup aliases, old portal branches, session handling or global matcher |
| audit/labels.ts | New CMS action/entity descriptions | Rewrite historical labels or logging semantics |
| globals.css | Add namespaced .website-cms-* / .website-preview-* rules and minimal public-view selectors | Alter shared .login-* rules globally: registration/recovery and other screens reuse these classes |
| next.config.ts (conditional) | Add exact staging public asset remotePattern if next/image selected | Replace production pattern, broaden to arbitrary hosts, change serverExternalPackages/caching |
| package files (conditional) | Direct image decoder declaration and necessary dependency lock entries | Upgrade framework/auth/editor dependencies or regenerate unrelated dependencies |

Read-only implementation dependencies unless separately justified: `src/lib/permissions/server.ts`, `src/lib/supabase/{client.ts,server.ts,middleware.ts}`, `src/lib/auth/**`, `src/hooks/usePermissions.tsx`, `src/app/layout.tsx`, existing UI controls/PhoneInput, dashboard page/registry/aggregates, registration backend, account-security endpoints, and existing SQL migrations. New CMS helper behavior belongs in src/lib/website, not a global helper refactor.

Expected additive shared effects: Super Admin's permission list, existing role editor and audit module filter gain the Website Content module. The existing dashboard renders modules without widget registry entries as plain permission cards, so it gains a CMS link automatically. No new widget builder, dashboard aggregate, WidgetDataMap or dashboard page change is needed. Other roles gain no rights without explicit assignment.

At Phase 0 save a changed-file baseline and hashes of read-only dependencies. At each gate compare only work introduced after that baseline, preserving earlier user edits. Any new changed path outside this map must be explained and reviewed for CMS necessity before continuing. A filename allowlist alone is insufficient: review each shared-file hunk against its permitted change above.

## Phase 0 — Baseline and target verification

**Purpose:** Establish evidence before code or schema changes.

- [ ] Verify `git branch --show-current` returns `staging`; capture `git status --short` and current HEAD. List pre-existing changes in implementation notes.
- [ ] Read current `AGENTS.md` and installed Next.js server/client, metadata, connection, caching and route-handler docs. Recheck Supabase current RLS/storage/routine documentation before DDL authoring.
- [ ] Compare all three local Supabase env URLs without printing secret values. Require staging ref for development/build; verify public-key Auth settings and service read access separately.
- [ ] Read-only inspect migration history, relevant grants/functions, module rows and storage buckets. Save results without secrets. Confirm new website names do not already exist.
- [ ] Capture desktop/mobile screenshots for `/`, `/login`, `/register` with an anonymous browser context. Use no passwords/tokens in screenshots. Preserve original JSX/copy baseline and a source checksum of the registration API.
- [ ] Run baseline focused auth/permission tests, typecheck and the existing public smoke checks. Record exact failures. Existing `e2e/smoke.spec.ts` expects “sign in” while current UI says “Log in”; do not misattribute that stale assertion to the CMS.

Commands:

```powershell
git branch --show-current
git status --short
git rev-parse HEAD
Get-FileHash src/app/api/borrower/register/route.ts -Algorithm SHA256
node --import tsx --test src/lib/auth/__tests__/*.mts src/lib/permissions/__tests__/*.mts
npx tsc --noEmit
npx playwright test e2e/smoke.spec.ts
```

**Gate:** Target proven, baseline failures classified, source copy captured. Do not claim a baseline pass without command output.

## Phase 1 — Lock the bundle contract and invariants

**Files:** schema.ts, default-content.ts, sections.ts, links.ts; schema/links tests.

- [ ] Add strict schemas for `site`, `landing`, `login` and `register` under one `schemaVersion: 1` bundle. Include no form data or executable settings.
- [ ] Transcribe current copy exactly. Model heading emphasis explicitly, not via HTML. Keep current sample financial text as illustration; do not recalculate it or infer real loan settings.
- [ ] Landing known section IDs: hero, products, how, why, closing-cta. Header/footer outside the ordered body. Require exactly one enabled hero first; optional section IDs unique and at most one per type.
- [ ] Keep section model IDs distinct from DOM anchors. Preserve existing anchors exactly: hero -> `top`, products -> `products`, how -> `how`, why -> `why`. The existing closing CTA has no anchor; do not invent a public anchor unless it is needed by a new validated CMS link. Existing external bookmarks to /#top must continue working.
- [ ] Login/register content includes marketing heading/body/testimonial, page greeting/subtitle, safe button/link labels and SEO. Field validation/error text, password rules and actual link destinations remain code-owned. Registration success/confirmation explanations remain code-owned in version one so content editing cannot misrepresent the API state.
- [ ] Bound heading 120 chars, paragraph 2,000, products/steps 12 each, benefits 20, links 20 per list, request JSON 256 KiB. Reject unknown keys and control characters. These initial engineering limits may be revised before implementation if the preserved baseline exceeds them; never silently truncate.
- [ ] Require stable item IDs. Validate internal destinations against `/`, `/login`, `/register`, `/forgot-password`; anchors against enabled landing sections. Optional external HTTPS links require parsed scheme/hostname validation; reject protocol-relative, javascript/data and malformed encodings. Login/register functional destinations cannot be replaced by CMS links.
- [ ] Add `collectAssetIds(bundle)` returning unique logo/icon/approved section asset IDs across all three pages. Asset references use UUID IDs, not arbitrary storage URLs.
- [ ] Define a separate strict `publicationSchema`: `{ content: WebsiteContent, assets: Array<{ id, publicPath, mimeType, width, height }> }`. The server creates this manifest from prepared asset registry rows; draft save bodies cannot supply publicPath. Public paths must be generated immutable paths within website-public. Every referenced ID must have exactly one manifest entry and unreferenced entries are rejected. Public readers never need access to the private asset registry.
- [ ] Add tests before implementation; run red then green and record outputs. Examples below define the intended public contract; functions are created in this phase.

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { websiteSchema, collectAssetIds } from '../schema.ts';
import { DEFAULT_WEBSITE } from '../default-content.ts';

test('baseline is one valid three-page release', () => {
  const value = websiteSchema.parse(DEFAULT_WEBSITE);
  assert.equal(value.schemaVersion, 1);
  assert.ok(value.landing && value.login && value.register);
  assert.deepEqual(collectAssetIds(value), []); // explicit text-brand fallback initially
});

test('CMS cannot configure registration behavior', () => {
  const value = structuredClone(DEFAULT_WEBSITE);
  const invalid = { ...value, register: { ...value.register, submitUrl: 'https://example.com' } };
  assert.equal(websiteSchema.safeParse(invalid).success, false);
});

test('registration is required in every release', () => {
  const { register: removed, ...incomplete } = DEFAULT_WEBSITE;
  assert.ok(removed);
  assert.equal(websiteSchema.safeParse(incomplete).success, false);
});
```

Run `node --import tsx --test src/lib/website/__tests__/schema.test.mts src/lib/website/__tests__/links.test.mts`.

**Gate:** Default bundle valid, all three pages mandatory, dangerous/behavioral settings rejected. No public rendering changes yet.

## Phase 2 — Extract views without introducing database dependency

**Files:** three public page wrappers; LandingPageView/LoginPageView/RegisterPageView, LoginForm/RegisterForm, WebsiteLogo and landing section components.

- [ ] Move existing landing JSX into shared typed view/section components. Retain anchors/classes/links and active-profile redirect in the original server page.
- [ ] Move login state/effects/handlers verbatim to LoginForm before changing displayed values to props. Keep Suspense/useSearchParams behavior, email-link handling, audit calls and role navigation.
- [ ] Move registration state/handleSubmit and success view verbatim to RegisterForm. Preserve every ID, required attribute, input type, minLength, civil-status value, PhoneInput behavior, payload transformation and response branch.
- [ ] Turn login/register page files into server wrappers supplying DEFAULT_WEBSITE slices. Pass only serializable public content. Do not import server services into client modules.
- [ ] Add an explicit `mode: 'live' | 'preview'` composition boundary. In preview render static disabled controls, not the live form components with effects. This prevents confirmation/session effects from running merely because a preview URL contains tokens.
- [ ] WebsiteLogo accepts explicit safe content props and has a text fallback. Leave existing LoanStarLogo/BRANDING consumers in portals/documents untouched.
- [ ] Add browser route-interception tests for registration. Submit synthetic values, assert exact request URL/method/body, return mocked success/409/error results. Verify both success branches and fixed login target. Do not create live accounts to prove component extraction.
- [ ] Add login confirmation and successful/failed sign-in tests using isolated mocks or existing harness; verify logging and routing contracts. Test legacy registration aliases unchanged.

Example UI contract check:

```typescript
import { test, expect } from '@playwright/test';

test('registration keeps its API contract', async ({ page }) => {
  await page.route('**/api/borrower/register', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      firstName: 'CMS', lastName: 'Fixture',
      email: 'cms-fixture@example.invalid', password: 'FixtureOnly2026!'
    });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      confirmationSent: true, requiresEmailConfirmation: true
    }) });
  });
  await page.goto('/register');
  await page.locator('#firstName').fill('CMS');
  await page.locator('#lastName').fill('Fixture');
  await page.locator('#email').fill('cms-fixture@example.invalid');
  await page.locator('#password').fill('FixtureOnly2026!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});
```

Commands: focused schema/auth/permission tests, `npx playwright test e2e/website-auth-regression.spec.ts`, typecheck, API checksum comparison, screenshots against Phase 0.

**Gate:** Behavior and baseline presentation unchanged except explicit missing-logo fallback. No database switch until all three views pass. Commit only this extraction and its tests for easy reversal.

## Phase 3 — Add staging schema, module and atomic operations

**Files:** newly CLI-generated migration(s) in `supabase/migrations`; schema integration tests; read-only verification script. Migration filenames must be generated, not copied from this plan.

- [ ] Discover `supabase --help`, `supabase migration --help`, `supabase migration new --help`; create `website_cms_foundation` and `website_cms_baseline` migrations. Inspect generated filenames before use.
- [ ] Define five tables with the following exact responsibilities and constraints.

| Table | Required columns and constraints |
|---|---|
| website_drafts | `site_key` PK CHECK = 'main'; schema_version INT CHECK = 1; content JSONB object; lock_version BIGINT >= 0; base_revision_id FK; updated_by auth.users FK; updated_at timestamptz |
| website_revisions | id UUID PK; revision_no BIGINT UNIQUE sequence-backed; schema_version = 1; content JSONB object; content_hash; operation ('bootstrap','publish','restore'); publication_request_id UUID UNIQUE; request_fingerprint; restored_from_revision_id FK nullable; created_by nullable FK; created_at; change_summary |
| website_publications | site_key PK CHECK = 'main'; revision_id FK; schema_version = 1; public_content JSONB object conforming to publicationSchema (content + public asset manifest); published_at; no actor/private-note fields |
| website_assets | id UUID PK; private_path UNIQUE; public_path UNIQUE nullable; MIME allowlist; bounded positive size/dimensions; checksum; state ('private','prepared'); created_by nullable FK; created_at |
| website_revision_assets | revision_id + asset_id composite PK; FKs; index(asset_id) |

- [ ] Use explicit GRANT/REVOKE and RLS on every new public-schema table. Only website_publications allows anon/authenticated SELECT. Client roles have no write rights or private-table reads. Server APIs mediate editor access.
- [ ] Restrict new migrations to the five website tables, their indexes/constraints/triggers/routines, the website_content module row, and the two new bucket records. Existing audit_events receives inserts from new routines but no schema/policy/trigger changes. Do not alter global permission functions, existing storage policies, existing modules/roles, Auth settings, default grants for unrelated objects, or historical migrations. Use explicit grants per new object rather than ALTER DEFAULT PRIVILEGES.
- [ ] Add `website_content` module by slug without hardcoded generated IDs. No automatic rights for existing roles. Add no general public policies to existing config/template/borrower tables.
- [ ] Revisions are immutable: deny content/operation mutation and delete; permit only specifically designed actor-FK nulling if ON DELETE SET NULL is selected. Use FK RESTRICT for retained asset/reference history. Preserve all history initially.
- [ ] Implement service_role-only SECURITY INVOKER RPCs. Revoke EXECUTE from PUBLIC/anon/authenticated for each exact signature. Actor is passed only by the authenticated backend; each routine rechecks profile activity and actual role permission. Publish/restore require active Super Admin, independently of module edit rights.
- [ ] Implement draft save, publication, restore and explicit draft reset/rebase operations using singleton row locks and compare-and-swap. Name final RPCs consistently with the service contracts below.

Required transaction order for `publish_website`:

```text
1. Verify passed actor is active Super Admin; look up publication_request_id;
   equal fingerprint => return prior success, different fingerprint => conflict.
2. Lock main draft then main publication.
3. Recheck expectedDraftVersion and expectedPublishedRevisionId.
4. Recheck request-id uniqueness after acquiring locks.
5. Reject stale draft.base_revision_id; require deliberate reconciliation.
6. Require valid versioned three-page content and ready referenced assets.
7. Insert immutable revision and revision-asset references.
8. Update website_publications from that revision's public projection.
9. Update draft baseline/version; insert critical audit_events row.
10. Commit and return revision ID/number. Any error rolls everything back.
```

Database checks must enforce the top-level three-page structure/asset-reference integrity; full content validation is additionally enforced in the server. RPC execution is service-only so browser callers cannot bypass the validated server path. Record canonical request fingerprint and hash on successful revision insertion.

Restore copies selected historic content into a NEW revision and atomically switches the entire publication. Compare expected draft/live versions; preserve current draft content, leaving its baseline stale. An explicit draft reconciliation operation takes expected lock/live IDs and either copies live into draft or deliberately rebases saved content; it is audited and requires editor permission. Never automatically publish stale draft content after restore.

- [ ] Seed exactly one immutable initial revision, draft and publication from the validated default bundle including register. Seed operation and null actor explicitly; no invented user IDs. Missing approved images use the same text fallback as Phase 2.
- [ ] Add private `website-drafts` and public `website-public` bucket metadata with bounded allowed MIME/size. No client mutation/listing policy; APIs perform writes. Public download behavior is intentional; draft bucket remains private.
- [ ] Verify every target before applying. Apply only the newly reviewed SQL to staging, using migrations tooling that records the generated versions. Compare local/remote version IDs afterward. Do not repair the two historical duplicate-version groups or run a blind `db push` to work around them.
- [ ] Test direct anon/authenticated reads, write denial, function execution denial, inactive Super Admin denial, non-Super-Admin publisher denial, transaction rollback and idempotent concurrent publication on staging with synthetic CMS-only content.

Verification query examples:

```sql
select version,name from supabase_migrations.schema_migrations order by version desc limit 5;
select relname,relrowsecurity from pg_class
where relnamespace='public'::regnamespace and relname like 'website_%';
select site_key,revision_id,schema_version from public.website_publications;
select bucket_id,count(*) from storage.objects
where bucket_id in ('website-drafts','website-public') group by bucket_id;
```

Inspect information_schema.role_table_grants, pg_policies and routine privileges as well; SELECT results alone do not prove write denial. Run advisors and address new findings.

**Gate:** Applied staging migration versions match generated files; negative access/atomicity tests pass; original public rendering still uses defaults. No borrower/Auth data changes.

## Phase 4 — Build narrow admin services and APIs

**Files:** admin-service.ts, errors.ts; routes below; service/route tests.

| Route file under src/app/api/admin/website | Method and operation |
|---|---|
| route.ts | GET draft/current release/capabilities |
| draft/route.ts | PUT validated draft, expectedVersion |
| draft/reconcile/route.ts | POST explicit reset-from-live or rebase, expected draft/live IDs |
| publish/route.ts | POST expectedVersion, expectedPublishedRevisionId, requestId, summary |
| revisions/route.ts | GET paginated immutable history |
| restore/route.ts | POST targetRevisionId, expectedVersion/live ID, requestId |
| assets/route.ts | GET list, POST upload; upload implemented in Phase 5 |
| assets/[id]/preview/route.ts | GET authorized private stream |

- [ ] Derive actor via requireAuth/requireModulePermission, never body fields. Require active Super Admin explicitly for publish/restore. Construct service operations only after authorization.
- [ ] Bound body/stream size before full parsing; strict body schemas reject unknown keys. Require same-origin mutation requests consistent with local browser behavior; do not introduce public CORS writes.
- [ ] Return 401 unauthenticated, 403 forbidden, 400 invalid payload, 409 conflict, 413 size, 415 type, and sanitized 500/503 dependency errors. Do not globally alter existing handleApiError semantics.
- [ ] Define `saveDraft({actorId,expectedVersion,content})`, `publishWebsite({actorId,expectedVersion,expectedPublishedRevisionId,requestId,summary})`, `restoreWebsite({actorId,targetRevisionId,expectedVersion,expectedPublishedRevisionId,requestId})`. Return immutable release identity and next draft version where relevant.
- [ ] Save/publish/reconcile audit inserts belong in database mutation transactions. Do not double-log successful publication using the best-effort writer.
- [ ] On 409 keep unsaved editor data and return current version identifiers; never silently retry with the new version. Request ID retries use the same ID only for the same payload/fingerprint.
- [ ] Test every route directly, not only UI button visibility. Assert service never called when authorization fails and neither request nor errors contain form/password/token data.

**Gate:** Route/service tests pass; same API contracts cover all three pages with no per-page publish endpoint.

## Phase 5 — Media lifecycle and public branding

**Files:** assets.ts, asset routes, assets tests, direct decoder dependency if required.

- [ ] Select/pin a direct decoder after verifying installed compatibility; do not rely on a transitive sharp import. Allow decoded PNG/JPEG/WebP, max 5 MiB and max 16 megapixels. Reject corrupt/animated files initially; output a normalized image with metadata stripped.
- [ ] Generate private paths using UUID/checksum; never use original filenames as paths or fetch remote URLs from CMS input. Store dimensions/checksum in registry only after storage upload succeeds.
- [ ] Provide permission-checked no-store private streaming. Do not distribute private asset URLs in the public projection.
- [ ] Publish preparation copies referenced media to immutable public paths; verifies all three pages' referenced objects exist and checksums match. No overwrites. Pass validated manifest into publish transaction.
- [ ] Enforce immutable prepared asset identity in database guards: once a public_path is set, reject changes to that path, checksum, MIME, dimensions and bytes identity. Never allow routine code to retarget a retained revision's image by editing registry metadata. Restore must verify retained objects before switching publication; missing historic media aborts restore without changing live content.
- [ ] Recheck draft version after preparation. On stale/failure do not change publication. Track prepared objects for later non-destructive inspection; no immediate deletion that could race another publication.
- [ ] Persist the public manifest in the publication projection and derive the historical manifest from immutable revision-asset references plus immutable registry paths. Restore reconstructs the same manifest without copying private paths or uploader details into public content.
- [ ] Explain in admin UI that prepared public assets may be accessible before the content transaction commits. If strict pre-publication media confidentiality is required, stop and revise to a private published-asset serving route.
- [ ] Keep current/historic referenced media forever in initial scope. Exclude DELETE endpoint and automatic cleanup from this implementation.
- [ ] Upload only user-approved logo/favicon files; if unavailable, keep tested text branding fallback. Never download production assets or invent replacement artwork under this task.
- [ ] Test upload storage failure/registry failure, decoded-image rejection, public copy failure, private access denial, rollback image retention and public URL cache identity.

**Gate:** No unpublished private content leaks through normal asset APIs; publication cannot reference missing images; old images retained.

## Phase 6 — Wire published content with a reversible switch

**Files:** public-reader.ts; three page wrappers; default-content.ts; reader tests.

- [ ] Add server-only `WEBSITE_CMS_ENABLED` switch, initially false. Disabled path uses the same extracted defaults from Phase 2, with no CMS DB read. Missing/invalid published data also falls back safely with a server diagnostic.
- [ ] Bound the anonymous CMS query with a 2-second abort deadline and zero application retries; on timeout return the validated defaults. The CMS timeout must not change existing Auth network behavior, supabase wrappers or global fetch defaults. Test a never-resolving injected source with a controlled clock to prove page content loading completes via fallback. This bounds only the new CMS dependency, not existing authentication/proxy dependencies.
- [ ] Use a separate anonymous no-store client for website_publications. Do not read drafts/history through a cookie-scoped or privileged public reader.
- [ ] Validate returned public_content with publicationSchema and its nested websiteSchema. Resolve referenced IDs only through its public manifest, validating exact staging storage origin/bucket and generated paths. Pass content and this minimal public manifest to views; never registry records/actors/private paths. Baseline fallback has an empty asset manifest.
- [ ] Use request-scoped deduplication so metadata and body share one bundle/revision. Ensure request-time rendering following installed Next.js docs; do not cache user/private state or rely on build-time fetching.
- [ ] Add generateMetadata for each public page using its content and shared public icon. Do not convert root layout to global CMS branding.
- [ ] Enable the flag only locally after default/seed equivalence checks. Never edit production env or deployment settings.
- [ ] Test one publication updates landing/login/register and branding on fresh requests without rebuild; draft save changes none. During CMS failure each page renders defaults and forms remain functional.

Contract test example:

```typescript
test('a website read never accepts a partial registration-free release', async () => {
  const { register: ignored, ...partial } = DEFAULT_WEBSITE;
  assert.ok(ignored);
  const source = async () => ({ revisionId: 'fixture', publication: { content: partial, assets: [] } });
  const result = await loadPublishedWebsite({ enabled: true, source });
  assert.equal(result.origin, 'fallback');
  assert.deepEqual(result.content, DEFAULT_WEBSITE);
});
```

Define `loadPublishedWebsite({enabled,source})` in public-reader.ts returning `{origin:'published'|'fallback', revisionId:string|null, content:WebsiteContent, assets:PublicAsset[]}`. `PublicAsset` is inferred from publicationSchema's manifest entry. Runtime adapter supplies the actual source; tests use synthetic inputs. Do not require live network in unit tests.

**Gate:** All three public pages use the same singleton publication, failure mode tested, existing auth/registration regression suite passes with flag on and off.

## Phase 7 — Protected preview and module navigation

**Files:** constants.ts; permissions navigation/home; Sidebar; proxy; preview page/layout; permission tests.

- [ ] Add website_content to MODULE_SLUGS/MODULES and required Record mappings. Add Website Content sidebar link `/admin/website`; ensure Dashboard module metadata/home routing remains valid.
- [ ] Explicitly protect `/website-preview` for anonymous access in proxy; add permission mapping AND page-level requireModulePermission('website_content','view'). Current proxy checks of requiredModules only run for authenticated users, so a mapping alone is not protection.
- [ ] Allow only `landing`, `login`, `register` preview page keys. Render outside /admin AppShell using saved draft and shared view components. Preview loads no Auth tokens/query processing.
- [ ] Use noindex/nofollow and private no-store response headers. If iframe preview is used, allow same-origin only; do not embed admin navigation into the public canvas.
- [ ] Display saved draft version/live revision and visible preview badge. Unsaved editor changes are not represented; provide Save-and-preview.
- [ ] Assert previewed login/register form controls cannot make sign-in/register/session-event requests, including keyboard Enter. Links that would leave preview are inert or intentionally open the live site with a clear label.
- [ ] Test normal authenticated `/login`/`/register` redirects and legacy aliases remain unchanged. Preview must not require weakening normal route protection.

**Gate:** Anonymous/unauthorized previews denied; three-page previews accurate on desktop/mobile; no real registration side effects.

## Phase 8 — Admin editor, publish and restore UI

**Files:** admin WebsiteEditor, SectionList, SectionFields, AssetPicker, RevisionHistory; admin page.

- [ ] Tabs: Landing, Login, Register, Branding, SEO, History. All edit one shared draft and version. Show persistent “Publishes all three pages together” release scope.
- [ ] Add typed forms for existing section/item types. Hero/header/footer constraints enforced in UI and schema. Hide/reorder optional sections and reorder items with accessible move controls. No arbitrary HTML or field-schema editor.
- [ ] Display code-owned field/function restrictions for login/register; do not offer controls that the renderer ignores. Show registration confirmation-result preview from fixed system messages without making them editable.
- [ ] Maintain dirty/saved/error/conflict states. Browser navigation warns on unsaved edits. 409 offers compare/reload and preserves local input; no auto-overwrite.
- [ ] Publish modal shows changed page/section list across LANDING + LOGIN + REGISTER + shared settings, expected draft version/current live revision and optional summary. Only expose action to server-reported Super Admin capability; backend remains authoritative.
- [ ] Reuse requestId only when retrying identical publication intent; refresh capabilities/state on 403/409. If response is lost after commit, retry resolves the already-created revision.
- [ ] History lists immutable release identity/time/actor/summary, not raw private fields. Restore modal explains whole-site scope and preserved separate draft; require expected state and Super Admin.
- [ ] After restore, block publish until explicit reconcile action; never implicitly discard or rebase unsaved work.
- [ ] Add readable audit labels limited to new module/actions. Confirm audit filter includes module without changing old events.

**Gate:** Full UI happy paths, keyboard editing, conflict and permission failure states pass. No ambiguous per-page publish button.

## Phase 9 — Integration, security and non-regression verification

- [ ] Run schema/links/reader/service/media unit tests; auth/permission/audit impacted tests; typecheck/lint; local production build. Record failures with baseline comparison.
- [ ] Staging integration: anon/authenticated public read only; no private-table/asset/client-RPC access; non-Super-Admin full CMS rights cannot publish; inactive actor cannot mutate.
- [ ] Force a transactional audit insert failure using an isolated SQL test transaction/harness, not disabling global audit policies or triggers. Assert previous public revision survives. Verify bad references fail atomically.
- [ ] Race two draft saves and two publishers; one succeeds and stale request conflicts. Retry matching requestId yields same revision; mismatched fingerprint conflicts. Restore cannot overwrite newer state.
- [ ] Publish distinctive synthetic content for all three pages in one operation and verify each reader reports the same release ID and corresponding content. For a single rendered request metadata/body must use one ID. Independent requests straddling a publish may legitimately see old versus new releases; this is not a transaction failure.
- [ ] Test hide/reorder navigation, mobile layouts, text expansion, asset retention, preview inertness, CMS failure fallback and flag-off rollback.
- [ ] Registration API checksum unchanged. Mocked UI contract suite passes. If real end-to-end registration is required, use separately identified disposable staging users and approved test inboxes; do not send real customer email or mutate existing seeded accounts. Do not modify Auth confirmation settings for tests.
- [ ] Restore the baseline publication after destructive CMS fixture tests; retain audited history. Never restore by deleting release/audit rows.

Commands after implementation:

```powershell
node --import tsx --test src/lib/website/__tests__/*.test.mts
node --import tsx --test src/lib/auth/__tests__/*.mts src/lib/permissions/__tests__/*.mts src/lib/audit/__tests__/*.mts
npx tsc --noEmit
npm run lint
npm run build
npx playwright test e2e/website-cms.spec.ts e2e/website-auth-regression.spec.ts
git diff --check
Get-FileHash src/app/api/borrower/register/route.ts -Algorithm SHA256
```

Run the read-only verification script with an explicit staging ref; require it rejects production or missing target. It must report applied migration versions, release consistency, grants/RLS and storage presence without emitting credentials.

**Gate:** Evidence attached to every required criterion; no “tests pass” based solely on mocks. Remaining failures are resolved or explicitly documented before claiming readiness.

## Phase 10 — Handover and rollback readiness

**Files:** docs/website-cms-runbook.md; staging environment notes; implementation evidence log.

- [ ] Record generated/applied migration versions, expected project ref, seed release identity, feature flag default, UI operation and media retention rules.
- [ ] Explain Save versus Publish, whole-three-page scope, Super Admin restriction, conflicts, saved-preview behavior and restore/reconcile workflow.
- [ ] Document code rollback through flag-off/default renderer and content rollback through new audited restore release. Neither path drops schema/storage/history or changes Auth behavior.
- [ ] Record outstanding approved-logo/legal-content tasks if assets/text were not supplied. Do not call unavailable media restored.
- [ ] Review exact git diff for unintended auth/backend/global CSS edits; stage only phase-owned files. Keep commits small: contracts, extraction, schema, services/media, public integration, preview/editor, verification.
- [ ] Verify the protected dependency hashes and shared-file hunk rules from the change boundary. Existing login/register event handlers may move but must have an AST/diff comparison showing preserved request construction, effects and redirects; a green screenshot is not evidence of preserved logic. Confirm globals.css changes cannot match recovery/account/portal screens through shared selectors.
- [ ] Final report states actual staging migrations and observed checks; no deployment or production readiness claim.

## Dependency and stop matrix

| Phase | Depends on | Do not advance when |
|---|---|---|
| 0 | Audit | Target/baseline unresolved |
| 1 | 0 | Three-page bundle/invariants invalid |
| 2 | 1 | Auth/register behavior or baseline changed |
| 3 | 1, 2 | Wrong DB, grants/transaction tests fail |
| 4 | 3 | API authorization/conflict handling incomplete |
| 5 | 3, 4 | Media validation/lifecycle fails |
| 6 | 2-5 | Partial-release read or unsafe fallback |
| 7 | 2, 4, 6 | Preview anonymous or auth side effects possible |
| 8 | 4-7 | Editor can bypass restrictions or lose conflicts |
| 9 | 1-8 | Any required regression/security/atomicity check fails |
| 10 | 9 | Missing migration/test/rollback evidence |

## Completion criteria

- [ ] One release contains landing, login, registration and shared public branding; no per-page publishing path.
- [ ] Save/preview do not change live content; only active Super Admin publishes/restores.
- [ ] All new migrations saved/applied/verified on staging; production untouched.
- [ ] Auth/registration functional contracts preserved and registration API checksum unchanged.
- [ ] Draft/media isolation, conflicts, idempotency, atomic publish/audit and restore verified.
- [ ] Same renderers used in live/preview; preview forms inert; mobile and failure fallback tested.
- [ ] Exact changed-file review, evidence and operating/rollback documentation complete.

**Original planning status (2026-10-29):** This document was originally created before implementation. See the execution update and final-verification evidence above for subsequent work; no production deployment is claimed.

## Plan validation record — 2026-10-29

Reviewed this plan against current landing/login/register pages, registration endpoint, proxy, permission mapping/tests, module/home definitions, dashboard module rendering/widget registry, shared PhoneInput and the audited CMS design.

Corrections made during review: explicit shared-file hunk limits and protected read-only dependencies; preserved hero DOM anchor `top`; published media registry immutability and restore existence checks; bounded new CMS read deadline; precise migration object boundary. Dashboard card visibility is recorded as an intentional additive effect, not unrelated logic work.

Verdict: scoped and suitable as an implementation blueprint with phase gates. It is not proof of a working or regression-free implementation. Exact migration SQL, policy enforcement, transactions, decoder compatibility and browser behavior still require implementation-time review and the listed tests. No source-code or database mutation was needed to validate the plan.

