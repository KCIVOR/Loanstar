# CMS backend implementation evidence

Date: 2026-10-29. Scope: phases 3-6; local staging only.

## Staging migrations

Root applied and verified these authoritative server-generated versions, renaming the CLI-created local files to match actual history:

- 20261029131720_website_cms_foundation.sql
- 20261029131734_website_cms_baseline.sql
- 20261029132411_website_asset_registry_audit.sql

Initial foundation syntax error was transactionally rolled back before successful application. No partial objects survived. New objects are the five website tables, CMS functions/guards, website_content module and website-drafts/private + website-public/public buckets. Existing business/Auth policies, helper functions and historical migrations are unchanged.

Root verified all five tables have RLS; anon/authenticated lack private-table writes and routine execution; all CMS routines are SECURITY INVOKER. Anonymous published reads HTTP 200, draft reads HTTP 401. Intentional advisor INFO notices exist for service-only tables without client policies; unrelated pre-existing advisor warnings remain outside scope.

Bootstrap release: e65c5fea-89d5-479f-b1e5-2cf14f94dfde. All three content page keys present. `scripts/website-cms-staging-integration.sql` passed via root MCP, then ROLLBACK removed every test fixture: null/ordinary actor denial, null/stale CAS rejection, full publish, matching retry, mismatched intent conflict, new restore revision/provenance, preserved stale draft, publish rejection and explicit reconcile.

## Tests

- Public reader/HTTP tests observed red before modules existed, then passed: no disabled-source call, complete release, malformed/error fallback, deadline/abort, same-origin and streaming body bound.
- Image decoder tests observed red before assets-core existed, then passed: real PNG normalization/identity, corrupt/SVG/oversize rejection.
- Combined website tests: 19 passed; additional metadata add/remove test passed separately (20 passing tests across these runs). No complete-build/typecheck pass is inferred from these tests.
- `node scripts/verify-website-cms-audit-atomicity.mjs`: PASS using isolated PGlite. A real CHECK failure on audit_events INSERT aborts publication and leaves exactly the bootstrap revision, original live pointer and no audit record. This harness does not connect to staging or alter real audit constraints.
- Existing login/registration AST-preservation tests passed in the combined suite. Registration API remains read-only.

## Runtime/data boundaries

API routes independently authorize, enforce same-origin mutation, bound JSON/multipart streams, validate strict schemas and sanitize failures. Service client refuses a non-staging project URL. Publishing/restoring require active Super Admin at API and SQL layers; caller-supplied actors are not accepted. The current public projection alone is anonymously readable.

Public reads use an anonymous, request-time, no-store source with two-second abort and safe reason-only fallback diagnostics. Public metadata and views share one request cache. Missing icon deliberately overrides inherited portal icons with empty public-page metadata. Both ignored local environment files now have WEBSITE_CMS_ENABLED=true after explicit staging URL verification; production backup is unchanged.

Image bytes are decoded with directly pinned sharp 0.34.5, normalized to static PNG, bounded to 5 MiB/16 MP and content-hashed. Registry insertion and upload audit are one SQL transaction. Private objects are streamed only through authorized routes; prepared public paths and registry identities are immutable. Selected draft preview assets use an exact-ID query, independent of the latest-100 media listing. No source brand assets were supplied; text branding remains intentional.

Dependency installation: package-manager network attempt stalled; offline resolution hit an unrelated missing cached Tailwind tarball. The already-installed sharp 0.34.5 entry was promoted to a direct exact dependency in package.json and the existing lockfile root dependency map only. No transitive dependency version or unrelated package was updated.

Read-only CLI verification rejects missing/production target and verifies anonymous projection/private-table denial/media availability. Migration history and catalog privileges cannot be proven through REST alone and are separately recorded from SQL/MCP above.

`node scripts/verify-website-cms.mjs --project-ref=ddsvqjaknuniekygpbdr` passed with approved network access: current three-page publication, all four private-table denials and current published media. Initial sandbox-only run could not resolve the Supabase host; the successful network-enabled run is the verification evidence.
