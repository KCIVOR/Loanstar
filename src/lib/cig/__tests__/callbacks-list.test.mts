import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CALLBACK_LIST_PAGE_SIZES,
  CALLBACK_STATUS_FILTERS,
  callbackIsOverdue,
  callbackStatusFilterSpec,
  clampCallbackListPageSize,
  computeCallbackListKpis,
  passesCallbackStatusFilter,
  sortCallbacksByDue,
  type CallbackStatusFilter,
} from "../history";

describe("callbackIsOverdue", () => {
  const asOf = new Date("2026-08-12T12:00:00.000Z");

  it("future scheduledAt → false", () => {
    assert.equal(
      callbackIsOverdue("2026-08-12T12:00:01.000Z", asOf),
      false,
    );
    assert.equal(
      callbackIsOverdue("2026-08-13T00:00:00.000Z", asOf),
      false,
    );
  });

  it("past or equal scheduledAt → true", () => {
    assert.equal(
      callbackIsOverdue("2026-08-12T12:00:00.000Z", asOf),
      true,
    );
    assert.equal(
      callbackIsOverdue("2026-08-12T11:59:59.000Z", asOf),
      true,
    );
    assert.equal(
      callbackIsOverdue("2026-08-01T00:00:00.000Z", asOf),
      true,
    );
  });
});

describe("callbackStatusFilterSpec", () => {
  it("maps every Status chip id the page exposes", () => {
    const pageStatusChips = ["all", "upcoming", "overdue"] as const;
    assert.deepEqual([...CALLBACK_STATUS_FILTERS], [...pageStatusChips]);
    for (const id of pageStatusChips) {
      assert.equal(callbackStatusFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown values", () => {
    assert.equal(callbackStatusFilterSpec(""), "all");
    assert.equal(callbackStatusFilterSpec("unknown"), "all");
    assert.equal(callbackStatusFilterSpec("pending"), "all");
  });
});

describe("passesCallbackStatusFilter ↔ callbackStatusFilterSpec", () => {
  const chips: Exclude<CallbackStatusFilter, "all">[] = ["upcoming", "overdue"];

  it("lets every overdue flag through when spec is all", () => {
    for (const isOverdue of [true, false]) {
      assert.equal(
        passesCallbackStatusFilter(isOverdue, callbackStatusFilterSpec("all")),
        true,
        String(isOverdue),
      );
    }
  });

  it("matches only the requested status chip (overdue × spec)", () => {
    for (const isOverdue of [true, false]) {
      for (const chip of chips) {
        const expected = chip === "overdue" ? isOverdue : !isOverdue;
        assert.equal(
          passesCallbackStatusFilter(isOverdue, callbackStatusFilterSpec(chip)),
          expected,
          `${isOverdue} vs ${chip}`,
        );
      }
    }
  });
});

describe("sortCallbacksByDue", () => {
  const early = { id: "early", scheduledAt: "2026-08-01T10:00:00.000Z" };
  const mid = { id: "mid", scheduledAt: "2026-08-02T10:00:00.000Z" };
  const late = { id: "late", scheduledAt: "2026-08-03T10:00:00.000Z" };

  it("sorts ascending by scheduledAt", () => {
    const sorted = sortCallbacksByDue([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["early", "mid", "late"],
    );
  });

  it("sorts descending by scheduledAt", () => {
    const sorted = sortCallbacksByDue([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["late", "mid", "early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortCallbacksByDue(rows, "asc");
    assert.deepEqual(rows, copy);
  });

  it("preserves relative order for equal scheduledAt", () => {
    const a = { id: "first", scheduledAt: "2026-08-01T12:00:00.000Z" };
    const b = { id: "second", scheduledAt: "2026-08-01T12:00:00.000Z" };
    const sorted = sortCallbacksByDue([a, b], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["first", "second"],
    );
  });
});

describe("computeCallbackListKpis", () => {
  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeCallbackListKpis([]), {
      upcoming: 0,
      overdue: 0,
    });
  });

  it("counts upcoming and overdue from isOverdue flags", () => {
    assert.deepEqual(
      computeCallbackListKpis([
        { isOverdue: false },
        { isOverdue: true },
        { isOverdue: false },
        { isOverdue: true },
        { isOverdue: true },
      ]),
      { upcoming: 2, overdue: 3 },
    );
  });
});

describe("clampCallbackListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of CALLBACK_LIST_PAGE_SIZES) {
      assert.equal(clampCallbackListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampCallbackListPageSize(0), 10);
    assert.equal(clampCallbackListPageSize(15), 10);
    assert.equal(clampCallbackListPageSize(NaN), 10);
    assert.equal(clampCallbackListPageSize(25), 10);
    assert.equal(clampCallbackListPageSize(-1), 10);
  });
});
