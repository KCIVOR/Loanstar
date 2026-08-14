import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BRIEFING_LIST_PAGE_SIZES,
  BRIEFING_WAITING_BUCKETS,
  briefingSearchPredicate,
  clampBriefingListPageSize,
  computeBriefingListKpis,
  daysWaiting,
  passesWaitingBucket,
  sortBriefingsByUpdatedAt,
  waitingBucketFilterSpec,
  waitingBucketForDays,
  type BriefingQueueItem,
  type BriefingWaitingBucket,
} from "../briefings";

function item(
  overrides: Partial<BriefingQueueItem> &
    Pick<BriefingQueueItem, "releaseFileId" | "updatedAt">,
): BriefingQueueItem {
  return {
    releaseFileId: overrides.releaseFileId,
    releasePaths: overrides.releasePaths ?? [],
    updatedAt: overrides.updatedAt,
    application:
      overrides.application === undefined
        ? {
            id: "app-1",
            applicationNo: "APP-100",
            status: "release_briefing",
          }
        : overrides.application,
    borrower:
      overrides.borrower === undefined
        ? {
            borrowerNo: "BRW-001",
            firstName: "Rovick",
            lastName: "Romasanta",
          }
        : overrides.borrower,
    briefing:
      overrides.briefing === undefined
        ? {
            acknowledgedAt: null,
            checklist: null,
          }
        : overrides.briefing,
  };
}

describe("briefingSearchPredicate", () => {
  const base = item({
    releaseFileId: "rf-uuid-111",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });

  it("empty / whitespace term matches all", () => {
    assert.equal(briefingSearchPredicate(base, ""), true);
    assert.equal(briefingSearchPredicate(base, "   "), true);
  });

  it("matches first and last name case-insensitively", () => {
    assert.equal(briefingSearchPredicate(base, "rovick"), true);
    assert.equal(briefingSearchPredicate(base, "ROMASANTA"), true);
    assert.equal(briefingSearchPredicate(base, "rovick romasanta"), true);
  });

  it("matches applicationNo case-insensitively", () => {
    assert.equal(briefingSearchPredicate(base, "app-100"), true);
    assert.equal(briefingSearchPredicate(base, "APP-100"), true);
  });

  it("matches borrowerNo case-insensitively", () => {
    assert.equal(briefingSearchPredicate(base, "brw-001"), true);
    assert.equal(briefingSearchPredicate(base, "BRW-001"), true);
  });

  it("matches releaseFileId case-insensitively", () => {
    assert.equal(briefingSearchPredicate(base, "rf-uuid-111"), true);
    assert.equal(briefingSearchPredicate(base, "RF-UUID-111"), true);
  });

  it("rejects non-matches", () => {
    assert.equal(briefingSearchPredicate(base, "zzz"), false);
    assert.equal(briefingSearchPredicate(base, "APP-999"), false);
  });

  it("null borrower still matches applicationNo and releaseFileId", () => {
    const noBorrower = item({
      releaseFileId: "rf-uuid-222",
      updatedAt: "2026-08-01T00:00:00.000Z",
      borrower: null,
      application: {
        id: "app-2",
        applicationNo: "APP-200",
        status: "release_briefing",
      },
    });
    assert.equal(briefingSearchPredicate(noBorrower, "APP-200"), true);
    assert.equal(briefingSearchPredicate(noBorrower, "rf-uuid-222"), true);
    assert.equal(briefingSearchPredicate(noBorrower, "rovick"), false);
  });
});

