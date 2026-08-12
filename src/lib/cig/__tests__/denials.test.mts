import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampDenialListPageSize,
  computeDenialListKpis,
  daysWaiting,
  denialCallMatchesSearch,
  DENIAL_LIST_PAGE_SIZES,
  DENIAL_WAITING_BUCKETS,
  passesWaitingBucket,
  sortDenialCallsByDeniedAt,
  waitingBucketFilterSpec,
  waitingBucketForDays,
  type DenialCallItem,
  type DenialWaitingBucket,
} from "../denials";

function item(
  overrides: Partial<DenialCallItem> &
    Pick<DenialCallItem, "applicationId" | "deniedAt">,
): DenialCallItem {
  return {
    noticeId: overrides.noticeId ?? "notice-1",
    applicationId: overrides.applicationId,
    applicationNo: overrides.applicationNo ?? null,
    deniedAt: overrides.deniedAt,
    borrower:
      overrides.borrower === undefined
        ? {
            firstName: "Rovick",
            lastName: "Romasanta",
            email: "rovick@example.com",
            mobilePhone: null,
          }
        : overrides.borrower,
  };
}

describe("denialCallMatchesSearch", () => {
  const base = item({
    applicationId: "app-uuid-111",
    applicationNo: "APP-100",
    deniedAt: "2026-08-01T00:00:00.000Z",
  });

  it("empty / whitespace term matches all", () => {
    assert.equal(denialCallMatchesSearch(base, ""), true);
    assert.equal(denialCallMatchesSearch(base, "   "), true);
  });

  it("matches first and last name case-insensitively", () => {
    assert.equal(denialCallMatchesSearch(base, "rovick"), true);
    assert.equal(denialCallMatchesSearch(base, "ROMASANTA"), true);
    assert.equal(denialCallMatchesSearch(base, "rovick romasanta"), true);
  });

  it("matches applicationNo case-insensitively", () => {
    assert.equal(denialCallMatchesSearch(base, "app-100"), true);
    assert.equal(denialCallMatchesSearch(base, "APP-100"), true);
  });

  it("rejects non-matches", () => {
    assert.equal(denialCallMatchesSearch(base, "zzz"), false);
    assert.equal(denialCallMatchesSearch(base, "APP-999"), false);
  });

  it("null borrower still matches applicationNo", () => {
    const noBorrower = item({
      applicationId: "app-uuid-222",
      applicationNo: "APP-200",
      deniedAt: "2026-08-01T00:00:00.000Z",
      borrower: null,
    });
    assert.equal(denialCallMatchesSearch(noBorrower, "APP-200"), true);
    assert.equal(denialCallMatchesSearch(noBorrower, "rovick"), false);
  });
});

describe("sortDenialCallsByDeniedAt", () => {
  const early = item({
    applicationId: "a",
    applicationNo: "A",
    deniedAt: "2026-08-01T10:00:00.000Z",
    noticeId: "n-early",
  });
  const mid = item({
    applicationId: "b",
    applicationNo: "B",
    deniedAt: "2026-08-02T10:00:00.000Z",
    noticeId: "n-mid",
  });
  const late = item({
    applicationId: "c",
    applicationNo: "C",
    deniedAt: "2026-08-03T10:00:00.000Z",
    noticeId: "n-late",
  });

  it("sorts ascending by deniedAt", () => {
    const sorted = sortDenialCallsByDeniedAt([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.noticeId),
      ["n-early", "n-mid", "n-late"],
    );
  });

  it("sorts descending by deniedAt", () => {
    const sorted = sortDenialCallsByDeniedAt([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.noticeId),
      ["n-late", "n-mid", "n-early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortDenialCallsByDeniedAt(rows, "asc");
    assert.deepEqual(rows, copy);
  });

  it("preserves relative order for equal deniedAt", () => {
    const a = item({
      applicationId: "x1",
      deniedAt: "2026-08-01T12:00:00.000Z",
      noticeId: "first",
    });
    const b = item({
      applicationId: "x2",
      deniedAt: "2026-08-01T12:00:00.000Z",
      noticeId: "second",
    });
    const sorted = sortDenialCallsByDeniedAt([a, b], "asc");
    assert.deepEqual(
      sorted.map((r) => r.noticeId),
      ["first", "second"],
    );
  });
});

describe("clampDenialListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of DENIAL_LIST_PAGE_SIZES) {
      assert.equal(clampDenialListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampDenialListPageSize(0), 10);
    assert.equal(clampDenialListPageSize(15), 10);
    assert.equal(clampDenialListPageSize(NaN), 10);
    assert.equal(clampDenialListPageSize(25), 10);
    assert.equal(clampDenialListPageSize(-1), 10);
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
    assert.deepEqual([...DENIAL_WAITING_BUCKETS], [...pageWaitingChips]);
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
  const chips: Exclude<DenialWaitingBucket, "all">[] = ["1-3", "4-7", "8+"];

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
    const samples: Array<{ days: number; bucket: Exclude<DenialWaitingBucket, "all"> }> =
      [
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

describe("computeDenialListKpis", () => {
  const asOf = new Date("2026-08-12T12:00:00.000Z");

  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeDenialListKpis([], asOf), {
      pending: 0,
      oldestWaitingDays: 0,
    });
  });

  it("counts pending and max daysWaiting as oldestWaitingDays", () => {
    const kpis = computeDenialListKpis(
      [
        { deniedAt: "2026-08-12T08:00:00.000Z" }, // 0d
        { deniedAt: "2026-08-10T12:00:00.000Z" }, // 2d
        { deniedAt: "2026-08-01T12:00:00.000Z" }, // 11d
      ],
      asOf,
    );
    assert.deepEqual(kpis, {
      pending: 3,
      oldestWaitingDays: 11,
    });
  });
});
