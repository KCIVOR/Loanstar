# Website CMS UI implementation evidence

Date: 2026-10-29. Agent scope: phases 7–8 and operating runbook; no database mutation, deployment or branch change.

Implemented structured schema-field editing for landing sections/items/navigation/footer, login/register approved copy, branding media selection/upload and SEO. Stable identifiers and section types are not editable; hero remains first. All tabs share one saved draft/version. No raw JSON editor or account-field schema editor was added.

The editor preserves local input after 409, refreshes capabilities after 403/409, warns on unsaved navigation, displays saved-preview scope, blocks publishing dirty/stale/conflicted state, and confirms whole-three-page publication. Retry request IDs are retained for identical intent after a lost response. Release history supports explicit Super-Admin-only restore; restore leaves separate draft reconciliation visible.

Preview uses the existing pure/shared presentation components, not live effect containers. Private media uses an explicit serializable ID-to-same-origin-preview URL map; public publication DTOs are unchanged. WebsiteLogo validates each private URL against its exact asset ID route. Preview permission is checked in proxy and server page, with private/no-store/noindex headers scoped to that route family.

Shared hunks are additive only: two access mappings, one sidebar entry, exact preview path protection/headers, and website_content-only audit labels. No old auth route, session helper, borrower endpoint, global UI control or dashboard logic was changed by this agent.

Observed checks:

- `node --import tsx --test src/lib/permissions/__tests__/navigation.test.mts`: 6 tests passed, including new CMS and exact-path boundary assertions.
- TypeScript output filtered for touched website components reported only stale `.next/dev/types` route constraints while routes were being generated, no website source diagnostics in that run. This is not a full typecheck pass.
- Initial narrow ESLint identified two UI issues (effect initialization and an unescaped apostrophe), both corrected. The subsequent lint process was stopped at the parent's request to relieve severe host memory pressure; no final lint pass is claimed here.
- Direct cached Prettier successfully formatted all new editor/preview components and additive public-component prop changes.
- Read-only reviewer checked actual SQL audit action names, nullable footer href clearing, stable form component identity and preview layout. Reported code issues were corrected; no further UI code blocker was reported.

Added `e2e/website-cms.spec.ts`: dedicated staging Super Admin login, mocked CMS draft save/whole-site publish intent, 409 input retention, and nullable footer destination fill/clear plus focus assertion. Requires `E2E_CMS_EMAIL`/`E2E_CMS_PASSWORD`; CMS writes are intercepted so fixtures do not mutate the live database. These browser tests were not executed by this agent; parent integration verification must record results.

Operating instructions: `docs/website-cms-runbook.md`. Actual migration IDs, backend ACL/atomicity checks and final build/browser results belong to parent/backend evidence. The runbook is not itself proof those checks passed.