describe("sortBriefingsByUpdatedAt", () => {
  const early = item({
    releaseFileId: "rf-early",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const mid = item({
    releaseFileId: "rf-mid",
    updatedAt: "2026-08-02T10:00:00.000Z",
  });
  const late = item({
    releaseFileId: "rf-late",
    updatedAt: "2026-08-03T10:00:00.000Z",
  });

  it("sorts ascending by updatedAt", () => {
    const sorted = sortBriefingsByUpdatedAt([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.releaseFileId),
      ["rf-early", "rf-mid", "rf-late"],
    );
  });

  it("sorts descending by updatedAt", () => {
    const sorted = sortBriefingsByUpdatedAt([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.releaseFileId),
      ["rf-late", "rf-mid", "rf-early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortBriefingsByUpdatedAt(rows, "asc");
    assert.deepEqual(rows, copy);
  });

  it("preserves relative order for equal updatedAt", () => {
    const a = item({
      releaseFileId: "first",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });
    const b = item({
      releaseFileId: "second",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });
    const sorted = sortBriefingsByUpdatedAt([a, b], "asc");
    assert.deepEqual(
      sorted.map((r) => r.releaseFileId),
      ["first", "second"],
    );
  });
});

describe("clampBriefingListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of BRIEFING_LIST_PAGE_SIZES) {
      assert.equal(clampBriefingListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampBriefingListPageSize(0), 10);
    assert.equal(clampBriefingListPageSize(15), 10);
    assert.equal(clampBriefingListPageSize(NaN), 10);
    assert.equal(clampBriefingListPageSize(25), 10);
    assert.equal(clampBriefingListPageSize(-1), 10);
  });
});

describe("daysWaiting", () => {
  it("same calendar-day window → 0", () => {
    assert.equal(
      daysWaiting(
        "2026-08-12T08:00:00.000Z",
        new Date("2026-08-12T20:00:00.000Z"),
      ),
      0,
    );
  });

  it("next day → 1", () => {
    assert.equal(
      daysWaiting(
        "2026-08-11T12:00:00.000Z",
        new Date("2026-08-12T12:00:00.000Z"),
      ),
      1,
    );
  });

  it("invalid / missing → null", () => {
    assert.equal(daysWaiting(null), null);
    assert.equal(daysWaiting(undefined), null);
    assert.equal(daysWaiting(""), null);
    assert.equal(daysWaiting("not-a-date"), null);
  });
});

describe("waitingBucketFilterSpec", () => {
  it("maps waiting chips, else all", () => {
    assert.equal(waitingBucketFilterSpec("all"), "all");
    assert.equal(waitingBucketFilterSpec(""), "all");
    assert.equal(waitingBucketFilterSpec("1-3"), "1-3");
    assert.equal(waitingBucketFilterSpec("4-7"), "4-7");
    assert.equal(waitingBucketFilterSpec("8+"), "8+");
  });

  it("maps every Waiting chip id the page exposes", () => {
    const pageWaitingChips = ["all", "1-3", "4-7", "8+"] as const;
    assert.deepEqual([...BRIEFING_WAITING_BUCKETS], [...pageWaitingChips]);
    for (const id of pageWaitingChips) {
      assert.equal(waitingBucketFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown values", () => {
    assert.equal(waitingBucketFilterSpec("unknown"), "all");
    assert.equal(waitingBucketFilterSpec("0"), "all");
    assert.equal(waitingBucketFilterSpec("8"), "all");
  });
});

describe("waitingBucketForDays", () => {
  it("maps day ranges; day 0 → null", () => {
    assert.equal(waitingBucketForDays(0), null);
    assert.equal(waitingBucketForDays(1), "1-3");
    assert.equal(waitingBucketForDays(3), "1-3");
    assert.equal(waitingBucketForDays(4), "4-7");
    assert.equal(waitingBucketForDays(7), "4-7");
    assert.equal(waitingBucketForDays(8), "8+");
    assert.equal(waitingBucketForDays(30), "8+");
  });
});

describe("passesWaitingBucket ↔ waitingBucketFilterSpec", () => {
  const chips: Exclude<BriefingWaitingBucket, "all">[] = ["1-3", "4-7", "8+"];

  it("lets every day through when spec is all", () => {
    for (const days of [0, 1, 3, 4, 7, 8, 20, null]) {
      assert.equal(
        passesWaitingBucket(days, waitingBucketFilterSpec("all")),
        true,
        String(days),
      );
    }
  });

  it("day 0 and null only pass all", () => {
    for (const chip of chips) {
      assert.equal(passesWaitingBucket(0, waitingBucketFilterSpec(chip)), false);
      assert.equal(
        passesWaitingBucket(null, waitingBucketFilterSpec(chip)),
        false,
      );
    }
  });

  it("matches only the requested waiting bucket", () => {
    const samples: Array<{
      days: number;
      bucket: Exclude<BriefingWaitingBucket, "all">;
    }> = [
      { days: 1, bucket: "1-3" },
      { days: 3, bucket: "1-3" },
      { days: 4, bucket: "4-7" },
      { days: 7, bucket: "4-7" },
      { days: 8, bucket: "8+" },
      { days: 40, bucket: "8+" },
    ];
    for (const { days, bucket } of samples) {
      for (const chip of chips) {
        assert.equal(
          passesWaitingBucket(days, waitingBucketFilterSpec(chip)),
          bucket === chip,
          `${days}d vs ${chip}`,
        );
      }
    }
  });
});

describe("computeBriefingListKpis", () => {
  const asOf = new Date("2026-08-12T12:00:00.000Z");

  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeBriefingListKpis([], asOf), {
      awaiting: 0,
      oldestWaitingDays: 0,
    });
  });

  it("counts awaiting and max daysWaiting as oldestWaitingDays", () => {
    const kpis = computeBriefingListKpis(
      [
        { updatedAt: "2026-08-12T08:00:00.000Z" }, // 0d
        { updatedAt: "2026-08-10T12:00:00.000Z" }, // 2d
        { updatedAt: "2026-08-01T12:00:00.000Z" }, // 11d
      ],
      asOf,
    );
    assert.deepEqual(kpis, {
      awaiting: 3,
      oldestWaitingDays: 11,
    });
  });
});
