import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFIDENTIALITY_DENY,
  EXPECTED_DEFAULT_RBAC,
} from "../rbac-matrix";

test("default RBAC seed defines all 9 operational roles", () => {
  const roles = new Set(EXPECTED_DEFAULT_RBAC.map((r) => r.role));
  assert.equal(roles.size, 9);
  for (const slug of [
    "borrower",
    "agent",
    "csa",
    "cig",
    "committee",
    "lra",
    "ar",
    "collector",
    "remedial",
  ]) {
    assert.ok(roles.has(slug), `missing role ${slug}`);
  }
});

test("collectors have collection module but not auth_admin", () => {
  const collectorPerms = EXPECTED_DEFAULT_RBAC.filter((r) => r.role === "collector");
  assert.ok(collectorPerms.some((p) => p.module === "collection" && p.view));
  assert.ok(!EXPECTED_DEFAULT_RBAC.some((p) => p.role === "collector" && p.module === "auth_admin"));
});

test("committee and ar can view reports, view-only", () => {
  for (const role of ["ar", "committee"] as const) {
    const row = EXPECTED_DEFAULT_RBAC.find((p) => p.role === role && p.module === "reports");
    assert.ok(row, `${role} missing reports`);
    assert.equal(row!.view, true);
    assert.equal(row!.create, false);
    assert.equal(row!.edit, false);
    assert.equal(row!.delete, false);
    assert.equal(row!.executeTrigger, false);
  }
});

test("confidentiality deny list covers cross-boundary rules", () => {
  assert.ok(CONFIDENTIALITY_DENY.length >= 4);
  const keys = CONFIDENTIALITY_DENY.map((d) => `${d.role}:${d.module}`);
  assert.ok(keys.includes("borrower:committee"));
  assert.ok(keys.includes("csa:release_lra"));
});
