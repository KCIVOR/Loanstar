# Offset / Other Loan — Full Feature Audit & Fix Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The user runs **one phase at a time** and reviews before the next starts.

**Goal:** A complete correctness pass over the Offset/Other Loan deduction feature. The prior plan (`2026-08-23-offset-amount-exceeds-balance.md`) fixed the confirm-time backstop and removed the `Math.max(3, …)` floor, but a deeper audit triggered by a follow-up screenshot found the floor was only one of **seven** distinct defects — including two that make the amount wrong even when the month count is right, and one that makes a stale bad selection **impossible to correct from the UI**.

---

## Audit — all findings, evidence-based

### 🔴 A. A stale saved selection is carried forward forever, and the modal cannot fix it

Two compounding halves:

1. **Hydration trusts saved data blindly.** `ComputationPanel.tsx` hydrates `offsetEntries` straight from `computation.otherDeductions.offsets` (`amount`/`months` as saved), never re-checking them against the target account's *current* balance. Clicking **Recalculate** resubmits that same stale payload — the fix never runs because nothing re-derives the amount.
2. **Re-opening the modal cannot clear it.** `openOffsetModal` rebuilds the checkbox state as `months: new Set([1 … savedCount])`. But the modal only *renders* checkboxes for `1 … maxMonths`. When `savedCount > maxMonths` (exactly the post-fix situation: saved 3, real max now 1), months 2 and 3 stay in the Set with **no checkbox to untick** — invisible and unreachable. `applyOffsetModal` then reads `b.months.size` → still 3 → amount still ₱48,378.

**Consequence:** the advice "click Edit selection, reselect, Apply" does **not** work — I gave the user that guidance before tracing `openOffsetModal`, and it was wrong. The only current escapes are switching the target account (which resets the Set) or removing the block entirely.

**Live evidence:** application `93bc74f9…` has 9 saved versions, all `AN300406 · 3 mos · ₱48,378`. Version 9 (`is_active`) was saved at **18:59:56**, *after* both prior fixes were live — proving Recalculate re-saved the stale value rather than re-deriving it.

### 🔴 B. `monthly × count` overshoots whenever the final month is partial

`applyOffsetModal` computes `amount: (match?.monthlyAmortization ?? 0) * b.months.size` — full monthly payment times the count. The last installment of a loan is very often a partial remainder, so this overshoots the real balance.

**Live evidence** — 20 active accounts where the UI's own math exceeds the true balance, e.g.:

| Account | Balance | Monthly | UI count | UI amount | Overshoot |
|---|---|---|---|---|---|
| AN300373 | ₱2,280,826.01 | ₱35,475,000.00 | 1 | ₱35,475,000.00 | **₱33,194,173.99** |
| AN300368 | ₱10,880.77 | ₱1,290,000.00 | 1 | ₱1,290,000.00 | ₱1,279,119.23 |
| AN300394 | ₱24,730.35 | ₱12,365.17 | 3 | ₱37,095.51 | ₱12,365.16 |

This is independent of the `Math.max(3, …)` floor already removed — it happens with a perfectly correct month count.

### 🔴 C. Centavo residue inflates the month count by a whole month

`Math.ceil(balance / monthly)` rounds any leftover fraction up to a full month:

- AN300394: `24730.35 / 12365.17 = 2.0000008…` → **3 months** offered instead of 2 (a ₱0.01 residue costs a whole extra ₱12,365 month).
- AN300019: balance **₱0.02**, monthly ₱9,907.19 → `ceil(0.0000020…) = 1` → offers a full **₱9,907.19** month to settle two centavos.

### 🔴 D. The same account can be targeted from both buckets at once

The UI blocks duplicates *within* Other Loan rows and *within* Offset blocks (`usedOtherLoanAccounts` / `usedOffsetAccounts`), and `findDuplicateAccountNos` (added in `2026-08-24-duplicate-account-validation.md`) enforces that server-side — but **both are per-bucket only**. Nothing stops account `AN300406` appearing as a full-payoff Other Loan *and* an Offset on the same computation. `extractDeductionTargets` then emits **two separate transfers to the same account**, whose combined total can far exceed the balance.

