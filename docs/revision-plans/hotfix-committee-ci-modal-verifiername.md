# Hotfix — committee page missing `verifierName` on CiReferencesFormModal

Not a numbered revision-tracker item — this is a regression fix surfaced during Item 8 Phase 5 validation (2026-08-11), caused by Item 7 (see `revision-plans/phase-07-verifier-name-autofill.md`).

## What happened

Item 7 Phase 1 added a required prop `verifierName: string` (no default) to `CiReferencesFormModal` (`src/components/cig/CiReferencesFormModal.tsx:465,486`). That phase's audit only checked the modal's usage on the CIG page (`src/app/cig/applications/[id]/page.tsx`) and updated it correctly. It missed that the **committee** page has its own separate, read-only usage of the same modal (`src/app/committee/applications/[id]/page.tsx:970-978`) that was never updated — this is a real compile-time gap, not a false alarm. Cursor correctly flagged it during Item 8 Phase 5 rather than silently fixing or ignoring it.

## Why the fix is safe and trivial

The committee page's usage always passes `readOnly` (no `readOnly={false}` branch exists there — committee only views the CI report, never edits it). Inside the modal, `verifierName` is only read when **not** `readOnly` (`value={readOnly ? (draft.verifiedBy ?? "") : verifierName}`, `CiReferencesFormModal.tsx:912`). So in this specific call site the value is never actually displayed — an empty string satisfies the type with zero behavioral risk. No need to wire up `usePermissions()` on the committee page for this.

## Change to make

**`src/app/committee/applications/[id]/page.tsx`**, in the `<CiReferencesFormModal ... />` block (around line 970-978): add `verifierName=""` alongside the existing props (`open`, `onClose`, `borrower`, `saved`, `onSave`, `saving`, `readOnly`).

## Explicitly out of scope

- No change to `CiReferencesFormModal.tsx` itself — its prop contract is correct as-is (Item 7's intent was deliberately "no silent default," to force every call site to be explicit).
- No change to the CIG page — already correct.
- Do not add `usePermissions()` to the committee page for this — unnecessary, since the value is never displayed in this read-only usage.
- Item 8's Phase 6 (test updates) — unrelated, proceed with that separately after this hotfix.

## Validation checklist

- [ ] Exactly one line added: `verifierName=""` in the committee page's `CiReferencesFormModal` usage.
- [ ] No other file touched.
- [ ] The app type-checks/builds clean with no remaining `verifierName` prop errors anywhere.
- [ ] Committee's read-only CI report view still renders and behaves identically to before (the "Verified by" field there should show the saved historical value, unaffected by this change).

## Status: DONE (validated 2026-08-11)

Implemented by Cursor, validated by Claude directly against live code: `verifierName=""` added to the committee page's read-only `CiReferencesFormModal` usage (line 978), the only change. CIG page's usage still correctly passes the real session value, `CiReferencesFormModal.tsx` itself untouched.
