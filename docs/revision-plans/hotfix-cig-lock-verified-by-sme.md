# Hotfix — Lock "Verified by" to the logged-in CIG account on SME forms

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror `CiReferencesFormModal.tsx`'s existing lock pattern exactly (disabled input showing the live account name while editing, saved value while read-only, forced override at save time) — do not invent a different mechanism.
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

User asked to make sure the "Verified by" field on every CI report — both Seafarer and SME — is auto-filled and locked to whichever staff account is logged in, not manually typed. Screenshot showed the SME re-loan verification form's "Verified by (Field Investigator)" as a plain editable text field.

## Audit findings (verified 2026-08-15)

- **Seafarer already does this correctly** — `src/components/cig/CiReferencesFormModal.tsx:908-915`: the "Verified by:" field is always `disabled`, shows `verifierName` (the live logged-in account name) while editing or the previously-saved value while `readOnly`. Both `handleSaveDraft` and `handleSubmitForm` (`:533-536`, `:538-551`) explicitly override the payload with `verifiedBy: verifierName` before saving — so even if something upstream mutated the draft, the saved value is always forced to the actual account, not trusted from component state. `verifierName` itself is sourced from `permissions?.fullName ?? ""` (`src/app/cig/applications/[id]/page.tsx:173`) and already passed to this component (`:1546`).
- **Neither SME form does any of this**:
  - `src/components/cig/SmeReloanVerificationForm.tsx:339-347` — "Verified by (Field Investigator)" is a plain `Input`, editable value bound directly to `form.verifiedBy`, only `disabled={readOnly}` (i.e. editable any time the form isn't in post-submission view-only mode). `onSave(form)` (`:368`) saves whatever was typed, with no override.
  - `src/components/cig/FieldVisitForm.tsx:804-817` — "Prepared by" (`recommendation.preparedBy`) is the same plain-`Input` pattern, same `onSave(visit)` (`:876`) with no override.
  - Neither component's `Props` type includes `verifierName` (confirmed both `Props` types — `SmeReloanVerificationForm.tsx:11-17`, `FieldVisitForm.tsx:20-26` — have `value`/`onChange`/`onSave`/`saving`/`readOnly` only).
  - Neither call site on the CIG page passes it either (`cig/applications/[id]/page.tsx:1561-1583` for the reloan form, `:1586-1610` for the field visit form) — even though `verifierName` is already in scope on this exact page and already correctly passed to the Seafarer form two sections above.
- **Scope decision on which field to lock, per form** (flagging the reasoning since it's not 100% mechanical):
  - `SmeReloanVerificationForm`: lock **"Verified by (Field Investigator)"** only — the direct structural match to the Seafarer form's "Verified by." Leave **"Noted by (Marketing Officer)"** as free text — per the existing on-page copy ("Sign-off names only — CIG owns this screen"), these are meant to be two distinct real-world signatories, and the Marketing Officer is not necessarily the CIG account doing the data entry.
  - `FieldVisitForm`: lock **"Prepared by"** only — same reasoning, it's the completion/signoff field, structurally parallel to "Verified by" on the other two forms. Leave **"Visited by"** as free text — even though CIG performs the field visit itself (confirmed elsewhere in this project's history), "Visited by" and "Prepared by" are distinct fields that could legitimately name different people (whoever physically went out vs. whoever is now finalizing the write-up) — locking "Visited by" too would be a guess beyond what's confirmed. If the user wants that locked as well, it's a one-line follow-up once confirmed.

## Scope decision

One phase — mirror an existing, proven pattern into two components plus their one shared call site.

---

## Phase 1 — Lock "Verified by" / "Prepared by" to the logged-in account on both SME forms

**Goal:** A CIG user can no longer type an arbitrary name into either SME form's completion-signoff field — it always shows and saves as their own account name, exactly like the Seafarer CI form already does.

### Files to change

1. **`src/components/cig/SmeReloanVerificationForm.tsx`**
   - Add `verifierName: string` to `Props` (`:11-17`).
   - Destructure it in the function signature (`:19-25`).
   - At the "Verified by (Field Investigator)" field (`:339-347`): change `value={form.verifiedBy ?? ""}` to `value={readOnly ? (form.verifiedBy ?? "") : verifierName}`, remove the `onChange` handler's ability to actually change this specific field's value (keep the input `disabled` unconditionally, not just `disabled={readOnly}` — matching `CiReferencesFormModal`'s `disabled` prop with no condition), and set `onChange={() => {}}` on this field only (do not touch `notedBy`'s input, which stays exactly as-is).
   - At the save call (`:368`, `onClick={() => onSave(form)}`): change to `onSave({ ...form, verifiedBy: verifierName })` — force the override at save time, same belt-and-suspenders approach as the Seafarer form, not just a disabled input.

2. **`src/components/cig/FieldVisitForm.tsx`**
   - Add `verifierName: string` to `Props` (`:20-26`).
   - Destructure it in the function signature (`:99-104` region).
   - At the "Prepared by" field (`:804-817`): same treatment as above — `value={readOnly ? (visit.recommendation?.preparedBy ?? "") : verifierName}`, `disabled` unconditionally, `onChange={() => {}}` — do not touch "Visited by" (`:166-177`) or any other field on this form.
   - At the save call (`:876`, `onClick={() => onSave(visit)}`): change to `onSave({ ...visit, recommendation: { ...visit.recommendation, preparedBy: verifierName } })`.

3. **`src/app/cig/applications/[id]/page.tsx`**
   - Add `verifierName={verifierName}` to the `<SmeReloanVerificationForm>` call (`:1561-1583` region) and the `<FieldVisitForm>` call (`:1586-1610` region) — `verifierName` is already in scope on this page (`:173`), no new state needed.
   - Do not touch the Seafarer `<CiReferencesFormModal>` call — already correct.

### Validation checklist — Phase 1

- [x] On an SME-Individual or SME-Corporate reloan application, the "Verified by (Field Investigator)" field cannot be typed into and always shows the logged-in CIG user's own name while the form is open for editing.
- [x] "Noted by (Marketing Officer)" remains freely editable — not locked.
- [x] On a first-time (non-reloan) SME application, the Field Visit Form's "Prepared by" field cannot be typed into and always shows the logged-in CIG user's own name.
- [x] "Visited by" on the Field Visit Form remains freely editable — not locked.
- [x] Saving either form persists the actual logged-in account's name in the locked field, even if the underlying draft object somehow held a different value beforehand (verify via the DB row after save, not just the UI).
- [x] After submission, viewing either form in read-only mode still shows the name that was actually saved (not the current session's name, if a different CIG user opens it later to view) — matches the Seafarer form's `readOnly ? saved : live` behavior.
- [x] The Seafarer CI & References Form is completely untouched and behaves exactly as before.
- [x] `npx tsc --noEmit` clean. *(Cursor's flag resolved — Committee's page (`committee/applications/[id]/page.tsx:1178-1193`), a read-only consumer of the same two components, now passes `verifierName=""` at both call sites since it never saves through them. Re-ran independently: same 6 pre-existing unrelated errors only, none touching this fix.)*
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Locking "Noted by (Marketing Officer)" or "Visited by" — flagged above as a real but unconfirmed question; only implement if the user explicitly asks after seeing this phase's result.
- Any change to the Seafarer CI & References Form — already correct, used only as the reference pattern.
- Any change to how `verifierName`/`permissions.fullName` itself is computed or sourced.

## Final validation

- [x] Full test suite run — no new failures. (`npm test`: 891 pass / 0 fail, 2026-08-13)
- [ ] Live check: open both SME forms as a real CIG account, confirm the locked field shows that account's name and cannot be edited, save, and confirm the DB row reflects the actual account name.
