import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { templateFileName, templateSegments } from "../template-files";

test("ships a downloadable Excel template for every account segment", async () => {
  for (const segment of templateSegments) {
    const file = path.join(process.cwd(), "public", "legacy-import-templates", templateFileName(segment));
    assert.ok((await stat(file)).size > 0, `${segment} template should exist`);
  }
});

test("template links clear a stale download error before navigating", async () => {
  const page = await readFile(path.join(process.cwd(), "src", "app", "admin", "legacy-import", "page.tsx"), "utf8");
  assert.equal((page.match(/onClick=\{\(\) => setError\(null\)\}/g) ?? []).length, 3);
});

test("renders column mapping as a horizontal spreadsheet grid", async () => {
  const page = await readFile(path.join(process.cwd(), "src", "app", "admin", "legacy-import", "page.tsx"), "utf8");

  assert.match(page, />Source column</);
  assert.match(page, />Sample values</);
  assert.match(page, />Maps to</);
  assert.match(page, /is-mapping-sheet/);
  assert.match(page, /aria-label=\{`Map \$\{m\.header/);
});
