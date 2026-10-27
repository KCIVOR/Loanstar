# User Settings Implementation Plan

**Goal:** Add separate password and verified login-email settings with Superadmin audit visibility.

**Architecture:** Server-verified settings endpoints validate credentials using an isolated client. A pre-operation audit entry gates mutations; database triggers record confirmed identity changes transactionally and synchronize confirmed email to profiles. Recovery callbacks support PKCE, implicit tokens and token hashes without redirecting authenticated recovery users away.

**Tech stack:** Next.js 16, React 19, Supabase Auth/Postgres, Node test runner and Playwright.

- [x] Add failing behavioral tests for validation, credential rejection, audit gating, provider failures, password/email results, and callback routing.
- [x] Implement `src/lib/account/security.ts` as a dependency-injected service and connect `src/app/api/account/security/route.ts` to authenticated providers and audit writer. Do not log request bodies or credentials.
- [x] Add migration `user_settings_security_audit` to record password changes, pending email requests, confirmed email changes and recovery requests; update confirmed profile emails. Restrict trigger function privileges.
- [x] Add `/settings` page and layout with independent password/email forms, explicit pending confirmation status, and provider error handling. Point Header Settings to this route and close the menu.
- [x] Repair proxy rules for `/settings`, `/reset-password`, and `/auth/confirm`; add reusable callback processing and an email confirmation page. Record reset submissions through the transactional Auth audit trigger.
- [x] Add readable audit labels and an Account settings area filter.
- [x] Run focused tests, TypeScript, lint for touched code, and SQL behavioral tests where a local database is available. Verify Settings rendering with mocked identity APIs without modifying real users.
- [x] Review the complete diff, document migration/redirect configuration requirements, and report any verification limits.

Execution: inline in this chat, as authorized by “proceed.” No changes to real user credentials during testing; no deployment to an unverified remote project.
