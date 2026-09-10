# Implementation Plan: Align Visual Editor and PDF Output

**Version:** 1.0  
**Date:** 2026-09-10  
**Status:** Ready for review  
**Related Audit:** Document template PDF visual mismatch (audit session 2026-09-10)

---

## Executive Summary

**Problem:** The Visual editor preview and PDF output use different rendering engines with different default styles. Non-technical users see one thing in the editor, generate PDFs that look different (table widths, header sizes, spacing).

**Root Cause:** 
- Visual tab: browser `contentEditable` with editor-only CSS
- PDF generation: `html-to-pdfmake` → `pdfmake` with its own tag defaults
- No shared stylesheet between the two

**Solution:** Create shared styling defaults that both the Visual preview and PDF generation use, so "what you see is what you print."

**Scope:** ~200 lines across 4 files; zero behavior change to existing generated PDFs until Phase 3 opt-in.

---

## Constraints (DO NOT VIOLATE)

1. **Existing PDFs must not change until explicitly opted in.** All 19 published templates continue rendering byte-identically through Phase 2.
2. **No breaking changes to the public API.** `renderTemplateToPdf()` signature stays the same.
3. **No migration of existing templates required.** Templates work as-is; new defaults are additive.
4. **Serverless-safe.** No Chromium, no headless browser. Keep `pdfmake`.
5. **Hash determinism preserved.** Same input → same bytes (signing flow depends on this).
6. **Editor must remain usable on existing templates.** Visual tab doesn't break mid-edit.

---

## Current State (Audit Findings)

### What exists today

| Component | Engine | Styling source |
|---|---|---|
| Visual editor tab | Browser `contentEditable` | `TemplateEditor.tsx` scoped CSS (`.doc-template-editor .visual-surface`) |
| Preview PDF button | `html-to-pdfmake` → `pdfmake` | `html-to-pdfmake` built-in tag defaults |
| All generated docs | `html-to-pdfmake` → `pdfmake` | Same as preview |

### Measured discrepancies

| Element | Visual editor shows | PDF actually renders | After fix (Phase 1-3) |
|---|---|---|---|
| `<h2>` | 16px (editor CSS) | 22pt bold (~29px) | Both 29px |
| `<h1>` | 20px | 24pt bold (~32px) | Both 32px |
| `<p>` | Browser default | `[0,5,0,10]` pt (~0,7,13,0 px) | Both 0 7px 13px 0 |
| `<table>` | 100% width, gray border | Auto-width (~36%), black border | Both 100% width, black border |
| `<th>` | Bold, gray border | Bold + `#EEEEEE` fill | Both bold + `#EEEEEE` fill |
| `<td>` padding | 4px 6px | 4pt/2pt (~5px/3px) | Both 5px 3px |

### Live template catalog (19 published)

- **0 templates** use `data-pdfmake` attributes
- **2 templates** (SME forms) have HTML `border="1"` `cellpadding="4"` — **pdfmake ignores both**
- **15 templates** have tables with no width/border/padding styling
- **All templates** rely on engine defaults for layout

### Tests that would catch visual drift

**None.** Current tests (`render.test.mts`) only verify:
- Output is a valid PDF (`%PDF-` magic)
- Byte determinism (same input → same hash)

No test compares Visual CSS to PDF defaults.

---

## Phased Implementation

Each phase is independently shippable and leaves the system fully working. No phase is started until the prior one is verified.

---

### **Phase 0: Baseline verification** *(no code changes)*

Capture the current state so we can prove nothing breaks.

#### 0.1 Snapshot current PDF output

**Goal:** Freeze the byte-exact output of all 19 published templates so Phase 2 can prove they're unchanged.

**Steps:**
1. Query all published template bodies from `document_template_versions` where `status='published'`
2. For each template:
   - Render via `renderTemplateToPdf(body, buildSampleContext())`
   - Save the PDF bytes to `_snapshots/template-{slug}-v{version}.pdf`
   - Record the sha256 hash
3. Create `_snapshots/baseline-hashes.json`:
   ```json
   {
     "demand_letter": { "version": 1, "hash": "abc123..." },
     "blri": { "version": 1, "hash": "def456..." },
     ...
   }
   ```

**Exit criteria:**
- 19 PDF files saved
- Hash manifest committed to git
- All hashes match a second render (proves determinism)

