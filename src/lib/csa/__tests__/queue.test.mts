import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVE_QUEUE_STATUSES,
  ATTENTION_STATUSES,
  DOCUMENT_STATUSES,
  NEGOTIATION_STATUSES,
  csaNeedsAttention,
  csaMatchesWorkFilter,
  daysInQueue,
  formatBlockerLabel,
  workFilterSpec,
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

describe("workFilterSpec / status constants", () => {
  it("maps work filters to the status lists used by the query builder", () => {
    assert.deepEqual(workFilterSpec("all"), { mode: "all" });
    assert.deepEqual(workFilterSpec("documents"), {
      mode: "in",
      statuses: DOCUMENT_STATUSES,
    });
    assert.deepEqual(workFilterSpec("negotiation"), {
      mode: "in",
      statuses: NEGOTIATION_STATUSES,
    });
    assert.deepEqual(workFilterSpec("attention"), {
      mode: "attention",
      statuses: ATTENTION_STATUSES,
    });
  });

  it("keeps document/negotiation/attention statuses inside the active queue set", () => {
    const active = new Set<string>(ACTIVE_QUEUE_STATUSES);
    for (const status of DOCUMENT_STATUSES) {
      assert.ok(active.has(status), status);
    }
    for (const status of NEGOTIATION_STATUSES) {
      assert.ok(active.has(status), status);
    }
    for (const status of ATTENTION_STATUSES) {
      assert.ok(active.has(status), status);
    }
  });

  it("agrees with csaMatchesWorkFilter for document and negotiation statuses", () => {
    for (const status of DOCUMENT_STATUSES) {
      assert.equal(
        csaMatchesWorkFilter({ status }, "documents"),
        true,
        status,
      );
    }
    for (const status of NEGOTIATION_STATUSES) {
      assert.equal(
        csaMatchesWorkFilter({ status }, "negotiation"),
        true,
        status,
      );
    }
    for (const status of ATTENTION_STATUSES) {
      assert.equal(
        csaMatchesWorkFilter({ status }, "attention"),
        true,
        status,
      );
    }
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
