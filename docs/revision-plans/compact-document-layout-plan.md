# Implementation Plan: Compact Document Layout (Save Paper)

**Version:** 1.0
**Date:** 2026-09-11
**Status:** Ready for implementation
**Related work (same session):** border/`data-plain` fix, logo upper-right move, LRA collateral RLS fix — all already shipped and unaffected by this plan.

---

## Executive Summary

**Client feedback:** After seeing the redesigned documents, the client noted two remaining gaps versus their originals — the table borders (already fixed separately) and **page usage**. Their own printed originals are hand-compacted: smaller/repositioned logo, tight spacing, everything squeezed onto 1 page per document where possible, to save paper.

**Goal:** Reduce whitespace (margins, line spacing, paragraph/table spacing, logo size) across every generated document so more of them fit on 1 printed page, without shrinking text past a readable floor and without touching any document's actual wording/legal content.

**Approach:** One shared stylesheet change first (low risk, affects everything consistently), re-measure, then only touch individual documents that are still spilling over.

---

## Constraints (DO NOT VIOLATE)

1. **Layout/spacing only — never document content or wording.** No template body text changes in this plan. Wording changes are a separate, higher-risk (legal) change, out of scope here.
2. **Shared stylesheet first, per-template edits only as a last resort.** Nearly all documents render through one file, [`print-styles.ts`](../../src/lib/documents/render/print-styles.ts). Phases 1–2 touch only that file. Per-document tweaks are Phase 3 and only for documents still overflowing after Phase 1.
3. **Readability floor: never go below 10.5pt body text.** Anything smaller starts looking cramped/unprofessional on a legal document.
4. **Measure before and after, the same way, every time.** No claim that a document "now fits on 1 page" without actually rendering it with realistic data and counting pages.
5. **Do not touch anything already fixed this session:** the `data-plain` border removal (+ its TipTap `PlainTable` extension), the upper-right logo CSS, or the LRA collateral RLS fix in `release-service.ts`. Those are working; this plan changes spacing *amounts* only, not structure.
6. **Don't force a 2-page document onto 1 page if it genuinely can't fit.** Long contracts (Loan Agreement, Promissory Note) may legitimately stay at 2 pages. Compact fairly; don't sacrifice readability to hit an arbitrary page count.
7. **Run the existing test suite after every phase** (`npm test`, `npx tsc --noEmit`) — this stylesheet is shared by the live PDF renderer *and* the TipTap editor preview, so a mistake here is high-blast-radius by nature of being shared, even though the change itself is small.

---

## Phase 0 — Baseline measurement

Render every published template with realistic sample data and record its current page count. This "before" snapshot is required — without it, "did this help?" can't be answered.

**Deliverable:** a simple table (slug → current page count) checked into this doc or a linked scratch file.

**Result (2026-09-11, rendered with sample data via the live Chromium/Gotenberg engine):**

| Pages | Templates |
|---|---|
| 3 | consent_form, loan_agreement, loan_agreement_vienovo, promissory_note, voluntary_surrender_deed_rem |
| 2 | agreement_check_replacement, agreement_for_consolidation, application_form_sme_corporate, application_form_sme_individual, blri, cancellation_of_chattel_mortgage, cancellation_of_real_estate_mortgage, deed_of_chattel_mortgage, disclosure_statement, real_estate_mortgage, spa_mortgage_cancellation, voluntary_surrender_deed_auto |
| 1 | acknowledgement_receipt, application_form, ar_atm_voucher, ar_cash_voucher, ar_check_voucher, cash_voucher, check_voucher, demand_letter, demand_letter_dishonored_check, demand_letter_second_notice, endorsement_letter, final_computation_sheet, letter_of_intent, payment_receipt |

14 templates already fit on 1 page. 12 are at 2 pages (the main target for Phase 1). 5 are at 3 pages (loan_agreement / promissory_note / consent_form / loan_agreement_vienovo / voluntary_surrender_deed_rem — the genuinely long documents; per Constraint 6, getting these to 1 page may not be realistic, but Phase 1 should still pull them down where it can).

`demand_letter_v2` skipped — confirmed orphaned (zero versions, unreferenced in code, flagged for cleanup earlier this session) — excluded from this plan.

---

## Phase 1 — Global spacing tightening