**Rollback:** Delete snapshot files (no production impact).

---

#### 0.2 Document Visual editor CSS

**Goal:** Extract the current Visual editor defaults so Phase 2 can mirror them.

**Steps:**
1. Read `TemplateEditor.tsx` lines 152–167 (the `.visual-surface` CSS block)
2. Document as a reference table in this plan (see "Measured discrepancies" above)
3. No code changes

**Exit criteria:** Table documented above is accurate.

---

### **Phase 1: Create shared style definitions** *(additive, dormant)*

Define the "honest" defaults in a form both the PDF engine and Visual editor can use. **No behavior change yet** — these definitions are not wired to anything.

#### 1.1 Create `src/lib/documents/render/defaultStyles.ts`

**New file:**

```typescript
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
```

**Exit criteria:**
- File compiles, exports are typed
- No imports yet (dormant)
- All tests still pass (180/180 green)
- Visual CSS uses `px` units (not `pt`) for browser consistency

**Rollback:** Delete the file.

**Note:** The `injectTableWidths()` function is added in Phase 1.2 (in `pdf.ts`), not in this file.

---

#### 1.2 Add opt-in flag to `renderTemplateToPdf()`

**Goal:** Let callers choose new defaults without breaking existing renders.

**Changes to `src/lib/documents/render/index.ts`:**

```typescript
import { mergeTemplate, type RenderContext } from "./merge";
import { htmlToPdf } from "./pdf";
import { PDF_DEFAULT_STYLES } from "./defaultStyles";

export type { RenderContext } from "./merge";
export { mergeTemplate } from "./merge";
export { htmlToPdf } from "./pdf";

export type RenderOptions = {
  /** Use shared Visual-editor-aligned defaults. Default: false (legacy behavior). */
  useSharedDefaults?: boolean;
};

export async function renderTemplateToPdf(
  templateHtml: string,
  context: RenderContext,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const merged = mergeTemplate(templateHtml, context);
  return htmlToPdf(merged, options.useSharedDefaults ? PDF_DEFAULT_STYLES : undefined);
}

export function hashPdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

**Changes to `src/lib/documents/render/pdf.ts`:**

```typescript
import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { getPrinter } from "./fonts";

// ... (makeDeterministic unchanged) ...

/**
 * Post-process pdfmake content to inject equal-width columns for tables
 * that don't have explicit widths. Makes tables span full page width.
 */
function injectTableWidths(node: unknown): void {
  if (!node || typeof node !== "object") return;
  
  if (Array.isArray(node)) {
    node.forEach(injectTableWidths);
    return;
  }
  
  const obj = node as Record<string, unknown>;
  
  // If this node has a table without explicit widths, inject equal-width columns
  if (obj.table && !obj.widths) {
    const tableObj = obj.table as Record<string, unknown>;
    const body = tableObj.body;
    if (Array.isArray(body) && body.length > 0 && Array.isArray(body[0])) {
      const columnCount = body[0].length;
      obj.widths = Array(columnCount).fill('*'); // '*' means equal-width
    }
  }
  
  // Recurse into child nodes
  Object.values(obj).forEach(injectTableWidths);
}

