import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  csaNeedsAttention,
  csaMatchesWorkFilter,
  daysInQueue,
  formatBlockerLabel,
} from "../queue";

describe("csaNeedsAttention", () => {
  it("flags on_hold and blockers", () => {
    assert.equal(csaNeedsAttention({ status: "on_hold" }), true);
    assert.equal(
      csaNeedsAttention({ status: "documents_pending", blocker: "awaiting_x" }),
      true,
    );
    assert.equal(csaNeedsAttention({ status: "documents_pending" }), false);
  });
});

describe("csaMatchesWorkFilter", () => {
  it("filters negotiation statuses", () => {
    assert.equal(
      csaMatchesWorkFilter(
        { status: "awaiting_confirmation" },
        "negotiation",
      ),
      true,
    );
    assert.equal(
      csaMatchesWorkFilter({ status: "documents_pending" }, "negotiation"),
      false,
    );
  });

  it("filters attention bucket", () => {
    assert.equal(
      csaMatchesWorkFilter(
        { status: "submitted", blocker: "missing_id" },
        "attention",
      ),
      true,
    );
  });
});

describe("daysInQueue", () => {
  it("counts whole days", () => {
    assert.equal(
      daysInQueue("2026-07-01T00:00:00.000Z", new Date("2026-07-10T12:00:00.000Z")),
      9,
    );
  });
});

describe("formatBlockerLabel", () => {
  it("humanizes slugs", () => {
    assert.equal(formatBlockerLabel("awaiting_documents"), "Awaiting documents");
  });
});
