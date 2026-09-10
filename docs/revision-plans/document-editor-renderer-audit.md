# Audit — document editor & PDF renderer (pre-plan)

**Date:** 2026-09-10
**Scope:** verified current state of the template editor, the merge/render pipeline,
the signing/hash flow, and the Supabase side — as the factual basis for deciding a
new editor (TipTap et al.) and/or renderer (headless Chromium et al.).
**Method:** direct file reads + Supabase MCP queries against project
`acopcwlhkovssjnrqygk`. Nothing here is assumed; unverified items are listed in §12.

---

## 1. Deployment & runtime — VERIFIED

| Fact | Source |
|---|---|
| Deployed on **Vercel** (project `loanstar`, org `team_66wISnuUVyJjvX1sDnSaxuDV`), framework `nextjs`, **Node 24.x**, all build settings default. | `.vercel/project.json` |
| **No container infra** — no Dockerfile, no docker-compose, no fly.toml/railway anywhere in the repo. | `find` |
| Next.js **16.2.10**, "heavily modified / Turbopack" (`AGENTS.md`). Scripts: `next dev` / `next build` / `next start` (Node server, not `next export`). `@playwright/test` is **E2E-test only** (devDependency). | `package.json`, `next.config.ts` |
| The pure-JS, no-Chromium renderer was a **documented deliberate decision (D1)**: *"Deploy target = Vercel/serverless. Engine = pdfmake + html-to-pdfmake … no Chromium."* | `docs/document-template-system-plan.md:20,89` |
| `next.config.ts` `serverExternalPackages`: `pdfmake`, `@foliojs-fork/pdfkit`, `@foliojs-fork/fontkit`, `html-to-pdfmake`, `jsdom`. They do runtime `readFileSync`; bundling breaks them. Turbopack's `externalRequire` does a **raw `require()` → cannot load ESM**, so jsdom's dep tree must stay ESM-free (guarded by `scripts/scan-esm-only.mjs`, wired as `npm run check:jsdom-esm`). | `next.config.ts` (its own comment) |
| tsconfig: `target ES2017`, `module esnext`, `moduleResolution bundler`. No `engines` in `package.json`. | `tsconfig.json` |
| `next.config.ts` `images.remotePatterns` hard-codes `acopcwlhkovssjnrqygk.supabase.co/storage/v1/object/public/**`. | `next.config.ts` |

**Implication for a plan:** any headless-Chromium / LibreOffice renderer is **net-new
infrastructure** that contradicts D1 and the current deploy model — it means running
a container somewhere and calling it from Vercel functions (or leaving Vercel).
This is a real architectural decision, not a config change.

---

## 2. The render pipeline — VERIFIED

Four files, `src/lib/documents/render/`:

| File | Role |
|---|---|
| `merge.ts` | `mergeTemplate(html, ctx)` — JSDOM parse → resolve `data-if` / `data-unless` (removes element), `data-repeat` (clones element per array item, item-scope then root), then `{{token}}` (dotted paths, **HTML-escaped**). Returns HTML string. **Engine-agnostic** — no PDF concern here. |
| `pdf.ts` | `htmlToPdf(html)` → `html-to-pdfmake` (offline JSDOM) → `pdfmake` (`A4`, margins `[40,40,40,40]`, `defaultStyle {font:"Helvetica",fontSize:10}`) → `makeDeterministic(buf)` → `Uint8Array`. |
| `fonts.ts` | `getPrinter()` — fresh `PdfPrinter` per render with **Standard-14 fonts only (Helvetica)**. Comment: *"pdfkit uses built-in AFM metrics for these and does NOT embed or subset them — which is what makes output fully deterministic. Embedded/subset fonts carry process-order-dependent subset state."* |
| `index.ts` | `renderTemplateToPdf(html, ctx)` = `mergeTemplate` + `htmlToPdf`. `hashPdf(bytes)` = `sha256` hex. |

`makeDeterministic()` does two length-preserving string substitutions on the PDF
bytes: zero the trailer `/ID` hex pair, and pin every `D:YYYYMMDDHHMMSS` to
`D:20000101000000`. That's the entire determinism mechanism at the byte level;
the rest rides on Standard-14 fonts.

### Merge-field catalog

