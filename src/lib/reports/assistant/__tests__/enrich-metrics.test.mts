import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MetricValue } from "@/lib/reports/metrics/types";

import { enrichMetrics, SIGNIFICANT_METRICS } from "../skills/shared";

function value(
  id: string,
  overrides: Partial<MetricValue> = {},
): MetricValue {
  return { id, value: 0, prior: 0, deltaAbs: 0, deltaPct: 0, ...overrides };
}

describe("enrichMetrics", () => {
  it("attaches the label, unit and direction the model needs to talk about a figure", () => {
    const [collected] = enrichMetrics([value("money.collected", { value: 3_827_214 })]);
    assert.equal(collected?.label, "Collected");
    assert.equal(collected?.unit, "php");
    assert.equal(collected?.direction, "up_good");
  });

  it("does not ship formulas", () => {
    // Dead weight across 25 metrics, and the prompt forbids talking in
    // formulas anyway. get_catalog exists for the rare derivation question.
    const enriched = enrichMetrics([value("money.collected")]);
    assert.equal("formula" in (enriched[0] ?? {}), false);
  });

  it("flags only the handful that actually moved", () => {
    const metrics = [
      value("money.collected", { deltaPct: 468 }),
      value("money.outstanding", { deltaPct: 0.2 }),
      value("risk.par30", { deltaPct: 12 }),
      value("risk.par90", { deltaPct: null, prior: null }),
    ];
    const enriched = enrichMetrics(metrics);
    const flagged = enriched.filter((m) => m.significant).map((m) => m.id);

    assert.deepEqual(flagged.sort(), ["money.collected", "risk.par30"]);
    assert.ok(flagged.length <= SIGNIFICANT_METRICS);
  });

  it("explains collection efficiency above 100% instead of letting it read as a win", () => {
    const [efficiency] = enrichMetrics([
      value("money.collectionEfficiency", { value: 233 }),
    ]);
    assert.match(String(efficiency?.note), /ahead of schedule/);
  });

  it("explains a negative average days to collect", () => {
    const [avgDays] = enrichMetrics([value("money.avgDaysToCollect", { value: -98 })]);
    assert.match(String(avgDays?.note), /before the due date/);
  });

  it("leaves ordinary values unannotated", () => {
    const enriched = enrichMetrics([
      value("money.collectionEfficiency", { value: 94 }),
      value("money.avgDaysToCollect", { value: 3 }),
    ]);
    for (const metric of enriched) assert.equal("note" in metric, false);
  });

  it("keeps the caller's ordering so nothing downstream reshuffles", () => {
    const ids = ["risk.par30", "money.collected", "money.outstanding"];
    const enriched = enrichMetrics(ids.map((id) => value(id, { deltaPct: 50 })));
    assert.deepEqual(
      enriched.map((m) => m.id),
      ids,
    );
  });
});
