# Website CMS final verification

Verification date: 2026-10-30 (Asia/Manila). Local branch: `staging`. Database target: `ddsvqjaknuniekygpbdr`. No production deployment or production database change.

## Results observed in this verification pass

- **29 tests passed**: 23 website unit/contract tests plus six permission-navigation tests. Includes unchanged login/registration handler AST, inert preview composition, strict content and asset manifests, body/origin validation, read deadline/fallback, metadata and JSONB-order normalization.
- **Eight browser tests passed** using installed Chromium: five intercepted registration/login regressions and three editor UI tests (save/publish intent, nullable footer clearing/focus and conflict preservation). Signup and CMS mutations in this suite are intercepted; it does not create accounts or send confirmation emails.
- **One live staging CMS browser integration passed in development mode (47.5s)**: real existing-seed sign-in; synthetic image upload; draft save; public revision unchanged before publish; private saved registration preview and disabled controls; real publication; anonymous landing/login/registration views all showed the synthetic release; narrow-screen registration checked; previous content restored as a new audited release and draft reset through explicit reconciliation.
- **Production build passed**: `node node_modules/next/dist/bin/next build --webpack` exit 0, final compilation 21.3s, TypeScript phase 21.2s, 170/170 static routes generated. Public pages, CMS API/admin and preview routes are dynamic. This was local compilation, not deployment.
- **Focused ESLint passed with zero errors/warnings** across website source, editor, routes, public wrappers and all three new browser specifications.
- **Registration backend SHA256 unchanged**: `8B37299D47A71AB5E6FC54CBE1CBABAECFA5AA865AED78DB8678577A8F9321A0`.
- Touched-source/package `git diff --check` passed. A whole-workspace diff check reports pre-existing changes/whitespace under tracked `tmp/node_modules`; those unrelated files were not cleaned or changed for this feature.

The final extended development-mode live test passed after the staging conflict-code correction below; production compilation passed separately. An earlier production-mode run exposed the conflict-code defect and was not counted as passing.

## Database evidence retained from root verification

Applied staging migrations and corresponding repository files:

1. `20261029131720_website_cms_foundation.sql`
2. `20261029131734_website_cms_baseline.sql`
3. `20261029132411_website_asset_registry_audit.sql`
4. `20261030005947_website_cms_conflict_sqlstate.sql`

Root verified actual remote migration history, five RLS-enabled CMS tables, public projection-only anonymous reads, denial of private tables and browser-role routine execution, SECURITY INVOKER CMS routines, and a complete three-page publication. Anonymous REST publication reads returned 200 and draft reads 401. Intentional service-only RLS tables have no client policies; unrelated pre-existing security advisor warnings were left unchanged.

The rollback-only staging integration verified actor denial, NULL/stale expected-version rejection, whole-site publication, idempotent retry, conflicting request-ID rejection, restore provenance/new release, preserved stale draft and explicit reconciliation. All SQL test fixtures rolled back.

The isolated PGlite harness now additionally proves inactive Super Admin denial, full-CMS-permission non-Super-Admin publication denial, and inactive draft-save denial. A real audit INSERT CHECK failure rolls back publication/revision/draft changes atomically. This harness never changes staging's audit policies or seeded profiles.

## Corrections made during final QA

- Browser form tests initially raced SSR hydration. Added an observation-only `data-website-hydrated` attribute via a shared `useSyncExternalStore` hook in presentation components; tests wait for actual client readiness. No controls were disabled, no live auth handlers/effects were changed, and AST preservation tests still pass.
- Real HTTP calls exposed Next's bound-address origin mismatch: Request.url could contain `0.0.0.0`, while actual browser Host/Origin was `localhost`. CMS-only origin checking now uses validated Host authority and request protocol, ignores forwarded-host and rejects missing/foreign origins, userinfo/path/comma/whitespace authorities. Real draft/upload/publish/restore requests subsequently passed.
- Auth handler baseline comparisons now use checked-in normalized AST fixtures captured from original commit `1bf25c70ad9769145241aac002cba768843f0cc6`. Tests no longer depend on mutable HEAD or Git availability at runtime.
- New module display metadata is appended, preserving existing module sequence. Existing stale numeric module-count comments were made non-numeric.
- Editor publication comparison parses the JSONB live bundle through the schema before JSON comparison, preventing false change lists caused by object key ordering.
- Regenerated npm lock metadata for direct exact `sharp@0.34.5`; retained only the required root/dependency flag changes. Removed unrelated bundled Tailwind additions from regeneration. No transitive version upgrades.
- Corrected the private-image ESLint suppression placement; focused lint is clean.
- Live REST concurrency exposed Supabase PostgREST 14 retrying custom SQLSTATE 40001 indefinitely. A separate CMS-only migration changes expected application conflicts in four routines to PT409, with HTTP 409 mapping preserved. Existing applied migrations remain untouched. See the [official Supabase explanation](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions). Real concurrent save and publication requests then passed.

## Retained artifacts and fixtures

- Durable editor screenshot: `output/website-cms/website-content.png`.
- First synthetic 16×16 branding fixture asset: `3d6795eb-fc7d-4695-8d47-66e1d4f4bfbe`. It is retained because release history can reference it; no automatic deletion was performed.
- The root independently confirmed restoration release `32fdef14-59ff-45d8-a247-0be4227d809a` matched original bootstrap content and the draft matched its live baseline after the first live test. Later verification releases, if any, must be recorded separately.
- Actual signup/account creation was not exercised: registration requests are mocked to avoid sending real emails or altering accounts. Backend code checksum and exact UI request/result contracts are verified.
- Approved company logo/favicon files were not supplied. The new public views intentionally use text branding until approved files are uploaded. Existing portal branding is unchanged.

## Remaining limits

Earlier standalone `tsc --noEmit` reported existing unrelated test errors. The final Next.js build's own TypeScript phase passed; no later standalone typecheck pass is claimed.

Initial pre-change screenshots were not recovered after the interrupted foundation agent. Do not describe current screenshots as original baseline evidence. Handler/source and request-contract comparisons provide the recorded non-regression evidence.

No production promotion, Vercel configuration, real borrower workflow or unrelated full-system security cleanup was performed.

## Extended final runtime result

**PASS: one extended real staging browser test (58.7s).** Concurrent same-version draft saves returned 200 and 409. Concurrent publication requests returned 200 and 409. All three private previews rendered saved content with noindex; authentication preview controls were disabled. Anonymous readers saw the published landing/login/register bundle, while the admin API returned 401. Mobile registration was checked. The test restored the previous content as a new audited release, reconciled its own draft and verified restored content equality.

The local webpack development server remains available on port 3000 (PID 43420). No deployment occurred. Exact sanitized summaries are retained in `output/website-cms/{unit,build,atomicity,live}-verification.log`.

The final run retained synthetic asset `d0f105b7-0586-4975-b6a4-f6cdff58f008` for immutable history.

