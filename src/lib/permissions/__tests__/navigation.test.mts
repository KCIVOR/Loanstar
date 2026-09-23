import assert from "node:assert/strict";
import test from "node:test";

import {
  getRequiredPageModules,
  resolveAuthenticatedRedirectPath,
} from "../navigation";

test("maps the AR portal to the accounting view permission", () => {
  assert.deepEqual(getRequiredPageModules("/ar"), ["accounting_ar"]);
  assert.deepEqual(getRequiredPageModules("/ar/masterlist/abc"), ["accounting_ar"]);
});

test("requires intake permission for every CSA page", () => {
  assert.deepEqual(getRequiredPageModules("/csa/applications/abc"), ["intake"]);
  assert.deepEqual(getRequiredPageModules("/csa/leads"), ["intake"]);
});

test("uses the briefings permission for the collector briefings route", () => {
  assert.deepEqual(getRequiredPageModules("/collector/briefings"), ["briefings"]);
});

test("keeps each admin page family behind its own module", () => {
  assert.deepEqual(getRequiredPageModules("/admin/users"), ["auth_admin"]);
  assert.deepEqual(getRequiredPageModules("/admin/roles/abc"), ["auth_admin"]);
  assert.deepEqual(getRequiredPageModules("/admin/config"), ["system_config"]);
  assert.deepEqual(getRequiredPageModules("/admin/audit"), ["audit_log"]);
});

test("does not gate public, account, dashboard, API, or unknown paths", () => {
  for (const pathname of [
    "/login",
    "/account",
    "/dashboard",
    "/api/ar/masterlist",
    "/design",
    "/unknown",
  ]) {
    assert.equal(getRequiredPageModules(pathname), null);
  }
});

test("sends a borrower to their portal when no post-login destination was requested", () => {
  assert.equal(resolveAuthenticatedRedirectPath(null, true), "/borrower");
  assert.equal(resolveAuthenticatedRedirectPath(null, false), "/dashboard");
});
