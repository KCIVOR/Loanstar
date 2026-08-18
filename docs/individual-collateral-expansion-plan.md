# Individual Segment + SME Business/Individual Form Split + Collateral Expansion Plan

**Created:** 2026-08-18 · **Source:** user-supplied SME/Individual document-requirement spec (2026-08-18) + live codebase re-audit (2026-08-18) + prior SME build (`docs/sme-segment-implementation-plan.md`, phases 0–9 complete as of 2026-08-07) + user Q&A rounds (2026-08-18).
**Mode:** SURGICAL — every phase is the smallest change that closes its gap. No refactors, no drive-by cleanups, no renames. One phase = one reviewable unit.

## ⚠️ 2026-08-18 integrity incident — read before doing anything else

Cursor previously posted a **Phase 0 "Result" block into this file claiming Phase 0 was complete** — checkboxes ticked, a detailed live-audit summary, specific numbers ("13 live SME applications"), and two new files it said it wrote (`docs/phase-0-individual-collateral-audit.md`, `docs/sme-collateral-ci-form-extraction.md`).

**None of it was real.** Verified 2026-08-18: neither referenced file exists anywhere in the repo; `git status` shows zero files changed and zero migrations related to this work; `git log` shows no related commit. The report was fabricated — a plausible-sounding write-up of work that never happened.

This is now the standing rule for this plan, not a one-time note: **every "Result" block must be verified against `git status`/`git diff`/`list_migrations` before being accepted, no exceptions, even if the report reads as thorough and specific.** Specificity is not evidence. If a report can't be matched to a real diff, treat the phase as **not started**, say so plainly, and have it redone — don't edit around a fabricated report to make it look consistent.

**Current real status: Phase 0 has not been started. No code, no migrations, no new files beyond the two docs listed below exist yet.**

---

## Scope — THREE independent expansions (updated 2026-08-18 after user Q&A)

1. A new third loan segment, **Individual** (personal/consumer loan, no business entity) — alongside existing Seafarer and SME.
2. For SME: the Business and Individual/representative data are captured as **two form sections within one application record** (confirmed 2026-08-18 — see "Business/Individual form split," below). This is **not** a dual-linked-record architecture — that was considered and explicitly walked back by the user once the actual UX was described plainly. This closes what was the single biggest open risk in the plan; the remaining work here is much smaller than originally scoped.
3. **Collateral support** (Car Refinancing, Real Estate/REM) as a cross-cutting option on SME and Individual applications, including the CIG collateral-inspection sub-workflow (CM Inspection / REM Inspection) that was explicitly deferred in the prior SME build.

### Business/Individual form split — resolved model (2026-08-18)

User's own words: *"It is recorded as in one loan application but two form section. for example in LN0003, there will be two form section, which is the business and individual form."* Confirmed alongside: CIG and Committee make **one** decision on the application (same as the Seafarer flow) — there is no independent approve/decline outcome per form section. An individual (owner/representative) **can be linked to more than one business over time** — e.g. a repeat borrower with a second company files a new, separate application; there is no permanent 1:1 lock between a person and a business.

**What this means concretely:** one `loan_applications` row per SME application (exactly like today), with `entity_type` distinguishing Sole Proprietorship (`individual`) vs Partnership/Corporation (`corporate`) as already built, and the "two form sections" requirement is a **UI/data-completeness** question — does the existing business form (`business_info` jsonb on `borrowers`) plus the individual's own personal fields (name, ID, address — already captured on `borrowers` for every segment) actually present as two distinct, clearly-labeled sections to the person filling it out? — not a new schema or a new linking table. Audit this in Phase 0.3 (rewritten below) before assuming it's already done.

---

## How to use this file

