# Phase 1 — Item 1: Replace "Skype" with "Teams" as a contact option

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules (audit-first, Cursor implements, Claude validates) and overall status.

**Tracker item:** *Replace "Skype" with "Teams" as a contact option in the application form.*

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables beyond what this phase's migration specifies. Additive only unless stated otherwise.
- Run existing tests for the touched area after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, migration(s) applied, tests run/result, and anything you deliberately left alone that looked related.

## Audit findings (evidence, verified 2026-08-10)

- The "Skype" field is a free-text contact field on the borrower profile form, not a dropdown — it captures a Microsoft Teams/Skype handle the same way "Viber" does next to it.
- Code touchpoints (all reference the same underlying `skype` key):
  1. `src/components/borrowers/ApplicantProfileFields.tsx:374-379` — the visible field: `id="skype"`, `label="Skype"`, bound to `contact.skype`, `onChange={(v) => setProfileData({ skype: v })}`.
  2. `src/lib/borrowers/types.ts:88` — `skype?: string;` on the contact-info type.
  3. `src/lib/documents/generators/application-form-context.ts:173` — `skype: str(profileData.skype),` builds the merge-field value passed into the rendered Application Form PDF.
  4. `src/lib/documents/templates/fields.ts:135` — `{ key: "skype", label: "Skype", sample: "" },` — the merge-field entry that makes `{{skype}}` selectable in the superadmin template editor's field picker.
- Document-template DB state (`document_templates`/`document_template_versions`, slug `application_form`, project `acopcwlhkovssjnrqygk`):
  - **v1 (status `published`, the one actually generating live PDFs today) does NOT contain the Skype field at all** — no `SKYPE` label, no `{{skype}}` token. Live borrower-facing PDFs today are unaffected either way.
  - **v2 (status `draft`, not yet published)** contains: `<td>SKYPE</td><td>{{skype}}</td>` in the contact-info table row (next to Mobile/Tel. Nos.).
- Live data: `borrowers.profile_data->'contact'->>'skype'` — **0 of 17 borrowers** have a non-empty value. No backfill/data-loss risk.
- Unrelated "Skype" mentions found and confirmed **out of scope** — do not touch:
  - `src/components/cig/CiReferencesFormModal.tsx:627`, `src/app/committee/applications/[id]/page.tsx:782`, `loanstar/docs/cig-references-form-plan.md`, `loanstar/docs/cig-forms-recreation.html` — these are the "Facebook/Skype/Viber" **character-reference social-contact field** on the CIG CI Report, a completely different form (reference's own social handle, not the borrower's contact info). The revision item is about "the application form," not CIG references — leave these alone.

## Scope decision

Rename the field end-to-end from `skype` → `teams` (not just a label swap), since:
- It's cleaner than leaving an internal field named `skype` holding "Teams" data (would confuse future maintainers and the superadmin template editor's merge-field list).
- No live data exists to migrate/lose.
- Only one template version (the unpublished draft) references it, so there's no published-PDF backward-compatibility concern.

## Files to change

1. **`src/components/borrowers/ApplicantProfileFields.tsx`** (~line 374-379)
   - `id="skype"` → `id="teams"`
   - `label="Skype"` → `label="Teams"`
   - `value={contact.skype ?? ""}` → `value={contact.teams ?? ""}`
   - `onChange={(v) => setProfileData({ skype: v })}` → `onChange={(v) => setProfileData({ teams: v })}`

2. **`src/lib/borrowers/types.ts`** (line 88)
   - `skype?: string;` → `teams?: string;`

3. **`src/lib/documents/generators/application-form-context.ts`** (line 173)
   - `skype: str(profileData.skype),` → `teams: str(profileData.teams),`

4. **`src/lib/documents/templates/fields.ts`** (line 135)
   - `{ key: "skype", label: "Skype", sample: "" },` → `{ key: "teams", label: "Teams", sample: "" },`

5. **Database — draft template v2 only** (`document_template_versions.id = '741c13a9-7d8c-4e38-b231-51ea9c69bc48'`, slug `application_form`, status `draft`):
   - In `body`, replace the cell pair `<td>SKYPE</td><td ...>{{skype}}</td>` with `<td>TEAMS</td><td ...>{{teams}}</td>` (keep the existing `style`/attributes on the `<td>` untouched — only swap the label text and the merge token).
   - Do **not** touch the published v1 row — it has no Skype/Teams field and this phase doesn't add one to it (adding a new field to a published, already-in-use template is out of scope for a label-swap item; if the user wants Teams added to the live PDF, that's a separate decision, not implied by "replace Skype with Teams").
   - Apply via Supabase MCP / migration tooling per this project's existing convention (**not** `supabase db push`) — see `loanstar/docs/document-template-system-plan.md` for the established pattern. If a raw SQL `UPDATE` on `document_template_versions.body` is used instead of a migration file, confirm the "template versions are immutable once published" trigger does **not** block editing a `draft`-status row (it shouldn't — only publish should lock it) before running it.

## Explicitly out of scope for this phase

- The CIG "Facebook/Skype/Viber" reference-contact field (different form, different purpose).
- Publishing the `application_form` draft v2 template — that's a separate, deliberate content-review action, not implied by this rename.
- Any other file matching "skype" case-insensitively that isn't listed above (`loanstar/docs/*.md`, `.html` recreations) — those are historical/reference docs, not live code or live template content.

## Validation checklist (for Claude to check against Cursor's summary)

- [ ] Exactly the 4 code files + 1 DB row changed — nothing else.
- [ ] No occurrence of `skype`/`Skype`/`SKYPE` remains in the 4 listed code files or in template version `741c13a9-7d8c-4e38-b231-51ea9c69bc48`.
- [ ] Published template v1 (`6bc30ddc-6e31-4dc9-a7bf-633e0a482427`) untouched.
- [ ] `CiReferencesFormModal.tsx`, committee page, and doc/html files untouched.
- [ ] Field still renders/saves correctly for a borrower profile edit (manual or existing test coverage for `ApplicantProfileFields`).
- [ ] No new borrower-facing route, table, or column was added — this is a rename only.

## Status: DONE (validated 2026-08-10)

Implemented by Cursor, validated by Claude directly against live code + the actual Supabase DB (not just the summary claim):
- No `skype` remains anywhere in `src/` except the two out-of-scope CIG reference-form spots — confirmed.
- Migration `20260810120000_replace_skype_with_teams_application_form_draft.sql` present in both `supabase/migrations/` and `loanstar/supabase/migrations/`.
- DB: draft v2 has Teams (`{{teams}}`), no Skype; published v1 untouched (no Skype, no Teams).
- 544/544 unit tests passing per Cursor's report.
