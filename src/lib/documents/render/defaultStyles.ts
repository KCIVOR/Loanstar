/**
 * Shared document styling defaults used by both the Visual editor preview
 * and the PDF renderer, so "what you see is what you print."
 *
 * These mirror pdfmake's built-in tag defaults, with adjustments for
 * professional table layout (full-width tables, readable cell padding).
 */

/** Points to pixels at 96dpi (CSS 1px ≈ 0.75pt). */
const PT_TO_PX = 0.75;

/**
 * pdfmake `defaultStyles` object. Passed to `htmlToPdfmake()` to override
 * its built-in tag defaults.
 */
export const PDF_DEFAULT_STYLES = {
  // Headings (keep pdfmake sizes, they're readable)
  h1: { fontSize: 24, bold: true, marginBottom: 5 },
  h2: { fontSize: 22, bold: true, marginBottom: 5 },
  h3: { fontSize: 20, bold: true, marginBottom: 5 },
  
  // Body text
  p: { margin: [0, 5, 0, 10] }, // left, top, right, bottom (pt)
  
  // Tables: keep gray header fill, but make tables full-width by default
  th: { bold: true, fillColor: '#EEEEEE' },
  table: { marginBottom: 5 },
  
  // Links (if anyone adds them later)
  a: { color: 'blue', decoration: 'underline' },
};

/**
 * CSS rules for the Visual editor that mirror PDF_DEFAULT_STYLES.
 * Applied to `.visual-surface` in TemplateEditor.tsx.
 * 
 * Uses px units for browser consistency (converted from PDF's pt at 96dpi: 1pt ≈ 1.33px).
 */
export const VISUAL_EDITOR_CSS = `
  /* Headings (PDF: 24pt→32px, 22pt→29px, 20pt→27px) */
  .visual-surface h1 { font-size: 32px; font-weight: 700; margin: 0 0 7px 0; }
  .visual-surface h2 { font-size: 29px; font-weight: 700; margin: 0 0 7px 0; }
  .visual-surface h3 { font-size: 27px; font-weight: 700; margin: 0 0 7px 0; }
  
  /* Body text (PDF margin [0,5,0,10]pt → 0 7px 13px 0) */
  .visual-surface p { margin: 0 7px 13px 0; }
  
  /* Tables: full-width, black 1px borders (matches pdfmake default layout), gray header fill */
  .visual-surface table { border-collapse: collapse; width: 100%; margin-bottom: 7px; }
  .visual-surface th, .visual-surface td { 
    border: 1px solid #000; 
    padding: 3px 5px; /* PDF: 2pt/4pt → 3px/5px */
    font-size: 13px; /* PDF base 10pt → 13px */
    text-align: left; 
  }
  .visual-surface th { 
    font-weight: 700; 
    background-color: #EEEEEE; 
  }
`;
