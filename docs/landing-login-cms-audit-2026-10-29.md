# Landing and login CMS audit

Date: 2026-10-29 (Asia/Manila)
Scope: current staging checkout; `/`, `/login`, their shared branding/layout/styles, related administration/API surfaces, and read-only inspection of Supabase staging `ddsvqjaknuniekygpbdr`.

## Verdict

Neither the landing page nor the login page is CMS-editable through the application. Visible page copy, structure, navigation, and styles are authored in source code. Logo/favicon files are external storage assets at fixed paths, not content managed by an application editor. Editing email/document templates or System Config does not update these pages.

## Content inventory and sources

| Surface | Content | Source | Application CMS editing |
|---|---|---|---|
| Landing navigation | Products, How it works, Why LoanStar, login/apply labels and links | src/app/page.tsx:42 | None |
| Landing hero | Kicker, headline, description, two CTAs | src/app/page.tsx:63 | None |
| Product marketing cards | SF Loan, Allotment Advance, Reloan, descriptions, advertised PHP 300,000 cap, icons | src/app/page.tsx:90 | None; no loan_types read |
| Process section | Four steps, descriptions and time estimates | src/app/page.tsx:163 | None |
| Benefits section | Why LoanStar heading, description, four benefits | src/app/page.tsx:208 | None |
| Sample statement | Account number, principal, interest, fees, proceeds, amortization, payment count | src/app/page.tsx:242 | None; literal illustration, not live loan data |
| Closing CTA | Heading, description and buttons | src/app/page.tsx:286 | None |
| Footer | Company copy, products/company/legal items, copyright year | src/app/page.tsx:310 | None |
| Login brand panel | Heading, description, quote, initials JD, Juan D., Able Seaman / MV Pacific Star | src/app/login/page.tsx:182 | None; testimonial is literal content, not a testimonial record |
| Login form | Welcome text, field labels/placeholders, button, password visibility labels, Remember me, password recovery, staff hint, registration CTA | src/app/login/page.tsx:214 | None |
| Login state messages | Loading, email confirmation, reauthentication, suspended-account message | src/app/login/page.tsx:29, 69, 133, 227, 237, 357 | Coded messages; other authentication errors come from Supabase |
| Logo/icon images | logo.png and favicon.png, version 3 | src/lib/branding.ts:1; src/components/ui/LoanStarMark.tsx:1 | No application uploader/editor found; fixed storage paths can be maintained outside the app |
| Logo alt text and dimensions | LoanStar naming and calculated aspect ratio | src/components/ui/LoanStarMark.tsx:13, 27 | Source edit |
| Page metadata | Title, description, icons, language, font families | src/app/layout.tsx:8, 30, 49 | Source edit; no page SEO editor |
| Layout/theme | Colors, gradients, grid, responsive breakpoints, decorative hero grid | src/app/globals.css:3886-4596 | Source edit; no page/theme controls found |

The login brand/testimonial panel is hidden by CSS below the 900px breakpoint (globals.css:4562,4592). This is a responsive layout rule, not a CMS visibility setting.

## Data flow evidence

Landing imports Link, redirect, LoanStarLogo, active-profile helpers, and a Supabase server client. It calls auth.getUser and, for an authenticated user, fetchActiveProfile. An active authenticated user is redirected to /dashboard. Its returned marketing JSX does not fetch page content, config_settings, loan_types, email_templates, or document_templates. The profile helper reads only id/is_active (src/lib/permissions/active-profile.ts:43).

Login imports the browser Supabase client and permission helpers. Its requests handle sign-in, confirmation, failed-login logging, successful-login logging and /api/permissions/me routing. None supplies CMS copy. The shared PermissionsProvider reads session/permissions; it does not inject website content (src/hooks/usePermissions.tsx:35).

## Administration and database cross-check

System Config UI (src/app/admin/config/page.tsx) covers loan/committee/aging/classification settings, SMS, SMTP email, reports AI and document PDF rendering. The API's CONFIG_KEYS allowlist and PATCH schema (src/app/api/admin/config/route.ts:15,87) do not expose website text, logo URLs, hero blocks, testimonial records or SEO settings. Access requires system_config permission. app_base_url is labeled for reminder cron (config/page.tsx:623), not a public-page content setting.

Decision Email Templates edits application_denied/application_approved subjects and HTML (src/app/admin/email-templates/page.tsx:30; src/app/api/admin/email-templates/route.ts:23). Document Templates has its own records, versions, drafts and publishing (src/app/api/admin/document-templates/route.ts; src/lib/documents/templates/service.ts). These editors are not consumed by either public page.

Loan Types reads public.loan_types (src/app/api/admin/loan-types/route.ts:20). The landing's three marketing cards are separately authored literals. Changing operational loan types will not automatically change those cards or the sample statement.

Read-only staging inspection found 30 config keys; none is website page content. A table-name search over public/private for content/page/CMS/branding/banner/hero/testimonial/site/template/loan_type matched only email_templates, document_templates, document_template_versions and loan_types. This search alone is not proof of absence; the conclusion also follows from tracing the actual page render dependencies and admin APIs. The 16 application modules contain no CMS/page-management module. Source/package searches found no CMS integration in the audited render path.

## Confirmed issues and limitations

1. Staging branding assets are unavailable. The configured logo and favicon paths resolve under the staging Supabase project. storage.buckets has avatars, loan-documents, document-template-assets and bug-report-images, but no branding bucket. Both public image GETs returned HTTP 400 with an embedded 404 / NoSuchBucket / Bucket not found response. LoanStarLogo uses a plain img with no onError fallback. This affects the branding components used by both pages and the root favicon configuration. No assets were changed during this audit.
2. Footer legal items are span elements rather than links (page.tsx:335-345). They do not open legal content from the landing page. This does not claim legal pages cannot exist elsewhere.
3. Product caps, sample rates/amounts, service-time claims and testimonial text are hardcoded. They can diverge from operational settings. Their accuracy, approval and testimonial authenticity were not established by this audit.
4. Login says Email or borrower ID, but handleSubmit passes the field unchanged to signInWithPassword's email parameter (login/page.tsx:145-180,248). No borrower-ID lookup occurs in this handler. This is a confirmed mismatch in the inspected code path; a borrower-ID login was not exercised.
5. Remember me changes local React state, but that state is not used in signIn or the Supabase client configuration (login/page.tsx:56,145,301; src/lib/supabase/client.ts). The checkbox has no inspected connection to session persistence. Actual session duration was not tested.
6. The copyright year is literal 2026, not computed (page.tsx:349).
7. Branding has a production URL fallback when NEXT_PUBLIC_SUPABASE_URL is absent (src/lib/branding.ts:1-3). Current local config supplies staging, so the checked image paths target staging. No production requests or database changes were made for this audit.

## Verification boundaries

Evidence consists of direct source reads, route/config inventory, read-only staging database queries and HTTP checks of the exact staging image URLs. No browser walkthrough, CMS save experiment, live landing/login DOM comparison, visual regression run or production audit was performed. No application code, database schema, records, accounts or credentials were changed. The audit report is the only file created.

## What would be needed for CMS editing

A future implementation would need persisted public-page content, permission-checked administration forms, public content reads wired into both render paths, asset upload/selection, validation, and explicit handling for defaults and publishing. Existing email/document editors do not provide that wiring. This is a capability gap assessment, not an approved implementation design.
