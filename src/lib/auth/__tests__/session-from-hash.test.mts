import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sessionFromHash } from "../session-from-hash";

describe("sessionFromHash", () => {
  it("returns null when tokens are missing", () => {
    assert.equal(sessionFromHash(""), null);
    assert.equal(sessionFromHash("#type=signup"), null);
    assert.equal(sessionFromHash("#access_token=abc"), null);
  });

  it("reads access and refresh tokens from a confirmation hash", () => {
    assert.deepEqual(
      sessionFromHash(
        "#access_token=tok_abc&expires_in=3600&refresh_token=ref_xyz&token_type=bearer&type=signup",
      ),
      { access_token: "tok_abc", refresh_token: "ref_xyz" },
    );
  });
});
