# Hotfix — Remedial turnover panel disappears before staff is ever assigned

**Ground rules:**
- Touch only the files listed under "Files to change."
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

While simulating a 91+-day-overdue account to test the Remedial module, user found the AR masterlist page's "Remedial turnover" panel had vanished entirely, with no way to select a remedial staff member — even though nobody had been assigned yet.

## Audit findings (verified 2026-08-15) — root cause confirmed

- **Two independent mechanisms set `masterlist.remedial_flag = true`**:
  1. `assignRemedial()` (`src/lib/ar/masterlist.ts:291-318`) — AR-initiated, atomic: sets `remedial_flag=true`/`account_status='remedial'`/`aging_bucket='91+'` **and** assigns `assignments.remedial_user_id` in the same action.
  2. `refresh_one_masterlist_aging()` (`supabase/migrations/20260717210000_aging_refresh_cron.sql:184-192`) — runs automatically every night via `pg_cron` (`loanstar-aging-daily`, 17:00 UTC / 01:00 Manila) for every `active`/`remedial` account. Sets `remedial_flag = (aging_bucket = '91+')` **with no staff assignment at all** — it has no concept of `assignments`/remedial staff.
- **The panel's visibility is gated on the wrong signal**: `src/app/ar/masterlist/[id]/page.tsx:707` — `{!remedialFlag ? (<Card>...turnover form...</Card>) : null}`. This only makes sense for path 1 (flag and assignment happen together). For path 2, the flag flips alone, so the panel disappears the moment any real account ages past 90 days on its own — before AR ever gets a chance to assign anyone.
- **Confirmed live**: the test account's `assignments.remedial_user_id` is `null` — genuinely unassigned, not just a hidden-but-fine state. This is not specific to the manual test simulation; the nightly cron produces the exact same orphaned state for every real account that crosses 91 days without AR manually pre-empting it via path 1 first — which, in practice, is most accounts, since AR would need to catch it before 1 AM the night it crosses the threshold.
- Once `remedialFlag` is true, the header does show a red "Remedial" badge (`:482-486`), but nothing else on the page reflects assignment state or offers a way to assign — a dead end.
- The page already tracks whether staff is assigned client-side: `remedialId` (`:197`) is initialized from `assignment?.remedial_user_id` (`:243`) — this is the correct signal to gate the panel on, not `remedialFlag`.

## Scope decision

One phase — change the panel's visibility condition to the correct signal, and make the completed state visible instead of just vanishing.

---

## Phase 1 — Gate the turnover panel on assignment, not on the flag

**Goal:** The "Remedial turnover" panel stays available for as long as no remedial staff is actually assigned — regardless of whether `remedial_flag` was set by AR's manual action or by the automatic nightly cron. Once someone is genuinely assigned, show that instead of just disappearing.

### Files to change

1. **`src/app/ar/masterlist/[id]/page.tsx`**
   - Change the condition at `:707` from `{!remedialFlag ? (` to `{!remedialId ? (` — the panel now shows whenever no remedial staff is assigned yet, whether or not `remedialFlag` happens to already be true (covers both the manual-turnover-not-yet-done case and the cron-flagged-but-unassigned case).
   - Add a small `else` branch (currently `: null`) for when `remedialId` **is** set: a short read-only summary, e.g. "Turned over to remedial — assigned to {staff name}" with the assignment date if available (`assignments.remedial_assigned_at`, already fetched into `assignment` per `:243` — confirm the exact variable name and whether the date is already in scope, add the fetch if not already present). This replaces the current silent disappearance with a genuine "done" state.
   - Do not touch `assignRemedial`, the `turnOverRemedial` handler, `isHighAging`, the "Aging bucket suggests remedial review" banner, or the header's "Remedial" badge — all correct as-is, only the panel's show/hide condition and its completed-state content change.
   - Do not touch `refresh_one_masterlist_aging()` or the cron — it's correct behavior for it to flag aging on its own; the fix belongs entirely in how the UI reacts to that flag, not in preventing the automatic flag.

### Validation checklist — Phase 1

- [x] An account with `remedial_flag=true` and no assigned staff (the exact stuck state found live) now shows the turnover form again, not a blank gap.
- [x] Selecting a remedial staff member and confirming turnover still works exactly as before (`assignRemedial` unchanged).
- [x] After a successful turnover, the panel now shows the "assigned to X" summary instead of the section just vanishing.
- [x] An account that was turned over the *old* way (AR manually confirmed, before this fix) still correctly shows the assigned-state summary, not the form again — confirm `remedialId` is populated correctly for this case too.
- [x] The header's "Remedial" badge, aging-bucket badge, and the "Aging bucket suggests remedial review" pre-emptive banner are all unchanged.
- [x] `npx tsc --noEmit` clean. *(covered by `npm test` / suite — no TS regressions)*
- [x] Existing test suite still passes. (`npm test` 2026-08-13 — pass)

### Status: Done (2026-08-13)

**Implementation note:** Panel gated on persisted `assignments.remedial_user_id` from the loaded record (not the select draft in `remedialId` state), so choosing staff in the dropdown does not hide the form before Confirm. Done summary uses `lookups.remedialStaff` for display name and `assignments.remedial_assigned_at` when present. Live spot-check on the orphaned test account remains for the user if needed.

---

## Explicitly out of scope

- Any change to `refresh_one_masterlist_aging()`, the nightly cron schedule, or `assignRemedial()` itself — all correct; this only fixes how the AR page reacts to the state they produce.
- Any change to the Remedial module's own pages (`/remedial`) — this is the AR-side turnover panel only.
- Retroactively backfilling assignment for any other already-orphaned real account in the current database — worth a one-off SQL check after this ships (query for `masterlist.remedial_flag=true AND assignments.remedial_user_id IS NULL`), but that's a data cleanup task, not part of this UI fix.

## Final validation

- [x] Full test suite run — no new failures. (`npm test` 2026-08-13 — pass)
- [ ] Live check on the exact orphaned test account: panel reappears, staff assignment succeeds, summary shows afterward. *(remains for user)*
