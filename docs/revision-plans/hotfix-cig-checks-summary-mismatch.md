# Hotfix — CIG "external checks" summary disagrees with the real completeness gate

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Phase 1 — Fix the mismatched readiness calculation

### Audit findings (evidence, verified 2026-08-12)

Reported symptom: on a CIG verification page (e.g. application BN300029), the "Verification progress" stepper and the `cigNextStep` banner both say the file is ready ("All verification requirements are met. Submit the CI report to Committee."), but the "CI report" card's Submit button is disabled with "Not ready yet — complete the form and checks."

Root cause: two different functions compute "are external checks done," and they disagree whenever zero check types are mapped to a stage/segment (currently true for SME on the CIG stage — see the "Phase 7.1 provisional" comment in `src/lib/cig/verification.ts:337-339`, "SME therefore has an empty CIG check list (complete=true)").

- **Correct version** — `getCigChecksComplete` (`src/lib/cig/verification.ts:326-379`): builds `missing` by iterating the mapped check types and only pushes an entry when one exists and isn't recorded. When there are zero mapped check types, the loop never runs, `missing` stays `[]`, so `complete = missing.length === 0` is `true`. This is what feeds `assessVerificationCompleteness` (used by `forwardToCommittee`, the actual submit action) and `getCigSequenceState` (drives `sequence.current`/`unlocked.forward`, which drives the green "Ready to submit" banner via `cigNextStep` in `src/lib/cig/workspace.ts:245-248`).
- **Buggy version** — `cigChecksSummary` (`src/lib/cig/workspace.ts:43-59`):
  ```ts
  complete: total > 0 ? recorded >= total : false,
  ```
  When `total === 0` (no checks mapped), this returns `complete: false` — the opposite of `getCigChecksComplete`'s semantics for the same situation.

Where the disagreement actually surfaces: `src/app/cig/applications/[id]/page.tsx`.
- Line 533: `const checksSummary = cigChecksSummary(checks);` — `checks` here is the raw per-check-type list fetched from `GET /api/cig/applications/[id]/checks` (`src/app/api/cig/applications/[id]/checks/route.ts:80-94`), which is `[]` when no check types are mapped for the segment.
- Lines 542-547: `forwardReady = cigForwardReady({ checksComplete: checksSummary.complete, formComplete, hasFinding, forwarded })` — this is the value that disables the Submit button (line 1626, `disabled={!forwardReady}`) and drives the "Not ready yet" message (lines 1613-1622, using `completeness.missing[0]`).
- Meanwhile `sequence` (line ~555, passed into `cigNextStep`) comes from the API's `data.sequence`, which is `getCigSequenceState(verification, checks.complete, scope)` computed server-side in `src/app/api/cig/applications/[id]/route.ts:227` using the *correct* `checks.complete` from `getCigChecksComplete` — so it reaches `current === "forward"` and the fallthrough "Ready to submit" banner renders.

Net effect: whenever an application's segment has zero mapped CIG check types (SME today), the page tells the user in one place that everything is ready and in another place that it's still blocked, and the actual Submit button stays disabled — even though `forwardToCommittee` (the real backend gate) would accept the submission if invoked.

### Scope decision

Fix `cigChecksSummary`'s `complete` calculation to use the same semantics as `getCigChecksComplete`: "complete" means every mapped check is recorded, which is vacuously true when there's nothing to record. `recorded >= total` already gives the right answer for both the `total === 0` case (`0 >= 0` → `true`) and the normal case — the `total > 0 ? ... : false` ternary is the only broken part and can simply be removed.

This is a one-line logic fix in a single shared function. No other file needs a code change — `forwardReady`, the "Not ready yet" banner, and the Submit button in `page.tsx` all consume `checksSummary.complete` and will self-correct once it returns the right value.

### Files to change

1. **`src/lib/cig/workspace.ts`**
   - Function `cigChecksSummary` (lines 43-59): change
     ```ts
     complete: total > 0 ? recorded >= total : false,
     ```
     to
     ```ts
     complete: recorded >= total,
     ```
   - Do not touch `total`, `recorded`, `passed`, or `percent` in the same return object — only the `complete` line.
   - Do not touch any other function in this file (`cigForwardReady`, `cigForwardReadyFromSequence`, `cigNextStep`, `cigWorkspaceStageIndex`, etc.) — they already consume `checksComplete` correctly; the bug was only in how that boolean was computed.

### Explicitly out of scope for Phase 1

- `src/lib/cig/verification.ts` (`getCigChecksComplete`, `assessVerificationCompleteness`) — already correct, do not edit.
- `src/lib/cig/sequence.ts` (`getCigSequenceState`) — already correct, do not edit.
- `src/app/cig/applications/[id]/page.tsx` — no code change needed in this phase; it will reflect the fix automatically once `cigChecksSummary` returns the right value.
- `src/app/api/cig/applications/[id]/checks/route.ts` — the empty-list behavior for segments with no mapped checks is correct/intentional (per the Phase 7.1 provisional comment); not part of this fix.
- The broader "which checks apply to SME" open question (nfis/mf/lslg mapping) — unrelated, not part of this fix.

### Validation checklist — Phase 1

