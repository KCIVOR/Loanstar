# Fix plan — CIG cannot send the application back to Committee after CSA corrections

**Concern:** #5 in `docs/client-concerns-checklist.md`. Audited and reproduced 2026-11-16 on dev application AN300024.
**Mode:** Bolt-style single-issue fix. Plan only; nothing in this file has been implemented.

## Rules (apply to every phase)

- Fix only this one issue. Do not broad-refactor.
- Verify before changing. Re-read each file below at the stated lines before editing; if the code differs from this plan, stop and report.
- Touch only the files listed under "Files to change." If a related spot is not listed, stop and flag it. Do not edit it.
- Use the current schema only. Do not guess table names, columns or policy names. This fix needs **no database change and no migration**. If a phase seems to need one, stop and report.
- Do not add new database calls beyond selecting one extra column (`endorsed_at`) in a query that already runs.
- Preserve existing behavior outside the exact issue:
  - A first-time CIG submission to Committee works exactly as today.
  - A file returned by Committee straight to CIG (#4) keeps its current flow ("Revision complete").
  - `forwarded_at` is never cleared or rewritten, so the "forwarded to Committee" history and Committee screens stay as they are.
- Do not rename, clean up, or reformat adjacent code.
- Run the existing tests after each phase. Never delete or weaken a test to make it pass. A test may be updated only where this plan names it.
- Execute phases in order. Each phase must leave the app green before the next starts.
- Be concise. One small helper, no new abstractions.
- At the end, output one summary: files changed, tests run and result, and what was verified in the browser.

## We will fix only one exact issue

**Issue:** After Committee returns an application to CSA, CSA corrects it and endorses it to CIG, CIG finds the file marked as already with Committee and has no way to send it back to Committee.

**Who is affected:** CIG staff. The client reported it. Committee is indirectly affected because the corrected file never comes back through CIG.

**What I see (verified on AN300024, Committee → CSA → CSA "Endorse to CIG" → CIG):**
- Status is For Verification and the API reports `editable = true`, so the fields and Save buttons are enabled. The page is not fully locked.
- The page shows "With Committee — Verification is complete. This file is with Committee for decision." and "Forwarded to Committee on 11/16/2026, 2:59:42 AM". The badge reads "Forwarded".
- The **"Submit CI report to Committee" button is missing entirely**. Only "Return to CSA" and the Save buttons are present.
- The cause is in the data: `verifications.forwarded_at` still holds the timestamp from CIG's **first** submission. CSA's re-endorse does not reset it (and CSA has no permission to write `verifications`).
- The open CSA-routed return notice also stays unresolved after the endorse.

**Expected:** When CSA re-endorses a file, CIG sees it as a new verification round: no "With Committee" banner, the Submit button is shown, and submitting works and sends the file to Committee (For Approval).

**Error message:** None in the UI. The server also refuses the submit with "CI report already submitted" (`forwardToCommittee`) because of the same stale timestamp.

**Where it happens:** CIG application page `/cig/applications/[id]`, and `forwardToCommittee` in `src/lib/cig/forward.ts`.

## Scope

Only how "already forwarded" is decided for a file that CSA has re-endorsed. Nothing else.

## Files to change

1. `src/lib/cig/workspace.ts`: add one small pure helper, `isVerificationForwarded(forwardedAt, endorsedAt)`.
2. `src/lib/cig/forward.ts`: use the helper in place of `if (verification.forwardedAt)` (line ~38), and select `endorsed_at` in the application query that already runs just below it.
3. `src/app/cig/applications/[id]/page.tsx`: derive `forwarded` (line ~756) and the "Forwarded to Committee" banner (line ~1256) from the helper instead of `verification.forwardedAt` alone.
4. A test file for the helper and the guard, next to the existing CIG tests (`src/lib/cig/__tests__/`).

Not changed: the CSA endorse route, `completeRevision`, the database, RLS, the Committee code, and the history and queue code that read `forwarded_at`.

## Current data source used

- `verifications.forwarded_at`: set once when CIG submits to Committee (`forwardToCommittee`), never cleared.
- `loan_applications.endorsed_at`: set to the current time every time CSA endorses to CIG (CSA endorse route). The CIG GET route already returns it as `application.endorsedAt`, and the page already stores it as `endorsedAt`.
- A first submission always has `forwarded_at` later than `endorsed_at`. After a CSA re-endorse, `endorsed_at` is later than `forwarded_at`. That ordering is the signal.

## Root cause

"Forwarded" is read as "`forwarded_at` is not null". That is true forever after the first submission, so a file that comes back to CIG for a second round still looks submitted. The page hides the Submit card (`editable && !forwarded`) and shows the "With Committee" guidance, and the server rejects the submit.

## Minimum fix

Treat a file as forwarded only if `forwarded_at` is not null **and** it is not older than the latest `endorsed_at`. Use that one rule in the page and in `forwardToCommittee`. No data is changed.

## Phases

### Phase 1 — Helper and server guard

- Re-read `src/lib/cig/workspace.ts` (around `cigForwardReady`) and `src/lib/cig/forward.ts` lines 1-45.
- In `workspace.ts`, add `isVerificationForwarded(forwardedAt: string | null | undefined, endorsedAt: string | null | undefined): boolean`:
  - no `forwardedAt` → false;
  - no `endorsedAt` → true (older rows keep today's behavior);
  - otherwise true only if `forwardedAt` is not earlier than `endorsedAt`.
- In `forward.ts`, select `endorsed_at` in the existing `loan_applications` query, move that query above the "already submitted" check if needed (same query, no extra call), and replace `if (verification.forwardedAt)` with the helper.
- Add tests: helper cases (first pass, re-endorse, missing endorsed date, missing forwarded date, equal times), plus a source-text check that `forward.ts` uses the helper (same style as the neighbouring CIG tests; do not hit the database).
- Run `node --import tsx --test "src/lib/cig/__tests__/*.mts"` and `npx tsc --noEmit -p .` (ignore the generated `.next` file and the existing errors in older test files).

### Phase 2 — Page

- Re-read `src/app/cig/applications/[id]/page.tsx` around lines 756, 866, 1256 and 2334.
- Change `const forwarded = Boolean(verification.forwardedAt)` to use the helper with `endorsedAt`. Everything that already reads `forwarded` (the badge, the "With Committee" guidance, the step list, the Submit card condition) then follows automatically.
- Change the banner condition at line ~1256 to the same derived value, so it does not show the old "Forwarded to Committee" notice on a new round.
- Do not touch `editable`, the sequence logic, or any other section.
- Run `npx eslint "src/app/cig/applications/[id]/page.tsx"` and confirm no new problems.

### Phase 3 — Validation (browser, dev data only)

Run this checkout's server (`npm run dev` from the main folder) and use the seed accounts on **AN300024**, which is currently For Verification after CSA's re-endorse (the exact failing state).

1. **Fixed state:** as CIG, the "With Committee — verification is complete" and "Forwarded to Committee" banners are gone, the badge no longer says "Forwarded", and "Submit CI report to Committee" is visible.
2. **Edit:** change a field, save, reload, and confirm it persisted.
3. **Submit:** submit the CI report. The status becomes For Approval and the file appears in the Committee queue.
4. **Committee view:** Committee sees the new "forwarded" time, not the old one.
5. **Regression, first pass:** the unit tests cover the first-submission rule. If time allows, repeat the normal CSA → CIG → Committee flow on a new dummy application and confirm the Submit button and banners behave as before.
6. **Regression, #4:** a file returned by Committee straight to CIG still shows "Revision complete" and no Submit card (covered by the helper tests; re-check in the browser if a fresh return exists).
7. Take screenshots for steps 1 and 3.

### Phase 4 — Report

Output the summary: files changed, test and type-check results, browser results, and anything not verified. Do not commit or push unless asked.

## Out of scope (flag, do not fix)

- **Routing decision.** CSA's "Revision complete" sends the file straight back to Committee and skips CIG. Whether every CSA return should go through CIG again is a business decision for the client. This plan only makes the existing "Endorse to CIG" path work.
- **Stale CSA notice.** After CSA endorses to CIG, the CSA-routed return notice stays unresolved. It has no visible effect today. Resolving it on endorse would touch the CSA endorse route and is a separate change.
- **Votes after a return** are not cleared, as noted for #3.
- **Clearing `forwarded_at`.** CSA cannot write `verifications`, and other screens use the field as history, so this plan reads it differently instead of rewriting it.

## Risk

Low. Three source files change and no data or permission changes. The main risk is changing the first-pass behavior, which the helper keeps by treating a later `forwarded_at` as forwarded, and which Phase 3 step 5 re-checks. A second risk is an old row with no `endorsed_at`, which the helper treats as forwarded, exactly as today.

## Estimate

½–1 day, below the checklist's 1–2 days, because the cause turned out to be narrow and needs no migration. The routing decision above is not included.
