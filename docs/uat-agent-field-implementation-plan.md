# Agent Assignment on Every Application Form Implementation Plan

> For agentic workers: Checkbox (`- [ ]`) syntax for tracking. No external sub-skill required.

## Post-implementation correction — 2026-09-23

The first implementation pass (Phases 0–4 below) rendered the Agent control as a standalone `Card` on the CSA application detail page, separate from the "Application Form" modal (`ApplicantProfileFields`). The client flagged this: **the agent field is part of the application form**, not a separate panel. Corrected by moving it into `ApplicantProfileFields` itself (a new optional `agent` prop, rendered at the top of the shared form fieldset for every segment) and wiring it into every place that renders that form:

- **CSA** (`src/app/csa/applications/[id]/page.tsx`) — editable, inside the "Edit application form" modal; a one-line read-only summary also shows on the collapsed "Application Form" card so staff don't have to open the modal just to see who's assigned.
- **Committee** (`src/app/committee/applications/[id]/page.tsx` + its GET route) — read-only, matching that page's existing always-`readOnly` application-form view.
- **CIG** (`src/app/cig/applications/[id]/page.tsx` + its GET/PATCH route) — read-only in the "View application form" modal; **editable** in `EditApplicationFormModal`, but only when the signed-in user holds `intake:edit` specifically (checked server-side via `hasModulePermission("intake", "edit", ...)`), independent of the `verification:edit` permission that gates the rest of that modal. This mirrors the `applications_cig_borrower_edit` RLS policy and the Phase 2A guard trigger, which both key off `intake:edit` for this column — so the control is never shown editable to a CIG user whose save would be silently rejected.
- **Collector** (`src/components/collection/OriginationPacketPanel.tsx` + `src/lib/collection/origination-packet.ts`) — read-only, matching that panel's existing always-`readOnly` application-form view.
- **Borrower's own portal** (`src/app/borrower/applications/[id]/page.tsx`) — deliberately **not** wired. The original plan's non-negotiable constraints explicitly exclude borrower-facing agent assignment/exposure (see "Out of scope" and "Do not expose... to borrower-facing forms" below); adding it here would need a separate decision, not a quiet extension of this fix.
- **LRA** (`src/app/lra/applications/[id]/page.tsx`) — does not render `ApplicantProfileFields` at all (confirmed by search), so it is out of scope; nothing to change there.

New/changed files from this correction: `src/components/borrowers/ApplicantProfileFields.tsx` (new `agent` prop), `src/app/csa/applications/[id]/page.tsx`, `src/app/api/committee/applications/[id]/route.ts`, `src/app/committee/applications/[id]/page.tsx`, `src/app/api/cig/applications/[id]/route.ts` (new `agentUserId` PATCH field, `intake:edit`-gated), `src/app/cig/applications/[id]/page.tsx`, `src/components/cig/EditApplicationFormModal.tsx`, `src/lib/collection/origination-packet.ts`, `src/components/collection/OriginationPacketPanel.tsx`.

Re-verified after this correction: `npx tsc --noEmit` shows no new errors, `npm run lint` shows none on any touched file, `npm test` — 1866 tests, 1859 pass, 0 fail, 7 skipped (pre-existing) — and a clean `npm run build`.

## Search-then-pick UX — 2026-09-23 (same day, follow-up)

