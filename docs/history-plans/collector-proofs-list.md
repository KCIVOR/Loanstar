# Collector — `/collector/proofs` (payment proofs)

## Status

**All 3 phases implemented, awaiting human validation.**

Phase 0 audit complete, 2026-08-12. **Phase 1 complete, 2026-08-12** — PATCH `/api/collector/payments/[id]` now `.select("id").maybeSingle()` after the `pending_verification` guard and throws `"Payment is no longer pending review"` when 0 rows match (mirrors `markDenialInformed` / `markCallbackResolved`). **No backend defect** (same as `/collector/briefings`) — confirm/reject are real, complete write actions with correct RLS-permission gating and idempotent `.eq("status","pending_verification")` guards, and both correctly refetch (`load({silent:true})`). **A real history counterpart already exists** — `/collector/history`'s Payments tab (`scope=history`, already live before this rollout, confirmed out of scope for item 7's Closed Accounts work) already shows `pending_verification/confirmed/rejected/posted` payments, so rejected/confirmed proofs aren't lost once they leave this desk view. Full pattern from the start, per the item-9 correction.

**Phase 2 complete, 2026-08-12** — `/collector/proofs` rewritten to briefings-style chrome: shell always mounted, Pending review / Confirmed awaiting DCR KPIs, Status chips (All / Pending / Confirmed) in collapsible Filters + `.active-pill-row`, search via `proofSearchPredicate`, Date sort, ViewModeToggle (grid keeps Confirm/Reject/View/Add-via-DCR), page-size + Pagination always mounted, skeleton loading, silent refetch after review. Fetch still `scope=desk`. Helpers in `src/lib/collector/proofs.ts`. PATCH / history Payments tab / desk-lock untouched.

**Phase 3 complete, 2026-08-12** — `src/lib/collector/__tests__/proofs.test.mts` covers page-size clamp, status filter (all three chips + unknown → all), search (ref/borrower/account/empty term), sort asc/desc without mutating input, KPIs (empty + mixed pending/confirmed). No PATCH/Supabase mocks.

## Phase 0 audit findings

- **Page**: `src/app/collector/proofs/page.tsx` (340 lines). Client component, single bulk `fetch("/api/collector/payments?scope=desk")` on mount, full-page `<Spinner/>` (`page.tsx:146`). Has: client-side search (ref/borrower/account), client-side status chips (All/Pending/Confirmed — **keep these three, they're a real and already-working filter**, no need to invent new ones), client-side pagination (`PAGE_SIZE=10`). No sort, no KPI cards, no collapsible Filters panel, no `ViewModeToggle`.
- **Backend query**: `GET /api/collector/payments?scope=desk` (`src/app/api/collector/payments/route.ts:31-114`) — scoped to `assignments.collector_user_id = user.id` (per-officer, like `/collector/accounts` — confirmed via `assignments` join, `route.ts:37-40`), statuses `['pending_verification','confirmed']` for `scope=desk`, **excludes payments already locked into a submitted/reconciled DCR** (`paymentIdsLockedForCollectorDesk`, `route.ts:90,100-101` — a confirmed proof that's been added to a DCR and that DCR has moved past draft disappears from this desk view, correctly, since it's no longer actionable here). `.limit(100)` — bounded, same small-worklist shape as the other list pages in this batch.
- **Actions**:
  - **Confirm/Reject**: `PATCH /api/collector/payments/[id]` (`route.ts:14-36`) — `requireModulePermission("collection","edit")`, sets `status`/`reviewed_by`/`reviewed_at`, guarded by `.eq("status","pending_verification")`. **Minor gap**: unlike `markDenialInformed`/`markCallbackResolved`, this route doesn't `.select()` the updated row or check the guard actually matched anything — if two collectors act on the same payment near-simultaneously, the loser's request still returns `{status: body.status}` as if it succeeded, when 0 rows were actually touched. Small, recommended fix in Phase 1 (add `.select("id").maybeSingle()`, throw if null) — optional but brings this route in line with the idempotency-reporting pattern used everywhere else in this rollout.
  - **View proof**: `GET /api/collector/payments/[id]/download` → signed URL, opens in a new tab. Unrelated to list redesign, keep as-is.
  - **"Add via DCR"**: link to `/collector/dcr`, not an action on this page — keep.
- **Existing history counterpart, already correct**: `scope=history` on the same route (`route.ts:47-49`) returns `['pending_verification','confirmed','rejected','posted']`, `.limit(200)`, no desk-lock filtering — this is what `/collector/history`'s Payments tab already queries (confirmed by Collector's own item-7 audit: "confirmed strictly DCR + Payment records"). **No new history page needed for this item** — rejected/confirmed proofs remain visible there once they leave this desk.
- **Permission**: `requireModulePermission("collection", "view")` for GET, `"collection", "edit")` for PATCH — per-officer-scoped via `assignments`, consistent with `/collector/accounts`' own RLS shape (not org-wide like the briefings page turned out to be).
- **Detail page**: none needed — actions happen inline (Confirm/Reject/View), same as `/collector/briefings`.

