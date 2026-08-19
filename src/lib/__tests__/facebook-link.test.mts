import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { facebookHref } from "../facebook-link";

describe("facebookHref", () => {
  it("returns null for empty values", () => {
    assert.equal(facebookHref(null), null);
    assert.equal(facebookHref(""), null);
    assert.equal(facebookHref("   "), null);
  });

  it("keeps an https Facebook URL", () => {
    assert.equal(
      facebookHref("https://www.facebook.com/jonathan.delposo"),
      "https://www.facebook.com/jonathan.delposo",
    );
  });

  it("adds https to a facebook.com host without a scheme", () => {
    assert.equal(
      facebookHref("facebook.com/jonathan.delposo"),
      "https://facebook.com/jonathan.delposo",
    );
  });

  it("treats a vanity username as a Facebook profile path", () => {
    assert.equal(
      facebookHref("jonathan.delposo"),
      "https://www.facebook.com/jonathan.delposo",
    );
  });

  it("rejects javascript: URLs by treating them as a profile path", () => {
    assert.equal(
      facebookHref("javascript:alert(1)"),
      "https://www.facebook.com/javascript:alert(1)",
    );
  });
});