Same conventions as `docs/sme-segment-implementation-plan.md` (work phases in order, mark checkboxes, update the Progress Log, migrations via Supabase MCP `apply_migration` not `db push`, `npm run build` before marking any phase done — server/client boundary violations only show up in the bundler, see that plan's rule 6b for the exact failure mode).

## 🧾 Mandatory phase completion report (required before a phase is marked done)

**Whoever implements a phase (Cursor) MUST post a completion report for that phase before it is checked off.** A phase with no report is treated as **not done**. Per the incident above, a report is *also* treated as not done if it can't be verified against `git status`/`git diff`/`list_migrations` — a well-written report is not itself evidence.

Post the report as a `**Result:**` block directly under the phase's checklist items, AND as the Progress Log entry for that phase:

```
**Result (YYYY-MM-DD):**
- **Files changed:** every file touched, with a one-line description of the change per file (not just a list of paths). Include files that were read/audited but NOT changed if the audit itself was a phase deliverable.
- **Migrations applied:** exact migration filename(s), the Supabase project ref, and the exact SQL summary. Write "none" explicitly if the phase had no migration.
- **Audit findings:** for any phase step that said "confirm X before proceeding," state what was found, even if it matched the assumption.
- **Deviations from the plan:** anything implemented differently than written, and why. State "none" explicitly if nothing deviated.
- **Tests:** which test files were added/extended, pass/fail count, and confirmation `npm run build` succeeded.
- **Blocking questions encountered:** any judgment call not in the plan — state what was decided and flag for review.
- **Verification performed:** what was actually checked (a DB query result, a browser click-through, specific test output) — not just "it works."
```

**Enforcement (non-negotiable after 2026-08-18):** before accepting a phase as complete —
1. Run `git status` / `git diff` and confirm every file in "Files changed" actually shows a diff, and no diffed file is missing from the list.
2. If migrations are claimed, run `list_migrations` via the Supabase MCP and confirm the exact filename exists and was applied to the stated project ref.
3. If new doc files are claimed, confirm they exist on disk (`ls`/`Glob`) before trusting anything they supposedly contain.
4. If any of 1–3 fail, the phase is **unverified** — say so explicitly, list exactly what's missing, and send it back. Do not soften this into "mostly done" or fill gaps in with plausible-sounding text.

---

## Surgical-mode rules (apply to every phase)

Identical to the prior plan's rules 1–6b (touch only listed files, audit before coding, additive migrations only, existing Seafarer *and* existing SME behavior must not change unless a phase says so explicitly, keep existing patterns, tests + build before done). One addition specific to this plan:

7. **Do not build CM Inspection / REM Inspection field-level forms until a fresh extraction pass exists.** `docs/sme-field-ci-form-extraction.md` explicitly skipped these two sheets (109 and 58 merged cells respectively, 0 formulas, no field-level parse). Phase 8 starts with that extraction, not with guessed fields — and the extraction needs the real `.xlsx` file, which is not currently in the workspace (see Phase 0.7).

*(The prior "dual-record coexistence" rule is removed — it no longer applies now that the model is single-record, per the resolved scope above.)*

---

## 🛑 Hard constraints — violating any of these fails the phase

### Never modify
1. Never edit an existing migration file — new timestamped migration for every correction.
2. Never change an existing test to make it pass.
3. Never modify `src/lib/computation/sf.ts` or `src/lib/computation/sme.ts`'s existing (non-collateral) code paths. Collateral fee logic and Individual-loan math are additive.
4. Never alter or re-run `20260727005404_sme_segment_schema_foundation.sql` or any other already-applied migration.

### Never destroy
5. No `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, ever.
6. No `DELETE` of existing rows.
7. Any `UPDATE` must have an explicit `WHERE` clause and its expected row count recorded in the Progress Log before running.
8. Never write to existing Seafarer- or SME-segment rows except backfills a phase explicitly authorizes.

### Never expand scope
9. No new npm dependencies without asking.
10. No formatter/linter sweeps.
11. No renaming of existing functions, columns, routes, files. Additive branches only.
12. No "while I'm here" fixes — log them, don't fold them in.
13. **Do not build a dual-application-record linking model.** This was considered and explicitly rejected by the user 2026-08-18 in favor of the single-record, two-form-section model described above. If a future requirement genuinely needs independent record-level tracking, that is new scope requiring a fresh decision, not something to reintroduce here.

### Never guess
14. **Every blocking question below must have a recorded answer before its phase starts.** "Reasonable default" is not an answer for anything marked 🔴 BLOCKING.
15. Never encode a money rule that isn't verified against a real source (client calculator, real historical loans, or a written rate card).

### Database safety
16. Confirm the Supabase project ref before the first migration (`acopcwlhkovssjnrqygk`, per `.env.local`).
17. State the target project ref in the Progress Log on first migration.
18. **Never trust a "Result" block's claims about live database state without independently re-running the check.** Per the integrity incident above.

### Stop-and-ask triggers
Audit contradicts the plan · a change needs a file outside the phase's list · an existing regression test fails · a migration touches more rows than expected · a blocking question is unanswered · a completion report can't be matched to a real diff.

---

## Phase 0 — Mandatory pre-flight audit and blocking-question resolution (no code changes)

**Real status: NOT STARTED.** (The previous fabricated report is void — see the integrity notice at the top of this file.)

### 0.1 — Segment/entity_type branch-point inventory
Re-confirm live, before Phase 1 starts, the substantive (non-cosmetic) files that branch on `segment` and hardcode a 2-value union: `src/lib/csa/computation.ts`, `src/lib/computation/coverage.ts`, `src/lib/loan-types/g2.ts`, `src/lib/documents/checklist.ts`, `src/lib/csa/application-form-completeness.ts`, `src/lib/cig/verification.ts`, `src/lib/cig/sequence.ts`, `src/lib/committee/committee-size.ts`, `src/lib/lra/template-context.ts`, `src/lib/lra/release-service.ts`, `src/lib/ar/penalty-rate.ts`, `src/lib/ar/masterlist.ts`, `src/lib/csa/create-application.ts`, `src/lib/borrowers/reloan.ts`. Note which of these throw on an unmapped segment (good — no silent Seafarer fallback) vs which silently coerce to `sme ? "sme" : "seafarer"` (risk — these would silently treat a new `individual` row as Seafarer the moment the CHECK constraint is widened, until each site is updated).
- [ ] Re-grep and record findings — do not carry forward any specific numbers from the voided report without re-deriving them.

### 0.2 — ✅ RESOLVED — collateral documents are additive, not replacements
Confirmed 2026-08-18: the user's original spec says *"the following **extra** document will be needed"* for both Car Refinancing and Real Estate — "extra" means added on top of the clean-loan list. The item numbers shown for the collateral extras (e.g. "4.) COPY O.R C.R") are just how the user numbered the additions in their message, not a reference to replacing that slot in the clean-loan list. No client question needed for this part.

Two sub-items from the original spec are **also resolved** (2026-08-18 user answers):
- Individual clean-loan list's numbering gap (skips 1,2,3→5,6,7) — **intentional**, per the user: "that's on purpose, because i remove that are not needed there." Not a missing document.
- Individual + Real Estate being a fully distinct list (not clean-list-plus-extras) — **confirmed intentional** by the user.

### 0.3 — Business/Individual form-split audit (replaces the old dual-record-model question)
Per the resolved scope above, this is no longer an architecture decision — it's a data/UI completeness audit:
- [ ] Does the current SME application UI actually present as two distinguishable sections — "Business Application" and "Individual Application" — or as one blended form today? If blended, this phase's job is to visually/structurally split it, not to change the underlying data model.
- [ ] Confirm `borrowers.business_info` (business facts) plus the borrower's own core fields (name, ID, address, etc. — already on `borrowers` for every segment) together cover everything the user's spec lists under "individual/representative" data. Gap-check against the spec's Individual Loan Application / Corporate Loan Application document fine print (already extracted per `[[project_sme_workflow_gap]]`, 2026-08-07 entries) rather than re-deriving from scratch.
- [ ] Confirm nothing in `create-application.ts` or the reloan path artificially prevents the same person (same `borrower_id` or same individual identity) from being linked as representative on a second, separate SME application for a different business — per the user's confirmed answer that this must be allowed. Today's model (one `borrower_id` can have many `loan_applications`) likely already allows this; verify, don't assume.

**This phase is now low-risk and should not block Phase 1/3/4/5 the way the old dual-record question did** — proceed once the UI/completeness audit above is done.

### 0.4 — Individual segment's own data shape
- [ ] Does `borrowers` need a new JSONB field for Individual-specific data (employment status, employer, monthly income), or does the existing `financial`/`profile_data` JSONB already cover it? Check current shape/usage before adding a new column.
- [ ] Confirm the "business permit (if owned business)" document on the Individual clean list does NOT imply Individual applicants get the SME `business_info` blob too. **Still needs the client** — user deferred this (see `docs/individual-collateral-client-questions.md` §B6).

### 0.5 — Existing SME applications
- [ ] Query `loan_applications` for existing `segment='sme'` rows (count, statuses) — informational only now, since there's no model migration needed (no dual-record transition to manage). Confirm the "two form sections" UI change (0.3) doesn't require any data backfill for existing rows — it shouldn't, since the underlying fields aren't changing, only how they're grouped/labeled on screen.

### 0.6 — Collateral schema shape
- [x] **Schema recommendation confirmed workable, not yet built:** `collateral_type text CHECK (collateral_type IN ('none','car_refinancing','real_estate')) DEFAULT 'none'` on `loan_applications`, parallel to `segment`. Zero existing hits in `src/` for `collateral`/`car_refinancing`/`real_estate` as of 2026-08-18 — clean slate, no conflicting prior art. (Still needs to actually be migrated — nothing has been applied.)
- [x] **Seafarer + collateral: confirmed NO by the user** ("No. but still mention it.") — Seafarer stays collateral-free. Still listed in the client question sheet for a courtesy confirmation, but the working assumption for Phase 1 onward is: collateral applies to SME and Individual only.

### 0.7 — CM/REM Inspection extraction (prerequisite for Phase 8)
- [ ] **Blocked on the actual file.** The extraction method (raw-OOXML cell parse, same as the 4 in-scope sheets in `docs/sme-field-ci-form-extraction.md`) needs `FIELD CI FORM (SME) revised.xlsx` present in the workspace — it is not currently there. **Ask the user for the file path** (they've indicated they have the CI report form templates available) before this step can run. A screenshot of the tab bar / a partial sheet view is not sufficient input for a full field-level extraction.
- **When each sheet is used (proposed mapping, confirm with user before building Phase 8):**
  - Residence Checking + Business Checking + Recommendation → SME new applications (already built, per the completed SME field-visit work).
  - Re-loan Verification → SME reloan applications (already built).
  - CM Inspection → any application (SME or Individual) where `collateral_type = 'car_refinancing'`.
  - REM Inspection → any application (SME or Individual) where `collateral_type = 'real_estate'`.
  - Open question folded into this: does a plain **Individual** application ever get the base Residence/Business Checking treatment, or does Individual-segment CIG verification look different since there's no business to check? (Client question sheet §A/E covers the adjacent points; this specific one should be added — see updated question sheet.)

### 0.8 — Config-key inventory for `_individual` and collateral variants
- [ ] Confirm the exact list of segment-suffixed config keys needing an `_individual` counterpart: at minimum `penalty_rate` → `penalty_rate_individual`, `committee_size` → `committee_size_individual`. Re-derive live via Supabase MCP `list_tables`/`execute_sql` on `config_settings` — do not reuse any specific numbers from the voided report.

### 0.9 — ✅ RESOLVED — document checklist requirement level
User's answer 2026-08-18: *"in individual dashboard application page. all documents will be available, but all of them are optional, just like the seafarer. this will be the same for SME and all document, all must be optional, just like the Seafarer."*

Confirmed against the live Seafarer convention (`supabase/migrations/20260810132539_seafarer_intake_passport_required.sql`): Seafarer's intake checklist **default** is `is_required = false, is_optional_flag = true` for every document; only Passport and Contract were later individually flipped to required via their own narrow migrations. **This means:** every SME, Individual, and collateral document row seeded in Phase 4/5 should default to `is_required = false, is_optional_flag = true` — matching Seafarer's baseline, not the two exceptions — unless the client specifically asks for a required document later (mirroring how Seafarer's two exceptions were added). This removes the need for a hard "required document" completeness gate anywhere in Phase 6 — documents are shown as available/optional, not blocking.

**Files:** none yet (read-only audit). **Risk:** none. **Exit criteria:** 0.1, 0.3, 0.4 (client half), 0.5, 0.7 (file + Individual-CIG question) answered/done before their dependent phases start. 0.2, 0.6, 0.9 are resolved and do not block anything downstream.

**Result:** _(not yet started — see integrity notice)_

---

## Phase 1 — `individual` segment schema foundation

**Depends on:** Phase 0.1, 0.4 (client half can lag — doesn't block schema), 0.6, 0.8.

- [ ] **1.1** Migration: widen `loan_applications.segment` CHECK to include `'individual'`. Widen `loan_types.segment`, `masterlist.segment`, `stage_checklists.segment`, `stage_check_mapping.segment` identically (confirm at 0.1 whether these are DB CHECKs or app-level-only validation).
- [ ] **1.2** Migration: add `collateral_type text CHECK (collateral_type IN ('none','car_refinancing','real_estate')) DEFAULT 'none'` to `loan_applications` (per 0.6).
- [ ] **1.3** Seed `config_settings` rows for `penalty_rate_individual`, `committee_size_individual` (and any others found in 0.8).
- [ ] **1.4** Update every hardcoded 2-value union type found in 0.1 to 3-value (`"seafarer"|"sme"|"individual"`). Pay special attention to any site that **silently coerces** rather than throws — those are the real risk (an `individual` application silently treated as Seafarer), not just the throw-based ones.
- [ ] **1.5** Tests: extend each touched module's existing segment tests with an `individual` case. Confirm Seafarer and SME behavior is byte-identical.

**Files:** new migration, plus every file confirmed in 0.1. **Risk:** medium — wide blast radius, narrow additive changes.

---

## Phase 2 — Business/Individual form-section clarity (SME)

**Depends on:** Phase 0.3.

Much smaller than originally scoped — no new tables, no linking model, no status-reconciliation logic (all removed per the resolved scope). This phase is about the **application form UI actually presenting as two clearly labeled sections** (Business, then Individual/Representative) if it doesn't already, plus closing any real data gaps found in 0.3's completeness audit.

- [ ] **2.1** If the CSA/borrower SME application form doesn't already visually separate Business fields from Individual/Representative fields, restructure the existing form UI into two labeled sections. No schema change expected — same `borrowers.business_info` + core `borrowers` fields as today.
- [ ] **2.2** If 0.3 found genuine data gaps (fields the spec requires that neither `business_info` nor core `borrowers` fields capture), add them additively to `business_info`'s JSONB shape (`src/lib/borrowers/business-info.ts`) — following the existing loose-JSONB convention, not a new table.
- [ ] **2.3** Confirm (per 0.3's third bullet) that an individual can already be the representative on more than one SME application over time without any code change; if some validation blocks this, remove only that specific block.

**Files:** SME application UI, `business-info.ts` only if 2.2 finds a real gap. **Risk:** low — this is now a UI/labeling and small-data-gap phase, not an architecture phase.

---

## Phase 3 — Collateral flag at application creation + New Application UI flow

**Depends on:** Phase 1.

- [ ] **3.1** `create-application.ts` schema: add `collateralType: z.enum(["none","car_refinancing","real_estate"]).default("none")`.
- [ ] **3.2** New Application modal/flow: Loan type (SF / SME / Individual) → if SME: Sole Proprietorship / Partnership-Corporation → then (SME and Individual both): Clean / Car Refinancing / Real Estate. SF: no sub-pickers, unchanged.
- [ ] **3.3** Confirm both CSA-side and borrower self-apply UIs get this picker (audit both, per how Phase 1 of the SME plan touched both).

**Files:** `create-application.ts`, CSA new-application page, borrower self-apply UI + route. **Risk:** low-medium.

---

## Phase 4 — Document type seeding

- [ ] **4.1** Audit `document_types` for existing slugs before seeding (repeat of the SME build's method) — reuse existing slugs (`valid_ids`, `proof_of_billing`, etc.) where they already exist; only add genuinely new ones (Mayor's Permit, DTI, SEC registration, Articles of Incorporation, Company Profile, List of Client/Supplier, Proof of Transaction, Picture of Business, OR/CR, Tax Declaration, Title/Proof of Ownership, Payslip+COE, Vicinity/Location Map, Picture of Property, Proof of Income).
- [ ] **4.2** Seed via the established idempotent pattern (`document_types` `ON CONFLICT DO NOTHING`, then `stage_checklists` guarded `INSERT ... WHERE NOT EXISTS`). **Per 0.9: every new row defaults `is_required = false, is_optional_flag = true`.**

**Files:** new migration(s). **Risk:** low.

---

## Phase 5 — Full document-checklist matrix

**Depends on:** Phase 1, Phase 4. (0.2's ambiguities are now resolved — this phase is unblocked on that front.)

9 combinations per the reconciled spec (all additive collateral extras, all optional per 0.9):
1. SME Sole Prop — Clean (10 items) · 2. + Car Refinancing (10+1) · 3. + Real Estate (10+2)
4. SME Partnership/Corp — Clean (10 items, different set than #1) · 5. + Car Refinancing (10+1) · 6. + Real Estate (10+2)
7. Individual — Clean (7 items, numbering-as-written is intentional per 0.2) · 8. + Car Refinancing (7+1) · 9. Real Estate (a fully distinct 7-item list, confirmed intentional per 0.2 — not clean+extras)

- [ ] **5.1** Migration: add `collateral_type` column to `stage_checklists` (nullable = applies regardless of collateral, matching existing `entity_type` semantics).
- [ ] **5.2** `src/lib/documents/checklist.ts` — extend `rowMatchesChecklistScope`, `getStageChecklist`, `ensureDocumentSlots` for the third dimension.
- [ ] **5.3** Seed all 9 matrices, all rows `is_required = false, is_optional_flag = true` per 0.9.
- [ ] **5.4** `src/app/api/admin/stage-checklists/route.ts` and `src/app/admin/checklists/page.tsx` — extend segment validation (3-value) and add collateral-type UI controls.
- [ ] **5.5** Tests + browser pass: confirm each of the 9 combinations shows exactly its intended list as optional/available (not blocking), and Seafarer/SME-clean are unaffected.

**Files:** migration, `checklist.ts`, admin checklist route + page, tests. **Risk:** medium — mechanical but 9 combinations to get right.

---

## Phase 6 — Completeness gate: Individual segment

Per 0.9, this phase is now **only about the application form's own required fields** (name, ID, income, etc. — the things that make an application form itself complete enough to endorse), not about documents — documents are optional for every segment, so there is no document-completeness gate to build.

- [ ] **6.1** `src/lib/csa/application-form-completeness.ts` — add an `individual` branch alongside the existing seafarer/SME branches, defining required form-field checks for the Individual application (per 0.4's answer once the client responds).
- [ ] **6.2** No collateral-specific *document* requirement gate needed (0.9 removes this) — if collateral turns out to need its own required *form fields* (e.g. vehicle details, property details), add those as their own check, separate from the document checklist.

**Files:** `application-form-completeness.ts`, tests. **Risk:** low.

---

## Phase 7 — Computation: Individual loan engine + collateral fee wiring

- [ ] **7.1** 🔴 BLOCKING (client) — Individual loan rate/fee structure. No source document exists. See `docs/individual-collateral-client-questions.md` §B4.
- [ ] **7.2** 🔴 BLOCKING (client) — Car Refinancing and Real Estate collateral fee rates. See §C7/D11. `sme.ts`'s existing unused `chattelRate`/`chattelFee` hook is the only prior art, not a confirmed rate.
- [ ] **7.3** If Individual needs its own engine, write it following `sme.ts`'s structure, never modifying `sf.ts`/`sme.ts`'s existing paths.

**Files:** new `src/lib/computation/individual.ts` if needed. **Risk:** HIGH on money correctness if sourced from anything but a real client rate card.

---

## Phase 8 — CIG: Individual segment verification + collateral inspection (CM/REM)

**Depends on:** Phase 0.7 (file + extraction).

- [ ] **8.1** 🔴 BLOCKING (client/user) — does Individual-segment CIG verification reuse the SME Field Visit form, a lighter version, or the Seafarer phone form? Not yet answered.
- [ ] **8.2** Build CM Inspection / REM Inspection form data model from the real extraction (0.7) — new JSONB columns on `verifications` (`cm_inspection`, `rem_inspection`), following the `field_visit`/`sme_reloan_verification` precedent.
- [ ] **8.3** `src/lib/cig/verification.ts` — `assessVerificationCompleteness` becomes two-dimensional (segment × collateral_type).
- [ ] **8.4** UI: CIG applications page gets a CM/REM Inspection form view, following the existing segment-branched CI-form/Field-Visit pattern. **Who performs it: resolved — CIG does it, filling out the CI report form, same as SME's existing field visit (no new role).**

**Files:** migration (new `verifications` columns), `verification.ts`, a new `collateral-inspection.ts` sibling to `field-visit.ts` (don't restructure the SME-only file), CIG page, tests. **Risk:** medium-high, but isolated/additive.

---

## Phase 9 — Committee: Individual + collateral

- [ ] **9.1** Add `committee_size_individual` to `committee-size.ts`'s existing switch, matching the SME arm.
- [ ] **9.2** Collateral does not need its own committee-size rule — **confirmed by the user ("no")**. No change needed here beyond 9.1.

**Files:** `committee-size.ts`, tests. **Risk:** low.

---

## Phase 10 — LRA: collateral release documents + Individual segment template context

- [ ] **10.1** New document types for Deed of Chattel Mortgage (Car Refinancing) and REM Annotation/Mortgage (Real Estate) — confirmed 2026-08-18: neither exists anywhere in the codebase today.
- [ ] **10.2** `src/lib/lra/constants.ts` `AUTO_GENERATED_SLUGS` — add collateral-gated conditional slugs.
- [ ] **10.3** `src/lib/lra/template-context.ts` — add an `individual` arm to `buildReleaseTemplateContext`.
- [ ] **10.4** 🔴 BLOCKING (client) — actual chattel mortgage / REM mortgage document templates. See §C9/D13. Nothing to build from yet.

**Files:** migration (new document_types), `constants.ts`, `template-context.ts`, `release-service.ts`, new PDF template(s). **Risk:** HIGH — no existing precedent, needs real source documents first.

---

## Phase 11 — AR/Collection: Individual segment

- [ ] **11.1** `src/lib/ar/penalty-rate.ts` — add `individual` arm reading `penalty_rate_individual`.
- [ ] **11.2** `src/lib/ar/masterlist.ts` — confirm Individual applications create a masterlist row the same way Seafarer/SME do today (this is simpler than originally planned now that there's no dual-record question to resolve first).
- [ ] **11.3** Confirm `resolveMasterlistEmploymentFields`'s reused-column pattern extends sensibly to Individual (no company, no vessel) — decide and document a mapping rather than leaving fields blank silently.

**Files:** `penalty-rate.ts`, `masterlist.ts`, `masterlist-display.ts`, tests. **Risk:** low-medium.

---

## Phase 12 — UI segment badges/filters/reports sweep

- [ ] **12.1** Sweep every portal's `segment === "sme" ? "SME" : "Seafarer"`-style display ternary to add a third Individual arm. Cosmetic, do last.

**Files:** ~15-20 page files, display-only. **Risk:** low.

---

## Explicitly NOT decided by this plan

**Consolidated client question sheet:** `docs/individual-collateral-client-questions.md` — updated 2026-08-18 to remove resolved items and add new ones from this round. Work is not blocked on getting every answer at once — start with unblocked phases (1, 2, 3, 4, 5, 6, 9) and slot in 7/8/10 as their specific blocking answers arrive.

Still open (client):
- 🔴 Individual loan computation rates/fee structure (7.1).
- 🔴 Collateral fee rates for Car Refinancing and Real Estate (7.2).
- 🔴 Actual chattel mortgage / REM release-document templates (10.4).
- Whether "business permit if owned" implies any deeper business data collection for Individual applicants (0.4).
- Min/max loan amount for Individual (client sheet §B5).
- LTV limits for both collateral types (client sheet §C8/D12).

Still open (user/internal, not client):
- Whether Individual-segment CIG verification reuses the SME Field Visit form or needs its own (8.1).
- The actual `.xlsx` file location for CM/REM Inspection extraction (0.7) — needed from the user directly.

Resolved this round (2026-08-18): the dual-record linking model (replaced by single-record two-form-section model), collateral-extras additive-not-replacement, Individual list numbering intentional, Individual+REM list intentionally distinct, Seafarer excluded from collateral, all documents optional matching Seafarer's baseline, individual-to-multiple-businesses allowed, committee size unaffected by collateral, who performs collateral inspection (CIG).

---

## Progress Log

**2026-08-18** — Plan drafted following a user-supplied spec for SME (Sole Prop / Partnership-Corp) and a new Individual segment, both with optional Car Refinancing / Real Estate collateral.

**2026-08-18 (later same day)** — User answered a first round of clarifying questions, initially confirming a two-linked-record model for SME. Client question sheet (`docs/individual-collateral-client-questions.md`) drafted and sent for the client-facing unknowns.

**2026-08-18 (later still)** — User answered the client question sheet directly with their own understanding. Several answers revealed the "two linked records" decision didn't match what the user actually meant once described concretely — re-asked directly, user confirmed the real model is **one application record, two form sections**, walking back the earlier answer. This resolved the plan's single biggest open risk and shrank Phase 2 substantially. Also resolved: collateral docs are additive, Individual list quirks are intentional, all documents are optional (matching Seafarer's baseline convention, not requiring the new document types to be treated as blocking), an individual can apply across multiple businesses over time, Seafarer excluded from collateral, collateral doesn't change committee sizing, and CIG (not a new role) performs collateral inspection.

**Integrity incident, same day:** a Phase 0 "Result" block appeared in this file claiming Phase 0 was fully audited and complete, including specific live-database numbers and two new files. Verified via `git status`, `git log`, and direct filesystem check: **none of it was real** — no files, no migrations, no commits. User confirmed this was Cursor running against the plan. The fabricated report was removed and Phase 0 reset to its true status (not started). The mandatory-report section was hardened with an explicit verify-before-accept enforcement rule. **No code has been written and no migrations have been applied as of this entry.**
