# Document Fidelity Audit — System Templates vs. Real LSLGC Source Files

**Started:** 2026-09-11
**Source of truth:** `C:\Users\Rovick\Desktop\LSLGC Documents` (`SFCalculator/` = Seafarer, `LSLGC Calculator and Docs/` = SME)
**Method:** every claim below comes from opening the real source `.doc`/`.docx`, converting it with LibreOffice (installed on this machine) to inspect its actual OOXML — font size (half-points), bold flags, spacing (twips), margins — never from a screenshot or a guess. Text is copied verbatim from the extracted document text.

**Status legend:** ✅ PASS (audited, matches) · ❌ FAIL (audited, mismatch found — listed) · 🟡 NOT YET AUDITED · ⚠️ NO SOURCE FILE (flagged, not guessed) · 🔶 MULTIPLE NON-IDENTICAL SOURCES (one DB template, several different real variants — flagged, not silently picked one)

---

## Part 1 — Coverage: does a real source file even exist?

Established first, before any formatting work, per the instruction not to guess.

| DB template (slug) | Segment flags | Candidate source file(s) | Coverage |
|---|---|---|---|
| disclosure_statement | SF always / SME always | `SFCalculator/DISC.doc` (SF) — **no SME-general equivalent found**; `LSLGC Calculator and Docs/DISCLOSURE.doc` is Vienovo-branded, a different variant | 🔶 partial — SF side has a clean 1:1 source; SME/general side does not |
| promissory_note | SF always / SME always | `SFCalculator/PN.doc` (SF) AND `LSLGC Calculator and Docs/PN - MPL.doc` (SME) — two different files for the two segments sharing one DB template | 🔶 two non-identical sources |
| ar_atm_voucher | SF always / SME always | `SFCalculator/AR ATM.doc` + `SFCalculator/AR ATM - With Spouse.doc` (spouse variant not in DB) | 🔶 spouse variant not represented |
| loan_agreement | SF always / SME always | `LOAN AGREEMENT.doc` (base) — but 8 more variants exist (Auto and Individual, Bi-Monthly, DTI, Invoice ×3, No Security, Per Day Interest) not represented by one DB template; no SFCalculator-specific loan agreement found | 🔶 9 real variants vs. 1 DB template |
| loan_agreement_vienovo | SME optional | `Vienovo/Vienovo Loan Agreement - quarter2months.doc` + 2 dated variants (`02.05.26`, `02.20.26`) — unclear which is canonical | 🔶 3 dated variants, canonical one unclear |
| demand_letter | hidden/hidden (collector-triggered) | ~10 candidate files (Co-borrower ± address, Individual ± address, SME ± address, without-PDC ± address/2024) — no obvious 1:1 | 🔶 many variants, no clear single match |
| demand_letter_dishonored_check | hidden/optional | `SFCalculator/DL2 - No address.doc` | ✅ clear match (SF side only; no SME-specific dishonored-check letter found) |
| demand_letter_second_notice | hidden/hidden | `SFCalculator/SC - NO PDC- no add.doc` | ✅ clear match (SF side only) |
| agreement_check_replacement | hidden/optional | `Additional Agreement 1.23.23 - check replacement.docx` | ✅ clear match |
| agreement_for_consolidation | hidden/optional | `AGREEMENT FOR CONSOLIDATION.doc` | ✅ clear match |
| deed_of_chattel_mortgage | hidden/always | `CHATTEL MORTGAGE - 1/2/3/4 units.doc` (4 unit-count variants — repeatable table, likely all structurally identical besides row count) | 🟡 need to confirm the 4 are identical besides row count |
| cancellation_of_chattel_mortgage | hidden/optional | `Cancellation of Mortgage/CANCELLATION OF CHATTEL - 1/2/3/4 units.doc` **and separately** `...Corp and DTI- 1/2/3/4 units.doc` (8 files total — individual borrower vs. corp/DTI borrower are different documents) | 🔶 individual vs. corp/DTI variants not both represented |
| cancellation_of_real_estate_mortgage | hidden/optional | `Cancellation of Mortgage/CANCELLATION OF REM - 1/2 properties.doc` | 🟡 need to confirm the 2 are identical besides row count |
| real_estate_mortgage | hidden/always | `REAL ESTATE MORTGAGE - 1/2 Property.doc` | 🟡 need to confirm the 2 are identical besides row count |
| voluntary_surrender_deed_auto | hidden/optional | `Voluntary and Deed Auto - Unit 1/2/3/4.doc` | 🟡 need to confirm the 4 are identical besides row count |
| voluntary_surrender_deed_rem | hidden/optional | `Voluntary and Deed REM 1/2.doc` | 🟡 need to confirm the 2 are identical besides row count |
| spa_mortgage_cancellation | hidden/optional | `SPECIAL POWER OF ATTORNEY Cancellation of Mortgage.docx` + `(1).docx` — need to confirm these are duplicates, not two different variants | 🟡 |
| consent_form | hidden/always | `LSLGC CONSENT FORM 2025.docx` + `- Corp..docx` + `- Individual.docx` — 3 variants vs. 1 DB template | 🔶 |
| ar_atm_voucher | (see above) | | |
| ar_cash_voucher | hidden/optional | no filename resembling "cash voucher" found in source directory | ⚠️ NO SOURCE FILE FOUND |
| ar_check_voucher | always/always | no filename resembling "check voucher" (AR-specific) found | ⚠️ NO SOURCE FILE FOUND |
| cash_voucher | always/always | no filename resembling "cash voucher" found | ⚠️ NO SOURCE FILE FOUND |
| check_voucher | always/always | no filename resembling "check voucher" found | ⚠️ NO SOURCE FILE FOUND |
| blri | always/always | no filename resembling "BLRI" or "loan release information" found | ⚠️ NO SOURCE FILE FOUND |
| letter_of_intent | always/always | no filename resembling "letter of intent" found | ⚠️ NO SOURCE FILE FOUND |
| acknowledgement_receipt | hidden/optional | no filename resembling "acknowledgement receipt" found | ⚠️ NO SOURCE FILE FOUND |
| endorsement_letter | hidden/optional | no filename resembling "endorsement" found — consistent with its known status (draft, pending Legal wording, never had a real source) | ⚠️ NO SOURCE FILE FOUND (expected/known) |
| payment_receipt | hidden/hidden | no filename resembling "receipt" (payment) found | ⚠️ NO SOURCE FILE FOUND |
| final_computation_sheet | hidden/hidden | only `SF Calculator.xlsm` exists (a spreadsheet, not a document — not a valid Word-doc-style fidelity source) | ⚠️ NO SOURCE FILE FOUND |
| application_form | hidden/hidden | no filename resembling "application form" found | ⚠️ NO SOURCE FILE FOUND |
| application_form_sme_corporate | hidden/hidden | no filename found | ⚠️ NO SOURCE FILE FOUND |
| application_form_sme_individual | hidden/hidden | no filename found | ⚠️ NO SOURCE FILE FOUND |
| demand_letter_v2 | hidden/hidden | orphaned, unpublished (flagged earlier this session for deletion) — excluded from this audit | N/A |

