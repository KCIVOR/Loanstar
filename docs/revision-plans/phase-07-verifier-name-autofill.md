# Item 7 — Verifying staff member's name auto-filled, not editable (step-by-step)

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules and overall status.

**Tracker item:** *The name of the staff member who verifies a borrower's references should be filled in automatically, based on who is logged in — it should not be editable to show a different name.*

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. **After both phases are implemented, produce one final combined summary report covering both phases** (all files changed, tests run, anything deliberately left alone) — this is in addition to each phase's own summary.

**Ground rules (apply to every phase in this file):**
- Touch only the files listed for that phase's "Files to change." If you notice something related but unlisted, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Run existing tests after each phase; don't delete or weaken a test to make it pass.
- Output a summary at the end of each phase: files changed, tests run/result, anything deliberately left alone.

---

## Phase 1 — Frontend: auto-fill and lock the "Verified by" field

### Audit findings (evidence, verified 2026-08-10)

- The field in question is the **"Verified by:"** text input on the **CI & References Form** — the seafarer phone-verification form CIG fills out for the PIC/character references. `src/components/cig/CiReferencesFormModal.tsx:900`:
  ```tsx
  <Field label="Verified by:" value={draft.verifiedBy ?? ""} onChange={(v) => setDraft((d) => ({ ...d, verifiedBy: v }))} />
  ```
  It's a plain free-text input today — any staff member can type any name.
