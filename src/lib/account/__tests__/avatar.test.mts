import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AVATAR_BUCKET,
  buildAvatarStoragePath,
  extensionForAvatarMime,
  isAllowedAvatarMime,
} from "../avatar";

describe("avatar storage helpers (Phase 3)", () => {
  it("builds path under the user id folder", () => {
    const path = buildAvatarStoragePath(
      "59b4c4c0-ccf0-4dc6-a0f7-a64222985dc1",
      "image/png",
    );
    assert.equal(
      path,
      "59b4c4c0-ccf0-4dc6-a0f7-a64222985dc1/avatar.png",
    );
    assert.equal(AVATAR_BUCKET, "avatars");
  });

  it("maps allowed mime types and rejects others", () => {
    assert.equal(isAllowedAvatarMime("image/jpeg"), true);
    assert.equal(isAllowedAvatarMime("image/png"), true);
    assert.equal(isAllowedAvatarMime("image/webp"), true);
    assert.equal(isAllowedAvatarMime("application/pdf"), false);
    assert.equal(extensionForAvatarMime("image/webp"), "webp");
  });
});
