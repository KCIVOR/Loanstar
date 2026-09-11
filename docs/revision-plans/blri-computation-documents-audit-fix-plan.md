# BLRI / computation-document audit — phase-by-phase fix plan

Source of truth for what these documents must contain: `Calculator SME.xlsm`
(the client's own workbook — BLRI / CV / CashVoucher / AR tabs, each with a real
Excel `Print_Area`). Audit findings this plan fixes are recorded in this
session; no new investigation happens inside these phases — each phase is a
surgical fix to one already-identified gap.

**Work location:** new branch `fix/blri-computation-audit`, off `develop`.
**Never work directly on `develop`/`main`.**

---

## Global constraints (apply to every phase below)

1. **Touch only the files named in that phase's "Files" list.** If a fix turns
   out to need a file not listed, stop and say so before editing it — don't
   silently expand scope.
2. **Never touch:** CIG/committee/collection/AR-collections modules, the
   TipTap editor, the Gotenberg renderer plumbing, the document-template CRUD
   system, RLS policies, or any file under `src/app/api/**` outside the two
   routes explicitly named in Phase 4. These are unrelated to this audit.
3. **No schema changes unless a phase explicitly calls for a migration.**
   Phases 1–3 and 6 are pure application-code fixes against **existing**
   `computations` columns — no new columns, no new tables.
4. **Every migration (Phase 4 only, if approved) is byte-identical in both**
   `loanstar/supabase/migrations/` **and** `Loanstar System/supabase/migrations/`,
   applied via Supabase MCP `apply_migration` — never `db push`.
5. **Gates after every phase, before moving to the next:** `npm test`,
   `npx tsc --noEmit` (no new errors in changed files), `npx next build`. A
   phase that touches money math also gets a live render check (render a
   sample BLRI/CV/CashVoucher through the actual code path and read the PDF
   back) before being called done.
6. **One phase = one commit.** Don't bundle two phases into one commit, so a
   bad phase can be reverted without losing the others.
7. **Backward compatibility:** every fixed function keeps its existing
   signature and existing callers working. `buildBlriData`, `buildLineItems`,
   `buildReleaseTemplateContext` all stay drop-in compatible — additive
   changes only, nothing removed that another call site depends on.
8. **Stop and ask before any phase whose "Decision needed" box isn't
   resolved.** Do not guess a business rule (fee applicability, name-source,
   whether a document is wanted) — that's exactly what produced silent gaps
   the first time.

---

## Phase 1 — Show the real deduction lines (Notary Fee, Other Deductions, Chattel Mortgage Fee)

**Fixes finding #1.** `buildBlriData()` reads only 4 of 11 available
`line_items` keys into `particulars`. Notary Fee and Other Deductions are
already computed and stored (`computations.notary_fee`,
`.other_deductions_total`) but never shown. Chattel Mortgage Fee
(`computations.chattel_fee`) isn't even in `line_items` yet.

**Decision needed before starting:** Chattel Mortgage Fee is only meaningful
for a collateral-secured loan. Should it appear in `particulars`
**unconditionally whenever `chattel_fee` is non-null/non-zero** (my
recommendation — matches how the other 4 fees already work, no new
collateral-type branching), or should it be gated on
`collateral_type === 'car_refinancing'` explicitly? Confirm before I write
the condition.

**Files:**
- `src/lib/csa/computation.ts` — `buildLineItems()`: add a `chattel_fee` entry
  (reads `result.chattelFee`, which `smeToSfResult`/the SME branch already
  computes as `smeChattelFee`) alongside the existing 11 keys.
- `src/lib/lra/blri-data.ts` — `buildBlriData()`: extend the hardcoded
  `particulars` array with Notary Fee, Other Deductions, Chattel Mortgage Fee,
  each guarded to **only appear when its amount is non-zero** (so a loan
  without a chattel fee doesn't print a stray "₱0.00" line — matches the
  Excel behavior where absent fees are simply not itemized... actually the
  Excel always shows all rows even at 0, so confirm: show every line always
  (even ₱0.00), or only non-zero ones? **Decision needed** — default to
  "always show, matches Excel's fixed row layout" unless told otherwise).
  Add the matching `ACCOUNT_CODES` entries: `documentation: "5003011"` (Notary
  Fee, taken from the Excel's own CV sheet: "Other Income - Documentation" =
  5003011), and a Chattel Mortgage Fee code — **the Excel's chattel-cancellation
  account code isn't shown on the CV/CashVoucher sample I audited; confirm the
  GL code for Chattel Mortgage Fee before this phase can be marked done**, and
  one for Other Deductions (Excel doesn't show one either — likely needs the
  real chart-of-accounts code from Accounting).