- This maps to `VerificationRecord.cifVerifiedBy` (`src/lib/cig/verification.ts:150`, DB column `cif_verified_date`/`cif_verified_by`) — it's specifically the "who verified this reference check" field, matching the tracker item exactly.
- The form is wrapped in `<fieldset disabled={readOnly}>` (`CiReferencesFormModal.tsx:581-583`) — once a CI report is submitted, the whole form (including this field) is already correctly locked and shows the historically-saved value (`draft.verifiedBy`, initialized from `saved.cifVerifiedBy` in `buildInitialDraft`, line 151). **The gap only exists while the form is still editable** (before submission) — that's the only state where the name is currently user-typed instead of auto-filled.
- The current logged-in user's display name is already available app-wide via the existing `usePermissions()` hook (`src/hooks/usePermissions.tsx`) → `permissions.fullName` (`SelfPermissions.fullName`, `src/lib/permissions/types.ts:36`, resolved server-side from `profiles.full_name` → auth metadata → email). This exact pattern is already used for the header's display name (`src/components/admin/Header.tsx:197`, `permissions?.fullName`). **No new name-resolution logic needs to be built on the frontend** — reuse this hook.
- `src/app/cig/applications/[id]/page.tsx` does not currently import or use `usePermissions()` — needs to be added.
- The local `Field` helper inside `CiReferencesFormModal.tsx` (lines 164-188) does not currently support a `disabled` prop — needs a small addition (it's a local helper private to this file, not the shared `@/components/ui` `Field`/`Input`, so this is safe and self-contained).
- Scoped narrowly to this one field: `SmeReloanVerificationForm.tsx:340-345` has a similarly-named "Verified by (Field Investigator)" field, but that's a **different form** for a **different concept** (the SME site-visit Field Investigator's identity, which — per prior confirmed scope, see `loanstar/docs/sme-segment-implementation-plan.md` — is a captured name field, not a system role, and isn't necessarily the person operating the CIG account). The tracker item says "the staff member who verifies a borrower's **references**," which is specifically the seafarer CI & References form. Leave the SME field untouched.

### Files to change

1. **`src/components/cig/CiReferencesFormModal.tsx`**
   - Add a `verifierName: string` prop to the component's props type and destructured parameters (alongside `readOnly`).
   - Add an optional `disabled?: boolean` prop to the local `Field` helper (lines 164-188), passed through to the underlying `<Input disabled={disabled} ... />`.
   - Replace the "Verified by:" field at line 900:
     ```tsx
     <Field
       label="Verified by:"
       value={readOnly ? (draft.verifiedBy ?? "") : verifierName}
       onChange={() => {}}
       disabled
     />
     ```
     (Historical/locked view still shows the actual saved verifier; while editing, it always shows the current session's name and cannot be typed into.)
   - In `handleSaveDraft` and `handleSubmitForm` (lines 523-542), when calling `onSave(draft)`, pass `onSave({ ...draft, verifiedBy: verifierName })` instead of the raw `draft` — this guarantees the value actually persisted is the current user's name, not whatever was last in state (belt-and-suspenders with Phase 2's server-side enforcement).
   - Leave the "Date :" field (line 901, `verifiedDate`) untouched — the tracker item is about the staff *name* only, not the date.

2. **`src/app/cig/applications/[id]/page.tsx`**
   - Import and call `usePermissions()` (same pattern as `Header.tsx:197`), read `permissions?.fullName ?? ""`.
   - Pass it into the `<CiReferencesFormModal ... verifierName={...} />` invocation at line 1525.

### Explicitly out of scope for this phase

- `src/components/cig/SmeReloanVerificationForm.tsx` — different form (SME Field Investigator identity), not the seafarer references check named in the tracker item.
- The "Date :" field next to "Verified by:" — untouched.
- The shared `@/components/ui` `Field`/`Input` components — only the local `Field` helper inside `CiReferencesFormModal.tsx` is touched.
- `src/lib/cig/verification.ts`, `src/lib/cig/forward.ts` (server logic) — Phase 2, separate step.
- Any other CIG form/field.

### Validation checklist

- [ ] "Verified by:" field is disabled (not typeable) while the CI form is open and editable.
- [ ] While editing, it displays the current logged-in user's `fullName`.
- [ ] While viewing a submitted (read-only) report, it still displays the historically-saved verifier name, not the current viewer's name.
- [ ] Saving (draft or submit) sends the current user's `fullName` as `cifVerifiedBy`, regardless of what was previously in state.
- [ ] "Date :" field unchanged — still a normal editable date input.
- [ ] `SmeReloanVerificationForm.tsx` untouched.
- [ ] Only the 2 files above changed.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 2 — Backend: server-side enforcement

### Audit findings (evidence, verified 2026-08-10)

- Phase 1 fixes the UI, but the PATCH route that persists the verification (`src/app/api/cig/applications/[id]/route.ts`) currently **trusts whatever `cifVerifiedBy` string the client sends** — `patchSchema` (line 177) just validates it's a nullable string, with no check that it matches the requesting user. A direct API call (bypassing the UI) could still write an arbitrary name. Since the tracker item says the name "should not be editable to show a different name" — a real guarantee, not just a UI affordance — this needs server-side enforcement too.
- The exact server-side name-resolution pattern already exists and is proven: `src/app/api/permissions/me/route.ts:19-29`:
  ```ts
  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();
  const fullName = resolveDisplayName(profile?.full_name, user.user_metadata?.full_name, user.email);
  ```
  using the small pure helper `resolveDisplayName` (`src/lib/account/display-name.ts`) — reuse both, don't reimplement.
- The PATCH handler already has the authenticated `user` from `requireModulePermission("verification", "edit")` (`route.ts:272`) and calls `saveVerificationPatch(supabase, id, body.verification)` (line 335) with the raw client-supplied patch object.

### Files to change

1. **`src/app/api/cig/applications/[id]/route.ts`**
   - Add imports: `resolveDisplayName` from `@/lib/account/display-name`.
   - In the `PATCH` handler, inside the `if (body.verification)` block (around line 322), **before** calling `saveVerificationPatch`: if `body.verification.cifVerifiedBy !== undefined`, resolve the current user's display name the same way `/api/permissions/me` does (fetch `profiles.full_name` for `user.id`, fall back to `user.user_metadata?.full_name`, then `user.email`) and overwrite `body.verification.cifVerifiedBy` with that resolved value before it's passed to `saveVerificationPatch`. Do not change behavior when `cifVerifiedBy` is `undefined` (not part of this particular patch).
   - Do not touch `cifVerifiedDate` — leave it exactly as the client sends it.
   - Do not touch any other field in `patchSchema` or the rest of the `PATCH` handler.

### Explicitly out of scope for this phase

- `src/lib/cig/forward.ts` (`saveVerificationPatch`, `patchToRow`) — keep generic/dumb; the override happens in the route, one layer up, where the authenticated `user` is available.
- `src/lib/cig/verification.ts` — completeness logic unrelated to this fix, untouched.
- Any other route or module.
- The GET handler in the same file — untouched, it only reads existing data.

### Validation checklist

- [ ] A PATCH request to `/api/cig/applications/[id]` with `verification.cifVerifiedBy` set to an arbitrary string results in the **actual authenticated user's** resolved name being stored, not the arbitrary string.
- [ ] A PATCH request that omits `cifVerifiedBy` entirely doesn't add or change it (no unintended side effect on patches that don't touch this field).
- [ ] `cifVerifiedDate` behavior unchanged — still whatever the client sends.
- [ ] `saveVerificationPatch`/`patchToRow` in `forward.ts` unchanged.
- [ ] Only `src/app/api/cig/applications/[id]/route.ts` changed in this phase.

### Status: Ready for Cursor (not yet implemented) — send after Phase 1 lands and is validated

---

## Overall item status: DONE (validated 2026-08-10)

Both phases implemented by Cursor and validated by Claude directly against live code:
- Phase 1: `verifierName` prop, disabled `Field`, correct `readOnly`-branching display, save/submit override — all confirmed in `CiReferencesFormModal.tsx`; `usePermissions()` wiring confirmed in `page.tsx`.
- Phase 2: `resolveDisplayName` import and server-side override confirmed in `route.ts`, gated correctly on `cifVerifiedBy !== undefined`, `cifVerifiedDate` and rest of handler untouched.
- Cursor reported 54/54 tests passing across both phases.

Net effect confirmed: the UI can no longer type a different verifier name, and the API can no longer persist a spoofed one either — both the client and server paths now derive the name from the authenticated session.

**2026-08-11 correction:** this validation missed a second consumer of `CiReferencesFormModal` — the committee page (`src/app/committee/applications/[id]/page.tsx:970-978`) also renders this modal (read-only) and was never updated to pass the new required `verifierName` prop, a real compile-time gap. Surfaced during Item 8 Phase 5 validation and fixed via `revision-plans/hotfix-committee-ci-modal-verifiername.md`. Lesson: when a shared component gets a new required prop, grep for *every* usage of that component, not just the one page the triggering item is about.
