# Section-based CMS: development audit and proposed design

Date: 2026-10-29, Asia/Manila. Status: audit/design proposal only.
Target: local application on `staging`, Supabase `ddsvqjaknuniekygpbdr`.

## 1. Confirmed scope versus proposals

The requested work is an audit of developing a section-based CMS for the existing landing and login pages, including database and code changes. The user confirmed **Super Admin only may publish**. Local development only; future migrations must be saved, applied to staging and verified. Production and Vercel are outside scope.

All new table names, API paths, payload shapes, limits and workflows below are proposals, not existing features or silently approved requirements. Restore changes the published site, so this design recommends restricting restore to Super Admin too. Other role delegation is not yet confirmed.

## 2. Findings that affect implementation

| Verified finding | Evidence | Consequence |
|---|---|---|
| Landing content is literal JSX; database reads check identity and active profile | `src/app/page.tsx:24`; `src/lib/permissions/active-profile.ts:43` | Extract a reusable renderer and add published-content reads |
| Login is a client component containing sign-in, confirmation and logging | `src/app/login/page.tsx:1` | Split server content loading from client authentication without rewriting the auth behavior |
| Signed-in users are redirected away from `/login`; active signed-in visitors to `/` go to `/dashboard` | `src/proxy.ts:122`; `src/app/page.tsx:24` | Preview needs a separate protected route |
| Existing document publish archives the old version and publishes the new one in separate requests | `src/lib/documents/templates/service.ts:455-481` | Do not copy that algorithm; CMS publish needs a single database transaction |
| Existing audit writer is explicitly best-effort after a mutation | `src/lib/audit/writer.ts:39-53` | Put critical publication auditing inside the publish transaction |
| Permissions already support view/create/edit/delete/execute_trigger and Super Admin bypass | `src/lib/permissions/types.ts`; `server.ts:87`; live permission function | Add a dedicated module, but enforce publishing separately as Super Admin only |
| Database permission helpers check active roles, not `profiles.is_active` | Live definitions of `has_module_permission` and `is_super_admin` | CMS routines must also verify the actor's active profile |
| No website CMS tables/module currently exist | Read-only staging catalogs/modules | A new bounded subsystem is required |
| Public logos/icons use fixed branding paths | `src/lib/branding.ts`; `components/ui/LoanStarMark.tsx` | Add a controlled media/reference lifecycle |
| Staging has no branding bucket | Staging storage inspection; preceding audit verified NoSuchBucket responses | Initial image files need to be supplied/imported; DDL alone will not restore them |
| Root SEO metadata is static | `src/app/layout.tsx:30` | Generate public-page metadata from published content |
| Image optimization permits only production storage host | `next.config.ts:43` | If using next/image, explicitly allow the staging host; current logos use plain img |
| Existing Tiptap editor imports document fields, print CSS and special extensions | `components/admin/template-editor/TiptapEditor.tsx`; `extensions.ts` | Reuse generic forms, not the legal-document editor wholesale |
| Supabase server wrapper specifies no-store fetch behavior | `src/lib/supabase/server.ts:6-12` | Preserve freshness and verify Next.js development/browser caches explicitly |

Staging has one active Super Admin assignment. No CMS permission workflow was exercised because the CMS does not yet exist.

## 3. Architecture options

**Recommended: typed sections and immutable whole-website releases.** One structured draft contains shared public branding, landing content and login content. A publication is an immutable snapshot of the entire two-page website. This keeps page content and public branding on one consistent release.

Alternative: normalized per-section tables and independent page publishing. Useful for a larger website/editorial team, but introduces more ordering relationships and cross-page release coordination.

Alternative: external CMS. Adds a service/account, integration and another access/media model. No external CMS integration was found in the audited render path; it is not necessary for these two pages.

The remaining design uses the first option. Whole-site publishing remains a product decision. The publish confirmation must list changes across both pages so a pending login edit is not accidentally overlooked while publishing landing content. If independent page publication is required, change the model before implementation.

## 4. Proposed content scope

### Landing

Editable navigation labels, hero title/body/CTAs, product cards, process steps, benefits, sample-statement illustration, closing CTA, footer and SEO. Use predefined section types corresponding to the current layout.

