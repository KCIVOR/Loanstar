import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AR_DCR_LIST_PAGE_SIZES,
  AR_DCR_WAITING_BUCKETS,
  arDcrSearchPredicate,
  clampArDcrListPageSize,
  daysWaiting,
  passesWaitingBucket,
  sortDcrsBySubmittedAt,
  waitingBucketFilterSpec,
  waitingBucketForDays,
  type ArDcrSearchItem,
  type ArDcrWaitingBucket,
} from "../dcr-list";

function item(
  overrides: Partial<ArDcrSearchItem> & Pick<ArDcrSearchItem, "id">,
): ArDcrSearchItem {
  return {
    id: overrides.id,
    dcr_items:
      overrides.dcr_items === undefined
        ? [
            {
              payments: {
                reference_no: "PAY-100",
                masterlist: {
                  borrower_name: "Rovick Romasanta",
                  loan_account_no: "LN-001",
                },
              },
            },
          ]
        : overrides.dcr_items,
  };
}

describe("arDcrSearchPredicate", () => {
  const base = item({ id: "dcr-uuid-111" });

  it("empty / whitespace term matches all", () => {
    assert.equal(arDcrSearchPredicate(base, ""), true);
    assert.equal(arDcrSearchPredicate(base, "   "), true);
  });

  it("matches DCR id case-insensitively", () => {
    assert.equal(arDcrSearchPredicate(base, "dcr-uuid-111"), true);
    assert.equal(arDcrSearchPredicate(base, "DCR-UUID-111"), true);
  });

  it("matches borrower name case-insensitively", () => {
    assert.equal(arDcrSearchPredicate(base, "rovick"), true);
    assert.equal(arDcrSearchPredicate(base, "ROMASANTA"), true);
  });

  it("matches loan account case-insensitively", () => {
    assert.equal(arDcrSearchPredicate(base, "ln-001"), true);
    assert.equal(arDcrSearchPredicate(base, "LN-001"), true);
  });

  it("matches payment ref case-insensitively", () => {
    assert.equal(arDcrSearchPredicate(base, "pay-100"), true);
    assert.equal(arDcrSearchPredicate(base, "PAY-100"), true);
  });

  it("rejects non-matches", () => {
    assert.equal(arDcrSearchPredicate(base, "zzz"), false);
    assert.equal(arDcrSearchPredicate(base, "LN-999"), false);
  });

  it("empty dcr_items still matches DCR id", () => {
    const noItems = item({ id: "dcr-uuid-222", dcr_items: [] });
    assert.equal(arDcrSearchPredicate(noItems, "dcr-uuid-222"), true);
    assert.equal(arDcrSearchPredicate(noItems, "rovick"), false);
  });
});

describe("sortDcrsBySubmittedAt", () => {
  const early = { id: "early", submitted_at: "2026-08-01T10:00:00.000Z" };
  const mid = { id: "mid", submitted_at: "2026-08-02T10:00:00.000Z" };
  const late = { id: "late", submitted_at: "2026-08-03T10:00:00.000Z" };

  it("sorts ascending by submitted_at", () => {
    const sorted = sortDcrsBySubmittedAt([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["early", "mid", "late"],
    );
  });

  it("sorts descending by submitted_at", () => {
    const sorted = sortDcrsBySubmittedAt([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["late", "mid", "early"],
    );
  });

  it("treats missing submitted_at as epoch 0", () => {
    const missing = { id: "missing", submitted_at: null };
    const sortedAsc = sortDcrsBySubmittedAt([mid, missing], "asc");
    assert.deepEqual(
      sortedAsc.map((r) => r.id),
      ["missing", "mid"],
    );
    const sortedDesc = sortDcrsBySubmittedAt([missing, mid], "desc");
    assert.deepEqual(
      sortedDesc.map((r) => r.id),
      ["mid", "missing"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortDcrsBySubmittedAt(rows, "asc");
    assert.deepEqual(rows, copy);
  });

  it("preserves relative order for equal submitted_at", () => {
    const a = { id: "first", submitted_at: "2026-08-01T12:00:00.000Z" };
    const b = { id: "second", submitted_at: "2026-08-01T12:00:00.000Z" };
    const sorted = sortDcrsBySubmittedAt([a, b], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["first", "second"],
    );
  });
});

describe("clampArDcrListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of AR_DCR_LIST_PAGE_SIZES) {
      assert.equal(clampArDcrListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampArDcrListPageSize(0), 10);
    assert.equal(clampArDcrListPageSize(15), 10);
    assert.equal(clampArDcrListPageSize(NaN), 10);
    assert.equal(clampArDcrListPageSize(25), 10);
    assert.equal(clampArDcrListPageSize(-1), 10);
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
    assert.deepEqual([...AR_DCR_WAITING_BUCKETS], [...pageWaitingChips]);
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
  const chips: Exclude<ArDcrWaitingBucket, "all">[] = ["1-3", "4-7", "8+"];

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
      bucket: Exclude<ArDcrWaitingBucket, "all">;
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
