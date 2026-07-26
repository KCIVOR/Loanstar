import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApplicationDeniedEmail,
  type DenialBorrower,
} from "../denial-email";

describe("buildApplicationDeniedEmail (Phase 4)", () => {
  it("builds payload with borrower_name only — no reason fields", () => {
    const borrower: DenialBorrower = {
      email: "borrower@example.com",
      first_name: "Ana",
      last_name: "Santos",
    };
    const payload = buildApplicationDeniedEmail(borrower);
    assert.ok(payload);
    assert.equal(payload.to, "borrower@example.com");
    assert.equal(payload.templateSlug, "application_denied");
    assert.deepEqual(payload.variables, { borrower_name: "Ana Santos" });
    assert.equal(Object.keys(payload.variables).length, 1);
  });

  it("returns null when borrower email is missing", () => {
    assert.equal(
      buildApplicationDeniedEmail({
        email: null,
        first_name: "Ana",
        last_name: "Santos",
      }),
      null,
    );
    assert.equal(buildApplicationDeniedEmail(null), null);
  });

  it("trims names and tolerates missing last name", () => {
    const payload = buildApplicationDeniedEmail({
      email: "x@y.com",
      first_name: "Ana",
      last_name: null,
    });
    assert.ok(payload);
    assert.equal(payload.variables.borrower_name, "Ana");
  });
});
