# Feature — Lock PDC "Monthly amount" and "Number of checks" to the approved computation

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, not a bug — a decided change)

Audited the LRA "PDC encoding" step (`/lra/applications/[id]`, "Encode" stage). Two fields — **Monthly amount** and **Number of checks** — are free-editable inputs, only placeholder-hinted from the committee-approved computation (`computation.monthlyAmortization`, `computation.terms`):
- `amount` has zero cross-check against `computation.monthlyAmortization` anywhere, frontend or backend — any positive number is accepted and applied to every generated check.
- `Number of checks` above the term is clamped down **only in the frontend** (`Math.min(terms, ...)`); the API has no matching ceiling.
- Below the term, it's soft-gated behind a "shortfall" confirm-and-acknowledge flow (`src/lib/lra/pdc-shortfall.ts`), intended for "encode what's in hand now, collect the rest later."

Follow-up audit found that "collect the rest later" **doesn't actually exist anywhere** — the PDC encoding form only renders while `release_files.status === "pdc_encoding"`; saving moves status forward to `ready_generate` and nothing in the app ever reopens that stage. AR never touches `pdc_checks` at all. So an acknowledged shortfall today produces a release file whose PDC schedule can never be completed through the app.

**Decision:** lock both fields to the approved computation instead of trying to build the missing "add more later" capability. Amount always equals `computation.monthlyAmortization`; count always equals `computation.terms` — no more, no fewer. This also resolves the missing backend ceiling (moot once count can't vary) and makes the shortfall-acknowledge mechanism unreachable, so it's removed rather than left as dead code.

## Scope decision

Three phases:
1. **Backend** — `savePdcChecks` requires `checks.length === computation.terms` and every check's `amount === computation.monthlyAmortization`, hard failure (no acknowledge/override path) otherwise. Remove the shortfall soft-gate entirely.
2. **Frontend** — "Monthly amount" and "Number of checks" become read-only, computed displays instead of inputs; the generation loop always uses `computation.terms` checks at `computation.monthlyAmortization` each. Remove the shortfall confirm dialog and its state.
3. **Cleanup + tests** — delete `src/lib/lra/pdc-shortfall.ts` and its test file (fully superseded, not reachable anymore), and add coverage for the new hard equality check in `savePdcChecks`.

Fields explicitly **not** touched by this item (still manual, as discussed): First check date, Bank name, First check number, Blank check from/to. Those stay free-entry — they're real physical-check details LRA transcribes, not values derivable from the computation.

---

## Phase 1 — Backend: hard-lock amount and count

**Goal:** `savePdcChecks` rejects any submission where the check count or per-check amount doesn't exactly match the approved computation — no soft gate, no acknowledge override.

### Files to change

1. **`src/lib/lra/release-service.ts`**
   - `savePdcChecks` (lines 177-260): replace the `assertPdcShortfallAcknowledged(checks.length, computation.terms, options?.acknowledgeShortfall)` call (lines 205-209) with two hard checks, thrown before any DB write:
     - `checks.length !== computation.terms` → throw a clear error (e.g. `` `Number of checks must equal the loan term (${computation.terms})` ``).
     - any `checks[i].amount !== computation.monthlyAmortization` → throw a clear error (e.g. `` `Check amount must equal the monthly amortization (₱${computation.monthlyAmortization})` ``).
   - Remove the `options?: { acknowledgeShortfall?: boolean }` parameter and the `shortfallAcknowledged` field from the returned object (lines 189, 256-258) — no longer meaningful once the count/amount can't vary.
   - Remove the `import { assertPdcShortfallAcknowledged } from "./pdc-shortfall";` (line 20).
   - Do not touch anything else in this file — `getOrCreateReleaseFile`, `generateReleaseDocuments`, `recordRelease`, or any other exported function.

2. **`src/app/api/lra/applications/[id]/pdc/route.ts`**
   - Remove `acknowledgeShortfall: z.boolean().optional()` from `schema` (line 25).
   - Remove the `{ acknowledgeShortfall: body.acknowledgeShortfall }` options argument passed to `savePdcChecks` (line 51) — call it without that argument.
   - Remove the `acknowledgeShortfall`/`shortfallAcknowledged` fields from the audit-event `afterData` (lines 63-64).
   - Remove the `import { isPdcShortfallError } from "@/lib/lra/pdc-shortfall";` (line 6) and the `if (error instanceof Error && isPdcShortfallError(error.message)) { return NextResponse.json(..., { status: 409 }); }` branch (lines 73-75) — the new hard-equality errors are ordinary validation failures, same as any other `savePdcChecks` error, so they fall through to `handleApiError(error)` like everything else. Do not change how `handleApiError` itself works.
   - Do not touch the rest of the route (permission check, release-file lookup, response shape).

### Validation checklist — Phase 1

- [x] `savePdcChecks` throws when `checks.length !== computation.terms`, in both directions (too few and too many) — no acknowledge/override parameter can bypass it anymore.
- [x] `savePdcChecks` throws when any check's `amount !== computation.monthlyAmortization`.
- [x] `savePdcChecks` succeeds (writes to `pdc_checks`, advances status to `ready_generate`) when count and every amount match exactly.
- [x] `acknowledgeShortfall`/`shortfallAcknowledged` no longer appear anywhere in `release-service.ts` or the `pdc` route.
- [x] No changes to any other exported function in either file.
- [x] `npx tsc --noEmit` clean for both changed files.
- [x] Existing full test suite run — expect `pdc-collect.test.mts` and any other consumer to still pass; `pdc-shortfall.test.mts` will now fail to compile against the old module until Phase 3 removes it — that's expected mid-sequence, not a regression to chase down in this phase.

### Status: Done (2026-08-12)

---

## Phase 2 — Frontend: read-only amount and count

**Goal:** LRA staff see the committee-approved amount and term as fixed values on the PDC encoding form, not editable inputs; generation always uses exactly those values.

### Files to change

1. **`src/app/lra/applications/[id]/page.tsx`**
   - "Number of checks" field (lines 806-821): replace the editable `<Input type="number" ...>` with a read-only display of `data.computation?.terms` (e.g. same visual treatment as a disabled `Input` with `value={data.computation?.terms ?? ""} disabled`, or a plain styled `<p>` matching how other locked/computed values are shown elsewhere on this page — match existing page conventions, don't invent new styling). Keep the "Loan terms: N amortizations" helper text.
   - "Monthly amount" field (lines 823-835): same treatment — read-only display of `data.computation?.monthlyAmortization`, formatted with the page's existing `formatMoney` helper.
   - Remove the `pdcCheckCount`/`pdcAmount` editable state (or repurpose them as derived read-only values sourced directly from `data.computation` — whichever keeps the smallest diff) and their `onChange` handlers, since there's nothing left for the user to type into them.
   - `submitPdc` (lines 280-347): simplify the check-building loop to always use `data.computation.terms` as the count and `data.computation.monthlyAmortization` as every check's amount (drop the `Number(pdcCheckCount) || terms` / `Number(pdcAmount) || monthlyAmortization` fallback logic — there's no user input to fall back from anymore). Drop the `options?: { acknowledgeShortfall?: boolean }` parameter and the `acknowledgeShortfall` field in the POST body.
   - Remove the `confirmPdcShortfall` state (line 155), the `isPdcShortfallError` import (line 32), the `res.status === 409 && isPdcShortfallError(msg)` branch (line 330), and the shortfall `ConfirmDialog` block (lines 880-891+) — unreachable once count can't go below the term.
   - Do not touch the other PDC fields on this form (First check date, Bank name, First check number, Blank check from/to) or anything else on the page (release path selection, document generation, signing, briefing, release, close sections).

### Validation checklist — Phase 2

- [x] "Number of checks" and "Monthly amount" render as fixed, non-editable values matching `data.computation.terms` / `data.computation.monthlyAmortization` — no input the user can type into.
- [x] Submitting the PDC form always sends exactly `terms` checks at `monthlyAmortization` each, regardless of what was previously typed into now-removed state.
- [x] Shortfall `ConfirmDialog`, `confirmPdcShortfall` state, and the 409-shortfall handling branch are gone from this file.
- [ ] Manual/API check against a live application at the `pdc_encoding` stage: the form shows the correct locked amount/count, saving succeeds, and the resulting schedule has exactly `terms` checks at the right amount each.
- [x] Other PDC fields (date, bank, check number, blank range) still editable exactly as before.
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-12)

