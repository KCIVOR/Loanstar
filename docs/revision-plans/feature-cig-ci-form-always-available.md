# CIG — make the CI & References Form (and SME Field Visit) always available

**Requested change (Option B):** the CI & References Form must be visible **and fillable/savable**
at any point in CIG verification, even before the external checks are complete.
The final "Submit CI report to Committee" gate stays exactly as-is — a file still
cannot leave CIG until every check is recorded, the CI content is complete, and a
finding is set.

Status: **IMPLEMENTED 2026-09-02** — Phases 1–4 done. Files changed:
`src/lib/cig/sequence.ts`, `src/lib/cig/workspace.ts`,
`src/lib/cig/__tests__/sequence.test.mts`, `src/app/cig/applications/[id]/page.tsx`.
Verified: 1526/1526 unit tests green; live PATCH of `picVerification` with checks
incomplete returns 200 (was 400); Submit gate still blocks on the same
completeness list.

**Follow-up (same session):** the **Crewing manager** AND **Finding** sections got
the identical treatment. `unlocked.crewing_manager` and `unlocked.finding` are now
always `true`; the `finding` and `crewing_manager` rows are gone from
`assertVerificationPatchAllowed` (only `borrower_review` remains, and it is always
unlocked, so that assert is now effectively a passthrough kept as a structural
hook); the `saveSequenceStage` guards for both are removed; all four "Next: …
unlocks when …" hint cards (CI, crewing, finding ×2) are deleted; `cigNextStep`
copy for the `external_checks` / `ci_references` / `crewing_manager` branches is
reworded.

**Net effect:** after borrower review + external checks (still the one hard S1→S2
gate), every remaining verification section — CI & References Form / SME Field
Visit, Crewing manager, Finding — is freely fillable in any order. **Submit (S6)
is the sole completeness gate** and is byte-for-byte unchanged:
`assessVerificationCompleteness` still requires all checks recorded + full CI
content + full crewing content + finding.

Verified: 1526/1526 unit tests green (`assertVerificationPatchAllowed` now allows
`picVerification` / `cmPosition` / `finding` patches at S1); lint clean on the
touched lib files; live PATCH of each field on `for_verification` returns 200;
`unlocked.forward` / `completeness.complete` still driven only by real content.

---

## Part 1 — Audit (verified against code + live DB, 2026-09-02)

### 1.1 How the CI form is gated today

CIG runs a "hard sequence" (`docs/superpowers/plans/2026-07-24-cig-hard-sequence.md`):

| Stage | Slug | Unlocks when |
|---|---|---|
| S1 | `borrower_review` | always |
| S2 | `external_checks` | S1 complete |
| **S3** | **`ci_references`** | **S1 complete AND all mapped CIG checks recorded (`checksComplete`)** |
| S4 | `crewing_manager` | S3 **content** complete (`isCiReferencesComplete`) |
| S5 | `finding` | S4 complete |
| S6 | `forward` (Submit) | S5 complete |

`ci_references` is the shared slot for **three** form variants:
- Seafarer / Individual → **CI & References Form** (`CiReferencesFormModal`)
- SME (new) → **SME Field Visit** (`FieldVisitForm`)
- SME (re-loan) → **SME re-loan verification** (`SmeReloanVerificationForm`)
- Plus, riding the same `ciUnlocked` flag: **CM Inspection** / **REM Inspection**
  (collateral loans only).

### 1.2 Every place the S3 lock is enforced

**Backend**

| # | File | Location | What it does |
|---|---|---|---|
| B1 | `src/lib/cig/sequence.ts` | `getCigSequenceState`, `unlocked.ci_references = s2` (`s2 = s1 && checksComplete`) | source of truth for the lock |
| B2 | `src/lib/cig/sequence.ts` | `assertVerificationPatchAllowed`, `{ stage: "ci_references", keys: CI_REFERENCES_KEYS }` entry | throws `CigSequenceError` (HTTP 400) if any CI field is written while `unlocked.ci_references` is false |
| B3 | `src/app/api/cig/applications/[id]/route.ts` | PATCH handler, `assertVerificationPatchAllowed(body.verification, sequence)` (~line 473) | calls B2 on every verification PATCH |

`CI_REFERENCES_KEYS` (B2) covers: `picAllotmentAwareness`, `picPaymentReliability`,
`picInterviewNotes`, `characterReferencesNotes`, `charRefOtherLenders`,
`picVerification`, `referenceVerifications`, `verificationChecklist`,
`picPaymentPreference`, `picDemeanor`, `picRating`, `picRatingReason`,
`cifVerifiedBy`, `cifVerifiedDate`, `fieldVisit`, `smeReloanVerification`.

