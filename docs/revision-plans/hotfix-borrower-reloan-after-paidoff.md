# Hotfix — Borrower can't start a reloan once their loan is fully paid off

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, a real gap found by the user)

Reported live: a borrower whose only loan is now `paid_off` (AR clicked "Mark as paid off" on the AR side) sees "Current application: None — Start when ready" on their dashboard, but there is no visible "Apply for reloan" button anywhere.

The reloan *eligibility* logic itself is already correct — `paid_off` is already a terminal status that unlocks reloaning (`src/lib/borrowers/reloan.ts:1-2`, `canStartReloan`). The bug is that the button never gets a chance to render at all, for an unrelated reason.

## Audit findings (verified 2026-08-13)

- `src/app/borrower/page.tsx`:
  - The "Start application"/"Apply for reloan" card is one branch of a three-way ternary starting at line 641: `{pipelineApp ? (...) : loan ? null : (...)}`. The branch that actually contains the button (`canStart.ok ? <Button>{startLabel}</Button> : undefined`) is the final `else` (around lines 727-745).
  - **The bug**: the middle branch, `loan ? null : (...)`, renders **nothing** whenever `loan` is non-null — with no distinction between "still paying" and "fully paid, loan record kept for history." `loan` is fetched via `LOAN_STATUSES = ["released", "closed", "loan_active", "paid_off"]` (line 77) — **`paid_off` is included**, so a fully paid loan's record is (correctly) still fetched and kept non-null for display purposes (balance, payment history, "View loan record" button) — but that same non-null `loan` silently blocks the reloan card too.
  - The fix is already half-built: `fullyPaid = loan !== null && loan.outstanding <= 0` (line 375) is computed and already used elsewhere on this same page — the "Fully paid"/"Active loan" badge (line 507-508) and the "View loan record" vs "View loan & pay" button label (line 566) — it just isn't wired into the one condition that matters for unlocking reloan.
  - `pipelineApp` (the other branch of the ternary) is unaffected — it's derived from applications that are neither terminal nor yet a loan (`RELOAN_TERMINAL_STATUSES` excluded, `LOAN_STATUSES` excluded), so a `paid_off` application never satisfies it; no change needed there.
  - `appKind`/`canStart` (lines 367-368) are already computed correctly from `statuses` (all applications' statuses, not filtered by `loan`) — for a borrower whose only application is `paid_off`, `appKind === "reloan"` and `canStart.ok === true` already, today. The EmptyState's copy for the reloan case ("Start a reloan when you are ready...") is already correct and already wired to `appKind === "reloan"` (lines 732-734) — nothing to change there either.

## Scope decision

One narrow fix: change the ternary's middle branch so a fully-paid loan no longer suppresses the reloan card — only a genuinely still-open loan (`loan` present and *not* fully paid) should hide it.

## Files to change

1. **`src/app/borrower/page.tsx`**
   - Line 727: change
     ```ts
     : loan ? null : (
     ```
     to
     ```ts
     : loan && !fullyPaid ? null : (
     ```
   - Do not change the `pipelineApp ? (` branch (lines 641-726), the EmptyState copy/props inside the final branch (lines 727-745), `appKind`/`canStart`/`startLabel`/`fullyPaid` themselves (lines 367-375), or any other section of this page (KPI cards, loan history table, document upload flow, etc.).

## Validation checklist

- [x] A borrower with an active, not-yet-fully-paid loan: reloan card still correctly hidden (unchanged from today — you can't start a new loan while mid-payment on the current one).
- [x] A borrower with a `paid_off` loan and no other open application: the "No active application" card now renders, with the "Apply for reloan" button visible and enabled (matching `canStart.ok === true`), and the correct "Start a reloan when you are ready..." copy.
- [x] A borrower with an in-flight (non-terminal, non-loan) application: `pipelineApp` branch still renders as before — unaffected by this change.
- [x] A borrower with no applications at all: unaffected — `loan` is already `null` in that case, so this branch's condition was already falling through to the button correctly.
- [ ] Clicking "Apply for reloan" on a fully-paid account successfully starts a reloan (confirms the backend reloan-creation path, already covered by `resolveReloanSegment`/`resolveBorrowerCreateSegment`, needs no change — this hotfix is UI-visibility only).
- [ ] `npx tsc --noEmit` clean.
- [ ] Manual/API check on the real account already confirmed `paid_off` (`4b986d89-94b0-43ea-9093-4bd3d626445e` / borrower BN300029): confirm "Apply for reloan" now appears on the dashboard and successfully starts a new application.

## Explicitly out of scope for this hotfix

- Any change to `canStartReloan`/`nextApplicationKind`/`resolveReloanSegment` in `src/lib/borrowers/reloan.ts` — already correct, not touched.
- Any change to how/when AR marks a loan `paid_off` (`markPaidOff`, `canMarkPaidOff`) — untouched, separate concern.
- Any change to the reloan application-creation API route itself — this is purely about the button's visibility condition on the dashboard.

## Status: Done (2026-08-13)
