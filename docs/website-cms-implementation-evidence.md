# Website CMS implementation evidence

Date: 2026-10-29 (Asia/Manila). Environment: local staging checkout.

## Foundation verification (phases 0–2)

- Current branch was verified as `staging`.
- Existing three-page content was extracted into typed defaults, shared page views and separate live form containers/presentations.
- Foundation source was formatted using Prettier without editing project dependencies. Unused presentation imports were removed; no functional handler changes were introduced.
- Protected registration API SHA256 remains `8B37299D47A71AB5E6FC54CBE1CBABAECFA5AA865AED78DB8678577A8F9321A0`.
- `node --import tsx --test src/lib/website/__tests__/*.mts src/lib/auth/__tests__/*.mts src/lib/permissions/__tests__/*.mts`: **54 tests passed**, zero failed, before backend tests were introduced.
- Post-format focused foundation run of schema, links and auth-extraction tests: **10 passed**, zero failed.
- Auth-extraction tests compare AST-normalized original login functions/effect and registration handleSubmit from git HEAD to the extracted containers. Both comparisons pass.
- Preview source check confirms it composes presentation components, not effect-bearing live login/register containers.

## Browser regression contract

Added `e2e/website-auth-regression.spec.ts` covering:

1. Registration request body and confirmation-email success result.
2. Registration request body and alternate no-confirmation-email result.
3. Optional name/date/civil-status values and duplicate-email error presentation.
4. Login credential autocomplete attributes, password visibility and recovery destination.
5. Legacy signup/borrower-register aliases.

Registration requests in these tests are intercepted; they do not create real Supabase users or send emails. An initial sandbox test run could not launch Chromium because its cache was redirected to the sandbox package directory. A retry uses the existing installed browsers via `PLAYWRIGHT_BROWSERS_PATH`; its final result is recorded separately below when available.

## Existing typecheck limitations

Repository `npx tsc --noEmit` exits 1 with errors in pre-existing account preference tests, AR initialization tests, missing vitest imports, CIG fixture shapes, ES2018 regex flags, CSA test import extensions, legacy-import CellValue fixtures and LRA computation fixtures. No website foundation file appeared in this result. These unrelated failures were not fixed under the CMS task.

## Validation limits

This foundation evidence does not claim completed staging SQL/RLS/storage, administrative publishing, full CMS browser flow, production build or production deployment. Those are subsequent phase gates. No baseline screenshots were recovered from the interrupted prior agent; later browser checks must not be described as pre-change baseline screenshots.
