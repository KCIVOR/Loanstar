# Legacy active-account import implementation plan

## Database deployment checkpoint — 2026-10-07

Applied through MCP to Loanstar (`acopcwlhkovssjnrqygk`), remote version `20261006234949`, name `legacy_active_account_import`. Local migration filename aligned to remote history. Authenticated super-admin rollback tests passed all three segments, exact balances, penalty-baseline preservation, transaction rollback, duplicate rejection, payment posting/reposting, connection to an existing borrower account, and ordinary-loan penalty regression. Anonymous execute privilege is denied; unauthenticated invocation is denied. No test loans or borrowers remained after rollback. Import saving is enabled; `LEGACY_ACTIVE_IMPORT_ENABLED=false` remains an emergency kill switch.

Security advisor: audit helper has an intentional authenticated SECURITY DEFINER warning; it requires super-admin identity and caller-owned matching import provenance. Existing unrelated warnings/errors (backup tables without RLS, other exposed functions and disabled leaked-password protection) were left unchanged.

Approved behavior: import active accounts with their real unpaid installments. Preserve earlier user work on main. Historical receipts are not created.

- [x] Add a pure workbook-to-account validator. Require account identity, current balance, snapshot date, and matching Installments sheet. Reconcile net installment amounts plus unpaid penalties to the account balance to the cent. Reject duplicate identifiers, bad dates, negative values, and invalid segment types.
- [x] Add meaningful tests for partial payments, settled rows, penalty balances, mismatches, and duplicate installments. Run the legacy-import tests.
- [x] Add a transaction RPC per account using authenticated super-admin RLS. Create borrower, application, computation, masterlist, unpaid schedule, import provenance and audit together. Reject duplicate loans on retry without another write. Use server-normalized payload with independent SQL validation.
- [x] Preserve legacy penalty baselines and original due dates. Add a conditional branch to penalty recomputation only for imported schedule rows; leave ordinary-account behavior intact. Verify ordinary and imported rows with database transactions that roll back.
- [x] Connect the final screen to the write endpoint, show schedule reconciliation problems and per-account outcomes, preserve review fixes and exclusions, and prevent repeat submissions.
- [x] Align template headers and Individual support. Verify existing sample workbooks and describe any sample-balance mismatch precisely.
- [x] Run lint, type checking, focused tests, SQL authorization/rollback/retry/payment checks, and diff review. Apply only the verified migration to the configured LoanStar database. Type checking was run but is NOT clean; unrelated existing errors remain.

Verification: 47 focused import tests pass; full library suite 2,177 passed, 9 skipped, 0 failed. Changed feature files pass ESLint and diff whitespace checks. Opt-in Chromium UI test passes with saving intercepted (no real browser-created loan). MCP transaction tests exercise real saving and payments with rollback. Unauthenticated import endpoint returns 401. Full typecheck remains blocked by unrelated errors and stale generated Next route types; this is not a clean-build claim.

Remaining account-onboarding limitation: connection to an EXISTING portal-linked borrower is tested. Public registration currently attempts a new borrower insert and rejects an email already held by an unlinked imported borrower. Admin Users creates a login but does not attach a borrower profile. Creating a NEW login for an imported borrower therefore needs an explicit administrator-controlled onboarding workflow; do not present that part as complete or automatically merge borrowers by email.
