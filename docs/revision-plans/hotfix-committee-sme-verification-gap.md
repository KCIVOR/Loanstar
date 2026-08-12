# Hotfix — Committee shows empty seafarer verification summary for SME loans

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration (`field_visit`/`sme_reloan_verification` columns already exist on `verifications`, populated by CIG).
- Run existing tests for the touched area after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Audit findings (evidence, verified 2026-08-12)

Reported symptom: opening `/committee/applications/[id]` for an SME loan shows the seafarer-only "Crewing manager" and "CI & References Form 1 — PIC verification" sections, both empty, instead of the SME Field Visit / SME re-loan data CIG actually recorded.

Root cause, confirmed by direct comparison with CIG's own detail page (`src/app/cig/applications/[id]/page.tsx`), which already handles this correctly:

- **API never fetches segment or SME data.** `src/app/api/committee/applications/[id]/route.ts`:
  - The `application` response object (lines 109-125) includes `isReloan` but never `segment`.
  - The `verifications` select (lines 31-45) explicitly lists columns and only lists seafarer ones (`pic_verification`, `cm_position`, `cm_departure_date`, etc.) — it never selects `field_visit` or `sme_reloan_verification`. For an SME application this data exists in the DB (written by CIG via `src/lib/cig/forward.ts`/`saveVerificationPatch`) but is never queried, so it can't reach the frontend.
  - The `verification` object returned in the JSON (lines 135-163) has no `fieldVisit`/`smeReloanVerification` fields to match.
- **Frontend has zero segment-conditional logic.** `src/app/committee/applications/[id]/page.tsx` — confirmed via full-file grep, zero occurrences of `segment`, `fieldVisit`, `smeReloan`, or `FieldVisit`. The "Crewing manager" section (lines 710-743) and "CI & References Form 1 — PIC verification" section (lines 745-965, plus its "View full CI & References Form" modal at lines 969-980 using the existing `CiReferencesFormModal`/`showCiForm` state) render unconditionally for every application, regardless of segment.
- **CIG already solved this exact problem** — reuse its pattern instead of inventing a new one: `src/app/cig/applications/[id]/page.tsx` branches on `segment === "sme"` (line 1213 and again at 1527/1540) to show `FieldVisitForm`/`SmeReloanVerificationForm` (from `src/components/cig/FieldVisitForm.tsx` / `src/components/cig/SmeReloanVerificationForm.tsx`) instead of `CiReferencesFormModal`, and suppresses the seafarer-only Crewing Manager card entirely for SME. Both form components are plain, chrome-less forms (`{ value, onChange, onSave, saving?, readOnly? }` props) — CIG wraps them itself in a `<Modal>` (`src/components/ui`) rather than the components providing their own, unlike `CiReferencesFormModal` which is self-contained with `open`/`onClose`.
- Committee is **read-only everywhere** (page header: "Submitted to Committee — view only" is CIG's own phrasing for the same state; Committee's existing `CiReferencesFormModal` usage at line 969-980 already passes `readOnly` with a no-op `onSave={async () => undefined}` and `borrower={null}`) — the SME forms should be wired the same way, no new write path.

## Scope decision

Mirror CIG's segment-branching pattern into Committee's read-only summary, using the data CIG already recorded:
1. API: add `segment` to the `application` response, and add `field_visit`/`sme_reloan_verification` to the `verifications` select and to the returned `verification` object.
2. Frontend: wrap the existing seafarer-only Crewing Manager + CI&References sections in `data.application.segment !== "sme"`, and add an SME-equivalent summary + a read-only modal (reusing `FieldVisitForm`/`SmeReloanVerificationForm` exactly as CIG does) shown when `segment === "sme"`.

No changes to CIG, no changes to how/when CIG writes `field_visit`/`sme_reloan_verification`, no new API routes, no DB migration.

## Files to change

1. **`src/app/api/committee/applications/[id]/route.ts`**
   - Line 27-29: after `getApplicationForStaff`, note `application.segment` is already present on the row returned by that helper (same helper CSA/CIG use) — no new query needed, just thread it through.
   - Line 31-45 (`verifications` select): add `field_visit, sme_reloan_verification` to the selected column list. Do not change any other selected column.
   - Line 109-125 (`application` response object): add `segment: application.segment === "sme" ? "sme" : "seafarer"` alongside the existing `isReloan: application.is_reloan`.
   - Line 135-163 (`verification` response object): add `fieldVisit: verification.field_visit` and `smeReloanVerification: verification.sme_reloan_verification` to the returned object, following the same `snake_case` → `camelCase` mapping already used for every other field in this object.
   - Do not touch `completeness`, `assessment`, `computation`, `votes`, `tally`, `latestAction`, `decisionEmail`, `negotiation`, `tatDays`, or any other part of the response.

