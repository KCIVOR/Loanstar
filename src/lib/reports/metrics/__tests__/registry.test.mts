import test from "node:test";
import assert from "node:assert/strict";

import { METRICS, getMetric, metricsByTheme } from "../registry";

test("every metric id is unique", () => {
  const ids = METRICS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every metric id is dot-namespaced by its theme", () => {
  for (const m of METRICS) {
    assert.ok(m.id.startsWith(`${m.theme}.`), `${m.id} should start with "${m.theme}."`);
  }
});

test("every metric has a non-empty label, description, and formula", () => {
  for (const m of METRICS) {
    assert.ok(m.label.trim().length > 0, `${m.id} missing label`);
    assert.ok(m.description.trim().length > 0, `${m.id} missing description`);
    assert.ok(m.formula.trim().length > 0, `${m.id} missing formula`);
  }
});

test("descriptions are written for a reader who has never seen the schema", () => {
  // Descriptions are the AI-facing prose layer — formula is where schema
  // names belong. A raw table/column name leaking into description is a
  // sign the text was written for a developer, not a narrator.
  const schemaNamePattern = /\b(masterlist|dcr_items?|amortization_schedules?|remedial_turnovers|committee_actions|denial_notices|loan_applications|status_history)\b/i;
  for (const m of METRICS) {
    assert.doesNotMatch(m.description, schemaNamePattern, `${m.id} description leaks a schema name`);
  }
});

test("getMetric finds a known id and returns undefined for an unknown one", () => {
  assert.equal(getMetric("money.collected")?.id, "money.collected");
  assert.equal(getMetric("nonexistent.metric"), undefined);
});

test("metricsByTheme partitions the catalog correctly", () => {
  for (const theme of ["money", "risk", "origination", "staff"] as const) {
    const inTheme = metricsByTheme(theme);
    assert.ok(inTheme.every((m) => m.theme === theme));
  }
  const total = (["money", "risk", "origination", "staff"] as const).reduce(
    (sum, theme) => sum + metricsByTheme(theme).length,
    0,
  );
  assert.equal(total, METRICS.length);
});
