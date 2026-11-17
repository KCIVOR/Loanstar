# Fix plan — Let staff set the loan release date in the calculator (record a loan with its actual release date)

**Concern:** #1 in `docs/client-concerns-checklist.md`. Audited 2026-11-16 against the code and the client's Excel calculator (`SF Calculator.xlsm`).
**Mode:** Bolt-style single-issue fix. Plan only; nothing in this file has been implemented.

## Decisions (confirmed by the user, 2026-11-16)

1. The new **Release date** field applies to **all loan types**, not only Daily Interest.
2. It is **prefilled with today** and **editable**.
3. **No limits** on the date: past, today and future are all allowed.
4. **Option A:** the date is set in the calculator **before Compute**, like the Excel. Changing it later means computing again, which creates a new computation that is signed again (staff can still use "Proceed without borrower's sign").
5. When LRA marks the loan released, the system **keeps the date staff set** and no longer overwrites it with the click date.
6. **LRA access to the calculator is a separate task** and is not part of this plan.

## Rules (apply to every phase)

- Fix only this one issue. Do not broad-refactor.
- Verify before changing. Re-read each file below at the stated lines before editing; if the code differs from this plan, stop and report.
- Touch only the files listed under "Files to change." If a related spot is not listed, stop and flag it. Do not edit it.
- Use the current schema only. This fix needs **no database change and no migration**. `computations.release_date` already exists. If a phase seems to need a migration, stop and report.
- Do not add new database calls.
- Preserve existing behavior outside the exact issue:
  - Daily Interest loans keep their current rules (release date required, must be before the payment date).
  - Computations that already exist are not changed or recalculated.
  - The first-payment formulas themselves are not changed. They only receive the date staff chose.
  - Reports, the AR masterlist and the dashboard keep reading the same `release_date` columns.
- Do not rename, clean up, or reformat adjacent code.
- Run the existing tests after each phase. Never delete or weaken a test to make it pass. A test may be updated only where this plan names it.
- Execute phases in order. Each phase must leave the app green before the next starts.
- Be concise. No new abstractions.
- At the end, output one summary: files changed, tests run and result, and what was verified in the browser.

## We will fix only one exact issue

**Issue:** Staff cannot choose the loan's release date. For every loan type except Daily Interest, the date is taken from the day CSA clicks Compute, so a loan released by hand on a different day gets the wrong first payment date, schedule and printed dates.

**Who is affected:** CSA (and Committee, who use the same calculator). LRA and AR are affected downstream, because their schedule and documents come from this date.

