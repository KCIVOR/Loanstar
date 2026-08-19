import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectorCollections,
  pickCollectionMetrics,
  type CollectorCollectionInput,
} from "../collections-register";
import type { MetricValue } from "../metrics/types";

function metric(id: string, value: number): MetricValue {
  return { id, value, prior: null, deltaAbs: null, deltaPct: null };
}

const base: CollectorCollectionInput = {
  assignments: [
    { masterlistId: "m1", collectorUserId: "c1" },
    { masterlistId: "m2", collectorUserId: "c2" },
  ],
  postings: [
    { masterlistId: "m1", amount: 100 },
    { masterlistId: "m2", amount: 50 },
  ],
  dcrs: [
    { collectorUserId: "c1", status: "reconciled" },
    { collectorUserId: "c1", status: "rejected" },
    { collectorUserId: "c1", status: "draft" },
    { collectorUserId: "c2", status: "submitted" },
  ],
  masterlistSegments: [
    { id: "m1", segment: "seafarer" },
    { id: "m2", segment: "sme" },
  ],
  names: new Map([
    ["c1", "Ana"],
    ["c2", "Ben"],
  ]),
  segment: "all",
};

test("skips draft DCRs and computes rejection rate from non-draft submitted", () => {
  const rows = buildCollectorCollections(base);
  const ana = rows.find((r) => r.collectorUserId === "c1");
  assert.equal(ana?.name, "Ana");
  assert.equal(ana?.amountCollected, 100);
  assert.equal(ana?.dcrsSubmitted, 2);
  assert.equal(ana?.dcrsReconciled, 1);
  assert.equal(ana?.dcrsRejected, 1);
  assert.equal(ana?.rejectionRatePct, 50);
});

test("segment=sme restricts posting amounts to that segment", () => {
  const rows = buildCollectorCollections({ ...base, segment: "sme" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.collectorUserId, "c2");
  assert.equal(rows[0]?.amountCollected, 50);
});

test("segment=individual restricts posting amounts to that segment", () => {
  const rows = buildCollectorCollections({
    ...base,
    masterlistSegments: [
      { id: "m1", segment: "individual" },
      { id: "m2", segment: "sme" },
    ],
    segment: "individual",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.collectorUserId, "c1");
  assert.equal(rows[0]?.amountCollected, 100);
});

test("sorts collectors by amount collected desc", () => {
  const rows = buildCollectorCollections(base);
  assert.deepEqual(
    rows.map((r) => r.collectorUserId),
    ["c1", "c2"],
  );
});

test("pickCollectionMetrics keeps only the three money KPIs", () => {
  const picked = pickCollectionMetrics([
    metric("money.collected", 10),
    metric("money.receivable", 99),
    metric("money.collectionEfficiency", 80),
    metric("money.penaltyIncome", 2),
  ]);
  assert.deepEqual(
    picked.map((m) => m.id),
    ["money.collected", "money.collectionEfficiency", "money.penaltyIncome"],
  );
});
