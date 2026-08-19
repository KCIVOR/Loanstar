import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RELEASE_PATHS,
  RELEASED_LOANS_PAGE_SIZES,
  clampReleasedLoansPageSize,
  passesHistorySegmentFilter,
  releasePathFilterSpec,
} from "../history";

describe("RELEASED_LOANS_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by history routes", () => {
    assert.deepEqual([...RELEASED_LOANS_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampReleasedLoansPageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of RELEASED_LOANS_PAGE_SIZES) {
      assert.equal(clampReleasedLoansPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampReleasedLoansPageSize(0), 10);
    assert.equal(clampReleasedLoansPageSize(15), 10);
    assert.equal(clampReleasedLoansPageSize(25), 10);
    assert.equal(clampReleasedLoansPageSize(-1), 10);
    assert.equal(clampReleasedLoansPageSize(NaN), 10);
  });
});

describe("releasePathFilterSpec", () => {
  it("maps release-path filter to the .eq() value used by the query builder", () => {
    assert.equal(releasePathFilterSpec("all"), null);
    for (const path of RELEASE_PATHS) {
      assert.equal(releasePathFilterSpec(path), path, path);
    }
  });
});

describe("passesHistorySegmentFilter", () => {
  it("matches individual rows only under the individual filter — regression guard for the broken embedded .eq()", () => {
    assert.equal(
      passesHistorySegmentFilter({ segment: "individual" }, "individual"),
      true,
    );
    assert.equal(
      passesHistorySegmentFilter({ segment: "seafarer" }, "individual"),
      false,
    );
    assert.equal(
      passesHistorySegmentFilter({ segment: "sme" }, "individual"),
      false,
    );
  });

  it("'all' matches every segment including null", () => {
    assert.equal(passesHistorySegmentFilter({ segment: "sme" }, "all"), true);
    assert.equal(
      passesHistorySegmentFilter({ segment: "seafarer" }, "all"),
      true,
    );
    assert.equal(passesHistorySegmentFilter({ segment: null }, "all"), true);
  });

  it("a null segment never matches a concrete filter", () => {
    assert.equal(
      passesHistorySegmentFilter({ segment: null }, "individual"),
      false,
    );
    assert.equal(passesHistorySegmentFilter({ segment: null }, "sme"), false);
    assert.equal(
      passesHistorySegmentFilter({ segment: null }, "seafarer"),
      false,
    );
  });
});
