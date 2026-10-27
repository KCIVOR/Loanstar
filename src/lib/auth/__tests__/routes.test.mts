import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRedirectAuthenticatedUser } from "../routes";
test("authenticated recovery and confirmation remain accessible", () => {
  assert.equal(shouldRedirectAuthenticatedUser("/reset-password"), false);
  assert.equal(shouldRedirectAuthenticatedUser("/auth/confirm"), false);
  assert.equal(shouldRedirectAuthenticatedUser("/settings"), false);
  assert.equal(shouldRedirectAuthenticatedUser("/login"), true);
  assert.equal(shouldRedirectAuthenticatedUser("/forgot-password"), true);
});
