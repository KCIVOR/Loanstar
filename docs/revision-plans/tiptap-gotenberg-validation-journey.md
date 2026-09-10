# Validation journey — TipTap editor + Gotenberg renderer

Step-by-step, with the **expected output** at each step. Tick it or note what
actually happened.

Branch: `feature/doc-editor-tiptap-gotenberg` — worktree
`loanstar/.worktrees/doc-editor`. Run everything **from that worktree**.

Legend: **[NOW]** = validatable today, no Gotenberg. **[AFTER DEPLOY]** = needs
Gotenberg live.

---

## 0. One-time setup

1. Give the worktree its env file (worktrees don't inherit it):
   ```bash
   cp "C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local" \
      "C:/Users/Rovick/Desktop/Loanstar System/loanstar/.worktrees/doc-editor/.env.local"
   ```
   **Expected:** the file now exists in the worktree.

2. Install deps (TipTap + html-to-docx were added on this branch):
   ```bash
   cd "C:/Users/Rovick/Desktop/Loanstar System/loanstar/.worktrees/doc-editor"
   npm install
   ```
   **Expected:** completes; `npm ls @tiptap/react` shows `@tiptap/react@2.27.3`.

---

## PART A — Automated gates  **[NOW]**

### A1. Full test suite

```bash
npm test
```
**Expected:** `tests 1641 · pass 1634 · fail 0 · skipped 7`.
The 7 skipped = 6 `chromium: …` + 1 `round-trip: every live published template
body` (all need env that isn't set yet). **0 failures is the pass condition.**

### A2. Round-trip against EVERY live template (the editor-safety gate)

```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env.local | xargs -d '\n')
node --import tsx --test src/lib/documents/render/__tests__/tiptap-roundtrip.test.mts
```
**Expected:** `tests 12 · pass 12 · fail 0`. The line
`✔ round-trip: every live published template body` must be **pass, not skip**.
It loads all 29 published bodies into the TipTap schema, re-serialises, and
asserts `mergeTemplate` output is unchanged (after normalising rendering-inert
differences). A failure names the offending slug(s).

### A3. Deterministic-normaliser unit tests

```bash
node --import tsx --test src/lib/documents/render/__tests__/deterministic.test.mts
```
**Expected:** `tests 6 · pass 6 · fail 0`.

### A4. Types + build

```bash
npx tsc --noEmit && npx next build
```
**Expected:** `tsc` prints nothing new for `render/**` or `template-editor/**`;
`next build` ends `✓ Compiled successfully`. (Pre-existing unrelated `tsc` errors
in other test fixtures may remain — compare against `develop`.)

---

## PART B — TipTap editor in the browser (pdfmake still the renderer)  **[NOW]**

```bash
npm run dev
```
Open `http://localhost:3000/login`, click **Super Admin**, then go to
`http://localhost:3000/admin/document-templates`.

### B1. Open a template

Click any template (e.g. **Promissory Note**) → its detail page.
**Expected:** the editor loads in **Visual** mode showing the rendered template
(headings, paragraphs, tables) — **not** raw HTML. A toolbar sits above it
(B / I / U, H1–H3, ¶, lists, align arrows, Table / +Row / +Col / −Row / −Col, HR).
A right-hand palette lists **Insert field**, **Repeating tables**, **Conditionals**.
Above the editor: an info alert plus **Download .docx**, **Preview PDF**, **Save draft**.

### B2. Round-trip a template untouched

Click **Save draft** without changing anything.
**Expected:** green "saved" confirmation. Reopen the template → it looks the same.
(Under the hood: a new `draft` version was written; the published one is untouched.)

### B3. Toolbar — marks & headings

Select a word → click **B**. Select a line → click **H2**.
**Expected:** the word turns bold; the line becomes a heading. Clicking **B**
again on the bold word un-bolds it.

### B4. Toolbar — alignment

Put the cursor in a paragraph → click **⟹ (align right)**.
**Expected:** the paragraph shifts right in the editor. Save draft, then
**Preview PDF** → the paragraph is right-aligned in the PDF too.
(Alignment is stored as `data-align="right"`; `PRINT_CSS` renders it.)

### B5. Toolbar — tables

Click **Table** → a 2×2 table with a header row appears at the cursor. Click in a
cell → **+Row** adds a row, **+Col** adds a column, **−Row / −Col** remove them.
**Expected:** all four operations work; the table stays well-formed.

### B6. Palette — insert a merge field

Click into a paragraph → in the palette click e.g. **Borrower name**.
**Expected:** the literal text `{{borrowerName}}` is inserted at the cursor.

### B7. Palette — insert a repeating table

Click **PDC schedule table** (or any) in the palette.
**Expected:** a table is inserted whose second `<tr>` carries the repeat marker
(shown with a dashed outline in the editor). **Preview PDF** → that row is
repeated once per sample item.

### B8. Palette — insert a conditional

Click an **if …** button in the palette.
**Expected:** a tinted block `shown when <label>` is inserted. In **Preview PDF**,
it appears or is omitted depending on the sample flag value.

### B9. HTML source mode

Switch the segmented control to **HTML source**.
**Expected:** the raw HTML of the current body — including `{{tokens}}`,
`data-repeat`, `data-if` — is shown in a monospace textarea and is editable.
Switch back to **Visual** → your source edits are reflected.

### B10. Preview PDF (pdfmake engine — the default today)

Click **Preview PDF**.
**Expected:** after a moment a PDF renders inline below the editor, filled with
sample data. This still uses the **pdfmake** engine (so it will NOT perfectly
match the editor yet — that's Part D).

### B11. Download .docx

Click **Download .docx**.
**Expected:** a `template.docx` downloads. Open it in Word/LibreOffice →
an editable document with the same text and `{{tokens}}` visible, tables intact.
Layout is "good enough", not print-exact.

---

## PART C — Deploy Gotenberg  **[AFTER DEPLOY]**

Follow `infra/gotenberg/README.md`:

### C1. Deploy

```bash
cd infra/gotenberg
fly launch --no-deploy --copy-config --name loanstar-gotenberg --region sin
fly secrets set GOTENBERG_API_BASIC_AUTH_USERNAME=loanstar \
                GOTENBERG_API_BASIC_AUTH_PASSWORD="$(openssl rand -hex 24)"
fly deploy
```
**Expected:** `fly status` shows one machine **running**, health check **passing**.

### C2. Reachability

```bash
curl -u loanstar:<password> https://loanstar-gotenberg.fly.dev/health
```
**Expected:** HTTP 200, body `{"status":"up",...}` (or similar healthy JSON).

### C3. Provide the font

Put `LiberationSans-Regular` as WOFF2 at
`src/lib/documents/render/assets/doc.woff2` (see README §2). Record its sha256 in
`infra/gotenberg/README.md`.
**Expected:** the file exists; `ls -l` shows a non-zero size.

### C4. Env vars

Add to the worktree `.env.local` (and later to Vercel):
```
GOTENBERG_URL=https://loanstar-gotenberg.fly.dev
GOTENBERG_BASIC_AUTH_USER=loanstar
GOTENBERG_BASIC_AUTH_PASS=<password>
```
Leave `DOC_RENDER_ENGINE` unset for now.

---

## PART D — Chromium render path  **[AFTER DEPLOY]**

### D1. Determinism integration tests

```bash
npm test -- --test-name-pattern="chromium"
```
**Expected:** the previously-skipped `chromium: …` tests now **run and pass** —
`chromium: byte-deterministic across renders`, `… determinism holds with
interleaved documents`, `… differs from the pdfmake engine`, etc.

### D2. Pin golden hashes

Run D1 with `GOLDEN_ACTIVE = true` set in
`chromium.integration.test.mts` once, copy the two logged hashes into `GOLDEN`,
commit.
**Expected:** on re-run, `chromium: matches pinned golden hashes` passes. A later
Gotenberg-image or font change will then fail this test until you regenerate.

### D3. Snapshot every template via Chromium

```bash
GOTENBERG_URL=$GOTENBERG_URL npx tsx --env-file=.env.local \
  scripts/render-chromium-snapshots.mts
```
**Expected:** `✅` for each of the ~29 templates, files in `_snapshots/chromium/`,
final line `29 rendered, 0 failed`. Open 6–8 PDFs (one per category):
- logo appears in the page header, "Page X of Y" in the footer
- tables span the full page width, headers grey-filled
- headings sized sensibly, no clipped content, sane page breaks

If header/footer overlap the body or the logo is missing/oversized, tune
`src/lib/documents/render/{print-styles.ts,letterhead.ts}` and re-run.

### D4. Editor ↔ PDF match (the whole point)

In `.env.local` set `DOC_RENDER_ENGINE=chromium`, restart `npm run dev`. Open a
template, click **Preview PDF**.
**Expected:** the PDF now closely matches the editing surface — same fonts, same
table widths, same alignment, plus the logo header + page-number footer. This is
the WYSIWYG payoff.

### D5. .docx still works

Click **Download .docx** again.
**Expected:** unchanged — DOCX export is independent of the PDF engine.

---

## PART E — Per-surface rollout + soak  **[AFTER DEPLOY]**

Follow `infra/gotenberg/PHASE-5-6-RUNBOOK.md`. Validate each surface after
flipping it to `{ engine: "chromium" }`:

### E1. Preview route (5.1)

**Expected:** editor **Preview PDF** matches the surface (same as D4, now without
the global env flag).

### E2. Non-release docs (5.2) — demand letter / receipts / computation sheet

Generate one of each from its normal place in the app (collector demand-letter
button, AR payment receipt, etc.).
**Expected:** the generated PDF has the new look (logo header, full-width tables).
In `rendered_documents`, the new row's `content_hash` differs from a pre-switch
one; older rows are unchanged.

### E3. Release docs (5.3) — HIGH-RISK, Legal review

On a test release file, generate the packet.
**Expected:** all release documents render via Chromium. Then:
- witness-sign a document → it gets `signed_at` + `signature_hash` (a copy of
  `content_hash`), and the release **close-gate** still passes.
- **Legal** reviews the new-look PN / Disclosure / Loan Agreement side-by-side
  with the old and signs off on the appearance change.

### E4. Rollback drill

Set `DOC_RENDER_ENGINE=pdfmake`, redeploy.
**Expected:** generation immediately reverts to the old renderer. (Proves the
escape hatch works before you rely on it.)

---

## PART F — Regression: nothing unrelated broke  **[NOW + AFTER]**

| Check | Expected |
|---|---|
| `git diff --name-only develop..HEAD` | only `render/**`, `template-editor/**`, `TemplateEditor.tsx`, `preview`+`docx` routes, `next.config.ts`, `package*.json`, `infra/gotenberg/**`, `src/types/**` |
| Existing `document_templates` / `_versions` rows | unchanged — no migration ran |
| The 504 signed `generated_documents` | unchanged storage PDFs + `signature_hash` |
| A published template's live generation (before any Phase-5 flip) | still uses pdfmake, byte-identical to `develop` |
| `npm run check:jsdom-esm` | `CLEAN` |
| Borrower portal — download a release document | still works (signed URL to stored bytes) |

---

## If a step fails

Note **Part + step number**, expected vs actual, and:
- Part A2 failure → a template the TipTap schema mangles; capture the slug and the
  before/after `mergeTemplate` diff.
- Part B (editor) failure → browser console errors + which toolbar/palette action.
- Part D failure → `curl $GOTENBERG_URL/health`, and the Gotenberg logs
  (`fly logs -a loanstar-gotenberg`).
