import test from "node:test";
import assert from "node:assert/strict";

import { resolveHomePath } from "../home";

function perms(
  moduleSlugs: string[],
  isSuperAdmin = false,
): Parameters<typeof resolveHomePath>[0] {
  return {
    isSuperAdmin,
    modules: moduleSlugs.map((moduleSlug) => ({
      moduleSlug: moduleSlug as never,
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canExecuteTrigger: false,
    })),
  };
}

test("super admin lands on the dashboard hub", () => {
  assert.equal(resolveHomePath(perms(["intake"], true)), "/dashboard");
});

test("staff roles land on the dashboard hub regardless of module count", () => {
  assert.equal(resolveHomePath(perms(["leads"])), "/dashboard");
  assert.equal(resolveHomePath(perms(["collection"])), "/dashboard");
  assert.equal(resolveHomePath(perms(["intake", "computation"])), "/dashboard");
  assert.equal(resolveHomePath(perms(["accounting_ar", "reports"])), "/dashboard");
});

test("borrower-only permissions go straight to the borrower portal", () => {
  assert.equal(resolveHomePath(perms(["borrower_portal"])), "/borrower");
});

test("borrower with any staff module too still lands on the dashboard hub", () => {
  assert.equal(resolveHomePath(perms(["borrower_portal", "leads"])), "/dashboard");
});

test("non-viewable modules are ignored", () => {
  const p = perms(["borrower_portal", "reports"]);
  p!.modules[1].canView = false;
  assert.equal(resolveHomePath(p), "/borrower");
});

test("no permissions or no viewable modules falls back to dashboard", () => {
  assert.equal(resolveHomePath(undefined), "/dashboard");
  assert.equal(resolveHomePath(null), "/dashboard");
  assert.equal(resolveHomePath(perms([])), "/dashboard");
});
