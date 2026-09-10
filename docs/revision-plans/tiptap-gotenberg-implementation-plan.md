# Implementation Plan — TipTap editor + Gotenberg (headless-Chromium) renderer

**Version:** 1.0
**Date:** 2026-09-10
**Basis:** `docs/revision-plans/document-editor-renderer-audit.md` (all facts here are from that audit — verified against code + live Supabase `acopcwlhkovssjnrqygk`).
**Goal:** replace the hand-rolled `contentEditable` editor with **TipTap**, and replace the `pdfmake` renderer with **headless Chromium via Gotenberg**, so the editor preview and the generated PDF are the **same rendering engine** (true WYSIWYG), with authorable page layout (headers/footers, page numbers, logo, page breaks, real fonts) — **without touching signing, storage, RLS, the DB schema, the 45 templates, or any non-document feature.**

---

## Why this shape

- The renderer is reached through **one function** (`renderTemplateToPdf`) with **exactly 3 production call sites** (audit §3). Keep its signature → those call sites don't change.
- `mergeTemplate` is already **engine-agnostic** (audit §2) → it is not modified at all.
- `body` stays **HTML** → the 45 templates, `document_template_versions` schema, the immutability trigger, and all RLS are untouched (audit §6, §7).
- Byte-determinism is **not a runtime business rule** — signing copies a stored hash, no verifier exists (audit §4). So a Chromium renderer is *safe*; determinism is preserved for test/audit-option reasons, not because signing depends on it.
- Everything is **feature-flagged** (`DOC_RENDER_ENGINE`), so rollback to pdfmake is one env var until Phase 6.

---

## Constraints — DO NOT TOUCH (enforced every phase)

| Area | Rule |
|---|---|
| `src/lib/documents/render/merge.ts` | **Zero changes.** Engine-agnostic; the 45 templates depend on its exact `{{token}}` / `data-repeat` / `data-if` semantics. |
| `renderTemplateToPdf`, `renderAndStore`, `generateReleaseDocuments`, `generateOneReleaseDocument` | **Signatures unchanged.** New behaviour only behind an optional param / env flag. |
| The 3 render call sites (`preview/route.ts`, `render-store.ts`, `release-service.ts`) | No structural change — they call the same function; engine selection is centralised in `render/index.ts`. |
| DB: `document_templates`, `document_template_versions`, `generated_documents`, `rendered_documents` | **No migrations.** Schema, triggers (`guard_template_version_immutability`, `prevent_finalized_generated_doc_mutation`), and all RLS policies stay exactly as audited. `body` stays HTML. |
| Signing | `witnessSignGeneratedDocument`, `unwitnessSignGeneratedDocument`, `witnessSignAllGeneratedDocuments`, `witnessSignComputation` — **untouched.** |
| Storage | `src/lib/documents/storage.ts`, `DOCUMENT_BUCKET`, bucket config — **untouched.** |
| Generators | `src/lib/documents/generators/*.ts` (5 files) — **untouched** (they call `renderAndStore`, which is unchanged). |
| Existing data | The **504 signed `generated_documents`** + their Storage PDFs are frozen — never re-rendered, never re-hashed. |
| `next.config.ts` `serverExternalPackages` | Do **not** remove `pdfmake` / `@foliojs-fork/*` / `html-to-pdfmake` entries before Phase 6. **Keep `jsdom`** forever (still used by `merge.ts`). |
| Editor | Keep the **"HTML source" mode** as an escape hatch. Keep `TemplateEditor` props `{ initialBody, onSaveDraft, saving }` so the hosting page (`src/app/admin/document-templates/[id]/page.tsx`) is untouched. |
| `fields.ts` / `buildSampleContext` | No changes unless a custom node genuinely needs a new sample value (then additive only). |
| `body` size | Keep the 200 000-char preview cap. Images travel to Gotenberg as **multipart form files**, never base64 in `body`. |
| In-flight branches | Do **not** merge `feature/template-visual-pdf-alignment` into this work — its shared-style idea is superseded by Phase 3's `print-styles`, and its `pdfmake` `injectTableWidths` hack is dead once pdfmake is gone. Do not touch `feature/lslgc-sme-docs`. |
| Unrelated code | No edits outside `src/lib/documents/render/**`, `src/components/admin/TemplateEditor.tsx` (+ new `src/components/admin/template-editor/**`), `src/app/api/admin/document-templates/preview/route.ts` (flag read only), `next.config.ts` (Phase 6 only), `package.json`, and new infra files (`infra/gotenberg/**`, `.env` docs). |