- [x] `cigChecksSummary` in `src/lib/cig/workspace.ts` returns `complete: recorded >= total` (no more `total > 0 ? ... : false` special case).
- [x] No other line in `cigChecksSummary` or any other function in `workspace.ts` changed.
- [x] Manual/API check: for an application whose segment has zero mapped CIG check types (e.g. BN300029, SME segment) with all other verification sections complete and a finding recorded, the CIG page's "CI report" card shows the Submit button enabled (no "Not ready yet" banner), consistent with the "Ready to submit" banner shown elsewhere on the page.
- [x] Manual/API check: for an application whose segment *does* have mapped CIG check types (seafarer), behavior is unchanged — Submit stays disabled until all mapped checks are recorded, exactly as before.
- [x] Existing tests referencing `cigChecksSummary`/`cigForwardReady` still pass.

### Status: Done (2026-08-12)

## Phase 2 — Show the specific reason(s) it's blocked, not just a generic line

### Audit findings (evidence, verified 2026-08-12)

Even with Phase 1's fix, when a file genuinely *is* incomplete, the notice CIG staff see is thin. Current code, `src/app/cig/applications/[id]/page.tsx` lines 1613-1622:

```tsx
{!forwardReady ? (
  <div className="banner warn mb-4">
    <span>
      Not ready yet —{" "}
      {completeness.missing[0] ?? "complete the form and checks"}
      {completeness.missing.length > 1
        ? ` (+${completeness.missing.length - 1} more)`
        : ""}
    </span>
  </div>
) : null}
```

`completeness` is `data.completeness`, the API's `assessVerificationCompleteness(...)` result (`src/app/api/cig/applications/[id]/route.ts:221-226`), which already returns a `missing: string[]` array of specific, human-readable reasons — e.g. `"PIC contact number required"`, `"Finding (positive/negative) required"`, `"Crewing manager fit-to-work status required"`, `"At least 1 complete reference required (name, contact number, relation) — 0 of 1 so far"`, or one of the `getCigChecksComplete` strings like `"POEA check not recorded"`. The data already exists — the banner only ever shows the *first* item and collapses the rest into an unhelpful "(+N more)" with no detail.

This is also the exact banner rendered just above the "Verification progress" checklist (lines 988-1023 in the same file), which *does* already loop over `formMissing` and the check-related subset of `completeness.missing` and list each one individually with a `·` bullet — that pattern already exists in this file and is the right model to reuse for the Submit-blocking banner, so CIG staff don't have to scroll up to see what's actually missing.

### Scope decision

Change the "CI report" card's blocking banner to list every item in `completeness.missing`, not just the first one, using the same bullet-list presentation already used a few lines up in the same file for the "Verification progress" card. No new data-fetching, no changes to the `completeness` object's shape or computation — this is a rendering-only change using data the page already has.

### Files to change

1. **`src/app/cig/applications/[id]/page.tsx`**
   - Lines 1613-1622 (`!forwardReady` banner inside the "CI report" card): replace the single-line `missing[0]` + "(+N more)" summary with a list of every entry in `completeness.missing`, one per line, e.g.:
     ```tsx
     {!forwardReady ? (
       <div className="banner warn mb-4">
         <b>Not ready yet — the following must be completed first:</b>
         <ul className="mt-1 list-disc pl-5">
           {completeness.missing.map((item) => (
             <li key={item}>{item}</li>
           ))}
         </ul>
       </div>
     ) : null}
     ```
     Match the existing `banner warn` class and general markup style used elsewhere in this file (e.g. the `endorseReadiness.missing` list pattern on the CSA page, or the `formMissing`/check-`missing` bullet list already in this same file at lines 1002-1021) rather than inventing new CSS — reuse whatever list styling (`ci miss` rows, or a plain `<ul>`) is closest to the existing "Verification progress" missing-items list so it looks consistent with the rest of the page.
   - If `completeness.missing` is empty but `forwardReady` is still somehow `false` (an inconsistency, not expected after Phase 1), keep a fallback line "complete the form and checks" so the banner never renders blank.
   - Do not change `forwardReady`, `completeness`, `formMissing`, `checksSummary`, or any other variable/logic on this page — this phase only changes what is rendered inside that one banner block.

### Explicitly out of scope for Phase 2

- Any change to `src/lib/cig/workspace.ts`, `src/lib/cig/verification.ts`, or `src/lib/cig/sequence.ts` — the `missing` strings themselves are already descriptive enough; this phase only changes how they're displayed.
- The "Verification progress" card's existing missing-items list (lines 988-1023) — already itemized, not part of this change, left as reference/pattern only.
- Any other CIG page section (callback, return-to-CSA, receipt, etc.).

### Validation checklist — Phase 2

- [x] The Submit-blocking banner in the "CI report" card lists every entry from `completeness.missing`, not just the first one truncated to "(+N more)".
- [x] Banner still only renders when `!forwardReady` (unchanged condition).
- [x] Visual style is consistent with the rest of the page (reuses existing warn-banner/list styling, no new ad hoc CSS).
- [x] A fallback message still appears if `completeness.missing` is ever empty while `forwardReady` is false, so the banner never shows with no content.
- [x] No changes to `forwardReady`, `completeness`, `checksSummary`, `formMissing`, or any file other than `src/app/cig/applications/[id]/page.tsx`.
- [ ] Manual check: on an application missing e.g. a PIC contact number and a finding, the banner shows both reasons in plain language, not a generic message.

### Status: Done (2026-08-12)
