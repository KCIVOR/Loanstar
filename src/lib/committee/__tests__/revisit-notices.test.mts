import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapOpenRevisitNotice } from "../revisit-notices";

describe("mapOpenRevisitNotice", () => {
  it("maps an open csa notice and trims the comment", () => {
    assert.deepEqual(
      mapOpenRevisitNotice({
        route_to: "csa",
        comment: " fix docs ",
        created_at: "2026-10-01T00:00:00Z",
      }),
      { routeTo: "csa", comment: "fix docs", createdAt: "2026-10-01T00:00:00Z" },
    );
  });

  it("maps a cig notice", () => {
    assert.equal(
      mapOpenRevisitNotice({ route_to: "cig", comment: "re-verify", created_at: "t" })
        ?.routeTo,
      "cig",
    );
  });

  it("returns null for missing row, bad route, or blank comment", () => {
    assert.equal(mapOpenRevisitNotice(null), null);
    assert.equal(mapOpenRevisitNotice(undefined), null);
    assert.equal(
      mapOpenRevisitNotice({ route_to: "lra", comment: "x", created_at: "t" }),
      null,
    );
    assert.equal(
      mapOpenRevisitNotice({ route_to: "csa", comment: "  ", created_at: "t" }),
      null,
    );
  });
});