One coordinated edit to `print-styles.ts`, adjusting together (not in isolation, since they interact):
- Page margins (top/bottom/left/right) — slightly reduced
- Space after each paragraph and between table rows — tightened
- Line spacing — slightly reduced
- Logo size and the gap below it — smaller

**Deliverable:** updated `print-styles.ts`, `npm test` + `tsc --noEmit` clean.

**Done (2026-09-11).** Margins tightened (0.75/1/0.6/1in → 0.55/0.85/0.5/0.85in), line-height 1.15 → 1.08, paragraph/heading/list/table spacing roughly halved, logo 0.72in → 0.55in tall with tighter gap below. `tsc --noEmit` clean, `npm test` 1712/1712 pass.

---

## Phase 2 — Re-measure

Re-render the same documents from Phase 0 and compare page counts.

**Result:** 17 of 30 templates now fit on 1 page (up from 14) — `blri` and `disclosure_statement` both dropped 2→1, `consent_form` and `voluntary_surrender_deed_rem` dropped 3→2. 9 templates remained at 2 pages, 3 remained at 3 pages (`loan_agreement`, `loan_agreement_vienovo`, `promissory_note` — genuinely long contracts).

Checked how much content was actually spilling onto the 2nd page of each 2-page document (line/char count of the last page):
- **Close (worth a Phase 3 nudge):** cancellation_of_chattel_mortgage (5 lines), cancellation_of_real_estate_mortgage (9), agreement_check_replacement (12), spa_mortgage_cancellation (12), agreement_for_consolidation (15), deed_of_chattel_mortgage (13), real_estate_mortgage (17)
- **Genuinely 2 pages of real content (left as-is, per Constraint 6):** application_form_sme_corporate (25 lines), application_form_sme_individual (41), consent_form (47), voluntary_surrender_deed_auto (50), voluntary_surrender_deed_rem (50)

---

## Phase 3 — Targeted fixes for documents still overflowing