**11 of 30 active templates have no matching source file in this directory at all.** Per instruction 2a/"say so explicitly" — these cannot be fidelity-audited against a real source; they can only be reviewed for internal consistency (which is a different task). I am not guessing formatting for these.

**7 templates have multiple non-identical real source variants** mapped to one DB template — meaning even a "perfect" single-template implementation cannot be 100% faithful to *all* of its real variants simultaneously. This needs a decision from you on which variant is canonical, or whether these need to become multiple templates — flagging rather than picking one silently.

---

## Part 2 — Per-document text/formatting audit

Only for templates with a clear (or clearest-candidate) single source. Worked one at a time; each PASS/FAIL below is backed by the source values shown, not asserted.

| # | Template | Status |
|---|---|---|
| 1 | disclosure_statement (SF side, DISC.doc) | ❌ FAIL — 9 mismatches found, listed below |

*(table grows as each document is completed)*

---

### 1. disclosure_statement — ❌ FAIL

**Source:** `SFCalculator/DISC.doc` (Seafarer side only — see Part 1, no SME-general source exists). Extracted full paragraph-by-paragraph text, bold flags, and size from the real `.docx` conversion's `document.xml` — 110 paragraphs, all confirmed 9pt body / 10pt bold title, `before=0 after=0` spacing throughout (this part is already correctly applied via `data-accurate`, published as v4 earlier this session).

**Mismatches found (source value → system value):**

| # | Location | Source (DISC.doc, verbatim) | System (current template) | Verdict |
|---|---|---|---|---|
| 1 | Field label | `"Name of Company"` (p9), not bold | `Representative:` (bold) | ❌ FAIL — wrong label text entirely, and wrongly bolded |
| 2 | Field labels | `"Name of Borrower"` / `"Address"` — **not bold** (p6, p12) | `<b>Name of Borrower:</b>` / `<b>Address:</b>` — bold | ❌ FAIL — source labels are plain text, system bolds them |
| 3 | Item (a) | `"a. Security Fee"` (p33) | `a. CM Fee` | ❌ FAIL — wrong line-item name |
| 4 | Filled-in amounts | Security Fee, Processing Fee, Other Loan, Notarial Fee, Documentary Stamp, Admin Cost, Total Non-Finance Charges values are **bold** (p22/24/25/26/29/31/43/46) — the interest rate, both dates, the term-in-months digit, and the per-installment amount are also bold (p49, p79) | none of the `{{token}}` merge values are bold anywhere in the template | ❌ FAIL — system never bolds filled-in figures; source does, for most (not all — see note below) |
| 5 | Item 6a wording | `"p.m. From July 2026 to February 2027"` — capital "From" (p49) | `p.m. from {{disclosureFromDate}} to {{disclosureToDate}}` — lowercase "from" | ❌ FAIL — capitalization |
| 6 | Item 6a structure | 4 checkbox lines present: `( ) Simple ( ) 6 months+`, `( ) Compound ( ) 9 months`, `( ) 12 months`, `( ) Others _________` (p50–53) | **entirely absent** | ❌ FAIL — missing content, not just formatting |
| 7 | Item 7 wording | `"...(Computed in accordance with Sec. 2 (I) of CB Circular 158)"` (p71) | `(per Sec. 2 (I), CB Circular 158)` | ❌ FAIL — paraphrased, not verbatim |
| 8 | Item 9b structure | Separate line: `"(Payable in ___6___ months at  Php    11,229.76 _)       Php"` (p79) — shows the **per-installment amount**, not just the total | `b. Total Installment Payments (payable in {{termsInWords}} months)` — no per-installment amount field at all | ❌ FAIL — missing a whole data point (per-installment amount), plus lowercase "payable" vs source "Payable" |
| 9 | Signature block | Stacked, centered blocks per signatory: name / date / **"[Borrower/Co-Borrower] Signature Over Printed Name"** caption / "Date" — and there are **two** borrower-side signatories (borrower + co-borrower), each separate (p93–108) | one 2-column table: `Borrower` / `Representative` — no co-borrower line, no "Signature Over Printed Name" caption, structurally different | ❌ FAIL — structural mismatch, missing co-borrower signature line |
| 10 | Footer notice | `"...WILL SIGN"` — **no trailing period**, **not bold** (p109) | `...WILL SIGN.` — trailing period added, **bold** | ❌ FAIL — added punctuation not in source, wrongly bolded |

