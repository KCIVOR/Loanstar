import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DCR_LIST_PAGE_SIZES,
  DCR_LIST_STATUS_FILTERS,
  clampDcrListPageSize,
  computeDcrListKpis,
  dcrListStatusFilterSpec,
  isDcrListRow,
  passesDcrListStatusFilter,
  sortDcrsByDate,
  type DcrListStatusFilter,
} from "../dcr-list";

type SortRow = {
  id: string;
  created_at: string;
  submitted_at: string | null;
};

function row(
  overrides: Partial<SortRow> & Pick<SortRow, "id">,
): SortRow {
  return {
    id: overrides.id,
    created_at: overrides.created_at ?? "2026-08-01T10:00:00.000Z",
    submitted_at: overrides.submitted_at === undefined
      ? "2026-08-02T10:00:00.000Z"
      : overrides.submitted_at,
  };
}

describe("DCR_LIST_STATUS_FILTERS", () => {
  it("exposes All / Submitted / Reconciled / Rejected only (no draft)", () => {
    assert.deepEqual([...DCR_LIST_STATUS_FILTERS], [
      "all",
      "submitted",
      "reconciled",
      "rejected",
    ]);
  });
});

describe("DCR_LIST_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by Recent DCRs", () => {
    assert.deepEqual([...DCR_LIST_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampDcrListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of DCR_LIST_PAGE_SIZES) {
      assert.equal(clampDcrListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampDcrListPageSize(0), 10);
    assert.equal(clampDcrListPageSize(15), 10);
    assert.equal(clampDcrListPageSize(NaN), 10);
    assert.equal(clampDcrListPageSize(25), 10);
    assert.equal(clampDcrListPageSize(-1), 10);
  });
});

describe("dcrListStatusFilterSpec", () => {
  it("maps every Status chip id the page exposes", () => {
    const pageStatusChips = [
      "all",
      "submitted",
      "reconciled",
      "rejected",
    ] as const;
    assert.deepEqual([...DCR_LIST_STATUS_FILTERS], [...pageStatusChips]);
    for (const id of pageStatusChips) {
      assert.equal(dcrListStatusFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown and draft values", () => {
    assert.equal(dcrListStatusFilterSpec(""), "all");
    assert.equal(dcrListStatusFilterSpec("unknown"), "all");
    assert.equal(dcrListStatusFilterSpec("draft"), "all");
  });
});

describe("passesDcrListStatusFilter ↔ dcrListStatusFilterSpec", () => {
  const chips: Exclude<DcrListStatusFilter, "all">[] = [
    "submitted",
    "reconciled",
    "rejected",
  ];
  const statuses = ["draft", "submitted", "reconciled", "rejected"];

  it("lets every status through when spec is all", () => {
    for (const status of statuses) {
      assert.equal(
        passesDcrListStatusFilter(status, dcrListStatusFilterSpec("all")),
        true,
        status,
      );
    }
  });

  it("matches only the requested status chip", () => {
    for (const status of statuses) {
      for (const chip of chips) {
        assert.equal(
          passesDcrListStatusFilter(status, dcrListStatusFilterSpec(chip)),
          status === chip,
          `${status} vs ${chip}`,
        );
      }
    }
  });
});

describe("isDcrListRow", () => {
  it("excludes drafts from the Recent DCRs list (builder owns drafts)", () => {
    assert.equal(isDcrListRow("draft"), false);
  });

  it("includes submitted, reconciled, and any unexpected non-draft status", () => {
    assert.equal(isDcrListRow("submitted"), true);
    assert.equal(isDcrListRow("reconciled"), true);
    assert.equal(isDcrListRow("rejected"), true);
  });
});

describe("sortDcrsByDate", () => {
  const early = row({
    id: "early",
    created_at: "2026-08-01T10:00:00.000Z",
    submitted_at: null,
  });
  const mid = row({
    id: "mid",
    created_at: "2026-08-01T08:00:00.000Z",
    submitted_at: "2026-08-02T10:00:00.000Z",
  });
  const late = row({
    id: "late",
    created_at: "2026-08-01T09:00:00.000Z",
    submitted_at: "2026-08-03T10:00:00.000Z",
  });

  it("sorts ascending by submitted_at falling back to created_at", () => {
    const sorted = sortDcrsByDate([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["early", "mid", "late"],
    );
  });

  it("sorts descending by submitted_at falling back to created_at", () => {
    const sorted = sortDcrsByDate([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["late", "mid", "early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortDcrsByDate(rows, "asc");
    assert.deepEqual(rows, copy);
  });
});

describe("computeDcrListKpis", () => {
  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeDcrListKpis([]), {
      submitted: 0,
      reconciled: 0,
      rejected: 0,
    });
  });

  it("counts submitted, reconciled, and rejected on the non-draft set; ignores draft", () => {
    assert.deepEqual(
      computeDcrListKpis([
        { status: "draft" },
        { status: "submitted" },
        { status: "reconciled" },
        { status: "submitted" },
        { status: "rejected" },
        { status: "reconciled" },
        { status: "draft" },
      ]),
      { submitted: 2, reconciled: 2, rejected: 1 },
    );
  });
});