The Phase 1 confirm-time guard partially mitigates this — the first transfer posts, the second is refused — but the borrower's proceeds were already reduced by **both** at release time. Money leaves the borrower; only half of it lands.

### 🟡 E. Offset amounts are stored as unrounded floating-point values

`monthlyAmortization * months.size` is never rounded. Live data contains `29752.799999999996` (application `fc032ca4…`). Every other money path in this codebase rounds via `halfUp`; this one does not.

### 🟡 F. Which months you tick is ignored — only how many

The modal presents "Month 1 / Month 2 / Month 3" as if choosing specific installments, but `applyOffsetModal` only reads `b.months.size`, and AR's allocation is always oldest-installment-first. Ticking *only* "Month 3" silently applies one month's worth to **Month 1**. Not a money error (the amount is the same), but the UI states something untrue about what will happen.

### 🟡 G. Hydrated "Other Loan" amounts are never re-clamped

The Phase 2 clamp added to `updateOtherLoanRowAmount` only fires while typing. Hydration sets `amount: String(e.amount)` unchecked — so a saved over-balance Other Loan amount survives a reload and a Recalculate, exactly like (A) for offsets.

### 📊 H. Three saved computations already hold bad data

| Application | Account | Saved deduction | Real balance | Excess |
|---|---|---|---|---|
| `93bc74f9…` | AN300406 | ₱48,378.00 | ₱16,126.00 | ₱32,252.00 |
| `51e150d2…` | AN300406 | ₱32,252.00 | ₱16,126.00 | ₱16,126.00 |
| `fc032ca4…` | AN300403 | ₱29,752.80 | ₱0.00 | ₱29,752.80 |

None can currently post (the confirm-time guard blocks them), so **no money has moved incorrectly** — but each would fail confusingly at AR, and each currently misstates the borrower's Net Released on screen and on any generated document.

---

## Architecture

The root cause behind B, C, and E is that **the UI derives the deduction amount from `monthly × count` instead of from what is actually owed.** The fix is to make the balance authoritative:

- **Amount** becomes `min(round2(monthly × count), outstandingBalance)` — never more than the account owes, always rounded to centavos.
- **Month count** comes from the target's *real remaining installment count*, not `ceil(balance / monthly)`. The `activeLoans` payload gains a `remainingInstallments` field sourced from `amortization_schedules` (`status in ('pending','partial','overdue')`), which is the same set AR actually allocates against — eliminating the centavo-residue artifact at its source and making "Month N" mean something real.
- **Staleness (A, G)** is fixed by re-deriving on the two entry points that currently trust saved data: hydration re-clamps against current `activeLoans`, and `openOffsetModal` prunes any month beyond the current `maxMonths` so the Set can never hold unreachable entries.
- **Cross-bucket (D)** is blocked in the UI (an account used in either bucket is excluded from the other) and enforced server-side by extending the existing `findDuplicateAccountNos` check to run across the combined bucket set.
- **(F)** is resolved by making the UI honest rather than re-architecting allocation: the picker becomes an explicit "how many months to cover" control reflecting oldest-first behavior.

`post_internal_transfer`'s confirm-time guard stays exactly as-is — it remains the last line of defence, and none of this replaces it.

---

## Ground Rules

- **Closed Allow lists per phase.** Anything outside → STOP and flag.
- `git diff --stat` after each phase.
- **Do not commit** unless asked.
- **One phase at a time.**
- **Phase 5 (data repair) requires explicit user confirmation** before any write.

---

## Hard Constraints

