import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AVATAR_UPLOAD_MAX_PER_WINDOW,
  AVATAR_UPLOAD_WINDOW_MS,
  isAvatarUploadRateLimited,
} from "../rate-limit";

describe("avatar upload rate limit (Phase 7)", () => {
  it("allows when under the window max", () => {
    assert.equal(isAvatarUploadRateLimited(0), false);
    assert.equal(
      isAvatarUploadRateLimited(AVATAR_UPLOAD_MAX_PER_WINDOW - 1),
      false,
    );
  });

  it("blocks at or above the window max", () => {
    assert.equal(
      isAvatarUploadRateLimited(AVATAR_UPLOAD_MAX_PER_WINDOW),
      true,
    );
    assert.equal(
      isAvatarUploadRateLimited(AVATAR_UPLOAD_MAX_PER_WINDOW + 2),
      true,
    );
  });

  it("documents a 10-minute window and max of 5", () => {
    assert.equal(AVATAR_UPLOAD_WINDOW_MS, 10 * 60 * 1000);
    assert.equal(AVATAR_UPLOAD_MAX_PER_WINDOW, 5);
  });
});
