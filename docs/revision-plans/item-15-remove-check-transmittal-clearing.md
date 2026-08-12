# Item 15 — Remove "Check Transmittal & Clearing" tracking (step-by-step)

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules and overall status.

**Tracker item:** *Remove the "Check Transmittal & Clearing" tracking feature entirely.*

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. **After all phases are implemented, produce one final combined summary report covering every phase.**

**Ground rules (apply to every phase in this file):**
- Touch only the files listed for that phase. Flag anything else you notice rather than editing it.
- Do not rename/refactor/clean up adjacent code you encounter while editing a listed file.
- Run existing tests after each phase; don't delete or weaken a test to make it pass.
- Output a summary at the end of each phase: files changed, tests run/result, anything deliberately left alone.

## Scope decision (read before starting)

This feature is **exactly 2 files, 3 DB columns, and nothing else** — confirmed by grepping the entire codebase for `transmittal`/`clearing` (case-insensitive) and for the 3 column names directly; no other page, route, or test references any of it.

**DB columns get dropped too, in Phase 3 — user explicitly confirmed 2026-08-11 after being shown the data-loss risk.** `check_transmittal_status`, `check_clearing_status`, `clearing_started_at` (all on `masterlist`, added in `20260707000000_p7_ar_collection.sql` and `20260711000000_ar_flow_alignment.sql`) will be dropped entirely once Phases 1-2 (app code) are validated. **Known data loss, confirmed acceptable by the user:** live check at plan time showed 1 of 3 `masterlist` rows has non-default values in these columns (a non-`pending` transmittal status, a non-`pending` clearing status, and a `clearing_started_at` timestamp) — that row's values are permanently destroyed by Phase 3. Do not re-litigate this decision; it was made with the data-loss risk explicitly disclosed.

---

## Phase 1 — Frontend: remove the card and its logic

### Audit findings (evidence, verified 2026-08-11)

`src/app/ar/masterlist/[id]/page.tsx` — everything to remove:

- State: `transmittal`/`setTransmittal` (line 138), `clearing`/`setClearing` (line 139).
- In `load()`: the two `setTransmittal(...)`/`setClearing(...)` calls seeded from `recData.record.check_transmittal_status`/`check_clearing_status` (lines 162-167).
- The `saveCheckStatuses()` function in full (lines 218-239) — POSTs `checkTransmittalStatus`/`checkClearingStatus` to the PATCH route.
- Derived values: `clearingStartedAt` (line 365), `clearingDay` (lines 366-375), `clearingOverdue` (line 376) — all pure display/derivation logic, nothing else depends on them once the card is gone (confirmed: `clearingOverdue` is used only at line 382 (`nextActions`) and lines 668/681 (the card's own JSX) — both being removed in this phase).
- Two `nextActions` entries: the `clearingOverdue` one (lines 382-384) and the combined transmittal/clearing "pending" one (lines 390-395).
- The entire "Check transmittal & clearing" `<Card>` (lines 643-714) — heading, badges, the overdue warning banner, both `<Select>` controls, and the "Save check statuses" button.

### Files to change

**`src/app/ar/masterlist/[id]/page.tsx`** — remove exactly the pieces listed above. After removal, double-check no unused imports remain (`Badge`/`Select`/`Label` are used elsewhere on this page for other cards — confirm each is still referenced before removing any import; do not remove an import still used by unrelated code on the same page).

### Explicitly out of scope for this phase

- Any other card on this page (assignment, remedial turnover, paid-off, accounting checklist, schedule table, payments).
- `src/app/api/ar/masterlist/[id]/route.ts` — Phase 2, separate step.
- `isHighAging`/aging-related `nextActions` entry — unrelated feature, do not touch.
- `SHOW_ACCOUNTING_CHECKLIST` flag/block — unrelated, already gated off, leave as-is.

### Validation checklist

- [ ] No occurrence of `transmittal`/`clearing` (case-insensitive) remains anywhere in this file except in unrelated identifiers if any exist (there should be none — confirm with a fresh grep after the edit).
- [ ] Both remaining `nextActions` entries (collector assignment, aging threshold) still present and unchanged.
- [ ] No unused imports left behind (`Badge`, `Select`, `Label` etc. — verify each is still used by a remaining card before assuming safe to remove, and only remove ones that are genuinely orphaned).
- [ ] Page still compiles/type-checks; other cards on the page render unaffected.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 2 — Backend: remove API acceptance of the fields

Send after Phase 1 has landed and been validated.

### Audit findings

`src/app/api/ar/masterlist/[id]/route.ts`:
- `assignSchema`'s `checkTransmittalStatus`/`checkClearingStatus` fields (lines 20-23).
- The entire `if (body.checkTransmittalStatus || body.checkClearingStatus) { ... }` block in `PATCH` (lines 95-132) — includes the 3-day clearing-window stamping logic (`clearingStartedAt` local variable, the extra `SELECT` to read current status before deciding whether to stamp/clear the timestamp) and the conditional `UPDATE` fields.
- Nothing else in this file references these fields — `GET`, the paid-off/remedial `POST` branch, and `assignMasterlist`/`assignRemedial`/`markPaidOff` (imported from `@/lib/ar/masterlist`) are all unrelated and untouched.

### Files to change

**`src/app/api/ar/masterlist/[id]/route.ts`**
1. Remove `checkTransmittalStatus`/`checkClearingStatus` from `assignSchema`.
2. Remove the entire `if (body.checkTransmittalStatus || body.checkClearingStatus) { ... }` block from `PATCH` (lines 95-132) — the `PATCH` handler's remaining logic (the `portfolioId`/`collectorUserId` branch via `assignMasterlist`, and the audit-event write) stays exactly as-is.

### Explicitly out of scope for this phase

- `GET` handler — untouched, still returns the raw `masterlist` row including the 3 now-orphaned columns (harmless — nothing reads them anymore after Phase 1, and leaving `GET`'s `select("*")` alone is simpler and safer than trying to exclude specific columns).
- `src/lib/ar/masterlist.ts` (`assignMasterlist`, `assignRemedial`, `markPaidOff`) — none of these reference the 3 columns per the audit; confirm and leave untouched.
- DB columns/migration — per the scope decision above, not dropped in this plan.

### Validation checklist

- [ ] `assignSchema` no longer has `checkTransmittalStatus`/`checkClearingStatus`.
- [ ] The removed `PATCH` block's logic (clearing-window stamping) is gone entirely, not just commented out.
- [ ] A PATCH request that used to send `checkTransmittalStatus`/`checkClearingStatus` now either 400s (extra/unrecognized field, depending on zod's default strictness for this schema) or is silently ignored — confirm which, and that neither case throws an unhandled 500.
- [ ] `GET`, `assignMasterlist`/`assignRemedial`/`markPaidOff` paths unchanged.
- [ ] No DB migration in this phase.

### Status: Ready for Cursor (not yet implemented) — send after Phase 1 lands

---

## Phase 3 — Migration: drop the 3 DB columns

Send after Phase 2 has landed and been validated (app code must no longer reference these columns before dropping them).

### Audit findings

- Both columns' original definitions, `supabase/migrations/20260707000000_p7_ar_collection.sql:40-43`:
  ```sql
  check_transmittal_status text NOT NULL DEFAULT 'pending'
    CHECK (check_transmittal_status IN ('pending', 'transmitted', 'received')),
  check_clearing_status text NOT NULL DEFAULT 'pending'
    CHECK (check_clearing_status IN ('pending', 'clearing', 'cleared')),
  ```
  `clearing_started_at` was added later in `20260711000000_ar_flow_alignment.sql`. Both `CHECK` constraints are inline (unnamed, tied to the column) — `DROP COLUMN` removes them automatically, no separate `DROP CONSTRAINT` needed.
- **Confirmed live data loss, explicitly accepted by the user 2026-08-11**: at plan time, 1 of 3 `masterlist` rows had non-default values in all 3 columns. This migration permanently destroys that row's transmittal/clearing/timestamp data. This was disclosed and confirmed acceptable before writing this phase — do not re-confirm or second-guess this at implementation time.
- No other table has a foreign key or generated column referencing these 3 columns (they're plain `text`/`timestamptz` columns on `masterlist`, not referenced elsewhere in the schema).

### Change to make

```sql
ALTER TABLE masterlist
  DROP COLUMN check_transmittal_status,
  DROP COLUMN check_clearing_status,
  DROP COLUMN clearing_started_at;
```

Apply via Supabase MCP, written to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` — not `supabase db push`.

### Explicitly out of scope for this phase

- Any other `masterlist` column.
- Any other table.
- Phases 1-2's app code — already correct, not touched here (this phase only runs cleanly if Phases 1-2 already landed, since the app must not be reading/writing these columns anymore).

### Validation checklist

- [ ] All 3 columns confirmed absent from `masterlist` after the migration (`information_schema.columns` check).
- [ ] No other column/table touched.
- [ ] Migration file present in both migration folders.
- [ ] App still functions normally post-drop (Phases 1-2 already removed all references, so this should be a non-event functionally) — spot-check the AR masterlist detail page loads without error for a few accounts, including the one that had non-default values.

### Status: Ready for Cursor (not yet implemented) — send after Phase 2 lands

---

## Overall item status: Not Started — Phase 1 next