**Frontend — `src/app/cig/applications/[id]/page.tsx`**

| # | Location | What it does |
|---|---|---|
| F1 | `const ciUnlocked = !editable \|\| sequence.unlocked.ci_references;` (~line 745) | drives every card below |
| F2 | non-SME "Next: CI & References Form unlocks when all external checks are recorded" hint card (~1659) | shown while `checksUnlocked && !ciUnlocked` |
| F3 | non-SME `{ciUnlocked ? <Card> CI & References Form … </Card> : null}` (~1668) | hides the card + its "Open CI & References Form" button |
| F4 | SME "Next: Field Visit unlocks when all external checks are recorded" hint card (~1582) | same, SME |
| F5 | SME `{ciUnlocked ? <Card> SME Field Visit / re-loan … </Card> : null}` (~1591) | hides the SME card + open button |
| F6 | `saveCiForm` — `if (!sequence.unlocked.ci_references) { setError(cigSequenceLockedHint("ci_references")); return; }` (~529) | blocks the seafarer/individual modal save client-side |
| F7 | SME `SmeReloanVerificationForm` `onSave` — same guard inline (~2108) | blocks SME re-loan save client-side |
| F8 | SME `FieldVisitForm` `onSave` — same guard inline (~2134) | blocks SME field-visit save client-side |
| F9 | `{ciUnlocked && collateralType === "car_refinancing" ? <CM Inspection card>` (~1944) and `… real_estate … <REM Inspection card>` (~1981) | collateral inspection cards ride `ciUnlocked` |
| F10 | modal render `{showCiForm && segment !== "sme" ? <CiReferencesFormModal … /> : null}` (~2074) | **not** sequence-gated itself — only reachable via the F3 button, so F3 is the real gate |

**Guidance copy (cosmetic)**

| # | File | Location |
|---|---|---|
| G1 | `src/lib/cig/workspace.ts` | `cigNextStep`, `current === "external_checks"` branch: "…CI & References unlocks when all checks are recorded." |
| G2 | `src/lib/cig/workspace.ts` | `cigSequenceLockedHint("ci_references")` → "Locked until External checks is complete." (used by F6–F8) |

**Component internals** — `CiReferencesFormModal.tsx`, `FieldVisitForm.tsx`,
`SmeReloanVerificationForm.tsx` have **no** sequence logic of their own; they only
honour a `readOnly` prop (which is `!editable`, i.e. already-submitted). Nothing to
change inside them.

**Tests referencing the S3 lock**

| # | File | Assertion |
|---|---|---|
| T1 | `src/lib/cig/__tests__/sequence.test.mts:231` | `getCigSequenceState(s1Complete(), false).unlocked.ci_references === false` |
| T2 | `src/lib/cig/__tests__/sequence.test.mts:342-354` | "rejects CI form fields while S2 incomplete" — expects `assertVerificationPatchAllowed({ picVerification, picRating }, state)` to throw |
| T3 | `src/lib/cig/__tests__/sequence.test.mts:379-413` | "sequence ↔ submit completeness parity" — must still pass unchanged (this is the safety net) |
| T4 | `src/lib/cig/__tests__/field-visit.test.mts:184-211` | checks `completed.*` only — unaffected if we touch `unlocked` only |

### 1.3 What already protects the file if S3 is opened early

The Submit path is **independent** of `unlocked.ci_references`:

- `src/lib/cig/forward.ts` `forwardToCommittee` → `assessVerificationCompleteness(...)`
  still requires: borrower review done **+ every mapped check recorded** **+ full CI
  content (PIC, ≥1 complete ref, 4-item checklist, PIC rating) / SME Field Visit
  content + collateral inspection if applicable + finding**.
- `src/app/cig/applications/[id]/page.tsx` `forwardReady` and the "Not ready yet —
  the following must be completed first:" list are driven by that same
  `completeness.missing`, not by the sequence.

So "always show + always save" cannot let an incomplete file reach Committee. It
only removes the *ordering* constraint on when CI data may be entered.

### 1.4 Live DB / RLS

- No schema, column, RLS, function, or migration is involved. `checks_recorded`,
  `verifications`, `stage_check_mapping` policies are unaffected (verified
  `pg_policies` 2026-09-02).
- `verifications` write RLS already allows CI columns to be written for any
  `for_verification` app by a `verification:edit` user — the sequence assert is the
  *only* thing stopping early writes.

### 1.5 Side effects to keep in mind (and constrain against)

