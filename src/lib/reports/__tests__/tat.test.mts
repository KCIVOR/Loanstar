import test from "node:test";
import assert from "node:assert/strict";

import { computeTatFromHistories } from "../aggregates";

test("TAT computes average days between status transitions", () => {
  const histories = [
    [
      { status: "submitted", at: "2026-01-01T00:00:00Z" },
      { status: "for_verification", at: "2026-01-04T00:00:00Z" },
      { status: "for_approval", at: "2026-01-10T00:00:00Z" },
      { status: "approved", at: "2026-01-12T00:00:00Z" },
    ],
  ];

  const tat = computeTatFromHistories(histories);
  const intake = tat.find((t) => t.from === "submitted");
  assert.ok(intake);
  assert.equal(intake!.averageDays, 3);
  assert.equal(intake!.sampleCount, 1);
});
