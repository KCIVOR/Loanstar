import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { budgetFor, DEFAULT_SKILL_BUDGET, fitToBudget, measure } from "../skills/budget";

type Row = { id: string; note: string };

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    note: "x".repeat(40),
  }));
}

const build = (visible: Row[], omitted: number) => ({
  summary: { total: 100 },
  omitted,
  rows: visible,
});

describe("fitToBudget", () => {
  it("returns everything when it already fits", () => {
    const result = fitToBudget(rows(3), 10_000, build);
    assert.equal(result.rows.length, 3);
    assert.equal(result.omitted, 0);
  });

  it("never exceeds the budget once trimmed", () => {
    const result = fitToBudget(rows(200), 1_000, build);
    assert.ok(measure(result) <= 1_000, `measured ${measure(result)}`);
  });

  it("always produces parseable JSON, unlike a raw string slice", () => {
    const result = fitToBudget(rows(200), 1_000, build);
    const serialized = JSON.stringify(result);
    assert.doesNotThrow(() => JSON.parse(serialized));
    assert.deepEqual(JSON.parse(serialized), result);
  });

  it("reports exactly how many rows it dropped", () => {
    const result = fitToBudget(rows(200), 1_000, build);
    assert.equal(result.rows.length + result.omitted, 200);
    assert.ok(result.omitted > 0);
  });

  it("keeps the largest prefix that fits, not an arbitrary one", () => {
    const all = rows(200);
    const result = fitToBudget(all, 1_000, build);
    const oneMore = build(all.slice(0, result.rows.length + 1), 0);
    assert.ok(measure(oneMore) > 1_000, "should not have been able to fit another row");
  });

  it("preserves order from the head of the list", () => {
    const result = fitToBudget(rows(200), 1_000, build);
    assert.equal(result.rows[0]!.id, "row-0");
    assert.equal(result.rows[1]!.id, "row-1");
  });

  it("still returns a valid document when even zero rows overflow", () => {
    const result = fitToBudget(rows(10), 5, build);
    assert.equal(result.rows.length, 0);
    assert.equal(result.omitted, 10);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  });

  it("handles an empty input", () => {
    const result = fitToBudget([], 1_000, build);
    assert.deepEqual(result.rows, []);
    assert.equal(result.omitted, 0);
  });
});

describe("budgetFor", () => {
  it("gives the catalog more room than a default skill", () => {
    assert.ok(budgetFor("get_catalog") > DEFAULT_SKILL_BUDGET);
  });

  it("falls back to the default for anything unlisted", () => {
    assert.equal(budgetFor("list_accounts"), DEFAULT_SKILL_BUDGET);
    assert.equal(budgetFor("not_a_skill"), DEFAULT_SKILL_BUDGET);
  });
});
