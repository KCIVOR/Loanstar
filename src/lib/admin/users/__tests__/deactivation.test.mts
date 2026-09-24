import test from "node:test";
import assert from "node:assert/strict";

import {
  assertDeactivationAllowed,
  NO_BAN_DURATION,
  PERMANENT_BAN_DURATION,
  resolveBanDuration,
} from "@/lib/admin/users/deactivation";
import { ForbiddenError } from "@/lib/permissions/server";

// --- resolveBanDuration: which auth.admin.updateUserById ban_duration to
// send. Never admin.signOut() — it needs the target's own JWT. ---

test("resolveBanDuration: reactivation clears the ban", () => {
  assert.equal(resolveBanDuration(true), NO_BAN_DURATION);
  assert.equal(resolveBanDuration(true), "none");
});

test("resolveBanDuration: deactivation applies a long ban", () => {
  assert.equal(resolveBanDuration(false), PERMANENT_BAN_DURATION);
});

// --- assertDeactivationAllowed: last-active-super-admin + self-deactivation
// guard, mirroring the existing role-removal guard but for is_active:false,
// which previously had no equivalent protection at all. ---

test("reactivation is always allowed, regardless of super admin counts", () => {
  assert.doesNotThrow(() =>
    assertDeactivationAllowed({
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestedIsActive: true,
      targetHasSuperAdminRole: true,
      otherActiveSuperAdminCount: 0,
    }),
  );
});

test("deactivating a non-super-admin target is always allowed", () => {
  assert.doesNotThrow(() =>
    assertDeactivationAllowed({
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestedIsActive: false,
      targetHasSuperAdminRole: false,
      otherActiveSuperAdminCount: 0,
    }),
  );
});

test("deactivating a super admin target is allowed when other active super admins remain", () => {
  assert.doesNotThrow(() =>
    assertDeactivationAllowed({
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestedIsActive: false,
      targetHasSuperAdminRole: true,
      otherActiveSuperAdminCount: 1,
    }),
  );
});

test("deactivating the last active super admin (by another admin) is blocked", () => {
  assert.throws(
    () =>
      assertDeactivationAllowed({
        actorUserId: "admin-1",
        targetUserId: "target-1",
        requestedIsActive: false,
        targetHasSuperAdminRole: true,
        otherActiveSuperAdminCount: 0,
      }),
    ForbiddenError,
  );
});

test("a sole active super admin cannot deactivate themselves", () => {
  assert.throws(
    () =>
      assertDeactivationAllowed({
        actorUserId: "admin-1",
        targetUserId: "admin-1",
        requestedIsActive: false,
        targetHasSuperAdminRole: true,
        otherActiveSuperAdminCount: 0,
      }),
    (error: unknown) =>
      error instanceof ForbiddenError && /yourself/i.test(error.message),
  );
});

test("a super admin can deactivate themselves when other active super admins remain", () => {
  assert.doesNotThrow(() =>
    assertDeactivationAllowed({
      actorUserId: "admin-1",
      targetUserId: "admin-1",
      requestedIsActive: false,
      targetHasSuperAdminRole: true,
      otherActiveSuperAdminCount: 2,
    }),
  );
});