**Branching:** cut `feature/doc-editor-tiptap-gotenberg` from a **clean `develop` HEAD**. This work does not depend on the uncommitted LSLGC/LRA/penalty changes; branching from HEAD keeps it isolated. (If `develop` is committed first, rebase — trivial, no overlap.)

**Gate at every phase:** `npm test` stays **≥ 1652 / 0**, `npx tsc --noEmit` clean on touched files, `next build` ✓. No phase starts until the prior one's exit criteria pass.

---

## Phase 0 — Provision Gotenberg (infra only, no app code)

### 0.1 Deploy Gotenberg

- Image: **`gotenberg/gotenberg:8`** pinned to an **exact patch tag** (e.g. `8.11.1`) — recorded in `infra/gotenberg/README.md`. The tag is a determinism input; never `:8` or `:latest` in production.
- Host: **Fly.io** (recommended — one container, private `.internal` networking, ~$5/mo, `fly.toml` lives in `infra/gotenberg/`). Alternative: Google Cloud Run (if already on GCP; accept cold starts) or a small always-on VM with Docker.
- Hardening flags (in `fly.toml` / run args):
  - `--chromium-disable-javascript=true` (templates never need JS)
  - `--chromium-deny-list=".*"` + `--chromium-allow-list="file:///.*"` (no outbound network from the render; assets come in as form files)
  - `--api-timeout=30s`, `--chromium-max-queue-size` sized to expected concurrency
  - `--api-enable-basic-auth=true` with `GOTENBERG_API_BASIC_AUTH_USERNAME` / `..._PASSWORD` (v8 feature)
- Network: **not publicly reachable.** Fly private networking, or Cloud Run + IAM, or an allowlisted IP + basic auth at minimum.
- Health: `GET /health` wired to the platform's health check.

### 0.2 Wire config into Vercel

Env vars (Vercel project `loanstar`, all environments):
`GOTENBERG_URL`, `GOTENBERG_BASIC_AUTH_USER`, `GOTENBERG_BASIC_AUTH_PASS`, `DOC_RENDER_ENGINE` (default `pdfmake`).

### 0.3 Choose the document font

Pick **one** family, bundled as a `.woff2` **attached per request** (not baked into the image — keeps determinism independent of container drift). Recommended: **Liberation Sans** (metric-compatible with the current "Helvetica" intent) or the app's existing display font. Record the exact file + hash in `infra/gotenberg/README.md`.

### 0.4 Determinism strategy decision

Default: **extend the existing `makeDeterministic()` string-substitution** (pure JS, no new dep) to also normalise Chromium's `/CreationDate`, `/ModDate`, `/ID`, `/Producer`, `/Creator`. Fallback if structural ordering varies: load+save through **`pdf-lib`** (already MIT, pure JS) to canonicalise, then string-normalise. Decide in Phase 2 with real bytes.

**Exit criteria:**
- `curl -u user:pass $GOTENBERG_URL/health` → healthy from a Vercel preview function (proves reachability + auth).
- A hand-crafted `index.html` + `font.woff2` POST to `/forms/chromium/convert/html` returns a valid PDF.
- Font file + Gotenberg tag + flags documented.

**Rollback:** delete the container. No app code exists yet.

---

## Phase 1 — Renderer abstraction (additive, dormant, zero behaviour change)