**What I see (verified in the code and the Excel):**
- The calculator sends no release date for non-Daily loans. The server uses **today** (`src/lib/csa/computation.ts:470`) and builds the first payment date from it (`computeFirstPaymentDate`, `computeSmeFirstPaymentDate`, `computeSalaryFirstPaymentDate` in `src/lib/computation/release-date.ts`). It is saved as `computations.release_date` (`computation.ts:659`).
- Only **Daily Interest** shows a Release date field (`ComputationPanel.tsx:1745`, shown only when the schedule type is daily).
- When LRA records the release, the system overwrites `computations.release_date` with the click date for every loan type except Daily (`src/lib/lra/release-service.ts:1583-1600`).
- The real AR schedule is built later from that overwritten date (`initializeArAccount`, `src/lib/ar/masterlist.ts:192` and following), while the PDC check schedule is built earlier from the original date (`buildExpectedPdcSchedule`, `release-service.ts:279`). The two can disagree.
- The Excel calculator has a hand-typed **"Released Date"** cell (`SEAMAN (offset)!F19`, currently 2026-07-20) and a derived **"Payment Start"** cell (`H19`, currently 2026-09-15, which matches the system's formula for 2 add-on months and due day 15).
- The prefilled default `new Date().toISOString().slice(0, 10)` is the **UTC** date, so between midnight and 8 AM in the Philippines it shows yesterday's date.

**Expected:** A "Release date" field in the calculator for every loan type, prefilled with today (local date), editable to any date. Compute uses that date for the first payment date, schedule and printed documents. The date is kept at release.

**Error message:** None. The wrong date is silent.

**Where it happens:** `ComputationPanel` (CSA and Committee), `POST /api/csa/applications/[id]/computation`, `POST /api/committee/applications/[id]/override`, `createComputation` in `src/lib/csa/computation.ts`, and `recordRelease` in `src/lib/lra/release-service.ts`.

## Scope

Only the release date input, how it is sent and validated, and keeping it at release. Nothing else.

## Files to change

1. `src/components/csa/ComputationPanel.tsx`: show the Release date field for every schedule type; prefill with the local date; restore a saved date for every type; send `releaseDate` for every type in the Compute request.
2. `src/app/api/csa/applications/[id]/computation/route.ts`: validate `releaseDate` as `YYYY-MM-DD` when it is provided for any schedule type (Daily rules stay as they are).
3. `src/app/api/committee/applications/[id]/override/route.ts`: the same validation for Committee's Compute. Confirm in Phase 1 how it handles `releaseDate` first.
4. `src/lib/csa/computation.ts`: read the date as a local calendar date instead of `new Date(input.releaseDate)` (line ~470), using the existing `parseLocalDate` the Daily path already uses.
5. `src/lib/lra/release-service.ts`: remove the release-time overwrite of `computations.release_date` (lines ~1583-1600) and fix its comment.
6. `src/lib/negotiation/service.ts` (added during Phase 1, approved by the user on 2026-11-16): Committee's adjust/override recompute only forwarded the release date for Daily loans and reset it to today for every other type. Forward the resolved release date for all types (one line, lines ~559-563).
7. A test file next to the existing computation tests (`src/lib/computation/__tests__/` or `src/lib/csa/__tests__/`, whichever already holds the release-date tests).

Not changed: the first-payment formulas, `schedule.ts`, `masterlist.ts`, report and dashboard queries, `document templates`, the borrower signing screen, the database, RLS, and the CSA witness-sign flow.

## Current data source used

- `computations.release_date` (date): written at Compute (`computation.ts:659`), read by the PDC schedule, the AR masterlist (`masterlist.ts:192`, copied into `masterlist.release_date`), the LRA document context, and the panel's saved-computation view (`ComputationPanel.tsx:2712`).
- Reports and the dashboard read `masterlist.release_date`, not the computation. They will simply show the staff-entered date.
- Request field: `releaseDate` (optional string) already exists in both route schemas.

## Root cause

The date was only ever an input for Daily Interest. For every other type it is hard-coded to "today at Compute", and then overwritten again at release, so staff have no way to enter the real date and any date they wanted is lost.

## Minimum fix

1. Show the field for every loan type, prefilled with today's local date, and send it with every Compute.
2. Validate the date on the server and read it as a local calendar date.
3. Stop overwriting the saved date at release.

## Phases

### Phase 1 — Verify (read only)

- Re-read the six files at the lines above.
- Open `src/app/api/committee/applications/[id]/override/route.ts` and confirm how Committee's Compute passes `releaseDate` (line ~61) and whether it has its own Daily validation.
- Confirm the other users of `ComputationPanel` (`src/app/collector/dcr/page.tsx`, `src/app/tools/computation-breakdown/page.tsx`) either pass a mode that hides the compute form or are unaffected by a new field. If they show the compute form, stop and flag it.
- Check the preview at `ComputationPanel.tsx:1015` (`computation?.releaseDate ?? today`). Decide whether the origination-discount preview should use the typed date. If yes, include it in Phase 3; if unclear, flag it and leave it.
- Find the existing tests for the first-payment functions and the computation route, so the new tests go beside them.
- Confirm `parseLocalDate` is exported or reachable from `computation.ts` without a new import cycle.
- If anything differs from this plan, stop and report.

### Phase 2 — Server

- In both route files, when `releaseDate` is present for any schedule type, require `YYYY-MM-DD` and a real date, and return the same style of 400 error the Daily check uses. Do not change the Daily rules.
- In `computation.ts` (~line 470), replace `new Date(input.releaseDate)` with `parseLocalDate(input.releaseDate)` for the non-Daily path. The Daily path already does this.
- In `release-service.ts` (`recordRelease`), remove the `admin.from("computations").update({ release_date: ... })` block and its payment-frequency lookup, and rewrite the comment to say the staff-entered date is kept. Do not touch anything else in `recordRelease`.
- Tests:
  - the first payment date follows a past, today and future release date for the Seafarer, SME and Salary formulas (add only the cases that are missing);
  - `release-service.ts` no longer writes `release_date` (source-text check, the repo's existing style);
  - both route files validate a provided `releaseDate`.
  Do not hit the database.
- Run the computation, csa and lra test folders, then `npx tsc --noEmit -p .` (ignore the generated `.next` file and the existing errors in older test files).

### Phase 3 — Calculator field

- In `ComputationPanel.tsx`:
  - Show the Release date field for every schedule type. Keep Daily's `max` against the payment date and its required-field errors.
  - Prefill with the **local** date, not the UTC date.
  - Restore a saved computation's release date for every type (lines ~767-769), not only Daily.
  - Send `releaseDate` in the Compute body for every type (lines ~1451-1456). Keep `paymentDate` Daily-only.
  - Apply the Phase 1 decision about the preview.
- Do not change anything else in the panel.
- Run `npx eslint src/components/csa/ComputationPanel.tsx` and confirm no new problems.

### Phase 4 — Validation (browser, dev data only)

Run this checkout's server (`npm run dev` from the main folder) and use the seed accounts on the staging data.

1. **Field shows for all types:** on a new dummy application, as CSA, the Release date field appears for Seafarer, and for SME and Individual schedule types, and is prefilled with today's local date.
2. **Excel cross-check:** enter release date 2026-07-20, 2 add-on months and due day 15 for a Seafarer loan. Compute. The first payment date must be **2026-09-15**, the same as the Excel's "Payment Start".
3. **Past date:** enter a past date (for example 10 days ago) and Compute. The saved computation shows that date and a first payment date counted from it.
4. **Future date:** repeat with a date a few days ahead.
5. **Persistence:** reload the page. The saved date is still shown. Compute again with a new date and confirm a new computation replaces it and needs a new signature (witness-sign works).
6. **Committee:** as Committee, use the calculator on a file at Committee and confirm the field, the date and the validation work there too.
7. **Daily Interest:** still requires the payment date and still rejects a release date on or after it.
8. **Release step:** if a dummy file can be taken to LRA, mark it released and confirm the computation's release date is **unchanged**. If not, report it as covered by the source-text test only.
9. Take screenshots for steps 1, 2 and 5.

### Phase 5 — Report

Output the summary: files changed, test and type-check results, browser results, and anything not verified. Do not commit or push unless asked.

## Out of scope (flag, do not fix)

- **LRA access to the calculator.** Decided as a separate task. LRA can only read computations today and would need permission and database policy changes.
- **Concern #2** (paperwork dated for a future release): the same field should cover the planned date, but whether it covers everything #2 needs is not confirmed. Re-check #2 after this fix.
- **Existing computations** keep the date they were computed with. Staff recompute to change it.
- **Changing a signed computation without re-signing** (Option B) was rejected. Not built.
- **Reports** now show the entered release date instead of the LRA click date. This is expected; flag it to the client.

## Risk

Low to medium. No database change. The two points to watch are the removed overwrite (the PDC and AR schedules now use the same date, which should be an improvement, but the AR schedule is billing data) and the new field on a shared panel used by CSA and Committee. Phase 1 confirms the other pages and Phase 4 checks both roles.

## Estimate

1–1½ days, within the checklist's 1–2 days.
