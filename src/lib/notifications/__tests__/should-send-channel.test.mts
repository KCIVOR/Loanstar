import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateChannelPreference } from "../should-send-channel";

describe("evaluateChannelPreference (Phase 6)", () => {
  it("fail-open when userId missing", () => {
    assert.deepEqual(evaluateChannelPreference(null, null, "email"), {
      allowed: true,
      reason: "no_user_id",
    });
  });

  it("fail-open when preferences missing or channel key absent", () => {
    assert.equal(
      evaluateChannelPreference("u1", null, "email").allowed,
      true,
    );
    assert.equal(
      evaluateChannelPreference("u1", {}, "sms").allowed,
      true,
    );
    assert.equal(
      evaluateChannelPreference(
        "u1",
        { notifications: { inApp: false } },
        "email",
      ).allowed,
      true,
    );
  });

  it("skips only on explicit false", () => {
    const result = evaluateChannelPreference(
      "u1",
      { notifications: { email: false } },
      "email",
    );
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "preferences.notifications.email=false");
  });

  it("allows explicit true", () => {
    assert.equal(
      evaluateChannelPreference(
        "u1",
        { notifications: { sms: true } },
        "sms",
      ).allowed,
      true,
    );
  });
});