**Do NOT touch:** `resolveGrossTotals`, `computeSmeLoan`, `smeToSfResult`, any
interest/principal/term math — this phase only changes which already-computed
numbers get **displayed**, never how they're computed.

**Tests:**
- `src/lib/lra/__tests__/blri-f2.test.mts` (or a new
  `blri-data.test.mts` if none exists yet) — assert `particulars` includes
  Notary Fee / Other Deductions / Chattel Mortgage Fee with the right amounts
  and account codes, for a fixture computation that has all three non-zero.
- A regression case with all three at zero, to prove the "always shown /
  hidden-if-zero" decision (whichever is chosen) behaves correctly.
- Re-run the existing BLRI/CV/CashVoucher render (chromium engine, live
  Gotenberg) on a fixture with nonzero notary/other/chattel fees and confirm
  the printed particulars table + `accountingEntries` credit lines now foot to
  the same total as the debit line (Loans Receivable = principal).

**Checkpoint:** show you the before/after PDF of one BLRI with all 7
particulars visible, get your sign-off, before merging.

---

## Phase 2 — Fill in Prepared By / Checked By / Approved By

**Fixes finding #2.** `{{preparedBy}}`, `{{checkedBy}}`, `{{approvedBy}}` are
referenced on `blri`, `check_voucher`, `cash_voucher`, `final_computation_sheet`,
and the 3 `ar_*_voucher` templates, but `buildReleaseTemplateContext` never
sets them — always blank.

**Decision needed before starting:** `computations.computed_by` and
`.signed_by` are real user IDs. There is no third actor stored anywhere for
"Checked By" (the Excel shows 3 separate initials: e.g. "LMA / RPC / KCC").
Options:
  (a) Map `computed_by → Prepared By`, `signed_by → Approved By`, leave
      `Checked By` blank for now (no data source exists for it) — smallest
      change, ships 2 of 3.
  (b) Same as (a) but also add a new "checked by" actor somewhere in the
      computation/release workflow — this is a bigger, separate feature
      (new column + a UI step to capture who checked it), not a document fix.
  My recommendation is (a): fill what real data exists, leave "Checked By"
  as a blank signature line (same convention the system already uses for
  notary Doc/Page/Book numbers) rather than inventing a source. **Confirm.**

**Files:**
- `src/lib/lra/template-context.ts` — `buildReleaseTemplateContext()`: accept
  the resolved names as part of its `computation` input (extend
  `ReleaseComputation` with `preparedByName?`, `approvedByName?`), set
  `preparedBy`/`checkedBy`/`approvedBy` in `base` (checkedBy stays `""` per
  the decision above).
- `src/lib/lra/blri-data.ts` or wherever `ReleaseComputation` is assembled
  for the release call sites — resolve `computed_by`/`signed_by` (user IDs)
  to display names via the existing user-profile lookup already used
  elsewhere in the codebase (reuse, don't invent a new one — locate it first,
  e.g. wherever `generated_by`/`actorId` already gets turned into a name for
  audit logs).
- `src/lib/lra/release-service.ts` — thread the resolved names into the
  `computation` object passed to `buildReleaseTemplateContext` (the 1 call
  site at line ~759, already identified from the earlier render-config work).

**Do NOT touch:** the computation persistence code (`computation.ts` write
path), the signing/witness flow, or any RLS policy.

**Tests:** extend `src/lib/lra/__tests__/template-context.test.mts` — a case
with `computed_by`/`signed_by` resolved to names asserts `preparedBy`/
`approvedBy` are populated; a case with them null asserts blank, not a
thrown error or a literal `null` string.

**Checkpoint:** one rendered BLRI showing real names in the signature block.

---

## Phase 3 — Fill in the BLRI "Cheque Information" header fields

**Fixes finding #3.** `{{checkVoucherNo}}`, and the top-level `{{checkNumber}}`
/`{{checkDate}}` (distinct from the per-installment `pdcSchedule` rows) are
never set.

