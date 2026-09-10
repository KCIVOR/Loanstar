/**
 * The single stylesheet shared by the PDF renderer (Gotenberg / headless
 * Chromium) and — from Phase 4 — the TipTap editor surface. "What you see is
 * what you print" depends on this being the ONLY source of document typography.
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
@page { size: A4; margin: 24mm 18mm 22mm 18mm; }

@font-face {
  font-family: "Loanstar Doc";
  src: url("fonts/doc.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: block;
}

:root { --doc-fg: #111111; --doc-rule: #333333; --doc-th-bg: #eeeeee; }

html, body { margin: 0; padding: 0; }

body {
  font-family: "Loanstar Doc", "Liberation Sans", Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: var(--doc-fg);
}

/* alignment — the editor emits data-align (TipTap strips inline style); legacy
   templates keep style="text-align:…" which is native CSS and needs no rule. */
[data-align="center"] { text-align: center; }
[data-align="right"]  { text-align: right; }
[data-align="left"]   { text-align: left; }
[data-align="justify"]{ text-align: justify; }

h1 { font-size: 16pt; font-weight: 700; margin: 0 0 8pt; }
h2 { font-size: 13pt; font-weight: 700; margin: 14pt 0 6pt; }
h3 { font-size: 11.5pt; font-weight: 700; margin: 12pt 0 4pt; }
p  { margin: 0 0 8pt; }
ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
li { margin: 0 0 3pt; }
b, strong { font-weight: 700; }
i, em { font-style: italic; }
a { color: inherit; text-decoration: underline; }

table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; }
th, td {
  border: 0.75pt solid var(--doc-rule);
  padding: 3pt 5pt;
  font-size: 10pt;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 700; background: var(--doc-th-bg); }

img { max-width: 100%; }
hr { border: 0; border-top: 0.75pt solid var(--doc-rule); margin: 12pt 0; }

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
