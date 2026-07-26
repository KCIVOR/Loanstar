import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeAccountPreferences,
  preparePreferencesResponse,
  resolveAccountPreferences,
} from "../preferences";

describe("preferences polish (Phase 4)", () => {
  it("strips unknown notification keys from merge result", () => {
    const merged = mergeAccountPreferences(
      {},
      {
        notifications: {
          inApp: true,
          push: true,
          webhook: false,
        } as never,
      },
    );
    assert.deepEqual(merged, {
      notifications: { inApp: true },
    });
  });

  it("strips email/sms from stored result when allowChannelKeys is false", () => {
    const merged = mergeAccountPreferences(
      {
        timezone: "UTC",
        notifications: { inApp: true, email: false, sms: true },
      },
      { locale: "en-PH" },
      { allowChannelKeys: false },
    );
    assert.deepEqual(merged, {
      timezone: "UTC",
      locale: "en-PH",
      notifications: { inApp: true },
    });
  });

  it("keeps email/sms when allowChannelKeys is true", () => {
    const merged = mergeAccountPreferences(
      { notifications: { email: true } },
      { notifications: { sms: false } },
      { allowChannelKeys: true },
    );
    assert.deepEqual(merged, {
      notifications: { email: true, sms: false },
    });
  });

  it("resolveAccountPreferences is read-path only and does not invent storage writes", () => {
    const stored = { timezone: "Asia/Manila" };
    const resolved = resolveAccountPreferences(stored);
    assert.equal(resolved.timezone, "Asia/Manila");
    assert.equal(resolved.notifications.inApp, true);
    assert.equal(resolved.notifications.email, true);
    assert.equal(resolved.notifications.sms, true);
    // Empty merge still stores nothing for channels
    assert.deepEqual(mergeAccountPreferences(stored, {}), stored);
  });

  it("preparePreferencesResponse returns stored + resolved without channel backfill on stored", () => {
    const { stored, resolved } = preparePreferencesResponse({
      timezone: "Asia/Manila",
    });
    assert.deepEqual(stored, { timezone: "Asia/Manila" });
    assert.equal("email" in (stored.notifications ?? {}), false);
    assert.equal(resolved.notifications.email, true);
    assert.equal(resolved.notifications.inApp, true);
  });
});
