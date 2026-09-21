import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260922100000_payments_remedial_review_update.sql",
    import.meta.url,
  ),
  "utf8",
);

test("remedial branch is assignment-scoped and permission-gated", () => {
  assert.match(sql, /has_module_permission\('remedial', 'edit'\)/);
  assert.match(sql, /a\.remedial_user_id = auth\.uid\(\)/);
  assert.match(sql, /a\.masterlist_id = payments\.masterlist_id/);
});

test("existing branches are preserved", () => {
  assert.match(sql, /is_super_admin\(\)/);
  assert.match(sql, /has_module_permission\('collection', 'edit'\)/);
  assert.match(sql, /has_module_permission\('accounting_ar', 'edit'\)/);
});

test("only the payments update policy is touched", () => {
  assert.equal((sql.match(/CREATE POLICY/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /CREATE (TABLE|FUNCTION|INDEX|TRIGGER)/i);
});