Recommend fixed header/footer and hero first. Optional products/process/benefits/closing CTA sections can be shown, hidden and reordered. Items inside cards/steps/benefits can be added, removed and reordered. Initially allow one instance of each section type; new section types and arbitrary layouts require code changes. This limit is proposed, not confirmed.

Each section/item has a stable ID. Derive anchor targets from stable known IDs, never editable headings. Hiding a section must remove its navigation links or block publishing until dead anchors are resolved. Reordering must support keyboard-accessible move controls; a drag/drop dependency is optional.

### Login

Editable marketing panel, testimonial, greeting/subtitle, staff hint and approved form-copy fields/link labels. Marketing/testimonial blocks may be hidden. The actual login form remains mandatory in its fixed functional position. Keep sign-in destinations, field meaning, validation, recovery/confirmation behavior, session handling and system error codes in application code.

A section-based CMS does not imply that administrators can remove the login form or change where credentials are submitted. Preserve the existing mobile rule hiding the marketing panel at the 900px breakpoint unless a later design changes it.

### Shared branding and SEO

Propose public logo/icon, alt text, company display name and page title/description. Initial scope is landing/login only. Existing LoanStarLogo is shared across portals; replacing it globally would expand impact beyond these pages. Add WebsiteLogo for public pages, passing the published branding snapshot. Public-page generateMetadata overrides root title/description/icons while portal branding retains its existing scope.

Keep the current theme/layout. New legal-policy pages, arbitrary fonts/colors, blog/news, localization, scheduled publishing, analytics/script injection, and operational loan rules are separate scope decisions. Landing product examples remain marketing content, not live computations.

## 5. Proposed content contract and validation

One versioned runtime schema, with TypeScript types inferred from Zod:

- `schemaVersion`: initially 1.
- `site`: public company label, logo/icon asset IDs and alt text.
- `landing`: SEO, navigation, ordered typed sections and footer.
- `login`: SEO, marketing/testimonial settings and approved form-copy fields.
- Section: `id`, `type`, `enabled`, type-specific payload. Array order defines display order.
- Links: known internal routes, valid known anchors, or explicitly permitted external HTTPS destinations. Authentication destinations remain fixed.

Recommend plain text and a small structured emphasis format for headings, rendered as escaped React nodes. Reject arbitrary HTML/CSS, scripts, event attributes, javascript/data URLs, unknown section types and unsupported schema versions. Document-template Tiptap HTML is not a public-content sanitizer.

Suggested limits to finalize: 120-character headings, 2,000-character descriptions, 12 product cards, 12 steps, 20 benefits, 20 links per relevant list, and 256 KiB JSON body. These are design recommendations. Test long content against `.landing-panel` full-height CSS, not only current short copy. Validate full payload on save AND publish.

## 6. Proposed database changes

No schema changes were made. Proposed tables:

| Table | Fields/purpose | Exposure |
|---|---|---|
| `website_drafts` | singleton key; schema_version; content JSONB; lock_version BIGINT; base_revision_id; updated_by; updated_at | Server-only editable workspace |
| `website_revisions` | UUID id; unique revision_no; schema_version; immutable content JSONB; created_by; created_at; change_summary; optional restored_from_revision_id; unique publication_request_id and request fingerprint | Server-only immutable release history/idempotency |
| `website_publications` | singleton key; revision_id FK; schema_version; public_content JSONB; published_at | Anonymous/authenticated SELECT only; no editor identity/internal notes |
| `website_assets` | UUID id; unique generated private/public storage paths; MIME; byte size; dimensions; checksum; created_by/created_at; status | Server-only media registry |
| `website_revision_assets` | revision_id + asset_id composite PK and FKs | Server-only reference/retention protection |

Singleton CHECK/PK constraints prevent extra site records. Constrain JSON to an object, positive schema versions and nonnegative lock versions. Allocate revision numbers using a sequence/locked counter, not unlocked MAX+1. Index history by creation time and references by asset_id. Define valid asset states and path uniqueness. Clients never choose trusted actor IDs, ownership or storage paths.