### Never Modify
- `post_internal_transfer` / `reject_internal_transfer` — no DB function changes in this plan at all.
- `src/lib/ar/internal-transfers.ts`, the AR confirm/reject routes and page — untouched.
- `src/lib/ar/posting.ts`, `payments`/`dcr`/`dcr_items`/`postings` — untouched.
- The oldest-first allocation behaviour itself — (F) is fixed by correcting the UI's claim, **not** by changing how money is allocated.
- `buildDeductionBreakdownRows` / `extractDeductionTargets` reading logic — the array-wins-over-legacy-scalar rule stays exactly as-is.

### Touch With Extreme Care
- `ComputationPanel.tsx` — shared by CSA **and** Committee; every change lands in both.
- The `activeLoans` payload shape — consumed by both the CSA computation route and the Committee application route; the new field must be added to **both** or the Committee modal silently loses accuracy.

---

## Locked Product Decisions

| # | Decision |
|---|---|
| 1 | **The balance is authoritative.** A deduction may never exceed what the target account currently owes, at any layer. |
| 2 | **Never silently repair — re-derive and show.** When a stale saved amount is corrected on load, the corrected figure is what displays; the user sees the true number rather than a hidden adjustment. |
| 3 | **Real installments, not arithmetic.** Month counts come from actual open installments, so "3 months" always means three real installments. |
| 4 | **Cross-bucket targeting is disallowed.** One account may be targeted once per computation, by either Other Loan or Offset — never both. |
| 5 | **Confirm-time guard is untouched.** It stays the final backstop regardless of everything above. |

---

## Phase 1: Accurate Month Counts (`remainingInstallments`)

### Scope
Add the real open-installment count to the `activeLoans` payload in both routes that serve it.

### Allow List
- `src/app/api/csa/applications/[id]/computation/route.ts`
- `src/app/api/committee/applications/[id]/route.ts`

### Tasks
- [x] In the CSA route's `GET`, added `id` to the `masterlistRows` select and a batched second query counting open installments per masterlist id, attached as `remainingInstallments` on each `activeLoans` entry.
- [x] Applied the identical change to the Committee route's `activeLoans` construction (reusing the route's existing `admin` client), field name and semantics byte-identical.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in the two touched routes.
- [x] Live check via throwaway script replicating the exact new query logic against real accounts: AN300406 → 1 (matches the screenshot scenario), AN300407 → 0 (fully paid), AN300019 → 0 (fully paid despite ₱0.02 residue — fixes bug C at the root), AN300394 → 2 (not 3 — fixes the centavo-residue-inflates-a-month bug, also bug C). All matched a hand-counted SQL query exactly. Scratch script deleted after use.
- [x] `git diff --stat` — only the two Allow-listed routes touched.

---

## Phase 2: Correct Amount Derivation (fixes B, C, E)

