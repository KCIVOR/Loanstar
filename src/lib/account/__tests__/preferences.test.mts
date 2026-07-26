import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS,
  isChannelSendAllowed,
  mergeAccountPreferences,
  pickAccountSelfPatch,
  resolveAccountPreferences,
} from "../preferences";

describe("account self-patch allowlist (Phase 0)", () => {
  it("keeps only fullName, phone, and preferences", () => {
    const picked = pickAccountSelfPatch({
      fullName: "Ada Lovelace",
      phone: "+639171234567",
      preferences: { timezone: "Asia/Manila" },
      is_active: false,
      email: "spoof@example.com",
      id: "00000000-0000-0000-0000-000000000001",
      avatarUrl: "https://evil.example/a.png",
      avatar_url: "https://evil.example/b.png",
      roleIds: ["x"],
    });

    assert.deepEqual(picked, {
      fullName: "Ada Lovelace",
      phone: "+639171234567",
      preferences: { timezone: "Asia/Manila" },
    });
  });

  it("documents forbidden keys", () => {
    assert.ok(ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS.includes("is_active"));
    assert.ok(ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS.includes("email"));
    assert.ok(ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS.includes("id"));
    assert.ok(ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS.includes("avatar_url"));
  });

  it("omits undefined allowlisted fields", () => {
    const picked = pickAccountSelfPatch({ phone: null });
    assert.deepEqual(picked, { phone: null });
  });
});

describe("account preferences merge (Phase 0)", () => {
  it("merges timezone and locale without inventing channel keys", () => {
    const merged = mergeAccountPreferences(
      {},
      { timezone: "Asia/Manila", locale: "en-PH" },
    );
    assert.deepEqual(merged, {
      timezone: "Asia/Manila",
      locale: "en-PH",
    });
    assert.equal(
      "notifications" in merged &&
        merged.notifications &&
        "email" in merged.notifications,
      false,
    );
  });

  it("strips email/sms channel keys from patch before Phase 6", () => {
    const merged = mergeAccountPreferences(
      { timezone: "UTC", notifications: { inApp: true } },
      {
        notifications: {
          inApp: false,
          email: false,
          sms: false,
        },
      },
      { allowChannelKeys: false },
    );

    assert.deepEqual(merged, {
      timezone: "UTC",
      notifications: { inApp: false },
    });
  });

  it("can persist channel keys when allowChannelKeys is true (Phase 6)", () => {
    const merged = mergeAccountPreferences(
      {},
      { notifications: { email: false, sms: true } },
      { allowChannelKeys: true },
    );
    assert.deepEqual(merged, {
      notifications: { email: false, sms: true },
    });
  });

  it("ignores unknown top-level preference keys", () => {
    const merged = mergeAccountPreferences(
      { timezone: "UTC" },
      { timezone: "Asia/Manila", unknownFlag: true } as never,
    );
    assert.deepEqual(merged, { timezone: "Asia/Manila" });
  });
});

describe("channel fail-open (Phase 0 contract)", () => {
  it("allows send when preferences missing", () => {
    assert.equal(isChannelSendAllowed(undefined, "email"), true);
    assert.equal(isChannelSendAllowed(null, "sms"), true);
    assert.equal(isChannelSendAllowed({}, "email"), true);
  });

  it("allows send when notifications key or channel key is missing", () => {
    assert.equal(
      isChannelSendAllowed({ notifications: {} }, "email"),
      true,
    );
    assert.equal(
      isChannelSendAllowed({ notifications: { inApp: true } }, "sms"),
      true,
    );
  });

  it("skips only on explicit false", () => {
    assert.equal(
      isChannelSendAllowed({ notifications: { email: false } }, "email"),
      false,
    );
    assert.equal(
      isChannelSendAllowed({ notifications: { sms: true } }, "sms"),
      true,
    );
  });

  it("resolveAccountPreferences applies in-memory defaults without writing channel keys", () => {
    const resolved = resolveAccountPreferences({});
    assert.equal(resolved.notifications.inApp, true);
    assert.equal(resolved.notifications.email, true);
    assert.equal(resolved.notifications.sms, true);
    // Stored shape for empty row stays empty — defaults are read-path only.
    const forStore = mergeAccountPreferences({}, {});
    assert.deepEqual(forStore, {});
  });
});