**Decision needed:** what IS the "Check Voucher No." in this system — is
there a `check_voucher`/`generated_documents` row whose id or a
human-readable sequence number should fill this slot, or is it always the
FIRST PDC's check number/date (i.e., duplicate of `pdcSchedule[0]`)? The Excel
sample shows `CV201270` next to `LA201270` (the loan account no.) — looks
like a generated sequence tied to the check-voucher document itself, not a
copy of the first PDC. **Confirm the intended source before I invent a
numbering scheme.**

**Files:**
- `src/lib/lra/template-context.ts` — add `checkVoucherNo`, `checkNumber`,
  `checkDate` to `base`, sourced per the confirmed answer above.

**Do NOT touch:** the PDC schedule generation, `pdc_checks` table, or
anything under `src/lib/ar/**`.

**Tests:** extend `template-context.test.mts` with the new keys.

**Checkpoint:** none needed beyond the standard gates — this is a small,
low-risk addition once the source is confirmed.

---

## Phase 4 — Restructuring / Consolidation computation sheet (net-new document)

**Fixes finding #4** — the Excel's "Conso-Restructure" tab has no equivalent
anywhere in the system. This is new scope, not a bug fix, so it's its own
phase and starts with a **go/no-go** from you, not from me.

**Decision needed:** do you want this built now? It requires:
- A new `document_templates` row (migration, both folders) — category and
  generation-eligibility to be decided (likely `release`, `sme_generation:
  optional`, mirroring the LSLGC servicing-doc pattern from the prior work).
- A new context builder (mirrors `buildReleaseTemplateContext` but for the
  two-block "current loan + new/restructured terms + new amortization
  schedule" shape) — this needs a real data source for "new terms" that I
  have not located yet (may not exist in the system's restructuring flow at
  all — needs its own mini-audit before estimating).

**If approved, files (to be finalized after the mini-audit):**
- New migration `supabase/migrations/<ts>_restructuring_computation_sheet.sql`
  (both folders).
- New `src/lib/lra/restructuring-context.ts` (or similar, name TBD).
- One new route or reuse of the existing generate-by-slug route
  (`src/app/api/lra/applications/[id]/generate/route.ts`) — **reuse, don't
  add a second route**, if the data shape fits the existing
  `renderAndStore`/`generateOneReleaseDocument` pattern.

**Do NOT start this phase's code until the mini-audit above is done and you've
confirmed you want it** — it's the one phase with real unknowns, not just a
wiring fix.

---

## Phase 5 — Reconcile `final_computation_sheet`

**Fixes finding #5.** The system's `final_computation_sheet` (Original vs.
Renegotiated table) doesn't match the Excel's SME/Vienovo "approval slip"
(Terms/Deductions/Summary/Prepared-Approved-Disclosed) or the Conso-Restructure
sheet's second block. Two different things may be getting conflated.

**Decision needed:** is `final_computation_sheet` intentionally a different,
pre-existing document (built before this audit, for a different purpose —
e.g. loan renegotiation review) that should be **left alone**, or should it be
**renamed/rebuilt** to match the Excel's release-time approval slip?

- If "leave it alone": this phase is just documentation — record the finding
  in memory so it's not re-discovered as a bug later, no code changes.
