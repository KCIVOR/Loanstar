# Phases 5 & 6 — runbook (require a deployed Gotenberg + soak)

Phases 0–4 and 7 are code-complete and committed on `feature/doc-editor-tiptap-gotenberg`.
Phases 5 and 6 are **operational** — they can only be done once the Gotenberg
service is live and after a soak period, so they are not applied in code yet.

---

## Prerequisites

1. Deploy Gotenberg (see `README.md` §1) and provide `doc.woff2` (§2).
2. Set Vercel env: `GOTENBERG_URL`, `GOTENBERG_BASIC_AUTH_USER`,
   `GOTENBERG_BASIC_AUTH_PASS`. Leave `DOC_RENDER_ENGINE` = `pdfmake`.
3. Run the gated tests against the live service and pin goldens:
   ```bash
   GOTENBERG_URL=… GOTENBERG_BASIC_AUTH_USER=… GOTENBERG_BASIC_AUTH_PASS=… \
   npm test -- --test-name-pattern="chromium"
   ```
   Then set `GOLDEN_ACTIVE = true` and paste the logged hashes into
   `src/lib/documents/render/__tests__/chromium.integration.test.mts`.
4. Snapshot every template via Chromium and eyeball 6–8:
   ```bash
   GOTENBERG_URL=… npx tsx --env-file=.env.local scripts/render-chromium-snapshots.mts
   ```
   Tune `PRINT_CSS` and `letterhead.ts` (header/footer offsets — Chromium print
   header sizing is finicky) until the output is right. Re-pin goldens after any
   `PRINT_CSS` / font change.

---

## Phase 5 — switch the default engine, per surface

The mechanism already exists: `renderTemplateToPdf(html, ctx, { engine })` and
the `DOC_RENDER_ENGINE` env var. Roll out one surface at a time; verify; soak.

### 5.1 Preview route (no stored bytes — lowest risk)

`src/app/api/admin/document-templates/preview/route.ts`:
```ts
const pdf = await renderTemplateToPdf(body, buildSampleContext(), { engine: "chromium" });
```
Verify: the editor's **Preview PDF** now matches the editing surface.

### 5.2 Non-release documents (`render-store.ts`)

`src/lib/documents/render-store.ts`, in `renderAndStore`:
```ts
const pdf = await renderTemplateToPdf(published.body, context, { engine: "chromium" });
```
Affected: demand letter, payment receipt, acknowledgement receipt, final
computation sheet, application form. Generate one of each. Confirm the new
`rendered_documents.content_hash` differs from a pre-switch render; confirm old
rows are untouched.

### 5.3 Release documents (`release-service.ts`) — HIGH-RISK GATE

`src/lib/lra/release-service.ts`, in `generateOneReleaseDocument`:
```ts
const pdf = await renderTemplateToPdf(published.body, templateContext, { engine: "chromium" });
```
Before flipping:
- Render every release slug for a test loan, pdfmake vs chromium, **side by side**.
- **Legal side-by-side review** (decision #4 — wording unchanged, layout may shift).
- Sign: generate → `witnessSignGeneratedDocument` → `signature_hash` is set
  (it copies `content_hash`, no re-render — inherently safe) and the close-gate
  still passes.
- Consider `export const maxDuration = 60` on the release-generate route
  (7 docs × ~0.5 s).

### Or: flip globally

After 5.1–5.3 are each verified in isolation, set `DOC_RENDER_ENGINE=chromium`
in Vercel and drop the per-call `{ engine }` overrides.

### Soak

One week with monitoring on the Gotenberg error rate + p95 latency. Rollback is
instant: `DOC_RENDER_ENGINE=pdfmake`.

---

## Phase 6 — retire pdfmake (decision #5: permanent, no fallback)

After the soak:

1. Delete the pdfmake path:
   - `src/lib/documents/render/pdf.ts` (whole file) and `src/lib/documents/render/fonts.ts`.
   - `render/index.ts` — remove the `htmlToPdf` import/re-export and the
     `engine === "chromium" ? … : htmlToPdf(merged)` fork; `renderViaChromium`
     becomes the only path (keep the `opts.engine` param for tests/future).
   - `render/__tests__/render.test.mts` — the 3 pdfmake determinism tests are now
     dead; delete them (the chromium integration + `deterministic.test.mts` +
     `merge.test.mts` remain).
2. `package.json` — remove `pdfmake`, `html-to-pdfmake`, `@types/pdfmake`.
   `@foliojs-fork/*` fall out transitively.
3. `next.config.ts` `serverExternalPackages` — drop `pdfmake`,
   `@foliojs-fork/pdfkit`, `@foliojs-fork/fontkit`, `html-to-pdfmake`.
   **Keep `jsdom`** (still used by `merge.ts`) and `html-to-docx`.
4. `src/types/html-to-pdfmake.d.ts` — delete.
5. Gates: `npm run check:jsdom-esm` CLEAN, `npm test`, `next build`.

Bundle shrinks; one fewer class of Turbopack-externalisation risk.
