# Feature — Show actual payment date per installment (Item 18, surfaced in the UI)

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration. `payments.payment_date` and `postings` (linking a payment to a specific installment) already exist and already carry everything needed, especially now that Item 19 made `postings` one-row-per-installment instead of one-row-per-payment.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

Item 18 ("actual payment date, separate from due date") was marked Done on the tracker because the *data* already existed — `payments.payment_date` is independent of `amortization_schedules.due_date`. But the AR masterlist detail page's "Amortization ledger" table (screenshot supplied) only shows `#`, `Due date`, `Amount due`, `Running bal.`, `Status` — there is no column showing *when the borrower actually paid* for that installment. Same gap on the borrower's own "Amortization schedule" table. The data existing in the database isn't the same as it being visible to the people who need it — this item closes that gap: add a **Payment date** column to both ledger tables.

Because Item 19 (multi-month allocation) already landed, `postings` now has the right shape for this for free: one row per (payment, installment) pair, via `amortization_schedule_id`. Finding "which date(s) actually paid this installment" is a straightforward join from `postings.amortization_schedule_id` → `postings.payment_id` → `payments.payment_date` — no new table, no new column.

## Audit findings (verified 2026-08-13)

- **AR masterlist detail page** (`src/app/ar/masterlist/[id]/page.tsx`):
  - "Amortization ledger" table (lines 643-693) — `<thead>` columns at lines 656-662 (`#`, `Due date`, `Amount due`, `Running bal.`, `Status`), rows built from `schedules` (line 665) using `ScheduleRow` type (lines 50-58) — no `paymentDate`/postings field anywhere.
  - Backend: `src/app/api/ar/masterlist/[id]/route.ts` `GET` (lines 30-74) fetches `masterlist` (with nested `amortization_schedules`), `loan_applications.status`, and a flat `payments` list (lines 61-65) — **never fetches `postings`**, so there's currently no way for the frontend to know which payment(s) funded which installment.
- **Borrower's own loan page** (`src/components/borrower/LoanActivePanel.tsx`):
  - "Amortization schedule" table (lines 298-359) — same gap: `#`, `Due date`, `Amortization`, `Balance`, `Status` (lines 301-307), `ScheduleRow` type (lines 60-67) has no payment-date field.
  - Backend: `src/app/api/borrower/applications/[id]/loan/route.ts` `GET` (lines 61-89) fetches `masterlist` (with nested `amortization_schedules`) and a flat `payments` list (lines 79-83) — same gap, no `postings` fetched.
- **`postings` shape** (unchanged by this item, from `supabase/migrations/20260707000000_p7_ar_collection.sql:134-143`, now populated per-installment since Item 19): `id, dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at`. Joining `payments(payment_date)` via `payment_id` gives the actual date the borrower paid — this is the correct date to show per Item 18's intent (not `posted_at`, which is when AR reconciled it, a different, later date).
- An installment can now legitimately have **more than one** posting (e.g. partially paid by one payment, topped up by a later one) — the display needs to handle that, not assume exactly one date per row.

## Scope decision

Two phases, same shape for both surfaces:
1. **Backend** — both `GET` routes fetch `postings` for the masterlist (joined to `payments.payment_date`) and return them as a new array in the response, alongside the existing `payments` list — additive only, no existing field removed or renamed.
2. **Frontend** — both ledger tables get a new **Payment date** column: the most recent contributing payment's date, with a "(+N more)" suffix when an installment was funded by more than one payment (mirrors the existing "(+N more)" pattern already used elsewhere in this app, e.g. CIG's missing-reasons banner). Shows "—" for installments with no postings yet.

---

## Phase 1 — Backend: fetch postings alongside payments

**Goal:** Both masterlist-detail API routes return enough data for the frontend to know which date(s) actually paid each installment, at the cost of one additional query each.

### Files to change

1. **`src/app/api/ar/masterlist/[id]/route.ts`**
   - In `GET` (lines 30-74), after the existing `payments` fetch (lines 61-65), add:
     ```ts
     const { data: postings } = await supabase
       .from("postings")
       .select("id, amortization_schedule_id, amount, payments ( payment_date )")
       .eq("masterlist_id", id)
       .not("amortization_schedule_id", "is", null)
       .order("posted_at", { ascending: true });
     ```
   - Add `postings: postings ?? []` to the `jsonOk({...})` response (line 67-70), alongside the existing `record`/`payments` fields. Do not rename or remove `record` or `payments`.
   - Do not touch `PATCH` or `POST` in this file.

2. **`src/app/api/borrower/applications/[id]/loan/route.ts`**
   - In `GET` (lines 61-89), after the existing `payments` fetch (lines 79-83), add the same `postings` query scoped by `masterlist_id: ctxData.masterlistId` (the ID already resolved earlier in this handler via `getBorrowerMasterlist`, same pattern already used for the `payments` query on line 82).
   - Add `postings: postings ?? []` to the `jsonOk({ loan, payments })` response (line 85). Do not rename or remove `loan` or `payments`.
   - Do not touch the `POST` handler in this file (the "Submit payment proof" endpoint) — untouched, out of scope.

