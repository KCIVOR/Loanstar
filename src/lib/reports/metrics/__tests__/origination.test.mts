import test from "node:test";
import assert from "node:assert/strict";

import { buildFunnel, type ApplicationRow } from "../origination";

function app(id: string, status: string, history: string[]): ApplicationRow {
  return {
    id,
    application_no: `APP-${id}`,
    status,
    status_history: history.map((s, i) => ({ status: s, at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` })),
    segment: "seafarer",
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("buildFunnel counts leads as the top stage, unrelated to applications", () => {
  const funnel = buildFunnel([], 42);
  assert.equal(funnel[0].stage, "leads");
  assert.equal(funnel[0].count, 42);
  assert.equal(funnel[0].dropoffPct, null);
});

test("buildFunnel is cumulative — an app that reached loan_active counts at every earlier stage", () => {
  const apps = [app("1", "loan_active", ["draft", "submitted", "for_approval", "approved", "lra_pending", "released", "loan_active"])];
  const funnel = buildFunnel(apps, 1);

  const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));
  assert.equal(byStage.draft, 1);
  assert.equal(byStage.submitted, 1);
  assert.equal(byStage.for_approval, 1);
  assert.equal(byStage.approved, 1);
  assert.equal(byStage.released, 1);
  assert.equal(byStage.loan_active, 1);
});

test("buildFunnel: a denied application stops contributing beyond the stage it reached", () => {
  const apps = [
    app("1", "denied", ["draft", "submitted", "for_verification", "for_approval", "denied"]),
  ];
  const funnel = buildFunnel(apps, 1);
  const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

  assert.equal(byStage.draft, 1);
  assert.equal(byStage.submitted, 1);
  assert.equal(byStage.for_verification, 1);
  assert.equal(byStage.for_approval, 1);
  // "denied" isn't a funnel stage, so this application never reaches "approved" or beyond.
  assert.equal(byStage.approved, 0);
  assert.equal(byStage.lra_pending, 0);
  assert.equal(byStage.released, 0);
  assert.equal(byStage.loan_active, 0);
});

test("buildFunnel falls back to current status when status_history is empty", () => {
  const apps = [app("1", "for_approval", [])];
  const funnel = buildFunnel(apps, 1);
  const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));
  // Cumulative fill-down still applies even from a bare current-status fallback.
  assert.equal(byStage.draft, 1);
  assert.equal(byStage.submitted, 1);
  assert.equal(byStage.for_approval, 1);
  assert.equal(byStage.approved, 0);
});

test("buildFunnel computes drop-off % from the immediately prior stage", () => {
  const apps = [
    app("1", "loan_active", ["draft", "submitted", "loan_active"]),
    app("2", "loan_active", ["draft", "submitted", "loan_active"]),
    app("3", "draft", ["draft"]),
    app("4", "draft", ["draft"]),
  ];
  const funnel = buildFunnel(apps, 10);
  const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f]));

  assert.equal(byStage.draft.count, 4);
  assert.equal(byStage.draft.dropoffPct, 60); // (10 leads - 4 draft) / 10 * 100
  assert.equal(byStage.submitted.count, 2);
  assert.equal(byStage.submitted.dropoffPct, 50); // (4 - 2) / 4 * 100
});

test("buildFunnel never divides by zero when a stage has no reach", () => {
  const funnel = buildFunnel([], 0);
  for (const row of funnel) {
    assert.notEqual(row.dropoffPct, Infinity);
    assert.notEqual(Number.isNaN(row.dropoffPct), true);
  }
});