`src/lib/documents/templates/fields.ts` — `FIELD_GROUPS` (scalars), `FIELD_COLLECTIONS`
(`data-repeat` item shapes), `FIELD_FLAGS` (`data-if` booleans), and
`buildSampleContext()` (drives the editor preview). ~250+ keys after the LSLGC batches.

---

## 3. Production render call sites — VERIFIED: exactly 3

| Call site | Purpose | Writes |
|---|---|---|
| `src/app/api/admin/document-templates/preview/route.ts:26` | editor "Preview PDF" | none (streams PDF back). `export const runtime = "nodejs"`. |
| `src/lib/documents/render-store.ts:77` (`renderAndStore`) | **all** non-release docs — demand letter, payment receipt, acknowledgement receipt, final computation sheet, application form (each generator calls `renderAndStore`) | `rendered_documents` row + PDF to Storage |
| `src/lib/lra/release-service.ts:754` (`generateOneReleaseDocument`) | LRA release documents | `generated_documents` row + PDF to Storage |

Everything funnels through `renderTemplateToPdf`. **If that function keeps its
signature, zero call sites change.** The 5 generators in
`src/lib/documents/generators/` never render directly — they all go via `renderAndStore`.

---

## 4. Determinism — what is ACTUALLY enforced (correction to earlier framing)

| Where | Reality |
|---|---|
| `witnessSignGeneratedDocument` (`release-service.ts:1106`) | `signature_hash = doc.content_hash` — **copies the hash already stored at generation time. No re-render, no re-hash, no comparison.** |
| `witnessSignComputation` (`negotiation/service.ts:733`) | `signature_hash = sha256(JSON.stringify(computation))` — hashes a **computation object**, not a PDF. Unrelated to rendering. |
| Any "re-render and verify" endpoint | **Does not exist.** The only `renderTemplateToPdf` call in `src/app/` is the preview route. |
| Borrower download (`/api/borrower/applications/[id]/release-documents`) | Returns **signed URLs to the stored PDF bytes** in Storage. No re-render. |
| Byte-determinism | Enforced only by **3 unit tests** in `render/__tests__/render.test.mts` (`byte-deterministic across renders`, `no font-state leak`, golden-ish). `pdf.ts` comment aspires to *"reproduced and verified later"* but that verifier was never built. |

**Conclusion:** byte-determinism is a *property the current renderer has* and a
*test invariant*, **not a runtime business invariant**. A non-deterministic renderer
(Chromium) would break the 3 tests and forfeit the *option* of building
"prove this PDF matches template+data" verification later — but it does **not**
break signing, borrower downloads, or the 504 already-signed rows, whose
`signature_hash` + stored bytes are frozen regardless.

---

## 5. The editor — VERIFIED

`src/components/admin/TemplateEditor.tsx` — **hand-rolled, no library.**

- Two modes via `SegmentedControl`: **Visual** (`contentEditable` `<div>.visual-surface`, `document.execCommand` for bold/italic/underline, `formatBlock` h1/h2/p, ordered/unordered list, justify L/C/R) and **HTML source** (`<Textarea>`, mono).
- Right sidebar palette: inserts merge-field chips (`<span class="merge-chip" data-merge="key" contenteditable="false">{{key}}</span>`), `repeatTableHtml()` snippets (`<tr data-repeat="…">`), conditional spans (`<span data-if="flag">`).
- "Preview PDF" → `POST /api/admin/document-templates/preview` (`previewSchema`: `body` ≤ 200 000 chars) → PDF blob in an `<object>`.
- Props: `{ initialBody, onSaveDraft, saving }`. Body persisted as **HTML text** in `document_template_versions.body`.
- Scoped preview CSS lives inline in the component (`.visual-surface` table/heading rules) — **different from pdfmake's output** (the known WYSIWYG gap; partially addressed on branch `feature/template-visual-pdf-alignment`, see §9).

---

## 6. Supabase — VERIFIED (live, project `acopcwlhkovssjnrqygk`)

### Tables (document system)

