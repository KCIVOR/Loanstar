# Fix plan — Committee cannot return an application (Notice to Revisit) before voting is complete

**Concern:** #3 in `docs/client-concerns-checklist.md`. Assessed and reproduced 2026-11-16 on dev application AN300023.
**Mode:** Bolt-style single-issue fix. Plan only; nothing in this file has been implemented.

## Rules (apply to every phase)

- Fix only this one issue. Do not broad-refactor.
- Verify before changing. Re-read each file below at the stated lines before editing; if the code differs from this plan, stop and report.
- Touch only the files listed under "Files to change." If a related spot is not listed, stop and flag it. Do not edit it.
- Use the current schema only. Do not guess table names, columns, or RLS. Do not add new database calls or migrations unless a phase says so (none is expected).
- Preserve existing behavior outside the exact issue: Approve, Deny, Hold and Clear Hold must still require the full vote.
- Do not rename, clean up, or reformat adjacent code.
- Run the existing tests after each phase. Never delete or weaken a test to make it pass. A test may be updated only where this plan names it, and only to match the intended new behavior.
- Execute phases in order. Each phase must leave the app green before the next starts.
- Be concise. No new abstractions.
- At the end, output one summary: files changed, tests run and result, and what was verified in the browser.

## We will fix only one exact issue

**Issue:** Committee cannot send an application back to CSA or CIG ("Notice to Revisit") until every committee member has voted.

**Who is affected:** Committee members. The client reported it. CSA and CIG are indirectly affected, because files with problems stay with Committee.

**What I see (verified):**
- With 0 of 1 votes cast, the Committee page shows only **Vote Approve** and **Vote Deny**. There is no Notice to Revisit form.
- The form lives inside the "Final action" card. That card only shows when `canDecide` is true, and `canDecide` requires `votes.length >= committeeSize`.
- The server also blocks it: `executeFinalAction` calls `assertAllVotesCast` for every action except `clear_hold`.
- The page even tells staff "Something missing or suspicious? Use Notice to Revisit below instead of deciding on an incomplete file", but the form is hidden until all votes are in.

**Expected:** A Committee member can send a pending application (status `for_approval` or `committee_hold`) back to CSA or CIG with a required comment, without waiting for votes. Approve, Deny and Hold still wait for all votes.

**Error message:** None in the UI. The server error for a direct call is "All N committee votes must be cast before a final action".

**Where it happens:** Committee application page `/committee/applications/[id]`, and `POST /api/committee/applications/[id]/action` with `action: "revisit"`.

## Scope

Only the revisit action's vote requirement and where its form is shown. Nothing else.

## Files to change

1. `src/lib/committee/actions.ts`: skip the all-votes check for `revisit` (around line 206-212).
2. `src/lib/committee/__tests__/clear-hold-route.test.mts`: this test regex-matches the exact guard `if (action !== "clear_hold") { assertAllVotesCast(`. Update it to match the new guard (Phase 1).
3. `src/app/api/committee/applications/[id]/route.ts`: add a `canRevisit` flag to the response next to `canDecide` (around line 375).
4. `src/app/committee/applications/[id]/page.tsx`: add `canRevisit` to the data type (around line 106), and render the Notice to Revisit form in its own card shown when `canRevisit` is true (currently nested in the `canDecide` card, around lines 2726-2790). Update the hint text near line 1071 only if it is no longer accurate.

Not changed: `src/lib/committee/votes.ts` (`assertAllVotesCast` stays as is), the vote route, the schema, RLS, and the approve/deny/hold code.

## Current data source used

- Application status: `loan_applications.status`, already read by the Committee API route.
- Votes: `committee_votes`, read by `getCommitteeVotes`. The committee size comes from `getCommitteeSize(segment)`.
- Revisit writes (unchanged): a `committee_actions` row, a `revisit_notices` row, a status change to `for_revision`, then a notification to CSA or CIG.
- RLS (confirmed): `committee_actions_insert` only requires the `committee` module `execute_trigger` permission. It does not check votes, so no migration is needed.

## Root cause

The "all votes cast" rule was applied to every final action, and the revisit form was built inside the `canDecide` card. Both treat a return as a final decision, but a return decides nothing. It sends the file back.

## Minimum fix

