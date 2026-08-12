import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CSA_LEADS_LIST_PAGE_SIZES,
  CSA_LEADS_WAITING_BUCKETS,
  clampCsaLeadsListPageSize,
  computeCsaLeadsListKpis,
  csaLeadSearchPredicate,
  daysWaiting,
  passesWaitingBucket,
  sortLeadsByCreatedAt,
  waitingBucketFilterSpec,
  waitingBucketForDays,
  type CsaLeadListRow,
  type CsaLeadsWaitingBucket,
} from "../leads-list";

function lead(
  overrides: Partial<CsaLeadListRow> &
    Pick<CsaLeadListRow, "id" | "createdAt">,
): CsaLeadListRow {
  return {
    id: overrides.id,
    borrowerName: overrides.borrowerName ?? "Ana Santos",
    businessName:
      overrides.businessName === undefined ? null : overrides.businessName,
    agentName: overrides.agentName === undefined ? "Maria Agent" : overrides.agentName,
    createdAt: overrides.createdAt,
  };
}

describe("csaLeadSearchPredicate", () => {
  const base = lead({
    id: "lead-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  });

  it("empty / whitespace term matches all", () => {
    assert.equal(csaLeadSearchPredicate(base, ""), true);
    assert.equal(csaLeadSearchPredicate(base, "   "), true);
  });

  it("matches borrowerName case-insensitively", () => {
    assert.equal(csaLeadSearchPredicate(base, "ana"), true);
    assert.equal(csaLeadSearchPredicate(base, "SANTOS"), true);
    assert.equal(csaLeadSearchPredicate(base, "ana santos"), true);
  });

  it("matches agentName case-insensitively", () => {
    assert.equal(csaLeadSearchPredicate(base, "maria"), true);
    assert.equal(csaLeadSearchPredicate(base, "AGENT"), true);
    assert.equal(csaLeadSearchPredicate(base, "maria agent"), true);
  });

  it("rejects non-matches", () => {
    assert.equal(csaLeadSearchPredicate(base, "zzz"), false);
    assert.equal(csaLeadSearchPredicate(base, "Pedro"), false);
  });

  it("null agentName does not crash and does not match agent search", () => {
    const noAgent = lead({
      id: "lead-2",
      createdAt: "2026-08-01T00:00:00.000Z",
      agentName: null,
    });
    assert.equal(csaLeadSearchPredicate(noAgent, "maria"), false);
    assert.equal(csaLeadSearchPredicate(noAgent, "ana"), true);
  });
});

describe("sortLeadsByCreatedAt", () => {
  const early = lead({
    id: "lead-early",
    createdAt: "2026-08-01T10:00:00.000Z",
  });
  const mid = lead({
    id: "lead-mid",
    createdAt: "2026-08-02T10:00:00.000Z",
  });
  const late = lead({
    id: "lead-late",
    createdAt: "2026-08-03T10:00:00.000Z",
  });

  it("sorts ascending by createdAt", () => {
    const sorted = sortLeadsByCreatedAt([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["lead-early", "lead-mid", "lead-late"],
    );
  });

  it("sorts descending by createdAt", () => {
    const sorted = sortLeadsByCreatedAt([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["lead-late", "lead-mid", "lead-early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortLeadsByCreatedAt(rows, "asc");
    assert.deepEqual(rows, copy);
  });

  it("preserves relative order for equal createdAt", () => {
    const a = lead({
      id: "first",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const b = lead({
      id: "second",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const sorted = sortLeadsByCreatedAt([a, b], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["first", "second"],
    );
  });

  it("treats null / invalid createdAt as epoch 0", () => {
    const invalid = lead({
      id: "invalid",
      createdAt: "not-a-date",
    });
    const missing = {
      id: "missing",
      borrowerName: "X",
      businessName: null,
      agentName: null,
      createdAt: null as unknown as string,
    };
    const real = lead({
      id: "real",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const sorted = sortLeadsByCreatedAt([real, invalid, missing], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["invalid", "missing", "real"],
    );
  });
});

describe("clampCsaLeadsListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of CSA_LEADS_LIST_PAGE_SIZES) {
      assert.equal(clampCsaLeadsListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampCsaLeadsListPageSize(0), 10);
    assert.equal(clampCsaLeadsListPageSize(15), 10);
    assert.equal(clampCsaLeadsListPageSize(NaN), 10);
    assert.equal(clampCsaLeadsListPageSize(25), 10);
    assert.equal(clampCsaLeadsListPageSize(-1), 10);
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
    assert.deepEqual([...CSA_LEADS_WAITING_BUCKETS], [...pageWaitingChips]);
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
  const chips: Exclude<CsaLeadsWaitingBucket, "all">[] = ["1-3", "4-7", "8+"];

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
      bucket: Exclude<CsaLeadsWaitingBucket, "all">;
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

describe("computeCsaLeadsListKpis", () => {
  const asOf = new Date("2026-08-12T12:00:00.000Z");

  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeCsaLeadsListKpis([], asOf), {
      open: 0,
      oldestWaitingDays: 0,
    });
  });

  it("counts open and max daysWaiting as oldestWaitingDays", () => {
    const kpis = computeCsaLeadsListKpis(
      [
        { createdAt: "2026-08-12T08:00:00.000Z" }, // 0d
        { createdAt: "2026-08-10T12:00:00.000Z" }, // 2d
        { createdAt: "2026-08-01T12:00:00.000Z" }, // 11d
      ],
      asOf,
    );
    assert.deepEqual(kpis, {
      open: 3,
      oldestWaitingDays: 11,
    });
  });
});