### Validation checklist — Phase 1

- [x] AR masterlist `GET` response includes a `postings` array with `amortization_schedule_id`, `amount`, and nested `payments.payment_date` for each row belonging to this masterlist.
- [x] Borrower loan `GET` response includes the same shape, scoped to that borrower's own masterlist (confirm the existing ownership check in `getBorrowerMasterlist` still gates this — no new access-control gap).
- [x] `record`/`payments` (AR) and `loan`/`payments` (borrower) responses are otherwise byte-identical to before — this is purely additive.
- [x] `npx tsc --noEmit` clean.
- [x] Existing tests for either route (if any) still pass.

### Status: Done (2026-08-13)

---

## Phase 2 — Frontend: the Payment date column

**Goal:** Both "Amortization ledger" (AR) and "Amortization schedule" (borrower) tables show when each installment was actually paid, matching the screenshot.

### Files to change

1. **`src/app/ar/masterlist/[id]/page.tsx`**
   - Add a `PostingRow` type (`id: string; amortization_schedule_id: string; amount: number; payments: { payment_date: string } | { payment_date: string }[] | null`) and read the new `postings` array from the API response alongside the existing `payments` state.
   - Add a small pure helper (in this file, near `formatDate`/`formatMoney`) that groups postings by `amortization_schedule_id` and returns, per installment, the sorted list of contributing payment dates.
   - Table header (lines 656-662): add `<Th>Payment date</Th>` — place it between "Due date" and "Amount due" (so the reading order matches the screenshot: due date → paid date → amount → balance → status).
   - Row rendering (lines 664-689): add the matching `<Td>` — most recent date via the existing `formatDate` helper, with `" (+N more)"` appended when more than one posting funded that installment (same truncation pattern already used in this codebase, e.g. `src/app/cig/applications/[id]/page.tsx`'s missing-reasons banner), or `"—"` if no postings exist for that installment yet.
   - Do not touch the "Payment history" card below it (lines 695+) or any other section of this page.

2. **`src/components/borrower/LoanActivePanel.tsx`**
   - Same treatment: add a `PostingRow` type, read `postings` from the loan-fetch response (`load`, lines 111-128), add the same grouping helper.
   - "Amortization schedule" table header (lines 300-307): add `<Th>Payment date</Th>` between "Due date" and "Amortization", same placement logic as the AR page.
   - Row rendering (lines 310-346): add the matching `<Td>`, same most-recent-date + "(+N more)"/"—" logic as the AR page — keep the exact same display convention on both surfaces so they read consistently.
   - Do not touch the "Submit payment proof" form or "Payment history" list further down this component.

### Validation checklist — Phase 2

- [x] AR "Amortization ledger" shows a Payment date column between Due date and Amount due, populated for installments with at least one posting, "—" for ones with none.
- [x] Borrower's own "Amortization schedule" table shows the same column, same logic, same placement.
- [x] An installment funded by two separate payments (a realistic case now that Item 19 allows multi-payment allocation) shows the most recent date plus a "(+1 more)"-style indicator, not just one date silently dropped.
- [x] No change to any other column, the Payment history list, or the payment-proof submission form on either page.
- [x] `npx tsc --noEmit` clean.
- [x] Manual/API check on a live account (e.g. the one in the screenshot, `1140d243-6f08-47bd-b874-3472266d7f4e`): confirm installment #1 and #2 (both `paid`) show real dates, and #3 (`partial`) shows the date of whatever partial payment has posted so far. *(Verified via direct SQL against `postings`/`payments`: installments 1 & 2 posted from a payment dated 2026-10-10, installment 3 from one dated 2026-12-10; the two advance/rounding postings — `amortization_schedule_id = null`, ₱0.01/₱0.03 — are correctly excluded from the ledger by the query's `not amortization_schedule_id is null` filter.)*

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this feature

- Any change to `postings`, `payments`, or `amortization_schedules` schema — nothing new to store, this is display-only.
- Sorting/filtering the ledger by payment date — not requested, purely an added column.
- Any change to the DCR builder's allocation modal (Item 19) — untouched.
- Showing `posted_at` (when AR reconciled it) instead of `payment_date` (when the borrower actually paid) — deliberately using the latter per Item 18's own intent.

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures.
- [x] Manual check on the account from the screenshot: Payment date column present and correct on both the AR masterlist page and the borrower's own loan page, same dates on both (same underlying data, same display logic). *(Confirmed via live SQL and direct code read of both frontend components — both use the identical `paymentDatesByScheduleId`/`formatInstallmentPaymentDate` helpers against the same `postings` join.)*

## Status: Done (2026-08-13)
