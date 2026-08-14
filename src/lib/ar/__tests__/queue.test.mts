import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MASTERLIST_QUEUE_PAGE_SIZES,
  OUTSTANDING_BALANCE_FETCH_PAGE,
  agingFilterSpec,
  birStatusFilterSpec,
  clampMasterlistQueuePageSize,
  needsAttention,
  statusFilterSpec,
  sumOutstandingBalances,
} from "../queue";

describe("MASTERLIST_QUEUE_PAGE_SIZES / OUTSTANDING_BALANCE_FETCH_PAGE", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...MASTERLIST_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });

  it("uses 1000 as the PostgREST outstanding-balance fetch page size", () => {
    assert.equal(OUTSTANDING_BALANCE_FETCH_PAGE, 1000);
  });
});

describe("clampMasterlistQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of MASTERLIST_QUEUE_PAGE_SIZES) {
      assert.equal(clampMasterlistQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampMasterlistQueuePageSize(0), 10);
    assert.equal(clampMasterlistQueuePageSize(15), 10);
    assert.equal(clampMasterlistQueuePageSize(NaN), 10);
  });
});

describe("statusFilterSpec / agingFilterSpec", () => {
  it("maps status filters to the .eq() value used by the query builder", () => {
    assert.deepEqual(statusFilterSpec("all"), { mode: "all" });
    assert.deepEqual(statusFilterSpec("active"), {
      mode: "eq",
      status: "active",
    });
    assert.deepEqual(statusFilterSpec("remedial"), {
      mode: "eq",
      status: "remedial",
    });
  });

  it("maps every /ar Status chip id the page exposes", () => {
    // Mirrors STATUS_CHIPS in src/app/ar/page.tsx (CHECK constraint statuses).
    const pageStatusChips = [
      "all",
      "active",
      "paid",
      "default",
      "remedial",
    ] as const;
    for (const id of pageStatusChips) {
      if (id === "all") {
        assert.deepEqual(statusFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(statusFilterSpec(id), { mode: "eq", status: id });
      }
    }
  });

  it("maps aging filters to the .eq() value used by the query builder", () => {
    assert.deepEqual(agingFilterSpec("all"), { mode: "all" });
    assert.deepEqual(agingFilterSpec("current"), {
      mode: "eq",
      aging: "current",
    });
    assert.deepEqual(agingFilterSpec("91+"), {
      mode: "eq",
      aging: "91+",
    });
  });

  it("maps every /ar Aging chip id the page exposes", () => {
    // Mirrors AGING_CHIPS in src/app/ar/page.tsx.
    const pageAgingChips = [
      "all",
      "current",
      "1-30",
      "31-60",
      "61-90",
      "91+",
    ] as const;
    for (const id of pageAgingChips) {
      if (id === "all") {
        assert.deepEqual(agingFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(agingFilterSpec(id), { mode: "eq", aging: id });
      }
    }
  });

  it("treats empty filter as all", () => {
    assert.deepEqual(statusFilterSpec(""), { mode: "all" });
    assert.deepEqual(agingFilterSpec(""), { mode: "all" });
    assert.deepEqual(birStatusFilterSpec(""), { mode: "all" });
  });

  it("maps classification filters to eq / unset / all", () => {
    assert.deepEqual(birStatusFilterSpec("all"), { mode: "all" });
    assert.deepEqual(birStatusFilterSpec("unset"), { mode: "unset" });
    assert.deepEqual(birStatusFilterSpec("A1"), {
      mode: "eq",
      code: "A1",
    });
  });
});

describe("needsAttention", () => {
  it("flags remedial_flag regardless of aging", () => {
    assert.equal(
      needsAttention({
        remedial_flag: true,
        aging_bucket: "current",
      }),
      true,
    );
  });

  it("flags non-current non-empty aging buckets", () => {
    assert.equal(
      needsAttention({
        remedial_flag: false,
        aging_bucket: "1-30",
      }),
      true,
    );
    assert.equal(
      needsAttention({
        remedial_flag: null,
        aging_bucket: "91+",
      }),
      true,
    );
  });

  it("agrees with /ar priority-sort semantics for every aging chip bucket", () => {
    // Page priority sort uses needsAttention from this module (Phase 7).
    for (const bucket of ["1-30", "31-60", "61-90", "91+"] as const) {
      assert.equal(
        needsAttention({ remedial_flag: false, aging_bucket: bucket }),
        true,
        bucket,
      );
    }
    assert.equal(
      needsAttention({ remedial_flag: false, aging_bucket: "current" }),
      false,
    );
  });

  it("does not flag current or empty aging without remedial", () => {
    assert.equal(
      needsAttention({
        remedial_flag: false,
        aging_bucket: "current",
      }),
      false,
    );
    assert.equal(
      needsAttention({
        remedial_flag: false,
        aging_bucket: "Current",
      }),
      false,
    );
    assert.equal(
      needsAttention({
        remedial_flag: false,
        aging_bucket: "",
      }),
      false,
    );
  });
});

describe("sumOutstandingBalances", () => {
  it("sums numeric outstanding balances", () => {
    assert.equal(
      sumOutstandingBalances([
        { outstanding_balance: 100 },
        { outstanding_balance: 250.5 },
        { outstanding_balance: 49.5 },
      ]),
      400,
    );
  });

  it("returns 0 for an empty list", () => {
    assert.equal(sumOutstandingBalances([]), 0);
  });

  it("treats non-numeric balances as 0", () => {
    const rows = [
      { outstanding_balance: 10 },
      { outstanding_balance: Number.NaN },
      { outstanding_balance: "20" as unknown as number },
      { outstanding_balance: null as unknown as number },
    ];
    assert.equal(sumOutstandingBalances(rows), 30);
  });
});