---

## Phase 3 — Cleanup: remove the now-unreachable shortfall module, add new test coverage

**Goal:** No dead code left behind from the old soft-gate mechanism; the new hard-equality rule in `savePdcChecks` has real test coverage.

### Files to change

1. **Delete `src/lib/lra/pdc-shortfall.ts`** — fully superseded by Phase 1's hard check; confirm (via grep) no remaining references anywhere in `src/` before deleting.
2. **Delete `src/lib/lra/__tests__/pdc-shortfall.test.mts`** — tests the deleted module.
3. **`src/lib/lra/__tests__/release-service.test.mts`** (or the appropriate existing test file for `release-service.ts` — locate it first; create one only if genuinely none exists for this file) — add test cases for `savePdcChecks`'s new behavior, following whatever stub pattern that file already uses (or the `pdc-collect.test.mts` hand-rolled fake-Supabase pattern if none exists yet):
   - Throws when `checks.length !== computation.terms` (both under and over).
   - Throws when any check's `amount !== computation.monthlyAmortization`.
   - Succeeds and writes `pdc_checks` when count and every amount match exactly.

### Validation checklist — Phase 3

- [x] `pdc-shortfall.ts` and its test file no longer exist; grep confirms zero remaining references to `assertPdcShortfallAcknowledged`, `pdcShortfallMessage`, `isPdcShortfallError`, `acknowledgeShortfall`, `shortfallAcknowledged` anywhere in `src/`.
- [x] New tests for `savePdcChecks`'s hard equality check exist and pass.
- [x] Full repo test suite passes, report the total count (e.g. "N/N").
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-12)

---

## Explicitly out of scope for this feature

- First check date, Bank name, First check number, Blank check from/to — stay manual, not derived from the computation.
- Auto-deriving the "blank check from/to" range from actual saved checks — a separate, previously-discussed idea, not part of this item.
- Any change to `pdc-collect.ts` (physical-collection confirmation) — untouched, unrelated to encoding.
- Any change to how AR handles payments/DCRs — AR never touched `pdc_checks` before this change and still doesn't after it.
- Building a "reopen PDC encoding to add more checks later" capability — explicitly rejected in favor of locking, per this conversation's decision.

## Final combined validation (after all three phases land)

- [x] Full test suite run — no failures, new tests included in the count (871/871 pass).
- [ ] Manual check on a live `with_pdc` application: PDC encoding shows locked amount/term, saves successfully with the correct schedule, and the release pipeline proceeds normally to Generate/Sign/etc. afterward.
- [x] Confirm no leftover references to the removed shortfall mechanism anywhere in the codebase (grep, not just the touched files).

## Status: Done (2026-08-12)
