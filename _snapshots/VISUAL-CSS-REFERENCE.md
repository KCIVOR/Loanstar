# Visual Editor CSS Reference

**Phase 0.2: Documentation of current Visual editor CSS defaults**

This document captures the CSS rules currently applied to the Visual editor surface in `TemplateEditor.tsx` (lines 162-167).

## Current Visual Editor Styles

The `.visual-surface` element applies the following CSS to template previews:

```css
.doc-template-editor .visual-surface {
  min-height: 460px;
}

.doc-template-editor .visual-surface :is(table) {
  border-collapse: collapse;
  width: 100%;
}

.doc-template-editor .visual-surface :is(th,td) {
  border: 1px solid #d5d5d5;
  padding: 4px 6px;
  font-size: 13px;
  text-align: left;
}

.doc-template-editor .visual-surface :is(h1) {
  font-size: 20px;
  font-weight: 600;
  margin: 8px 0;
}

.doc-template-editor .visual-surface :is(h2) {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0;
}

.doc-template-editor .visual-surface [data-repeat] {
  outline: 1px dashed #9aa5b1;
}
```

## Reference Table: Visual Editor Defaults

| Element | Property | Current Visual Value | Notes |
|---------|----------|---------------------|-------|
| `table` | border-collapse | collapse | Standard table rendering |
| `table` | width | 100% | Full width tables |
| `th, td` | border | 1px solid #d5d5d5 | Light gray borders |
| `th, td` | padding | 4px 6px | Compact cell padding |
| `th, td` | font-size | 13px | Small font for cells |
| `th, td` | text-align | left | Left-aligned text |
| `h1` | font-size | 20px | Large headings |
| `h1` | font-weight | 600 | Semi-bold |
| `h1` | margin | 8px 0 | Vertical spacing |
| `h2` | font-size | 16px | Medium headings |
| `h2` | font-weight | 600 | Semi-bold |
| `h2` | margin | 8px 0 | Vertical spacing |
| `[data-repeat]` | outline | 1px dashed #9aa5b1 | Editor hint (not in PDF) |

## Known Discrepancies

The Visual editor relies on browser default CSS for elements not explicitly styled above. The PDF engine (pdfmake via html-to-pdfmake) uses different defaults, causing visual mismatches.

**Phase 1 and beyond will address these discrepancies by:**
1. Creating shared style definitions
2. Applying them to both Visual editor and PDF engine
3. Verifying that baseline PDFs remain unchanged

## Source Location

- **File:** `src/components/admin/TemplateEditor.tsx`
- **Lines:** 162-167
- **Selector:** `.doc-template-editor .visual-surface`

---

**Generated:** 2026-09-10 (Phase 0.2)
**Baseline:** 19 published templates snapshotted
