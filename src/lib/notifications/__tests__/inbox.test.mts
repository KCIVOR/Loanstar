import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countUnread,
  mapNotificationRow,
  parseMarkReadPatch,
} from "../inbox";
import { isInAppNotifyAllowed } from "../write";

describe("notifications inbox helpers (Phase 5)", () => {
  it("maps row and counts unread", () => {
    const mapped = mapNotificationRow({
      id: "n1",
      title: "Hello",
      body: "World",
      link: "/borrower",
      kind: "status",
      entity_type: "loan_application",
      entity_id: "a1",
      read_at: null,
      created_at: "2026-07-19T00:00:00Z",
    });
    assert.equal(mapped.readAt, null);
    assert.equal(countUnread([mapped, { ...mapped, id: "n2", readAt: "x" }]), 1);
  });

  it("parses mark-read patch", () => {
    assert.deepEqual(parseMarkReadPatch({ all: true }), { all: true });
    assert.deepEqual(parseMarkReadPatch({ ids: ["a", "b"] }), {
      ids: ["a", "b"],
    });
    assert.equal(parseMarkReadPatch({}), null);
  });

  it("in-app notify allowed fail-open unless explicit false", () => {
    assert.equal(isInAppNotifyAllowed(undefined), true);
    assert.equal(isInAppNotifyAllowed({}), true);
    assert.equal(
      isInAppNotifyAllowed({ notifications: { inApp: true } }),
      true,
    );
    assert.equal(
      isInAppNotifyAllowed({ notifications: { inApp: false } }),
      false,
    );
  });
});