1. **`sequence.current` pointer.** `getCigSequenceState` computes `current` as the
   first non-`completed` stage. `completed.ci_references` (=`s3`) still needs
   `checksComplete`, so if we only flip `unlocked.ci_references` and leave
   `completed`/`s3` alone, `current` still points at `external_checks` until checks
   are done — the amber guidance banner and the `Stepper` keep nudging toward
   checks, while the CI card is *also* available. This is the desired behaviour;
   **do not** also change `completed`/`s3`.
2. **S4 crewing.** `unlocked.crewing_manager = s3` (content + checks). Leaving it
   means a user can fully fill CI but crewing still won't open until checks are
   recorded. That is acceptable and in-scope-limited; **do not** loosen S4.
3. **Individual/SME auto-complete of the crewing slot** (`s4 = s3` for those
   segments) is downstream of `s3`, which we are not changing. No effect.
4. **`assertChecksRecordingAllowed`** (S1→S2 gate on recording checks) is a
   different function and stays. Borrower review is still required before checks.

---

## Part 2 — Decisions (assumed defaults; change here if wrong before Phase 1)

| # | Decision | Default taken by this plan |
|---|---|---|
| D1 | How early is "always"? | **Fully always** — `unlocked.ci_references = true` unconditionally, even before borrower review. Simplest, matches "always show". |
| D2 | Include the SME Field Visit / SME re-loan variants? | **Yes** — they occupy the same slot and are "the CI form" for SME. |
| D3 | Include CM / REM collateral inspection cards (they ride `ciUnlocked`)? | **Yes, unlock together** — avoids a new special-case flag. |
| D4 | Keep S4 (crewing) and S5 (finding) hard gates? | **Yes, unchanged.** |
| D5 | Keep S1→S2 (checks need borrower review)? | **Yes, unchanged.** |

---

## Part 3 — Phased implementation plan

### Global constraints (apply to every phase)

- **Touch only the files named in that phase.** If you find another gate not in the
  audit above, stop and flag it — do not fix it inline.
- **Do not touch** `forward.ts`, `assessVerificationCompleteness`,
  `getCigChecksComplete`, the `forwardReady` / "Not ready yet" logic in
  `page.tsx`, or the `CI report` submit card. The Submit completeness gate must
  behave byte-for-byte identically before and after.
- **Do not touch** `assertChecksRecordingAllowed`, the `external_checks`,
  `crewing_manager`, or `finding` entries in `assertVerificationPatchAllowed`, or
  the `completed` map / `s1`–`s5` predicates in `getCigSequenceState`. Only
  `unlocked.ci_references` changes.
- **Do not** rename, reorder, or refactor adjacent code in `page.tsx` (2.4k lines)
  — make the minimum edit at each F-point.
- **No** DB / RLS / migration changes. No changes to `verification.ts` predicates.
- **No** changes to `CiReferencesFormModal.tsx`, `FieldVisitForm.tsx`,
  `SmeReloanVerificationForm.tsx`, `CmInspectionForm.tsx`, `RemInspectionForm.tsx`.
- After each phase run: `node --test` for `src/lib/cig/__tests__/*.mts` and the CIG
  route tests. Do not weaken a test to make it pass — update expectations only
  where the audit's T1/T2 explicitly call for it.
- Preserve the `!editable` (already-submitted) read-only behaviour everywhere.

---

### Phase 1 — Backend: stop rejecting early CI writes

**Files:** `src/lib/cig/sequence.ts` only.

1. In `getCigSequenceState`, change the `unlocked` map so `ci_references` is always
   open:
   ```ts
   const unlocked: Record<CigSequenceStage, boolean> = {
     borrower_review: true,
     external_checks: s1,
     ci_references: true,            // was: s2  — Option B: always available
     crewing_manager: s3,
     finding: s4,
     forward: s5,
   };
   ```
   Leave `completed`, `current`, and `s1`–`s5` exactly as they are.
2. In `assertVerificationPatchAllowed`, remove the `ci_references` row from the
   `checks` array (keep `borrower_review`, `crewing_manager`, `finding`). Leave
   `CI_REFERENCES_KEYS` defined (still imported elsewhere / harmless) or delete it
   only if `tsc`/lint flags it as unused — do not remove any other constant.

**Why first:** with the server no longer 400-ing, the client guards become the only
thing to relax, and can be done independently without a half-broken state.

**Constraints:** do not touch `assertChecksRecordingAllowed`. Do not change the
`CigSequenceError` class or messages. Do not alter the `forward` unlock.

**Tests (same phase):**
- `sequence.test.mts` T1 (line ~231): change expectation to
  `state.unlocked.ci_references === true`. Keep the `external_checks === true`
  assertion in that same case.
