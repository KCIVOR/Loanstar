import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SOURCE_FAITHFUL_DISCLOSURE_PREVIEW } from "../disclosure-preview";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..", "..");
const migrationPath = join(root, "supabase", "migrations", "20260924100000_promote_sf_disclosure_schema_safe.sql");

function extractBody(sql: string): string {
  const match = sql.match(/\$disclosure\$([\s\S]*?)\$disclosure\$/);
  assert.ok(match, "migration must include a dollar-quoted Disclosure body");
  return match[1].trim();
}

test("Disclosure promotion migration publishes the exact reviewed source-faithful body", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.equal(extractBody(sql), SOURCE_FAITHFUL_DISCLOSURE_PREVIEW.trim());
  assert.match(sql, /data-document-footer="none"/);
  assert.match(sql, /data-underline/);
  assert.doesNotMatch(extractBody(sql), /<style/i);
});

test("Disclosure promotion archives the old published version and is safe to rerun", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /UPDATE public\.document_template_versions v SET status = 'archived'/);
  assert.match(sql, /t\.slug = 'disclosure_statement'/);
  assert.match(sql, /v\.status = 'published'/);
  assert.match(sql, /v\.body IS DISTINCT FROM b\.body/);
  assert.match(sql, /INSERT INTO public\.document_template_versions/);
  assert.match(sql, /AND NOT EXISTS \(/);
  assert.match(sql, /v\.body = b\.body/);
});
