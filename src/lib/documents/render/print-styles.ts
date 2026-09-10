/**
 * The single stylesheet shared by the PDF renderer (Gotenberg / headless
 * Chromium) and the TipTap editor surface. "What you see is what you print"
 * depends on this being the ONLY source of document typography.
 *
 * House spec reverse-engineered from the LSLGC source Word documents
 * (`LSLGC Documents/LSLGC Calculator and Docs`):
 *   - page   : 8.5in x 13in  (Philippine Folio / long bond)
 *   - margins: 0.75in top / 1in right / 0.6in bottom / 1in left
 *   - body   : Times New Roman 12pt, justified, 1.15 line-height, 10pt after ¶
 *   - title  : centered, bold, ALL CAPS, ~13.5pt
 *   - logo   : ~2in wide, centered, once at the top of page 1 (not a running
 *              header) — emitted by `letterhead.ts` as `.doc-letterhead`
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
@page { size: 8.5in 13in; margin: 0.75in 1in 0.6in 1in; }

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
  line-height: 1.15;
  color: var(--doc-fg);
  text-align: justify;
}

/* running letterhead — logo once, centered, at the very top of page 1 */
.doc-letterhead { text-align: center; margin: 0 0 16pt; }
.doc-letterhead img { height: 0.72in; width: auto; }

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
  line-height: 1.25;
  margin: 0 0 14pt;
}
h2 { font-size: 12pt; font-weight: 700; text-align: left; margin: 13pt 0 6pt; }
h3 { font-size: 12pt; font-weight: 700; text-align: left; margin: 11pt 0 4pt; }
p  { margin: 0 0 10pt; }
ul, ol { margin: 0 0 10pt 24pt; padding: 0; }
li { margin: 0 0 4pt; }
b, strong { font-weight: 700; }
i, em { font-style: italic; }
a { color: inherit; text-decoration: underline; }

table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; }
th, td {
  border: 0.5pt solid var(--doc-rule);
  padding: 3pt 6pt;
  font-size: 11pt;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 700; background: var(--doc-th-bg); }

img { max-width: 100%; }
hr { border: 0; border-top: 0.5pt solid var(--doc-rule); margin: 12pt 0; }

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
