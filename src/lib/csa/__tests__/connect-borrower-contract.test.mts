import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lib = readFileSync(
  new URL("../connect-borrower.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL(
    "../../../app/api/csa/applications/[id]/connect-borrower/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("connect-borrower calls the atomic RPC", () => {
  assert.match(lib, /rpc\(\s*"connect_application_to_borrower_account"/);
});

test("connect-borrower no longer does sequential re-link writes", () => {
  assert.doesNotMatch(lib, /from\("masterlist"\)/);
  assert.doesNotMatch(lib, /from\("documents"\)/);
  assert.doesNotMatch(lib, /from\("payments"\)/);
  assert.doesNotMatch(lib, /appendStatusHistory/);
});

test("route notifies the target borrower after linking", () => {
  assert.match(route, /notifyUser/);
  assert.match(route, /userId:\s*result\.borrowerUserId/);
  assert.match(route, /application_account_connected/);
});

test("route does not return the borrower user id", () => {
  assert.doesNotMatch(route, /jsonOk\(result\)/);
});