### 1.1 New: `src/lib/documents/render/print-styles.ts`

Exports `PRINT_CSS: string` — the single stylesheet used by **both** the Gotenberg HTML wrapper and (Phase 4) the TipTap editor surface. Contents: `@page { size: A4; margin: … }`, `@font-face` for the bundled font, body typography, headings, `table { width:100%; border-collapse:collapse }` + cell borders/padding, `p` / `ul` / `ol` spacing, `img { max-width:100% }`, and `@media screen` author-hint rules for `.merge-chip` / `[data-repeat]` / `[data-if]` that are **not emitted** to Gotenberg (merged HTML has those resolved away already).

### 1.2 New: `src/lib/documents/render/gotenberg.ts`

`export async function htmlToPdfViaGotenberg(mergedHtml: string, opts?: { headerHtml?: string; footerHtml?: string; assets?: { name: string; bytes: Uint8Array; contentType: string }[] }): Promise<Uint8Array>`

- Wraps `mergedHtml` in `<!doctype html><html><head><meta charset><style>${PRINT_CSS}</style></head><body>…</body></html>`.
- Builds a multipart request: `index.html`, `fonts/doc.woff2`, `header.html` / `footer.html` (if given), plus any `assets` (images) — Gotenberg renders `index.html` with sibling files resolvable by bare filename.
- POST `${GOTENBERG_URL}/forms/chromium/convert/html` with basic auth, `paperWidth`/`paperHeight` A4, `marginTop/Bottom/Left/Right`, `printBackground=true`, `preferCssPageSize=true`, no `waitDelay`.
- On non-2xx: throw a typed `RenderEngineError` (message + Gotenberg body).
- Pass the returned bytes through `makeDeterministic()` (exported from `pdf.ts` — hoist it to a shared `deterministic.ts` in this phase so both engines import it; **behaviour identical**).

### 1.3 `src/lib/documents/render/index.ts` — engine selection

```ts
export type RenderEngine = "pdfmake" | "chromium";
export async function renderTemplateToPdf(
  templateHtml: string,
  context: RenderContext,
  opts?: { engine?: RenderEngine },
): Promise<Uint8Array> {
  const merged = mergeTemplate(templateHtml, context);
  const engine = opts?.engine
    ?? (process.env.DOC_RENDER_ENGINE as RenderEngine | undefined)
    ?? "pdfmake";
  return engine === "chromium" ? htmlToPdfViaGotenberg(merged) : htmlToPdf(merged);
}
```

`pdf.ts` and `fonts.ts` are left **exactly as they are**. `makeDeterministic` moves to `deterministic.ts` with a re-export from `pdf.ts` for compatibility (or just import from the new file — pick the smaller diff).

**Exit criteria:**
- `renderTemplateToPdf(body, ctx)` (no opts, `DOC_RENDER_ENGINE` unset) → **byte-identical** to pre-change (add a golden-hash assertion for one template).
- `renderTemplateToPdf(body, ctx, { engine: "chromium" })` → returns a `%PDF-` of non-trivial size against the Phase 0 Gotenberg.
- `npm test` ≥ 1652 / 0 (chromium path not exercised by default tests yet).
- `tsc` clean, `next build` ✓.

**Rollback:** revert the `index.ts` signature addition; delete `gotenberg.ts` / `print-styles.ts` / `deterministic.ts`. `pdf.ts` never changed.

---

## Phase 2 — Determinism for the Chromium path

### 2.1 Normaliser

Extend `makeDeterministic()` (now in `deterministic.ts`) to also, length-preservingly:
- pin `/CreationDate (D:…)` and `/ModDate (D:…)` (Chromium emits these in the info dict) — reuse the existing `D:\d{14}` regex; verify it catches Chromium's format.
- zero `/ID [<…><…>]` (same as today).
- neutralise `/Producer (Skia/PDF m1xx …)` and `/Creator` to fixed strings **of equal length** (pad/truncate) — or, if length-preserving is fragile, load+save via `pdf-lib` and set `producer`/`creator`/`creationDate`/`modificationDate` to constants, then hash.

