import test from "node:test";
import assert from "node:assert/strict";

import { shouldReloadPermissions } from "../auth-events";

test("INITIAL_SESSION with a user should load permissions", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "INITIAL_SESSION",
      nextUserId: "user-a",
      currentUserId: null,
    }),
    true,
  );
});

test("SIGNED_IN for the same user should not reload (tab focus recovery)", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "SIGNED_IN",
      nextUserId: "user-a",
      currentUserId: "user-a",
    }),
    false,
  );
});

test("TOKEN_REFRESHED for the same user should not reload", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "TOKEN_REFRESHED",
      nextUserId: "user-a",
      currentUserId: "user-a",
    }),
    false,
  );
});

test("SIGNED_IN for a different user should reload", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "SIGNED_IN",
      nextUserId: "user-b",
      currentUserId: "user-a",
    }),
    true,
  );
});

test("SIGNED_IN when previously logged out should reload", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "SIGNED_IN",
      nextUserId: "user-a",
      currentUserId: null,
    }),
    true,
  );
});

test("SIGNED_OUT should reload (clear permissions)", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "SIGNED_OUT",
      nextUserId: null,
      currentUserId: "user-a",
    }),
    true,
  );
});

test("USER_UPDATED should reload", () => {
  assert.equal(
    shouldReloadPermissions({
      event: "USER_UPDATED",
      nextUserId: "user-a",
      currentUserId: "user-a",
    }),
    true,
  );
});