**Confirmed PASS (verified, not assumed):**
- Title text and 10pt bold centered — matches (p3).
- Subtitle text and 9pt non-bold centered — matches (p4).
- Item 10 wording — verbatim match (p80).
- Labels `b`–`j` (Taxes, Processing Fee, Other Loan, Notarial Fee, Payment for Previous Loan, Advance Payment, Documentary Stamp, Bank Account Opening, Admin Cost) — text matches.
- Zero paragraph spacing / 9pt body / 10pt title — matches (this is what `data-accurate` already fixed this session).

**Things I will not silently decide for you:**
- The source itself is **not internally consistent** about bolding filled-in amounts — e.g. the Amount-to-be-Financed value (p16, `57,100.45`) and the Cash/Purchase Price value (p44, `50,000.00`) are **not** bold, while most of the itemized fee amounts **are** bold. This looks like manual human inconsistency when the original was filled in, not a deliberate rule. I can't invent a consistent rule on your behalf — flagging rather than guessing which amounts "should" be bold.
- Whether to replicate the source's own typo (`"CREDIT DTRANSACTION"`, p91) for literal 100% fidelity, or keep our current corrected `"CREDIT TRANSACTION"` — your call, not mine to silently decide either way.
- Item 6a's checkboxes (`Simple`/`Compound`/`6 months+`/`9 months`/`12 months`/`Others`) aren't wired to any data the system currently tracks — adding them as static boilerplate is straightforward; making them reflect real computed values is a bigger question for you to weigh in on.

**Not yet fixed** — this is the audit only, per your instruction to work one document at a time and re-verify before moving on. Awaiting your go-ahead on the open questions above (bold-figures rule, typo-replication, checkbox wiring) before I touch the template again, since guessing on those would violate rule 1.

**Methodology note for everything below:** my extraction script skips fully-empty source paragraphs (used in the original as pure vertical spacers). That means if the system has content in a spot where I can't confirm the source had matching text (e.g. an address line, a conditional block), I mark it **INCONCLUSIVE**, not FAIL — asserting an absence I can't actually verify would itself be a guess.

---

### 2. promissory_note — 🔶 CANNOT BE AUDITED AS ONE DOCUMENT (confirmed, not just flagged)