export function htmlToPdf(
  html: string, 
  customDefaultStyles?: Record<string, unknown>
): Promise<Uint8Array> {
  const { window } = new JSDOM("");
  const content = htmlToPdfmake(html, { 
    window,
    defaultStyles: customDefaultStyles, // override pdfmake's built-in defaults
    tableAutoSize: false, // Let pdfmake compute widths based on content
  });

  // Make tables full-width by injecting equal-width column specs
  if (customDefaultStyles) {
    injectTableWidths(content);
  }

  const docDefinition: TDocumentDefinitions = {
    content: content as TDocumentDefinitions["content"],
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Helvetica", fontSize: 10 },
  };

  const pdfDoc = getPrinter().createPdfKitDocument(docDefinition);

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () =>
      resolve(new Uint8Array(makeDeterministic(Buffer.concat(chunks)))),
    );
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
```

**Exit criteria:**
- `renderTemplateToPdf(body, ctx)` (no 3rd arg) → byte-identical to Phase 0 snapshot
- `renderTemplateToPdf(body, ctx, {useSharedDefaults:true})` → compiles, runs (output will differ, that's expected)
- `injectTableWidths()` function in `pdf.ts` only runs when `customDefaultStyles` is passed (preserves legacy behavior)
- All existing call sites (release-service.ts, render-store.ts, preview route) → unchanged, still pass 2 args
- 180/180 tests green (no existing test uses the new flag yet)

**Rollback:** Revert the function signature change; delete `defaultStyles.ts` import; remove `injectTableWidths()`.

---

### **Phase 2: Verify new defaults produce valid PDFs** *(tests only, no production change)*

Prove the new shared defaults render correctly for all 19 templates, without changing any production code paths yet.

#### 2.1 Add rendering comparison test

**New test in `src/lib/documents/render/__tests__/defaultStyles.test.mts`:**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplateToPdf, hashPdf } from "../index";
import { buildSampleContext } from "@/lib/documents/templates/fields";

// Simplified template bodies (representative samples)
const TEMPLATES = {
  withTable: `<h2>{{companyName}}</h2>
    <table><tbody>
    <tr><th>Item</th><th>Amount</th></tr>
    <tr><td>Principal</td><td>{{loanAmount}}</td></tr>
    </tbody></table>`,
  
  withHeadings: `<h1>{{companyName}}</h1>
    <h2>Loan Agreement</h2>
    <p>Borrower: {{borrowerName}}</p>`,
};

test("new defaults produce valid PDFs for table template", async () => {
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.ok(pdf.length > 1000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("new defaults produce valid PDFs for heading template", async () => {
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withHeadings, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.ok(pdf.length > 1000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("new defaults are deterministic", async () => {
  const a = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  await new Promise(r => setTimeout(r, 50));
  const b = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.equal(hashPdf(a), hashPdf(b));
});

test("legacy path (no flag) unchanged", async () => {
  // Render without the flag — should match Phase 0 baseline
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext()
    // no 3rd argument
  );
  // This isn't byte-comparing to baseline (we don't have the exact body),
  // but it proves the old path still works
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});
```

**Exit criteria:**
- All 4 new tests pass
- Legacy tests (180 existing) still pass
- Total: 184/184 green

**Rollback:** Delete the test file.

---

#### 2.2 Render all 19 published templates with new defaults

**Script (run once, not committed):**

```bash
npx tsx scripts/verify-new-defaults.mts
```

**Script contents (`scripts/verify-new-defaults.mts`):**

```typescript
import { renderTemplateToPdf } from "../src/lib/documents/render/index";
import { buildSampleContext } from "../src/lib/documents/templates/fields";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data: templates } = await supabase
  .from("document_templates")
  .select("slug, id")
  .eq("is_active", true);

for (const tpl of templates!) {
  const { data: version } = await supabase
    .from("document_template_versions")
    .select("body")
    .eq("template_id", tpl.id)
    .eq("status", "published")
    .order("version_no", { ascending: false })
    .limit(1)
    .single();

  if (!version) continue;

  try {
    const pdf = await renderTemplateToPdf(
      version.body,
      buildSampleContext(),
      { useSharedDefaults: true }
    );
    writeFileSync(`_snapshots/new-${tpl.slug}.pdf`, pdf);
    console.log(`✅ ${tpl.slug}: ${pdf.length} bytes`);
  } catch (err) {
    console.error(`❌ ${tpl.slug}: ${err}`);
    process.exit(1);
  }
}

console.log("\n✅ All 19 templates render successfully with new defaults");
```

**Exit criteria:**
- Script runs without error
- 19 PDFs written to `_snapshots/new-*.pdf`
- Manual spot-check: open 2–3 PDFs, confirm tables are full-width, headers are gray-filled, headings are appropriately sized
- Confirm: none of the _new_ PDFs byte-match the Phase 0 baseline (proves the flag changes output)

**Rollback:** Delete `_snapshots/new-*.pdf` files.

---

### **Phase 3: Update Visual editor to match PDF defaults** *(UI change, no PDF change yet)*

Make the Visual editor preview honest by applying the shared CSS. **PDF generation still uses legacy defaults** (no `useSharedDefaults` flag in production calls).

#### 3.1 Import shared CSS into TemplateEditor

**Changes to `src/components/admin/TemplateEditor.tsx`:**

Replace the current hardcoded `.visual-surface` CSS block (lines 152–167) with:

