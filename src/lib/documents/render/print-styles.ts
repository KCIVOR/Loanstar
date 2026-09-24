/**
 * The single stylesheet shared by the PDF renderer (Gotenberg / headless
 * Chromium) and the TipTap editor surface. "What you see is what you print"
 * depends on this being the ONLY source of document typography.
 *
 * House spec reverse-engineered from the LSLGC source Word documents
 * (`LSLGC Documents/LSLGC Calculator and Docs`), then tightened in the
 * compact-layout pass (2026-09-11, docs/revision-plans/compact-document-
 * layout-plan.md) to match how the client trims their own printed originals
 * — smaller margins/logo/spacing so more documents fit on 1 printed page:
 *   - page   : 8.5in x 13in  (Philippine Folio / long bond)
 *   - margins: 0.55in top / 0.85in right / 0.5in bottom / 0.85in left
 *   - body   : Times New Roman 12pt, justified, 1.08 line-height, 6pt after ¶
 *   - title  : centered, bold, ALL CAPS, ~13.5pt
 *   - logo   : ~1.5in wide, upper-right, once at the top of page 1 (not a
 *              running header) — emitted by `letterhead.ts` as `.doc-letterhead`
 *
 * The merged HTML handed to Gotenberg already has `data-if` / `data-repeat` /
 * merge-chips resolved away by `mergeTemplate`, so the `@media screen` author
 * affordances below never match at print time — they exist purely for the
 * editor.
 *
 * NOTE: this file must have no imports (it is inlined into a `<style>` tag on
 * both the server and the client).
 */
export const PRINT_CSS = `
@page { size: 8.5in 13in; margin: 0.75in 1in 0.75in 1in; }

@font-face {
  font-family: "Loanstar Doc";
  src: url("fonts/doc.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Loanstar Doc";
  src: url("fonts/doc-bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

:root { --doc-fg: #111111; --doc-rule: #333333; --doc-th-bg: #f0f0f0; }

html, body { margin: 0; padding: 0; }

body {
  font-family: "Loanstar Doc", "Times New Roman", "Tinos", "Liberation Serif",
    Georgia, serif;
  font-size: 12pt;
  line-height: 1.08;
  color: var(--doc-fg);
  text-align: justify;
}

/* letterhead — the wordmark once, upper-right, at the top of page 1. Either the
   renderer's auto-prepended block (.doc-letterhead) or an author-placed
   <img class="doc-logo"> from the "Company logo" palette button. Sized down
   (compact-layout pass, 2026-09-11) to match how the client trims their own
   printed originals — smaller mark, less space before the content starts. */
.doc-letterhead { text-align: right; margin: 0 0 8pt; }
.doc-letterhead img { height: 0.55in; width: auto; }
/* inline-block so the wrapper's data-align (center by default, or left/right)
   positions it. Default size 0.55in tall; a template may override by setting a
   width attribute on the <img> (then the attr wins and height scales). */
img.doc-logo { display: inline-block; margin: 0 0 6pt; }
img.doc-logo:not([width]) { height: 0.55in; width: auto; }

/* alignment — the editor emits data-align (TipTap strips inline style); legacy
   templates keep style="text-align:…" which is native CSS and needs no rule. */
[data-align="center"] { text-align: center; }
[data-align="right"]  { text-align: right; }
[data-align="left"]   { text-align: left; }
[data-align="justify"]{ text-align: justify; }

h1 {
  font-size: 13.5pt;
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.2;
  margin: 0 0 8pt;
}
h2 { font-size: 12pt; font-weight: 700; text-align: left; margin: 8pt 0 4pt; }
h3 { font-size: 12pt; font-weight: 700; text-align: left; margin: 7pt 0 3pt; }
p  { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt 24pt; padding: 0; }
li { margin: 0 0 2pt; }
b, strong { font-weight: 700; }
i, em { font-style: italic; }
a { color: inherit; text-decoration: underline; }

table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; }
th, td {
  border: 0.5pt solid var(--doc-rule);
  padding: 2pt 5pt;
  font-size: 11pt;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 700; background: var(--doc-th-bg); }

/* data-plain — layout-only tables (label/blank rows, signature blocks) that
   the source Word docs show with no grid lines at all, unlike genuine data
   tables (vehicle lists, PDC schedules, voucher line items) which keep the
   default border above. */
table[data-plain] th, table[data-plain] td { border: none; padding: 1.5pt 5pt; }
table[data-plain] th { background: none; }

/* data-underline — a cell that fills in on a single bottom rule rather than a
   ruled box (disclosure/legal forms that mirror a Word underline field). Works
   inside a bordered or a data-plain table alike. First added for
   disclosure_statement, whose source (SFCalculator/DISC.doc) enters every
   figure on an underline, not in a boxed grid. */
th[data-underline], td[data-underline],
table[data-plain] th[data-underline], table[data-plain] td[data-underline] {
  border: none; border-bottom: 0.5pt solid var(--doc-rule);
}

/* data-compact-nudge — compact-layout pass Phase 3 (docs/revision-plans/
   compact-document-layout-plan.md): a small per-document font-size trim for
   documents that were only spilling a few lines onto a 2nd page. Fixed value
   (not a per-instance style) because TipTap's serialiser strips inline
   style — see the Div extension's own note on this in extensions.ts. Only
   affects text without its own explicit pt size (paragraphs, plain-table
   labels); headings keep their fixed size untouched. Table cells (th/td) have
   their own explicit 11pt that wouldn't otherwise inherit this — nudged down
   to 10.5pt, the readability floor (constraint 3 in the plan doc), only
   inside a compact-nudge scope. */
div[data-compact-nudge] { font-size: 11.3pt; }
div[data-compact-nudge] table th,
div[data-compact-nudge] table td { font-size: 10.5pt; }

/* data-accurate — typography measured directly from the real source .doc's
   OOXML (not estimated): body/label text 9pt, title 10pt bold, effectively
   single line spacing, and NO automatic gap after paragraphs — the original
   relies on manual blank lines in the content for spacing, not a stylesheet
   margin. First applied to disclosure_statement (source: LSLGC Documents/
   SFCalculator/DISC.doc) — see compact-document-layout-plan.md. */
div[data-accurate] { font-size: 9pt; line-height: 1.05; }
div[data-accurate] p { margin: 0; }
div[data-accurate] h1,
div[data-accurate] h2 { font-size: 10pt; margin: 0 0 4pt; text-transform: none; letter-spacing: normal; }
div[data-accurate] table th,
div[data-accurate] table td { font-size: 9pt; padding: 1pt 4pt; }
div[data-accurate] table { margin: 0; }

img { max-width: 100%; }
hr { border: 0; border-top: 0.5pt solid var(--doc-rule); margin: 8pt 0; }

/* keep signature blocks and short tables from splitting mid-cell */
tr, td, th { page-break-inside: avoid; }
h1, h2, h3 { page-break-after: avoid; }

/* ---- editor-only affordances (never printed) ---- */
@media screen {
  .merge-chip {
    background: var(--accent-soft, #e1e7ec);
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 4px;
    padding: 0 4px;
    font: 0.85em ui-monospace, monospace;
    white-space: nowrap;
  }
  [data-repeat] { outline: 1px dashed #9aa5b1; outline-offset: 2px; }
  [data-if], [data-unless] { background: rgba(255, 214, 0, 0.12); }
}
`.trim();
