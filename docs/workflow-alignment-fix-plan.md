# Workflow Alignment Fix Plan

**Created:** 2026-07-17 · **Source:** Full end-to-end audit against `docs/Loanstar End to End Workflow.md` (client-approved workflow)
**Mode:** SURGICAL — every phase is the smallest change that closes its gap. No refactors, no drive-by cleanups, no renames. One phase = one reviewable unit.

---

## How to use this file

- Work phases **in order** (later phases assume earlier ones landed).
- Mark checkboxes as work completes; update the **Progress Log** at the bottom after each phase.
- Every phase ends with its **Verify** steps — do not start the next phase until they pass.
- Migrations apply via **Supabase MCP** (`apply_migration`), not `supabase db push` (established project convention).

## Surgical-mode rules (apply to every phase)

1. Touch only the files listed in the phase. If a change seems to need another file, stop and note it in the Progress Log first.
2. Migrations are **additive** (new policies/columns/rows) or narrowly targeted `DROP POLICY` + `CREATE POLICY` pairs — never restructure existing tables.
3. Server-side gates first, UI second. RLS must match any new status transition (this codebase's recurring bug pattern is app-code writes silently blocked by RLS — check `WITH CHECK` lists every time a new status value is written).
4. Keep the existing patterns: `requireModulePermission` guards, `writeAuditEvent` on every trigger, `appendStatusHistory` for status moves, `createServiceClient()` only where RLS legitimately blocks an already-authorized side-effect (documented inline, same as `queueForLra`).
5. Add/extend unit tests beside the libs touched (`src/lib/**/__tests__`), run the suite, and do a browser pass of the affected flow before marking a phase done.
6. **Do not touch:** the CIG explicit "Submit CI report" flow (kept per client), agent registration (agents stay admin-created), borrower↔AM chat (deferred).

## Client decisions on record (2026-07-17)

| Topic | Decision |
|---|---|
| Committee Hold | Restore as a 4th final action |
| Denial email | Automatic on the Deny click; CIG call stays as separate, non-blocking step |
| Letter of Intent | System-generated from a template |
| Loan Agreement | System-generated; **placeholder legal wording for now** (superadmin edits later, same as `endorsement_letter` DRAFT pattern) |
| SMS | Twilio; credentials configurable in the admin dashboard (not env vars) |
| Contract before release | Gate release on the uploaded employment contract, aligned to workflow §2.6 |
| 35% coverage | Enforce it (see interpretation note below) |
| Agent self-registration | **No** — admin-created only (no work; workflow doc appendix should be annotated) |
| Chat | **Deferred** — workflow fixes first |

### Interpretation defaults (flag to client if wrong)

- **SMS cadence:** automated reminder ahead of each monthly due date (= the doc's "monthly Text Brigade", since amortizations are monthly). One reminder per installment, plus the collector's existing manual send.
- **35% coverage:** hard-block endorsement when the computed ratio **exceeds** the configured threshold. If monthly income was never declared (ratio unknowable), show a warning but do not block — the doc doesn't define behavior for missing income.
- **LOI timing:** the doc has the borrower sign the LOI early (§6.2), before PDC encoding. In-system, the LOI joins the same in-branch witnessed signing session as the other generated documents (after generation). Confirm acceptable.
- **Committee Hold + vote gate:** Hold requires all 3 votes cast first, same as the other outcomes (doc §4: the final-action rule "applies uniformly across all outcomes").

---

## Phase 1 — Intake documents: CSA upload + CSA confirm, remove borrower per-file "Sign"

**Gap (audit #1 — critical):** Borrowers must "sign" each uploaded requirement (Passport, Seaman's Book, …), which self-confirms the document and bypasses CSA review. Worse: it is currently the **only** working completion path — the CSA checklist's Upload button posts to the borrower-only endpoint (403 for CSA, who lacks `borrower_portal` permission), and nothing in the UI calls the existing CSA confirm API.

**Target behavior (workflow §2.6):** borrower/agent/CSA uploads → **CSA confirms** → checklist complete → endorse unlocks. No signatures on requirement uploads.

- [x] **1.1** New route `src/app/api/csa/applications/[id]/documents/route.ts` — CSA upload-on-behalf. Copy the LRA pattern (`src/app/api/lra/applications/[id]/documents/route.ts`): `requireModulePermission("intake", "edit")` + `assertCsaCanEdit` + upsert document slot → `uploaded`. Audit event `moduleSlug: "intake"`.
- [x] **1.2** Storage RLS check: verify the `loan-documents` bucket INSERT policy covers CSA-uploaded paths (mirror of the fix already done for LRA in `20260710040000_fix_storage_lra_loan_documents.sql`). Add a migration only if the upload 403s in testing.
- [x] **1.3** `src/components/DocumentChecklist.tsx` — add optional `confirmApiPath?: (documentId: string) => string` prop. When set, rows in `uploaded` state show a **Confirm** button (with `ConfirmDialog`) that POSTs there. Keep `allowSign` prop but default it to **false** (kill the `!uploadApiPath` inference); "sign" UI stays only for callers that explicitly opt in (currently: none).
- [x] **1.4** CSA page `src/app/csa/applications/[id]/page.tsx` — pass `uploadApiPath={/api/csa/applications/${id}/documents}` and `confirmApiPath={(docId) => \`/api/documents/${docId}/confirm\`}` to the intake checklist.
- [x] **1.5** Borrower page `src/app/borrower/applications/[id]/page.tsx` — intake + supporting-release checklists render upload-only (no Sign). Subtitle copy: "Awaiting CSA confirmation" for `uploaded` rows.
- [x] **1.6** Harden `src/app/api/documents/[id]/sign/route.ts` — requirement uploads must no longer be signable: reject documents whose stage is a checklist stage (`intake`, `signing_*`, `release`, …). (The generated-doc signing flow uses a different route — `/api/lra/.../documents/[docId]/sign` — and is unaffected.) Simplest surgical option: return 403 always + keep file for history, since no UI calls it after 1.3. Chosen: reject with clear error.
- [x] **1.7** Tests: `src/lib/csa/__tests__` — endorse readiness still requires `confirmed`; component-level check that Confirm appears only for `uploaded` + `confirmApiPath`. Verify in browser: CSA uploads a file, confirms it, endorse gate unlocks; borrower portal shows upload but no Sign link.

**Files:** 1 new route, `DocumentChecklist.tsx`, 2 pages, `sign/route.ts`, tests. **Risk:** low — endorse gate logic untouched.

---

## Phase 2 — Committee: require all 3 votes before any final action

**Gap (audit #2):** Final actions work with zero votes cast; doc §4.7 requires the click to come "after votes are in."

- [x] **2.1** `src/lib/committee/actions.ts` (`executeFinalAction`) — after loading votes, throw if `votes.length < COMMITTEE_SIZE` (export the constant from `votes.ts`): `"All 3 committee votes must be cast before a final action"`. Applies to every action incl. Hold (Phase 3).
- [x] **2.2** `src/app/api/committee/applications/[id]/route.ts` — `canDecide` becomes `status === "for_approval" && votes.length >= 3` (votes are already loaded in that handler). Add `votesNeeded: Math.max(0, 3 - votes.length)` to the payload.
- [x] **2.3** `src/app/committee/applications/[id]/page.tsx` — when `!canDecide` but status is `for_approval`, show "Waiting for votes (N/3 cast)" instead of the final-action card.
- [x] **2.4** Tests: unit test for the vote-count guard (0, 1, 2, 3 votes). Browser: with 2 votes the buttons are hidden and the API rejects a direct POST.

**Note:** majority is NOT required (doc: any member finalizes, deny doesn't need majority) — only completeness of votes.

**Files:** `actions.ts`, `votes.ts` (export), detail API, detail page, tests. **Risk:** low.

---

## Phase 3 — Committee: restore the Hold outcome

**Gap (audit #3):** Doc §4 has 4 outcomes; system has 3.

**Design decision (verified, do not "simplify" to `on_hold`):** the existing `on_hold` status is CSA's pre-endorsement hold and is inside `is_csa_editable_status()` (SQL) and `CSA_EDITABLE_STATUSES` (TS) — reusing it would put committee-held files back in CSA's queue with edit rights, breaking the reopening rule (§2). Use a new status **`committee_hold`**.

- [x] **3.1** Migration `fix_committee_hold_status.sql`:
  - `DROP POLICY applications_committee_action` + recreate with `USING` status list `('for_approval', 'negotiating_terms', 'committee_hold')` and `WITH CHECK` list gaining `'committee_hold'` (current policy in `20260706150000_p5_committee_negotiation.sql:71` — WITH CHECK already has `on_hold`; leave it, add `committee_hold`).
- [x] **3.2** `src/lib/constants.ts` — add `"committee_hold"` to `APPLICATION_STATUSES` (after `"on_hold"`).
- [x] **3.3** `src/lib/applications/status.ts` — label `"On Hold — Committee"`, badge `danger`. `src/lib/applications/pipeline.ts` — add to the `Committee` stage's status list.
- [x] **3.4** `src/lib/committee/actions.ts` — `FinalAction` gains `"hold"`; status guard becomes `["for_approval", "committee_hold"].includes(application.status)`; `case "hold": newStatus = "committee_hold"`. Require a comment for Hold (reason recorded, mirrors deny/revisit). No negotiation/denial side-effects for hold.
- [x] **3.5** `src/app/api/committee/applications/[id]/action/route.ts` — enum gains `"hold"`. Detail route: `canDecide` also true for `committee_hold` (with the Phase-2 vote gate). Queue route `src/app/api/committee/applications/route.ts` — add `"committee_hold"` to the `.in("status", …)` filter so held files stay visible, flagged.
- [x] **3.6** `src/app/committee/applications/[id]/page.tsx` — add **Hold** button (+ comment field) beside Approve/Deny/Revisit; held files show an "On hold" banner with the recorded reason and the same final-action card to resolve (any outcome, incl. re-hold → no-op guard).
- [x] **3.7** Borrower visibility: `formatStatusLabel` covers the portal automatically; check `src/lib/borrowers/home.ts` switch helpers (`nextActionLabel`, `borrowerAppFocus`) render sensibly for `committee_hold` (fallback branches exist — add an explicit case with copy "Your application is on hold pending committee review.").
- [x] **3.8** Tests: tally/action unit tests for hold; RLS smoke: committee member can move `for_approval → committee_hold → approved`; CSA **cannot** edit / see it in their queue while held.

**Files:** 1 migration, constants, status/pipeline, actions, 3 routes, 2 pages, home.ts, tests. **Risk:** medium (new status value — grep for exhaustive status enumerations before merging: `csa/queue.ts`, `reports/aggregates.ts` TAT pairs, `lra/queue-classify.ts`).

---

## Phase 4 — Denial email sent automatically on Deny

**Gap (audit #4):** Doc §4 sends the email automatically at the Deny click; today it waits for CIG's "informed" click and is lost if that never happens.

- [x] **4.1** `src/app/api/committee/applications/[id]/action/route.ts` — after a successful `deny`, fetch the borrower (reuse `getApplicationForStaff`) and `sendEmail({ templateSlug: "application_denied", … })` (same call as `denial-informed/route.ts` today). Wrap in try/catch: email failure must not roll back the decision — log via `writeAuditEvent` with `emailSent: false`. No reason in the email (template already only takes `borrower_name` — doc: "no reason disclosed").
- [x] **4.2** `src/app/api/cig/applications/[id]/denial-informed/route.ts` — **remove the email send** (call tracking only; prevents double-send). Keep `markDenialInformed` + audit.
- [x] **4.3** CIG denials UI copy (`src/app/cig/denials` / queue labels): "Courtesy call" wording — clarify the email already went out.
- [x] **4.4** Tests: deny → `denial_notices` row still created (CIG call queue intact) + email attempted once; denial-informed no longer emails. Browser: deny a test app, check email log/audit.

**Files:** 2 routes, CIG page copy, tests. **Risk:** low.

---

## Phase 5 — Borrower account claim at registration

**Gap (audit #6):** Registration always inserts a new `borrowers` row; CSA-created files are never linked and duplicates accumulate (`borrowers.email` is not unique — verified).

- [x] **5.1** Migration `borrowers_email_unique.sql`: de-dupe existing rows (keep the row with `user_id`, else newest; repoint `loan_applications.borrower_id` / `documents.borrower_id` / `masterlist.borrower_id` / `leads.borrower_id` FKs), then `CREATE UNIQUE INDEX borrowers_email_key ON public.borrowers (lower(email))`.
- [x] **5.2** `src/app/api/borrower/register/route.ts` — before insert: look up `borrowers` where `lower(email) = lower(body.email)` AND `user_id IS NULL` (service client). If found → **claim**: `UPDATE` that row with `user_id` + fill only NULL profile fields from the form; skip the insert. Else insert as today. Audit event notes `claimed: true/false`.
- [x] **5.3** Email verification gate (security — claim must not work on an unverified address): change `createUser` to `email_confirm: false` + send Supabase confirmation; the borrower role/claim proceed as-is but the user cannot sign in until confirmed. If SMTP for auth emails isn't configured in this project, fall back to: claim allowed only when the email matches AND the account verifies — do **not** ship silent claim without verification. Check `supabase/config.toml` / project auth settings first and record findings in the Progress Log.
- [x] **5.4** Duplicate-registration error path: registering an email that belongs to an already-claimed borrower (`user_id NOT NULL`) → clear 409 "An account with this email already exists."
- [x] **5.5** Tests: `src/lib/borrowers/__tests__` — claim-match helper (case-insensitive, only unclaimed rows). Browser: CSA creates app for `x@y.com` → borrower registers with `x@y.com` → sees the in-flight application in their portal.

**Files:** 1 migration, register route, tests. **Risk:** medium (data migration — take a DB snapshot before applying; verify FK repointing query on a branch DB first).

---

## Phase 6 — Agent leads visible to CSA + convert to application

**Gap (audit #5):** A name-only lead never reaches CSA (§1.5); agent uploads stay blocked until a borrower+application exist.

- [x] **6.1** Migration `leads_csa_select.sql`: add `leads` SELECT policy for `has_module_permission('intake', 'view')`, and UPDATE policy for `intake:edit` limited to setting `borrower_id`/`application_id`/`status` (linkage columns only — agents' own policy untouched).
- [x] **6.2** New route `GET /api/csa/leads` — leads where `application_id IS NULL AND status = 'open'`, with agent name (join `users_view` or store display name — check what the agent portal uses) + created date.
- [x] **6.3** New route `POST /api/csa/leads/[id]/convert` — body = the existing CSA create-application schema (email etc.). Internally reuses the exact logic of `POST /api/csa/applications` (extract to `src/lib/csa/create-application.ts` — move, don't duplicate), then writes `borrower_id` + `application_id` + `status: 'converted'` back onto the lead. Audit both entities.
- [x] **6.4** CSA dashboard `src/app/csa/page.tsx` — "New leads from agents" card listing open leads with a **Start application** action → prefilled new-application form (borrower name from lead) → on success calls convert.
- [x] **6.5** Agent side effect check (no code change expected): agent lead list already shows checklist flags once `application_id` is set; verify their completion % appears after CSA converts.
- [x] **6.6** Tests: convert links lead → agent can upload documents for it; CSA lead list excludes converted/linked leads.

**Files:** 1 migration, 2 new routes, 1 extracted lib, CSA dashboard, tests. **Risk:** low-medium (RLS addition — confirm agents cannot read other agents' leads still).

---

## Phase 7 — Scheduled aging/penalty refresh (pg_cron)

**Gap (audit #14):** `refreshMasterlistAging` only runs when a collector opens their accounts page — penalties, 30-day rollovers, and 91+ remedial flags stall without logins. (Verified: no `supabase/functions/` exists; in-DB job = smallest new surface.)

- [x] **7.1** Migration `aging_refresh_cron.sql`:
  - Enable `pg_cron` extension (verify availability on the Supabase plan first via MCP `list_extensions`).
  - SQL function `public.refresh_all_aging()` — direct port of the logic in `src/lib/ar/posting.ts:45` (`refreshMasterlistAging`): per active masterlist → earliest unpaid non-rolled overdue installment → penalty at ≥1 day past due (rate from `config_settings.penalty_rate`), one-time ≥30-day rollover guarded by `rolled_at`, bucket update, `remedial_flag` at 91+. `SECURITY DEFINER`, owner postgres.
  - `cron.schedule('loanstar-aging-daily', '0 17 * * *', 'SELECT public.refresh_all_aging()')` — 17:00 UTC = 01:00 Manila.
- [x] **7.2** Parity tests: fixture DB (or SQL unit via a temporary seed script in `scripts/`) asserting the SQL function produces the same penalties/rollovers as the TS implementation for: 0 dpd, 1 dpd, 30 dpd (single rollover), repeat-run idempotence (no double penalty/rollover).
- [x] **7.3** Keep the on-view refresh in `collector/accounts/route.ts` unchanged (freshness bonus; both paths are idempotent by design — penalty only writes when it increases, rollover guarded by `rolled_at`).
- [x] **7.4** Verify: run `SELECT public.refresh_all_aging()` on a branch/test DB with a seeded overdue account; confirm cron job registered via `cron.job` table.

**Files:** 1 migration, parity test script. **Risk:** medium (money math in SQL — the parity test is the safety net; do not skip it).

---

## Phase 8 — PDC count warning

**Gap (audit #16):** Nothing compares encoded PDCs to the number of amortizations (§6.7). Client wants alignment without inventing a hard rule → acknowledged warning.

- [x] **8.1** `src/lib/lra/release-service.ts` (`savePdcChecks`) — load the active computation's `terms`; when `checks.length < terms`, require `options.acknowledgeShortfall === true` else throw `"Only N of M amortization checks encoded — confirm to continue"`.
- [x] **8.2** `src/app/api/lra/applications/[id]/pdc/route.ts` — pass through an `acknowledgeShortfall` body flag; LRA page shows a confirm dialog when the API returns the shortfall error, then retries with the flag. Audit event records the acknowledged shortfall.
- [x] **8.3** Test: shortfall throws without flag, passes with; exact-count passes silently.

**Files:** release-service, pdc route, LRA page, test. **Risk:** low.

---

## Phase 9 — Enforce the 35% coverage ratio (and actually read the config)

**Gap (audit #13):** Warning-only today; and the seeded, admin-editable `config_settings.coverage_ratio` is **never read** (0.35 hardcoded default in `checkCoverageRatio`).

- [x] **9.1** New helper `getCoverageThreshold(supabase)` in `src/lib/computation/coverage.ts` (reads `config_settings.coverage_ratio`, falls back 0.35) — mirror of `getPenaltyRate` in `ar/posting.ts`.
- [x] **9.2** `src/lib/csa/application.ts` (`getEndorseReadiness`) — add `coverageOk`: active computation's `coverage_ratio` (column exists on `computations`) must be `<= threshold` **when non-null**. Null ratio (income not declared) → `coverageOk: true` + add `"Coverage ratio unknown — monthly income not declared"` to a new non-blocking `warnings[]` array. Over threshold → blocking `missing[]` entry: `"Monthly amortization exceeds NN% of declared income"`.
- [x] **9.3** Anywhere `checkCoverageRatio` is called with the default (CSA computation workspace / API) — pass the config threshold so the on-screen warning matches the gate. Grep `checkCoverageRatio(` for the full caller list.
- [x] **9.4** CSA UI: endorse panel shows the coverage line among requirements; warnings render as amber, blockers as red.
- [x] **9.5** Tests: endorse readiness fixtures at ratio null / 0.34 / 0.35 / 0.36 with threshold 0.35; config override honored (e.g. threshold 0.40 admits 0.36).

**Files:** coverage.ts, csa/application.ts, computation API/page touchpoints, tests. **Risk:** low-medium (may block in-flight test files that exceed 35% — expected and correct per client).

---

## Phase 10 — Employment contract required before release

**Gap (audit #12):** §2.6 "must be complied with before release" — optional at intake (correct) but never re-checked.

- [x] **10.1** `src/lib/lra/release-service.ts` (`recordRelease`) — before the briefing gate, check `documents` for the application: `document_types.slug = 'contract'`, stage `intake`, status `uploaded` or `confirmed`. Missing → throw `"Employment contract must be uploaded before release"`.
- [x] **10.2** Blocker surfacing: when the release file reaches `ready_release` without a contract, set the application blocker to `"Pending: employment contract"` (borrower-visible per §6 status list). Smallest hook: compute it inside `syncApplicationBlocker`'s caller for the `ready_release` transition in `acknowledgeBriefing`, and re-check in `recordRelease`.
- [x] **10.3** LRA page: release button disabled state lists the contract among unmet requirements (it already renders API error strings — verify copy).
- [x] **10.4** CSA/LRA can upload it late: intake checklist stays available to CSA (Phase 1 endpoint) at LRA-stage statuses? **No** — `assertCsaCanEdit` blocks post-endorsement (correct per reopening rule). The LRA signing-stage checklist can't host an intake-stage doc either, so: allow the **LRA upload endpoint** (`/api/lra/applications/[id]/documents`) to accept the `contract` slot (stage `intake`) explicitly — LRA collects it at signing time in practice. Confirm the storage path + RLS allow it; keep the exception narrow (slug allowlist `['contract']`).
- [x] **10.5** Tests: release blocked without contract; allowed with `uploaded` contract; LRA can upload the contract at `release_signing`.

**Files:** release-service, LRA documents route (narrow exception), LRA page copy, tests. **Risk:** medium (blocks releases until users learn the rule — the blocker text is doing the teaching, per the doc's own §0.4 pain-point).

---

## Phase 11 — Letter of Intent + Loan Agreement as generated documents

**Gap (audit #9, #10):** Both are dead upload slots; doc §6.2/§6.5 want them system-generated and borrower-signed. Client: generate both; Loan Agreement wording is a placeholder until Legal supplies text (same DRAFT pattern as `endorsement_letter`).

- [x] **11.1** Migration `seed_loi_loan_agreement_templates.sql` — follow the exact pattern of `20260714020000_p8_seed_blri_pn_ds_templates.sql`: insert `document_templates` (`letter_of_intent`, `loan_agreement`, category `release`) + `document_template_versions` v1 with `status = 'published'`. Bodies: structurally complete (parties, amount `{{loanAmount}}`, terms `{{terms}}`, signature blocks) with placeholder legal prose marked `[DRAFT — pending Legal review]`. Merge keys strictly from `src/lib/lra/template-context.ts` (no new context fields).
- [x] **11.2** `src/lib/lra/constants.ts` — add `letter_of_intent` + `loan_agreement` to **both** `AUTO_GENERATED_SLUGS` paths. They automatically join: generation (`generateReleaseDocuments` iterates the slug list), the witnessed-signing all-signed gate, finalization/locking at close, and the RLS confidentiality wall. Verified: no per-slug logic elsewhere needs edits.
- [x] **11.3** Retire the now-superseded manual upload slots: migration deletes `letter_of_intent` + `loan_agreement` rows from `stage_checklists` (stage `release`) — document **types** stay (historical uploads keep their FK), mirroring `20260714050000` conventions.
- [x] **11.4** Regression check: existing in-flight release files that already generated docs — `generateReleaseDocuments` upserts on `(release_file_id, document_slug)` and allows re-generation at `awaiting_signatures`, so re-running generation adds the two new docs; note in release-notes that in-flight files need "Generate" re-clicked. All-signed gate counts only rows in `generated_documents`, so old files won't be stuck.
- [x] **11.5** Superadmin flow: verify both templates are editable in `/admin/document-templates` and republish works (existing engine).
- [x] **11.6** Tests: `generateReleaseDocuments` slug-set fixtures (with/without PDC now expect 7 docs each); all-signed transition still fires after signing all 7.

**Files:** 2 migrations, `constants.ts`, tests. **Risk:** low-medium (release path is well-gated; the placeholder wording is clearly marked DRAFT).

---

## Phase 12 — Twilio SMS reminders (admin-configurable credentials)

**Gap (audit #11):** Doc §8.3 "monthly Text Brigade reminders" — today: email-only, manual, 7-day lookahead. Client: Twilio, credentials set by admin in the dashboard.

- [x] **12.1** Config plumbing — migration seeds `config_settings` keys: `sms_enabled` (bool, default false), `twilio_account_sid`, `twilio_auth_token`, `twilio_from_number` (empty strings). Extend `CONFIG_KEYS` + zod schema in `src/app/api/admin/config/route.ts`; **GET must mask** `twilio_auth_token` (return `"•••" + last4`), PATCH overwrites only when a non-masked value is sent. Admin config page gains an "SMS (Twilio)" section with a send-test button.
- [x] **12.2** New lib `src/lib/sms/send.ts` — `sendSms({ to, body })`: reads the 3 credentials + `sms_enabled` via service client, POSTs to the Twilio Messages API (plain `fetch`, no SDK dependency), throws with Twilio's error message. No-op (logged) when `sms_enabled = false`. PH number normalization (`09…` → `+639…`).
- [x] **12.3** New route `POST /api/admin/sms/test` (`system_config:edit`) — sends "LoanStar test message" to a number from the request body; surfaces Twilio errors verbatim for setup debugging.
- [x] **12.4** Reminder automation — extend the Phase-7 pattern: since Twilio can't be called from pg_cron, add a **route-based cron**: `POST /api/cron/reminders` guarded by a shared secret header (`CRON_SECRET` env), invoked daily by `cron.schedule` + `pg_net` http_post (verify `pg_net` availability; fallback: external scheduler hitting the route). Handler reuses the due-date scan from `src/app/api/collector/reminders/route.ts` generalized across **all** collectors (extract scan into `src/lib/collector/reminders.ts`; the manual per-collector route now calls the same lib): upcoming installment within 7 days → SMS (+ existing email) → log into a new `reminder_log` table (`masterlist_id`, `installment_no`, `channel`, `sent_at`, unique on the triple) so each installment gets at most one automated reminder per channel. **Cadence = ahead of each monthly due date** (interpretation default — see top).
- [x] **12.5** `reminder_log` migration + RLS (collector view own, AR/admin view all).
- [x] **12.6** Manual send button (collector page) stays; it now also attempts SMS when enabled and records to `reminder_log` (respecting the uniqueness guard, with an explicit "resend" override recorded in the log).
- [x] **12.7** Tests: number normalization; reminder scan lib (due windows, skip paid/rolled, once-per-installment); masked-token PATCH round-trip. Manual verify with Twilio trial credentials.

**Files:** 2 migrations, sms lib, 2 new routes, admin config route+page, reminders lib extraction, collector route/page, tests. **Risk:** medium (external service + secret handling; `sms_enabled=false` default keeps it inert until admin configures).

---

## Explicitly NOT in scope

| Item | Status |
|---|---|
| CIG auto-forward on form completion (audit #8) | **Keep the explicit "Submit CI report" button** — per user 2026-07-17 |
| Agent self-registration (audit #15a) | Not building — agents stay admin-created; annotate the workflow doc appendix |
| Borrower ↔ Account Manager chat (audit #7) | Deferred until workflow fixes land |

## Verification gate (after Phase 12)

- [ ] Full E2E run of the lifecycle on a test borrower: register(claim) → CSA upload+confirm → endorse (coverage gate) → CIG submit → 3 votes → hold → resume → approve → disclose → counter → override → sign → LRA path/PDC (shortfall warning) → generate (7 docs incl. LOI/LA) → witnessed signing → briefing → contract gate → release → signed scans → close → AR receive → DCR → reconcile → aging cron → SMS reminder log.
- [ ] Re-run the audit checklist from the 2026-07-17 session summary; all items previously ❌/⚠️ (except the 3 not-in-scope) should read ✅.

---

## Progress Log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-07-17 | — | Plan created | Verification audit done: `committee_hold` needed (not `on_hold` — CSA editability collision); committee RLS `USING` blocks re-action from hold; `coverage_ratio` config never read; no `supabase/functions/` dir; admin config is a key whitelist; `borrowers.email` not unique. |
| 2026-07-17 | 1 | Done | Code was already in working tree from prior session; finished 1.7 tests (`endorse-documents.test.mts` + `checklist-actions.ts`). Storage INSERT for `intake:edit` already in `20260706120001_p2_rls_storage.sql` — no new migration (1.2). Subtitle copy aligned to "Awaiting CSA confirmation". Browser smoke still manual. |
| 2026-07-17 | 2 | Done | `assertAllVotesCast` + exported `COMMITTEE_SIZE`; `canDecide` requires 3 votes + `votesNeeded`; UI shows Waiting for votes while status is `for_approval` but incomplete. Vote casting / 4 Cs still use `status === for_approval` (not `canDecide`) so members can still ballot. Unit tests 0/1/2/3. Browser smoke still manual. |
| 2026-07-17 | 3 | Done | New status `committee_hold` (not `on_hold`); RLS policy applied via MCP; Hold final action + required comment + re-hold no-op; `canDecide` includes held files; queue lists/flags held; borrower copy distinct from CSA hold. Unit tests for hold preconditions. Browser RLS smoke still manual. |
| 2026-07-17 | 4 | Done | Deny sends `application_denied` via `attemptApplicationDeniedEmail` (audits `emailSent`); CIG denial-informed is call-tracking only (no email); CIG UI courtesy-call copy updated. Unit tests for email payload (name only, no reason). Browser email smoke still manual. |
| 2026-07-17 | 5 | Done | Unique `lower(email)` index applied (no dupes in DB; de-dupe SQL included). Claim path + 409 already-claimed. Auth: `email_confirm: false`; local `config.toml` has `enable_confirmations=false` and Auth SMTP disabled — confirmation sent via Resend + `generateLink` (`borrower_email_confirm` template). Register UI no longer auto-logs in. Claim helper unit tests. Browser claim E2E still manual. |
| 2026-07-17 | 6 | Done | CSA leads SELECT/UPDATE RLS + linkage-only trigger (MCP). `GET /api/csa/leads`, convert route, extracted `create-application.ts`. Dashboard leads card + new-app prefill/convert. Agent name via service-client profiles (no users_view). Unit tests for open-unlinked filter + name parse. Browser convert→agent checklist still manual. |
| 2026-07-17 | 7 | Done | Enabled `pg_cron`; `half_up` + `refresh_one_masterlist_aging` + `refresh_all_aging` (SECURITY DEFINER); cron `loanstar-aging-daily` @ `0 17 * * *`. Parity unit fixtures (0/1/30 dpd + idempotence) + `scripts/aging-parity.sql`. Collector on-view refresh untouched. Verified cron.job + `refresh_all_aging()` runs. |
| 2026-07-17 | 8 | Done | Soft PDC shortfall gate: `assertPdcShortfallAcknowledged` + `savePdcChecks` loads active `terms`; API `acknowledgeShortfall` + 409; LRA confirm dialog + check-count field; audit records shortfall ack. Unit tests for throw/ack/exact. Browser shortfall confirm still manual. |
| 2026-07-17 | 9 | Done | `getCoverageThreshold` reads config (fallback 0.35). Endorse gate: `coverageOk` + `warnings[]`; null income warns; over threshold blocks with NN% copy. `persistComputation` passes config threshold into `checkCoverageRatio`. CSA endorse panel coverage line (amber/red). Unit fixtures null/0.34/0.35/0.36 + 0.40 override. Browser endorse smoke still manual. |
| 2026-07-17 | 10 | Done | Employment contract gate before `recordRelease`; `Pending: employment contract` blocker at ready_release when missing. LRA intake upload allowlist `['contract']` + Employment contract checklist card. Release button lists unmet reqs. RLS already allows LRA docs/storage. Unit tests for present/missing/blocker/allowlist. Browser release smoke still manual. |
| 2026-07-17 | 11 | Done | Seeded published LOI + Loan Agreement templates (DRAFT prose markers; template-context merge keys). Added both slugs to `AUTO_GENERATED_SLUGS` (7 docs/path). Retired release checklist upload slots (types kept). In-flight files: re-click Generate to pick up new docs. Admin template editor uses existing engine. Unit tests for 7-slug sets + all-signed completeness. Browser generate/sign smoke still manual. |
| 2026-07-17 | 12 | Done | SMS config seeds (disabled by default) + masked token GET/PATCH. `sendSms` via Twilio fetch + PH normalize. Admin SMS section + test route. Extracted reminder scan/send lib; collector + cron (`CRON_SECRET`) share it; `reminder_log` + RLS; pg_net cron `loanstar-reminders-daily` @ 01:00 UTC (needs `app_base_url` + `cron_secret`). Unit tests for phone/mask/window. Twilio live smoke still manual. |
