# AR — `/ar/dcr` (DCR reconciliation)

## Status

**All phases implemented, awaiting human validation.**

Phase 0 audit complete, 2026-08-12. **No defect** — `reconcileAndPostDcr` (`src/lib/ar/posting.ts:202+`) is correctly guarded: checks `dcr.status === 'submitted'` before proceeding (throws otherwise, so double-posting is blocked), hard-blocks a mismatched deposit amount against the DCR total, and skips already-`posted` payments per line item. This is the same "deposit-amount hard block" already known-good from AR's original build. **Pure UI redesign, judgment-adjusted for this page's actual shape**: rows here are rich cards (embedded line-item table + a reconciliation form per DCR), not simple browsable rows — `ViewModeToggle` doesn't fit the way it does elsewhere in this batch, explicitly skipped with reasoning below rather than forced in.

**Phase 1 complete, 2026-08-12** — chrome-only rewrite of `/ar/dcr`: always-mounted shell (PageHeader + 3 existing icon KPIs from the full unfiltered `queue` + toolbar + pagination), waiting-bucket Filters, Sort Select (Oldest first default / Newest first), skeleton card placeholders, two-tier empty. Helpers in `src/lib/ar/dcr-list.ts` (local copy of waiting-bucket math, no CIG/Collector import). Reconcile form/`load({ silent: true })`/`reconcileAndPostDcr` untouched. No `ViewModeToggle`.

**Phase 2 complete, 2026-08-12** — `src/lib/ar/__tests__/dcr-list.test.mts` mirrors `briefings.test.mts` (page-size clamp, daysWaiting, waiting buckets, sort, search). No KPI helper test — KPIs stay inline on the full queue.

## Phase 0 audit findings

- **Page**: `src/app/ar/dcr/page.tsx` (525 lines). Client component, single bulk `fetch("/api/ar/dcr")` on mount, full-page `<Spinner/>` (`page.tsx:214`). **Already has KPI cards** (Pending DCRs / Line items / Total to post, `page.tsx:271-290`, icon-based — keep, standing rule against restyling) and client-side search (DCR id / borrower / account / payment ref, `page.tsx:230-241`). No sort control, no Filters panel, no pagination, no skeleton.
- **Backend**: `GET /api/ar/dcr` (`src/app/api/ar/dcr/route.ts:5-40`) — `requireModulePermission("accounting_ar", "view")`, queries `dcr` (`*, dcr_items(*, payments(*, masterlist(...)))`) `.eq("status", "submitted")`, ordered `submitted_at asc`. **Org-wide, not per-officer** (no `collector_user_id` filter — unlike the Collector-side worklists in items 9–13, this pools every collector's submitted DCRs together for AR to work through). No `.limit()` — judgment call below.
- **Action**: "Post / Paid" → `ConfirmDialog` → `POST /api/ar/dcr/[id]/reconcile` (`route.ts:1-43`) → `reconcileAndPostDcr()` — confirmed correct and complete (see Status above). Already refetches via `load({silent:true})` (`page.tsx:206`) — no concurrency gap.
- **Where reconciled DCRs go**: once posted, `dcr.status` flips to `reconciled` and the row naturally drops off this `status='submitted'` query. AR's own History page (item 3, already Done, `/ar/history` "Reconciled DCRs" tab) picks it up from there — confirmed this page and that tab are correctly complementary, no gap to fix (unlike Collector's `/collector/dcr`, which had no such counterpart before item 13).
- **Volume consideration**: because this is org-wide (every collector's submissions), it could plausibly grow larger than the per-officer worklists elsewhere in this batch. Still judged as an operational backlog (a lending shop reconciles deposits on a regular cadence, not indefinitely) rather than a growing historical log — **chrome-only pagination over the bulk fetch, same as the rest of this batch**, but flagged here explicitly as the one page in this group where that assumption is least certain. If it's ever observed to carry a large backlog in practice, revisit with real server-side pagination.
- **Permission**: `requireModulePermission("accounting_ar", "view"/"execute_trigger")` — matches AR's other pages.
- **Detail/View**: each DCR card already shows its full line-item table inline (borrower link to `/ar/masterlist/[id]`, payment ref, date, proof download) — no separate detail page needed or wanted, the card *is* the detail view. No View action to add.

## Phase 1 — Frontend: chrome additions ✅

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

Rewrite `src/app/ar/dcr/page.tsx`:
- **Outer shell always mounted** — no gate that unmounts the toolbar/search on empty.
- **Keep the existing 3 KPI cards unchanged** (icon-based, standing rule).
- **Collapsible Filters panel**: a "Waiting" bucket chip set (All / 1–3 / 4–7 / 8+ days since `submitted_at`) — same mechanics as `/cig/denials`/`/collector/briefings`, genuinely useful here too (older unreconciled DCRs are operationally important to surface first).
- **Sort control**: since rows are cards, not a table, use a small "Sort" `Select` (Oldest first [default, matches current] / Newest first) rather than a clickable column header — same underlying `submitted_at` field.
- **No `ViewModeToggle`** — deliberate, not an oversight: each row is a multi-part card (line-item table + reconciliation form inputs), not a compact row that benefits from list/grid/compact variants. Forcing grid/compact views onto a form-embedded card would be actively worse UX, not just unnecessary.
- **Page-size pagination** — `Select` + `Pagination` over the card list, always mounted (per Phase 0's volume note, chrome only for now).
- **Skeleton loading**: replace `if (loading) return <Spinner/>` with static shell + skeleton card placeholders (`Skeleton variant="line"` repeated, or a dedicated card-skeleton shape if `Skeleton` supports one — match whatever's closest to the existing `Card` dimensions) gated on `loading` alone.
- Keep the reconcile form/action exactly as-is (per-DCR deposit reference/amount inputs, mismatch warning, `ConfirmDialog`, refetch) — already correct, don't touch.

New pure helpers, e.g. `src/lib/ar/dcr-list.ts`: `daysWaiting`/`waitingBucketFilterSpec`/`passesWaitingBucket` (mirror the pattern already used three times in this batch — consider whether a genuinely shared cross-module helper is worth extracting at this point, given it's now the fourth near-identical copy across `cig/denials.ts`, `cig/history.ts` (callbacks), `collector/briefings.ts`, and now here; judgment call for whoever implements — a shared `lib/waiting-bucket.ts` would remove real duplication, but isn't required if the existing per-module-copy pattern is preferred for consistency with how the rest of the rollout was built), sort-by-submitted-at, page-size clamp.

## Phase 2 — Tests ✅

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/ar/__tests__/dcr-list.test.mts` — mirror `briefings.test.mts`'s structure (waiting buckets, sort, page-size clamp — no KPI-computation test needed since the existing KPI cards are computed inline from the full `queue` array already and aren't being changed).

## Explicitly out of scope

- Any change to `reconcileAndPostDcr` or the reconcile route — confirmed correct and complete.
- `ViewModeToggle` — deliberately omitted, see Phase 1 reasoning.
- Server-side pagination — chrome only, per the volume judgment call above (flagged as the least certain of this batch).
