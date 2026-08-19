import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StuckFile } from "../../metrics/origination";
import { groupStuckFiles } from "../index";
import { ageInDays, rankBottlenecks, summarizeQueue, type RawBottleneck } from "../rank";

const NOW = new Date("2026-08-19T00:00:00.000Z");

function queue(partial: Partial<RawBottleneck> = {}): RawBottleneck {
  return {
    id: "bottleneck.test",
    stage: "Test queue",
    owner: "Ops",
    count: 1,
    oldestDays: 1,
    targetDays: 5,
    ...partial,
  };
}

describe("ageInDays", () => {
  it("counts whole days elapsed", () => {
    assert.equal(ageInDays("2026-08-09T00:00:00.000Z", NOW), 10);
  });

  it("returns 0 for missing, unparseable or future timestamps", () => {
    assert.equal(ageInDays(null, NOW), 0);
    assert.equal(ageInDays("nonsense", NOW), 0);
    assert.equal(ageInDays("2026-09-01T00:00:00.000Z", NOW), 0);
  });
});

describe("summarizeQueue", () => {
  it("reports the count and the age of the oldest item", () => {
    const result = summarizeQueue(
      ["2026-08-18T00:00:00.000Z", "2026-08-01T00:00:00.000Z", "2026-08-15T00:00:00.000Z"],
      NOW,
    );
    assert.equal(result.count, 3);
    assert.equal(result.oldestDays, 18);
  });

  it("is empty for an empty queue", () => {
    assert.deepEqual(summarizeQueue([], NOW), { count: 0, oldestDays: 0 });
  });
});

describe("rankBottlenecks", () => {
  it("drops queues with nothing waiting", () => {
    const report = rankBottlenecks([queue({ count: 0 }), queue({ id: "keep", count: 2 })]);
    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0]!.id, "keep");
  });

  it("marks a queue breached only once it passes its own target", () => {
    const report = rankBottlenecks([
      queue({ id: "within", oldestDays: 5, targetDays: 5 }),
      queue({ id: "over", oldestDays: 6, targetDays: 5 }),
    ]);
    const within = report.entries.find((e) => e.id === "within")!;
    const over = report.entries.find((e) => e.id === "over")!;
    assert.equal(within.breached, false);
    assert.equal(within.daysOverTarget, 0);
    assert.equal(over.breached, true);
    assert.equal(over.daysOverTarget, 1);
  });

  it("ranks by days past target, not by raw age", () => {
    const report = rankBottlenecks([
      queue({ id: "old-but-allowed", oldestDays: 20, targetDays: 30 }),
      queue({ id: "young-but-late", oldestDays: 4, targetDays: 2 }),
    ]);
    assert.equal(report.entries[0]!.id, "young-but-late");
    assert.equal(report.worst?.id, "young-but-late");
  });

  it("ranks by raw age past target, not by volume", () => {
    const report = rankBottlenecks([
      queue({ id: "busy", count: 50, oldestDays: 6, targetDays: 5 }),
      queue({ id: "stalled", count: 1, oldestDays: 40, targetDays: 5 }),
    ]);
    assert.equal(report.entries[0]!.id, "stalled");
  });

  it("falls back to volume when nothing is breached", () => {
    const report = rankBottlenecks([
      queue({ id: "small", count: 1, oldestDays: 1 }),
      queue({ id: "large", count: 9, oldestDays: 1 }),
    ]);
    assert.equal(report.entries[0]!.id, "large");
    assert.equal(report.breachedStages, 0);
  });

  it("totals everything waiting across queues", () => {
    const report = rankBottlenecks([queue({ count: 3 }), queue({ id: "b", count: 4 })]);
    assert.equal(report.totalWaiting, 7);
  });

  it("has no worst queue when everything is clear", () => {
    const report = rankBottlenecks([queue({ count: 0 })]);
    assert.equal(report.worst, null);
    assert.equal(report.totalWaiting, 0);
  });
});

describe("groupStuckFiles", () => {
  function stuck(partial: Partial<StuckFile> = {}): StuckFile {
    return {
      applicationId: "app-1",
      applicationNo: "APP-1",
      borrowerName: "Someone",
      status: "for_approval",
      daysInStatus: 6,
      targetDays: 3,
      segment: null,
      collateralType: "none",
      ...partial,
    };
  }

  it("rolls files up per status with the oldest age", () => {
    const grouped = groupStuckFiles([
      stuck({ daysInStatus: 6 }),
      stuck({ applicationId: "app-2", daysInStatus: 12 }),
      stuck({ applicationId: "app-3", status: "lra_pending", daysInStatus: 8, targetDays: 5 }),
    ]);

    const committee = grouped.find((g) => g.id === "bottleneck.stage.for_approval")!;
    assert.equal(committee.count, 2);
    assert.equal(committee.oldestDays, 12);
    assert.equal(committee.targetDays, 3);
    assert.equal(committee.stage, "Stuck at For Approval");
    assert.equal(committee.owner, "Origination");

    assert.equal(grouped.length, 2);
  });

  it("returns nothing when no file is stuck", () => {
    assert.deepEqual(groupStuckFiles([]), []);
  });
});
