import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => {
  const url = new URL(rel, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const lib = read("../connect-borrower.ts");
const route = read(
  "../../../app/api/csa/applications/[id]/change-owner/route.ts",
);
const migration = read(
  "../../../../supabase/migrations/20260930223826_reassign_application_owner.sql",
);
const download = read(
  "../../../app/api/borrower/documents/[id]/download/route.ts",
);

const EXPECTED_STATUSES = [
  "draft",
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
  "for_verification",
];

test("stage list exports exactly the approved statuses", async () => {
  const mod = await import("../change-owner-stages.ts");
  assert.deepEqual([...mod.CHANGE_OWNER_ALLOWED_STATUSES], EXPECTED_STATUSES);
  assert.equal(mod.canChangeOwner("submitted"), true);
  assert.equal(mod.canChangeOwner("approved"), false);
});

test("lib calls the atomic reassign RPC, no sequential writes", () => {
  assert.match(lib, /rpc\(\s*"reassign_application_borrower_account"/);
  assert.doesNotMatch(lib, /from\("masterlist"\)/);
  assert.doesNotMatch(lib, /from\("documents"\)/);
  assert.doesNotMatch(lib, /from\("payments"\)/);
});

test("route: permission, both notices, no user ids returned", () => {
  assert.match(route, /requireModulePermission\("intake", "edit"\)/);
  assert.equal((route.match(/notifyUser\(/g) ?? []).length, 2);
  assert.match(route, /application_owner_changed_in/);
  assert.match(route, /application_owner_changed_out/);
  assert.match(route, /formatZodError/);
  assert.doesNotMatch(route, /jsonOk\(result\)/);
});

test("migration: definer RPC, service-role grant, guard, same stage list", () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.reassign_application_borrower_account\(uuid, ?uuid, ?uuid, ?text\) TO service_role/,
  );
  assert.match(migration, /guard_application_borrower_column/);
  for (const s of EXPECTED_STATUSES) {
    assert.match(migration, new RegExp(`'${s}'`));
  }
});

test("borrower download signs with service client after ownership check", () => {
  assert.match(download, /getOwnDocument\(user\.id, id\)/);
  assert.match(download, /createSignedDownloadUrl\(\s*createServiceClient\(\)/);
});
