import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UserPermissions } from "@/lib/permissions/types";

import { resolveDashboardScope } from "../scope";

function permissions(overrides: Partial<UserPermissions>): UserPermissions {
  return {
    userId: "user-1",
    isSuperAdmin: false,
    modules: [],
    fieldRules: {},
    roleSlugs: [],
    ...overrides,
  };
}

describe("resolveDashboardScope", () => {
  it("resolves a super admin to the aggregate scope", () => {
    const scope = resolveDashboardScope(
      permissions({ isSuperAdmin: true, roleSlugs: ["agent"] }),
    );
    assert.deepEqual(scope, { kind: "aggregate" });
  });

  it("resolves an active agent role to an agent scope for that user", () => {
    const scope = resolveDashboardScope(
      permissions({ userId: "agent-1", roleSlugs: ["agent"] }),
    );
    assert.deepEqual(scope, { kind: "agent", userId: "agent-1" });
  });

  it("resolves a staff role with no agent role slug to the aggregate scope", () => {
    const scope = resolveDashboardScope(permissions({ roleSlugs: ["csa"] }));
    assert.deepEqual(scope, { kind: "aggregate" });
  });

  it("resolves a user with no roles at all to the aggregate scope", () => {
    const scope = resolveDashboardScope(permissions({ roleSlugs: [] }));
    assert.deepEqual(scope, { kind: "aggregate" });
  });

  it("resolves agent plus another role to agent scope, never silently widening", () => {
    const scope = resolveDashboardScope(
      permissions({ userId: "agent-2", roleSlugs: ["agent", "csa"] }),
    );
    assert.deepEqual(scope, { kind: "agent", userId: "agent-2" });
  });

  it("never widens a super admin who also holds the agent role", () => {
    const scope = resolveDashboardScope(
      permissions({ userId: "agent-3", isSuperAdmin: true, roleSlugs: ["agent"] }),
    );
    assert.deepEqual(scope, { kind: "aggregate" });
  });
});
