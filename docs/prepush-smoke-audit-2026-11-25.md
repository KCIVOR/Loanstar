# Strict pre-push smoke test and change-scope audit

Date: 2026-11-25, Asia/Manila. Branch: staging. Base commit: ff4be77c33aabdc97ac7dc83ca554f386e4b09e7.

**Audit decision: bug-fix smoke and production build pass after one scope regression was corrected; the strict repository gate is not fully green. Do not push the entire working tree.** No staging/commit/push/deployment had been performed at this audit snapshot. Subsequent user-authorized staging integration is recorded below.

## Change-scope check

Reviewed every changed production-code hunk and the new helpers/tests against the six original reports and the separately approved Committee read-only principal row. Built an isolated candidate from HEAD plus exactly **37 allowlisted code/test/migration files**. The candidate excludes the local quick-login restoration and other unrelated work.

[Exact scope manifest](../output/reports/prepush-smoke-2026-11-25/scope-manifest.json), [code-only patch](../output/reports/prepush-smoke-2026-11-25/bug-fixes-only.patch), [verification summary](../output/reports/prepush-smoke-2026-11-25/verification-summary.json).

| Scope | Files/behavior |
|---|---|
| #1 Allottee | Nullable versioned classification, shared role selector/API mapping, saved summaries, document context/final-sheet row, audit field, one additive migration and regression coverage |
| #2 stamp | Calendar-day helper, dated Seafarer persistence allocation, accurate breakdown wording and tests |
| #3 label | Net Desired dropdown and explanation display mapping; stored NET_SARADO identifier retained |
| #4 due days | 1–31 selector/API validation; explicitly Seafarer-scoped recurring month-end recovery in calculation/discount/AR/PDC/document paths; regression tests |
| #5 principal | Shared results row and explicitly approved Committee read-only row |
| #6 security | Seafarer recalculation uses current loan-type interest for security; SME/Individual rules preserved |

The 37-file code candidate has no package/lockfile, auth/login, permissions/RLS, email, website CMS or unrelated reconciliation migration changes. Its only migration is 20261124214427_add_seafarer_borrower_type.sql. Compared candidate text to working-tree allowlisted files and checked current SHA-256 values: no drift. Checked the patch for JWT/secret-key/private-key/env/seed-password patterns: no matches. This is a targeted content check, not a full repository security audit.

### Unrelated working changes excluded and preserved

Three tracked changes are explicitly outside this bug-fix bundle:

- src/components/website/LoginForm.tsx — quick-login restoration.
- src/components/website/LoginPresentation.tsx — quick-login controls/props.
- supabase/.temp/cli-latest — tool cache metadata.

The untracked files are mixed: related issue documentation/evidence, and unrelated seed-account helpers, manuals, account/email/settings artifacts, website CMS work, older reconciliation migrations, screenshots and debug files. The manifest lists every excluded untracked path at capture time. They were not deleted or staged. Do not treat the whole output/reports directory or all untracked migrations as part of this release.

The code-only patch deliberately omits QA documents and raw evidence. The bug-fix Markdown records may be reviewed separately; their relative evidence links point to local artifacts and need an intentional evidence-sharing plan before publishing those documents to GitHub. No environment files or real credentials are in the patch. Ignored local staging environment files were used only in the isolated runtime.

## Scope regression found and corrected during this audit

The original day-31 recovery helper inferred a selected day from the anchor. A constructed but valid legacy SME/Individual case exposed an unintended change: release Jan 28, first payment Feb 28, stored due_day 31 produced March 31 instead of March 28. Both new negative tests failed before the correction.

The final helper requires explicit Seafarer segment context. Propagated segment through shared monthly AR, discount, PDC preview/validation and BLRI paths. SME/Individual keep their release-based anchors, including legacy imported due days. The monthly PDC save validator checks the application's segment when a 29–31 override could apply. Added coverage for both non-Seafarer segments, Seafarer recovery, document rows and actual PDC validation service; all 49 focused checks passed. These changes stay within #4's promise to preserve other calculator rules.

## Fresh verification on the isolated candidate

No unrelated quick-login implementation was needed to build/run the candidate. It ran the actual production build via npm run build and npm run start -- --port 3001, using staging Supabase ddsvqjaknuniekygpbdr. Browser checks used normal sign-in/test accounts; no production database was used. The same installed dependencies were linked into the temporary candidate; a fresh npm ci was not performed. package.json/package-lock.json are unchanged.

| Gate | Clean HEAD baseline | Final isolated candidate | Result |
|---|---|---|---|
| Production build | Not rerun | Pass: optimized compile, TypeScript phase and 171 static pages completed | Pass |
| Targeted bug-related suites | Historical baseline not used as a pass claim | 721 passed, 0 failed, 0 skipped | Pass |
| Full npm test | 2,313 tests: 2,299 pass, 5 fail, 9 skipped | 2,426 tests: 2,412 pass, same 5 fail, 9 skipped | Not green; no new failing test names |
| Standalone tsc --noEmit --incremental false | 15 diagnostics | 15 diagnostics, same file/error-code locations | Not green; no new locations |
| ESLint on scoped existing/new files | 4 errors, 3 warnings | 4 errors, 3 warnings in the same pre-existing hook sites/rules | Not green |
| git diff --check | Not applicable | Pass | Pass |
| Actual Git index | Empty at start | Still empty | No files staged |

