# Loanstar production release plan

## Release baseline

- Both remote branches currently point to `02e21a3`. Local `staging` is 18 commits ahead at `e669541` and has additional tracked and untracked changes.
- Staging Supabase is `ddsvqjaknuniekygpbdr`. Production Supabase is `acopcwlhkovssjnrqygk`. Verify both identifiers again before deployment.
- Production already has `computations.witnessed_by`. It has neither Verification attachment policy and still grants CIG Intake View. Staging has both attachment policies and CIG Intake View is off.
- The nine November 14 reconciliation files are recorded on staging and absent from production history. Compare their actual schema effects against production before classifying them. Production's existing `witnessed_by` column demonstrates why version comparison alone is insufficient.

## 1. Assemble the release candidate

### Release scope to verify against the final PR

- [ ] **#7.** CSA list displays surname, first name and middle name. Include borrower name formatting across Agent, CSA, CIG, Committee, LRA, AR, Collector Briefings, Reports, Audit and notifications. Include the committed legacy-import name changes and verify their workbook behavior. Generated-document name formatting was deferred in the borrower-name plan.
- [ ] **#1.** Editable release date in CSA and Committee, persistence through release and repayment scheduling, and its regression tests.
- [ ] **#4.** CIG can edit after a direct Committee return. Include the stage guard, relevant APIs, tests and revisit migration.
- [ ] **#5.** CIG can edit and resubmit after CSA corrections. Include the queue, forward guard and tests.
- [ ] **#3.** Committee Notice to Revisit before voting, including the action guard and UI changes.
- [ ] **#1a.** LRA calculator, loan types, active-loan lookup, recomputation, PDC and document reset, briefing reset, and audit event. Include the new routes, card and tests.
- [ ] Committee in-app notification and the wider LRA computation history modal. Include the event catalog, Committee detail endpoint and new component.
- [ ] **#6.** System-wide sidebar rules, Verification attachment metadata and preview access, and the production CIG Intake View change after smoke testing.
- [ ] **#10.** Seafarer rate enrollment guidance, aligned fields and in-dialog errors.
- [ ] **#8.** Middle-name field investigation. Carry the checklist assessment into the release notes. The reported mobile-number placement was not reproduced.
- [ ] **#9.** Spouse or sibling name investigation. Carry the checklist assessment into the release notes. The displayed name is the allottee.

Include the client checklist and supporting revision plans. Future-release paperwork #2 was removed from the checklist.

### Items requiring a separate release decision

- Password email templates, their validation script, the website CMS production runbook, and the CMS setup script are separate untracked work. Review them explicitly if they are part of this release. Supabase Auth template settings would need their own deployment step.
- Quick Login is staging-only. The application implementation is uncommitted in this checkout and also exists on a separate branch. The committed Quick Login design document requires review before promotion.
- Local agent instructions, temporary dependency files, output folders and screenshots need an explicit inclusion decision if any are intended production deliverables.

### Candidate validation

- Create a release branch from the current remote `main`. Bring in the reviewed local commits and explicitly select the client fixes, including their new source files, tests, and migrations. Review the final diff against `origin/main`.
- Keep local seed Quick Login out of the production artifact, including its client-side account configuration. Exclude environment files, credentials, debug logs, generated reports, screenshots and dependency churn. Review the committed Quick Login design notes for seed credentials before including them.
- Run the production build and type check and compare failures against a clean main baseline. Investigate the known TypeScript failures and the reported payment-rescheduling, Committee email, and legacy import test failures. Resolve release regressions before promotion.
- End-to-end checks on staging include CIG attachment preview and Verification edits and handoff, CSA and Committee calculator regression, LRA recompute and reset through release, a new Committee notification with audit history, and Seafarer rate enrollment using a disposable rate.

## 2. Rehearse the database changes

- Read the full migration ledgers and compare effective schema, policies, function definitions and grants for changes in the candidate. Classify every migration as pending, already present under a different version, or staging reconciliation. Review November 14 files individually, especially policy, constraint, backup-table, and grant changes.
- Review `20261116120000_cig_edit_during_cig_revisit.sql` and `20261116130000_verification_intake_attachment_reads.sql` for production applicability. Staging records them as `20261115191347` and `20261115221850`. Use one canonical deployment record per migration and document the aliases to avoid replay.
- Rehearse the approved SQL against a production-equivalent disposable database. Snapshot the prior policy definitions and CIG role grants. Confirm backups, restore options, and app rollback target before the release window.

## 3. Promote in dependency order

1. Apply the reviewed, pending policies to production, with the existing CIG Intake View grant still enabled. Verify the migration records and policy definitions immediately.
2. Merge the reviewed release PR into `main` and confirm the intended commit is deployed. Smoke-test CIG Verification with the new document preview endpoint and verify the application health checks.
3. Turn off only CIG Intake View once Verification works on the new deployment. Keep Intake Edit for the verified borrower and agent edit dependencies. Confirm CIG can preview attachments, edit within Verification and reach Committee, and receives HTTP 403 on CSA records.
4. Check CSA, Committee, LRA and other staff workspaces with authorized test accounts. Verify the notification and history, record the live commit and migration versions, and monitor deployment and database errors.

## 4. Rollback

- If CIG loses attachment access after the grant change, restore its prior Intake View value first. Capture the failing check and verify Verification access recovers.
- If the app deployment fails, redeploy the previous known-good commit. Restore the prior grant before reverting to an app build that still requires Intake View for previews.
- Keep compatible database policies in place during app rollback. Revert a policy only with reviewed SQL restoring its prior definition and verify access afterward.
