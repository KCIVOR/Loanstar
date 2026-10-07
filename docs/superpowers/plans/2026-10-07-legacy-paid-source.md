# Legacy paid accounts and import source implementation plan

> Execution: inline, on main as previously requested. Preserve unrelated edits; do not commit or push.

**Goal:** Support paid-off legacy accounts, label imported Masterlist records and provide source filtering, with three demonstrable dummy cases per segment.

**Architecture:** Keep the existing authenticated super-admin import transaction. Add `is_legacy_import` to masterlist and backfill only confirmed import-run IDs. Paid imports require zero balance, a valid historical closing date and reconciled fully settled source installments. Persist no invented receipts or collection schedule. Application status is `paid_off`, Masterlist status `paid`. Active imports remain unchanged. Source filtering happens server-side before pagination and remains independent of status.

## Tasks

- [x] Add failing validator tests: fully paid accepted, nonzero paid/zero active/missing closing date rejected, unpaid fees and missing/incomplete source installments rejected. Implement normalized status and closing date.
- [x] Add source-filter query tests using the existing query test harness. Implement `is_legacy_import` filtering, API parameter, UI state/reset/chips and badges in all Masterlist views/details.
- [x] Generate migration with CLI; replace only the audited import function conditions/inserts. Backfill provenance from successful run results. Apply with MCP; test paid and active accounts in rollback transactions, duplicate/auth protection and no historical receipts.
- [x] Extend existing workbook builder into a new output directory. Preserve old sample; add fully paid/unpaid rows with unique numbers/emails. Validate all three segments through actual parser/mapping/preflight. Inspect and render changed workbook views.
- [x] Run focused tests, lint, browser checks and type check. Document pre-existing unrelated failures and exact test-file paths.

## Results

Applied via MCP to Loanstar: `20261007002848_legacy_paid_import_source` and `20261007003649_legacy_paid_source_completeness`. Imported paid loans persist status `paid` / application `paid_off`, historical closing date, zero balance and no invented receipts or collectible schedules. The detail page shows a settlement explanation instead of reconstructing an unpaid original-loan ledger. Backfill marked only confirmed successful imported records.

76 focused tests passed; full library suite: 2,188 passed, 9 skipped, 0 failed. Two Chromium tests passed (saving intercepted; workbook review, source filter and paid detail notice covered). MCP real-transaction tests passed all three segments, incomplete-source rejection, duplicate rejection, payment regression and unauthenticated rejection; no temporary loans or borrowers remained. Feature modules pass ESLint. Full project type check and AR-page lint retain pre-existing failures, confirmed against HEAD; unrelated code was not changed.

New workbooks: `outputs/legacy-import-dummy-data-20261007/legacy-masterlist-dummy-{seafarer,sme,individual}.xlsx`. Each contains new identifiers for partial (001), paid (002) and unpaid (003) examples. Downloadable template instructions also explain paid requirements. No commit or push performed; work remains on main as requested.

## Verification examples

`node --import tsx --test src/lib/legacy-import/__tests__/*.test.mts src/lib/ar/__tests__/queue*.mts`

Paid: balance 0, account_status paid, closed_at <= balance_as_of, matching source installment net balances 0; no collectible schedules persisted. Unpaid: original loan 120000, amount paid 0, fees 0, opening balance 120000. Existing partial: 86500. Use new loan numbers for every sample to avoid existing imports. Browser saving intercepted; SQL fixture writes rolled back.