- `sequence.test.mts` T2 (the "rejects CI form fields while S2 incomplete" `it`):
  invert it to assert `assertVerificationPatchAllowed({ picVerification, picRating }, state)`
  **does not throw** at S1/S2, and rename the `it` accordingly. Keep the sibling
  "rejects finding patch at S1" and "rejects crewing manager patch at S1" tests
  untouched.
- T3 parity block and all of `field-visit.test.mts` must pass **unchanged**.

**Acceptance:** `PATCH /api/cig/applications/[id]` with a `picVerification` /
`fieldVisit` / `smeReloanVerification` body on a `for_verification` app whose checks
are incomplete returns 200 and persists, with no `CigSequenceError`.

---

### Phase 2 — Frontend: always render the CI card + allow save

**File:** `src/app/cig/applications/[id]/page.tsx` only.

1. **F1:** `ciUnlocked` will now be `true` whenever `sequence.unlocked.ci_references`
   is true (always) — no code change needed to the line itself, but confirm it
   still reads `!editable || sequence.unlocked.ci_references` so submitted files
   stay view-only.
2. **F6:** delete the `if (!sequence.unlocked.ci_references) { … return; }` guard at
   the top of `saveCiForm` (now dead / wrong). Leave the rest of `saveCiForm`.
3. **F7, F8:** delete the identical inline guard in the `SmeReloanVerificationForm`
   `onSave` and `FieldVisitForm` `onSave` props. Leave the `setVerification(...)` +
   `saveVerification(...)` calls.
4. **F2, F4:** remove the two "Next: … unlocks when all external checks are
   recorded" hint cards (they can never render now — `!ciUnlocked` is always
   false). Delete the whole `{editable && checksUnlocked && !ciUnlocked ? (…) : null}`
   block in both the SME and non-SME branches. Do not touch the other "Next:" hint
   cards (crewing, finding).
5. **F3, F5, F9:** no change — `{ciUnlocked ? <Card/> : null}` now always renders,
   which is the goal. Confirm by reading, don't edit.

**Constraints:** do not reorder the cards; the CI card should still appear in the
DOM after the External-checks card. Do not touch the `CI report` submit card, the
`forwardReady` banner, the callback card, or the collateral modals' internals. Do
not change `checksUnlocked`, `crewingUnlocked`, `findingUnlocked`.

**Tests:** none at unit level for this file; covered by Phase 4 manual E2E.

**Acceptance:** on a fresh seafarer in CIG with borrower review done and 0 checks
recorded, the "CI & References Form" card is visible, "Open CI & References Form"
works, and Save persists (toast "Verification saved", data survives reload).

---

### Phase 3 — Guidance copy honesty

**File:** `src/lib/cig/workspace.ts` only.

1. **G1:** in `cigNextStep`, `current === "external_checks"` branch — reword body so
   it no longer claims CI is *locked*, e.g.:
   `"Pass or fail each third-party check. The CI & References Form is already
   available; all checks must still be recorded before you can submit."`
   Keep the `title` ("Record external checks").
2. **G2:** `cigSequenceLockedHint` — the `ci_references` arm is now unused by F6–F8
   (deleted in Phase 2). Leave the function; do not delete other arms. Optionally
   drop the `ci_references` case only if lint flags the map key — otherwise leave.

**Constraints:** copy-only. Do not change `cigChecksSummary`, `cigForwardReady`,
`buildCigWorkspaceSteps`, or any other export. `workspace.test.mts` must pass
unchanged (it asserts structure/among-stages, not this exact string — verify).

---

### Phase 4 — Verification (no product code)

**Files:** none (test + manual).

1. `node --test` across `src/lib/cig/__tests__/*.mts`, `src/lib/**/__tests__` for
   any CIG route test, and the full suite — all green.
2. Live E2E on a seafarer app (`for_verification`), checks **incomplete**:
   - [ ] CI & References card visible from the start of verification.
   - [ ] Open form, fill PIC + refs + checklist + rating, Save → 200, persists on reload.
   - [ ] "Submit CI report to Committee" is **still disabled**, and the "Not ready
         yet" list still names the unrecorded check(s) and any finding gap.
   - [ ] Record the last check + set a positive finding → Submit enables and works.
3. Live E2E on an SME app: same, against "SME Field Visit".
4. Regression: an app that had CI data entered early still reverts / behaves
   normally through Committee (spot-check `assessVerificationCompleteness` output
   is unchanged for a fully-complete file).
5. Confirm a submitted (`!editable`) file shows the CI form **read-only** as before.

---

## Part 4 — Rollback

Single-commit revert is safe: Phase 1 is 2 small edits in one pure module, Phases
2–3 are deletions of guard blocks / copy. No data written by this change needs
undoing (early-saved CI content is valid content and is still gated at Submit).
