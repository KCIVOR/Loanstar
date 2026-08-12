import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVE_COMMITTEE_STATUSES,
  statusFilterSpec,
  tatOverdueCutoffIso,
} from "../queue";

describe("statusFilterSpec / ACTIVE_COMMITTEE_STATUSES", () => {
  it("maps status filters to the .eq() value used by the query builder", () => {
    assert.deepEqual(statusFilterSpec("all"), { mode: "all" });
    assert.deepEqual(statusFilterSpec("for_approval"), {
      mode: "eq",
      status: "for_approval",
    });
    assert.deepEqual(statusFilterSpec("committee_hold"), {
      mode: "eq",
      status: "committee_hold",
    });
    assert.deepEqual(statusFilterSpec("negotiating_terms"), {
      mode: "eq",
      status: "negotiating_terms",
    });
  });

  it("keeps every filtered status inside the active committee queue set", () => {
    const active = new Set<string>(ACTIVE_COMMITTEE_STATUSES);
    for (const status of ACTIVE_COMMITTEE_STATUSES) {
      const spec = statusFilterSpec(status);
      assert.equal(spec.mode, "eq");
      if (spec.mode === "eq") {
        assert.ok(active.has(spec.status), spec.status);
        assert.equal(spec.status, status);
      }
    }
  });

  it("lists exactly the three active committee statuses", () => {
    assert.deepEqual([...ACTIVE_COMMITTEE_STATUSES].sort(), [
      "committee_hold",
      "for_approval",
      "negotiating_terms",
    ]);
  });
});

describe("tatOverdueCutoffIso", () => {
  it("returns an ISO timestamp 5 days before asOf by default", () => {
    const asOf = new Date("2026-08-11T12:00:00.000Z");
    const cutoff = new Date(tatOverdueCutoffIso(asOf));
    assert.equal(cutoff.toISOString(), "2026-08-06T12:00:00.000Z");
  });
});