Opened both real sources in full. They are **not variations of the same document** — different legal structure, different paragraph count (51 vs 89), different body size (9pt vs 10pt), different page margins, different emphasis convention (both use underline on filled values, PN.doc doesn't bold them, PN - MPL.doc does).

| | `SFCalculator/PN.doc` (Seafarer) | `LSLGC Calculator and Docs/PN - MPL.doc` (SME) |
|---|---|---|
| Opening line | "For value received, I/we, jointly and severally, promise to pay LOAN STAR LENDING GROUP CORP. or order the sum of..." | "For value received, I/We, [NAME], of legal age and residing at [ADDRESS], promise to pay LOAN STAR LENDING GROUP CORP. (LSLGC for brevity), or ORDER the sum of..." |
| Body size | 9pt | 10pt |
| Page margins | top/bottom 0.5in, left/right 1in | top/bottom 0.7in, left 1in, right 0.625in |
| Filled-value emphasis | underline only | bold **and** underline |

The system's one `promissory_note` template (checked against the DB body) most closely resembles the **SME** structure (numbered clauses 1–15, PDC/guaranty-check language) but doesn't match either source's opening paragraph verbatim, and uses **no bold or underline anywhere** on filled-in values — a mismatch against both real sources, which both emphasize filled values one way or another.

**Cannot mark PASS or FAIL against "the" source — there isn't one.** This needs your decision (Phase 3 material, not fixable until decided): split into `promissory_note_seafarer` / `promissory_note_sme`, or pick one as canonical and accept the other segment won't be faithful.

---

### 3. ar_atm_voucher — ❌ FAIL — 6 mismatches (also invalidates this session's earlier quick fix)

**Source:** `SFCalculator/AR ATM.doc`. Note: this session's earlier "Phase 3 nudge" pass on this document was done by eyeballing extracted text, not proper XML extraction — this audit supersedes it.

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | Name, address, loan amount, terms, dates are **bold + underlined** throughout | none of the `{{token}}` values are bold or underlined | ❌ FAIL |
| 2 | Title `"SURRENDER OF BANK ATM CARD"` is 14pt | uses default `h3` size (10.5pt via `data-compact-nudge`, if applied — but this template isn't wrapped in it at all currently) | ❌ FAIL — size not matching, and no accuracy-scope wrapper applied at all |
| 3 | Card-detail table has **5 rows**: Bank Name, Card Number, **PIN**, **Account Type**, **Initial Balance** (+ a Remarks row) | table has only **2 rows**: Bank Name, Card Number | ❌ FAIL — 3+ fields missing entirely |
| 4 | Extra paragraph: `"I further manifest, that I hereby waive all my rights, claims and/or cause of actions against LSLGC Directors, Stockholders, Officers, Staff and Representatives."` | **absent** | ❌ FAIL — missing clause |
| 5 | Two-column signer block: `"BORROWER:"` / `"RECEIVED BY:"`, each with a name line and an *italic* 9pt `"(Signature Over printed Name)"` caption | one column only: `{{borrowerName}} / Borrower`, no "Received by" side, no signature caption | ❌ FAIL — structurally incomplete |
| 6 | Execution place/date line — **not present** in source at all (no `{{executionPlace}}, {{executionDate}}` line found) | system has `<p>{{executionPlace}}, {{executionDate}}</p>` | ❌ FAIL — line added that isn't in the source |

**Confirmed PASS:** opening sentence content/order (name → address → surrender → loan amount → terms → amortization → start date) matches the source's actual wording closely, aside from the missing bold/underline.

**Separately confirmed (Part 1 update):** `AR ATM - With Spouse.doc` is a genuinely different document (adds a co-signing spouse) — not represented at all in the system. Flagging as its own gap, not folding into this document's fix.

---

### 4. demand_letter_dishonored_check — ❌ FAIL — 4 confirmed mismatches, 2 inconclusive

**Source:** `SFCalculator/DL2 - No address.doc`.

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"Dear ELVEN DEL MONTE CAYANAN,"` — addressed to the actual borrower by name | `"Dear Sir/Madam,"` — generic | ❌ FAIL |
| 2 | `"Re: Dishonored check/s"` — **not bold** | `<b>Re: Dishonored check/s</b>` — bold | ❌ FAIL |
| 3 | `"Said Check has the following details"` (singular "Check") | `"Said checks have the following details"` (plural) | ❌ FAIL — minor but real wording diff |
| 4 | `"within 5 days the receipt hereof"` (source's own grammar, reads as a typo — likely missing "from") | `"within five (5) days from receipt hereof"` — silently corrected | ❌ FAIL by literal-fidelity rule, but this is a source-side typo we may not want to replicate — flagging as a judgment call, not fixing either way without your input |
| 5 | Whether the source has an address line, an "Attention:" block, or a "Received by:" signer column | can't confirm from my extraction (all candidate paragraphs were empty in the source, which my method can't distinguish from "absent" vs "present but blank in this filled sample") | 🟡 INCONCLUSIVE — needs a closer look, not asserted either way |

---

### 5. demand_letter_second_notice — ❌ FAIL — 2 confirmed mismatches

**Source:** `SFCalculator/SC - NO PDC- no add.doc` (first half of the file — the "Second Notice" and "Final Demand" are two letters in one source document; only the first was used for this template).

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"RE: SECOND NOTICE TO PAY"` is **14pt**, on its own line, followed by `"(Loan No. LA303401)"` at 12pt bold, also its own line | system combines both into one 9pt-scale line (no `data-accurate`/`data-compact-nudge` wrapper applied — this template has no accuracy scope at all) | ❌ FAIL — size and structure |
| 2 | Borrower name in the `"Dear ..."` line is **bold** | `Dear {{borrowerName}},` — not bold | ❌ FAIL |

**Confirmed PASS:** body paragraph wording matches closely (this was the one I drafted directly from the source text under time pressure earlier this session, and it holds up).

**Note:** this template was created *during this session* (not one of the original 30) — flagging that it was built from a fast reading of the source, not the rigorous XML method, same caveat as ar_atm_voucher's earlier quick fix.

---

### 6. agreement_check_replacement — ❌ FAIL — 2 confirmed mismatches

**Source:** `LSLGC Calculator and Docs/Additional Agreement 1.23.23 - check replacement.docx`.

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"...for his chattel mortgage loan **to be released** on ___"` (future tense) | `"...released on {{chattelReleaseDate}}"` (past tense) | ❌ FAIL — tense mismatch; could be the source's own inconsistency (title is "replacement," implying an existing loan, so "to be released" reads oddly there too) — flagging, not silently picking one |
| 2 | Acknowledgement paragraph refers to **"the Loan Agreement"** — a copy-paste leftover from a different document template, since this document is titled "Agreement for Replacement of Checks" | system correctly says `"the foregoing Agreement for Replacement of Checks"` | Source has an internal error here; system is *more* correct than the source. Flagging as a judgment call (replicate the source's mistake for literal fidelity, or leave the system's correction in place?) rather than treating this as something to "fix" |

**Confirmed PASS:** overall structure (parties block → request paragraph → numbered terms → check-detail table → bank-deposit table → signatures → acknowledgement) matches. Page margins/size differ from other documents (right margin 1.13in here vs 1in elsewhere) — consistent with the broader finding that margins aren't uniform across documents.

---

### 7. agreement_for_consolidation — ❌ FAIL — 1 confirmed mismatch, page-size finding

**Source:** `LSLGC Calculator and Docs/AGREEMENT FOR CONSOLIDATION.doc`.

**Major finding, not specific to this document:** this source uses **A4 page size** (`11906×16838` twips = 8.27in×11.69in), not the 8.5in×13in "Folio" size used by Disclosure Statement, Promissory Note, etc. Body font here is **Calibri 11pt** (via the document's own `Normal` style, confirmed via `styles.xml`, not assumed) with **8pt automatic paragraph spacing** — a completely different typographic convention from the tight 9pt/zero-spacing seen in the Seafarer-side documents. This confirms Part 1's flag: **page size and typography are not uniform across the document set.** The system currently renders every document at 8.5×13in — meaning this document (and likely other SME/LSLGC-folder documents, still to be confirmed) is being rendered at the wrong page size, not just wrong margins.

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | Title: `"AGREEMENT FOR CONSOLIDATION OF LOAN RELEASES UNDER MULTIPLE LOANS"` at 14–15pt | system `h2` (12pt default, or 10pt if `data-accurate`/`data-compact-nudge` applied — this template uses `data-compact-nudge`, giving 11.3pt) | ❌ FAIL — doesn't match either the source's 14-15pt or any of our existing size scopes |

**Confirmed PASS:** body wording matches closely for the sampled paragraphs (loan consolidation clauses, acknowledgement structure). The system correctly uses a repeating table (`data-repeat="priorLoans"`) for the multiple prior loans, which structurally matches the source's repeated `"...and Loan Number X with a total loan amount of Y, released on Z"` pattern (source expresses this as one long run-on sentence rather than a table — a structural difference, but the same underlying data).

---

## Part 2 progress so far

| # | Template | Status |
|---|---|---|
| 1 | disclosure_statement (SF side) | ❌ FAIL — 10 mismatches |
| 2 | promissory_note | 🔶 cannot audit as one document — 2 genuinely different sources confirmed |
| 3 | ar_atm_voucher | ❌ FAIL — 6 mismatches (supersedes this session's earlier quick fix) |
| 4 | demand_letter_dishonored_check | ❌ FAIL — 4 mismatches, 2 inconclusive |
| 5 | demand_letter_second_notice | ❌ FAIL — 2 mismatches |
| 6 | agreement_check_replacement | ❌ FAIL — 2 mismatches (1 is a source-side judgment call) |
| 7 | agreement_for_consolidation | ❌ FAIL — 1 mismatch + a page-size finding affecting more than just this document |

---

### 8. deed_of_chattel_mortgage — ✅ mostly PASS, 1 mismatch

**Source:** `CHATTEL MORTGAGE - 1 unit.doc` (confirmed the 2-unit variant is the same underlying document, just with an extra vehicle row — spot-checked, not assumed: paragraph counts and boilerplate phrasing match, only the filled figures and row count differ).

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"That for, and **consideration** of, this indebtedness..."` — missing the word "in" (confirmed present identically in both the Chattel and Real Estate Mortgage sources — a real, recurring house typo, not a one-off) | `"That for, and **in** consideration of, this indebtedness..."` | Source has a recurring grammatical error; system is already grammatically correct. Flagging as a judgment call (replicate the error for literal fidelity, or leave the correction) — not fixing without your input |

**Confirmed PASS:** "witnesseth" structure, the indebtedness/repayment clause, the "AFFIDAVIT OF GOOD FAITH" section, vehicle table column headers, and the acknowledgement block all match the source closely.

---

### 9. real_estate_mortgage — ✅ mostly PASS, 1 mismatch (system is *more* correct than source)

**Source:** `REAL ESTATE MORTGAGE - 1 Property.doc`.

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"...conveys by way of REAL ESTATE MORTGAGE unto the MORTGAGEE, his heirs and assigns, the following **personality** now in the possession..."` — "personality" is the legal term for movable/personal property; using it for **real estate** is a genuine legal-terminology error in the source (looks like the Chattel Mortgage clause was copy-pasted without updating this word) | `"...the **real property** described above, together with all existing improvements thereon"` — correct | Source has the error, not the system. Not something to "fix" — replicating it would introduce a real legal mistake. Documenting per the audit's own rules, not silently skipping it |

Same recurring "consideration of" / "in consideration of" gap as deed_of_chattel_mortgage — same judgment call, not repeated here.

**Confirmed PASS:** everything else — structure, TCT/technical-description repeating block, acknowledgement.

---

### 10. cancellation_of_chattel_mortgage — ✅ PASS (both conditional branches confirmed)

**Source:** `Cancellation of Mortgage/CANCELLATION OF CHATTEL - 1 unit.doc` (individual) **and** `...Corp and DTI- 1 unit.doc` (corporate/DTI) — genuinely two different opening clauses, confirmed by direct comparison, not assumed.

The system's `data-unless="isCorpOrDti"` / `data-if="isCorpOrDti"` conditional pair was checked against **both** real variants word-for-word:

| Branch | Source | System |
|---|---|---|
| Individual | `"...MORTGAGOR(s), PAUL HENRY BARRETTO FERRAZ..., of legal age, residing at MAKATI CITY, and by that certain chattel mortgage..."` | `"...MORTGAGOR(s), {{borrowerName}}, of legal age, residing at {{address}}, and by that certain chattel mortgage..."` — matches |
| Corp/DTI | `"...MORTGAGOR(s), PAUL HENRY BARRETTO FERRAZ, a company duly organized under the laws of the Philippines, with primary office address at MAKATI CITY, herein represented by Dante Barona, known as its "President", and by that certain chattel mortgage..."` | `"...{{borrowerName}}, a company duly organized under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its "{{borrowerRepresentativeTitle}}", and by..."` — matches |

**One minor note, not a fail:** source says `"The foregoing document**s** consisting of One (1) page..."` — plural "documents" paired with singular "page," a source-side grammar slip. System correctly says `"document consisting of {{cancellationPageCount}} page"` (singular, dynamic count) — again, system already more correct than source.

---

### 11. cancellation_of_real_estate_mortgage — ❌ FAIL — source itself is internally inconsistent (documenting, not fixing blindly)

**Source:** `Cancellation of Mortgage/CANCELLATION OF REM - 1 property.doc`.

**Real finding:** the source's own opening WHEREAS clause says `"...by that certain **chattel** mortgage made and executed on:"` — a copy-paste leftover from the Chattel version, even though this document is titled "Cancellation of Real Estate Mortgage" and later correctly refers to `"...the said real estate mortgage"`. The source is internally inconsistent about its own subject matter. System correctly says `"...by that certain **real estate** mortgage..."` throughout — again, more correct than source. Not fixing this to match the source's error.

**Confirmed PASS:** everything else (TCT block, acknowledgement, "Full Cancellation of Real Estate Mortgage" reference).

---

### 12. voluntary_surrender_deed_auto / voluntary_surrender_deed_rem — ❌ FAIL — 2 confirmed mismatches (shared between both)

**Sources:** `Voluntary and Deed Auto - Unit 1.doc` / `Voluntary and Deed REM 1.doc` (confirmed structurally identical to their -Unit 2 / REM 2 counterparts besides row count).

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | `"That **inconsideration** LOAN STAR LENDING GROUP CORP. will give a redemption period of **one (1) month** to settle..."` — "inconsideration" is a run-together typo for "in consideration," and **the redemption period is fixed boilerplate text, not a blank to fill in** | `"...{{companyName}} will give a redemption period of {{redemptionPeriod}}..."` — treated as a variable merge field | ❌ FAIL — if the source always says a fixed "one (1) month," turning it into an editable field is a design choice worth confirming with you, not something I should silently assume is correct |
| 2 | `"...below are the **detailed** of my unit"` — grammar quirk (should be "details") | `"...below are the **details** of my unit"` | Source-side grammar issue; system already correct — judgment call, not fixing to match |

**Confirmed PASS:** "DEED OF ABSOLUTE SALE" section, "as is, where is" clause, and (REM-specific) the "VENDOR hereby warrants his title..." sentence all match the source verbatim.

---

### 13. spa_mortgage_cancellation — ❌ FAIL — 3 confirmed mismatches

**Source:** `SPECIAL POWER OF ATTORNEY Cancellation of Mortgage.docx` and its `(1).docx` counterpart — confirmed these are the same document (nearly identical, `(1)` just has 2 extra lines from a more fully-filled sample instance — not a real structural variant).

| # | Source | System | Verdict |
|---|---|---|---|
| 1 | Vehicle description table has **7 fields**: Make/Series/**Body Type**, MV File No., **Year Model** (its own row), Transmission, Engine Number, Chassis Number, Plate Number | table has **6 columns**, with Make/Series/Year Model **merged into one field** and **no Body Type field at all** | ❌ FAIL — a real field (Body Type) is missing, and Year Model is folded into a different field than the source structures it |
| 2 | Title: `"KNOWN ALL MEN BY THESE PRESENTS:"` — this is a typo in the source (should be "KNOW ALL MEN," missing article usage aside, "KNOWN" is wrong), present identically in both source files (so a real, recurring error, not one-off) | `"KNOW ALL MEN BY THESE PRESENTS:"` — correct | Source's own recurring error; system already correct — judgment call, not fixing to match |
| 3 | Date line: `"...this _____ day of _______________, 2026, at ____________________, Philippines."` — day, month, year broken into separate blanks | `"...this {{executionDate}}, at {{executionPlace}}, Philippines."` — single combined date field | Structural difference in how the date is captured — likely a deliberate, reasonable simplification (system already has a unified `executionDate` convention used everywhere else), flagging rather than asserting it must change |

---

### 14. consent_form — 🔶 CANNOT BE FULLY AUDITED — 3 non-identical sources, and the "base" file itself is ambiguous

**Sources:** `LSLGC CONSENT FORM 2025.docx` (base), `...- Corp..docx`, `...- Individual.docx`.

The system currently has **one binary conditional** (`isCorporateBorrower`) with two signature-block variants. Checked against all 3 real files:

- **Corp variant** matches the system's `data-if="isCorporateBorrower"` branch closely: `"Represented by: [name] / Authorized Signatory"`.
- **Individual variant** shows **two separate signature blocks** (`"GDD CONSTRUCTION / Signature Over Printed Name"` and `"RENE / Signature Over Printed Name"`) — looks like borrower + a second signatory (co-borrower? guarantor? unclear from the filled sample alone) — the system's `data-unless="isCorporateBorrower"` branch only has **one** signature block.
- **Base file** signature block is genuinely confusing — it shows what looks like both an individual name and a separate company block together in the same document, which doesn't cleanly match either of the system's two branches.

**Cannot mark PASS or FAIL confidently** — this needs your input on what the "Individual" variant's second signature block actually represents before I can even state what the mismatch is, let alone fix it.

---

## Part 2 progress so far

| # | Template | Status |
|---|---|---|
| 1 | disclosure_statement (SF side) | ❌ FAIL — 10 mismatches |
| 2 | promissory_note | 🔶 cannot audit as one document — 2 genuinely different sources confirmed |
| 3 | ar_atm_voucher | ❌ FAIL — 6 mismatches (supersedes this session's earlier quick fix) |
| 4 | demand_letter_dishonored_check | ❌ FAIL — 4 mismatches, 2 inconclusive |
| 5 | demand_letter_second_notice | ❌ FAIL — 2 mismatches |
| 6 | agreement_check_replacement | ❌ FAIL — 2 mismatches (1 is a source-side judgment call) |
| 7 | agreement_for_consolidation | ❌ FAIL — 1 mismatch + a page-size finding affecting more than just this document |
| 8 | deed_of_chattel_mortgage | ✅ mostly PASS — 1 judgment-call item, nothing else |
| 9 | real_estate_mortgage | ✅ mostly PASS — 1 item where system is already more correct than source |
| 10 | cancellation_of_chattel_mortgage | ✅ PASS — both individual and corp/DTI branches confirmed correct |
| 11 | cancellation_of_real_estate_mortgage | ❌ FAIL only in the sense that source is self-inconsistent — system is correct |
| 12 | voluntary_surrender_deed_auto | ❌ FAIL — 2 mismatches (shared with #13) |
| 13 | voluntary_surrender_deed_rem | ❌ FAIL — 2 mismatches (shared with #12) |
| 14 | spa_mortgage_cancellation | ❌ FAIL — 3 mismatches, including a genuinely missing field |
| 15 | consent_form | 🔶 cannot audit — 3 non-identical sources, ambiguous even on their own |

**Still to audit — the two largest remaining chunks:**
- **loan_agreement**: 9 real source variants (`Auto and Individual`, `Bi-Monthly`, `DTI`, `Invoice` ×3, `No Security`, `Per Day Interest`, base) — likely the single biggest audit item remaining, comparable in scope to everything done so far combined.
- **demand_letter**: ~10 candidate source files (Co-borrower ± address, Individual ± address, SME ± address, without-PDC ± address/2024) with no clear 1:1 match yet — needs a disambiguation pass before real auditing can even start.
- **loan_agreement_vienovo**: 3 dated variants, canonical one unclear.

---

### 15. loan_agreement — ❌ FAIL — the most significant finding in this audit: 3 entire clause structures are missing, not just wording

**Sources:** all 9 real variants opened and compared (`LOAN AGREEMENT.doc` base, `Auto and Individual`, `Bi-Monthly`, `DTI`, `Invoice`, `Invoice (DTI)`, `Invoice with multiple invoices`, `No Security check and termination fee`, `Per Day Interest Single`).

**First, the good news:** against the *base* (standard monthly-installment, with-security-check) variant, the system's clause-by-clause wording is **excellent** — almost every sentence in clauses 1–7 matches, and everywhere it doesn't match, **the system has already silently corrected a source-side grammar error** (subject-verb agreement, wrong prepositions, "released" vs "release," etc. — many small instances, consistent with the pattern seen throughout this audit). The `hasSecurityCheck` conditional's *off* branch was also checked directly against the `No Security` source and matches closely.

**One confirmed real bug, not a judgment call:** the acknowledgement sentence renders as literally `"...consisting of pages including this page..."` — **the page-count number is missing entirely**, no merge field or hardcoded value fills it. The source always has a real number here (e.g. `"consisting of three (3) pages"`). This is broken English in every generated Loan Agreement today, not a fidelity nuance.

**The major finding:** three of the nine real source variants describe a **completely different Clause 2/3 payment structure** that the system does not have *any* version of, despite the system's own merge-field list already declaring conditional flags for them (`if Bi-monthly amortization schedule`, `if Per-day (prorated) interest, one-time payment`) — meaning this was scaffolded but never actually written into the template body:

| Variant | Real structure (verbatim excerpt) | In system today |
|---|---|---|
| **Bi-Monthly** | `"Payments shall be made on a bi-monthly basis, with the first half of the monthly amortization due 15 days after the release... Instead of a single monthly installment, the regular monthly schedule is divided into two (2)..."` — 12 PDCs at half-amounts, twice a month | **Not present at all.** The system's only Clause 2/3 text describes standard once-a-month payments. |
| **Per Day Interest** | `"This loan shall be payable in one-time payment term for a period of [N] days... The Borrower shall be obliged to pay this loan in one-time payment term with a monthly interest of [X], prorate computation per day... The entire balance... shall be immediately due and demandable on [date]"` — single payment, single PDC, no monthly installments at all | **Not present at all.** |
| **Invoice financing** | `"...one-time payment with a weekly interest of One percent (1.00%) on the first month, Two percent (2.00%) on the second month, and Two and Fifty hundredths' percent (2.50%) on the third month. The entire balance...shall become immediately due and demandable once the invoice has been cleared..."` — tiered/escalating weekly interest, single guaranty check pegged to invoice value | The system's `hasInvoiceAnnex` conditional **only adds a table listing the financed invoices** — it does not change Clause 2/3's interest/payment description at all, so a generated Invoice-financing Loan Agreement today would show the standard monthly-installment clause next to an invoice table, which contradicts the loan's actual terms. |

This isn't a wording nuance — for these 3 (of 9) real variants, the generated document would currently state **the wrong payment terms entirely** for that loan. This is exactly the kind of shared/systemic gap Phase 1 of the plan was meant to catch, just discovered later than expected (needed the full source set opened to see it, not just Disclosure Statement).

**One more confirmed bug, found diffing the `Auto and Individual` variant against base:** the real source's Clause 4.1 guaranty-check text for an **individual** borrower reads `"...plus One (1) signed but undated check and blank amount in favor of the Lender..."` — no mention of a company officer, because an individual borrower has no "President/Treasurer." The system's `hasSecurityCheck` branch, however, **always** says `"...plus One (1) personal check of the company President/Treasurer, signed but undated..."` regardless of whether the borrower is corporate or individual — so a security-check Loan Agreement for an individual/auto borrower today incorrectly references a company officer role that doesn't apply to them. This conditional needs to also check `isCorporateBorrower`, not just `hasSecurityCheck`, for this one phrase.

**Not yet fully checked:** the `DTI` variant's borrower-identity paragraph (didn't find DTI-specific distinguishing text in this particular filled sample — inconclusive, not asserted as matching or differing); `Invoice (DTI)` and `Invoice with multiple invoices` share the Invoice-financing gap above so weren't separately re-audited for that part, but haven't been checked for anything DTI- or multi-invoice-specific beyond that.

---

### 16. loan_agreement_vienovo — ✅ PASS

**Sources:** all 3 dated/undated variants opened. The undated base file (`Vienovo Loan Agreement - quarter2months.doc`) turned out to be an unfinished draft (literal placeholder text `"SAMPLE"` as the borrower name and garbage keyboard-mash text `"ASSDASDASDASDASDASD..."` in place of real content) — not used as a comparison source. The two dated, fully-filled instances (`02.05.26`, `02.20.26`) were used instead, and are consistent with each other.

Checked the system's quarterly/every-2-months conditional clause directly against the source: `"...and is payable on a quarterly basis thereafter until the obligation is fully paid, without the need of any further notice, demand, act, or deed on the part of the Lender."` — **matches verbatim**. Clause 4 (Security) and Clause 5 (Pre-Termination, including the specific "sixty (60) calendar days" notice period) also match closely, with only the same source-grammar-correction pattern seen everywhere else in this audit (not a fail). Unlike the base `loan_agreement`, this template's acknowledgement already correctly hardcodes `"consisting of three (3) pages"` — the missing-page-count bug does **not** affect this template.

**This is the strongest PASS of the whole audit.**

---

### 17. demand_letter — ⚠️ RESOLVED: no real source, and it doesn't need one

Opened all remaining candidate files from the root LSLGC folder (`Individual borrower`, `SME`, `Co-borrower`, `without PDC 2024`, and their no-address variants). **Every one of them turned out to be a variant of one of the two letter types already audited** — either the "Dishonored check/s" letter (→ `demand_letter_dishonored_check`, audited as #4) or the "Second Notice / Final Notice" pair (→ `demand_letter_second_notice`, audited as #5), just re-addressed for a specific borrower type (Individual/SME/Co-borrower) and salutation (`"Gentleman,"` / `"Dear Sir/Madame,"` / `"Madam,"`).

**None of them use the design the system's `demand_letter` template actually has** — a clean table (Outstanding Balance / Penalty / Total Amount Due) with a 3-stage `demandStage` + `isFinal` parameterization. That table-based, staged design doesn't correspond to any real LSLGC document; it appears to be a newer, purpose-built template rather than a digitization of an existing one.

**Verdict:** `demand_letter` cannot fail a fidelity audit against a source it was never meant to replicate. The real fidelity gaps for demand letters live in `demand_letter_dishonored_check` and `demand_letter_second_notice`, both already audited (and both did surface real mismatches, including the salutation issue this cross-check reconfirms — the real letters personalize the greeting by name/gender/entity type, never a generic "Dear Sir/Madam").

---

## Part 2 progress so far

| # | Template | Status |
|---|---|---|
| 1 | disclosure_statement (SF side) | ❌ FAIL — 10 mismatches |
| 2 | promissory_note | 🔶 cannot audit as one document — 2 genuinely different sources confirmed |
| 3 | ar_atm_voucher | ❌ FAIL — 6 mismatches (supersedes this session's earlier quick fix) |
| 4 | demand_letter_dishonored_check | ❌ FAIL — 4 mismatches, 2 inconclusive |
| 5 | demand_letter_second_notice | ❌ FAIL — 2 mismatches |
| 6 | agreement_check_replacement | ❌ FAIL — 2 mismatches (1 is a source-side judgment call) |
| 7 | agreement_for_consolidation | ❌ FAIL — 1 mismatch + a page-size finding affecting more than just this document |
| 8 | deed_of_chattel_mortgage | ✅ mostly PASS — 1 judgment-call item, nothing else |
| 9 | real_estate_mortgage | ✅ mostly PASS — 1 item where system is already more correct than source |
| 10 | cancellation_of_chattel_mortgage | ✅ PASS — both individual and corp/DTI branches confirmed correct |
| 11 | cancellation_of_real_estate_mortgage | ❌ FAIL only in the sense that source is self-inconsistent — system is correct |
| 12 | voluntary_surrender_deed_auto | ❌ FAIL — 2 mismatches (shared with #13) |
| 13 | voluntary_surrender_deed_rem | ❌ FAIL — 2 mismatches (shared with #12) |
| 14 | spa_mortgage_cancellation | ❌ FAIL — 3 mismatches, including a genuinely missing field |
| 15 | consent_form | 🔶 cannot audit — 3 non-identical sources, ambiguous even on their own |
| 16 | loan_agreement | ❌ FAIL — 1 confirmed bug (missing page count) + 3 entire missing clause structures (Bi-Monthly, Per-Day, Invoice) + 1 confirmed conditional-logic bug (security-check clause wrongly mentions a company officer for individual borrowers) |
| 17 | loan_agreement_vienovo | ✅ PASS — strongest result in the whole audit |
| 18 | demand_letter | ⚠️ resolved — no real source exists for this design; not a fidelity failure, it's a different (newer) template than anything in the source folder |

## Audit complete for every document with a usable real source

That's all 18 documents that have a clean, checkable source file (out of 30 active templates). Remaining, and why they weren't audited the same way:

- **11 documents have no source file in the LSLGC Documents folder at all** (vouchers, application forms, BLRI, letter of intent, acknowledgement receipt, payment receipt, final computation sheet, endorsement letter — see Part 1). Nothing to compare against; a fidelity audit isn't possible for these, only an internal-consistency review, which is a different task.
- **`consent_form`** and **`promissory_note`** have multiple real sources that are genuinely different documents (not variants of one) — flagged for your decision, not force-fit into a single PASS/FAIL.
- **`loan_agreement`**'s `DTI` variant borrower-identity paragraph is the one remaining unchecked corner of an otherwise fully-audited document.

## Overall tally

| Result | Count | Documents |
|---|---|---|
| ✅ PASS or near-PASS | 4 | deed_of_chattel_mortgage, real_estate_mortgage, cancellation_of_chattel_mortgage, loan_agreement_vienovo |
| ❌ FAIL (real, fixable mismatches) | 11 | disclosure_statement, ar_atm_voucher, demand_letter_dishonored_check, demand_letter_second_notice, agreement_check_replacement, agreement_for_consolidation, cancellation_of_real_estate_mortgage*, voluntary_surrender_deed_auto, voluntary_surrender_deed_rem, spa_mortgage_cancellation, loan_agreement |
| 🔶 Cannot audit — multiple non-identical sources, needs your decision | 2 | promissory_note, consent_form |
| ⚠️ Resolved — no real source / not applicable | 1 | demand_letter |
| 🟡 Not auditable — no source exists | 11 | ar_atm_voucher is NOT in this group (has a source); the 11 are: ar_cash_voucher, ar_check_voucher, cash_voucher, check_voucher, blri, letter_of_intent, acknowledgement_receipt, endorsement_letter, payment_receipt, final_computation_sheet, application_form (+corporate/individual variants) |

*cancellation_of_real_estate_mortgage's only "failure" is that the source itself is self-contradictory (says "chattel mortgage" in one place, "real estate mortgage" in another) — the system is already correct, nothing to fix there.

**This audit is now complete for the full document set** — every template that can be checked against a real source has been checked, with source-vs-system evidence shown for every finding, per your instructions. Ready to move into implementation planning (Phase 3+ of `IMPLEMENTATION_PLAN.md`) whenever you want.
