import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countUnread,
  mapNotificationRow,
  parseMarkReadPatch,
  formatNotificationTime,
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
    assert.deepEqual(parseMarkReadPatch({ ids: ["a"], unread: true }), {
      ids: ["a"],
      unread: true,
    });
    assert.deepEqual(parseMarkReadPatch({ all: true, unread: true }), {
      all: true,
    });
    assert.equal(parseMarkReadPatch({}), null);
  });

  it("formats notification time relative then absolute", () => {
    const now = new Date("2026-09-22T12:00:00Z");
    assert.equal(formatNotificationTime("2026-09-22T11:59:40Z", now), "Just now");
    assert.equal(formatNotificationTime("2026-09-22T11:30:00Z", now), "30m ago");
    assert.equal(formatNotificationTime("2026-09-22T07:00:00Z", now), "5h ago");
    assert.equal(formatNotificationTime("2026-09-20T12:00:00Z", now), "2d ago");
    assert.equal(formatNotificationTime("2026-08-01T12:00:00Z", now), "Aug 1");
    assert.equal(formatNotificationTime("2025-08-01T12:00:00Z", now), "Aug 1, 2025");
    assert.equal(formatNotificationTime("garbage", now), "");
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
