import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLOSED_LEADS_PAGE_SIZES,
  clampClosedLeadsPageSize,
} from "../history";

describe("CLOSED_LEADS_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by history routes", () => {
    assert.deepEqual([...CLOSED_LEADS_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampClosedLeadsPageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of CLOSED_LEADS_PAGE_SIZES) {
      assert.equal(clampClosedLeadsPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampClosedLeadsPageSize(0), 10);
    assert.equal(clampClosedLeadsPageSize(15), 10);
    assert.equal(clampClosedLeadsPageSize(25), 10);
    assert.equal(clampClosedLeadsPageSize(-1), 10);
    assert.equal(clampClosedLeadsPageSize(NaN), 10);
  });
});
