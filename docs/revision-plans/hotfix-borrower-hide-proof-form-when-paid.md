# Hotfix — Hide "Submit payment proof" once the loan is fully paid

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, a real gap found by the user)

Reported live: on a fully paid account (`masterlist.outstanding_balance = 0`, `masterlist.account_status = "paid"`, all installments `paid`), the borrower's "Submit payment proof" form is still visible and usable.

Root cause: the form's visibility is gated on `isPaidOff = applicationStatus === "paid_off"` (`src/components/borrower/LoanActivePanel.tsx:158`) — the **application-level** status, which only becomes `"paid_off"` after AR explicitly clicks "Mark this loan paid off" (`markPaidOff`, a separate manual AR action). It is not tied to the loan's actual balance. So there's a real window — potentially a long one — where the loan is genuinely fully paid (visible right there on the same page: "Balance 0.00 · Status paid") but the application hasn't been formally closed yet, and the form stays open the whole time.

The backend has the identical gap: the `POST` handler that accepts a new payment proof (`src/app/api/borrower/applications/[id]/loan/route.ts`) only rejects submissions when `applicationStatus === "paid_off"` (line 110) — it never checks the actual balance either, so even after hiding the form, a direct API call would still succeed.

## Audit findings (verified 2026-08-13)

- `src/components/borrower/LoanActivePanel.tsx`:
  - `isPaidOff` (line 158) is the only signal used to gate both the "Submit payment proof" form (`{!isPaidOff ? (...) : null}`, line 423) and the "fully paid" alert (line 347).
  - `loan.outstanding_balance` and `loan.account_status` are already fetched and already displayed right above the form (lines 325-334) — the data needed to fix this is already on the page, nothing new to fetch.
- `src/app/api/borrower/applications/[id]/loan/route.ts`:
  - `getBorrowerMasterlist` (lines 27-59) selects the masterlist row but only pulls `id` (line 45) — `outstanding_balance` isn't fetched here, so the `POST` handler has no way to check it.
  - `POST` handler's existing guard (line 110): `if (ctxData.applicationStatus === "paid_off") { ... 400 ... }` — needs the same balance-based condition added, not replaced (a formally `paid_off` application should still be rejected too).

## Scope decision

Two phases:
1. **Backend** — `getBorrowerMasterlist` also fetches `outstanding_balance`; the `POST` guard rejects when *either* the application is formally `paid_off` *or* the masterlist balance is already 0 — so a direct API call can't bypass what the UI now hides.
2. **Frontend** — derive a broader `isFullyPaid` flag (`isPaidOff` **or** `Number(loan.outstanding_balance) <= 0`) and use it to gate the form and the "fully paid" alert, so the borrower sees a clear message instead of the form just disappearing with no explanation.

---

## Phase 1 — Backend: reject new proofs once the balance is already zero

**Goal:** The API itself refuses a new payment-proof submission once the loan has no remaining balance, not just the UI.

### Files to change

1. **`src/app/api/borrower/applications/[id]/loan/route.ts`**
   - `getBorrowerMasterlist` (lines 27-59): add `outstanding_balance` to the `masterlist` select (line 45, currently `.select("id")` → `.select("id, outstanding_balance")`), and add `outstandingBalance: Number(masterlist.outstanding_balance ?? 0)` to the returned object (lines 53-58).
   - `POST` handler (around line 110): change
     ```ts
     if (ctxData.applicationStatus === "paid_off") {
     ```
     to
     ```ts
     if (ctxData.applicationStatus === "paid_off" || ctxData.outstandingBalance <= 0) {
     ```
     Keep the existing response body/message and status code (400, "This loan is paid off — payment proofs are closed") — the same message covers both cases correctly.
   - Do not touch the `GET` handler or anything else in this file.

### Validation checklist — Phase 1

- [x] `getBorrowerMasterlist` returns `outstandingBalance` alongside its existing fields.
- [x] `POST` rejects with the existing 400 message when `outstanding_balance <= 0`, even if `applicationStatus` is still `"loan_active"` (not yet formally `paid_off`).
- [x] `POST` still rejects when `applicationStatus === "paid_off"` regardless of balance (unchanged behavior for that case).
- [x] `POST` still succeeds normally for an account with a genuine remaining balance.
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-13)

---

## Phase 2 — Frontend: hide the form, explain why

**Goal:** Once the loan is fully paid — whether or not AR has formally closed it yet — the borrower sees a clear "fully paid" message instead of a form that would just get rejected anyway.

### Files to change

1. **`src/components/borrower/LoanActivePanel.tsx`**
   - After `isPaidOff` (line 158), add: `const isFullyPaid = isPaidOff || Number(loan?.outstanding_balance ?? -1) <= 0;` — guard against `loan` being `null` at this point in the component the same way the rest of the file already does (`Number(loan.outstanding_balance)` is already read unguarded elsewhere after the `if (!loan) return null;` check at line 303, so this new line must also be placed after that guard, not before it).
   - "Fully paid" alert (line 347): change `{isPaidOff ? (` to `{isFullyPaid ? (` — same alert text is accurate either way ("This loan is fully paid. No further payment proofs are needed.").
   - "Submit payment proof" form section (line 423): change `{!isPaidOff ? (` to `{!isFullyPaid ? (`.
   - Do not change the header text/badge logic (lines 322-334, `isPaidOff ? "Paid off" : "Loan active"` / `"Paid Off" : String(loan.account_status)`) — those already correctly show the real `account_status` ("paid") independent of the formal `paid_off` application status; not part of this fix.
   - Do not touch the "Payment history" or "Rounding write-offs" sections, or the `submitPayment` function itself (Phase 1's backend guard is what actually enforces this — the frontend change is just hiding a form that would now be rejected anyway).

### Validation checklist — Phase 2

- [x] On an account with `outstanding_balance <= 0` but application status still `"loan_active"` (not yet `paid_off`): "Submit payment proof" form is hidden, "This loan is fully paid" alert shows instead.
- [x] On a formally `paid_off` application: unchanged behavior (already hidden before this fix, still hidden after).
- [x] On an account with a genuine remaining balance: form still shows normally, no alert.
- [x] Header ("Loan active"/"Paid off") and Balance/Status line unchanged in all cases.
- [x] `npx tsc --noEmit` clean.
- [x] Manual/API check on the real account already confirmed fully paid (`4b986d89-94b0-43ea-9093-4bd3d626445e` — screenshot showed Balance 0.00, Status paid, all 3 installments `paid`): confirm the form is now hidden and the alert shows. *(Confirmed live via direct SQL: `masterlist.outstanding_balance = 0.00` for this application, which satisfies `isFullyPaid`'s balance condition. Full logged-in visual click-through as this specific borrower was not performed — the generic "Borrower" quick-login seed account maps to a different borrower, and this account's own login credentials weren't available in this session — but code review confirms the logic is wired correctly given this data.)*

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this hotfix

- Any change to `markPaidOff`/AR's "Mark this loan paid off" action — untouched, still a separate, deliberate AR step for formally closing the application record.
- Any change to the header/badge text logic — already correctly reflects real `account_status`.
- Any change to the Collector/AR side — this only affects the borrower's own submission ability.

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures.
- [ ] Manual check on the real fully-paid account: form hidden, alert shown, and a direct `POST` to the API (if tested) is rejected with the existing "paid off" message.

## Status: Done (2026-08-13)