Reference actors to auth.users consistently with current audit_events. Recommend ON DELETE SET NULL for historical actor metadata while retaining the immutable content, plus retaining actor display information in the audit record according to existing policy. Final FK/delete policy needs review during DDL authoring. The content immutability trigger must not accidentally block permitted actor-FK nulling.

`website_publications.public_content` is a public projection copied from the immutable revision ONLY inside publication. Never put draft content/internal notes into it. The copy and revision pointer must be kept consistent by the publication routine, with no browser write grants.

Seed initial draft/release/publication from the actual current JSX, preserving its copy, links, emphasis and illustration. Do not invent legal text, testimonials or logos. Label imported copy as the existing baseline, not newly verified marketing claims. If approved logo files are unavailable, use an explicitly approved fallback and leave the asset import incomplete.

Do not reuse config_settings: it contains unrelated operational/secret configuration and uses authenticated system_config access. Do not expose document/email template tables publicly for this feature.

## 7. Permissions, RLS and transactional operations

New module recommendation: `website_content`, Website Content. Update public.modules, MODULE_SLUGS/MODULES, MODULE_HOME_PATHS and page-access/navigation definitions. Existing role UI loads modules from the database; test discovery with a non-Super-Admin role.

Initially grant no new rights to existing staff roles automatically. Super Admin access follows the existing bypass. Later draft editing/preview can be delegated explicitly. A role with every website_content action still cannot publish unless it is an active Super Admin.

Access design:

1. Enable RLS on all new public-schema tables. Explicitly revoke client DML and default PUBLIC routine execution.
2. Grant anon/authenticated SELECT only on website_publications with a singleton read policy. It contains intentionally public content only.
3. Drafts, revision history, assets and references are service-only. Browser editors access permission-checked server APIs, not direct writes. Public reads use a publishable-key client, never service-role credentials.
4. Mutation routines are callable only by service_role. Prefer SECURITY INVOKER where service privileges suffice; revoke EXECUTE from PUBLIC, anon and authenticated. No public-callable SECURITY DEFINER shortcuts.
5. Server derives actorId from requireAuth, never the request body. Service-only routines recheck the actor's active profile and active role/permission. Service-role auth.uid is not the end-user identity; pass the verified actor explicitly. Do not use user_metadata for authorization.
6. Publish/restore must check active Super Admin in the API and database. Do not map edit/execute_trigger to publication authority.

Proposed operations:

- **Save draft:** compare expected lock version, validate, update content/version/baseline, insert audit record. Stale save returns 409, not last-writer-wins.
- **Publish:** compare expected draft version AND current live revision; lock singleton; verify actor/asset readiness; insert immutable revision + asset refs; update current public projection; advance draft baseline/version; insert audit event; commit together. Any DB error preserves the previous live site.
- **Restore:** create a NEW release copied from a retained revision; record its source; require expected live revision and expected draft version. Preserve separate uncommitted draft content. Mark its baseline stale and require explicit reconciliation before another publish. Restoring does not erase history.

Use a caller-generated UUID request ID on publish/restore, stored with a canonical request fingerprint/result on the revision. Replaying the same request returns its prior result; reusing an ID with different inputs returns conflict. A unique constraint plus transaction locking prevents duplicate releases. Store only successful operation results; failed operations must not look successful on retry.

Publication audit INSERT belongs in the same transaction. Log operation, revision IDs, source revision/changed section IDs/summary; avoid large complete payloads and private notes. Existing best-effort writeAuditEvent remains unchanged for unrelated features.

## 8. Media/storage design

Recommend `website-drafts` private bucket and `website-public` public bucket. No existing bucket is repurposed. A public object URL is public even if the page section is hidden; unpublished confidential uploads stay private.

Uploads use server-generated UUID/checksum paths. Validate decoded PNG/JPEG/WebP type, dimensions, byte and pixel limits; do not trust MIME/extension. Current `src/lib/bug-reports/images.ts` signature checks are a useful pattern but not full image decode validation. Suggest 5 MiB maximum and bounded pixel dimensions; exclude SVG and fetching arbitrary remote image URLs initially. A directly pinned image decoder dependency may be required: sharp is currently transitive, not a declared direct project dependency.

