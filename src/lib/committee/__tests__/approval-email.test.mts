import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApplicationApprovedEmail,
  type ApprovalBorrower,
} from "../approval-email";

describe("buildApplicationApprovedEmail (Phase 5)", () => {
  it("builds payload with borrower_name only", () => {
    const borrower: ApprovalBorrower = {
      email: "borrower@example.com",
      first_name: "Ana",
      last_name: "Santos",
    };
    const payload = buildApplicationApprovedEmail(borrower);
    assert.ok(payload);
    assert.equal(payload.to, "borrower@example.com");
    assert.equal(payload.templateSlug, "application_approved");
    assert.deepEqual(payload.variables, { borrower_name: "Ana Santos" });
    assert.equal(Object.keys(payload.variables).length, 1);
  });

  it("returns null when borrower email is missing", () => {
    assert.equal(
      buildApplicationApprovedEmail({
        email: null,
        first_name: "Ana",
        last_name: "Santos",
      }),
      null,
    );
    assert.equal(buildApplicationApprovedEmail(null), null);
  });

  it("trims names and tolerates missing last name", () => {
    const payload = buildApplicationApprovedEmail({
      email: "x@y.com",
      first_name: "Ana",
      last_name: null,
    });
    assert.ok(payload);
    assert.equal(payload.variables.borrower_name, "Ana");
  });
});