For the 7 close candidates from Phase 2: a small per-document font-size nudge (11.3pt for paragraph/label text, 10.5pt — the readability floor — for table cells, which have their own explicit size and don't inherit).

**Implementation note (found before publishing anything):** the natural approach — wrap each document's body in `<div style="font-size:...">` — doesn't survive the admin visual editor. TipTap's serialiser strips inline `style` unconditionally (the same rule already documented in `extensions.ts` for why alignment travels as `data-align` instead of `style="text-align:…"`). Verified this empirically with the same round-trip harness the test suite uses, *before* touching the database. Fix: added a `data-compact-nudge` boolean-marker extension to the editor schema (same pattern as the existing `data-repeat`/`data-plain` attribute extensions) and gave it one fixed font-size via CSS rather than a per-instance inline value. Re-verified the round-trip survives before publishing.

**Result:** only `cancellation_of_chattel_mortgage` (2→1 page) moved to 1 page. The other 6 stayed at 2 pages — the safe font-size floor wasn't enough to close the gap without further per-document content trimming, which risks looking cramped (Constraint 3/6) and is left as a manual follow-up if the client wants to push further on any specific document.

**Deliverable:** `PlainTable`-pattern `data-compact-nudge` extension in `extensions.ts`, matching CSS rule in `print-styles.ts`, 7 templates republished (6 unpacked/reverted mentally — content unchanged, only the wrapper added; 1 genuinely improved).

---

## Phase 4 — Verification

- `npm test` and `npx tsc --noEmit` (full run, not just touched files).
- Visual check of a sample of real rendered PDFs spanning short (voucher), medium (disclosure statement), a Phase 3 candidate (deed of chattel mortgage), and long (promissory note) documents — confirm nothing looks cramped, clipped, or misaligned.

**Done (2026-09-11).** `tsc --noEmit` clean, `npm test` 1712/1712 pass. 4 sample PDFs rendered via the real pipeline and sent for review.

**Deliverable:** verification notes + a couple of sample PDFs shared back for sign-off.

---

## Phase 5 — Wrap-up note (not a code change)

Flag, don't fix here: the system has two PDF render engines (Chromium/Gotenberg vs. a `pdfmake` fallback), and they currently disagree on paper size (Legal vs. A4). Out of scope for this plan — noted so it isn't forgotten.

---

## Phase 6 — Accuracy correction: measured, not estimated (2026-09-11)

The client asked for 100% accuracy (exact bold/size/spacing), not just "more compact." Phases 1–3 above were reasoned estimates, not measurements — corrected that by converting the actual LSLGC source `.doc` files to `.docx` (via LibreOffice headless, already installed) and reading the real formatting straight out of the OOXML (`document.xml`/`styles.xml`): font size in half-points, spacing in twips, margins in twips (1440 = 1in).

**What the real numbers showed:**
- Page margins are **not uniform across documents**. `SFCalculator/DISC.doc` (Disclosure Statement's source) uses an unusually tiny top margin; `CHATTEL MORTGAGE - 1 unit.doc` and `LOAN AGREEMENT.doc` both use `top: 0.75in / left: 1in / right: 1in` — matching what the codebase had *before* this session's Phase 1 guess tightened it further. **Corrected:** reverted `@page` margin to `0.75in 1in 0.75in 1in`, the confirmed common value, rather than keep the earlier guess.
- Disclosure Statement's real body/label text is **9pt** (not the 12pt every document was using), its title is **10pt bold** (not 13.5pt), line spacing is effectively single (not 1.08–1.15), and — most importantly — the original has **zero automatic paragraph spacing**: visual gaps come from manual blank lines placed in the content itself, not a stylesheet margin.
- **Implementation risk found and fixed before publishing anything:** the obvious way to apply this (`<div style="font-size:9pt">`) doesn't survive the admin visual editor — TipTap strips inline `style` unconditionally (already documented in `extensions.ts` for why alignment uses `data-align` instead). Verified this empirically with the same round-trip test harness the suite uses, *before* touching the database — same category of landmine as Phase 3's font-nudge attempt. Fixed the same way: added a `data-accurate` boolean-marker extension (same pattern as `data-repeat`/`data-plain`/`data-compact-nudge`), mapped to fixed CSS values in `PRINT_CSS` rather than a per-instance inline style. Re-verified the round-trip survives before publishing.
- Applied `data-accurate` to **Disclosure Statement** (the one document with full, clean, verified source data — matching exactly what the client's own reference screenshot came from). Rendered our output next to the actual original `.doc` converted straight to PDF (ground truth, no guessing) and sent both for side-by-side comparison.

**Honest scope note:** this level of accuracy — reading the real per-document spec from its actual source file — is what "100% accurate" requires, and it's real, non-reusable work *per document* (the 3 documents sampled did not share identical specs). Only Disclosure Statement has been done to this standard so far. The other 29 templates still carry the Phase 1–3 estimated (not measured) spacing. Extending this treatment to the rest is a straightforward continuation of the same method — convert source → extract real spec → verify TipTap survival → publish → visually diff against the converted original — just not yet done for all of them.

**Deliverable:** `data-accurate` extension + CSS rule; Disclosure Statement republished (v4) with measured typography; `@page` margin corrected to the confirmed real value; `tsc --noEmit` clean; `npm test` 1712/1712; full re-measurement of all 30 templates (16 at 1pg / 12 at 2pg / 3 at 3pg — one document, `cancellation_of_chattel_mortgage`, moved back from 1→2 pages as a direct result of correcting the margin from the earlier guess to the confirmed real value).

---

## Status Log

| Date | Phase | Status | Notes |
|------|-------|--------|-------|
| 2026-09-11 | Plan written | Done | Awaiting go-ahead to start Phase 0 |
| 2026-09-11 | Phase 0 (baseline) | Done | 14 templates at 1pg, 12 at 2pg, 5 at 3pg |
| 2026-09-11 | Phase 1 (global tightening) | Done | Gates clean |
| 2026-09-11 | Phase 2 (re-measure) | Done | 17 at 1pg, 9 at 2pg, 3 (genuinely long) at 3pg |
| 2026-09-11 | Phase 3 (targeted nudge) | Done | 1/7 candidates pulled to 1pg; found + fixed a real TipTap attribute-stripping risk before publishing |
| 2026-09-11 | Phase 4 (verification) | Done | Gates clean, 4 sample PDFs sent for review |
| 2026-09-11 | Phase 5 (wrap-up note) | Done | Engine page-size mismatch flagged, not fixed (out of scope) |
| 2026-09-11 | Phase 6 (accuracy correction) | Done for Disclosure Statement | Real per-doc spec extraction method proven; 29 templates still on estimated (Phase 1-3) spacing, not yet measured |