Draft preview streams private media through an authorized no-store endpoint. Before publication, copy referenced images to immutable public paths and verify their presence. Only then run the DB publication transaction. Never overwrite an existing public image in place; it would alter historical releases outside publishing.

Storage operations cannot join a Postgres transaction. Failed/stale publication can leave prepared public objects unreferenced; the current page stays unchanged. Prepared public images may be discoverable before the DB switch. If this is unacceptable, choose private storage plus a published-asset delivery endpoint instead; that is a different delivery tradeoff to settle before implementation.

Retain objects referenced by current/historical revisions. Deletion must check all draft/history/live references. No automated destructive cleanup in the first release. Unreferenced cleanup should account for in-flight publications, use an age/grace boundary and be explicitly operated. Public downloads do not require broad object-listing or mutation policies.

The missing staging branding assets require approved source files and an actual upload. A migration history entry cannot prove the media bytes exist.

## 9. Rendering, preview and freshness

Extract pure `LandingPageView` and `LoginPageView` shared by live/preview; keep login effects and submission in `LoginForm`. `/login` becomes a server wrapper loading a safe public DTO. `/` preserves the active-user redirect.

Proposed preview: `/website-preview/[page]`, allowlisted landing/login. Add explicit protection in src/proxy.ts AND server-side authorization on the page. Current requiredModules checks alone are insufficient for logged-out visitors because the proxy runs them only if user exists. Preview lives outside /admin layout so admin sidebar/container styles do not contaminate public-page dimensions.

Preview uses the last SAVED draft with a visible banner, noindex metadata and private/no-store response behavior. Unsaved editor changes are labeled and require saving before preview. Login preview is inert: no sign-in, token processing, navigation from form submission or auth audit events. Do not authorize preview with a query flag alone or leak service keys/drafts to public props/cache.

Initial local scope: request-time no-store public reads with request-scoped deduplication; no persistent public shared cache. Use an anonymous publishable-key client and explicit current-publication projection. Ensure pages that otherwise prerender actually execute this reader at request time. Installed Next.js docs describe async cookies/draftMode and connection() for explicit request-time rendering. Draft Mode is not authentication and is unnecessary for this dedicated protected preview.

Published metadata and markup must read the same request-scoped snapshot. A refreshed public page must show a new release without rebuilding. No claim that already-open tabs update instantly: revalidatePath in a Route Handler does not force all existing clients to refresh. Check Next.js HMR caching as well as browser/router caching.

If publication is missing/invalid/unavailable, fall back to checked-in approved baseline content and log the error; never fall back to the draft. Login must remain functional when CMS reads fail. This availability choice may show baseline rather than latest marketing during outages. A durable last-known-good cache would need a separately specified invalidation/recovery design.

## 10. Proposed code change map

| New path | Responsibility |
|---|---|
| `src/lib/website/schema.ts` | Versioned content schema and inferred types |
| `src/lib/website/default-content.ts` | Exact imported baseline |
| `src/lib/website/sections.ts` | Types, IDs, anchors and order/visibility rules |
| `src/lib/website/links.ts` | Destination/hidden-anchor validation |
| `src/lib/website/public-reader.ts` | Anonymous published read and safe fallback |
| `src/lib/website/admin-service.ts` | Authorized server workflow and service-only RPCs |
| `src/lib/website/assets.ts` | Upload validation, paths and publish preparation |
| `src/components/website/LandingPageView.tsx` | Shared landing renderer |
| `src/components/website/LoginPageView.tsx` | Shared login composition |
| `src/components/website/LoginForm.tsx` | Existing auth logic moved with minimal behavioral changes |
| `src/components/website/WebsiteLogo.tsx` | Public release branding |
| `src/components/website/sections/*.tsx` | Approved section renderers |
| `src/components/admin/website/WebsiteEditor.tsx` | Landing/login/branding/SEO tabs and draft/publish status |
| `src/components/admin/website/SectionList.tsx` | Show/hide and accessible ordering |
| `src/components/admin/website/SectionFields.tsx` | Type-specific field forms |
| `src/components/admin/website/AssetPicker.tsx` | Upload/selection with reference awareness |
| `src/components/admin/website/RevisionHistory.tsx` | History, comparison and protected restore |
| `src/app/admin/website/page.tsx` | Admin entry |
| `src/app/website-preview/[page]/page.tsx` | Authorized inert preview outside admin shell |