### 2.2 Tests

- **Move** the 3 determinism tests out of `render/__tests__/render.test.mts` into `render/__tests__/chromium.integration.test.mts`, `describe.skip`-gated unless `process.env.GOTENBERG_URL` is set.
- Add: render each of ~6 representative templates twice + once after a forced Gotenberg restart → assert identical `hashPdf`.
- Add golden-hash constants per representative template (regenerated intentionally when the Gotenberg tag or font changes; a bump that shifts bytes fails CI).
- The **pure `merge.test.mts` stays untouched** and remains the always-run guarantee.

### 2.3 CI

Add a `gotenberg` service container (or a reachable dev Gotenberg URL) to the CI job that runs the integration file. If CI can't host a container, run `chromium.integration.test.mts` as a scheduled/manual job against the dev Gotenberg and keep `npm test` (unit) as the PR gate.

**Exit criteria:**
- Same input → same hash across 20 sequential renders **and** across a Gotenberg cold restart.
- Golden-hash tests pass; a deliberate font swap makes them fail (proves they're real).
- `npm test` (unit) ≥ 1652 / 0 unchanged.

**Rollback:** the normaliser is additive to a function only the chromium path calls; revert it and the tests.

---

## Phase 3 — Shared stylesheet finalised + header/footer/logo

### 3.1 Finalise `PRINT_CSS`

Typography and table rules that match the documents' intent (A4, sensible margins, full-width bordered tables, readable headings, consistent paragraph rhythm). This is the single source of truth the editor will also load in Phase 4.

### 3.2 Header / footer

- `src/lib/documents/render/letterhead.ts` — builds `headerHtml` / `footerHtml` for Gotenberg:
  - header: `<img src="logo.png">` + company line.
  - footer: `Page <span class="pageNumber"></span> of <span class="totalPages"></span>` + generated-date.
- Logo bytes fetched **once** from the public `branding` bucket (`branding/logo.png`, per `src/lib/branding.ts`), cached in-module, attached to every Gotenberg request as `logo.png`. **No base64 in `body`.**
- `htmlToPdfViaGotenberg` gains default `headerHtml`/`footerHtml` from `letterhead.ts` (still only used by the chromium path).

### 3.3 Snapshot pass

Script (not committed to prod): render **all 45 published template bodies** via `engine:"chromium"` + `buildSampleContext()` into `_snapshots/chromium/`. Visual spot-check 6–8 (one per category). Confirm: header/footer/logo present, page numbers correct, tables full-width, no clipped content, page breaks sane.

**Exit criteria:**
- 45 PDFs render without error via the chromium engine.
- Spot-check acceptable; issues logged as `PRINT_CSS` tweaks, not blockers.
- Determinism (Phase 2) still holds with header/footer attached.

**Rollback:** `letterhead.ts` and the header/footer defaults are chromium-path-only; revert them.

---

## Phase 4 — TipTap editor (swap `TemplateEditor.tsx` internals only)

### 4.1 Dependencies (all MIT / free core)

`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table` (+ `-row`, `-cell`, `-header`), `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/html` (server-safe HTML⇄JSON for the round-trip test). **No `@tiptap-pro/*`** unless Phase 7 needs the export extension.

### 4.2 New: `src/components/admin/template-editor/`

- `extensions/MergeField.ts` — inline **atom** node. `addAttributes: { key }`. `parseHTML: [{ tag: "span[data-merge]" }]`. `renderHTML: ["span", { "data-merge": key }, `{{${key}}}`]`. Editor view = the styled chip.
- `extensions/RepeatRow.ts` — **extends `TableRow`** with a `dataRepeat` attribute. `parseHTML` keeps `tr[data-repeat]`; `renderHTML` re-emits `data-repeat="collection"`. Editor view = row with a left gutter label + collection dropdown. *(This preserves the existing `<tr data-repeat="…">` markup the 45 templates use — see audit `repeatTableHtml()`.)*
- `extensions/RepeatBlock.ts` — block node for non-table `data-repeat` (`<div data-repeat>`), same attr contract.
- `extensions/Conditional.ts` — an **inline mark** for `<span data-if|data-unless>` **and** a **block node** for `<div|p data-if|data-unless>`; both round-trip the attribute verbatim. Editor view = tinted background + a flag-picker on click.
- `TiptapEditor.tsx` — the editor component. Loads `PRINT_CSS` (from `render/print-styles.ts`) into a scoped wrapper so **the editing surface is the print surface**, plus `@media screen` author hints. Toolbar: headings, bold/italic/underline, lists, align, link, **table ops** (insert, add/del row/col, merge), **image** (upload → see 4.4), and palette buttons for merge field / repeat / conditional.
- `TemplateEditor.tsx` — keep the file and its **props unchanged**; internally render `<TiptapEditor>` for "Visual" and the existing `<Textarea>` for "HTML source". `onSaveDraft(html)` still receives HTML (`editor.getHTML()` run through the existing `cleanBody`).

### 4.3 HTML compatibility

`parseHTML`/`renderHTML` for every custom node are written so that **loading any of the 45 published bodies and re-serialising yields HTML that `mergeTemplate` treats identically.** Verified by 4.5.

### 4.4 Images in the editor

- Upload handler → PUT to the **private `loan-documents` bucket** under a `templates/<templateId>/…` prefix (or a new `template-assets` path); store the **storage path** in the image node's `src` as an opaque ref (e.g. `asset://<path>`), not a public URL.
- Editor preview resolves `asset://` via a short-lived signed URL for display only.
- At render time (Phase 5), the render pipeline: scans merged HTML for `asset://` / `<img>` srcs → fetches bytes from Storage → attaches them to the Gotenberg request as form files → rewrites srcs to bare filenames. Keeps `body` small and avoids any outbound fetch by Chromium.

### 4.5 Round-trip test — `src/lib/documents/render/__tests__/tiptap-roundtrip.test.mts`

For each of the 45 published bodies (read from a fixture dump, not live DB):
`generateJSON(body, extensions)` → `generateHTML(json, extensions)` → `mergeTemplate(that, buildSampleContext())` — assert the result equals `mergeTemplate(originalBody, buildSampleContext())` (snapshot; a reviewed intentional diff is allowed and recorded).

**Exit criteria:**
- All 45 templates load, round-trip, and `mergeTemplate` output is unchanged (or the diff is reviewed + accepted).
- Visually: insert/edit a table, an image, a merge field, a repeat block, a conditional; toggle to HTML source and back; save a draft; hit Preview.
- Hosting page `src/app/admin/document-templates/[id]/page.tsx` — **not modified**.
- `npm test` ≥ 1652 + new round-trip tests, 0 fail.

**Rollback:** `TemplateEditor.tsx` re-points "Visual" at the old `contentEditable` block (kept in git history / behind a `NEXT_PUBLIC_TEMPLATE_EDITOR=legacy` flag for one release). Renderer unaffected.

---

## Phase 5 — Switch the default engine to Chromium, per surface

Each sub-step: flip one surface, verify, soak. Or set `DOC_RENDER_ENGINE=chromium` globally only after 5.1–5.3 are each verified in isolation.

### 5.1 Preview route (lowest risk — nothing is stored)

`preview/route.ts` passes `{ engine: "chromium" }`. Verify the editor Preview PDF now matches the editing surface.

### 5.2 Non-release documents (`render-store.ts`)

`renderAndStore` passes `{ engine: "chromium" }`. Affected: demand letter, payment receipt, acknowledgement receipt, final computation sheet, application form.
- Generate one of each → confirm valid, styled, header/footer present.
- Confirm the new row's `content_hash` **differs** from a pre-switch render (proves the switch took) and **old `rendered_documents` rows are untouched**.

### 5.3 Release documents (`release-service.ts`) — HIGH-RISK GATE

`generateOneReleaseDocument` passes `{ engine: "chromium" }`.
- Manual side-by-side (pdfmake vs chromium) of every release slug for a test loan.
- Signing check: generate → `witnessSignGeneratedDocument` → confirm `signature_hash` is set (it copies `content_hash`; audit §4 — no re-render, so this is inherently safe) and the close-gate still passes.
- Legal/compliance sign-off on appearance **if the client requires it**.
- Consider bumping `export const maxDuration` on the release generate route (7 docs × ~0.5 s ≈ 3–5 s; default may be tight).

**Exit criteria:**
- All three surfaces on Chromium; `npm test` green; one week soak with monitoring on Gotenberg error rate + latency.
- No change to signed historical documents.

**Rollback:** set `DOC_RENDER_ENGINE=pdfmake` (instant, global) or drop the per-call `{ engine }` on the offending surface. pdfmake code still present.

---

## Phase 6 — Retire pdfmake (non-optional, after Phase 5 soak)

> Decision #5: pdfmake is retired permanently — no break-glass fallback. Gotenberg
> is a hard dependency from here on; `gotenberg.ts` carries health-check + retry
> logic and the Fly.io service has platform health checks.

- Delete the pdfmake branch in `pdf.ts` (or the whole file), `fonts.ts`, and deps `pdfmake`, `html-to-pdfmake`, `@types/pdfmake`, `@foliojs-fork/*` (if not pulled elsewhere).
- Remove those entries from `next.config.ts` `serverExternalPackages`. **Keep `jsdom`** (still used by `merge.ts`).
- Run `npm run check:jsdom-esm`; run `npm test`, `next build`.
- Remove the `engine` param default fork — chromium becomes the only path (keep the param for tests / future).

**Exit criteria:** smaller bundle, fewer externals, all gates green, no reference to pdfmake in `src/`.

**Rollback:** this phase is optional and last; skip it if the org wants pdfmake retained as a break-glass fallback.

---

## Phase 7 — DOCX export (in scope — decision #6)

- In-process **`html-to-docx`** (pure JS, serverless-safe) OR Gotenberg's `/forms/libreoffice/convert` route.
- "Download .docx" on the template page (exports the *template* with `{{tokens}}`) and optionally on generated documents (exports the *merged* HTML).
- Independent of Phases 1–6; can ship any time after Phase 4.

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Determinism normalisation insufficient (Chromium object-order variance) | Medium | Medium | Phase 2 `pdf-lib` load+save fallback; golden-hash tests catch drift; determinism isn't a runtime rule (audit §4) so worst case is a test-only concern. |
| Gotenberg is a new single point of failure for **all** document generation | Medium | High | Health checks + retry-with-backoff in `gotenberg.ts`; **keep pdfmake behind the flag through Phase 5** for instant global rollback; don't do Phase 6 until confident. |
| `data-repeat` on `<tr>` doesn't model cleanly in ProseMirror tables | Medium | Medium | Extend `TableRow` with the attribute (4.2); the 45-template round-trip test (4.5) is the gate. |
| Latency: ~0.2–0.8 s/doc vs ~0.05–0.15 s; release packet ≈ 3–5 s | Low | Low | Acceptable for on-demand; bump `maxDuration` on the release-generate route; Gotenberg keeps Chromium warm. |
| CI can't host a container for determinism tests | Low–Med | Low | Gate `chromium.integration.test.mts` on `GOTENBERG_URL`; keep `merge.test.mts` + unit suite as the PR gate; run integration against dev Gotenberg on a schedule. |
| TipTap Pro needed for something (export) | Low | Low | Core + community extensions cover editor + tables + images; DOCX uses `html-to-docx`, not TipTap Pro. |
| jsdom ESM fragility resurfaces when deps change | Low | Medium | `check:jsdom-esm` already guards it; we **keep** jsdom and don't disturb its tree. |
| Container cost / ops burden | Low | Low | ~$5–20/mo; one image, one health check. |

---

## Test strategy (per phase, cumulative)

- **Always green:** `npm test` unit suite (baseline **1652 / 0**), `tsc --noEmit` on touched files, `next build`.
- **Phase 1:** golden-hash assertion that the **default (pdfmake) path is byte-unchanged**.
- **Phase 2:** `chromium.integration.test.mts` — repeat-render + cold-restart determinism + per-template golden hashes (env-gated).
- **Phase 4:** `tiptap-roundtrip.test.mts` — 45 templates parse→serialize→`mergeTemplate` unchanged.
- **Phase 3 & 5.3:** manual `_snapshots/` visual diff (pdfmake vs chromium), release docs reviewed side-by-side.
- **Phase 5:** verify new `content_hash` differs post-switch; verify historical signed rows untouched; verify signing + close-gate.
- `merge.test.mts` is **never modified** — it is the invariant that the template language still means the same thing.

---

## Timeline (one engineer, rough)

| Phase | Effort |
|---|---|
| 0 — Gotenberg provisioning + font/determinism decisions | 3–4 days |
| 1 — renderer abstraction (dormant) | 1 week |
| 2 — determinism + tests | 1 week |
| 3 — shared CSS + header/footer/logo | 3–4 days |
| 4 — TipTap editor + custom nodes + round-trip | 1.5–2 weeks |
| 5 — engine switch per surface + soak | 3 days + 1 week soak |
| 6 — retire pdfmake (optional) | 2–3 days |
| 7 — DOCX (optional) | 2–3 days |

**Core (Phases 0–5): ~5–6 weeks.**

---

## Open decisions — RESOLVED (2026-09-10)

1. ✅ **Gotenberg host = Fly.io.** One small container, built-in private `.internal` networking (never publicly reachable), `fly.toml` committed under `infra/gotenberg/`, ~$5/mo, no cold starts.
2. ✅ **Document font = Liberation Sans** (metric-compatible with the current Helvetica → same look + line breaks, renders identically everywhere). Bundled `.woff2`, attached per request.
3. ✅ **Treat byte-determinism as a requirement.** Phase 2 does the full normalisation (`makeDeterministic()` extension + `pdf-lib` fallback + golden-hash tests). Rationale: it's a lending system with signed legal PDFs; keeping "we can reproduce any generated file exactly" is cheap insurance even though nothing enforces it at runtime today.
4. ✅ **Do a Legal side-by-side review at Phase 5.3** (before the real release documents — PN, disclosure, loan agreement, vouchers — switch engines). Wording is unchanged; layout may shift slightly. Not a hard blocker unless the client's compliance process requires a formal appearance sign-off — build the review checkpoint in regardless.
5. ✅ **Retire pdfmake permanently.** Phase 6 is **non-optional**. After the Phase 5 soak, `pdfmake` / `html-to-pdfmake` / `@foliojs-fork/*` / `@types/pdfmake` are deleted and removed from `serverExternalPackages` (jsdom stays). **Trade-off accepted:** Gotenberg becomes a hard dependency for all document generation — mitigated by health checks + retry-with-backoff in `gotenberg.ts`; no break-glass fallback retained.
6. ✅ **DOCX export = in scope now.** Phase 7 runs as part of this effort, right after Phase 4, using in-process `html-to-docx` (pure JS, serverless-safe).
7. ✅ **No CI pipeline exists** (`KCIVOR/Loanstar` on GitHub has **no `.github/workflows`**; the `test:ci` script is manual-only; Vercel just builds on push). So the determinism integration tests run **locally / manually against the dev Fly.io Gotenberg**, gated on `GOTENBERG_URL`. Revisit if GitHub Actions is added later.