## Phase 1 — Backend: idempotency fix (small, recommended) — DONE

`src/app/api/collector/payments/[id]/route.ts`: PATCH update chain now `.select("id").maybeSingle()` after `.eq("id", id).eq("status", "pending_verification")`. If `error`, throw; if `!data`, throw `"Payment is no longer pending review"` instead of silently reporting success. Still returns `jsonOk({ status: body.status })` on success. Permission (`requireModulePermission("collection", "edit")`) and zod schema unchanged. Mirrors `markDenialInformed`/`markCallbackResolved`'s exact shape.

## Phase 2 — Frontend: full pattern ✅

Rewrite `src/app/collector/proofs/page.tsx`:
- **Outer shell always mounted.**
- **KPI cards**: "Pending review" (count, `status==='pending_verification'`) + "Confirmed, awaiting DCR" (count, `status==='confirmed'`) — two real operational numbers, not filler, mirrors the two-metric discipline used throughout this batch.
- **Collapsible Filters panel**: move the existing All/Pending/Confirmed status chips into the panel (matching CSA's original status-filter-in-panel convention) with an `.active-pill-row` showing the active filter; search stays in the toolbar row.
- **`ViewModeToggle`** (list/grid/compact) — grid cards: borrower/account, reference, date, amount, status badge, the same Confirm/Reject/View/Add-via-DCR actions at the bottom.
- **Sort**: Date column (asc/desc) — the one sortable column, matching this batch's single-sort-column precedent.
- **Page-size pagination** — `Select` + `Pagination`, always mounted (replace the fixed `PAGE_SIZE=10` client slice with a real page-size selector, still client-side pagination over the bulk-fetched set).
- **Skeleton loading** gated on `loading` alone.
- Keep Confirm/Reject/View/Add-via-DCR exactly as-is (already correct refetch behavior via `load({silent:true})`).

New pure helpers, e.g. `src/lib/collector/proofs.ts`: status-filter-spec/predicate (formalizing the existing chip logic), search predicate, sort-by-date, KPI computation, page-size clamp — same shape as `briefings.ts`/`denials.ts`.

## Phase 3 — Tests ✅

### Status: Implemented by Cursor 2026-08-12 — awaiting validation

`src/lib/collector/__tests__/proofs.test.mts` — mirror `briefings.test.mts`'s structure: page-size clamp, `proofStatusFilterSpec` / `passesProofStatusFilter` (All / Pending / Confirmed + unknown → all), `proofSearchPredicate` (ref / borrower / account / empty term), `sortProofsByDate` (asc/desc, no mutate), `computeProofListKpis` (empty + mixed pending/confirmed). No PATCH/Supabase mocks.

## Explicitly out of scope

- The desk-lock exclusion logic (`paymentIdsLockedForCollectorDesk`) — correct and untouched.
- `/collector/history`'s Payments tab — already correct, no changes needed.
- Server-side pagination — same judgment call as the rest of this batch, chrome only.