Proposed server endpoints under `/api/admin/website`:

| Endpoint | Contract |
|---|---|
| GET base | Draft, current release and actor capabilities |
| PUT /draft | expectedVersion + complete validated content; 409 on stale version |
| POST /publish | expectedVersion, expectedPublishedRevisionId, requestId, changeSummary; active Super Admin only |
| GET /revisions | Paginated immutable history |
| POST /restore | target revision, expected live/draft versions, requestId; active Super Admin only |
| POST /assets | Bounded multipart image upload |
| GET /assets | Authorized media list |
| GET /assets/[id]/preview | Authorized private media stream |
| DELETE /assets/[id] | Optional only after reference/concurrency protection is implemented |

Server pages call the public reader directly; a public CMS API is not required initially. Handle validation, auth, conflict, size and type failures with appropriate 400/401/403/409/413/415 statuses. `src/lib/api/handler.ts` has no CMS conflict mapping and exposes unexpected error messages; new routes should explicitly map conflicts and sanitize internal failures.

Existing modifications:

- `src/app/page.tsx`, `src/app/login/page.tsx`: server content loading/metadata and extracted views.
- `src/app/globals.css`: preserve existing styles while supporting longer lists/reordered sections and clean preview.
- `src/lib/constants.ts`: new module slug/display metadata.
- `src/lib/permissions/navigation.ts`, `src/lib/permissions/home.ts`: access rules and required ModuleSlug home mapping.
- `src/components/admin/Sidebar.tsx`: permission-aware Website Content entry.
- `src/proxy.ts`: protected preview, preserving normal public/auth route redirects.
- `src/lib/audit/labels.ts`: readable website save/publish/restore/media event descriptions.
- `next.config.ts`: only if choosing next/image, allow the actual staging asset host.
- `package.json`/lockfile: only for directly required image-decoding/UI dependencies; keyboard ordering needs no new package.

No rewrite of borrower/loan calculations, account security or email/document template publishing is required. The existing borrower-ID and Remember me code mismatches identified previously should remain separate fixes; component extraction must not silently alter auth behavior.

## 11. Delivery and migration sequence

1. Confirm open decisions below; approve final payload and section rules. Capture existing baseline content and collect approved logo/favicon bytes.
2. Implement validation and renderer extraction against checked-in defaults; verify baseline equivalence and login behavior before persistence.
3. Discover installed Supabase CLI commands with --help. Generate new migration filenames with migration new, not invented timestamps. Write/review tables, constraints, grants/RLS, module, service-only operations, immutable history, atomic audit and baseline seed.
4. Verify staging ref `ddsvqjaknuniekygpbdr` before any mutation; apply only new reviewed migration(s). Existing history has two duplicate local version groups, so avoid a blind replay/push of all historical files.
5. Verify staging migration records, definitions, grants/RLS, routine execution rights, inactive actor rejection and Super-Admin-only publish. Run advisors and resolve findings introduced by this change.
6. Upload approved initial media through the chosen lifecycle; verify public published assets and private draft denial.
7. Wire published readers/fallback and public metadata; verify original redirect/auth functionality.
8. Build forms, accessible ordering, save conflicts, inert preview, media selection and release history; enable publish/restore after transaction tests pass.
9. Run the acceptance matrix, focused tests, typecheck/lint/build and local browser checks against staging. No deployment.
10. Record migration versions, exact validation evidence and operations instructions.

Application rollback: return to the preceding code/default public views. Content rollback: create a new audited publication from a retained release. Keep history/schema/assets; dropping tables or clearing migration history is not the normal rollback path. A production promotion is separately authorized.

## 12. Required acceptance tests