The build pass and standalone TypeScript failures are separate observed results; build success does not mean the complete test/type/lint gate passes.

The five full-suite failures present in both HEAD and candidate are:

1. Three date-sensitive applyMoveOfPayment cases involving Quarterly/manual target due dates.
2. Disclosure promotion migration's exact reviewed-template body expectation.
3. Supplied dummy SpreadsheetML workbook expected identifier/date mismatch.

Baseline/candidate logs are retained under output/reports/prepush-smoke-2026-11-25. Hook lint errors are the existing Committee load effect, two LRA effects, and useRateHistoryRow callback; warnings are existing dependency-array warnings. These unrelated failures were not suppressed or repaired in this patch.

## Production-build browser smoke

Dummy record: AN300023, application 36383139-36fd-437b-ab35-a33de6797ae3. Checked zero generated documents/PDC checks and no acknowledged briefing before testing.

| Scenario | Actual result | Evidence |
|---|---|---|
| PROMO / Principal 100000 / Allottee / day 10 / Jan 10 release / 4 terms | Source loan-type rate 1.75% matched interest/security; security 1750; 90-day stamp 184.93; principal displayed; saved/reloaded | [Screenshot](../output/reports/prepush-smoke-2026-11-25/promo-allottee-10th.png) |
| DIRECT / Net Desired 90000 / Seafarer / day 31 / Jan 20 release / 1 add-on | Rate increased back to 1.99%; principal 101215.61; security 2014.19; 131-day stamp 272.45; net exactly 90000; first Feb 28; saved/reloaded | [Screenshot](../output/reports/prepush-smoke-2026-11-25/direct-netdesired-31st.png) |
| PDC preview after second scenario | Feb 28, Mar 31, Apr 30, May 31; draft was not saved | [Screenshot](../output/reports/prepush-smoke-2026-11-25/production-pdc.png) |
| CSA saved view | Same principal 101215.61 and saved Seafarer classification | [Screenshot](../output/reports/prepush-smoke-2026-11-25/production-csa-saved.png) |
| CSA editable dummy AN300007 | Net Desired dropdown, 31 days, Seafarer/Allottee options present; no submission | DOM assertions |
| Committee saved view | Separate read-only principal row correct; same classification | [Screenshot](../output/reports/prepush-smoke-2026-11-25/production-committee-saved.png) |
| Committee editable dummy AN300025 | Same dropdown/type/day options; no submission/vote | DOM assertions |
| Document renderer | Candidate modules rendered published Final Computation Sheet template with actual test snapshots; visually inspected PDF | [Local preview](../output/reports/prepush-smoke-2026-11-25/candidate-document-preview.pdf) |

Independently checked principal minus total deductions equals net, and fee components sum to total deductions. Stamp was compared with actual principal × 0.75% × days/365. Security was compared with the separately fetched current loan-type interest rate. Principal row was compared with the authenticated saved computation.

The original Change Label report specifically concerns the dropdown. It passes; the explanation also displays Net Desired. Saved summary headers still show the unchanged enum-derived NET SARADO text; this was not expanded into a new client requirement during this strict scope check.

The document proof is a local rendered preview using the candidate's exported builders/renderer, not a generated business document stored via the workflow, and not physical printing. Live writes were LRA only; CSA/Committee writes and SME/Individual month-end cases have automated service coverage rather than new live write tests.

## Cleanup and release decision

Restored the original baseline v39 inputs/classification and all compared financial/date/rate/deduction fields through the authenticated candidate API, producing v42. No differences remained; classification is again null/Not recorded. Generated documents/PDC counts remain zero and briefing unacknowledged. Normal v40–v42 versions, LRA approval/witness/hash timestamps, audit events and refreshed pins remain. Browser task and temporary production server were closed after verification.

Candidate source was frozen and matched against the reviewed patch; user working changes and actual index were preserved. No production SQL changes, remote report closures, commit or push.

**Strict push/release gate remains pending:** resolve the existing failing repository checks in separately scoped work, or explicitly establish the team's accepted baseline exception before pushing/releasing. Any later source change invalidates the frozen candidate and requires appropriate re-verification. Use only the reviewed allowlist when eventually staging; do not stage the whole working tree.

## Subsequent staging integration

After reviewing the smoke result and known baseline failures, the user requested integration into staging. The branch was already staging and exactly matched origin/staging at the audit base. Committed the 37-file reviewed code/test/migration bundle as eca3ff21f6652e2fe03f5c29f6f88f2697413f73. A staged whitespace check caught an extra blank line at the end of the test fixture; it was removed, and all 721 targeted tests were rerun successfully before the commit. Related bug-fix Markdown records are committed separately. Unrelated quick-login/cache files and other working artifacts remain excluded and preserved. Local QA evidence is not part of the code commit.

This staging integration does not resolve the recorded baseline test/type/lint failures or authorize production deployment. Remote synchronization is verified separately after push.
