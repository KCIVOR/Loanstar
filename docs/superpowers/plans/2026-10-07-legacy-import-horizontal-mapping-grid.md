# Legacy Import Horizontal Mapping Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present uploaded file columns and their mapping controls as a horizontally scrollable spreadsheet-style grid.

**Architecture:** Keep mapping state, suggestions, duplicate detection, and validation unchanged. Replace only the Step 2 vertical row table with a semantic table whose source columns run left-to-right, using three labelled rows for source headers, sample values, and mapping dropdowns.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, existing LoanStar UI primitives, Node test runner.

---

### Task 1: Cover the spreadsheet mapping layout

**Files:**
- Modify: `src/lib/legacy-import/__tests__/template-files.test.mts`
- Modify: `src/app/admin/legacy-import/page.tsx:618-659`

- [x] **Step 1: Write the failing source-level UI test**

Add a test that reads `src/app/admin/legacy-import/page.tsx` and asserts the Map step contains `Source column`, `Sample values`, `Maps to`, the sheet layout class, and an accessible mapping label derived from the file header.

```ts
test("renders column mapping as a horizontal spreadsheet grid", async () => {
  const page = await readFile(path.join(process.cwd(), "src", "app", "admin", "legacy-import", "page.tsx"), "utf8");
  assert.match(page, />Source column</);
  assert.match(page, />Sample values</);
  assert.match(page, />Maps to</);
  assert.match(page, /is-mapping-sheet/);
  assert.match(page, /aria-label=\{`Map \$\{m\.header/);
});
```

- [x] **Step 2: Run the test to confirm it fails**

Run: `node --import tsx --test src/lib/legacy-import/__tests__/template-files.test.mts`

Expected: FAIL because the page has the old `File header` and vertical mapping table.

- [x] **Step 3: Replace the vertical mapping rows with a horizontal grid**

Replace the current `#`, `File header`, `Sample values`, and `Maps to` table columns with a scrollable table containing one first-column row label and one data cell per `mapping` entry. Keep each dropdown's value, change handler, options, and duplicate class unchanged. Use a fixed minimum width per source column and add an `aria-label` to each mapping dropdown.

```tsx
<div className="max-h-[60vh] overflow-auto">
  <Table className="is-mapping-sheet">
    <tbody>
      <tr><Th scope="row">Source column</Th>{/* one cell per source column */}</tr>
      <tr><Th scope="row">Sample values</Th>{/* one cell per source column */}</tr>
      <tr><Th scope="row">Maps to</Th>{/* one Select per source column */}</tr>
    </tbody>
  </Table>
</div>
```

- [x] **Step 4: Run the test to confirm it passes**

Run: `node --import tsx --test src/lib/legacy-import/__tests__/template-files.test.mts`

Expected: PASS.

- [x] **Step 5: Run focused regression tests and lint**

Run:

```powershell
node --import tsx --test "src/lib/legacy-import/__tests__/*.mts"
npx eslint src/app/admin/legacy-import/page.tsx src/lib/legacy-import/__tests__/template-files.test.mts
```

Expected: all legacy-import tests pass. The changed test passes lint; the page retains one pre-existing `react-hooks/set-state-in-effect` lint error at its preset-loading effect (line 170), unrelated to this grid.

- [ ] **Step 6: Commit if Git write access is available**

```powershell
git add src/app/admin/legacy-import/page.tsx src/lib/legacy-import/__tests__/template-files.test.mts docs/superpowers/plans/2026-10-07-legacy-import-horizontal-mapping-grid.md
git commit -m "feat: show legacy mappings as spreadsheet grid"
```