| Area | Required evidence |
|---|---|
| Baseline | Seeded content matches source copy, links, emphasis and examples; missing-image fallback is explicit |
| Public isolation | Anonymous and ordinary users see only current public projection; no drafts/actor notes/history/private media via direct or application API |
| Authorization | Active Super Admin publishes; editor with every website permission but not Super Admin is denied; inactive Super Admin denied; direct writes/client RPC calls denied |
| Validation | Invalid/duplicate IDs, unknown sections, unsafe links, excessive payloads and missing mandatory login content rejected |
| Concurrency | Two tabs yield save conflict; stale publish/restore fails; request replay cannot duplicate releases |
| Atomicity | Forced audit/reference failure keeps the old publication; readers see complete old or complete new snapshot |
| Media | Spoofed/corrupt/oversized images denied; copy failure blocks publish; historic images survive publication/restore |
| Preview | Unauthorized denied, same renderer as live, saved draft clearly indicated, login inert, noindex/private caching, narrow/wide viewport checks |
| Navigation | Hidden sections have no dead nav/footer anchors; title edits do not change stable IDs |
| Freshness/failure | Refreshed public pages update without rebuild; CMS outage cannot crash login or leak draft |
| Auth regression | Staging sign-in/errors/suspension, confirmation/recovery/reauth, role routing and logging unchanged |
| SEO/scope | Metadata agrees with body release; portal branding scope preserved; preview not indexed |
| Restore | New audited release, source link retained, separate draft preserved/stale baseline visible |
| Accessibility | Keyboard order controls, focus/errors, labels, dirty prompts, long content and mobile marketing-panel behavior |

Suggested tests: `src/lib/website/__tests__/{schema,links,public-reader,publish,assets}.test.mts`, SQL integration for grants/atomicity, `e2e/website-cms.spec.ts`, updates to existing permission home/navigation tests. Mock-only tests cannot prove RLS/storage/transactions; verify against staging with synthetic content and restore the starting release afterward.

After implementation: focused node --import tsx --test, npx tsc --noEmit, relevant ESLint checks, npm run build, and local Playwright with staging. No current test/build pass is claimed: this is a planning-only audit.

## 13. Effort and decisions remaining

Revised estimate: **7-11 focused developer days** for this scope including protected preview, transactional releases, media lifecycle and staging integration tests. This is a planning estimate, not measured work. The prior 5-8 day estimate did not yet account for the confirmed preview redirect behavior, atomic audit/publish gap and private/public media lifecycle. Independent page releases, global branding, new legal pages or arbitrary rich layouts can increase scope.

Confirmed: Super Admin only publishes. Recommendations requiring confirmation before implementation:

1. Whole-site publication or independent landing/login releases.
2. One instance per predefined type, with optional sections reordered/hidden and list items editable.
3. Initially Super Admin operates all tools; future draft/preview delegation through website_content.
4. Landing/login branding only or a global portal-branding change.
5. Legal footer labels retained until approved links/content exist, versus building legal pages separately.
6. Approved logo/favicon sources and acceptable pre-upload fallback.
7. Plain text/structured emphasis and image/body limits; no scheduling/localization initially.
8. Retain release history/assets initially; no automatic deletion.

## 14. Evidence boundaries and references

Read page/login/layout/branding/CSS, admin shell/navigation, role/permission APIs, Supabase wrappers, document publication, avatar upload, image signatures, audit writer/labels, test configuration and relevant migration patterns. Queried staging table/policy/function definitions, module presence and active Super Admin assignment. No database/storage/account mutation occurred. Only this report was added.

Installed Next.js docs consulted: environment-variables.md, draft-mode.md, connection.md, revalidatePath.md, generate-metadata.md and serverComponentsHmrCache.md under node_modules/next/dist/docs. Current project declares Next.js 16.2.10. Draft Mode is async and is not an authorization boundary.

Supabase search_docs consulted for Data API/API key and storage access design. Primary references: [Data API security](https://supabase.com/docs/guides/api/securing-your-api), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals). Changelog markdown retrieval through the web tool failed with unsupported content-type; its entries were not verified. Recheck relevant current documentation before implementation.

Not performed: implementation, migrations, browser walkthrough, performance benchmark, unrelated full-system security audit, external CMS evaluation or production inspection. No assumption that the local app is free of unrelated failures is used here.
