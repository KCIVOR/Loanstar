import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toContactHistoryRows } from "../contact-history";

const row = (id: string, user: string) => ({
  id,
  contact_type: "call",
  notes: "n",
  callback_at: null,
  created_at: "2026-10-01T00:00:00Z",
  collector_user_id: user,
});

describe("toContactHistoryRows", () => {
  it("maps fields, attaches names, falls back to Unknown, keeps order", () => {
    const out = toContactHistoryRows(
      [row("b", "u1"), row("a", "u2")],
      new Map([["u1", "Ana"]]),
    );
    assert.deepEqual(out.map((r) => r.id), ["b", "a"]);
    assert.equal(out[0].collectorName, "Ana");
    assert.equal(out[1].collectorName, "Unknown");
    assert.equal(out[0].contactType, "call");
    assert.equal(out[0].createdAt, "2026-10-01T00:00:00Z");
  });
});