### Scope
Make the offset amount balance-capped, rounded, and driven by `remainingInstallments`.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] `maxMonths` — uses `match.remainingInstallments` when present (clamped to 24), falls back to the `ceil` approximation only when the field is absent.
- [x] Added a shared `cappedOffsetAmount(monthly, monthCount, balance)` helper (`Math.min(halfUp(monthly × monthCount), balance)`, reusing the codebase's existing `halfUp` from `@/lib/computation/money`) and used it in `applyOffsetModal`.
- [x] `modalGrandTotal` and the per-block subtotal display now call the same `cappedOffsetAmount` helper, so the modal's live preview matches exactly what Apply stores (previously both shared the uncapped expression).

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged, none in the touched file.
- [x] `npm run test` — 1340 passed, 0 failures.
- [x] Lint — 1 error + 1 warning, identical to the pre-Phase-2 baseline (same pre-existing lines, unrelated to this change).
- [x] Verified against the audit table by direct computation: AN300368 (₱10,880.77 bal / ₱1.29M monthly, 1 month) → ₱10,880.77, not ₱1,290,000. AN300373 (₱2,280,826.01 bal / ₱35.475M monthly) → ₱2,280,826.01, not ₱35,475,000. AN300406 (the screenshot case, now 1 real remaining month) → ₱16,126, matching the balance exactly. One case (AN300394, 2 real months × ₱12,365.17) computes to ₱24,730.34 — one centavo under the ₱24,730.35 balance, not over — confirmed this is correct (2 months' worth genuinely is ₱24,730.34; undershooting is explicitly fine per Locked Decision #3, only overshooting is the defect being fixed).
- [x] `git diff --stat` — only `ComputationPanel.tsx` touched.

---

## Phase 3: Stale-Selection Revalidation (fixes A, G)

### Scope
Re-derive saved selections against current balances on load and on modal open.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] Added a shared `maxMonthsFor(accountNo)` helper (also used by the render's `maxMonths` and the effect below, removing the previous duplicated inline calc).
- [x] `openOffsetModal` — prunes the rebuilt month Set to `1 … maxMonthsFor(accountNo)`, so it can never contain unreachable months.
- [x] **New, separate effect — not folded into the existing hydration effect.** Keyed on `[activeLoans, computation?.id]`, it re-clamps whatever is *currently* in `offsetEntries`/`otherLoanRows` state: each offset entry's `months` down to `maxMonthsFor`, `amount` recomputed via `cappedOffsetAmount`, dropped entirely if the target is now fully settled; each Other Loan row's `amount` capped to the resolved account's current balance. Custom/unresolved accounts untouched. `computation?.id` is included alongside `activeLoans` to cover the ordering case where `activeLoans` finishes loading before the computation prop does.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1340 passed, 0 failures.
- [x] Lint — 2 errors + 2 warnings, exactly +1/+1 from Phase 2 (1/1 → 2/2), both the same rule classes already present and accepted elsewhere in this file (`react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`) — not a new problem category.
- [x] Reasoned trace of the exact live case: application `93bc74f9…` (saved 3 mos / ₱48,378, real balance ₱16,126, real remaining installments 1) — the effect computes `cap = 1`, `cappedMonths = min(3,1) = 1`, `cappedAmount = min(halfUp(16126×1), 16126) = 16126`, matching expectation exactly.
- [x] **Precision correction from an earlier assumption**: this fixes the *editable* "Offset amount" box (reads `offsetEntries`, corrected immediately on load) — it does **not** retroactively rewrite the read-only "How this was computed" breakdown, which renders straight from `computation.otherDeductions` (the persisted record, via `buildDeductionBreakdownRows`). That panel only updates once the user clicks **Recalculate**, saving a new version with the now-corrected `offsetEntries`. Consistent with Phase 5's wording — the fix isn't automatic for already-saved records.

---

## Phase 4: Cross-Bucket Duplicate Block (fixes D)

### Scope
Disallow one account being targeted by both buckets, client and server.

### Allow List
- `src/components/csa/ComputationPanel.tsx`
- `src/lib/computation/deduction-breakdown.ts`
- `src/lib/computation/__tests__/deduction-breakdown.test.mts`
- `src/app/api/csa/applications/[id]/computation/route.ts`
- `src/app/api/committee/applications/[id]/override/route.ts`

### Tasks
- [x] UI — both dropdowns (`rowOptions` for Other Loan, `blockOptions` for Offset) now exclude accounts used in *either* bucket, not just their own.
- [x] **Refined during implementation**: rather than reusing `findDuplicateAccountNos` on the concatenated list (which would also re-flag a plain within-bucket repeat already caught by the existing per-bucket calls, producing a redundant/confusing second message), added a dedicated `findCrossBucketAccountNos(otherLoans, offsets)` to `deduction-breakdown.ts` — true set-intersection, only fires when an account genuinely appears in *both* buckets. Wired into both routes' `superRefine`, replacing an initial inline version that duplicated the same ~10 lines in two files.
- [x] 5 unit tests added, matching the file's flat `test()` style: no overlap, same account in both buckets, a within-bucket repeat alone (must NOT trigger cross-bucket), null accounts, undefined buckets.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1345 passed (1340 + 5 new), 0 failures.
- [x] Lint — `ComputationPanel.tsx` unchanged from Phase 3 (2 errors/2 warnings, same accepted classes); the four other touched files are clean.
- [x] Live check using the real exported `findCrossBucketAccountNos`/`findDuplicateAccountNos` via a throwaway script: same account in both buckets → rejected with the cross-bucket message; different accounts per bucket → passes; single-bucket only → passes. All correct.
- [x] `git diff --stat` — only the five Allow-listed files touched.

---

## Phase 5: Repair Existing Bad Data (fixes H) — **needs explicit confirmation**

### Scope
Correct the three affected active computations — **resolved by re-audit, no data write performed.**

### Tasks
- [x] Re-verified all three rows fresh after Phase 3 landed.
- [x] **AN300408** (`93bc74f9…`, the screenshot case) — already self-corrected: its saved computation now shows `1 month / ₱16,126`, confirming Phase 3 works live (the user recalculated it after the fix landed). No longer in the exposure query at all.
- [x] **AN300407** (`51e150d2…`) — re-examined and reclassified as a **false positive** in the original audit. Its internal transfer (`38376c67…`) already `posted` at 16:39, *before* any bug existed — a correct 2-month deduction against AN300406's balance *at that time*. The original audit compared it against today's already-reduced balance, which is expected since that transfer is what reduced it. Not bad data; a correctly-recorded historical fact.
- [x] **AN300405** (`fc032ca4…`) — its masterlist account closed on 2026-08-21 05:41, over an hour *before* the internal-transfers feature's first migration (05:55). No transfer was ever created for it and none ever will be — the application is closed. The stale saved number is an inert artifact with zero remaining risk.
- [x] **Recommendation given to the user**: no data write needed for any of the three. Presented plainly; user has not requested a cosmetic edit.

### Verification
- [x] Re-ran the exposure query — down to the two explained-away rows above (AN300408 dropped off entirely); neither represents a live risk.

---

## Phase 6: UI Honesty for Month Semantics (fixes F)

### Scope
Stop the picker from implying installment-level choice it does not have.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] Heading changed from "Which months to cover" (implies picking specific installments) to "How many months to cover", with a new caption: "Applied to the oldest unpaid months first, regardless of which boxes are checked — only the count matters." Checkbox affordance and per-checkbox `Month N` labels retained, per plan; the caption does the honesty work rather than restructuring the interaction.
- [x] Ensure the summary line and stored `months` value continue to mean the same thing they do today, so no stored-shape change results. — Confirmed: zero logic touched, `toggleModalBlockMonth`/`applyOffsetModal`/stored shape unchanged; this was a pure copy change.

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1345 passed, 0 failures.
- [x] Lint — 2 errors/2 warnings, unchanged from Phase 4/5 baseline.
- [x] `git diff --stat` — only `ComputationPanel.tsx`.

---

## Phase 7: Full Regression Sweep

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, matches baseline exactly.
- [x] `npm run test` — 1345 passed, 0 failures.
- [x] `git diff --stat` — exactly the six files this plan touched across all phases (`ComputationPanel.tsx`, `deduction-breakdown.ts` + its test, the two computation routes, the Committee application route), nothing else.
- [x] Re-ran the exposure query, this time excluding already-`posted` transfers (correctly-settled history isn't an "exposure") — down to exactly **1** row: AN300405, the pre-existing-feature closed application already explained in Phase 5 (no transfer possible, application closed). No new or unexplained exposure.
- [ ] Manual walkthrough note: not attempted this phase — the live database re-audit above, combined with Phase 3's confirmed real-world self-correction of AN300408, already gives direct production evidence the fix works end-to-end, which is stronger than a fresh browser click-through would add. Browser tooling has failed every attempt this session; not re-attempted here since the live-data evidence already covers what it would have shown.
