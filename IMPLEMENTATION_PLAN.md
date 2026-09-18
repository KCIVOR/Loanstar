# Implementation Plan — Document Fidelity Fixes

**Based on:** [`docs/revision-plans/document-fidelity-audit.md`](docs/revision-plans/document-fidelity-audit.md)
**Status:** Plan only. Nothing has been changed yet. Waiting for sign-off before any phase starts.

## Scope — the audit is now complete for every document that can be audited

18 of 30 active templates have a real, usable source file and have all been fully audited (source-vs-system, evidence shown for every claim). This plan now covers all of them. The remaining 12:
- **11 have no source file at all** (vouchers, application forms, BLRI, letter of intent, acknowledgement receipt, payment receipt, final computation sheet, endorsement letter) — cannot be fidelity-audited; out of scope for this plan (see Phase 8).
- **`demand_letter`** — resolved as "not applicable": every real candidate file turned out to be a variant of two *other* templates already audited (`demand_letter_dishonored_check`, `demand_letter_second_notice`). Its own table/stage-based design isn't modeled on any real document, so it can't fail a fidelity check against a source it was never meant to replicate.

Two documents (`promissory_note`, `consent_form`) have multiple real sources that are genuinely different documents, not variants of one — these need your decision before any fix is meaningful (Phase 7). `loan_agreement`'s `DTI` variant borrower paragraph also remains unchecked (noted in Phase 1, not blocking).

---

## Phase 0 — Legal-identity / factual errors (unambiguous, no judgment calls)

These change what a document actually says or asks for — not formatting. Every item here is a clear-cut fix: the audit's evidence leaves no ambiguity about what's wrong.

| Document | Fix | Source says | System currently says |
|---|---|---|---|
| disclosure_statement | Field label | `"Name of Company"` | `"Representative:"` |
| disclosure_statement | Line item (a) | `"Security Fee"` | `"CM Fee"` |
| loan_agreement | Acknowledgement sentence | a real page-count number (e.g. `"three (3) pages"`) | **nothing** — literally renders `"...consisting of pages including this page..."`, broken English in every generated Loan Agreement today |
| loan_agreement | Security clause 4.1 (individual/auto borrowers) | no mention of a company officer — `"...plus One (1) signed but undated check..."` | always says `"...plus One (1) personal check of the company President/Treasurer, signed but undated..."`, even for a borrower who isn't a company |

**Documents in scope:** `disclosure_statement`, `loan_agreement`.

**Files to touch:** the two templates' bodies in `document_template_versions`, published via the same `publishVersion` service-function path used all session (no ad-hoc SQL string edits).

**Will NOT touch:** any other template, `print-styles.ts`, `extensions.ts`, any merge-field or rendering code. The `loan_agreement` officer-reference fix needs a conditional (`hasSecurityCheck` **and** `isCorporateBorrower`, not `hasSecurityCheck` alone) — that's a template-body logic change, not new code.

**Blocking decision:** none. All four are unambiguous.

**Status: DONE.** All 4 fixes published, verified against the live published bodies, `tsc`/`npm test` clean (1712/1712), TipTap round-trip confirmed safe for the new conditional span.

---

## Phase 1 — Conclusion on "shared root-cause" candidates: mostly resolved, not shared

The original plan (written after only Disclosure Statement was audited) flagged 3 patterns as *possibly* systemic and deferred judgment until more documents were checked. All 18 are now checked. Here's what actually held up:

- **Label-bolding convention** (Disclosure Statement bolds field labels the source doesn't): checked against AR ATM Voucher, Agreement for Check Replacement, Loan Agreement, and others — **not a consistent rule across documents**. Some sources bold filled values, some underline them, some do neither, and Disclosure Statement's own source isn't even internally consistent about it. **No shared CSS fix.** This stays a per-document decision, folded into each document's own phase below.
- **Bold-filled-amounts convention**: same conclusion — genuinely inconsistent both across and within source documents. Not fixable as one rule.
- **Co-borrower signature block**: confirmed this is **not a global gap** — `promissory_note`'s template already has a proper two-signatory (`{{borrowerName}}` / `{{coBorrowerName}}`) block. It's specifically `disclosure_statement` that's missing it, and the fix is to bring Disclosure Statement in line with the pattern the system already uses elsewhere (Phase 2), not a new shared component.

**No Phase 1 code change results from this.** Moving straight to per-document phases, ordered by risk (highest first, per your instruction).

---

## Phase 2 — Loan Agreement: missing payment-structure clauses (highest remaining risk)

**Why highest priority:** this isn't a wording gap — for 3 of the loan's real payment structures, the generated document currently states **the wrong payment terms** to the borrower.

| Loan type | Real structure | In system today |
|---|---|---|
| Bi-Monthly | Payment split into two half-installments a month, first half due 15 days post-release | Not present — only standard once-a-month text exists |
| Per-Day Interest | Single one-time payment, daily-prorated interest, single PDC | Not present — only standard monthly-installment text exists |
| Invoice financing | Tiered weekly interest (1%/2%/2.5% by month), due when invoice clears, single guaranty check pegged to invoice value | The `hasInvoiceAnnex` conditional only adds a table of invoice numbers — Clause 2/3's payment-terms text is unchanged, so it still describes standard monthly installments next to the invoice table |

The system's own merge-field list already declares `if Bi-monthly amortization schedule` and `if Per-day (prorated) interest, one-time payment` conditionals — this was scaffolded once and never finished being wired into the template body.

**Documents in scope:** `loan_agreement` only.

**Files to touch:** `loan_agreement` template body — adding 2 new conditional clause blocks (Bi-Monthly, Per-Day) and rewriting the Invoice-financing branch's Clause 2/3 text, not just its table.

**Will NOT touch:** `loan_agreement_vienovo` (separate template, already a clean PASS — not touching a working document to "improve" it) or any other template.

**Blocking decision:** none for wording (source text is unambiguous for each variant) — but this is the largest single content addition in the whole plan, worth your explicit review of the drafted clause text before publishing, given it's legal payment terms.

**Status: DONE**, with one real technical finding along the way. My first implementation attempt (nested `data-if`/`data-unless` spans to express "standard = none of Bi-Monthly/Per-Day/Invoice") **did not survive the TipTap editor round-trip** — verified this *before* publishing (never assumed it was safe), caught it, and stopped to ask before expanding scope. You approved adding one computed field (`isStandardSchedule`) to `template-context.ts`. Rebuilt using single-condition-per-paragraph (the pattern already proven safe elsewhere in this document), re-verified round-trip for all 4 branches, published, and rendered real PDFs for all 4 loan types — each confirmed to show its own correct clause text via direct PDF text extraction, sent to you for review.

**Files actually touched (vs. plan):** `loan_agreement` template body (as planned) + `src/lib/lra/template-context.ts` and `src/lib/documents/templates/fields.ts` (the approved scope expansion — one computed boolean field each).

**Important caveat carried forward, not fixed here:** `isBiMonthly`, `isPerDayInterest`, and `hasInvoiceAnnex` are still hardcoded to `false` in `template-context.ts` — they were before this phase too. The clause text is now correct and will activate the moment those flags are wired to real payment-frequency data; wiring them is a separate task (touches computation/release logic, not template content) and was not in this phase's scope.

---

## Phase 3 — Disclosure Statement: remaining fixes

**Audit items covered:** wording/capitalization fixes, the missing per-installment amount field, footer punctuation/bold, and bringing the signature block in line with the co-borrower pattern `promissory_note` already uses (per Phase 1's conclusion).

| Fix | Source | System currently |
|---|---|---|
| Capitalization | `"p.m. From July 2026..."` | `"p.m. from {{disclosureFromDate}}..."` |
| Legal citation wording | `"...(Computed in accordance with Sec. 2 (I) of CB Circular 158)"` | `"(per Sec. 2 (I), CB Circular 158)"` |
| Missing data point | Per-installment amount shown (`"at Php 11,229.76"`) | Not shown — the `Per-check amount` merge field already exists, just not wired into this template |
| Footer punctuation/bold | No trailing period, not bold | Trailing period added, wrongly bolded |
| Signature block | Borrower + co-borrower, each with their own "Signature Over Printed Name" line | One 2-column table (Borrower / Representative), no co-borrower line |

**Documents in scope:** `disclosure_statement` only.

**Files to touch:** `disclosure_statement` template body only.

**Decisions (answered):** (1) match the source's own inconsistency exactly — bold only the specific fields the source bolds; (2) keep the corrected text, don't replicate the typo; (3) static boilerplate checkboxes only, no computed logic.

**Status: DONE.** All 5 items published (v6), plus the co-borrower signature-block restructure from Phase 1's conclusion (stacked/centered Borrower + Co-Borrower blocks, gated on the existing `hasCoBorrower` flag — matches the real source's actual layout, not a copy of Promissory Note's table layout, which is structurally different). TipTap round-trip verified both with and without a co-borrower before publishing. `tsc`/`npm test` clean. Real PDF rendered and sent for review.

---

## Phase 4 — AR ATM Voucher: rebuild to match source

**Audit items covered:** all 6 FAILs — this document needs the most substantial rework of any single document besides Loan Agreement's Phase 2.

| # | Fix |
|---|---|
| 1 | Bold + underline on name, address, loan amount, terms, dates (currently plain) |
| 2 | Title size (14pt in source; no accuracy-scope wrapper applied at all currently) |
| 3 | Card-detail table: add PIN, Account Type, Initial Balance, Remarks rows (currently only Bank Name + Card Number) |
| 4 | Add the missing waiver clause (`"I further manifest, that I hereby waive all my rights..."`) |
| 5 | Rebuild signer block as two columns (Borrower / Received By), each with an italic "(Signature Over printed Name)" caption |
| 6 | Remove the execution place/date line — not present in the source at all |

**Documents in scope:** `ar_atm_voucher` only. (Note: `AR ATM - With Spouse.doc` is a separate, unrepresented variant — not in scope for this phase; flagging it stays a Part-1 item, not something to silently fold in here.)

**Files to touch:** `ar_atm_voucher` template body. Given the size of the rewrite, may also need a new `data-accurate`-style scope if the 14pt title size doesn't fit the existing `data-compact-nudge`/`data-accurate` scales — will use whichever already-built mechanism fits rather than inventing a new one, and will say explicitly if neither fits.

**Blocking decision:** none — every fix is unambiguous against the source.

**Status: DONE.** All 6 items rebuilt, verified round-trip-safe (bold+underline combined on filled values, a new nested-italic signature caption, and the two-column signer block all confirmed to survive) before publishing. Kept the new PIN/Account Type/Initial Balance/Remarks rows as blank hand-fill cells, matching the *existing* Bank Name/Card Number convention already used in this template — no new merge fields were needed, so no scope expansion this time. One honest limitation: the source's 14pt title size doesn't match any existing scope (`data-accurate`=10pt, `data-compact-nudge`=11.3pt, both smaller); left it at the default h3 (12pt) rather than invent a new CSS scope for one document's title — flagging this rather than silently claiming an exact match. `tsc`/`npm test` clean. Real PDF rendered and sent for review.

---

## Phase 5 — Remaining SME/segment documents, smaller fixes

Grouped together because each is small (1–3 items) and independent — still one document = one reviewable change when executed, not a batch commit.

| Document | Fix |
|---|---|
| spa_mortgage_cancellation | Vehicle table missing a "Body Type" field entirely; Year Model should be its own column, not merged into Make/Series |
| voluntary_surrender_deed_auto / _rem | Source always shows a fixed "one (1) month" redemption period as boilerplate text, not a blank — system treats it as an editable `{{redemptionPeriod}}` field. Needs your confirmation: is this meant to be editable per loan, or should it become fixed text? |
| demand_letter_dishonored_check | Personalize `"Dear Sir/Madam,"` → the actual borrower's name (source always does this); "Said checks" → "Said Check" (source wording) |
| demand_letter_second_notice | Fix subject-line size/structure (currently collapsed into one line at the wrong scale); bold the borrower's name in the "Dear" line |
| agreement_check_replacement | Tense mismatch ("released on" vs source's "to be released on") — flagging as a judgment call, source itself may be inconsistent about this |
| agreement_for_consolidation | Title size doesn't match source's 14–15pt (currently 11.3pt via `data-compact-nudge`) |

**Documents in scope:** the 6 listed above.

**Files to touch:** each document's own template body only.

**Blocking decision:** the redemption-period fixed-vs-variable question for the two Voluntary Surrender documents — **answered: keep it editable**, no change made (the one sample checked showing "one (1) month" doesn't prove it's universal policy, so leaving `{{redemptionPeriod}}` as a real merge field was the safer call).

**Status: PARTIALLY DONE.**
- ✅ `demand_letter_dishonored_check` — salutation personalized (`Dear {{borrowerName}},` instead of generic "Dear Sir/Madam,"), "Said checks" → "Said Check" to match source. Published, round-trip verified, gates clean.
- ✅ `demand_letter_second_notice` — subject line split into its own heading matching the source's line break, borrower's name now bold in the "Dear" line. Published, round-trip verified, gates clean.
- ⏸️ `voluntary_surrender_deed_auto` / `_rem` — no change, per the answered decision above.
- ⏸️ `spa_mortgage_cancellation` — **not fixed.** Adding the missing "Body Type" field and splitting Year Model into its own column requires a genuinely new shared vehicle-data field (the `vehicles` field group used by 7+ documents has no `bodyType` today, and splitting `makeYearModel` would change a convention shared across all of them). That's real scope expansion beyond one template's body, same category as Phase 2's — stopping to flag rather than force it in.
- ⏸️ `agreement_check_replacement` — tense mismatch left alone. The source itself may be self-inconsistent here (a "replacement" document describing an already-active loan as "to be released"); the system's current "released on" reads more sensibly, so I didn't change working text to match a source that's plausibly wrong.
- ⏸️ `agreement_for_consolidation` — title-size gap left alone, same reasoning as AR ATM Voucher's title: source wants ~14-15pt, no existing scope matches (`data-compact-nudge` gives 11.3pt), and inventing a new CSS scope for one document's title is disproportionate. Flagged, not forced.

---

## Phase 6 — Confirmed-correct, no action

Listed so nothing here gets revisited by mistake later — these already PASS:

- `deed_of_chattel_mortgage`, `real_estate_mortgage`, `cancellation_of_chattel_mortgage` — both conditional branches (individual / corp-DTI) confirmed correct against real sources.
- `cancellation_of_real_estate_mortgage` — the source itself is self-contradictory (says "chattel mortgage" in its opening clause by copy-paste error); the system is already correct and should **not** be changed to match the source's mistake.
- `loan_agreement_vienovo` — strongest PASS in the whole audit; every clause checked matches near-verbatim.

Several other documents also had the system found **more correct than the source** (a real-estate mortgage that would otherwise wrongly call land "personality," a cancellation acknowledgement that would otherwise wrongly reference "the Loan Agreement," a title that would otherwise say "KNOWN ALL MEN" instead of "KNOW ALL MEN") — none of these are being changed to match a source error.

---

## Phase 7 — Needs your decision before any fix is possible

- **`promissory_note`**: Seafarer (`PN.doc`) and SME (`PN - MPL.doc`) sources are genuinely different documents (different legal structure, different paragraph count, different emphasis convention). Split into two templates, or pick one as canonical?
- **`consent_form`**: 3 sources (base, Corp, Individual) — the "Individual" variant shows two separate signature blocks the system's binary `isCorporateBorrower` conditional can't represent, and the "base" file's own signature block is ambiguous. Needs your read on what the Individual variant's second signer represents before a fix can be scoped.
- **`loan_agreement` DTI variant**: borrower-identity paragraph not yet distinguished from the standard corporate paragraph in the one sample checked — may need another source sample to resolve, not strictly blocking Phase 2/0 but flagged so it isn't forgotten.

---

## Phase 8 — Out of scope for this plan

The 11 documents with no real source file (`ar_cash_voucher`, `ar_check_voucher`, `cash_voucher`, `check_voucher`, `blri`, `letter_of_intent`, `acknowledgement_receipt`, `endorsement_letter`, `payment_receipt`, `final_computation_sheet`, `application_form` + its corporate/individual variants) cannot be fidelity-audited — there's nothing to compare against. If you want these reviewed, it would be a different kind of task (internal consistency / legal review), not covered here.

---

## What happens after your sign-off

Per your instructions: one phase at a time, stop for sign-off between phases, minimal diff only — fix exactly what's flagged, nothing else (anything else noticed gets reported, not touched), touch only the files named in each phase, re-verify each document against its real source immediately after fixing (before/after values shown, same method as the audit), run tests after every change and stop on any failure, one document = one reviewable change. Report per phase: what changed, test results, exact files touched against this plan, anything found but left alone. No "done" claim without a clean 100% PASS backed by the comparison data.
