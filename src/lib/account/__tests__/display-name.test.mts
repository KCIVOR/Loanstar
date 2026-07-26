import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveDisplayName } from "../display-name";
import { mergeAccountPreferences, pickAccountSelfPatch } from "../preferences";

describe("resolveDisplayName (Phase 2)", () => {
  it("prefers profiles.full_name over auth metadata", () => {
    assert.equal(
      resolveDisplayName("Profile Name", "Meta Name", "a@example.com"),
      "Profile Name",
    );
  });

  it("falls back to metadata then email then User", () => {
    assert.equal(
      resolveDisplayName(null, "Meta Name", "a@example.com"),
      "Meta Name",
    );
    assert.equal(resolveDisplayName("", null, "a@example.com"), "a@example.com");
    assert.equal(resolveDisplayName(null, null, null), "User");
  });

  it("trims whitespace-only names as empty", () => {
    assert.equal(resolveDisplayName("   ", "Meta", "a@example.com"), "Meta");
  });
});

describe("account PATCH body shaping (Phase 2)", () => {
  it("allowlist + merge do not write channel keys", () => {
    const picked = pickAccountSelfPatch({
      fullName: "Ada",
      phone: "+639171234567",
      preferences: {
        timezone: "Asia/Manila",
        notifications: { email: false, sms: false, inApp: true },
      },
      is_active: false,
    });
    const merged = mergeAccountPreferences({}, picked.preferences, {
      allowChannelKeys: false,
    });
    assert.equal(picked.fullName, "Ada");
    assert.deepEqual(merged, {
      timezone: "Asia/Manila",
      notifications: { inApp: true },
    });
  });
});