1. Server: apply `assertAllVotesCast` to approve, deny and hold only. `revisit` and `clear_hold` skip it.
2. API: return `canRevisit = status in (for_approval, committee_hold)`.
3. Page: show the Notice to Revisit form whenever `canRevisit` is true, in its own card, and remove it from the `canDecide` card so it is not shown twice.

## Phases

### Phase 1 — Server gate (`actions.ts` + its test)

- Re-read `src/lib/committee/actions.ts` around lines 157-215 and confirm the guard is `if (action !== "clear_hold") { assertAllVotesCast(votes, committeeSize); }`.
- Change the guard so it also skips `revisit`. Keep the existing comment style and extend it with one line explaining that a revisit returns the file rather than deciding it, so it must work before votes are in.
- Keep `computeVoteTally` and the `votes_snapshot` insert as they are. A revisit with partial votes records the partial snapshot, which is accurate.
- Update `clear-hold-route.test.mts` so the regex matches the new guard, and keep its intent: `clear_hold` skips the vote check.
- Add tests in `final-action-vote-gate.test.mts` (or the nearest existing file) that:
  - `revisit` does not require all votes cast;
  - `approve`, `deny` and `hold` still do.
  Use the same source-text or pure-function style the neighbouring tests already use. Do not mock the database.
- Run `node --import tsx --test "src/lib/committee/__tests__/*.mts"`. Everything must pass.

### Phase 2 — API flag (`route.ts`)

- Re-read `src/app/api/committee/applications/[id]/route.ts` around lines 340-385.
- Add `canRevisit: application.status === "for_approval" || application.status === "committee_hold"` next to `canDecide`. Do not change `canDecide`, `votesNeeded` or `committeeSize`.
- No new queries.
- Run `npx tsc --noEmit -p .` and confirm there are no new errors in `src/`. (The generated `.next/dev/types/validator.ts` error is not ours.)

### Phase 3 — Page (`page.tsx`)

- Re-read `src/app/committee/applications/[id]/page.tsx` around lines 100-110, 2557-2800 and 1065-1075.
- Add `canRevisit: boolean` to the application type.
- Move the Notice to Revisit `<form>` and its `ConfirmDialog` out of the `canDecide` card into a card of its own, shown when `data.application.canRevisit` is true. Keep the markup, labels, ids (`revisitRoute`, `revisitComment`), required comment, and confirm flow exactly as they are.
- Do not touch `handleAction`. It already sends `action: "revisit"` with `revisitRoute` and `comment`.
- Do not change the Approve, Deny, Hold or Approve-without-sign buttons, or the "Waiting for votes" card.
- Leave the hint at line 1071 as is; it becomes accurate once the form is reachable.
- Run `npx eslint "src/app/committee/applications/[id]/page.tsx"` and confirm no new problems.

### Phase 4 — Validation (browser, dev data only)

Use ego-browser with the Committee quick login on dev application AN300023, which is currently at `for_approval` with 0 of 1 votes.

1. **Before any vote:** the Notice to Revisit card is visible. Approve, Deny and Hold are not (the "Waiting for votes" card remains).
2. **Revisit with no comment:** the Send button is disabled.
3. **Send a revisit to CSA** with a comment and confirm. The status becomes For Revision, and the CSA side shows the revisit notice and comment.
4. **Repeat** on a second dev application routed to CIG, to confirm both routes.
5. **Regression:** after all votes are cast, Approve, Deny and Hold still appear and work. Casting a final action with votes missing is still rejected by the server (the existing test covers this).
6. **Committee hold:** on a held file, the revisit form is still reachable.
7. Take screenshots for steps 1 and 3.

### Phase 5 — Report

Output the summary: files changed, test and type-check results, browser results, and anything not verified.

## Out of scope (flag, do not fix)

- **Votes are not cleared after a revisit.** Existing behavior. When the file comes back to Committee, earlier votes are still there. Raise with the client whether they should reset.
- **Early return is a business decision.** The client asked "can an application be returned before voting"; this plan assumes yes. Confirm with the client before shipping.
- **Committee account sees the Intake menu.** Belongs to concern #6.
- Duplicate IDs and autofill attributes on the application form belong to concern #8.

## Risk

Low. Three source files change, plus one existing test. No schema, RLS or migration change. The main risk is accidentally weakening the vote gate for other actions, which the Phase 1 tests cover.

## Estimate

½–1 day, matching the checklist.
