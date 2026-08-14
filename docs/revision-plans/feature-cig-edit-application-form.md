# Feature — CIG in-place edit of the borrower's application form (Revision Tracker 2, Item 1)

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror the existing patterns exactly (CSA's `patchSchema` field list, `borrowerProfileToRow`/`mapBorrowerRow` mappers, `writeAuditEvent` before/after shape) — do not invent a different mechanism.
- Do not touch `loan_applications` (status, blocker, status_history) or the `computations` table from this feature — this edit only ever writes to `borrowers`.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, tests run/result.

## Background

Revision Tracker 2, Item 1: CIG staff, while conducting the credit investigation (interviews, reference checks), sometimes find the applicant's submitted personal info or reference contacts are wrong (typo'd name, outdated phone, wrong reference address) and need to correct them in place — not trigger a re-submission, not touch the loan amount/computation, not touch borrower-uploaded documents. Every edit must be attributed, timestamped, and keep the original value on record (audit trail), accessible via an "Edit Application Form" button inside the CI module view.

## Audit findings (verified 2026-08-14)

- **This is mostly already wired, just narrow.** CIG already has a working PATCH route, RLS grant, and role permission for editing `borrowers` — it's just scoped today to 4 name fields only.
  - Route: `src/app/api/cig/applications/[id]/route.ts`. `PATCH` (`:276-392`) is gated by `requireModulePermission("verification", "edit")` (`:278`) and `assertCigVerificationStage(supabase, id)` (`:282`, `src/lib/cig/queue-guards.ts:10-29`), which throws unless `loan_applications.status === 'for_verification'`. `patchSchema.borrower` (`:141-149`) currently only accepts `{ firstName, middleName, lastName, suffix }`.
  - The actual DB write (`:307-314`): `borrowerProfileToRow(...)` → `supabase.from("borrowers").update(row).eq("id", application.borrower_id)`. This is a plain `.update()` on `borrowers` only — confirmed no trigger anywhere connects a `borrowers` write to `loan_applications.status`/`blocker`/`status_history` (only trigger on `borrowers` is the generic `updated_at` bump, `supabase/migrations/20260706120000_p2_borrower_agent_documents.sql:117`); confirmed no app code calls any blocker-sync/status-transition function from this path. **Editing here cannot trigger a re-submission or status change, by construction.**
  - RLS already permits this, live-verified (`pg_policies`, `borrowers_cig_update`): `is_super_admin() OR (has_module_permission('intake','edit') AND EXISTS (loan_applications la WHERE la.borrower_id = borrowers.id AND la.status = 'for_verification'))`. No RLS change needed.
  - Role grant already exists (`supabase/migrations/20260706100002_p1_seed_data.sql:61-63`): `cig` has `verification.can_edit = true` (route gate) and `intake.can_edit = true` (RLS gate). `cig`'s `computation` grant is view-only (`can_edit = false`) — loan computation is already correctly locked out, nothing to do there.
  - Audit today only writes `afterData` (`route.ts:316-323`) — **no `beforeData`**. This is the gap to close for the "original values retained" requirement.
- **Reference implementation for full before/after audit** (the exact pattern to copy): `src/app/api/borrower/profile/route.ts:159,184-201` — fetch the row first (`existing`), `.update(...).select("*").single()` for the updated row, then `writeAuditEvent({ actorId, moduleSlug, action: "update", entityType: "borrower", entityId, beforeData: mapBorrowerRow(existing), afterData: mapBorrowerRow(updated) })`. Full-row snapshots via the existing mapper, not raw request-body diffs — this is what every other before/after audit call site in the codebase does (`src/app/api/admin/users/[id]/route.ts:128`, `src/app/api/admin/roles/[id]/route.ts:99,144`, `src/app/api/documents/[id]/confirm/route.ts:65`, etc.).
- **`audit_events` is append-only at the DB level** (`BEFORE UPDATE OR DELETE` trigger `audit_events_no_update`, `supabase/migrations/20260706100000_p1_foundation_schema.sql:97-100`, raises on any mutation) — the trail is tamper-proof by construction, no extra work needed for that guarantee. It's already viewable at `/admin/audit` (`src/app/admin/audit/page.tsx`) — no new viewer UI needed.
- **Full field list to mirror, from CSA's own edit schema** (`src/app/api/csa/applications/[id]/route.ts:28-53`, the established "who edits the application form" reference): `firstName, middleName, lastName, suffix, dateOfBirth, placeOfBirth, citizenship, civilStatus, gender, mobilePhone, landline, presentAddress, permanentAddress, manningAgency, financial, allottee, picWork, businessInfo, dependents, references, profileData`. CSA's schema also has a separate `details: { loanTypeId, internalFlags, staffNotes }` block targeting the `application_details` table — **excluded from CIG's scope** (loan-type/config concern, not personal info/references, and not requested).
  - `financial` (`monthlyIncome, otherIncome, bankName, accountNumber, ...`, `src/lib/borrowers/types.ts:33-43`) is the borrower's *submitted* income/bank info on the original application form, not the *computed* loan (that's the separate `computations` table CIG has no edit access to) — in scope per "any other fields on the original application form."
  - `references` is `Reference[]` (`types.ts:76-82`: `name, relationship, address, phone, occupation`) — this is `borrowers.references_data`, the applicant's submitted character references. **Do not confuse with `verification.referenceVerifications`** — that's CIG's own call-log/investigation output (a different JSON column on the `verifications` table, edited via the existing `CiReferencesFormModal.tsx` and `saveCiForm`, `src/app/cig/applications/[id]/page.tsx:385-401`), already working, untouched by this feature.
