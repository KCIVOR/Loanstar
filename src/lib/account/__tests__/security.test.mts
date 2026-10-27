import assert from "node:assert/strict";
import { test } from "node:test";
import { changeSecurity, securitySchema, type SecurityDependencies } from "../security";

function fixture(overrides: Partial<SecurityDependencies> = {}) {
  const calls: string[] = [];
  const deps: SecurityDependencies = {
    requestEmailChange: async () => { calls.push("approval"); },
    verifyPassword: async () => { calls.push("verify"); return true; },
    recordAttempt: async () => { calls.push("audit"); return true; },
    update: async (attributes) => { calls.push("update"); return { email: attributes.email ?? "old@example.com" }; },
    ...overrides,
  };
  return { deps, calls };
}
const actor = { id: "user-1", email: "old@example.com" };
const password = { kind: "password" as const, currentPassword: "old-password", password: "new-password", confirmPassword: "new-password" };

test("validates confirmation, minimum length, and new email", () => {
  assert.equal(securitySchema.safeParse({ ...password, confirmPassword: "different" }).success, false);
  assert.equal(securitySchema.safeParse({ ...password, password: "short", confirmPassword: "short" }).success, false);
  assert.equal(securitySchema.safeParse({ kind: "email", currentPassword: "x", email: "invalid" }).success, false);
});
test("wrong current password cannot update credentials", async () => {
  const { deps, calls } = fixture({ verifyPassword: async () => false });
  await assert.rejects(changeSecurity(actor, password, deps), /Current password is incorrect/);
  assert.deepEqual(calls, []);
});
test("audit failure prevents credential mutation", async () => {
  const { deps, calls } = fixture({ recordAttempt: async () => false });
  await assert.rejects(changeSecurity(actor, password, deps), /record/);
  assert.deepEqual(calls, ["verify"]);
});
test("password mutation is audited before execution and contains no credentials", async () => {
  const { deps, calls } = fixture({ recordAttempt: async (kind, details) => {
    assert.equal(kind, "password");
    assert.deepEqual(details, {});
    calls.push("audit");
    return true;
  } });
  assert.equal((await changeSecurity(actor, password, deps)).status, "password_changed");
  assert.deepEqual(calls, ["verify", "audit", "update"]);
});
test("email change requests current inbox approval without updating Auth", async () => {
  const { deps, calls } = fixture();
  const result = await changeSecurity(actor, { kind: "email", currentPassword: "old", email: "new@example.com" }, deps);
  assert.equal(result.status, "email_verification_pending");
  assert.deepEqual(calls, ["verify", "audit", "approval"]);
});
test("rejects unchanged email without calling the provider", async () => {
  const { deps, calls } = fixture();
  await assert.rejects(changeSecurity(actor, { kind: "email", currentPassword: "old", email: "OLD@example.com" }, deps), /different/);
  assert.deepEqual(calls, []);
});
test("provider failures are not reported as success", async () => {
  const { deps } = fixture({ update: async () => { throw new Error("Password policy rejected"); } });
  await assert.rejects(changeSecurity(actor, password, deps), /Password policy rejected/);
});
test("password updates include the current password required by stricter Auth policies", async () => {
  const { deps } = fixture({ update: async (attributes) => {
    assert.deepEqual(attributes, { password: password.password, current_password: password.currentPassword });
    return {};
  } });
  await changeSecurity(actor, password, deps);
});
test("anonymous identities cannot bypass verified email changes", async () => {
  const { deps, calls } = fixture();
  await assert.rejects(changeSecurity({ ...actor, is_anonymous: true }, { kind: "email", currentPassword: "old", email: "new@example.com" }, deps), /Anonymous/);
  assert.deepEqual(calls, []);
});
