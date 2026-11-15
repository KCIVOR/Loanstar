# Quick Login restoration

## Goal

Restore one-click seed-account login on the CMS-based login page so staging and local testing can switch among CSA, CIG, Committee, LRA, AR, Collector, and other test roles without entering credentials.

## Scope

- Add the original seed-account role list to the CMS login flow.
- Reuse the existing normal `signIn` path so authentication, activity logging, redirect handling, and role-based landing all behave identically to manual login.
- Render the panel automatically in local development and only when `NEXT_PUBLIC_ENABLE_QUICK_LOGIN=true` outside local development.
- Keep the panel disabled by default in production.
- Do not change borrower-name formatting files, data, permissions, or Supabase schema.

## Design

`LoginForm` owns the seed-account list and exposes a quick-login handler that calls its existing `signIn(email, password)` function with the staging seed password. It passes the list, enabled state, loading state, and handler to `LoginPresentation`.

`LoginPresentation` renders a clearly labeled “Quick login (seed accounts)” button grid below the staff-role hint only when enabled. Each button uses the passed handler and is disabled during an active sign-in.

## Safety and errors

Quick Login uses the same error state as manual sign-in. A failed seed login is shown through the existing login alert. The production build remains protected unless the explicit public flag is enabled deliberately.

## Verification

Add a small test for the exported seed account configuration and quick-login visibility predicate. Verify the test fails before implementation, then passes after it. Finally, use EgoLite to confirm the panel appears locally and that CSA and CIG buttons route to their correct workspaces.