The client asked to search for an agent and found only a plain dropdown. Confirmed live (both via `read_page`'s accessibility tree and a real click-through as CSA on `AN300444`) that the Agent control worked correctly as a relational assignment, but rendered as a native `<select>` with no type-to-filter — consistent with the rest of this codebase, which has no searchable-combobox component anywhere (`Combobox`/`Autocomplete`/`Typeahead`/`datalist` all absent from `src/components`). The adjacent legacy free-text "Sales Agent" field, directly below "Agent" in the same card, likely compounded the confusion.

Fix: replaced the native `<select>` with a new `AgentPicker` component in `ApplicantProfileFields.tsx` — a type-to-filter text input over the already-loaded `options` list (client-side filter, no new search endpoint, since the eligible-agent roster is small and already fetched in full), following the same search-then-pick interaction as the existing `ConnectBorrowerAccountPanel` borrower lookup. Read-only rendering (Committee, CIG's view modal, Collector) is unchanged — still plain text.

Live-verified end to end as CSA on SME application AN300444: typing "seed" filtered to "Agent (Seed)"; typing "xyz" showed "No matching agents." with "Unassigned" still selectable; selecting "Agent (Seed)" fired `PATCH /api/csa/applications/[id]` → 200, persisted through a reload, then cleared back to Unassigned (`PATCH` → 200) to leave no test data behind. `npm test`: 1875 tests, 1868 pass, 0 fail, 7 skipped (pre-existing).

**Goal:** Let authorised staff select, replace, or clear the responsible agent on every application form, while every form consistently displays that assignment, and close the database-level hole that lets non-staff write the assignment directly.
**Architecture:** Keep `loan_applications.agent_user_id` as the only application-assignment source; add server-validated staff editing, a DB-level column guard, and resolve the assigned profile for forms/documents, without changing lead ownership.
**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase Auth/Postgres/RLS, Node `--test`, Playwright.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. `loan_applications.agent_user_id` is nullable and all 145 live application rows are null: 71 Seafarer, 20 Individual, 34 SME-individual, and 20 SME-corporate. The live `leads.agent_user_id` is non-null, while only two active users hold the active `agent` role. The conversion route reads `lead.agent_user_id` and writes it only to its audit event, then calls `createCsaApplication`, whose insert omits `agent_user_id`; this is the verified cause of converted applications losing their assignment ([convert route](../src/app/api/csa/leads/[id]/convert/route.ts), [creator](../src/lib/csa/create-application.ts)). This plan changes no data and does not backfill historical rows.

**Additional live checks (2026-09-23, this revision):**

- The `loan_applications_agent_user_id_fkey` foreign key exists live, so no migration is needed solely to add the FK.
- `profiles.is_active` and `roles.is_active` both exist as columns, confirming the eligibility-query shape in Task 3.
- **RLS gap (blocking):** `applications_update`, `applications_borrower_draft_submit`, and `applications_insert` are row-level policies with no column restriction. Any borrower who owns an application in an editable/draft status can `UPDATE`/`INSERT` `agent_user_id` directly via the Supabase client, bypassing the new API route entirely. The only existing triggers on `loan_applications` are `guard_draft_status_transition` and `loan_applications_updated_at` — neither touches this column. A DB-level guard is required; see Phase 2A.
- **Template gap (blocking):** of the three published `document_templates` rows whose slug matches `application_form%`, only `application_form_sme_individual` and `application_form_sme_corporate` contain a `salesAgent` token in their published version. `application_form` (covers Seafarer and Individual — 91 of the 145 live rows) has no such placeholder. "Display on every current application-form rendering path" therefore requires publishing a new version of the `application_form` template with the placeholder added; it cannot be satisfied by generator/context code alone. See Phase 3, Task 4a.
- **Test runner gap (blocking):** `package.json`'s `test` script is `node --import tsx --test "src/lib/**/__tests__/*.mts"`. A test file under `src/app/api/csa/applications/[id]/__tests__/` does not match this glob and would never run under `npm test`. Route-level authorization/validation logic must be testable from `src/lib/**/__tests__/*.mts`; see Task 3's revised file list.

---

## Scope and constraints

### In scope

1. A staff-editable Agent dropdown with an explicit Unassigned option on the CSA application detail/form flow for all four live segment/entity variants.
2. A single API contract that returns eligible active agents and accepts an omitted, UUID, or explicit `null` assignment.
3. Server-side validation that the selected account is an active `agent` role holder before changing the existing application field.
4. Display of the resolved assignment in every current application-form rendering path, while safely rendering historic nulls — including publishing a new `application_form` template version that adds the missing placeholder (Task 4a).
5. Propagate agent ownership from an existing lead when CSA converts that lead into an application; do not infer ownership for any other creation path.
6. A forward-only migration adding a BEFORE INSERT/UPDATE trigger on `loan_applications` that rejects any `agent_user_id` change not made by `is_super_admin()` or an actor holding `has_module_permission('intake', 'edit')`, closing the borrower-writable RLS gap found in validation (Phase 2A).

### Out of scope — do not change

Do not backfill 145 historic rows; create users/roles; alter `leads.agent_user_id`; grant agents broader access; add agent assignment to public borrower-created applications; change application workflow/statuses; edit the `application_form_sme_individual` or `application_form_sme_corporate` template bodies (they already have the placeholder); or replace the legacy JSON `businessInfo.salesAgent` except as a read-only fallback for historic document data. The `application_form` template body is the one narrow exception (item 4 above) because no code path can render a field with no placeholder.

### Non-negotiable safety constraints

- Keep `loan_applications.agent_user_id` nullable. Omitted PATCH field means unchanged; only literal `null` clears it.
- Preserve the existing authenticated update path and its status guard; never use the service client to bypass the `applications_update` RLS policy.
- Validate active profile plus active `roles.slug = 'agent'` at the API boundary; a dropdown value is never authority.
- Keep lead ownership and application ownership independent after conversion. A later staff reassignment must not update the lead.
- Do not expose emails, role IDs, Auth metadata, or inactive accounts to borrower-facing forms.
- Forward-only migrations only; never edit an applied migration. The FK (`loan_applications_agent_user_id_fkey`) is already deployed and needs no migration. One migration **is** required for the Phase 2A column-guard trigger — the "no migration" framing in the original plan was disproven by the RLS audit above and is superseded by scope item 6.

### Assignment contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Staff opens editable application | Authenticated user with existing `intake:view` detail access | Return current assignment as null; do not invent one |
| Staff saves active agent UUID | Existing `intake:edit` actor and selected active Agent | Update only `loan_applications.agent_user_id`; audit before/after IDs |
| Staff clears assignment | Existing `intake:edit` actor | Persist null; lead remains unchanged |
| CSA converts agent lead | New application only | Copy that lead’s UUID into the new application insert |
| Public borrower/direct CSA creation | Nobody automatically | Keep null unless the staff form explicitly saves a validated selection |

## Files

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<timestamp>_guard_application_agent_column.sql` (create) | BEFORE INSERT/UPDATE trigger on `loan_applications` rejecting non-staff `agent_user_id` writes (Phase 2A). Apply via Supabase MCP `apply_migration`, per project convention — not `db push`. |
| `src/lib/csa/create-application.ts` | Add a separate `options?: { agentUserId?: string \| null }` parameter to `createCsaApplication` (do not extend `CreateApplicationInput`/`createApplicationSchema`, which is the public request schema) and include the column only when supplied. |
| `src/app/api/csa/leads/[id]/convert/route.ts` | Pass the already-read `lead.agent_user_id` as `options.agentUserId` to the creator. |
| `src/lib/csa/agent-assignment.ts` (create) | Testable module: eligible-active-agent query and assignment validation, called by both the PATCH route and its tests (see test-runner gap above). |
| `src/app/api/csa/applications/[id]/route.ts` | Add detail lookup (via `agent-assignment.ts`), PATCH schema, persistence, and audit before/after assignment; route itself stays a thin wrapper. |
| `src/app/csa/applications/[id]/page.tsx` | Render and save the staff dropdown without weakening existing edit gating. |
| `src/app/api/csa/applications/[id]/application-form/route.ts` | Include a safe resolved display name in form data. |
| `src/lib/documents/generators/application-form-context.ts` | Prefer relational assignment display name, retaining legacy `businessInfo.salesAgent` fallback only for null historic rows. |
| `src/lib/documents/generators/application-form.ts` | Wire the existing `salesAgent` placeholder to the canonical context value only if required by current renderer shape. |
| `application_form` template (Task 4a) | New published `document_template_versions` row for the `application_form` document template (slug `application_form`), adding the `{{salesAgent}}` placeholder that the Seafarer/Individual variant currently lacks. Edited through the existing document-template-system editor/versioning flow, not a raw SQL update. |
| `src/lib/csa/__tests__/create-application.test.mts` (create if absent) | Unit tests for creator payloads. |
| `src/lib/csa/__tests__/agent-assignment.test.mts` (create) | Eligibility-query and validation unit tests — runs under the project's actual `npm test` glob. |
| `src/lib/documents/generators/__tests__/application-form-context.test.mts` | Assigned/null/fallback context tests per form variant. |
| `src/lib/documents/generators/__tests__/application-form-render-pass.test.mts` | Render assertions across every existing application template variant, including the updated `application_form`. |

## Phase 0 — Baseline tests

### Task 1: Capture the broken ownership propagation and form contract

**Files:** Create: `src/lib/csa/__tests__/create-application.test.mts`; Modify: the two existing generator test files.

- [x] Add a failing creator assertion that an input `{ agentUserId: 'agent-uuid' }` produces an insert containing `agent_user_id: 'agent-uuid'`; add assertions that absent input omits it and null persists null. *(Implemented as `buildApplicationInsertRow` — see `src/lib/csa/__tests__/create-application.test.mts`, "agent_user_id" describe block. Deviation: implemented code and tests together rather than a literal red→green step; final suite is green, see Phase 4.)*
- [x] Add four fixtures (Seafarer, Individual, SME-individual, SME-corporate) where a relational assigned name renders into `salesAgent`; add null fixtures that render without throwing. *(See "salesAgent precedence" tests in `application-form-context.test.mts`.)*
- [x] Run: `npm test -- --test-name-pattern="agent|application form"`; Expected: FAIL because the creator cannot accept/pass the assignment and context only reads JSON `salesAgent`. *(Deviation: run after implementation, so result is PASS, not the literal FAIL — see Phase 4's full `npm test` run.)*
- [x] Manual/live checks: 1. Record no production IDs or names in fixtures — confirmed, all fixtures use synthetic names ("Agent Smith", "Agent A"). 2. Confirm current templates still use `{{salesAgent}}` before modifying renderer code — confirmed live via `execute_sql`: `application_form_sme_individual` and `application_form_sme_corporate` both `has_placeholder = true`; `application_form` `has_placeholder = false` (matches the plan's validation section).

**Phase constraints:** Tests must describe only observed form variants and production-independent UUID fixtures; do not write to Supabase or change templates.

## Phase 1 — Make conversion preserve explicit lead ownership

### Task 2: Add a typed, optional assignment to the existing creator

**Files:** Modify: `src/lib/csa/create-application.ts`, `src/app/api/csa/leads/[id]/convert/route.ts`, creator tests.

- [x] Add a fourth, optional `options?: { agentUserId?: string | null }` parameter to `createCsaApplication(supabase, actorId, body, options?)`; do not extend `CreateApplicationInput`/`createApplicationSchema` (the public request schema used by borrower/CSA creation).
- [x] Build the insert with `...(options?.agentUserId !== undefined ? { agent_user_id: options.agentUserId } : {})`; this distinguishes omitted from explicit null. *(Extracted into exported `buildApplicationInsertRow` so it's unit-testable without a Supabase client.)*
- [x] At conversion call site, pass `{ agentUserId: lead.agent_user_id }`; do not query a profile or derive an agent from the CSA actor. The plain create-application route (`src/app/api/csa/applications/route.ts`) passes no options, so its behaviour is unchanged. *(Verified: that route still calls `createCsaApplication(supabase, user.id, body)` with no fourth argument.)*
- [x] Run: `npm test -- --test-name-pattern="create application|lead convert"`; Expected: PASS. *(See Phase 4's full `npm test` run — all green.)*
- [x] Manual/live checks: 1. Convert an agent-owned lead in a non-production environment. 2. Verify application UUID equals lead UUID. 3. Verify lead's UUID remains unchanged after later application edits. *(No staging environment is available — verified instead with a rollback-safe live-DB transaction reproducing the exact insert/update sequence `createCsaApplication` + the convert route perform, against a real open agent-owned lead: the new application's `agent_user_id` came out equal to the lead's `agent_user_id` (`80d48e99-9154-44df-bd37-29d2afc8432b`), and the lead's own `agent_user_id` was left untouched. Transaction was rolled back — no data changed. A live UI click-through is still recommended as a human follow-up.)*

**Phase constraints:** No backfill or lead-table update. Preserve the route’s existing atomic lead-link conditions (`application_id IS NULL`, `status = 'open'`). This phase adds no trigger — that is Phase 2A.

## Phase 2A — Close the DB-level column-write gap

### Task 2a: Add the `agent_user_id` write guard trigger

Live audit (see validation section above) showed `applications_update`, `applications_borrower_draft_submit`, and `applications_insert` are row-level policies with no column restriction: any borrower who owns an editable/draft application can write `agent_user_id` directly through the Supabase client, bypassing the Phase 2 API route entirely. This task closes that gap at the database.

**Files:** Create: `supabase/migrations/<timestamp>_guard_application_agent_column.sql`.

- [x] Write a `BEFORE INSERT OR UPDATE` trigger function on `loan_applications` that, when `NEW.agent_user_id IS DISTINCT FROM OLD.agent_user_id` (or is non-null on INSERT), raises an exception unless `is_super_admin()` or `has_module_permission('intake', 'edit')` is true for the acting session — reusing the same helper functions the existing RLS policies already call, so behaviour stays consistent with them.
- [x] Apply the migration via the Supabase MCP `apply_migration` tool (per this project's established convention — not `supabase db push`). *(Applied as `20260923032933_guard_application_agent_column`; file also saved to `supabase/migrations/` in the repo.)*
- [x] Manual/live checks, run against the live project with the same MCP read-only/execute tooling used for validation: 1. As a borrower session, attempt to `UPDATE loan_applications SET agent_user_id = <uuid>` on the borrower's own draft application; expect rejection — confirmed: `ERROR: 42501: Only staff with intake:edit (or a super admin) may set agent_user_id`. 2. As a staff session with `intake:edit`, confirm the same update still succeeds — confirmed: update returned the new `agent_user_id`. 3. Confirm `is_super_admin()` sessions remain unrestricted, matching every other policy — confirmed: super admin session cleared `agent_user_id` to null without error. All three run inside `begin; ... rollback;` transactions — no live data changed.

**Phase constraints:** Forward-only; do not edit any already-applied migration. Do not widen `is_super_admin()`/`has_module_permission` beyond what other `loan_applications` policies already use.

## Phase 2 — Provide the staff assignment API safely

### Task 3: Add eligible-agent read and PATCH validation

**Files:** Create: `src/lib/csa/agent-assignment.ts`, `src/lib/csa/__tests__/agent-assignment.test.mts`; Modify: `src/app/api/csa/applications/[id]/route.ts`.

- [x] In `src/lib/csa/agent-assignment.ts`, add a function returning only `{ id, fullName }` eligible-agent options, joining `profiles` → `user_roles` → `roles` and requiring `profiles.is_active = true`, `roles.is_active = true`, `roles.slug = 'agent'`; and a validation function that re-checks one candidate ID against the same query. *(Deviation: implemented as two sequential Supabase queries — `user_roles!inner(roles)` filtered by slug/is_active, then `profiles` filtered `.in(ids).eq(is_active,true)` — rather than one embedded query, because `user_roles.user_id` has no PostgREST-embeddable FK to `profiles`, only to `auth.users`. Same net eligibility requirement, same pattern as the existing `getRoleUserIds` in `src/lib/notifications/workflow-recipients.ts`.)*
- [x] In the route, call the eligible-agent function for the detail response, and the validation function from PATCH before `loan_applications.update`.
- [x] Add `agent_user_id: z.string().uuid().nullable().optional()` to the existing PATCH schema.
- [x] When the property is present, reject inactive/non-agent IDs with 400 and leave the row unchanged (the Phase 2A trigger is the backstop, not a substitute for this check — it protects against bypass of this route, not against this route accepting a bad ID).
- [x] Include old/new UUID (not names or emails) in the existing audit event's before/after data. *(`afterData.agentAssignment = { before, after }`.)*
- [x] Add literal tests **in `src/lib/csa/__tests__/agent-assignment.test.mts`** ... for: active agent returned as eligible; inactive/non-agent excluded; validation accepts an active agent and rejects inactive/non-agent/staff IDs. *(Done, with a small fake chainable query-builder client, same style as `fakeSupabase` in `src/lib/ar/__tests__/internal-transfers.test.mts`.)* No route-level integration-test pattern exists in this project for exercising Next.js API routes under the `.mts` runner, so the route's own authorization/audit behaviour (success, null clear, 400, 403, omitted-property-unchanged) is **not** covered by an automated test — left as the manual/live check below, not invented as a test location.
- [x] Run: `npm test -- --test-name-pattern="agent assignment"`; Expected: PASS. *(See Phase 4's full `npm test` run — all green.)*
- [ ] Manual/live checks: 1. Staff A can save/reload/replace/clear. 2. Borrower and Agent requests receive existing authorization failures. 3. Inactive Agent cannot be selected even if a stale client submits their UUID. *(Not run — requires the actual Next.js dev server + an authenticated staff session, which this task did not stand up. The underlying logic is unit-tested (`isEligibleAgent` in `agent-assignment.test.mts`) and the DB-level guard is live-verified (Phase 2A), but the PATCH route's own 400/403 responses were not exercised end to end. Recommend a human QA pass through the running app.)*

**Phase constraints:** Retain all existing status/field guards. RLS is row-level, so application eligibility must be enforced in this route rather than presumed from RLS (Phase 2A's trigger is a backstop against bypass, not a replacement for this check).

## Phase 3 — Render one canonical value in every form

### Task 4: Bind the dropdown and document context

**Files:** Modify: CSA page, application-form route, generator/context files, generator tests.

- [x] Add a labelled `Agent` select only inside the existing staff-editable section; include `Unassigned` with `value=""` mapped to null. *(`src/app/csa/applications/[id]/page.tsx`, new "Agent" card — select is shown only when `editable`; read-only fallback shown otherwise.)*
- [x] Hydrate its selected value from the detail response; disable/save according to current page mutation state and existing CSA edit permission, not a new client-only role check. *(`value={data.application.agentUserId ?? ""}`, `disabled={savingAgent}`, gated by the existing `editable` flag used throughout the page — no new client-side role check.)*
- [x] Resolve `loan_applications.agent_user_id` to the safe display name in both form response and generator query/context. *(`resolveAssignedAgentName` wired into `application-form.ts` and the `application-form/route.ts` GET response.)*
- [x] Define precedence exactly: assigned active profile full name; if assignment null, existing `businessInfo.salesAgent`; otherwise blank. Do not copy data between stores. *(`salesAgent = str(input.assignedAgentName) || str(biz.salesAgent)` in `application-form-context.ts`; both sources stay in their own columns.)*
- [x] Run: `npm test -- --test-name-pattern="application-form"`; Expected: PASS. *(See Phase 4's full `npm test` run — all green.)*
- [ ] Manual/live checks: 1. Generate the SME-individual and SME-corporate variants with an assignment (their templates already carry the placeholder). 2. Generate a historic null record. 3. Verify user email is absent from HTML/API form payload. 4. Reload does not alter an unassigned record. *(Not run live — requires the running app's document-render pipeline (pdfmake) and an authenticated CSA session. Real-template rendering with a resolved `assignedAgentName` was verified at the unit level instead: "Agent assignment: SME Individual template prints the resolved assignedAgentName, not the legacy field" in `application-form-render-pass.test.mts` merges the actual live SME-Individual template body and confirms the assigned name appears and the legacy field does not; no email field is included in any context object built by `buildApplicationFormContext`. Recommend a human QA pass through the running app for the PDF-level checks.)*

**Phase constraints:** No markup change to `application_form_sme_individual` or `application_form_sme_corporate` (already have the placeholder). `application_form` (Seafarer/Individual) is handled separately in Task 4a because it has no placeholder to bind to. Preserve historic `salesAgent` fallback only for null relational assignment.

### Task 4a: Publish the missing placeholder on the `application_form` template

Confirmed live: the published `application_form` template (Seafarer + Individual, 91 of 145 rows) has no `salesAgent` token, unlike the two SME variants. Task 4's context/generator binding cannot surface an assignment on a template with no placeholder for it.

**Files:** `application_form` document template, via the existing document-template-system's in-app editor/publish flow — not a raw SQL update to `document_template_versions`.

- [ ] **BLOCKED — needs a human.** Using the existing template editor, create a new draft version of the `application_form` template that adds the same `{{salesAgent}}` placeholder present in the SME variants, positioned consistently with the SME layout. *(This is the in-app admin flow at `/admin/document-templates` — `src/app/api/admin/document-templates/[id]/draft/route.ts` and `.../publish/route.ts`, both gated by an authenticated admin session with no MCP or script equivalent. Per this task's explicit constraint, a raw SQL edit to `document_template_versions` was deliberately not attempted. All other Task 4/4a code is implemented and ready for this template version once it exists — `assignedAgentName` will render through the same `{{salesAgent}}` placeholder used by the two SME templates, no code change needed.)*
- [ ] **BLOCKED — needs a human.** Publish the new version through the existing publish flow (do not delete or edit the currently-published version's row; template versioning is append-only per the document-template-system's existing design).
- [ ] Run: `npm test -- --test-name-pattern="application-form-render-pass"`; Expected: PASS for the Seafarer/Individual fixtures added in Phase 0 Task 1. *(Not run against the Seafarer `application_form` template specifically, since it has no placeholder yet and the migration seed body cannot be edited (forward-only). Deliberately did not add a render-pass assertion that depends on the unpublished template — see Task 1's fixtures and the SME-Individual render-pass assertion added instead, which exercises the same precedence logic against a template that already has the placeholder.)*
- [ ] Manual/live checks: 1. Generate a Seafarer application form with an assignment and confirm the name renders. 2. Generate an Individual application form with an assignment and confirm the name renders. 3. Confirm a pre-existing (historic) Seafarer/Individual document generated before this change still renders unchanged when regenerated with a null assignment. *(Blocked on the template publish above; Individual segment already resolves to `application_form_sme_individual`, which has the placeholder — item 2 can be checked independently once the API route is exercised live.)*

**Phase constraints:** Additive template version only; do not remove or rewrite unrelated fields on the existing template. This is the one template edit this plan makes (see Out of scope).

## Phase 4 — Regression verification and rollout

- [x] Run focused tests from Phases 0–3 and 2A/4a; Expected: PASS. *(2A has no JS tests — it's a DB trigger, verified live in Phase 2A's own manual checks. 4a's own render-pass assertion is blocked; see Task 4a.)*
- [x] Run: `npm test`; Expected: PASS. *(1828 tests, 1821 pass, 0 fail, 7 skipped (pre-existing skips, unrelated to this plan) — full output in the final report.)*
- [x] Run: `npm run lint`; Expected: PASS. *(130 pre-existing errors / 36 warnings in files this plan did not touch — confirmed via `git status --short` that none of the flagged files are among this plan's changes. Zero lint errors in any file this plan created or modified.)*
- [x] Run: `npm run build`; Expected: PASS. *(Production build completed with no errors; all routes, including the modified `csa/applications/[id]` page and its three touched API routes, compiled successfully.)*

| Case | Expected result |
| --- | --- |
| Active staff assigns Agent A | Only the application assignment changes and audit records UUID transition |
| Staff clears it | Application is null; lead stays assigned to its prior owner |
| Converted agent lead | New application receives the lead’s UUID |
| Four document variants (incl. newly-published `application_form`) | Assigned name appears; no email/auth data appears |
| Historic null | Form/document succeeds and uses fallback or blank |
| Inactive/non-agent/unauthorised request | 400/403 and no application row change |
| Borrower attempts direct `agent_user_id` write via Supabase client (Phase 2A) | Rejected by the trigger; row unchanged |

- [ ] Pre-production checklist: confirm the Phase 2A migration is the only migration created, no other RLS policy changes, no historic update query, the new `application_form` template version is published, and only the Files-table paths are staged: `git add` exactly those paths before commit. *(Partially satisfied: confirmed the Phase 2A trigger migration is the only migration created, no other RLS policy changed, and no historic-row update was run against `loan_applications` or `leads`. Left unchecked because the `application_form` template version is not published — blocked on Task 4a (human admin-UI action). Nothing was committed or staged per this task's own instructions, so the `git add` step was not performed either.)*

## Rollback

1. If the UI misrenders, revert the CSA page and form-response changes; stored UUIDs remain valid under the pre-existing nullable FK.
2. If conversion propagation misbehaves, forward-fix/revert only the creator options-argument path; do not clear lead or application ownership in bulk.
3. If document display is wrong, revert precedence to the previous JSON fallback while preserving saved UUID data.
4. If the `application_form` template version misrenders, revert the template's published-version pointer to the prior version (append-only versioning already supports this); do not edit the new version's row in place.
5. If the Phase 2A trigger misbehaves (e.g. blocks a legitimate staff write), ship a forward corrective migration adjusting the trigger's permission check; never edit the applied migration in place, and never drop the trigger without a replacement guard, since that reopens the RLS gap.
6. Never delete audit rows.

## Self-review

- **Contradictions:** The original draft said both "display on every form" and "no template changes" — resolved by scoping the one required template edit (Task 4a) explicitly into scope, rather than leaving both claims standing.
- **Goal reachability:** For existing rows (all null), forms render the fallback/blank per the defined precedence. For rows created tomorrow: staff-created and lead-converted applications get the assignment through the API route and creator options respectively; direct-insert paths (borrower self-service, other API routes) are unaffected, matching scope item 5's "no other creation path" limit.
- **Bypass:** The original draft relied solely on API-route validation; live RLS policies showed borrowers can write the column directly. Closed via the Phase 2A trigger, which applies regardless of client (Supabase JS, curl, another route).
- **Existence:** Every file, column, function, and policy named in this revision was confirmed to exist via source read or live Supabase query (see validation section and inline citations); `agent-assignment.ts` and the migration file are new and explicitly marked create.
- **Consistency:** The Files table, phase tasks, and pre-production checklist now name the same paths, including the new `agent-assignment.ts`/test and the migration file. Test paths match `npm test`'s actual glob (`src/lib/**/__tests__/*.mts`); the original draft's route-level test path did not.
- **Duplication:** No second source of truth is created — `businessInfo.salesAgent` remains the legacy, read-only-for-this-feature fallback field; the relational `agent_user_id` is the sole editable source.
- **Placeholders:** No TODO/TBD/`<...>` remains; the template-editor file reference has been corrected to point at the actual in-app flow rather than an invented path.

This plan covers the verified missing conversion write, staff assignment, all four live form variants (including the one requiring a template edit), the database-level column-write gap, document precedence, and null history. Live data proved every existing application is null and only two active agents exist, so no backfill or assumed assignment is included. It deliberately excludes lead reassignment, permissions redesign, borrower creation changes, and the legacy `businessInfo.salesAgent` field's editability; these would be separate decisions and plans.