| Table | Key columns | Notes |
|---|---|---|
| `document_templates` | `slug` (unique), `name`, `description`, `category` (free text), `is_active` (default true), `seafarer_generation` / `sme_generation` (`doc_generation_eligibility` enum, default `hidden`) | 31 rows |
| `document_template_versions` | `template_id`, `version_no`, **`body` text (HTML)**, `merge_fields` jsonb (default `[]`), `status` (`draft`/`published`/`archived`, default `draft`), `published_at/by`, `created_by` | 38 rows, 29 published. UNIQUE `(template_id, version_no)`; partial unique index `one published per template`. |
| `generated_documents` | `release_file_id` (NOT NULL), `document_slug`, `storage_path`, `content_hash` (NOT NULL), `template_version_id` (nullable, `ON DELETE SET NULL`), `is_finalized`, `finalized_at`, `signed_at/by`, `witnessed_by`, `signature_hash` | **506 rows, 504 signed, 0 finalized** |
| `rendered_documents` | `loan_application_id`, `release_file_id` (nullable), `module`, `document_slug`, `template_version_id`, `storage_path`, `content_hash`, `is_finalized`, `signed_at/by`, `signature_hash`, `generated_by` | 22 rows, 0 signed |

### Triggers

| Table | Trigger | Function | Effect |
|---|---|---|---|
| `document_template_versions` | `…_immutability` BEFORE UPDATE | `guard_template_version_immutability()` | published/archived rows: `body` / `merge_fields` / `version_no` / `template_id` frozen; `published → archived` is the only allowed status move. |
| `document_template_versions`, `document_templates`, `rendered_documents` | `…_updated_at` BEFORE UPDATE | `set_updated_at()` | timestamp |
| `generated_documents` | `…_immutable_when_finalized` BEFORE UPDATE **and** DELETE | `prevent_finalized_generated_doc_mutation()` | finalized rows can't be updated/deleted |

### RLS (all `TO authenticated`)

- `document_templates` — SELECT: `is_active OR is_super_admin() OR has_module_permission('system_config','view')`; write (ALL): `system_config` `edit` / superadmin.
- `document_template_versions` — SELECT: `status='published' OR system_config view/superadmin`; write (ALL): `system_config` `edit` / superadmin.
- `generated_documents` — SELECT: `release_lra view` **OR borrower owns** (`b.user_id = auth.uid()` via release_files→loan_applications→borrowers); INSERT/UPDATE/DELETE: `is_finalized=false AND (release_lra edit / superadmin)`.
- `rendered_documents` — SELECT: `has_module_permission(module,'view')` **OR borrower owns**; INSERT/UPDATE: `has_module_permission(module,'edit')`, UPDATE also `is_finalized=false`.

### Storage buckets

| Bucket | Public | Limit | MIME |
|---|---|---|---|
| `loan-documents` (`DOCUMENT_BUCKET`) | **private** | 10 MB | pdf, jpeg, png, webp, heic, heif |
| `branding` | **public** | 5 MB | png, jpeg, webp, **svg+xml**, x-icon |
| `avatars` | public | 2 MB | jpeg, png, webp |

Generated/rendered PDFs → `loan-documents` (private, `upsert: true`), fetched via
`createSignedDownloadUrl` (1 h). **Logo already exists**: `src/lib/branding.ts`
exposes `BRANDING.logoUrl` = **public** `branding/logo.png` (PNG) — directly usable
as a base64/`<img>` source or a pdfmake/CSS header image.

---

## 7. Constraints any editor/renderer change must respect — VERIFIED

1. **Vercel serverless, no container** (§1). A Chromium/LibreOffice renderer needs one.
2. **jsdom ESM fragility** — `check:jsdom-esm` guard; jsdom/pdfmake version pins are "load-bearing" per `next.config.ts`. Removing jsdom (only `merge.ts` and `html-to-pdfmake` use it) would actually *reduce* this risk.
3. **Determinism = Standard-14 fonts, unembedded** (§4). Any engine that embeds/subsets fonts loses free determinism; would need explicit normalisation (force full embed, strip PDF metadata, pin engine version, golden-hash tests).
4. **Immutable published versions** — editor change must still emit HTML into `body`; can't retro-edit published rows.
5. **`body` ≤ 200 000 chars** (preview zod schema) — inline base64 images blow past this fast.
6. **HTML is the storage format today** — 29 published bodies + 16 LSLGC templates all use `{{token}}` / `data-repeat` / `data-if`. A `.docx` editor forces a one-time lossy migration + re-marking these constructs.
7. **Baseline `npm test` = 1652 / 0** on `develop` (with 55 uncommitted files: LSLGC batches 1–4 + LRA per-doc + penalty/ledger work).

