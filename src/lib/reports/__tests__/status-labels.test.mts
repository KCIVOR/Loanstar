import test from "node:test";
import assert from "node:assert/strict";

import { APPLICATION_STATUSES } from "@/lib/constants";
import { formatStatusLabel } from "@/lib/applications/status";

test("every application status has a human-readable label", () => {
  for (const status of APPLICATION_STATUSES) {
    const label = formatStatusLabel(status);
    assert.ok(label.length > 0, `missing label for ${status}`);
    assert.notEqual(label, status, `label should differ from slug for ${status}`);
  }
});

test("critical workflow statuses use End-to-End labels", () => {
  assert.equal(formatStatusLabel("for_verification"), "For Verification");
  assert.equal(formatStatusLabel("for_approval"), "For Approval");
  assert.equal(formatStatusLabel("loan_active"), "Loan Active");
  assert.equal(formatStatusLabel("documents_pending"), "Documents Pending");
});
