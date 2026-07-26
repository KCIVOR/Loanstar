# Document Template System — Implementation Plan

**Status:** COMPLETE — Phases 1–7 done (2026-07-14). The template engine is the sole document renderer; the legacy hardcoded renderer was retired. Outstanding (user actions, not code): publish the Endorsement Letter after Legal review; optional borrower self-service Application Form capture (separate workstream). NOTE: Phase 7 was executed at the user's explicit direction despite the "production soak" gate not having elapsed and the live authenticated release E2E still being unverified — the fallback safety net is gone, so a broken/unpublished release template would now hard-error generation (all 7 confirmed active+published at retirement time).
**Author:** Audit + plan pass, 2026-07-14
**Goal:** Make every system-generated document (a) render as a proper, official-looking PDF and (b) be editable by a superadmin, without breaking the existing release/signing/closure flow.

### Progress log
- **2026-07-14 — Phase 7 DONE (legacy renderer retired).** Executed at the user's explicit direction after being shown the gate/risks (no prod soak, unverified live E2E, non-git workspace = no easy revert). Steps: (1) decoupled the shared utilities the legacy files hosted — moved `formatMoney` to new `src/lib/documents/format.ts` (repointed `template-context.ts` + `generators/shared.ts`), and switched `release-service.ts` from `hashPdfContent` to the render engine's byte-identical `hashPdf`; (2) removed the fallback branch in `generateReleaseDocuments` — it now requires a published template per slug and throws `No published template for release document "<slug>"` otherwise; (3) DELETED `src/lib/lra/pdf/documents.ts` + `src/lib/lra/pdf/simple-pdf.ts` (the `pdf/` dir is now empty). Verified: no dangling refs; type-clean; 194/194; all 7 release slugs confirmed active+published on remote (so the no-fallback path can't hard-error); re-rendered all 7 release template bodies through the sole engine path → valid PDFs. Pure code change — no migration. Render engine docstring updated to note it's the sole renderer. Live authenticated release generation remains the user's spot-check.
- **2026-07-14 — Phase 6 increment 6 DONE (code-only fix 4: AR dual-slug).** Migration `20260714060000_p8_ar_voucher_dual_slug.sql` (both folders, applied to remote via MCP). Renamed the AR-UPLOAD `document_types` in place: `ar_check_voucher` → `ar_check_voucher_posting` ("AR Check Voucher (Posted)"), `ar_cash_voucher` → `ar_cash_voucher_posting`. Rename-in-place (types referenced by id) → no data migration, no code change (nothing referenced the AR-upload slug by name). The LRA-generated side (`document_templates` + `generated_documents` slug `ar_check_voucher`/`ar_cash_voucher`, AUTO_GENERATED_SLUGS, legacy renderer) is untouched. Verified on remote: accounting checklist now points to the *_posting slugs (sort 2/3); LRA template slugs intact. All 4 Phase 6 code-only fixes now complete. 194/194; type-clean (no code changed for this fix).
- **2026-07-14 — Phase 6 increment 5 DONE (3 of 4 code-only fixes).** Migration `20260714050000_p8_release_close_hardening.sql` (both folders, applied to remote via MCP). (1) **PN/DS scan-back-in gate**: added document types `signed_promissory_note` + `signed_disclosure_statement`, required on the 'release' checklist (sort 6/7); `closeRelease()` now enforces all of `REQUIRED_SIGNED_RELEASE_SLUGS` = [signed_check_voucher, signed_promissory_note, signed_disclosure_statement] via new `resolveSignedReleaseDocuments` + pure `missingSignedReleaseSlugs`/`signedReleaseSlugLabels` (release-service.ts); throws listing the missing scans. `resolveSignedVoucherDocumentId` kept as a thin wrapper (back-compat). (2) **Retired briefing_information** (dead — briefing is the `briefings` click-sign table; zero code refs): removed from 'release' checklist. (3) **Retired pdc_encoding_sheet** (dead — PDC is the structured `pdc_checks` flow; zero code refs): removed from 'signing_with_pdc' checklist. Document TYPE rows kept (only checklist slots removed) so historical uploads keep their type. 5 new unit tests; 194/194 suite green; type-clean. Verified on remote: 'release' now has signed_promissory_note/signed_disclosure_statement, no briefing_information; 'signing_with_pdc' has no pdc_encoding_sheet. **Fix 4 (AR ar_check_voucher/ar_cash_voucher dual-slug) still pending a user decision** — the 'accounting' stage upload slots share the slug with the LRA-generated vouchers (different tables: documents vs generated_documents).
- **2026-07-14 — Phase 6 increment 4 DONE (UI trigger buttons).** Reusable `src/components/documents/GeneratedDocPanel.tsx` (self-contained generate + list + download-PDF card; GETs the list on mount, POSTs `{}` to generate, shows signed download links). Wired: collector accounts page (`src/app/collector/accounts/page.tsx`) gets a per-row "Demand letter" button opening new `src/components/collector/DemandLetterModal.tsx` (stage select first_reminder/second_demand/final_demand + generated-letter list); LRA workspace (`src/app/lra/applications/[id]/page.tsx`) gets Acknowledgement Receipt + Final Computation Sheet panels after the release checklist; CSA workspace (`src/app/csa/applications/[id]/page.tsx`) gets a Loan Application Form panel after the intake checklist. Type-clean; 189/189 tests still green; new files lint-clean except the repo's pre-existing accepted `react-hooks/set-state-in-effect` pattern (same as the shipped accounts page; eslint exits 0). Browser check: dev server compiled all 3 routes with no build errors / no 500s (auth-redirect 307→login as expected); no server errors in logs. **Live click-through past the auth gate is the user's spot-check** (needs login + real data). Endorsement Letter still unwired (DRAFT, no button) pending Legal.
- **2026-07-14 — Phase 6 increment 3 DONE (wire generation: Final Computation Sheet + Application Form).** `src/lib/documents/generators/final-computation-sheet.ts` (pure `buildFinalComputationRows(original, renegotiated|null)` — original=earliest computation version, renegotiated=active version when it differs, blank column otherwise; `generateFinalComputationSheet(supabase,{applicationId,actorId})`, module=release_lra, replaceUnsigned) and `application-form.ts` (`generateApplicationForm(supabase,{applicationId,actorId})` — borrower profile + active computation for loan-requested figures, module=intake, replaceUnsigned; printable only — self-service capture stays separate). API routes: `POST/GET /api/lra/applications/[id]/final-computation-sheet` (release_lra) and `POST/GET /api/csa/applications/[id]/application-form` (intake), audited, GET returns signed download URLs. 3 new unit tests for the computation-row pairing; 189/189 suite green; type-clean. All 4 active new documents now have generation entry points. Remaining Phase 6: UI trigger buttons in the workspaces; publish endorsement_letter after Legal; the 4 code-only fixes. Live authenticated E2E still a user spot-check.
- **2026-07-14 — Phase 6 increment 2 DONE (wire generation: Demand Letter + Acknowledgement Receipt).** New `src/lib/documents/generators/`: `shared.ts` (COMPANY_NAME, joinAddress, formatDate, daysBetween, addDays; re-exports formatMoney + pesosInWords as the single money/words source), `demand-letter.ts` (pure `buildDemandLetterContext` + `generateDemandLetter(supabase,{masterlistId,demandStage,actorId,deadlineDays=15})` — loads masterlist+borrowers+schedules, computes daysPastDue from earliest open installment, sums penalties across open installments, total=outstanding+penalty, append-mode so the reminder→demand→final series accumulates; `DemandStage` = first_reminder|second_demand|final_demand, `isFinal` reveals the legal clause), `acknowledgement-receipt.ts` (`generateAcknowledgementReceipt(supabase,{releaseFileId,actorId})` — reuses `buildReleaseTemplateContext` + adds `amountReleased`, module=release_lra, links release_file, replaceUnsigned). API routes: `POST/GET /api/collector/accounts/[id]/demand-letter` (collection edit/view; GET returns rendered docs + signed download URLs) and `POST/GET /api/lra/applications/[id]/acknowledgement-receipt` (release_lra), both audited via writeAuditEvent. 6 new unit tests for the demand-letter context math/stage/flag; 186/186 suite green; type-clean. Verified `amortization_schedules.penalty_amount` + masterlist columns exist on remote. **NOT yet done:** UI trigger buttons in the collector/LRA workspaces; authenticated live E2E (needs login + a real masterlist account / release file — user's spot-check). Endorsement Letter intentionally unwired (still DRAFT pending Legal).
- **2026-07-14 — Phase 6 increment 1 DONE (seed 5 new templates, applied to remote).** Migration `20260714040000_p8_seed_new_document_templates.sql` (both folders) seeds the 5 NEW documents: `demand_letter` (collection; parameterized series via `{{demandStage}}` + `isFinal` legal-action clause), `acknowledgement_receipt` (release; check/cash `data-if`), `endorsement_letter` (release), `final_computation_sheet` (computation; original-vs-renegotiated `computationRows` repeat), `application_form` (intake; printable only — self-service capture is separate). 4 published v1; **`endorsement_letter` seeded as DRAFT** (plan flags it "needs Legal review" → `getPublishedTemplate` returns null until a superadmin publishes). Bodies are best-guess drafts (plan-sanctioned; refine in editor). Extended `src/lib/documents/templates/fields.ts` with the new merge keys (demandStage/outstandingBalance/penaltyAmount/totalAmountDue/daysPastDue/dueDate/paymentDeadline/amountReleased/endorsedTo/endorsementPurpose/applicationNo/applicationDate), the `computationRows` collection, and the `isFinal` flag + sample data. All 5 bodies render to valid PDFs against the sample context (verified via throwaway script); 180/180 suite green; type-clean. Applied to remote via MCP `apply_migration`; verified 4 published + 1 draft. **DORMANT** — no stage generates these yet. Remaining Phase 6: (a) wire generation entry points via `renderAndStore` at the right stage (Demand Letter=collection/remedial, Acknowledgement Receipt=release, Final Computation Sheet=bridge/LRA, Application Form print=intake; Endorsement pending Legal); (b) code-only fixes: PN/DS scan-back-in gate in `closeRelease`, `ar_*_voucher` dual-slug disambiguation, retire `briefing_information` upload slot, `pdc_encoding_sheet` keep/retire decision. Open decisions still affecting scope: D2 (demand series depth — current template already supports it), D3 (Declaration Form in/out — NOT seeded), D5 (Denial Notice printable — NOT seeded, stays email-only).
- **2026-07-14 — Phase 5 DONE (applied to remote).** Applied via Supabase MCP `apply_migration` (name `p8_rendered_documents`) to project `acopcwlhkovssjnrqygk` — bypassing the CLI `db push` history block. Verified on remote: table present, RLS enabled, 3 policies, 3 indexes (PK + 2), 1 updated_at trigger; security advisor shows NO new RLS gap (all remaining warnings pre-existing/unrelated). Added `rendered_documents` — the general-purpose sibling of `generated_documents` for NON-release docs — via migration `20260714030000_p8_rendered_documents.sql` (written to BOTH folders, identical). Keyed by `loan_application_id` (+ optional `release_file_id` SET NULL), records `template_version_id` (SET NULL) and an owning `module` text column that RLS gates against: SELECT = super admin OR `has_module_permission(module,'view')` OR borrower-owns-application; INSERT/UPDATE = super admin OR `has_module_permission(module,'edit')` (UPDATE only while `is_finalized=false`); no DELETE policy. Optional signing/finalize columns mirror `generated_documents`. Generation helper `renderAndStore(supabase, {slug, module, applicationId, context, releaseFileId?, actorId?, replaceUnsigned?})` in `src/lib/documents/render-store.ts` — fetches borrower_id, resolves the published template (NO legacy fallback — errors if none), renders+hashes+uploads to `${borrowerId}/rendered/${applicationId}/${slug}-${docId}.pdf`, optionally supersedes prior unsigned rows, inserts the audit row; plus `listRenderedDocuments` + `getRenderedDocumentDownloadUrl`. 5 new unit tests (stubbed Supabase, real render/hash); 180/180 suite green; new code type-clean (only the 6 pre-existing `blri-f2.test.mts` errors remain). **NOT applied to remote:** `db push` is blocked — remote history has 3 orphan ad-hoc stamps (`20260713193306`, `20260714022836`, `20260714023920`, = how Phase 1/4 p8 were applied last session) not in the local folder, while local names `2026071400/01/02` show unapplied though their objects exist on remote. User will apply `030000` via a to-be-connected Supabase MCP rather than reconcile migration history now.
- **2026-07-14 — Phase 1 DONE.** Migration `20260714000000_p8_document_templates.sql` written to both folders (identical), applied to the LoanStar project `acopcwlhkovssjnrqygk`. Verified: `document_templates` + `document_template_versions` created with RLS enabled, all 4 policies present, "one published per template" partial unique index, immutability trigger, and nullable `generated_documents.template_version_id` audit column. Security advisor shows no new RLS gaps. Purely additive/dormant — zero behavior change.
- **2026-07-14 — Phase 4 DONE (all 7 slugs).** Increment 2 added `blri`, `promissory_note` (full legal prose + SUBSCRIBED-AND-SWORN notary block), `disclosure_statement` (RA 3765 TILA layout) via migration `20260714020000_p8_seed_blri_pn_ds_templates.sql` (both folders, applied, all published v1). Context builder enriched additively (loanType, addonMonths, interestRate as %, paymentEnds, principal/total/monthly-in-words, per-charge amounts for the DS). All 3 bodies render to valid PDFs; 175/175 suite green (x2), type-clean. All 7 release documents now render from published templates; the legacy `renderDocumentPdf`/`simple-pdf.ts` remain as the fallback (untouched) until Phase 7. Still NOT verified: the authenticated in-app release flow actually generating these (needs a loan in signing state + login) — logic/render/DB state verified, live E2E is the user's spot-check.
- **2026-07-14 — Phase 4 in progress (4 of 7 slugs).** Wiring done (the risky, generic part): `generateReleaseDocuments` now builds a path-level merge context (`src/lib/lra/template-context.ts` — maps BlriData + computation + borrower → catalog keys, incl. `pesosInWords` amount-in-words and path-aware check/cash accounting entries) and, per slug, uses a published template via `getPublishedTemplate` (`renderTemplateToPdf`) or falls back to the legacy `renderDocumentPdf`; `generated_documents.template_version_id` records which. Seeded + published v1 templates for the 4 vouchers (`check_voucher`, `cash_voucher`, `ar_check_voucher`, `ar_cash_voucher`) via migration `20260714010000_p8_seed_voucher_templates.sql` (both folders, applied to DB, verified active+published). All 4 seeded bodies render to valid PDFs; context builder unit-tested; 175/175 suite green (x2), type-clean. Bodies capture all voucher DATA but are not pixel-clones of the scans — refine in the editor. Fields not yet in the schema (disbursement check number, prepared/checked/approved names) render blank. **Remaining: `blri` (big form + amortization table), `promissory_note` (full legal prose, notarized block), `disclosure_statement` (TILA table).** Fallback means the un-seeded 3 still use the legacy renderer — nothing breaks.
- **2026-07-14 — Phase 3 DONE.** Superadmin template editor shipped. Server: `src/lib/documents/templates/` (`service.ts` — list/get/create/saveDraft/publishVersion with archive-then-publish; `fields.ts` — merge-field catalog + `buildSampleContext` for preview). API under `src/app/api/admin/document-templates/` (list+create, get, `PUT /draft`, `POST /publish`, `POST /preview` → binary PDF, `runtime="nodejs"`), all `system_config`-gated + audited. UI: `/admin/document-templates` (list + create modal) and `/[id]` (editor host + version history), new Sidebar item "Doc Templates". Editor `src/components/admin/TemplateEditor.tsx` — dual-mode (visual `contentEditable` + toolbar + merge-field chips as `contenteditable="false"` atoms; HTML source mode) + live PDF preview. Chose this over TipTap (no heavy dep; source mode handles `data-repeat` tables the visual editor can't). Verified on the running dev server: page compiles + auth-redirects, list route 401, preview route loads pdfmake/jsdom and 401s (auth gate). Two engine issues found & fixed during verification: (1) Turbopack broke pdfmake→fontkit's runtime file reads — added `serverExternalPackages` (pdfmake, @foliojs-fork/pdfkit, @foliojs-fork/fontkit, html-to-pdfmake, jsdom) to `next.config.ts`; (2) render was non-deterministic (flaky hash in full suite) — root cause was the embedded PDF `/CreationDate` timestamp (not fonts); `makeDeterministic` now pins dates + `/ID`, and the renderer switched to standard-14 Helvetica (no font embedding/subsetting, ~6× smaller PDFs). Now 8/8 full-suite runs clean, 80/80 interleaved renders byte-identical, 171 tests pass, type-clean. NOT yet verified: authenticated UI click-through (needs a superadmin login) — the editor/preview happy-path in-browser.
- **2026-07-14 — Phase 2 DONE.** Renderer decided (D1): pure-JS `pdfmake@0.2.20` + `html-to-pdfmake` + `jsdom` (no Chromium; Vercel/serverless-safe). New engine at `src/lib/documents/render/`: `merge.ts` (`{{token}}` + `data-repeat` + `data-if`/`data-unless`, HTML-escaped), `pdf.ts` (HTML→PDF, output made deterministic by zeroing the trailer `/ID` length-preservingly), `fonts.ts` (embedded Roboto), `index.ts` (`renderTemplateToPdf`, `hashPdf`). 13 new unit tests incl. byte-determinism → stable hash; full suite 168/168 green; new code type-clean. Legacy `renderDocumentPdf`/`simple-pdf.ts` untouched. Nothing in the live flow calls the engine yet. Added deps introduced no new `npm audit` findings. NOTE: pre-existing `tsc` errors in `src/lib/lra/__tests__/blri-f2.test.mts` (6, unrelated to this work) remain.

---

## 1. Audit summary (what exists today)

Everything below was read directly from the codebase — no assumptions.

### 1.1 How generation works now
- **Slug list:** [`AUTO_GENERATED_SLUGS`](../src/lib/lra/constants.ts) maps each release path (`with_pdc` / `without_pdc`) to 5 document slugs: `blri`, `promissory_note`, `disclosure_statement`, `check_voucher`/`cash_voucher`, `ar_check_voucher`/`ar_cash_voucher`.
- **Renderer:** [`renderDocumentPdf(slug, blri, netReleased)`](../src/lib/lra/pdf/documents.ts) is a hardcoded `switch`. Each case returns an array of text strings passed to [`createSimplePdf()`](../src/lib/lra/pdf/simple-pdf.ts).
- **`createSimplePdf`** is a minimal PDF 1.4 writer: **Helvetica only, fixed line spacing, no tables, no images/logo, no bold/styling.** It physically cannot reproduce the sample documents.
- **Orchestration:** [`generateReleaseDocuments()`](../src/lib/lra/release-service.ts) loops the slugs, renders each PDF, hashes it (`hashPdfContent` = sha256), uploads to storage at `${borrower_id}/release/${releaseFileId}/${slug}-${docId}.pdf`, and upserts a `generated_documents` row `onConflict (release_file_id, document_slug)`.

### 1.2 The data model
`generated_documents` (from `20260706160000_p6_lra_release.sql`):

| column | note |
|---|---|
| `release_file_id` | **NOT NULL** FK → `release_files` — hard coupling to the release flow |
| `document_slug` | text |
| `storage_path` | the frozen PDF file |
| `content_hash` | sha256 of the exact bytes |
| `is_finalized` / `finalized_at` | locked at `closeRelease()` |
| `signed_at` / `signed_by` / `witnessed_by` / `signature_hash` | signing anchor; `witnessed_by` added later in `20260710110000_lra_flow_alignment.sql` |
| UNIQUE `(release_file_id, document_slug)` | one row per doc per release |

### 1.3 The signing / immutability model
- Signing ([`witnessSignGeneratedDocument`](../src/lib/lra/release-service.ts)) sets `signature_hash = content_hash` — the hash of the exact PDF bytes. `signed_by` stays the **borrower**; the LRA staffer is `witnessed_by`.
- The signed PDF is **already frozen as a stored file**. Editing a template later cannot alter an already-generated/signed PDF, because that PDF is a stored artifact, not re-rendered on read.
- Regeneration only happens while status ∈ {`ready_generate`, `awaiting_signatures`}; once all docs are signed the file advances to `awaiting_briefing` and can't be regenerated. **So there is no path today where a signed doc gets silently re-rendered.**
- **Implication for versioning:** we don't need to protect old *bytes* (they're frozen). We need to **record which template version produced each doc**, for audit/traceability.

### 1.4 Constraints that shape the plan
- **Release coupling:** `generated_documents.release_file_id NOT NULL` means Demand Letter, Endorsement Letter, Acknowledgement Receipt, and Final Computation Sheet **cannot** live in this table without a release file. They need a decoupled home.
- **No render library:** only the hand-rolled writer exists. `recharts`, `resend`, `zod` are present; **no** Puppeteer / pdf-lib / Handlebars / Chromium. Renderer choice is an open decision (§3).
- **Two migration folders:** every migration must be written to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` (they are currently identical).
- **RLS is mandatory & historically missed:** every new table needs RLS policies in the same migration (recurring gap pattern in this repo).
- **Gating exists:** `system_config` module + `is_super_admin()` RPC + `requireModulePermission()` already power the `/admin/*` pages. Reusable as-is.

### 1.5 Document inventory in scope
7 existing (convert to templates): `blri`, `promissory_note`, `disclosure_statement`, `check_voucher`, `cash_voucher`, `ar_check_voucher`, `ar_cash_voucher`.
5 new (build as templates): Demand Letter, Endorsement Letter, Acknowledgement Receipt, Final Computation Sheet, Application Form*.

\* **Application Form is a special case** — it's primarily a *borrower self-service data-entry form*, not a generated PDF. Its template/print version can use this engine, but the self-service capture is a separate workstream (borrower portal fields). Treated separately in Phase 6.

### 1.6 Findings from the sample documents that change scope
- **Promissory Note is notarized** — the sample has "SUBSCRIBED AND SWORN TO BEFORE ME", Doc/Page/Book/Series No., and a Notary Public block. A notarized doc **must** follow generate → wet-sign → notarize → scan-back-in. This reinforces adding the scan-back-in gate (Phase 6 code fix).
- **Vouchers carry real double-entry accounting** (account codes, debit/credit columns) — the template engine must support tables.
- **Acknowledgement Receipt has two channel variants** (check vs cash) — one template with channel-conditional content.
- **ATM Surrender form records a PIN in plaintext** — **do not** store PINs in the DB. Physical-only or masked (raised in Phase 6 if that form is digitized).

---

## 2. Design principles (non-negotiable, apply to every phase)

1. **Additive-first.** New tables/columns are nullable and dormant until explicitly wired. No existing column changes type or nullability.
2. **Fallback, never rip-and-replace.** The hardcoded renderer stays working until a published template for that exact slug is proven to produce a correct, signable PDF. Generation picks template-if-present, else hardcoded.
3. **Freeze on sign is preserved.** `signature_hash` semantics are untouched — always the sha256 of the final rendered bytes.
4. **Version pinning from day one.** Every generated doc records the `template_version_id` it came from.
5. **RLS + both migration folders every time.**
6. **Roll one slug at a time.** Migrating `blri` must not touch `promissory_note`'s path.

---

## 3. Open decisions — must resolve before Phase 1

| # | Decision | Options | Why it blocks |
|---|---|---|---|
| D1 | **PDF renderer** | ~~(a) headless Chromium; (b) pure-JS; (c) hosted service~~ | **RESOLVED 2026-07-14: pure-JS, no Chromium.** Deploy target = Vercel/serverless. Engine = `pdfmake` + `html-to-pdfmake` (HTML template → PDF), output made deterministic (fixed metadata) so signing hash is reproducible. |
| D2 | **Demand letter sequence** | Single "Final Demand" vs. a 1st/2nd/final series | Changes whether we seed one template or several |
| D3 | **Declaration Form** | In scope or dropped (conflicts with your earlier removal) | Adds/removes a document |
| D4 | **Clearance Form / Interview Notes** | Real Intake requirement vs. same as CIG CI Report | Adds/removes a document |
| D5 | **Denial Notice** | Keep as email only vs. also a printable letter | Adds a template or not |
| D6 | **Editor freedom** (already answered: *fully editable, full WYSIWYG*) | — | Confirmed; merge fields will be protected inline tokens even so |

---

## 4. Phased implementation

Each phase is independently shippable and leaves the app fully working. No phase after 1 is started until the prior one is verified.

### Phase 0 — Decisions & renderer spike *(no product code)*
- Resolve D1–D5.
- If D1 = Chromium: build a throwaway spike that renders one HTML string to a PDF **on the actual deploy target** and confirm cold-start time + binary size are acceptable. This de-risks the entire engine before any schema work.
- **Exit criteria:** renderer chosen and proven; open document decisions answered.
- **Breaks nothing** — no app code touched.

### Phase 1 — Template schema *(additive, dormant)*
- New migration (both folders) adding:
  - `document_templates` — one row per document type (slug, name, description, category, is_active).
  - `document_template_versions` — immutable versions (`template_id`, `version_no`, `body` (HTML), `merge_fields` metadata, `status` draft/published, `published_at`, `published_by`, `created_by`). Publishing a new version supersedes the prior published one; old versions are never edited.
  - `generated_documents.template_version_id` — **nullable** FK (null = produced by the legacy hardcoded renderer).
- Full RLS: superadmin/`system_config` read+write on templates; authenticated read of published versions (needed later for generation/preview).
- **Nothing reads these tables yet.** Zero behavior change.
- **Exit criteria:** migration applies clean on both folders; existing E2E release flow still green.

### Phase 2 — Rendering engine *(parallel, behind capability check)*
- New module `src/lib/documents/render/` implementing the D1 renderer: `renderTemplateToPdf(html, data) → Uint8Array`.
- Merge-field resolution: `{{field}}` tokens replaced from a typed context; tables/loops for schedules and accounting rows.
- **`simple-pdf.ts` and `renderDocumentPdf` are left completely untouched.**
- Unit tests: same input → deterministic bytes → stable hash (so signing stays reproducible).
- **Exit criteria:** engine renders a sample template to a correct PDF in isolation; nothing in the live flow calls it yet.

### Phase 3 — Superadmin template editor *(authoring only, not wired to generation)*
- New page `/admin/document-templates` (+ `/[slug]`), following the loan-types CRUD pattern; new `Sidebar` nav item gated on `system_config` (superadmin auto-passes).
- WYSIWYG editor (full rich text per your choice) with **merge fields inserted as protected inline chips** (movable/deletable as a unit, not partially editable) so freeform editing can't corrupt `{{tokens}}`.
- **Live preview** renders the draft via the Phase 2 engine with sample data.
- Draft → Publish workflow writes `document_template_versions`.
- **Live document generation still uses the hardcoded path.** Authoring here has no production effect yet.
- **Exit criteria:** superadmin can author, preview, and publish a template; release flow unaffected.

### Phase 4 — Migrate the 7 existing release docs *(one slug at a time, with fallback)*
For each of the 7 slugs, in order (start with the simplest, e.g. a voucher; do `promissory_note`/`disclosure_statement` last):
1. Author + publish a template matching the real sample document (and the current computed values).
2. In `generateReleaseDocuments`, change the per-slug render to: **if a published template exists for this slug → render via engine and set `template_version_id`; else → existing hardcoded renderer.**
3. Verify end-to-end on that slug: generate → hash → witness-sign → close, with the stored PDF visually matching the sample and the hash/lock flow intact.
- The `BlriData` context ([`blri-data.ts`](../src/lib/lra/blri-data.ts)) is reused as the merge-field source; extended only additively if a template needs a field it doesn't yet expose.
- **Rollback per slug:** unpublish the template → generation falls back to hardcoded automatically.
- **Exit criteria:** all 7 render from templates; E2E green; visual parity with samples confirmed.

### Phase 5 — Decouple from the release flow *(enable non-release documents)*
- New migration (both folders): `rendered_documents` — the general-purpose sibling of `generated_documents`, keyed by `loan_application_id` (+ optional `release_file_id`), `template_version_id`, `storage_path`, `content_hash`, and optional signing columns. Full RLS per stage/module.
- Generation helper `renderAndStore(templateSlug, applicationId, context)` usable from any stage (CSA, committee, LRA, AR, collection, remedial).
- **Existing release docs stay on `generated_documents`** (proven, RLS-covered). This table is only for the new, non-release documents — no migration of existing rows.
- **Exit criteria:** a test non-release document can be generated, stored, downloaded, and audited.

### Phase 6 — Build the 5 new documents + wire code-only fixes
Each new document = author a template (Phase 3 tooling) + a generation entry point (Phase 5 helper) at the right stage:
- **Demand Letter** (collection/remedial; per D2 one or a series) — closes the highest-risk gap.
- **Acknowledgement Receipt** (release; check/cash variants).
- **Endorsement Letter** (LRA; draft, flagged "needs review" until Legal confirms).
- **Final Computation Sheet** (bridge/LRA; original-vs-renegotiated layout per your call).
- **Application Form** — printable template here; **borrower self-service capture is a separate sub-task** (borrower-portal fields + retire the redundant `application_form` upload slot).

Code-only fixes bundled into this phase (independent of templates):
- **PN + Disclosure Statement scan-back-in gate** — mirror the `signed_check_voucher` requirement so `closeRelease()` also requires the signed PN/DS scans. (Notarized PN especially.)
- **AR voucher dual-slug** — disambiguate the `ar_check_voucher`/`ar_cash_voucher` LRA-generated vs. AR-upload collision.
- **`briefing_information`** — retire the redundant upload slot after confirming nothing else references it.
- **`pdc_encoding_sheet`** — decide keep-optional vs. retire.

- **Exit criteria:** the 5 documents generate correctly; the code-only fixes are verified without regressing release/close.

### Phase 7 — Retire the hardcoded renderer *(cleanup, only after full parity)* — ✅ DONE 2026-07-14
- Once all 7 slugs have stable published templates and have run clean in production for an agreed period, delete the `renderDocumentPdf` switch and `simple-pdf.ts`, and remove the fallback branch.
- **Not before** — the fallback is the safety net for the entire migration.
- **Exit criteria:** dead code removed; all documents flow through the template engine.

---

## 5. Non-breaking guarantees (how each risk is contained)

| Risk | Containment |
|---|---|
| Breaking the release/sign/close flow | Hardcoded path stays until per-slug template is proven; fallback is automatic on unpublish |
| Retroactively altering signed docs | Impossible — signed PDFs are frozen stored files; templates only affect *future* renders |
| Hash/signature drift | Engine renders deterministically; unit-tested stable bytes; `signature_hash` semantics unchanged |
| Non-release docs polluting `generated_documents` | New `rendered_documents` table; existing table untouched |
| RLS gaps (repo's recurring bug) | RLS policies written in the same migration as every new table |
| Migration folder drift | Every migration authored in both folders in the same change |
| Admin editing corrupting merge fields | Merge fields are protected inline tokens, not raw text |
| Renderer infra surprise | Phase 0 spike proves it on the real target before any schema work |

---

## 6. Suggested sequencing / dependencies

```
Phase 0 (decisions + spike)
   └─> Phase 1 (schema)  ──> Phase 2 (engine) ──> Phase 3 (editor)
                                                      └─> Phase 4 (migrate 7 existing)
                                                             └─> Phase 5 (decouple)
                                                                    └─> Phase 6 (5 new + code fixes)
                                                                           └─> Phase 7 (retire hardcoded)
```

Phases 1→7 are strictly ordered. Within Phase 4 the 7 slugs are independent and can be done incrementally. The code-only fixes in Phase 6 (scan-back-in gate, slug cleanup) have no dependency on the template engine and could be pulled earlier if desired.

---

## 7. What I need to start Phase 1

1. Decisions D1–D5 (§3).
2. The 4 still-missing sample documents when available (Endorsement Letter, Final Computation Sheet, AR Check/Cash Voucher) — not blocking, since Phase 4/6 can start from best-guess drafts and be corrected in the editor.
3. Your "go".
