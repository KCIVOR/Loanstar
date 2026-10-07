import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertApplicationCanConnectBorrowerAccount } from "../connect-borrower";

function clientFor(isLegacyImport: boolean | null, error: Error | null = null) {
  const calls: Array<[string, string]> = [];
  const query = {
    select(column: string) {
      calls.push(["select", column]);
      return this;
    },
    eq(column: string, value: string) {
      calls.push([column, value]);
      return this;
    },
    async maybeSingle() {
      return {
        data: isLegacyImport === null ? null : { is_legacy_import: isLegacyImport },
        error,
      };
    },
  };
  return {
    calls,
    client: { from(table: string) {
      calls.push(["from", table]);
      return query;
    } },
  };
}

test("imported loan applications cannot be connected to borrower accounts", async () => {
  const { client, calls } = clientFor(true);
  await assert.rejects(
    assertApplicationCanConnectBorrowerAccount(client as never, "application-1"),
    /Imported loans are AR-only/,
  );
  assert.deepEqual(calls, [
    ["from", "masterlist"],
    ["select", "is_legacy_import"],
    ["loan_application_id", "application-1"],
  ]);
});

test("ordinary applications remain eligible for borrower connection", async () => {
  const { client } = clientFor(false);
  await assert.doesNotReject(
    assertApplicationCanConnectBorrowerAccount(client as never, "application-2"),
  );
});

test("applications without a masterlist record remain eligible", async () => {
  const { client } = clientFor(null);
  await assert.doesNotReject(
    assertApplicationCanConnectBorrowerAccount(client as never, "application-3"),
  );
});

test("marker lookup errors fail closed", async () => {
  const { client } = clientFor(null, new Error("lookup failed"));
  await assert.rejects(
    assertApplicationCanConnectBorrowerAccount(client as never, "application-4"),
    /lookup failed/,
  );
});

test("CSA detail exposes the imported marker and hides borrower connection", () => {
  const route = readFileSync(new URL("../../../app/api/csa/applications/[id]/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../../app/csa/applications/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(route, /isLegacyImport:\s*importedAccount\?\.is_legacy_import === true/);
  assert.match(page, /!data\.application\.isLegacyImport && !data\.borrower\?\.userId/);
  assert.match(page, /Imported loans are AR-only/);
});

test("both borrower reassignment paths check the imported marker before writing", () => {
  const service = readFileSync(new URL("../connect-borrower.ts", import.meta.url), "utf8");
  const guardedRpcs = service.match(/await assertApplicationCanConnectBorrowerAccount\(admin, applicationId\);\s*const \{ data, error \} = await admin\.rpc\(/g) ?? [];
  assert.equal(guardedRpcs.length, 2);
});