- **Field-rule gate**: `validateFieldEdit("verification", "borrower_info", user.id)` (`route.ts:289-297`, backed by `src/lib/permissions/field-rules.ts` + `role_field_rules` seed, `supabase/migrations/20260706100002_p1_seed_data.sql:75-80`) currently gates all 4 existing name fields under one coarse key, `"borrower_info"`. Keeping this single coarse key for the expanded field set (rather than inventing granular per-field keys) matches current behavior exactly and needs no new `role_field_rules` seed rows — going granular is not requested and adds surface area for no asked-for benefit.
- **No dedicated "application form editor" component exists anywhere to reuse** (checked `src/components/csa/`, `src/components/borrower/` — CSA's own editing is inline page fields, not a shared component). The existing CIG-module reference for a modal-based editor is `src/components/cig/CiReferencesFormModal.tsx` — new component follows that file's structural pattern (controlled local draft state, save button, closes on success), not its content.
- **Current UI**: `src/app/cig/applications/[id]/page.tsx:895-929` — a 2-field (first/last name) inline form inside the borrower profile sidebar card, gated by `editable` (`page.tsx:249` from the API, `application.status === "for_verification"`), submitted via `handleSaveBorrower` (`:403-425`). This stays as-is (a quick name-only touch-up) — the new "Edit Application Form" button opens a separate modal for the full field set, per the request's explicit UI ask.

## Scope decision

Two phases: backend (schema + audit trail) first since it's additive and low-risk, then the frontend modal.

---

## Phase 1 — Backend: expand editable fields + before/after audit trail

**Goal:** `PATCH /api/cig/applications/[id]` accepts the full personal-info + references field set (mirroring CSA's schema minus `details`), and every borrower edit from this route writes both `beforeData` and `afterData` to `audit_events`.

### Files to change

1. **`src/app/api/cig/applications/[id]/route.ts`**
   - Extend `patchSchema.borrower` (`:141-149`) to accept the full field list, copied verbatim from `src/app/api/csa/applications/[id]/route.ts:29-52` minus `businessInfo`... — no, include `businessInfo` too (SME personal/business info is in scope, see audit note above). Do **not** add a `details` block — out of scope.
     ```ts
     borrower: z
       .object({
         firstName: z.string().optional(),
         middleName: z.string().nullable().optional(),
         lastName: z.string().optional(),
         suffix: z.string().nullable().optional(),
         dateOfBirth: z.string().nullable().optional(),
         placeOfBirth: z.string().nullable().optional(),
         citizenship: z.string().nullable().optional(),
         civilStatus: z.string().nullable().optional(),
         gender: z.string().nullable().optional(),
         mobilePhone: z.string().nullable().optional(),
         landline: z.string().nullable().optional(),
         presentAddress: z.record(z.string(), z.unknown()).optional(),
         permanentAddress: z.record(z.string(), z.unknown()).optional(),
         manningAgency: z.record(z.string(), z.unknown()).optional(),
         financial: z.record(z.string(), z.unknown()).optional(),
         allottee: z.record(z.string(), z.unknown()).optional(),
         picWork: z.record(z.string(), z.unknown()).optional(),
         businessInfo: z.record(z.string(), z.unknown()).optional(),
         dependents: z.array(z.record(z.string(), z.unknown())).optional(),
         references: z.array(z.record(z.string(), z.unknown())).optional(),
         profileData: z.record(z.string(), z.unknown()).optional(),
       })
       .optional(),
     ```
   - In the `PATCH` handler's `if (body.borrower)` block (`:285-324`):
     - Replace the hardcoded `const borrowerFields = ["firstName", "middleName", "lastName", "suffix"] as const;` loop with one field-rule check covering the whole edit (still `validateFieldEdit("verification", "borrower_info", user.id)`, called once, not per-field — the existing per-field loop was pointless when every field maps to the same coarse key; simplify to a single check before the update, same behavior, less code).
     - Before building `row`/calling `.update()`, fetch the current borrower row for the before-snapshot: `const { data: existingBorrower } = await supabase.from("borrowers").select("*").eq("id", application.borrower_id).single();` (mirror `src/app/api/borrower/profile/route.ts:159`).
     - Pass the **full** `body.borrower` object (not just the 4 name fields) into `borrowerProfileToRow(...)`.
     - Change `.update(row)` to `.update(row).select("*").single()` and capture the returned row as `updatedBorrower`.
     - Change the `writeAuditEvent` call (`:316-323`) to include `beforeData: mapBorrowerRow(existingBorrower)` and `afterData: mapBorrowerRow(updatedBorrower)` in place of the current `afterData: body.borrower`. Keep `moduleSlug: "verification"`, `action: "update"`, `entityType: "borrower"`, `entityId: application.borrower_id`.
     - Import `mapBorrowerRow` alongside the existing `borrowerProfileToRow` import at the top of the file (check the current import line — `borrowerProfileToRow` is already imported from `@/lib/borrowers/types`; add `mapBorrowerRow` to that same import if not already present).
   - Do not change the `body.verification` branch (`:328-365`) or anything else in the file.

### Validation checklist — Phase 1

- [ ] `patchSchema.borrower` accepts the full field list above; a request with only `{ firstName }` still works (all fields remain optional, matching CSA's schema).
- [ ] A PATCH that changes e.g. `mobilePhone` and `references` actually updates `borrowers.mobile_phone` and `borrowers.references_data` in the DB.
- [ ] `audit_events` gets a row with `module_slug='verification'`, `action='update'`, `entity_type='borrower'`, `before_data` containing the pre-edit full borrower snapshot and `after_data` containing the post-edit snapshot — confirm the two differ only in the fields actually changed.
- [ ] Editing via this route does **not** change `loan_applications.status`, `blocker`, or `status_history` for the application (spot-check before/after).
- [ ] A PATCH attempted when `loan_applications.status !== 'for_verification'` still fails with the existing `assertCigVerificationStage` error (unchanged behavior).
- [ ] `financial`/`computation`-adjacent fields on the `computations` table remain completely untouched — this route never references that table.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Not Started

---

## Phase 2 — Frontend: "Edit Application Form" modal

**Goal:** An "Edit Application Form" button in the CI module's application view opens a modal covering personal info, addresses, manning agency, financial info, allottee, PIC work, dependents, and references — pre-filled from the current record, saved via the Phase 1 route.

### Files to change

1. **New file: `src/components/cig/EditApplicationFormModal.tsx`**
   - Structural pattern to follow: `src/components/cig/CiReferencesFormModal.tsx` (controlled local draft state initialized from a `borrower: BorrowerProfile` prop, a save handler that PATCHes and closes on success, cancel discards the local draft) — but content is the full personal-info/reference field set, not the CI call-log.
   - Sectioned form (plain sections, no wizard/stepper needed): Personal info (name parts, dateOfBirth, placeOfBirth, citizenship, civilStatus, gender, mobilePhone, landline), Present address, Permanent address, Manning agency, Financial info, Allottee, PIC work, Dependents (repeatable rows), References (repeatable rows, reuse the same `name/relationship/address/phone/occupation` shape already used by `CiReferencesFormModal`'s read-only display of `borrower.references`).
   - On submit: `PATCH /api/cig/applications/${applicationId}` with `{ borrower: <changed-or-full fields> }`, same fetch/error-handling shape as `handleSaveBorrower` (`src/app/cig/applications/[id]/page.tsx:403-425`).
   - Do **not** include any computation, loan amount, or document-upload fields — this modal only ever touches the `borrower` object.

2. **`src/app/cig/applications/[id]/page.tsx`**
   - Add an "Edit Application Form" button near the existing borrower profile card (the one containing the current name-only inline form, `:894-944`) — button visible only when `editable` is true (same gate the existing inline form already uses).
   - Add local state to open/close `EditApplicationFormModal`, pass `borrower`, `applicationId`, and an `onSaved` callback that calls `load({ silent: true })` (mirroring how `handleSaveBorrower` refreshes, `:419`).
   - Leave the existing 2-field name-only inline form (`:895-929`) exactly as-is — do not remove or merge it with the new modal.

### Validation checklist — Phase 2

- [ ] Button only renders when `editable` is true (i.e., `status === 'for_verification'`), matching the existing inline name form's gating.
- [ ] Modal opens pre-filled with the application's current values for every included field.
- [ ] Saving a change (e.g. a reference's phone number) round-trips: modal closes, page reloads data, the new value displays.
- [ ] No computation/loan-amount/document field appears anywhere in this modal.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Not Started

---

## Final validation

- [ ] Full test suite run — no new failures.
- [ ] Live: as the CIG seed user, open an application in `for_verification` status, edit a personal-info field and a reference contact via "Edit Application Form," confirm the change displays immediately and persists on reload.
- [ ] Live: query `audit_events` for that edit — confirm `before_data`/`after_data` are both populated and differ only in the changed fields, `actor_id` matches the CIG user, `created_at` is the edit time.
- [ ] Live: confirm the application's `status`/`blocker`/`status_history` are unchanged after the edit.
- [ ] Live: confirm a non-CIG role (e.g. Collector) cannot reach this route/UI (existing permission gates untouched).