2. **`src/app/committee/applications/[id]/page.tsx`**
   - Imports: add `Modal` to the existing `@/components/ui` import (line 6-21). Add `FieldVisitForm` from `@/components/cig/FieldVisitForm` and `SmeReloanVerificationForm` from `@/components/cig/SmeReloanVerificationForm`. Add `type { FieldVisit, SmeReloanVerification }` to the existing `@/lib/cig/verification`-adjacent type imports (they're actually exported from `@/lib/cig/field-visit`, same module `FieldVisitForm.tsx`/`SmeReloanVerificationForm.tsx` import them from — match that source).
   - `CommitteeDetail` type (lines 40-88): add `segment: "seafarer" | "sme"` to `application` (alongside `isReloan`), and add `fieldVisit: FieldVisit | null` + `smeReloanVerification: SmeReloanVerification | null` to `verification`.
   - New state: `const [showFieldVisitForm, setShowFieldVisitForm] = useState(false);` alongside the existing `showCiForm` state (line 302).
   - Lines 710-743 (Crewing manager card) and lines 745-965 (CI & References Form 1 summary + its trigger button): wrap both in `{data.application.segment !== "sme" ? (...) : ( <SME summary block> )}` — i.e. these two existing blocks become the seafarer branch of one conditional, unchanged internally.
   - New SME branch (rendered when `data.application.segment === "sme"`, inside the same `{data.verification ? (...) : null}` card that currently wraps lines 630-967): a compact read-only summary equivalent to what the seafarer branch shows — reuse `data.verification.finding`/`findingNotes`/`forwardedAt` display (already segment-agnostic, keep as-is, don't duplicate), then a summary panel for Field Visit (or SME re-loan, based on `data.application.isReloan`, same distinction CIG uses) with a "View full Field Visit Form" / "View full SME re-loan Form" button that sets `showFieldVisitForm(true)`. Keep the summary panel simple (a handful of key fields — e.g. residence/business type, recommendation, or reloan household/business totals — pulled from `data.verification.fieldVisit`/`smeReloanVerification`); the full detail is in the modal, matching how the seafarer branch already keeps its inline summary lighter than the full modal.
   - New modal block, placed alongside the existing one at lines 969-980: when `data.verification && showFieldVisitForm && data.application.segment === "sme"`, render a `<Modal open={showFieldVisitForm} onClose={() => setShowFieldVisitForm(false)} title={data.application.isReloan ? "SME re-loan verification" : "SME Field Visit"}>` wrapping either `<SmeReloanVerificationForm value={data.verification.smeReloanVerification} onChange={() => undefined} onSave={() => undefined} readOnly />` or `<FieldVisitForm value={data.verification.fieldVisit} onChange={() => undefined} onSave={() => undefined} readOnly />` depending on `data.application.isReloan` — mirroring CIG's exact `isReloan ? SmeReloanVerificationForm : FieldVisitForm` branch (`cig/applications/[id]/page.tsx:1550` onward).
   - Do not touch `completeness`, the 4 Cs assessment form, computation display, votes/decision UI, `DocumentChecklist`, or any other section of this page.

## Explicitly out of scope for this hotfix

- CIG's own verification page/forms — already correct, not touched.
- `src/lib/cig/verification.ts`, `src/lib/cig/field-visit.ts`, `src/components/cig/FieldVisitForm.tsx`, `src/components/cig/SmeReloanVerificationForm.tsx` — reused as-is, not edited.
- Any write path for `field_visit`/`sme_reloan_verification` — Committee stays strictly read-only, same as its existing CI&References modal.
- The LRA SME release-blocker bug — separate hotfix (`hotfix-lra-sme-employment-contract-segment.md`), unrelated file set.
- Any other Committee feature (assessment, voting, decision, negotiation override) — untouched.

## Validation checklist (for Claude to check against Cursor's summary)

- [x] `src/app/api/committee/applications/[id]/route.ts` returns `application.segment` and `verification.fieldVisit`/`verification.smeReloanVerification`; all other response fields unchanged (diff the rest of the file).
- [x] `src/app/committee/applications/[id]/page.tsx`: seafarer-only Crewing Manager + CI&References sections now only render when `segment !== "sme"`; content of those two blocks is otherwise byte-identical to before (moved, not rewritten).
- [x] New SME branch renders a summary + "View full ... Form" button when `segment === "sme"`, and the modal opens showing `FieldVisitForm` or `SmeReloanVerificationForm` (matching `isReloan`) in `readOnly` mode with the real DB data for a test SME application (e.g. BN300029).
- [x] For a seafarer application, page output is unchanged from before this fix (no new SME branch renders; new imports/state don't affect seafarer rendering).
- [x] No write path added — `onChange`/`onSave` on the SME forms are no-ops, matching the existing `CiReferencesFormModal` usage pattern on this page.
- [x] No changes to `completeness`, assessment, computation, votes, decision, or negotiation sections.
- [x] `npx tsc --noEmit` clean for both changed files. Existing tests unaffected (no test file currently covers this page/route — confirm none needs updating; if Cursor adds coverage, note it, but it isn't required to close this item). *(Changed files have no tsc errors; project-wide `tsc` still reports 5 pre-existing errors in unrelated files.)*
- [x] Manual/API check against a live SME application: Committee page shows real Field Visit (or SME re-loan) data instead of an empty seafarer summary. *(Verified live in browser as `committee` seed user against BN300029: CI Report card shows "View full Field Visit Form" button and inline SME Field Visit summary (date visited, visited by, client, residence type, credit realization risk, recommendation, prepared by) — no empty Crewing Manager/PIC sections. Clicked the button — modal opens showing the full read-only Field Visit form populated with the same data.)*

## Status: Done (2026-08-12)