---

## 8. In-flight related work — VERIFIED

- **`feature/template-visual-pdf-alignment`** — an existing branch that adds a shared style layer + `injectTableWidths()` post-processor + an editor `Alert` ("Visual preview now matches PDF output"), behind a `useSharedDefaults` opt-in flag. Its original `injectTableWidths()` wrote widths at the **wrong pdfmake nesting level** (`node.widths` instead of `node.table.widths`) → it was a **no-op**; that was found and fixed on the branch (commit `87b6963`). Not merged. Any editor/renderer plan should decide whether to land, rebase, or supersede it.
- **`feature/lslgc-sme-docs`** — the 4 LSLGC template batches (this session), 4 commits, not merged. Adds `buildReleaseTemplateContext` keys + `fields.ts` groups the new templates depend on.
- Both branches sit on top of an uncommitted `develop` (55 dirty files).

---

## 9. Security advisors (Supabase, 2026-09-10) — for awareness, not blockers

- **ERROR `rls_disabled_in_public`** — 3 tables `public._backup_rolled_rows_20260909`, `_backup_rollover_penalties_20260909`, `_backup_masterlist_balances_20260909` are PostgREST-exposed with **no RLS** (leftovers from the 2026-09-09 rollover-removal work). Unrelated to documents but a live data-exposure finding. <https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public>
- WARN — 12 functions with mutable `search_path` (incl. `set_updated_at`, `prevent_finalized_generated_doc_mutation`).
- WARN — 13 `SECURITY DEFINER` functions executable by `anon`/`authenticated` (some intentional RLS helpers like `has_module_permission`; `search_borrower_names`, `get_field_rule` exposed to `anon` worth review).
- WARN — leaked-password protection disabled.

---

## 10. What the editor swap alone (keep pdfmake) would and wouldn't fix

**Would:** visual table editing; `data-repeat`/`data-if` as real blocks instead of
raw attributes; proper toolbar; real undo; clean paste. Storage, rendering,
signing, serverless, the 3 call sites — untouched.

**Wouldn't:** the WYSIWYG gap (browser editor vs pdfmake still two engines);
page headers/footers, page numbers, precise margins, forced page breaks
(pdfmake supports some via `docDefinition`, none authorable in the editor);
per-scenario wording correctness (Legal + data capture — unchanged).

---

## 11. What "route to headless Chromium" would actually touch

- **New:** a Chromium/Gotenberg service (container) + private networking from Vercel.
- **Rewrite:** `pdf.ts` `htmlToPdf` (→ HTTP call) and `fonts.ts` (→ fonts in the container); `makeDeterministic()` extended for Chromium metadata; the 3 determinism tests.
- **Unchanged:** `merge.ts`, `fields.ts`, `renderTemplateToPdf` signature, all 3 call sites, all 16 templates, `render-store.ts` / `release-service.ts` DB writes, signing, storage, RLS.
- **New capability:** identical CSS in editor + PDF (true WYSIWYG), `@page` headers/footers/numbers/margins, web fonts, CSS layout, near-free HTML→DOCX via the same container's LibreOffice.

---

## 12. Not verified / open questions

1. **Where would a Chromium/Gotenberg container run** and how is it reached from Vercel (VPC? public + auth? Supabase Edge Function? separate host)? — deployment decision, no data in repo.
2. **PDF generation volume & latency budget** in production (the 506 `generated_documents` include heavy demo data). Need real numbers to size the service.
3. **Is byte-determinism a stated client/audit requirement**, or just an engineering nicety? §4 says nothing enforces it at runtime — confirm with the client before trading it away.
4. **Client requirement level for "feels exactly like Word"** — decides TipTap vs Syncfusion/OnlyOffice.
5. **Whether the 3 `_backup_*` RLS-disabled tables** are still needed (separate cleanup).
6. Exact Vercel function limits in use (timeout/memory) for the render routes — only `reports/insights` sets `maxDuration`; the doc routes rely on defaults.
7. TipTap Pro vs core: which extensions (tables, export) are needed and whether any are paid.