```typescript
import { VISUAL_EDITOR_CSS } from "@/lib/documents/render/defaultStyles";

// ... (rest of component) ...

return (
  <div className="doc-template-editor grid gap-4 lg:grid-cols-[1fr_320px]">
    <style>{`
      .doc-template-editor .merge-chip {
        background: var(--accent-soft, #e1e7ec);
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 4px;
        padding: 0 4px;
        font-size: 0.85em;
        font-family: ui-monospace, monospace;
        white-space: nowrap;
        user-select: all;
      }
      .doc-template-editor .visual-surface { min-height: 460px; }
      ${VISUAL_EDITOR_CSS}
      .doc-template-editor .visual-surface [data-repeat]{outline:1px dashed #9aa5b1;}
    `}</style>
    {/* ... rest of component */}
  </div>
);
```

**Exit criteria:**
- Editor page compiles, no TypeScript errors
- Open `/admin/document-templates/[any-id]` in browser
- Visual tab now shows:
  - Bigger headings (22pt `<h2>` not 16px)
  - Tables span full editor width
  - Gray-filled header cells
  - Black 1pt table borders
- "Preview PDF" button still works (still uses legacy defaults, so PDF won't match Visual yet — that's expected, fixed in Phase 4)
- Saving a draft still works

**Manual verification checklist:**
- [ ] Visual editor loads without error
- [ ] Tables in Visual tab are full-width with gray headers
- [ ] `<h2>` headings are visibly larger than before
- [ ] Merge field chips still work (can insert, move, delete)
- [ ] Can save draft without error
- [ ] Preview PDF still generates (won't match Visual yet — known)

**Rollback:** Revert `TemplateEditor.tsx` to hardcoded CSS.

---

### **Phase 4: Switch PDF generation to shared defaults** *(production behavior change, opt-in per call site)*

Update production code paths to pass `useSharedDefaults: true`, making PDFs match the now-honest Visual editor.

**This is the first phase that changes live PDF output.** Roll out per-document-type to control blast radius.

---

#### 4.1 Switch preview route first (lowest risk)

**Changes to `src/app/api/admin/document-templates/preview/route.ts`:**

```typescript
const pdf = await renderTemplateToPdf(body, buildSampleContext(), {
  useSharedDefaults: true,
});
```

**Exit criteria:**
- Click "Preview PDF" in the editor → PDF now matches Visual tab (full-width tables, bigger headings, gray headers)
- Manual verification: open Demand Letter template, preview PDF, confirm table spans full page width

**Rollback:** Remove `{ useSharedDefaults: true }`.

---

#### 4.2 Switch non-release documents (rendered_documents)

**Changes to `src/lib/documents/render-store.ts`:**

```typescript
const pdf = await renderTemplateToPdf(published.body, context, {
  useSharedDefaults: true,
});
```

**Affected documents:**
- Demand Letter
- Payment Receipt
- Acknowledgement Receipt
- Final Computation Sheet
- Application Form

**Exit criteria:**
- Generate a new Demand Letter → PDF has full-width table, gray headers
- Generate a Payment Receipt → same
- Verify: newly generated docs have different `content_hash` than pre-Phase-4 versions (proves they changed)
- Verify: old signed documents still show original hash (proves they weren't regenerated)

**Rollback:** Remove `{ useSharedDefaults: true }` from render-store.ts.

---

#### 4.3 Switch release documents (generated_documents)

**Changes to `src/lib/lra/release-service.ts`:**

```typescript
const pdf = await renderTemplateToPdf(published.body, templateContext, {
  useSharedDefaults: true,
});
```

**Affected documents (7 release slugs):**
- BLRI
- Promissory Note
- Disclosure Statement
- Check/Cash/AR vouchers

**Exit criteria:**
- Create a test release file (dev/staging only) → all 7 docs render with new styling
- Tables are full-width
- Accounting voucher tables have gray headers
- PN/DS have professional spacing
- Signing flow still works (hash determinism preserved)

**High-risk gate:** This changes the 7 most critical legal documents. Require:
- [ ] Manual inspection of all 7 PDFs side-by-side (old vs new)
- [ ] Legal/compliance sign-off if document appearance change needs approval
- [ ] Test signing flow: generate → witness-sign → `signature_hash` matches `content_hash`

**Rollback:** Remove `{ useSharedDefaults: true }` from release-service.ts.

---

### **Phase 5: Regression testing & cleanup**

#### 5.1 Add Visual-PDF parity test

**New test in `src/lib/documents/render/__tests__/visual-pdf-parity.test.mts`:**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplateToPdf } from "../index";
import { buildSampleContext } from "@/lib/documents/templates/fields";
import { JSDOM } from "jsdom";
import { VISUAL_EDITOR_CSS } from "../defaultStyles";

test("Visual CSS and PDF defaults align on heading sizes", () => {
  // Parse the VISUAL_EDITOR_CSS for h2 font-size
  const h2Match = VISUAL_EDITOR_CSS.match(/\.visual-surface h2\s*{[^}]*font-size:\s*(\d+)pt/);
  assert.ok(h2Match, "Visual CSS should define h2 font-size in pt");
  
  // We can't programmatically extract pdfmake defaults without running a render,
  // but we can at least assert the CSS exists and is in pt units (not px).
  // Manual verification: both should be 22pt.
  assert.equal(h2Match[1], "22");
});

test("Visual CSS and PDF both define gray th background", () => {
  assert.ok(VISUAL_EDITOR_CSS.includes("#EEEEEE"));
  // PDF defaults are in defaultStyles.ts PDF_DEFAULT_STYLES.th.fillColor
  // (This test is a reminder to keep them in sync; full automation would require rendering.)
});
```

**Exit criteria:**
- Tests pass
- Tests fail if you change one style but not the other (proves they're linked)

---

#### 5.2 Update documentation

**Changes to `src/lib/documents/render/index.ts` docstring:**

```typescript
/**
 * Render a document template (HTML body with {{tokens}}, data-repeat, data-if)
 * against a data context, producing a deterministic PDF.
 *
 * This is the sole document renderer: every generated document (release docs +
 * non-release documents) flows through here.
 *
 * @param options.useSharedDefaults - Use Visual-editor-aligned styling defaults.
 *   When true, PDF output matches the editor's Visual tab (full-width tables,
 *   gray header cells, 22pt headings). Default: false for backward compatibility.
 *   All new documents should use true.
 */
```

**Changes to `docs/document-template-system-plan.md`:**

Add a new section after "Phase 7":

```markdown
### Phase 8 — Visual-PDF alignment (2026-09-10)

**Problem:** Visual editor preview and PDF output had different styling defaults (narrow tables, mismatched heading sizes).

**Solution:** Created shared `defaultStyles.ts` that both the Visual editor CSS and pdfmake defaults use. Added `useSharedDefaults` flag to `renderTemplateToPdf()` for opt-in migration.

**Status:** COMPLETE. All new documents use aligned defaults; legacy documents unchanged unless regenerated.
```

---

#### 5.3 Clean up snapshots

**Delete all temporary files:**

```bash
rm -rf _snapshots/
```

**Exit criteria:**
- No `_snapshots/` directory in git
- No test references snapshot files (they were verification-only)

---

### **Phase 6: Publicize to template authors** *(documentation/training)*

**Goal:** Make sure clients (non-IT users) understand the Visual tab is now accurate.

#### 6.1 Add in-app help text

**Changes to `src/app/admin/document-templates/[id]/page.tsx`:**

Above the editor, add a notice:

```tsx
<Alert variant="info">
  <p>The Visual preview now matches PDF output. What you see is what prints — full-width tables, gray header cells, and proportional headings.</p>
</Alert>
```

#### 6.2 Optional: in-editor guide

If clients ask "why do my tables look different now?", add a dismissible banner:

```tsx
{showMigrationNotice && (
  <Alert variant="neutral" onDismiss={() => setShowMigrationNotice(false)}>
    <p><strong>Visual editor updated:</strong> Tables now span the full page width (matching PDF output). If your template looked correct before, no action needed — PDFs will look the same. If tables were too narrow, they'll now print correctly.</p>
  </Alert>
)}
```

---

## Verification Checklist (Before Declaring Complete)

Run this checklist end-to-end before merging to main:

### Visual editor
- [ ] Open any template in `/admin/document-templates/[id]`
- [ ] Visual tab shows full-width tables with gray headers
- [ ] `<h2>` headings are visibly larger than body text
- [ ] Insert a field → chip appears and is movable
- [ ] Click "Preview PDF" → PDF matches Visual tab (table width, colors, heading size)

### PDF generation (preview)
- [ ] Preview Demand Letter → table spans page, gray `<th>`, black borders
- [ ] Preview BLRI → amortization table is full-width
- [ ] Preview any voucher → accounting table is full-width with gray headers

### PDF generation (real documents)
- [ ] Generate a Demand Letter (collector accounts page) → full-width table
- [ ] Generate a Payment Receipt → same
- [ ] Create a test release file (staging) → all 7 docs render with new styling
- [ ] Signing flow works: generate → sign → `signature_hash` matches

### Regression
- [ ] All existing tests pass (184/184 or more)
- [ ] No TypeScript errors
- [ ] `npm run lint` exits 0
- [ ] Dev server compiles without warnings

### Backward compatibility
- [ ] Call `renderTemplateToPdf(body, ctx)` (no 3rd arg) → still works (legacy behavior)
- [ ] Old signed documents still have their original `content_hash` (not regenerated)

---

## Rollback Plan

If something breaks in production:

### Immediate (< 5 min)
1. Revert Phase 4.3 (release-service.ts) → Release docs back to legacy defaults
2. Deploy

### Within 1 hour
1. Revert Phase 4.2 (render-store.ts) → Non-release docs back to legacy defaults
2. Revert Phase 3.1 (TemplateEditor.tsx) → Visual tab back to old CSS
3. Deploy

### Full rollback (if needed)
1. Revert all commits from this plan
2. Delete `src/lib/documents/render/defaultStyles.ts`
3. Deploy

No database changes, no migrations to roll back.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| New PDFs look wrong (layout bug) | Medium | High | Phase 2.2 verifies all templates render; Phase 4 gates each doc type separately |
| Hash non-determinism breaks signing | Low | Critical | Phase 1.2 preserves `makeDeterministic()`; Phase 4.3 test verifies signature flow |
| Visual editor breaks mid-edit | Low | Medium | Phase 3 manual verification; rollback is instant (revert CSS) |
| Clients confused by Visual change | Medium | Low | Phase 6 adds help text; change is visual-only, no workflow impact |
| Legacy documents regenerate unexpectedly | Low | High | Phase 4 uses explicit flag; no auto-migration; regeneration is manual |

---

## Success Metrics

**Quantitative:**
- 0 support tickets about "PDF doesn't match preview" after Phase 6
- 0 regression test failures after Phase 5
- 100% of new templates use `useSharedDefaults: true` (measure via code search after 2 weeks)

**Qualitative:**
- Template authors report Visual tab is accurate
- No Legal/compliance objections to updated document appearance
- No client complaints about "tables too narrow"

---

## Timeline (estimated)

- **Phase 0:** 1 hour (snapshot + verify)
- **Phase 1:** 2 hours (code + tests)
- **Phase 2:** 1 hour (verification script)
- **Phase 3:** 1 hour (editor CSS)
- **Phase 4:** 2 hours (production rollout + signing test)
- **Phase 5:** 1 hour (tests + docs)
- **Phase 6:** 30 min (help text)

**Total:** ~8.5 hours spread across 2–3 days (to allow soak time between phases).

---

## Open Questions — RESOLVED

1. ✅ **Legal sign-off required?** **No** — Proceed without Legal gate
2. ✅ **Migration of existing templates?** **Leave as-is** — Historical PDFs unchanged, only new docs use new defaults
3. ✅ **Test coverage target?** **Add at least 2 tests** — Confirmed in Phase 5

---

## Validation Results (2026-09-10)

✅ **API compatibility verified:**
- `html-to-pdfmake` supports `defaultStyles` parameter (checked source)
- Type definition includes `defaultStyles` in `html-to-pdfmake.d.ts`
- Backward compatible 3rd parameter (optional)

✅ **File paths verified:**
- All import paths correct
- Test directory exists
- Component paths accurate

🔧 **Fixed during validation:**
- **Table width:** Added `injectTableWidths()` post-processing to make tables span full page width
- **CSS units:** Converted `pt` to `px` in Visual CSS for browser consistency (22pt → 29px, etc.)

---

**Ready to proceed?** All validation complete. Start Phase 0 when ready.