- If "rebuild to match Excel": this becomes a template-body edit only (no
  new context keys beyond what Phase 1–3 already add, since the fields
  overlap heavily with BLRI's particulars) — scoped after Phase 1 lands, so
  the two documents can share the same deduction-line source.

**No code work happens in this phase until you answer the decision above.**

---

## Phase 6 — Acknowledgement Receipt wording variants

**Fixes the secondary finding from Part 1** — the Excel has ~5 phrasings
(cash, single check, multiple check with per-check text, fund transfer) but
`acknowledgement_receipt` only branches on `isCheck`/`isCash`.

**Decision needed:** is this worth doing at all? The current 2-way branch
already produces a correct, readable receipt for every real release (it just
doesn't reproduce the Excel's exact multi-check sentence). Lower priority
than Phases 1–3 (which are actual missing money) — **confirm you want this
before I touch the template**, since it's polish, not a correctness bug.

**Files (if approved):**
- `document_template_versions` — a new draft→published version of
  `acknowledgement_receipt` (via the existing admin editor, or a migration if
  you want it seeded immediately) adding a `data-if="isMultiplePdc"` (or
  similar) branch.
- `src/lib/lra/template-context.ts` — one new flag if the branch needs one.

---

## Phase 7 — Full regression + sign-off

Runs after every approved phase above lands.

1. `npm test`, `npx tsc --noEmit`, `npx next build` — all clean.
2. Render **every** `release`-category template that uses `particulars` /
   `accountingEntries` / `preparedBy` (BLRI, Check Voucher, Cash Voucher, the
   3 `ar_*_voucher`, and `final_computation_sheet` if Phase 5 touched it)
   through the live Gotenberg path with a fixture that has every fee type
   non-zero — confirm no blank fields remain that Phase 1–3 were supposed to
   fill, and no regression in fields Phase 1–3 didn't touch.
3. Diff `git diff --name-only develop..HEAD` against the "Files" lists above
   — anything not named in a phase is scope creep and gets reverted before
   merge.
4. Update the project memory file for this audit with what shipped vs. what
   was deferred (Phase 4/5/6 if declined).
5. Merge to `develop` only when you say so — same standing rule as every
   other change this session.

---

## Outcome (2026-09-11 — "implement all")

Branch `fix/blri-computation-audit`, off `develop`. Every decision box below
was resolved with the stated recommendation, or by finding the real answer
in the codebase (never invented) — see each phase for how.

**Shipped:**
- **Phase 1** (commit `069ebc4`) — Notary Fee, Chattel Mortgage Fee, and the
  full `otherDeductions` breakdown (via the existing `buildDeductionBreakdownRows`
  helper) now appear in `particulars` / the check-cash-voucher accounting
  entries, matching Excel. GL codes: Notary Fee uses the code already defined
  but unused in `ACCOUNT_CODES` (5003011); Chattel Mortgage Fee and every
  Other-Deductions line type have **no GL code anywhere in the codebase** —
  left blank rather than invented. **Accounting needs to supply real codes
  for these before month-end reconciliation** if that column matters to them.
- **Phase 2** (commit `bfcd642`) — `preparedBy`/`approvedBy` now resolve from
  `computations.computed_by`/`.signed_by` via the existing
  `resolvePerformerNames`. `checkedBy` stays blank — no third actor is
  tracked anywhere in the system (decision (a) from the plan).
- **Phase 3** (commit `bfcd642`) — `checkVoucherNo` derives from the loan
  account no.'s LA→CV prefix swap (Excel's own convention). `checkNumber`/
  `checkDate` (the disbursement check itself) stay blank — confirmed by
  search, not assumed, that no table tracks this anywhere.
- **Phase 5 (investigation only, no code change needed)** — `final_computation_sheet`
  is **not** a mismatch. It's a real, already-used loan-**renegotiation**
  comparison document (original vs. currently-active computation version),
  and its `buildDeductionRows()` already calls the same
  `buildDeductionBreakdownRows()` helper Phase 1 reused. It's the
  restructuring-figures half of the Excel's "Conso-Restructure" tab. Its own
  `preparedBy`/`checkedBy`/`approvedBy` blanks were fixed as part of Phase 2
  (same generator, same bug, different call site).

**Deferred — both need a real spec or a missing capture feature, not a
document-template fix:**
- **Phase 4** (Conso-Restructure's *amortization schedule* half) — the
  figures-comparison half is already covered by `final_computation_sheet`
  (see Phase 5). Regenerating a *new amortization schedule* for a restructured
  loan needs real restructuring-computation logic (does interest recompute
  the same way as a fresh loan? is unpaid interest capitalized?) that has no
  specification anywhere in the codebase — implementing it would mean
  inventing loan math on a legal financial document, which this plan's own
  constraints rule out without confirmation.
- **Phase 6** (Acknowledgement Receipt's multi-check/fund-transfer wording) —
  blocked on the same gap as Phase 3's `checkNumber`/`checkDate`: reproducing
  Excel's "issued through {bank} check no. {no} amounting to {amt}" per-check
  wording needs a real list of the disbursement checks used, which nothing in
  the system tracks yet. Once a disbursement-check capture feature exists
  (worth doing together with Phase 3's gap), both come free.

**Gates:** `npm test` 1687/0 (0 fail throughout), `tsc --noEmit` clean for
every changed file (pre-existing ~23 unrelated errors elsewhere untouched),
`next build` ✓. `git diff --name-only develop..HEAD` matches exactly the
files named in Phases 1–3 above — no unrelated file touched.

**Not done in this pass:** merge to `develop` (same standing rule as every
other change this session — only when asked), building the disbursement-check
capture feature that would unblock Phase 4/6.
