import assert from "node:assert/strict";
import { test } from "node:test";
import { areaLabel, describeAuditEvent } from "../labels";

test("security events distinguish requested changes from completed changes", () => {
  const row = { module_slug: "account_settings", entity_type: "user", entity_id: "user", before_data: { email: "old@example.com" }, after_data: { email: "new@example.com" } };
  assert.equal(areaLabel(row.module_slug), "Account settings");
  assert.equal(describeAuditEvent({ ...row, action: "password_changed" }).summary, "Account password changed");
  assert.equal(describeAuditEvent({ ...row, action: "email_change_requested" }).outcome, "created");
  const confirmed = describeAuditEvent({ ...row, action: "email_changed" });
  assert.match(confirmed.summary, /after confirmation/);
  assert.ok(confirmed.details.some((detail) => detail.before === "old@example.com" && detail.after === "new@example.com"));
});
