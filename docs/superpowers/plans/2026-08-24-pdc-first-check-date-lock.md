# PDC First Check Date — Lock to Computed Payment Start

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The user runs **one phase at a time** and reviews before the next starts.

**Goal:** The LRA PDC-creation screen's "First check date" field is a blank, freely-typed input with no connection to the already-computed `computation.firstPaymentDate` (verified correct against the client's Excel calculator in the preceding audit). The system enforces that PDC **count** matches loan terms and PDC **amount** matches monthly amortization — but never that the PDC **dates** match the computed schedule. This plan closes that gap the same way the amount/count checks already work: auto-fill and lock the field client-side, and add a matching server-side check as the real backstop.

---

## Audit — confirmed mechanics (from the preceding audit pass, no code changed there)

1. **`computation.firstPaymentDate` is computed and stored correctly** (`src/lib/csa/computation.ts:225`, via `computeFirstPaymentDate` — already verified against the client's Excel workbook, exact match) but is **not currently returned** by the LRA application detail API (`src/app/api/lra/applications/[id]/route.ts:137-144` — the `computation` object it returns has `netReleased`/`principal`/`monthlyAmortization`/`terms` only, no date).
2. **The frontend has no path to it either**: the `computation` type on the LRA page (`src/app/lra/applications/[id]/page.tsx:92-97`) doesn't declare the field, and `pdcDate` (`:193`) initializes to `""` with the *only* place it's ever set being the manual `<input type="date">`'s `onChange` (`updatePdcFirstDate`, `:352`, wired at `:1050-1051`). No effect anywhere pre-fills it.
3. **"Monthly amount" right next to it is the working pattern to copy**: that field (`:1034-1044`) reads `data.computation.monthlyAmortization` directly and is `disabled` — locked, always correct, can't drift. "First check date" should work identically.
4. **The server has no equivalent check for dates.** `savePdcChecks` (`src/lib/lra/release-service.ts:209+`) validates `checks.length === computation.terms` (`:236`) and `row.amount === computation.monthlyAmortization` (`:255`) — both hard `ValidationError`s — but does nothing with `checkDate` beyond storing it verbatim. The PDC API route's zod schema (`src/app/api/lra/applications/[id]/pdc/route.ts:17`) accepts `checkDate: z.string()` with no format or value constraint.
5. **No legitimate reason for the two to differ.** If a real release genuinely happens on a different date than planned, the computation's own `releaseDate` should be corrected (which recomputes `firstPaymentDate` consistently everywhere it's used — BLRI, the AR schedule, this PDC step). There's no valid workflow where PDC should start on a date the computation doesn't agree with.
6. **Real gap found on this validation pass — the plan's own wording was self-contradictory and would have shipped broken.** `pdcDate` is referenced in 6 places, not just the input's `value`: the declaration (`:193`), two `if (!pdcDate)` guards (`:373` in `buildPdcSchedule`, `:411` in `submitPdc`), two anchors passed into the month-math (`:385`, `:439`), and the input's `value` (`:1050`). The plan's Phase 2 wording said to auto-fill by "reading `data.computation?.firstPaymentDate` at render time for the input's value" — but only ever mentioned the input. If `pdcDate` stays a `useState` and nothing calls `setPdcDate` anymore (since `updatePdcFirstDate` is removed), the input would *display* the right date (if wired to read from `data.computation` directly) while the state variable itself stays `""` forever — meaning the two `if (!pdcDate)` guards would **always fire**, permanently blocking `buildPdcSchedule` and `submitPdc` with a "date missing" error even though the correct date is visibly on screen. This would have broken the entire PDC flow, not fixed it. Corrected below: `pdcDate` state is removed entirely, replaced by a single plain derived value used at all 5 remaining call sites (not just the input).
7. **Earlier gap found validating this plan, before writing any code**: `src/lib/lra/__tests__/release-service.test.mts`'s shared stub (`makeSavePdcStub`/`computationRow`) sets `first_payment_date: null`, and `makeCheckRow` gives every check the same literal `"2026-08-12"` regardless of index — none of the file's 7 existing tests exercise a realistic date sequence. Adding the new check as originally scoped ("add unit tests") would have broken all 7 on the very next test run, including tests about amount/count/trimming that have nothing to do with dates, because none of them supply a real `firstPaymentDate` to validate against. The fixture itself needs fixing as part of this phase, not just new tests added alongside it.
8. **Another gap found validating this plan**: `pdcScheduleDate` (the client's month-advancing function, `page.tsx:159-163`) uses `date.setMonth(date.getMonth() + index)`, which has a genuine JS quirk — confirmed by direct test: `pdcScheduleDate('2026-01-31', 1)` returns **`2026-03-03`**, not `2026-02-28`, because `setMonth` overflows past February's shorter length. If the server-side backstop (Phase 3) reimplemented "advance by N months" using more careful, clamped logic (e.g. matching `computeFirstPaymentDate`'s `Math.min(dueDay, lastDay)` approach), it would compute a *different, more "correct"* date than what the UI actually submits whenever a due day falls late in the month — causing the new check to **reject legitimate, UI-generated PDC schedules**. `release-service.ts` cannot import the client page's local function (it's a `"use client"` component; `release-service.ts` is server-only, importing `createServiceClient`, PDF rendering, storage). The month-math must be extracted into one shared, dependency-free function both sides import, so they can never disagree — not reimplemented twice.
9. **Checked, not fixed — a pre-existing timezone characteristic, not a new risk**: `new Date("YYYY-MM-DD")`-style parsing plus `.getMonth()`/`.setMonth()` is timezone-sensitive in general (a date-only string parses as UTC midnight, then local getters can roll to the previous day in timezones behind UTC). This tooling can't reliably force a genuine cross-timezone Node test to prove impact either way (Windows/git-bash here doesn't honor `TZ` reliably). This exact characteristic already exists in `computeFirstPaymentDate` today, so extracting `pdcScheduleDate`'s logic alongside it doesn't introduce a new class of risk — it inherits one that's already there. Out of scope to fix as part of this plan; worth its own audit if this project's server ever runs in a timezone behind UTC.

---

## Architecture

- **`computation.firstPaymentDate` gets threaded through to the LRA page**: added to the API response, added to the frontend type.
- **"First check date" becomes auto-filled and locked**, matching "Monthly amount" exactly — populated from `data.computation.firstPaymentDate`, `disabled`, no manual typing path. **The `pdcDate` `useState` is removed entirely**, not left in place with nothing to update it — it's replaced by a single plain derived value (e.g. `const pdcDate = data?.computation?.firstPaymentDate ?? "";`, computed fresh each render) used at every one of its current call sites: the input's `value`, both `if (!pdcDate)` guards, and both places it anchors the month-math. Keeping it as unset state while only fixing the input's display would leave the guards permanently blocking (see audit point 6).
- **If `firstPaymentDate` is missing** (a defensive edge case — old computation rows predating this field, or a not-yet-recomputed record): block PDC schedule building with a clear message pointing back to the computation, rather than falling back to a free-typed date — reopening today's exact gap would defeat the fix.
- **`pdcScheduleDate`'s month-math is extracted into `src/lib/computation/release-date.ts`** (already a pure, dependency-free module safe for both client and server import — home of `computeFirstPaymentDate`) as a new exported function, behavior byte-for-byte identical to the current client logic (including its `setMonth` overflow quirk on month-end dates — fixing that quirk is a separate, out-of-scope concern; this plan only needs the client and server to agree with each other, not to be "more correct"). The LRA page imports it in place of its local `pdcScheduleDate`; `savePdcChecks` imports the same function for its check.
- **Server-side backstop in `savePdcChecks`**: validate that the submitted checks' dates exactly match the sequence anchored at `computation.firstPaymentDate`, using the shared extracted function — a `ValidationError`, same style and severity as the existing count/amount checks. This is what actually closes the gap against any request that doesn't go through the UI, and because both sides use the same function, it can never reject a submission the UI itself would have produced.

---

## Ground Rules

- **Closed Allow lists per phase.** Anything outside → STOP and flag.
- `git diff --stat` after each phase.
- **Do not commit** unless asked.
- No database schema changes in this plan — `first_payment_date` already exists on `computations`; this only threads an already-stored value through to a screen that didn't have it, and adds a validation check. No migration confirmation gate needed.

---

## Hard Constraints

### Never Modify
- `computeFirstPaymentDate` itself, inside `src/lib/computation/release-date.ts` — already verified correct; out of scope. (This plan does *add* a new, separate exported function to this same file — see Phase 2 — but `computeFirstPaymentDate`'s own body is untouched.)
- The other two call sites of `computeFirstPaymentDate` (`src/lib/ar/schedule.ts`, `src/lib/lra/blri-data.ts`) — untouched; they already work correctly and don't need this fix.
- `savePdcChecks`'s existing count/amount checks — this plan adds one more check in the same style, doesn't restructure what's there.
- The PDC-collection/physical-check-confirmation flow (`pdc-collect`) — entirely separate feature, out of scope.

### Touch With Extreme Care
- `src/app/lra/applications/[id]/page.tsx` — a large, multi-purpose LRA workspace page; keep the diff to exactly the described field-locking change, no unrelated cleanup.
- `savePdcChecks` — real release-blocking validation logic; the new check must fail closed (reject) on a mismatch, never silently coerce the submitted dates to the correct ones (that would hide a bug in whatever produced the mismatch, the same anti-pattern avoided everywhere else this session).
- **The extracted month-advancing function** (Phase 2) — must reproduce `pdcScheduleDate`'s current behavior exactly, including the `setMonth` month-end overflow quirk (audit point 7). Do not "fix" or clamp it as part of this extraction — that changes real submitted PDC dates for late-month due days, which is a separate decision this plan doesn't make. If the quirk itself needs fixing, that's a follow-up, not folded in here.

---

## Locked Product Decisions

| # | Decision |
|---|---|
| 1 | **Single source of truth**: PDC's first check date is always `computation.firstPaymentDate` — never independently entered. |
| 2 | **Lock, don't just default**: the field is auto-filled *and* disabled, the same treatment "Monthly amount" already gets — not a pre-filled-but-editable suggestion. |
| 3 | **Missing date blocks, doesn't fall back to manual entry**: if a computation somehow has no `firstPaymentDate`, PDC building is blocked with a clear message, not silently reopened to free-typing. |
| 4 | **Server-side is the real backstop**: the UI lock prevents the mistake by construction; the server check is what guarantees correctness regardless of how the request was made. |
| 5 | **Server also refuses to save when `firstPaymentDate` is null** — same stance as the client (Decision #3), for the same reason: with no source of truth to validate against, saving anything would just reopen the exact gap this plan closes. `ValidationError` naming that the computation needs a payment start date before PDC can be saved. |

---

## Phase 1: Thread `firstPaymentDate` to the LRA Page

### Scope
Make the already-computed date available where the PDC screen can use it.

### Allow List
- `src/app/api/lra/applications/[id]/route.ts`
- `src/app/lra/applications/[id]/page.tsx` (type declaration only in this phase)

### Tasks
- [x] Add `firstPaymentDate: computation.firstPaymentDate` to the API route's returned `computation` object.
- [x] Add `firstPaymentDate: string | null` to the page's `computation` type.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] Live check: queried real active computations directly — `first_payment_date` populated (`2026-10-09`) confirming the field flows through as expected.
- [x] `git diff --stat` — only the two Allow-listed files touched.

---

## Phase 2: Lock the "First Check Date" Field

### Scope
Auto-fill and disable the field; block gracefully if the date is missing.

### Allow List
- `src/app/lra/applications/[id]/page.tsx`
- `src/lib/computation/release-date.ts` (adding one new exported function only — `computeFirstPaymentDate` itself untouched)

### Tasks
Order matters within this phase — do them in sequence:

- [x] Added `addScheduleMonths(anchorDate, index)` to `release-date.ts`, reproducing the page's `pdcScheduleDate` logic exactly (same `setMonth`-based arithmetic, same overflow behavior, unchanged).
- [x] LRA page now imports and uses `addScheduleMonths` at both former `pdcScheduleDate` call sites (`buildPdcSchedule`, `submitPdc`); the local `pdcScheduleDate` function was deleted.
- [x] Removed the `pdcDate` `useState` and `updatePdcFirstDate` entirely. Replaced with `const pdcDate = data?.computation?.firstPaymentDate ?? "";`, and updated all 6 usages consistently (input `value`, both `if (!pdcDate)` guards, both month-math anchors) — confirmed via grep after the edit that no reference to the old state or the old function name remains anywhere in the file.
- [x] "First check date" `<Input>` is now `disabled`.
- [x] Both `buildPdcSchedule`'s and `submitPdc`'s `if (!pdcDate)` guards updated to the clearer message.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in either touched file.
- [x] `npm run test` — 1345 passed (baseline at time of this phase), 0 failures.
- [x] Lint — exactly the 2 pre-existing `react-hooks/set-state-in-effect` errors confirmed before this phase, no new findings; `release-date.ts` clean.
- [x] `git diff --stat` — only `page.tsx` and `release-date.ts` touched (release-date.ts correctly in this phase's Allow List for the addition).

---

## Phase 3: Server-Side Date Backstop

### Scope
`savePdcChecks` rejects a PDC submission whose dates don't match the computed schedule.

### Allow List
- `src/lib/lra/release-service.ts`
- `src/lib/lra/__tests__/release-service.test.mts`

### Tasks
- [x] Added the null-`firstPaymentDate` guard (fires before the count check) and the per-check date-sequence check (using `addScheduleMonths`, imported — not reimplemented) to `savePdcChecks`, both `ValidationError`s matching the existing count/amount checks' style.
- [x] Fixed the shared test fixture: `first_payment_date` now defaults to a real date (`"2026-08-12"`, overridable via a new `firstPaymentDate` stub option), and `makeCheckRow`/`makeChecks` now derive each date via the real imported `addScheduleMonths` instead of a hardcoded, non-incrementing string. All 7 pre-existing tests pass unmodified with the fixed fixture.
- [x] Added 4 new tests: null `firstPaymentDate` rejected, shifted first date rejected, shifted middle date rejected, correct sequence saves with the exact expected dates asserted.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — full `savePdcChecks` suite: all 7 original tests pass unmodified, all 4 new tests pass (11/11). Full suite: 1349 passed, 0 failures.
- [x] Lint — clean on both touched files.
- [x] Live check against the real database (not just the mocked unit tests): built a real `computations` row (`firstPaymentDate: 2026-09-15`) and `release_files` row, then called the actual `savePdcChecks` via a throwaway script using the real service-role client. A wrong date sequence was rejected with `PDC #1 date must be 2026-09-15 (got 2026-10-15) — dates must follow the computed payment schedule`; the correct sequence saved successfully (`{"status":"ready_generate","checkCount":3,"terms":3}`). All test data cleaned up (0 leftover rows), scratch script deleted.
- [x] `git diff --stat` — only the two Allow-listed files touched.

---

## Phase 4: Regression Sweep

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, matches baseline exactly.
- [x] `npm run test` — full suite, 1349 passed, 0 failures.
- [x] `git diff --stat` — exactly the five files this plan touched across all phases (`route.ts`, `page.tsx`, `release-date.ts`, `release-service.ts`, `release-service.test.mts`), nothing else.
- [ ] Manual walkthrough note: attempted via the preview tooling — the dev server started, but the browser tab failed to navigate, the same failure every attempt has hit this session. **Not re-attempted further** — Phase 3's live database test already exercised the real end-to-end behavior a browser walkthrough would show (real computation, real release file, real rejection/success through the actual `savePdcChecks` function against the live database), which is stronger evidence than a click-through would add. Left open for the user to visually confirm the locked field's appearance in the browser if desired.
